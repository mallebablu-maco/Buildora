"""Estimates, settings, the saved 3D layout and recommendations, through the API against a real local PostgreSQL."""
from __future__ import annotations

import copy
from types import SimpleNamespace

import pytest

from app.services.estimation.layout import plan_signature
from tests.conftest import PROJECT, ROOMS

SIZES = {"doors": [{"w": 1.0, "h": 2.1, "exterior": True}, {"w": 0.9, "h": 2.1, "exterior": False}], "windows": [{"w": 1.2, "h": 1.2}]}


def make(client, user, **over):
    body = copy.deepcopy(PROJECT) | {"rooms": copy.deepcopy(ROOMS)} | over
    r = client.post("/api/projects", json=body, headers=user.headers)
    assert r.status_code == 201, r.text
    return r.json()


def signature_of(project: dict) -> str:
    p = SimpleNamespace(**{k: project[k] for k in ("length", "width", "floors", "height", "wall_thickness")})
    rooms = [SimpleNamespace(**r) for r in project["rooms"]]
    return plan_signature(p, rooms)


# ---------------------------------------------------------------------------------------------------- estimate
def test_estimate_computes_quantities_and_costs_from_the_sample_catalogue(db_client, alice):
    p = make(db_client, alice)
    r = db_client.post(f"/api/projects/{p['id']}/estimate", headers=alice.headers)
    assert r.status_code == 200, r.text
    e = r.json()
    assert e["persisted"] is True and e["currency"] == "INR"
    keys = {i["key"] for i in e["items"]}
    assert {"cement", "sand", "aggregates", "steel", "bricks", "tiles", "paint"} <= keys
    for i in e["items"]:
        assert i["net_quantity"] >= 0 and i["gross_quantity"] >= i["net_quantity"] and i["formula"]
    priced = [i for i in e["items"] if i["counts_toward_cost"]]
    assert priced and all(i["unit_price"] is not None and i["price_is_sample"] for i in priced)  # every price is a labelled sample
    assert e["summary"]["material_total"] > 0
    assert e["summary"]["material_total"] == pytest.approx(sum(i["cost"] for i in priced))
    assert e["geometry"]["floor_area"] == 108 and e["geometry"]["total_built_up_area"] == 216
    assert e["summary"]["budget"] == 1500000
    assert set(e["alternatives"]) >= {"cement", "sand", "bricks"}


def test_the_estimate_is_stored_and_listed_with_the_project(db_client, alice):
    p = make(db_client, alice)
    assert db_client.get(f"/api/projects/{p['id']}/estimate", headers=alice.headers).status_code == 404
    assert db_client.get("/api/projects", headers=alice.headers).json()[0]["has_estimate"] is False
    total = db_client.post(f"/api/projects/{p['id']}/estimate", headers=alice.headers).json()["summary"]["material_total"]
    got = db_client.get(f"/api/projects/{p['id']}/estimate", headers=alice.headers).json()
    assert got["summary"]["material_total"] == pytest.approx(total) and got["stale"] is False
    row = db_client.get("/api/projects", headers=alice.headers).json()[0]
    assert row["has_estimate"] is True and row["latest_total_cost"] == pytest.approx(total)
    assert db_client.get(f"/api/projects/{p['id']}", headers=alice.headers).json()["latest_total_cost"] == pytest.approx(total)


def test_recalculating_replaces_the_stored_estimate(db_client, alice, pg_uri):
    from tests.conftest import superuser

    p = make(db_client, alice)
    for _ in range(3):
        db_client.post(f"/api/projects/{p['id']}/estimate", headers=alice.headers)
    with superuser(pg_uri) as c:
        assert c.execute("select count(*) from project_estimates").fetchone()[0] == 1
        assert c.execute("select count(*) from estimate_items").fetchone()[0] == len(db_client.get(f"/api/projects/{p['id']}/estimate", headers=alice.headers).json()["items"])


def test_an_estimate_goes_stale_when_the_project_changes(db_client, alice):
    p = make(db_client, alice)
    db_client.post(f"/api/projects/{p['id']}/estimate", headers=alice.headers)
    db_client.post(f"/api/projects/{p['id']}/rooms", json={"name": "Store", "room_type": "store", "length": 2, "width": 2}, headers=alice.headers)
    assert db_client.get(f"/api/projects/{p['id']}/estimate", headers=alice.headers).json()["stale"] is True


def test_what_if_estimates_are_not_saved(db_client, alice):
    p = make(db_client, alice)
    r = db_client.post(f"/api/projects/{p['id']}/estimate", json={"persist": False, "wastage": {"tiles": 20}}, headers=alice.headers)
    assert r.status_code == 200 and r.json()["persisted"] is False
    assert next(i for i in r.json()["items"] if i["key"] == "tiles")["wastage_pct"] == 20
    assert db_client.get(f"/api/projects/{p['id']}/estimate", headers=alice.headers).status_code == 404


def test_default_tile_wastage_is_seven_percent(db_client, alice):
    p = make(db_client, alice)
    e = db_client.post(f"/api/projects/{p['id']}/estimate", headers=alice.headers).json()
    assert next(i for i in e["items"] if i["key"] == "tiles")["wastage_pct"] == 7.0


def test_a_project_without_rooms_still_gets_an_estimate_with_a_warning(db_client, alice):
    r = db_client.post("/api/projects", json={"name": "Bare", "length": 10, "width": 8}, headers=alice.headers).json()
    e = db_client.post(f"/api/projects/{r['id']}/estimate", headers=alice.headers).json()
    assert e["summary"]["material_total"] > 0 and any("No rooms" in w for w in e["warnings"])


def test_recommendations_are_returned(db_client, alice):
    p = make(db_client, alice)
    r = db_client.get(f"/api/projects/{p['id']}/recommendations", headers=alice.headers)
    assert r.status_code == 200 and isinstance(r.json(), list) and r.json()
    assert {"title", "explanation", "severity"} <= set(r.json()[0])


# ---------------------------------------------------------------------------------------------------- settings
def test_settings_merge_and_are_used_by_the_estimate(db_client, alice):
    p = make(db_client, alice)
    r = db_client.put(f"/api/projects/{p['id']}/config", json={"wastage": {"tiles": 12}, "assumptions": {"paint_coats": 3}}, headers=alice.headers)
    assert r.status_code == 200 and r.json()["wastage"] == {"tiles": 12}
    db_client.put(f"/api/projects/{p['id']}/config", json={"wastage": {"paint": 8}}, headers=alice.headers)
    cfg = db_client.get(f"/api/projects/{p['id']}", headers=alice.headers).json()
    assert cfg["wastage"] == {"tiles": 12, "paint": 8} and cfg["assumptions"] == {"paint_coats": 3}
    e = db_client.post(f"/api/projects/{p['id']}/estimate", headers=alice.headers).json()
    by = {i["key"]: i for i in e["items"]}
    assert by["tiles"]["wastage_pct"] == 12 and by["paint"]["wastage_pct"] == 8


def test_invalid_settings_are_rejected(db_client, alice):
    p = make(db_client, alice)
    assert db_client.put(f"/api/projects/{p['id']}/config", json={"wastage": {"tiles": 150}}, headers=alice.headers).status_code == 422
    assert db_client.put(f"/api/projects/{p['id']}/config", json={"hacker": 1}, headers=alice.headers).status_code == 422


def test_extra_costs_count_only_when_enabled(db_client, alice):
    p = make(db_client, alice)
    off = db_client.post(f"/api/projects/{p['id']}/estimate", headers=alice.headers).json()["summary"]
    assert off["extras_total"] == 0 and off["project_total"] == off["material_total"]
    db_client.put(f"/api/projects/{p['id']}/config", json={"extra_costs": {"contingency": {"enabled": True, "mode": "percent", "value": 5}}}, headers=alice.headers)
    on = db_client.post(f"/api/projects/{p['id']}/estimate", headers=alice.headers).json()["summary"]
    assert on["extras_total"] == pytest.approx(on["material_total"] * 0.05) and on["project_total"] > on["material_total"]


# ---------------------------------------------------------------------------------------------------- the saved 3D layout
def layout_body(project: dict, **over) -> dict:
    return {"version": 1, "signature": signature_of(project), "settings": {"autoFurnish": True}, "openings": None, "furniture": None, "summary": SIZES} | over


def test_the_layout_is_saved_with_the_project_and_can_be_reset(db_client, alice):
    p = make(db_client, alice)
    r = db_client.put(f"/api/projects/{p['id']}/layout", json=layout_body(p), headers=alice.headers)
    assert r.status_code == 200 and r.json()["layout"]["summary"] == SIZES and r.json()["layout"]["signature"] == signature_of(p)
    assert db_client.get(f"/api/projects/{p['id']}", headers=alice.headers).json()["layout"]["settings"] == {"autoFurnish": True}
    r = db_client.delete(f"/api/projects/{p['id']}/layout", headers=alice.headers)
    assert r.status_code == 200 and r.json()["layout"] is None


def test_the_estimate_uses_the_saved_openings_only_while_the_plan_is_unchanged(db_client, alice):
    p = make(db_client, alice)
    before = db_client.post(f"/api/projects/{p['id']}/estimate", headers=alice.headers).json()
    assert before["geometry"]["openings_source"] == "estimated from room door/window counts"
    db_client.put(f"/api/projects/{p['id']}/layout", json=layout_body(p), headers=alice.headers)
    after = db_client.post(f"/api/projects/{p['id']}/estimate", headers=alice.headers).json()
    assert after["geometry"]["openings_source"] == "saved 3D layout"
    assert (after["geometry"]["door_count"], after["geometry"]["window_count"]) == (2, 1)
    # the plan changes (a room is added): the saved summary no longer applies and is ignored, never silently reused
    db_client.post(f"/api/projects/{p['id']}/rooms", json={"name": "Store", "room_type": "store", "length": 2, "width": 2}, headers=alice.headers)
    stale = db_client.post(f"/api/projects/{p['id']}/estimate", headers=alice.headers).json()
    assert stale["geometry"]["openings_source"] == "estimated from room door/window counts"


def test_replacing_the_rooms_clears_the_saved_layout(db_client, alice):
    p = make(db_client, alice)
    db_client.put(f"/api/projects/{p['id']}/layout", json=layout_body(p), headers=alice.headers)
    db_client.put(f"/api/projects/{p['id']}/rooms", json={"rooms": [{"name": "Hall", "length": 6, "width": 4}]}, headers=alice.headers)
    assert db_client.get(f"/api/projects/{p['id']}", headers=alice.headers).json()["layout"] is None


LAYOUT_ABUSE = [
    ("huge opening", lambda p: layout_body(p, openings=[{"id": "a", "kind": "door", "floor": 1, "orientation": "x", "line": 1, "center": 1, "width": 99, "height": 2, "sill": 0, "room_id": "r"}])),
    ("unknown kind", lambda p: layout_body(p, openings=[{"id": "a", "kind": "portal", "floor": 1, "orientation": "x", "line": 1, "center": 1, "width": 1, "height": 2, "sill": 0, "room_id": "r"}])),
    ("too many openings", lambda p: layout_body(p, openings=[{"id": str(i), "kind": "door", "floor": 1, "orientation": "x", "line": 1, "center": 1, "width": 1, "height": 2, "sill": 0, "room_id": "r"} for i in range(1201)])),
    ("furniture outside limits", lambda p: layout_body(p, furniture={"items": [{"id": "f", "room_id": "r", "type": "bed", "cx": 5000, "cz": 0, "w": 1, "d": 1}], "room_sigs": {}})),
    ("too many settings", lambda p: layout_body(p, settings={f"k{i}": 1 for i in range(31)})),
    ("signature too long", lambda p: layout_body(p, signature="x" * 200001)),
]


@pytest.mark.parametrize("label,build", LAYOUT_ABUSE, ids=[a[0] for a in LAYOUT_ABUSE])
def test_nonsense_layouts_are_rejected_before_they_are_stored(db_client, alice, label, build):
    p = make(db_client, alice)
    assert db_client.put(f"/api/projects/{p['id']}/layout", json=build(p), headers=alice.headers).status_code == 422, label
    assert db_client.get(f"/api/projects/{p['id']}", headers=alice.headers).json()["layout"] is None


def test_other_people_cannot_touch_the_estimate_settings_or_layout(db_client, alice, bob):
    p = make(db_client, alice)
    base = f"/api/projects/{p['id']}"
    assert db_client.post(f"{base}/estimate", headers=bob.headers).status_code == 404
    assert db_client.get(f"{base}/estimate", headers=bob.headers).status_code == 404
    assert db_client.get(f"{base}/recommendations", headers=bob.headers).status_code == 404
    assert db_client.put(f"{base}/config", json={"wastage": {"tiles": 1}}, headers=bob.headers).status_code == 404
    assert db_client.put(f"{base}/layout", json=layout_body(p), headers=bob.headers).status_code == 404
    assert db_client.delete(f"{base}/layout", headers=bob.headers).status_code == 404
