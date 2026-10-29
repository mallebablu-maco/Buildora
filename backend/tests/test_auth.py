"""Token verification: only a genuine, current Supabase access token for a signed-in user may pass."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

import jwt
from cryptography.hazmat.primitives import serialization

from tests.conftest import KID, SUPABASE_URL, jwks_for, make_token, new_key


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_valid_token_returns_the_caller(client, signing_key):
    r = client.get("/api/me", headers=bearer(make_token(signing_key)))
    assert r.status_code == 200
    assert r.json() == {"id": "user-123", "email": "asha@example.com", "full_name": "Asha Rao", "persona": "engineer", "is_admin": False}


def test_admin_comes_only_from_app_metadata_which_users_cannot_edit(client, signing_key):
    assert client.get("/api/me", headers=bearer(make_token(signing_key, app_metadata={"role": "admin"}))).json()["is_admin"] is True
    # user_metadata is editable by the user (supabase.auth.updateUser): claiming "admin" there must change nothing
    for meta in ({"role": "admin"}, {"is_admin": True, "persona": "admin", "full_name": "x"}):
        assert client.get("/api/me", headers=bearer(make_token(signing_key, user_metadata=meta))).json()["is_admin"] is False
    assert client.get("/api/me", headers=bearer(make_token(signing_key, app_metadata={"role": "editor"}))).json()["is_admin"] is False


def test_response_never_contains_the_token(client, signing_key):
    token = make_token(signing_key)
    assert token not in client.get("/api/me", headers=bearer(token)).text


def test_missing_header_is_401(client):
    r = client.get("/api/me")
    assert r.status_code == 401
    assert r.headers["www-authenticate"] == "Bearer"


def test_garbage_token_is_401(client):
    assert client.get("/api/me", headers=bearer("not-a-jwt")).status_code == 401


def test_expired_token_is_401(client, signing_key):
    token = make_token(signing_key, exp=int(time.time()) - 10)
    assert client.get("/api/me", headers=bearer(token)).status_code == 401


def test_wrong_audience_is_401(client, signing_key):
    assert client.get("/api/me", headers=bearer(make_token(signing_key, aud="something-else"))).status_code == 401


def test_wrong_issuer_is_401(client, signing_key):
    token = make_token(signing_key, iss="https://other-project.supabase.co/auth/v1")
    assert client.get("/api/me", headers=bearer(token)).status_code == 401


def test_token_signed_by_another_key_is_401(client):
    forged = make_token(new_key())  # same key id, different private key
    assert client.get("/api/me", headers=bearer(forged)).status_code == 401


def test_unknown_key_id_is_401(client, signing_key):
    assert client.get("/api/me", headers=bearer(make_token(signing_key, kid="other-kid"))).status_code == 401


def test_token_without_key_id_is_401(client, signing_key):
    assert client.get("/api/me", headers=bearer(make_token(signing_key, kid=None))).status_code == 401


def test_alg_none_is_401(client):
    now = int(time.time())
    payload = {"sub": "x", "role": "authenticated", "aud": "authenticated", "iss": f"{SUPABASE_URL}/auth/v1", "exp": now + 600}
    token = jwt.encode(payload, key=None, algorithm="none", headers={"kid": KID})
    assert client.get("/api/me", headers=bearer(token)).status_code == 401


def test_hs256_signed_with_the_public_key_is_401(client, signing_key):
    """Alg-confusion attack: sign with HMAC using the public key bytes as the secret."""
    public_pem = signing_key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
    b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()  # noqa: E731
    now = int(time.time())
    header = b64(json.dumps({"alg": "HS256", "typ": "JWT", "kid": KID}).encode())
    body = b64(json.dumps({"sub": "x", "role": "authenticated", "aud": "authenticated", "iss": f"{SUPABASE_URL}/auth/v1", "exp": now + 600}).encode())
    sig = b64(hmac.new(public_pem, f"{header}.{body}".encode(), hashlib.sha256).digest())
    assert client.get("/api/me", headers=bearer(f"{header}.{body}.{sig}")).status_code == 401


def test_anon_role_token_is_401(client, signing_key):
    """The public anon key is itself a valid JWT. It must not count as a signed-in user."""
    assert client.get("/api/me", headers=bearer(make_token(signing_key, role="anon"))).status_code == 401


def test_token_without_subject_is_401(client, signing_key):
    assert client.get("/api/me", headers=bearer(make_token(signing_key, sub=None))).status_code == 401


def test_tampered_payload_is_401(client, signing_key):
    head, body, sig = make_token(signing_key).split(".")
    padded = body + "=" * (-len(body) % 4)
    claims = json.loads(base64.urlsafe_b64decode(padded))
    claims["sub"] = "someone-else"
    forged_body = base64.urlsafe_b64encode(json.dumps(claims).encode()).rstrip(b"=").decode()
    assert client.get("/api/me", headers=bearer(f"{head}.{forged_body}.{sig}")).status_code == 401


def test_missing_metadata_still_works(client, signing_key):
    r = client.get("/api/me", headers=bearer(make_token(signing_key, user_metadata=None)))
    assert r.status_code == 200
    assert r.json()["full_name"] == "" and r.json()["persona"] == ""


def test_two_key_set_picks_the_right_key(app_env, signing_key):
    """Key rotation: the key set may hold several keys; the token's key id selects one."""
    from fastapi.testclient import TestClient

    from app.core import auth
    from app.core.config import get_settings
    from app.main import create_app

    other = new_key()
    keys = json.loads(jwks_for(signing_key))["keys"] + json.loads(jwks_for(other, kid="second"))["keys"]
    app_env.setenv("SUPABASE_JWKS_JSON", json.dumps({"keys": keys}))
    get_settings.cache_clear()
    auth._pinned_keys.cache_clear()
    c = TestClient(create_app())
    assert c.get("/api/me", headers=bearer(make_token(signing_key))).status_code == 200
    assert c.get("/api/me", headers=bearer(make_token(other, kid="second"))).status_code == 200
    assert c.get("/api/me", headers=bearer(make_token(other, kid=KID))).status_code == 401


def test_unconfigured_auth_answers_503_not_401(monkeypatch):
    """With no Supabase URL and no pinned keys the API cannot verify anyone: that is a server problem."""
    from fastapi.testclient import TestClient

    from app.core import auth
    from app.core.config import get_settings
    from app.main import create_app

    monkeypatch.setenv("SUPABASE_URL", "")
    monkeypatch.setenv("SUPABASE_JWKS_JSON", "")
    get_settings.cache_clear()
    auth._pinned_keys.cache_clear()
    try:
        r = TestClient(create_app()).get("/api/me", headers=bearer("a.b.c"))
        assert r.status_code == 503
    finally:
        get_settings.cache_clear()
