from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError, TimeoutError as PoolTimeout
from sqlalchemy.orm import Session

from app.api import dashboard, floorplans, health, materials, me, profile, projects, reports
from app.core.config import get_settings
from app.core.db import get_engine
from app.services.pricing.seed import seed_sample_catalogue

log = logging.getLogger("buildora")


def _sqlstate(exc: DBAPIError) -> str:
    return str(getattr(exc.orig, "sqlstate", "") or "")


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(PoolTimeout)
    async def pool_timeout(_: Request, exc: PoolTimeout):
        log.warning("database pool exhausted")
        return JSONResponse({"detail": "The server is busy. Please try again in a moment."}, status_code=503, headers={"Retry-After": "5"})

    @app.exception_handler(DBAPIError)
    async def database_error(_: Request, exc: DBAPIError):
        state = _sqlstate(exc)
        if state == "42501":  # insufficient_privilege: Row Level Security refused the write
            return JSONResponse({"detail": "You are not allowed to do that."}, status_code=403)
        if state.startswith("23"):  # integrity / check constraint violation
            return JSONResponse({"detail": "The data conflicts with a stored rule. Check the values and try again."}, status_code=409)
        if state[:2] in ("08", "53", "57") or exc.connection_invalidated or type(exc).__name__ == "OperationalError":
            log.warning("database unavailable: %s", state or type(exc).__name__)
            return JSONResponse({"detail": "The database is unavailable. Please try again shortly."}, status_code=503, headers={"Retry-After": "5"})
        log.exception("unexpected database error")
        return JSONResponse({"detail": "Something went wrong on the server."}, status_code=500)


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Make sure the shared sample catalogue exists. Runs as the database's own role (no user), once, and never stops the API from starting."""
    settings = get_settings()
    if settings.db_configured and settings.seed_sample_data:
        try:
            with Session(get_engine()) as db:
                seed_sample_catalogue(db)
        except Exception:  # noqa: BLE001 - e.g. the tables have not been created yet; the API must still start
            log.exception("could not check the sample catalogue (are the database migrations applied?)")
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        lifespan=lifespan,
        title="Buildora API",
        version="0.2.0",
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/openapi.json",
    )
    install_error_handlers(app)

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        return response

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,  # the API uses a bearer token, never cookies
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )

    for router in (health.router, me.router, profile.router, projects.router, floorplans.router, materials.router, reports.router, dashboard.router):
        app.include_router(router, prefix="/api")
    return app


app = create_app()
