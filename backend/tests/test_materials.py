"""The shared sample catalogue, a person's own materials and prices, CSV import, and how prices reach the estimate."""
from __future__ import annotations

import copy

import pytest

from tests.conftest import PROJECT, ROOMS, as_user, superuser


def samples(client, user):
    return [m for m in client.get("/api/materials", headers=user.headers).json() if m["is_sample"]]


def test_the_shared_sample_catalogue_is_visible_read_only_and_labelled(db_client, alice):
    ms = db_client.get("/api/materials", headers=alice.headers).json()
    assert len(ms) == 18 and all(m["is_sample"] and not m["editable"] and m["price_is_sample"] for m in ms)
    assert all(m["unit_price"] is not None for m in ms)
    assert {m["estimate_key"] for m in ms} >= {"cement", "sand", "aggregates", "steel", "bricks", "blocks", "tiles", "paint", "concrete"}
    cement = db_client.get("/api/materials?estimate_key=cement", headers=alice.headers).json()
    assert len(cement) == 3 and {m["estimate_key"] for m in cement} == {"cement"}


def test_samples_cannot_be_edited_or_deleted(db_client, alice):
    m = samples(db_client, alice)[0]
    body = {k: m[k] for k in ("estimate_key", "name", "category", "brand", "grade", "specification", "durability_notes", "unit")}
    assert db_client.put(f"/api/materials/{m['id']}", json=body | {"name": "hacked"}, headers=alice.headers).status_code == 403
    assert db_client.delete(f"/api/materials/{m['id']}", headers=alice.headers).status_code == 403


def test_a_person_can_add_edit_and_delete_their_own_material(db_client, alice, bob):
    body = {"estimate_key": "cement", "name": "My local cement", "category": "Cement & Binders", "unit": "bag (50 kg)", "unit_price": 455, "supplier": "Nair Traders", "location": "Pune"}
    created = db_client.post("/api/materials", json=body, headers=alice.headers)
    assert created.status_code == 201
    m = created.json()
    assert m["editable"] is True and m["unit_price"] == 455 and m["price_is_sample"] is False and m["supplier"] == "Nair Traders"
    # private: Bob does not see it
    assert "My local cement" not in {x["name"] for x in db_client.get("/api/materials", headers=bob.headers).json()}
    assert db_client.put(f"/api/materials/{m['id']}", json={k: body[k] for k in ("estimate_key", "name", "category", "unit")} | {"name": "x"}, headers=bob.headers).status_code == 404
    edited = db_client.put(f"/api/materials/{m['id']}", json={k: body[k] for k in ("estimate_key", "category", "unit")} | {"name": "Renamed"}, headers=alice.headers)
    assert edited.status_code == 200 and edited.json()["name"] == "Renamed" and edited.json()["unit_price"] == 455
    assert db_client.delete(f"/api/materials/{m['id']}", headers=alice.headers).status_code == 204
    assert "Renamed" not in {x["name"] for x in db_client.get("/api/materials", headers=alice.headers).json()}


MATERIAL_ABUSE = [("unknown estimate key", {"estimate_key": "gold"}), ("blank name", {"name": " "}), ("negative price", {"unit_price": -1}),
                  ("absurd price", {"unit_price": 1e15}), ("bad currency", {"currency": "rupees"}), ("long name", {"name": "x" * 161})]


@pytest.mark.parametrize("label,patch", MATERIAL_ABUSE, ids=[a[0] for a in MATERIAL_ABUSE])
def test_invalid_materials_are_rejected(db_client, alice, label, patch):
    body = {"estimate_key": "sand", "name": "Sand", "category": "Aggregates", "unit": "m³", "unit_price": 1} | patch
    assert db_client.post("/api/materials", json=body, headers=alice.headers).status_code == 422, label


def test_a_person_can_set_their_own_price_for_a_shared_material_without_changing_it_for_others(db_client, alice, bob):
    s = next(m for m in samples(db_client, alice) if m["estimate_key"] == "cement")
    r = db_client.post("/api/prices", json={"material_id": s["id"], "unit_price": 999, "supplier": "My supplier"}, headers=alice.headers)
    assert r.status_code == 201
    mine = next(m for m in db_client.get("/api/materials?estimate_key=cement", headers=alice.headers).json() if m["id"] == s["id"])
    theirs = next(m for m in db_client.get("/api/materials?estimate_key=cement", headers=bob.headers).json() if m["id"] == s["id"])
    assert mine["unit_price"] == 999 and mine["price_is_sample"] is False
    assert theirs["unit_price"] == s["unit_price"] and theirs["price_is_sample"] is True
    # edit then delete the own price: the sample price comes back
    pid = r.json()["id"]
    assert db_client.put(f"/api/prices/{pid}", json={"unit_price": 888, "supplier": "x", "location": "y"}, headers=alice.headers).json()["unit_price"] == 888
    assert db_client.put(f"/api/prices/{pid}", json={"unit_price": 1}, headers=bob.headers).status_code == 404
    assert db_client.delete(f"/api/prices/{pid}", headers=alice.headers).status_code == 204
    back = next(m for m in db_client.get("/api/materials?estimate_key=cement", headers=alice.headers).json() if m["id"] == s["id"])
    assert back["unit_price"] == s["unit_price"] and back["price_is_sample"] is True


def test_sample_prices_cannot_be_edited_directly(db_client, alice):
    pid = samples(db_client, alice)[0]["price_id"]
    assert db_client.put(f"/api/prices/{pid}", json={"unit_price": 1}, headers=alice.headers).status_code == 404
    assert db_client.delete(f"/api/prices/{pid}", headers=alice.headers).status_code == 404


def test_you_cannot_price_someone_elses_private_material(db_client, alice, bob):
    m = db_client.post("/api/materials", json={"estimate_key": "sand", "name": "Alice sand", "category": "Aggregates", "unit": "m³"}, headers=alice.headers).json()
    assert db_client.post("/api/prices", json={"material_id": m["id"], "unit_price": 1}, headers=bob.headers).status_code == 404


def test_prices_list_shows_own_and_shared_prices(db_client, alice, bob):
    s = samples(db_client, alice)[0]
    db_client.post("/api/prices", json={"material_id": s["id"], "unit_price": 5}, headers=alice.headers)
    mine = db_client.get(f"/api/prices?material_id={s['id']}", headers=alice.headers).json()
    assert len(mine) == 2 and len(db_client.get(f"/api/prices?material_id={s['id']}", headers=bob.headers).json()) == 1


CSV = "estimate_key,name,category,brand,grade,unit,unit_price,supplier,location\ncement,Local OPC,Cement,Acme,OPC 53,bag,410,Nair,Pune\nbogus,Bad,x,,,bag,1,,\nsand,Pit sand,Aggregates,,,m³,-5,,\nsteel,Rebar,Reinforcement,,Fe 500,kg,66,,\n"


def test_csv_import_creates_valid_rows_and_reports_the_bad_ones(db_client, alice):
    r = db_client.post("/api/prices/import", files={"file": ("prices.csv", CSV.encode(), "text/csv")}, headers=alice.headers)
    assert r.status_code == 200
    out = r.json()
    assert out["created"] == 2 and [e["line"] for e in out["errors"]] == [3, 4]
    own = [m for m in db_client.get("/api/materials", headers=alice.headers).json() if m["editable"]]
    assert {m["name"] for m in own} == {"Local OPC", "Rebar"} and next(m for m in own if m["name"] == "Rebar")["unit_price"] == 66


def test_csv_import_rejects_wrong_files(db_client, alice):
    assert db_client.post("/api/prices/import", files={"file": ("p.csv", b"a,b\n1,2\n", "text/csv")}, headers=alice.headers).status_code == 422
    assert db_client.post("/api/prices/import", files={"file": ("p.csv", b"\xff\xfe\x00bad", "text/csv")}, headers=alice.headers).status_code == 422
    assert db_client.post("/api/prices/import", files={"file": ("p.csv", b"x" * 1_000_100, "text/csv")}, headers=alice.headers).status_code == 413


def make(client, user):
    r = client.post("/api/projects", json=copy.deepcopy(PROJECT) | {"rooms": copy.deepcopy(ROOMS)}, headers=user.headers)
    return r.json()


def test_the_chosen_material_and_its_price_drive_the_estimate(db_client, alice):
    p = make(db_client, alice)
    base = db_client.post(f"/api/projects/{p['id']}/estimate", headers=alice.headers).json()
    tiles = next(i for i in base["items"] if i["key"] == "tiles")
    alts = base["alternatives"]["tiles"]
    assert len(alts) == 2
    other = next(a for a in alts if a["id"] != tiles["material_id"])
    db_client.put(f"/api/projects/{p['id']}/config", json={"material_selections": {"tiles": other["id"]}}, headers=alice.headers)
    changed = db_client.post(f"/api/projects/{p['id']}/estimate", headers=alice.headers).json()
    new = next(i for i in changed["items"] if i["key"] == "tiles")
    assert new["material_id"] == other["id"] and new["unit_price"] == other["unit_price"]
    assert new["cost"] == pytest.approx(new["gross_quantity"] * other["unit_price"])


def test_a_missing_price_is_flagged_not_treated_as_zero(db_client, alice):
    own = db_client.post("/api/materials", json={"estimate_key": "paint", "name": "Unpriced paint", "category": "Paint", "unit": "litre"}, headers=alice.headers).json()
    p = make(db_client, alice)
    db_client.put(f"/api/projects/{p['id']}/config", json={"material_selections": {"paint": own["id"]}}, headers=alice.headers)
    e = db_client.post(f"/api/projects/{p['id']}/estimate", headers=alice.headers).json()
    assert "paint" in e["summary"]["missing_price_keys"] and e["summary"]["complete"] is False
    assert next(i for i in e["items"] if i["key"] == "paint")["unit_price"] is None


def test_deleting_a_material_removes_it_from_project_choices(db_client, alice):
    own = db_client.post("/api/materials", json={"estimate_key": "sand", "name": "Temp sand", "category": "Aggregates", "unit": "m³", "unit_price": 9}, headers=alice.headers).json()
    p = make(db_client, alice)
    db_client.put(f"/api/projects/{p['id']}/config", json={"material_selections": {"sand": own["id"]}}, headers=alice.headers)
    db_client.delete(f"/api/materials/{own['id']}", headers=alice.headers)
    assert db_client.get(f"/api/projects/{p['id']}", headers=alice.headers).json()["material_selections"] == {}


def test_database_rules_for_the_catalogue(db_client, alice, bob, pg_uri):
    s = samples(db_client, alice)[0]
    mine = db_client.post("/api/materials", json={"estimate_key": "sand", "name": "A private", "category": "Aggregates", "unit": "m³", "unit_price": 3}, headers=alice.headers).json()
    import psycopg

    with as_user(pg_uri, bob.id) as c:
        names = {r[0] for r in c.execute("select name from materials")}
        assert "A private" not in names and len(names) == 18  # the shared samples, not Alice's private one
        assert c.execute("update materials set name = 'x' where owner_id is null").rowcount == 0  # samples are read-only
        assert c.execute("delete from materials where owner_id is null").rowcount == 0
    with as_user(pg_uri, bob.id) as c, pytest.raises(psycopg.errors.InsufficientPrivilege):  # cannot hang a price on Alice's private material
        c.execute("insert into material_price_records (material_id, owner_id, unit_price) values (%s, %s, 1)", (mine["id"], bob.id))
    with as_user(pg_uri, bob.id) as c:  # but may add their own price for a shared sample
        c.execute("insert into material_price_records (material_id, owner_id, unit_price) values (%s, %s, 99)", (s["id"], bob.id))
    with as_user(pg_uri, None, role="anon") as c, pytest.raises(psycopg.errors.InsufficientPrivilege):
        c.execute("select * from materials")
    with superuser(pg_uri) as c:
        assert c.execute("select count(*) from materials where owner_id is null").fetchone()[0] == 18
