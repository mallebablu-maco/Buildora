"""Test helpers: a throw-away signing key, a JWKS built from it, and a token factory.

No network and no real Supabase project is involved: the API is pointed at a pinned key set (SUPABASE_JWKS_JSON).
"""
from __future__ import annotations

import json
import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

SUPABASE_URL = "https://test-ref.supabase.co"
KID = "test-key-1"


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


@pytest.fixture(scope="session")
def signing_key():
    return new_key()


@pytest.fixture
def app_env(monkeypatch, signing_key):
    """Point the settings at the test key set and clear every cache that holds settings or keys."""
    from app.core import auth
    from app.core.config import get_settings

    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_JWKS_JSON", jwks_for(signing_key))
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5173")

    def clear():
        get_settings.cache_clear()
        auth._pinned_keys.cache_clear()
        auth._jwks_client.cache_clear()

    clear()
    yield monkeypatch
    clear()


@pytest.fixture
def client(app_env):
    from app.main import create_app

    return TestClient(create_app())
