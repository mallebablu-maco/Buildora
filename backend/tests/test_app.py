"""Health check, CORS, security headers and settings parsing."""
from __future__ import annotations

from app.core.config import Settings


def test_health_is_open_and_reports_auth_config(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "service": "buildora-api", "auth_configured": True}


def test_security_headers_present(client):
    h = client.get("/api/health").headers
    assert h["x-content-type-options"] == "nosniff"
    assert h["x-frame-options"] == "DENY"
    assert h["referrer-policy"] == "no-referrer"


def test_cors_allows_the_configured_origin_only(client):
    ok = client.options("/api/me", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    bad = client.options("/api/me", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in bad.headers


def test_no_credentialed_cors(client):
    r = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert "access-control-allow-credentials" not in r.headers


def test_supabase_url_is_normalised():
    for raw in (
        "https://abc.supabase.co/rest/v1/",
        "https://abc.supabase.co/rest/v1",
        "https://abc.supabase.co/",
        " https://abc.supabase.co ",
    ):
        assert Settings(supabase_url=raw).supabase_url == "https://abc.supabase.co"
    assert Settings(supabase_url="https://abc.supabase.co").jwks_url == "https://abc.supabase.co/auth/v1/.well-known/jwks.json"


def test_cors_origins_are_parsed():
    s = Settings(cors_origins="http://a.test/, http://b.test ,")
    assert s.cors_origin_list == ["http://a.test", "http://b.test"]


def test_docs_are_hidden_in_production(monkeypatch):
    from fastapi.testclient import TestClient

    from app.core.config import get_settings
    from app.main import create_app

    monkeypatch.setenv("ENVIRONMENT", "production")
    get_settings.cache_clear()
    try:
        c = TestClient(create_app())
        assert c.get("/docs").status_code == 404
        assert c.get("/openapi.json").status_code == 404
    finally:
        get_settings.cache_clear()
