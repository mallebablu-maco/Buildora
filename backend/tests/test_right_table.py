"""Every action on the website writes into the table it belongs to, and into no other.

The worry this answers: "owner data saved in the driver table". For each action we count the rows of EVERY table before and after
and require that exactly the expected tables changed, by exactly the expected amount. Where it matters we also look inside the
rows to see that the value typed into a box ended up in the right column of the right table, and nowhere else.
"""
from __future__ import annotations

import copy
import json
import pathlib
from types import SimpleNamespace

from app.services.estimation.layout import plan_signature
from tests.conftest import PROJECT, ROOMS, superuser
from tests.test_files_reports_dashboard import plan_png

TABLES = ["profiles", "projects", "project_rooms", "floor_plan_files", "materials", "material_price_records",
          "project_estimates", "estimate_items", "optimization_recommendations", "reports"]
SCENARIO = json.loads((pathlib.Path(__file__).parent / "fixtures" / "studio_payloads.json").read_text())["scenarios"][0]


def counts(pg_uri) -> dict[str, int]:
    with superuser(pg_uri) as c:
        return {t: c.execute(f"select count(*) from public.{t}").fetchone()[0] for t in TABLES}


def changed(before: dict, after: dict) -> dict[str, int]:
    return {t: after[t] - before[t] for t in TABLES if after[t] != before[t]}


def where_is(pg_uri, needle: str) -> set[str]:
    """Every table that contains `needle` anywhere in any column (the whole row as text is searched)."""
    found = set()
    with superuser(pg_uri) as c:
        for t in TABLES:
            if c.execute(f"select 1 from public.{t} x where x::text like %s limit 1", (f"%{needle}%",)).fetchone():
                found.add(t)
    return found


def test_each_action_touches_only_its_own_table(db_client, alice, pg_uri):
    h = alice.headers
    db_client.get("/api/profile", headers=h)  # the profile row is created on first use; start after that

    def step(action, expect: dict[str, int] | None = None, *, grows: set[str] | None = None):
        before = counts(pg_uri)
        r = action()
        assert r.status_code < 300, r.text[:400]
        diff = changed(before, counts(pg_uri))
        if expect is not None:
            assert diff == expect, f"expected only {expect}, but these tables changed: {diff}"
        if grows is not None:  # tables whose size depends on the calculation; every other table must stay the same
            assert set(diff) <= grows and all(v > 0 for v in diff.values()), diff
        return r.json() if r.content else None

    # Settings: name, default city, default wastage -> profiles only (an UPDATE: no table gains or loses rows)
    step(lambda: db_client.put("/api/profile", json={"full_name": "Alice Owner", "default_city": "Zebracity", "default_wastage": {"tiles": 9}}, headers=h), {})
    assert where_is(pg_uri, "Zebracity") == {"profiles"}

    # New Project with 3 rooms -> 1 row in projects, 3 in project_rooms
    body = copy.deepcopy(PROJECT) | {"name": "Driverhouse", "owner_name": "Ownerperson", "location": "Placeville", "rooms": copy.deepcopy(ROOMS)}
    body["rooms"][0]["name"] = "Roomzeta"
    p = step(lambda: db_client.post("/api/projects", json=body, headers=h), {"projects": 1, "project_rooms": 3})
    pid = p["id"]
    assert where_is(pg_uri, "Driverhouse") == {"projects"}  # the project name is in projects only
    assert where_is(pg_uri, "Ownerperson") == {"projects"}  # the owner box is a column of projects, not a person table
    assert where_is(pg_uri, "Roomzeta") == {"project_rooms"}  # a room name never lands in projects

    # Edit project -> projects only, no new rows
    step(lambda: db_client.put(f"/api/projects/{pid}", json=PROJECT | {"name": "Driverhouse renamed"}, headers=h), {})
    # Add / edit / delete one room -> project_rooms only
    room = step(lambda: db_client.post(f"/api/projects/{pid}/rooms", json=ROOMS[1] | {"name": "Extraroom"}, headers=h), {"project_rooms": 1})
    step(lambda: db_client.put(f"/api/projects/{pid}/rooms/{room['id']}", json=ROOMS[1] | {"name": "Extraroom two"}, headers=h), {})
    step(lambda: db_client.delete(f"/api/projects/{pid}/rooms/{room['id']}", headers=h), {"project_rooms": -1})

    # Estimation settings (wastage, assumptions, extras, planned purchases) -> columns of projects, no new rows anywhere
    step(lambda: db_client.put(f"/api/projects/{pid}/config", json={"wastage": {"cement": 4}, "purchase_quantities": {"cement": 99}}, headers=h), {})
    # Run the estimate -> the estimate tables only
    step(lambda: db_client.post(f"/api/projects/{pid}/estimate", headers=h), grows={"project_estimates", "estimate_items", "optimization_recommendations"})

    # Catalogue: add my own material with a first price -> 1 material + 1 price row
    mat = step(lambda: db_client.post("/api/materials", json={"estimate_key": "cement", "name": "Matcement", "category": "Cement", "unit": "bag (50 kg)",
                                                              "unit_price": 410, "supplier": "Supplierco", "location": "Pricetown"}, headers=h),
               {"materials": 1, "material_price_records": 1})
    assert where_is(pg_uri, "Matcement") == {"materials"}
    assert where_is(pg_uri, "Supplierco") == {"material_price_records"}  # supplier and location belong to the price, not the material
    assert where_is(pg_uri, "Pricetown") == {"material_price_records"}
    # Material Prices: my price for a shared sample material -> price records only; the shared material itself is untouched
    sample = next(m for m in db_client.get("/api/materials", headers=h).json() if m["is_sample"])
    price = step(lambda: db_client.post("/api/prices", json={"material_id": sample["id"], "unit_price": 7, "supplier": "Otherdealer"}, headers=h), {"material_price_records": 1})
    step(lambda: db_client.put(f"/api/prices/{price['id']}", json={"unit_price": 8, "supplier": "Otherdealer"}, headers=h), {})
    step(lambda: db_client.delete(f"/api/prices/{price['id']}", headers=h), {"material_price_records": -1})
    step(lambda: db_client.delete(f"/api/materials/{mat['id']}", headers=h), {"materials": -1, "material_price_records": -1})  # its price goes with it

    # 3D Studio "Save layout" -> the layout column of projects, no rows anywhere
    sp = db_client.post("/api/projects", json=SCENARIO["project"], headers=h).json()["id"]
    real = {old: r["id"] for old, r in zip(SCENARIO["room_ids"], db_client.put(f"/api/projects/{sp}/rooms", json={"rooms": SCENARIO["rooms"]}, headers=h).json())}
    text = json.dumps(SCENARIO["layouts"]["custom"])
    for old, new in sorted(real.items(), key=lambda kv: -len(kv[0])):
        text = text.replace(f'"{old}"', f'"{new}"')
    detail = db_client.get(f"/api/projects/{sp}", headers=h).json()
    layout = json.loads(text) | {"signature": plan_signature(SimpleNamespace(**detail), [SimpleNamespace(**r) for r in detail["rooms"]])}
    step(lambda: db_client.put(f"/api/projects/{sp}/layout", json=layout, headers=h), {})
    step(lambda: db_client.delete(f"/api/projects/{sp}/layout", headers=h), {})

    # Floor plan upload -> floor_plan_files only (the picture itself goes to Storage, not a table)
    fp = step(lambda: db_client.post(f"/api/projects/{pid}/floorplans", files={"file": ("Planfile.png", plan_png(), "image/png")}, headers=h), {"floor_plan_files": 1})
    assert where_is(pg_uri, "Planfile.png") == {"floor_plan_files"}
    step(lambda: db_client.delete(f"/api/floorplans/{fp['id']}", headers=h), {"floor_plan_files": -1})

    # Reports: generate -> one reports row (plus the estimate it is based on); delete -> reports only
    rep = step(lambda: db_client.post(f"/api/projects/{pid}/report", headers=h), grows={"reports", "project_estimates", "estimate_items", "optimization_recommendations"})
    step(lambda: db_client.delete(f"/api/reports/{rep['id']}", headers=h), {"reports": -1})


def test_every_row_points_at_a_parent_of_the_right_kind_and_owner(db_client, alice, bob, pg_uri):
    """After real use by two people, each child row belongs to a parent of the right table, owned by the same person."""
    for user in (alice, bob):
        p = db_client.post("/api/projects", json=copy.deepcopy(PROJECT) | {"rooms": copy.deepcopy(ROOMS)}, headers=user.headers).json()
        db_client.post(f"/api/projects/{p['id']}/report", headers=user.headers)
    with superuser(pg_uri) as c:
        problems = c.execute("""
            select 'room without its project or with another owner', count(*) from public.project_rooms r left join public.projects p on p.id = r.project_id where p.id is null or p.owner_id <> r.owner_id
            union all select 'estimate of another owner''s project', count(*) from public.project_estimates e join public.projects p on p.id = e.project_id where p.owner_id <> e.owner_id
            union all select 'estimate line of another owner''s estimate', count(*) from public.estimate_items i join public.project_estimates e on e.id = i.estimate_id where e.owner_id <> i.owner_id
            union all select 'report of another owner''s project', count(*) from public.reports r join public.projects p on p.id = r.project_id where p.owner_id <> r.owner_id
        """).fetchall()
    assert all(n == 0 for _, n in problems), problems
