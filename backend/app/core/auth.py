"""Verify Supabase Auth access tokens.

Supabase signs access tokens with an asymmetric key; the public keys are published at
``<project>/auth/v1/.well-known/jwks.json``. The API only needs those public keys: no JWT secret and no service-role key.

Only asymmetric algorithms are accepted, so a token cannot be forged by an attacker who knows the public key
(the classic "alg confusion" attack) and ``alg: none`` is rejected.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient, PyJWKSet

from app.core.config import get_settings

ALLOWED_ALGORITHMS = ["ES256", "RS256", "EdDSA"]


class AuthUnavailable(Exception):
    """The signing keys could not be fetched (network or Supabase outage). Not the caller's fault: answer 503, not 401."""


@dataclass(frozen=True)
class Identity:
    """The signed-in user as seen by the API."""

    id: str
    email: str
    # user_metadata is editable by the user, so these two are for display only and must never decide access.
    full_name: str = ""
    persona: str = ""
    token: str = field(default="", repr=False)

    def public(self) -> dict:
        return {"id": self.id, "email": self.email, "full_name": self.full_name, "persona": self.persona}


@lru_cache
def _jwks_client(url: str) -> PyJWKClient:
    return PyJWKClient(url, cache_keys=True, lifespan=3600, timeout=5)


@lru_cache
def _pinned_keys(raw: str) -> PyJWKSet:
    return PyJWKSet.from_dict(json.loads(raw))


def _signing_key(token: str):
    settings = get_settings()
    if settings.supabase_jwks_json:
        kid = jwt.get_unverified_header(token).get("kid")
        for key in _pinned_keys(settings.supabase_jwks_json).keys:
            if kid is not None and key.key_id == kid:
                return key.key
        raise jwt.InvalidTokenError("unknown signing key")
    try:
        return _jwks_client(settings.jwks_url).get_signing_key_from_jwt(token).key
    except jwt.PyJWKClientConnectionError as exc:
        raise AuthUnavailable from exc


def verify_access_token(token: str) -> Identity | None:
    """Check signature, expiry, audience and issuer. Returns None for any invalid token."""
    settings = get_settings()
    if not settings.auth_configured and not settings.supabase_jwks_json:
        raise AuthUnavailable
    try:
        data = jwt.decode(
            token,
            _signing_key(token),
            algorithms=ALLOWED_ALGORITHMS,
            audience="authenticated",
            issuer=settings.issuer,
            options={"require": ["exp", "sub", "aud", "iss"]},
        )
    except AuthUnavailable:
        raise
    except Exception:  # any malformed, expired, forged or mismatched token
        return None
    if data.get("role") != "authenticated":  # the public anon key is a valid JWT too; it is not a signed-in user
        return None
    meta = data.get("user_metadata") or {}
    return Identity(
        id=str(data["sub"]),
        email=str(data.get("email", "")),
        full_name=str(meta.get("full_name", "")),
        persona=str(meta.get("persona", "")),
        token=token,
    )


_bearer = HTTPBearer(auto_error=False)


def current_identity(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> Identity:
    """FastAPI dependency: the verified caller, or 401 (503 when the signing keys are unreachable)."""
    unauthorized = HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated. Please log in.", headers={"WWW-Authenticate": "Bearer"})
    if not creds:
        raise unauthorized
    try:
        identity = verify_access_token(creds.credentials)
    except AuthUnavailable:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Authentication is temporarily unavailable.") from None
    if identity is None:
        raise unauthorized
    return identity
