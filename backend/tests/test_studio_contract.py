"""The data the browser's Studio code really produces, replayed against the real API (see frontend/src/features/studio/contract.test.ts)."""
from __future__ import annotations

import json
import pathlib
from types import SimpleNamespace

import pytest

from app.services.estimation.layout import plan_signature

FIXTURES = json.loads((pathlib.Path(__file__).parent / "fixtures" / "studio_payloads.json").read_text())["scenarios"]


def test_the_plan_signature_matches_the_frontend_golden_value():
    """The same value is asserted in frontend/src/features/studio/layoutStore.test.ts: both sides must compute it identically."""
    project = SimpleNamespace(length=10, width=8, floors=1, height=3, wall_thickness=0.23)
    room = SimpleNamespace(id="a", pos_x=1.0625, pos_y=None, length=4, width=3.5, floor_number=1, doors=1, windows=2, room_type="bedroom")
    assert plan_signature(project, [room]) == "10000|8000|1|3000|230|a:1063:na:4000:3500:1:1:2:bedroom"


def test_rounding_is_half_up_like_javascript():
    for pos in (0.0625, 2.0005, 0.0005, 1.5):
        room = SimpleNamespace(id="a", pos_x=pos, pos_y=pos, length=1, width=1, floor_number=1, doors=0, windows=0, room_type="other")
        sig = plan_signature(SimpleNamespace(length=1, width=1, floors=1, height=3, wall_thickness=0.2), [room])
        assert f":{int(pos * 1000 + 0.5)}:{int(pos * 1000 + 0.5)}:" in sig


def test_there_are_fixtures_for_every_kind_of_building():
    assert {s["name"] for s in FIXTURES} == {"one-storey 10x8 house", "two-storey 10x8 house", "small 6x6 studio", "three-storey commercial 20x12"}


@pytest.mark.parametrize("sc", FIXTURES, ids=[s["name"] for s in FIXTURES])
def test_what_the_studio_sends_is_accepted_stored_and_used_by_the_estimate(db_client, alice, sc):
    h = alice.headers
    p = db_client.post("/api/projects", json=sc["project"], headers=h)
    assert p.status_code == 201, p.text
    pid = p.json()["id"]
    r = db_client.put(f"/api/projects/{pid}/rooms", json={"rooms": sc["rooms"]}, headers=h)  # "Apply to project" in the generator dialog
    assert r.status_code == 200, r.text
    real = {old: room["id"] for old, room in zip(sc["room_ids"], r.json())}
    assert len(real) == len(sc["rooms"])

    def with_real_ids(layout: dict) -> dict:
        text = json.dumps(layout)
        for old, new in sorted(real.items(), key=lambda kv: -len(kv[0])):
            text = text.replace(f'"{old}"', f'"{new}"')  # whole ids only
        return json.loads(text)

    detail = db_client.get(f"/api/projects/{pid}", headers=h).json()
    signature = plan_signature(SimpleNamespace(**detail), [SimpleNamespace(**room) for room in detail["rooms"]])
    for kind in ("automatic", "custom"):
        layout = with_real_ids(sc["layouts"][kind]) | {"signature": signature}
        saved = db_client.put(f"/api/projects/{pid}/layout", json=layout, headers=h)  # "Save layout"
        assert saved.status_code == 200, (kind, saved.text[:500])
        stored = saved.json()["layout"]
        assert len(stored["summary"]["doors"]) == sc["counts"]["doors"] and len(stored["summary"]["windows"]) == sc["counts"]["windows"]
        if kind == "custom":
            assert len(stored["openings"]) == sc["counts"]["openings"] and len(stored["furniture"]["items"]) == sc["counts"]["furniture"]
        est = db_client.post(f"/api/projects/{pid}/estimate", headers=h)  # the Studio re-runs the estimate after saving
        assert est.status_code == 200, est.text
        geo = est.json()["geometry"]
        assert geo["openings_source"] == "saved 3D layout" and geo["door_count"] == sc["counts"]["doors"] and geo["window_count"] == sc["counts"]["windows"]
        assert est.json()["summary"]["material_total"] > 0

    assert db_client.delete(f"/api/projects/{pid}/layout", headers=h).json()["layout"] is None  # "Reset layout"
    assert db_client.post(f"/api/projects/{pid}/report", headers=h).status_code == 201
