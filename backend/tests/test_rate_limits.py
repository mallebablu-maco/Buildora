"""Request limits: normal use is never blocked; floods get 429 with a plain message; limits are per session."""
import copy

import pytest

from app.core import ratelimit
from tests.conftest import PROJECT


def test_normal_use_is_not_limited(client, signing_key):
    from tests.conftest import make_token
    h = {"Authorization": f"Bearer {make_token(signing_key)}"}
    assert all(client.get("/api/me", headers=h).status_code == 200 for _ in range(50))


def test_a_flood_from_one_session_gets_429_with_a_plain_message(client, signing_key, monkeypatch):
    from tests.conftest import make_token
    monkeypatch.setattr(ratelimit, "GENERAL", 10)
    from app.main import create_app
    from fastapi.testclient import TestClient
    c = TestClient(create_app())
    h = {"Authorization": f"Bearer {make_token(signing_key)}"}
    codes = [c.get("/api/me", headers=h).status_code for _ in range(12)]
    assert codes[:10] == [200] * 10 and codes[10:] == [429, 429]
    r = c.get("/api/me", headers=h)
    assert r.json()["detail"] == ratelimit.MESSAGE and int(r.headers["Retry-After"]) >= 1
    other = {"Authorization": f"Bearer {make_token(signing_key, sub='someone-else')}"}
    assert c.get("/api/me", headers=other).status_code == 200  # another person is not affected
    assert c.get("/api/health").status_code == 200  # health checks are never limited


def test_heavy_actions_have_tighter_limits(db_client, alice):
    body = copy.deepcopy(PROJECT)
    codes = [db_client.post("/api/projects", json=body, headers=alice.headers).status_code for _ in range(22)]
    assert codes.count(201) == 20 and codes[-2:] == [429, 429]
    assert db_client.get("/api/projects", headers=alice.headers).status_code == 200  # reading still works


def test_the_429_can_be_read_by_the_website(client, signing_key, monkeypatch):
    """The answer passes through CORS, so the browser shows the message instead of a vague network error."""
    from tests.conftest import make_token
    from app.main import create_app
    from fastapi.testclient import TestClient
    monkeypatch.setattr(ratelimit, "GENERAL", 1)
    c = TestClient(create_app())
    h = {"Authorization": f"Bearer {make_token(signing_key)}", "Origin": "http://localhost:5173"}
    c.get("/api/me", headers=h)
    r = c.get("/api/me", headers=h)
    assert r.status_code == 429 and r.headers.get("access-control-allow-origin") == "http://localhost:5173"


@pytest.mark.parametrize("enabled", [False])
def test_limits_can_be_switched_off(client, signing_key, monkeypatch, enabled):
    from tests.conftest import make_token
    from app.main import create_app
    from fastapi.testclient import TestClient
    monkeypatch.setattr(ratelimit, "GENERAL", 1)
    monkeypatch.setenv("RATE_LIMIT_ENABLED", "false")
    from app.core.config import get_settings
    get_settings.cache_clear()
    c = TestClient(create_app())
    h = {"Authorization": f"Bearer {make_token(signing_key)}"}
    assert [c.get("/api/me", headers=h).status_code for _ in range(3)] == [200, 200, 200]
