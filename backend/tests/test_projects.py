"""Projects and rooms through the API, against a real local PostgreSQL that has the project's migration applied."""
from __future__ import annotations

import copy

import pytest

from tests.conftest import PROJECT, ROOMS, superuser


def create(client, user, **over):
    body = copy.deepcopy(PROJECT) | {"rooms": copy.deepcopy(ROOMS)} | over
    r = client.post("/api/projects", json=body, headers=user.headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_create_and_read_back(db_client, alice):
    p = create(db_client, alice)
    assert p["name"] == "Sample G+1 Residence" and p["floors"] == 2 and p["currency"] == "INR"
    assert p["room_count"] == 3
    assert p["floor_area"] == 108 and p["total_built_up_area"] == 216
    assert [r["name"] for r in p["rooms"]] == ["Living", "Kitchen", "Bedroom 1"]  # ordered by floor, then creation
    assert p["rooms"][0]["area"] == 25 and p["rooms"][1]["area"] == 12.25
    assert all(r["project_id"] == p["id"] for r in p["rooms"])
    got = db_client.get(f"/api/projects/{p['id']}", headers=alice.headers).json()
    assert got == p


def test_project_without_rooms_and_with_defaults(db_client, alice):
    r = db_client.post("/api/projects", json={"name": "Bare", "length": 10, "width": 8}, headers=alice.headers)
    assert r.status_code == 201
    p = r.json()
    assert (p["floors"], p["height"], p["wall_thickness"], p["slab_thickness"], p["currency"], p["building_type"]) == (1, 3.0, 0.23, 0.15, "INR", "residential")
    assert p["rooms"] == [] and p["room_count"] == 0


def test_manual_footprint_overrides_length_times_width(db_client, alice):
    p = create(db_client, alice, built_up_area=100)
    assert p["floor_area"] == 100 and p["total_built_up_area"] == 200


def test_list_shows_room_counts_newest_first(db_client, alice):
    first = create(db_client, alice, name="First")
    second = db_client.post("/api/projects", json={"name": "Second", "length": 6, "width": 6}, headers=alice.headers).json()
    rows = db_client.get("/api/projects", headers=alice.headers).json()
    assert [(r["name"], r["room_count"]) for r in rows] == [("Second", 0), ("First", 3)]
    assert "rooms" not in rows[0]
    db_client.put(f"/api/projects/{first['id']}", json=PROJECT | {"name": "First (renamed)"}, headers=alice.headers)
    assert [r["name"] for r in db_client.get("/api/projects", headers=alice.headers).json()] == ["First (renamed)", "Second"]
    assert second["id"] != first["id"]


def test_update_project(db_client, alice):
    p = create(db_client, alice)
    r = db_client.put(f"/api/projects/{p['id']}", json=PROJECT | {"name": "Renamed", "floors": 3, "length": 14}, headers=alice.headers)
    assert r.status_code == 200
    out = r.json()
    assert (out["name"], out["floors"], out["length"], out["room_count"]) == ("Renamed", 3, 14, 3)


def test_cannot_reduce_floors_below_a_floor_that_has_rooms(db_client, alice):
    p = create(db_client, alice)
    r = db_client.put(f"/api/projects/{p['id']}", json=PROJECT | {"floors": 1}, headers=alice.headers)
    assert r.status_code == 422 and "floor 2" in r.json()["detail"]
    assert db_client.get(f"/api/projects/{p['id']}", headers=alice.headers).json()["floors"] == 2


BAD_PROJECTS = [
    ("negative length", {"length": -1}), ("zero width", {"width": 0}), ("huge length", {"length": 5000}),
    ("zero floors", {"floors": 0}), ("51 floors", {"floors": 51}), ("blank name", {"name": "   "}), ("name too long", {"name": "x" * 161}),
    ("unknown building type", {"building_type": "castle"}), ("bad currency", {"currency": "rupees"}), ("zero budget", {"budget": 0}),
    ("tiny floor height", {"height": 0.5}), ("zero wall thickness", {"wall_thickness": 0}), ("unknown field", {"is_admin": True}),
    ("description too long", {"description": "x" * 2001}),
]


@pytest.mark.parametrize("label,patch", BAD_PROJECTS, ids=[b[0] for b in BAD_PROJECTS])
def test_invalid_projects_are_rejected(db_client, alice, label, patch):
    r = db_client.post("/api/projects", json=copy.deepcopy(PROJECT) | patch, headers=alice.headers)
    assert r.status_code == 422, label
    assert db_client.get("/api/projects", headers=alice.headers).json() == []


BAD_ROOMS = [
    ("room above the top floor", {"floor_number": 3}), ("negative size", {"length": -2}), ("zero size", {"width": 0}),
    ("unknown room type", {"room_type": "dungeon"}), ("blank name", {"name": ""}), ("negative doors", {"doors": -1}),
    ("negative position", {"pos_x": -1}), ("tiny height", {"height": 1}),
]


@pytest.mark.parametrize("label,patch", BAD_ROOMS, ids=[b[0] for b in BAD_ROOMS])
def test_invalid_rooms_are_rejected(db_client, alice, label, patch):
    bad = copy.deepcopy(ROOMS[0]) | patch
    r = db_client.post("/api/projects", json=copy.deepcopy(PROJECT) | {"rooms": [bad]}, headers=alice.headers)
    assert r.status_code == 422, label


def test_room_crud(db_client, alice):
    p = create(db_client, alice)
    base = f"/api/projects/{p['id']}/rooms"
    new = {"name": "Study", "room_type": "study", "length": 3, "width": 3, "floor_number": 2, "doors": 1, "windows": 1}
    added = db_client.post(base, json=new, headers=alice.headers)
    assert added.status_code == 201 and added.json()["area"] == 9
    rid = added.json()["id"]
    assert len(db_client.get(base, headers=alice.headers).json()) == 4

    edited = db_client.put(f"{base}/{rid}", json=new | {"length": 4, "doors": 2, "pos_x": 1.5, "pos_y": 2.0}, headers=alice.headers)
    assert edited.status_code == 200
    assert (edited.json()["length"], edited.json()["doors"], edited.json()["pos_x"], edited.json()["area"]) == (4, 2, 1.5, 12)

    assert db_client.delete(f"{base}/{rid}", headers=alice.headers).status_code == 204
    assert [r["name"] for r in db_client.get(base, headers=alice.headers).json()] == ["Living", "Kitchen", "Bedroom 1"]
    assert db_client.delete(f"{base}/{rid}", headers=alice.headers).status_code == 404


def test_manual_area_override_is_used(db_client, alice):
    p = create(db_client, alice)
    r = db_client.post(f"/api/projects/{p['id']}/rooms", json={"name": "L-shaped hall", "length": 4, "width": 4, "area_override": 13.5}, headers=alice.headers)
    assert r.json()["area"] == 13.5


def test_room_cannot_be_added_above_the_projects_floors(db_client, alice):
    p = create(db_client, alice)
    r = db_client.post(f"/api/projects/{p['id']}/rooms", json={"name": "Attic", "length": 3, "width": 3, "floor_number": 3}, headers=alice.headers)
    assert r.status_code == 422


def test_replace_rooms_swaps_them_all_at_once(db_client, alice):
    p = create(db_client, alice)
    new = [{"name": "Hall", "length": 6, "width": 4, "floor_number": 1}, {"name": "Bed", "room_type": "bedroom", "length": 4, "width": 4, "floor_number": 2}]
    r = db_client.put(f"/api/projects/{p['id']}/rooms", json={"rooms": new}, headers=alice.headers)
    assert r.status_code == 200 and [x["name"] for x in r.json()] == ["Hall", "Bed"]
    assert db_client.get("/api/projects", headers=alice.headers).json()[0]["room_count"] == 2


def test_replace_rooms_is_all_or_nothing(db_client, alice):
    p = create(db_client, alice)
    bad = [{"name": "Fine", "length": 3, "width": 3}, {"name": "Too high", "length": 3, "width": 3, "floor_number": 9}]
    assert db_client.put(f"/api/projects/{p['id']}/rooms", json={"rooms": bad}, headers=alice.headers).status_code == 422
    assert [r["name"] for r in db_client.get(f"/api/projects/{p['id']}", headers=alice.headers).json()["rooms"]] == ["Living", "Kitchen", "Bedroom 1"]


def test_delete_project_removes_its_rooms(db_client, alice, pg_uri):
    p = create(db_client, alice)
    assert db_client.delete(f"/api/projects/{p['id']}", headers=alice.headers).status_code == 204
    assert db_client.get(f"/api/projects/{p['id']}", headers=alice.headers).status_code == 404
    with superuser(pg_uri) as c:
        assert c.execute("select count(*) from project_rooms").fetchone()[0] == 0
        assert c.execute("select count(*) from projects").fetchone()[0] == 0


def test_changing_a_room_counts_as_changing_the_project(db_client, alice):
    p = create(db_client, alice)
    before = db_client.get(f"/api/projects/{p['id']}", headers=alice.headers).json()["updated_at"]
    db_client.post(f"/api/projects/{p['id']}/rooms", json={"name": "Store", "room_type": "store", "length": 2, "width": 2}, headers=alice.headers)
    after = db_client.get(f"/api/projects/{p['id']}", headers=alice.headers).json()["updated_at"]
    assert after > before


def test_malformed_ids_are_rejected(db_client, alice):
    assert db_client.get("/api/projects/not-a-uuid", headers=alice.headers).status_code == 422


@pytest.mark.parametrize("method,path", [
    ("get", "/api/projects"), ("post", "/api/projects"), ("get", "/api/projects/00000000-0000-0000-0000-000000000000"),
    ("put", "/api/projects/00000000-0000-0000-0000-000000000000"), ("delete", "/api/projects/00000000-0000-0000-0000-000000000000"),
    ("get", "/api/projects/00000000-0000-0000-0000-000000000000/rooms"), ("post", "/api/projects/00000000-0000-0000-0000-000000000000/rooms"),
    ("get", "/api/profile"), ("put", "/api/profile"),
])
def test_every_data_endpoint_requires_a_signed_in_user(db_client, method, path):
    assert getattr(db_client, method)(path).status_code == 401


def test_without_a_database_the_api_says_503_not_500(client, signing_key):
    from tests.conftest import make_token

    r = client.get("/api/projects", headers={"Authorization": f"Bearer {make_token(signing_key)}"})
    assert r.status_code == 503 and "not configured" in r.json()["detail"]


def test_readiness_is_ok_with_a_database(db_client):
    ok = db_client.get("/api/health/ready")
    assert ok.status_code == 200 and ok.json()["database"] == "ok"


def test_readiness_is_503_without_a_database(client):
    missing = client.get("/api/health/ready")
    assert missing.status_code == 503 and missing.json()["database"] == "not configured"


def test_readiness_is_503_when_the_database_is_unreachable(app_env, tmp_path):
    from fastapi.testclient import TestClient

    from app.core.config import get_settings
    from app.main import create_app

    app_env.setenv("DATABASE_URL", f"postgresql://postgres:@/postgres?host={tmp_path}&connect_timeout=2")  # nothing listens there
    get_settings.cache_clear()
    r = TestClient(create_app()).get("/api/health/ready")
    assert r.status_code == 503 and r.json()["database"] == "unreachable"
    assert str(tmp_path) not in r.text  # connection details are never leaked
