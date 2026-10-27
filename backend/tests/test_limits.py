"""The browser and the API must enforce the same limits, so a form never accepts what the API then rejects (or the reverse)."""
import re
from pathlib import Path

from app import limits

TS = Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib" / "limits.ts"


def _ts_limits() -> dict[str, float]:
    return {k: float(v.replace("_", "")) for k, v in re.findall(r"^\s{2}([A-Z_]+):\s*([\d_.]+),", TS.read_text(), re.M)}


def test_frontend_and_backend_limits_are_identical():
    py = {k: float(v) for k, v in vars(limits).items() if k.isupper() and isinstance(v, (int, float))}
    # Python groups MIN_X, MAX_X pairs on one line; the constants are still separate names, so the dicts compare directly.
    assert _ts_limits() == py


# ---- the API refuses what the limits forbid (and accepts the edge values)
import copy

import pytest

from app import limits as L
from tests.conftest import PROJECT, ROOMS
from tests.test_projects import create

BAD_PROJECTS = [
    ("name", "x" * (L.PROJECT_NAME + 1)), ("description", "x" * (L.DESCRIPTION + 1)), ("owner_name", "x" * (L.OWNER_NAME + 1)),
    ("location", "x" * (L.LOCATION + 1)), ("floors", L.MAX_FLOORS + 1), ("length", L.MAX_DIM + 1), ("width", 0.5), ("height", L.MAX_HEIGHT + 0.1),
    ("wall_thickness", L.MAX_WALL + 0.1), ("budget", L.MAX_BUDGET + 1), ("built_up_area", L.MAX_AREA + 1),
]


@pytest.mark.parametrize("field,value", BAD_PROJECTS, ids=[f for f, _ in BAD_PROJECTS])
def test_project_values_over_the_limit_are_rejected(db_client, alice, field, value):
    body = copy.deepcopy(PROJECT) | {field: value}
    body.pop("rooms", None)
    r = db_client.post("/api/projects", json=body, headers=alice.headers)
    assert r.status_code == 422, r.text


def test_project_values_exactly_at_the_limit_are_accepted(db_client, alice):
    p = create(db_client, alice, name="x" * L.PROJECT_NAME, location="y" * L.LOCATION, floors=L.MAX_FLOORS, rooms=[],
               length=L.MAX_DIM, width=L.MAX_DIM, budget=L.MAX_BUDGET)
    assert len(p["name"]) == L.PROJECT_NAME


@pytest.mark.parametrize("field,value", [("windows", L.MAX_WINDOWS_PER_ROOM + 1), ("doors", L.MAX_DOORS_PER_ROOM + 1),
                                         ("name", "x" * (L.ROOM_NAME + 1)), ("length", L.MAX_ROOM_DIM + 1)])
def test_room_values_over_the_limit_are_rejected(db_client, alice, field, value):
    room = copy.deepcopy(ROOMS[0]) | {field: value}
    body = copy.deepcopy(PROJECT) | {"rooms": [room]}
    assert db_client.post("/api/projects", json=body, headers=alice.headers).status_code == 422


def test_absurd_prices_and_material_text_are_rejected(db_client, alice):
    m = db_client.get("/api/materials", headers=alice.headers).json()[0]
    r = db_client.post("/api/prices", json={"material_id": m["id"], "unit_price": L.MAX_UNIT_PRICE + 1}, headers=alice.headers)
    assert r.status_code == 422
    ok = db_client.post("/api/prices", json={"material_id": m["id"], "unit_price": L.MAX_UNIT_PRICE, "supplier": "s" * L.SUPPLIER}, headers=alice.headers)
    assert ok.status_code in (200, 201), ok.text
    body = {"estimate_key": "cement", "name": "n" * (L.MATERIAL_NAME + 1), "category": "c", "unit": "bag"}
    assert db_client.post("/api/materials", json=body, headers=alice.headers).status_code == 422


def test_estimate_settings_out_of_range_are_rejected(db_client, alice):
    p = create(db_client, alice)
    for body in ({"wastage": {"cement": L.MAX_WASTAGE_PCT + 1}}, {"wastage": {"cement": -1}}, {"assumptions": {"steel_kg_per_m3": 1e9}},
                 {"purchase_quantities": {"cement": L.MAX_EXTRA + 1}}):
        assert db_client.put(f"/api/projects/{p['id']}/config", json=body, headers=alice.headers).status_code == 422, body
    assert db_client.put(f"/api/projects/{p['id']}/config", json={"wastage": {"cement": L.MAX_WASTAGE_PCT}}, headers=alice.headers).status_code == 200
