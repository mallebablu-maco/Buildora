from __future__ import annotations

from tests.conftest import as_user, superuser


def test_profile_is_created_on_first_use_from_the_signup_name(db_client, alice, pg_uri):
    with superuser(pg_uri) as c:
        assert c.execute("select count(*) from profiles").fetchone()[0] == 0  # nothing until the first request
    r = db_client.get("/api/profile", headers=alice.headers)
    assert r.status_code == 200
    assert r.json() == {"id": alice.id, "email": "alice@example.com", "full_name": "Alice Rao", "default_city": "", "default_wastage": {}}
    assert db_client.get("/api/profile", headers=alice.headers).json() == r.json()  # idempotent
    with superuser(pg_uri) as c:
        assert c.execute("select count(*) from profiles").fetchone()[0] == 1


def test_profile_can_be_renamed(db_client, alice):
    assert db_client.put("/api/profile", json={"full_name": "Alice R. Rao"}, headers=alice.headers).json()["full_name"] == "Alice R. Rao"
    assert db_client.get("/api/profile", headers=alice.headers).json()["full_name"] == "Alice R. Rao"


def test_profile_rejects_too_long_and_unknown_fields(db_client, alice):
    assert db_client.put("/api/profile", json={"full_name": "x" * 121}, headers=alice.headers).status_code == 422
    assert db_client.put("/api/profile", json={"full_name": "ok", "id": "x"}, headers=alice.headers).status_code == 422


def test_profiles_are_private(db_client, alice, bob, pg_uri):
    db_client.get("/api/profile", headers=alice.headers)
    db_client.get("/api/profile", headers=bob.headers)
    db_client.put("/api/profile", json={"full_name": "Alice New"}, headers=alice.headers)
    assert db_client.get("/api/profile", headers=bob.headers).json()["full_name"] == "Bob Nair"
    with as_user(pg_uri, bob.id) as c:
        assert c.execute("select full_name from profiles").fetchall() == [("Bob Nair",)]


def test_a_long_signup_name_is_trimmed_not_rejected(db_client, make_user):
    u = make_user("long@example.com", "N" * 300)
    assert len(db_client.get("/api/profile", headers=u.headers).json()["full_name"]) == 120
