"""Rooms must fit inside the building: the rooms of one floor cannot add up to more than one floor of the building."""
import copy

from tests.conftest import PROJECT

ROOM = {"name": "Room", "room_type": "bedroom", "length": 3.5, "width": 3.5, "floor_number": 1}


def body(n, **over):
    return copy.deepcopy(PROJECT) | {"length": 10, "width": 8, "floors": 2, "rooms": [ROOM | {"name": f"Room {i}"} for i in range(n)]} | over


def test_twelve_3_5_m_rooms_do_not_fit_on_an_80_m2_floor(db_client, alice):
    r = db_client.post("/api/projects", json=body(12), headers=alice.headers)  # 147 m2 of rooms on an 80 m2 floor
    assert r.status_code == 422 and "floor 1" in r.text and "80.0" in r.text
    assert db_client.post("/api/projects", json=body(6), headers=alice.headers).status_code == 201  # 73.5 m2: fits


def test_the_same_rooms_spread_over_floors_fit(db_client, alice):
    b = body(12)
    for i, room in enumerate(b["rooms"]):
        room["floor_number"] = 1 + i % 2
    assert db_client.post("/api/projects", json=b, headers=alice.headers).status_code == 201


def test_adding_or_enlarging_a_room_cannot_overfill_a_floor(db_client, alice):
    p = db_client.post("/api/projects", json=body(6), headers=alice.headers).json()
    assert db_client.post(f"/api/projects/{p['id']}/rooms", json=ROOM | {"name": "Extra"}, headers=alice.headers).status_code == 422
    rid = p["rooms"][0]["id"]
    assert db_client.put(f"/api/projects/{p['id']}/rooms/{rid}", json=ROOM | {"length": 6}, headers=alice.headers).status_code == 422
    assert db_client.put(f"/api/projects/{p['id']}/rooms/{rid}", json=ROOM | {"length": 3}, headers=alice.headers).status_code == 200
    assert db_client.put(f"/api/projects/{p['id']}/rooms", json={"rooms": body(12)["rooms"]}, headers=alice.headers).status_code == 422


def test_an_already_overfull_project_can_still_be_shrunk(db_client, alice, pg_uri):
    from tests.conftest import superuser
    p = db_client.post("/api/projects", json=body(6), headers=alice.headers).json()
    with superuser(pg_uri) as c:  # older data from before this rule
        c.execute("update project_rooms set length = 5 where project_id = %s", (p["id"],))
    rid = p["rooms"][0]["id"]
    assert db_client.put(f"/api/projects/{p['id']}/rooms/{rid}", json=ROOM | {"length": 2}, headers=alice.headers).status_code == 200
