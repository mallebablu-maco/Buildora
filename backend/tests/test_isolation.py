"""One user must never see, change or delete another user's data, through the API."""
from __future__ import annotations

import copy

from tests.conftest import PROJECT, ROOMS


def make_project(client, user, name="Mine"):
    r = client.post("/api/projects", json=copy.deepcopy(PROJECT) | {"name": name, "rooms": copy.deepcopy(ROOMS)}, headers=user.headers)
    assert r.status_code == 201, r.text
    return r.json()


def test_each_user_sees_only_their_own_projects(db_client, alice, bob):
    make_project(db_client, alice, "Alice's house")
    make_project(db_client, bob, "Bob's house")
    assert [p["name"] for p in db_client.get("/api/projects", headers=alice.headers).json()] == ["Alice's house"]
    assert [p["name"] for p in db_client.get("/api/projects", headers=bob.headers).json()] == ["Bob's house"]


def test_other_users_projects_look_like_they_do_not_exist(db_client, alice, bob):
    pa = make_project(db_client, alice)
    url = f"/api/projects/{pa['id']}"
    assert db_client.get(url, headers=bob.headers).status_code == 404
    assert db_client.put(url, json=PROJECT | {"name": "hacked"}, headers=bob.headers).status_code == 404
    assert db_client.delete(url, headers=bob.headers).status_code == 404
    # the 404 for a real-but-foreign id is identical to the 404 for an id that does not exist
    ghost = db_client.get("/api/projects/00000000-0000-0000-0000-000000000000", headers=bob.headers)
    assert ghost.status_code == 404 and ghost.json() == db_client.get(url, headers=bob.headers).json()
    mine = db_client.get(url, headers=alice.headers).json()
    assert mine["name"] == "Mine" and mine["room_count"] == 3


def test_other_users_rooms_are_untouchable(db_client, alice, bob):
    pa = make_project(db_client, alice)
    rid = pa["rooms"][0]["id"]
    base = f"/api/projects/{pa['id']}/rooms"
    new = {"name": "Sneaky", "length": 3, "width": 3}
    assert db_client.get(base, headers=bob.headers).status_code == 404
    assert db_client.post(base, json=new, headers=bob.headers).status_code == 404
    assert db_client.put(f"{base}/{rid}", json=new, headers=bob.headers).status_code == 404
    assert db_client.delete(f"{base}/{rid}", headers=bob.headers).status_code == 404
    assert db_client.put(base, json={"rooms": [new]}, headers=bob.headers).status_code == 404
    assert [r["name"] for r in db_client.get(base, headers=alice.headers).json()] == ["Living", "Kitchen", "Bedroom 1"]


def test_a_room_id_cannot_be_reached_through_someone_elses_project_path(db_client, alice, bob):
    """Bob owns a project; he tries Alice's room id under his OWN project path."""
    pa = make_project(db_client, alice, "A")
    pb = make_project(db_client, bob, "B")
    foreign_room = pa["rooms"][0]["id"]
    url = f"/api/projects/{pb['id']}/rooms/{foreign_room}"
    assert db_client.put(url, json={"name": "x", "length": 3, "width": 3}, headers=bob.headers).status_code == 404
    assert db_client.delete(url, headers=bob.headers).status_code == 404
    assert len(db_client.get(f"/api/projects/{pa['id']}", headers=alice.headers).json()["rooms"]) == 3


def test_an_owner_cannot_be_forged_in_the_request(db_client, alice, bob):
    """The owner always comes from the verified token; a body that tries to name one is refused."""
    r = db_client.post("/api/projects", json=copy.deepcopy(PROJECT) | {"owner_id": bob.id}, headers=alice.headers)
    assert r.status_code == 422
    made = make_project(db_client, alice)
    assert db_client.get("/api/projects", headers=bob.headers).json() == []
    assert made["name"] == "Mine"
