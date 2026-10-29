"""Database access. Every request runs its queries AS THE SIGNED-IN USER, so Postgres Row Level Security applies to the API's
own queries too. The Python ownership checks are a second guard, not the only one."""
from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from functools import lru_cache

from fastapi import Depends, HTTPException, status
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session

from app.core.auth import Identity, current_identity
from app.core.config import get_settings

log = logging.getLogger("buildora.db")


class DatabaseNotConfigured(Exception):
    pass


@lru_cache
def _engine(url: str, pool_size: int, max_overflow: int, pool_timeout: int, statement_timeout_ms: int) -> Engine:
    engine = create_engine(
        url, pool_pre_ping=True, pool_recycle=300, pool_size=pool_size, max_overflow=max_overflow, pool_timeout=pool_timeout,
    )

    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_conn, _):  # a runaway query must not hold a pooled connection forever
        dbapi_conn.autocommit = True
        cur = dbapi_conn.cursor()
        cur.execute(f"SET statement_timeout = {int(statement_timeout_ms)}")
        cur.close()
        dbapi_conn.autocommit = False

    return engine


def get_engine() -> Engine:
    s = get_settings()
    if not s.db_configured:
        raise DatabaseNotConfigured
    return _engine(s.database_url, s.db_pool_size, s.db_max_overflow, s.db_pool_timeout, s.db_statement_timeout_ms)


def dispose_engines() -> None:
    """Close every pooled connection (used by tests and on shutdown)."""
    _engine.cache_clear()


@event.listens_for(Session, "after_begin")
def _run_as_signed_in_user(session: Session, transaction, connection) -> None:
    """At the start of EVERY transaction of an authenticated request: switch to the `authenticated` role and set that
    user's JWT claims. SET LOCAL lasts only until the transaction ends, so a pooled connection never leaks the identity."""
    claims = session.info.get("rls_claims")
    if claims and connection.dialect.name == "postgresql":
        connection.exec_driver_sql("SET LOCAL ROLE authenticated")
        connection.exec_driver_sql(
            "SELECT set_config('request.jwt.claims', %s, true), set_config('request.jwt.claim.sub', %s, true), "
            "set_config('request.jwt.claim.role', 'authenticated', true)",
            (json.dumps(claims), str(claims["sub"])),
        )


def rls_claims(identity: Identity) -> dict:
    claims = {"sub": identity.id, "role": "authenticated", "email": identity.email}
    if identity.is_admin:  # the database's own is_admin() reads this; it came from the verified token's app_metadata
        claims["app_metadata"] = {"role": "admin"}
    return claims


def get_db(identity: Identity = Depends(current_identity)) -> Iterator[Session]:
    """A database session bound to the caller. 401 comes first (no token), then 503 if the database is not configured."""
    try:
        engine = get_engine()
    except DatabaseNotConfigured:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "The database is not configured.") from None
    with Session(engine, autoflush=False) as db:
        db.info["rls_claims"] = rls_claims(identity)
        yield db
