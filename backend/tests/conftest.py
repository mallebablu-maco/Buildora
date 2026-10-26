"""Test helpers: a throw-away signing key and token factory, plus a throw-away local PostgreSQL that has the REAL migration applied.

No network and no real Supabase project is involved. The API is pointed at a pinned key set (SUPABASE_JWKS_JSON), and DATABASE_URL is
forced to either empty or the local test database, so a real DATABASE_URL in backend/.env can never be reached by a test.
"""
from __future__ import annotations

import json
import pathlib
import time
import uuid
from contextlib import contextmanager

import jwt
import psycopg
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

SUPABASE_URL = "https://test-ref.supabase.co"
KID = "test-key-1"
ROOT = pathlib.Path(__file__).resolve().parents[2]
MIGRATIONS = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
STUBS = pathlib.Path(__file__).with_name("stubs.sql")


def new_key() -> ec.EllipticCurvePrivateKey:
    return ec.generate_private_key(ec.SECP256R1())


def jwks_for(private_key, kid: str = KID) -> str:
    jwk = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(private_key.public_key()))
    jwk.update(kid=kid, alg="ES256", use="sig")
    return json.dumps({"keys": [jwk]})


def make_token(private_key, *, kid: str | None = KID, alg: str = "ES256", **overrides) -> str:
    now = int(time.time())
    payload = {
        "sub": "user-123",
        "email": "asha@example.com",
        "role": "authenticated",
        "aud": "authenticated",
        "iss": f"{SUPABASE_URL}/auth/v1",
        "iat": now,
        "exp": now + 3600,
        "user_metadata": {"full_name": "Asha Rao", "persona": "engineer"},
    }
    payload.update(overrides)
    payload = {k: v for k, v in payload.items() if v is not None}  # an override of None removes the claim
    headers = {"kid": kid} if kid else {}
    return jwt.encode(payload, private_key, algorithm=alg, headers=headers)


def _clear_caches():
    from app.core import auth, db
    from app.core.config import get_settings

    get_settings.cache_clear()
    auth._pinned_keys.cache_clear()
    auth._jwks_client.cache_clear()
    db.dispose_engines()


@pytest.fixture(scope="session")
def signing_key():
    return new_key()


@pytest.fixture
def app_env(monkeypatch, signing_key):
    """Point the settings at the test key set, with NO database configured."""
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_JWKS_JSON", jwks_for(signing_key))
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5173")
    monkeypatch.setenv("DATABASE_URL", "")  # an empty value overrides backend/.env: tests must never reach a real database
    _clear_caches()
    yield monkeypatch
    _clear_caches()


@pytest.fixture
def client(app_env):
    from app.main import create_app

    return TestClient(create_app())


# ---------------------------------------------------------------------------------------------------- local test database
@pytest.fixture(scope="session")
def pg_uri(tmp_path_factory):
    """A real PostgreSQL server in a temp folder, with Supabase's auth/storage stand-ins and the project's migrations applied."""
    import pgserver

    server = pgserver.get_server(tmp_path_factory.mktemp("pg"), cleanup_mode="stop")
    uri = server.get_uri()
    with psycopg.connect(uri, autocommit=True) as c:
        c.execute(STUBS.read_text())
        for migration in MIGRATIONS:
            c.execute(migration.read_text())
    yield uri
    from app.core import db

    db.dispose_engines()
    server.cleanup()


@pytest.fixture
def db_env(app_env, pg_uri):
    """app_env + DATABASE_URL pointing at the (emptied) test database."""
    with psycopg.connect(pg_uri, autocommit=True) as c:
        c.execute("truncate public.project_rooms, public.projects, public.profiles, auth.users cascade; delete from storage.objects")
    app_env.setenv("DATABASE_URL", pg_uri)
    _clear_caches()
    return pg_uri


@pytest.fixture
def db_client(db_env):
    from app.main import create_app

    return TestClient(create_app())


@contextmanager
def superuser(pg_uri):
    """Raw access that bypasses Row Level Security: for arranging and inspecting test data only."""
    with psycopg.connect(pg_uri, autocommit=True) as c:
        yield c


@contextmanager
def as_user(pg_uri, user_id, role="authenticated"):
    """A transaction that behaves exactly like one of the API's: role switched, JWT claims set, rolled back at the end."""
    with psycopg.connect(pg_uri, autocommit=False) as c:
        c.execute(f"set local role {role}")
        if user_id:
            c.execute(
                "select set_config('request.jwt.claim.sub', %s, true), set_config('request.jwt.claims', %s, true)",
                (str(user_id), json.dumps({"sub": str(user_id), "role": role})),
            )
        try:
            yield c
        finally:
            c.rollback()


class User:
    def __init__(self, pg_uri, signing_key, email, name):
        self.id = str(uuid.uuid4())
        self.email, self.name = email, name
        with superuser(pg_uri) as c:
            c.execute("insert into auth.users (id, email) values (%s, %s)", (self.id, email))
        token = make_token(signing_key, sub=self.id, email=email, user_metadata={"full_name": name})
        self.headers = {"Authorization": f"Bearer {token}"}


@pytest.fixture
def make_user(pg_uri, signing_key):
    def _make(email="alice@example.com", name="Alice Rao"):
        return User(pg_uri, signing_key, email, name)

    return _make


@pytest.fixture
def alice(db_env, make_user):
    return make_user("alice@example.com", "Alice Rao")


@pytest.fixture
def bob(db_env, make_user):
    return make_user("bob@example.com", "Bob Nair")


# ---------------------------------------------------------------------------------------------------- sample data
PROJECT = {
    "name": "Sample G+1 Residence", "description": "Two-storey family home", "owner_name": "Alice", "building_type": "residential",
    "location": "Pune", "floors": 2, "currency": "INR", "budget": 1500000, "length": 12, "width": 9, "height": 3,
    "wall_thickness": 0.23, "slab_thickness": 0.15,
}
ROOMS = [
    {"name": "Living", "room_type": "living", "length": 5, "width": 5, "floor_number": 1, "doors": 1, "windows": 2, "pos_x": 0, "pos_y": 0},
    {"name": "Kitchen", "room_type": "kitchen", "length": 3.5, "width": 3.5, "floor_number": 1, "doors": 1, "windows": 1},
    {"name": "Bedroom 1", "room_type": "bedroom", "length": 5, "width": 4, "floor_number": 2, "doors": 1, "windows": 2},
]
