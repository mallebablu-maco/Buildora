"""The admin website's API: only Admins get in (checked by the API AND by the database), statistics are right, and market prices
reach every user while each user's own price still wins for them."""
from __future__ import annotations

import copy

import psycopg
import pytest

from tests.conftest import PROJECT, ROOMS, as_user, superuser

ADMIN_GETS = ["/api/admin/me", "/api/admin/overview", "/api/admin/users", "/api/admin/materials"]


def shared(client, user, key=None):
    return [m for m in client.get("/api/admin/materials", headers=user.headers).json() if key is None or m["estimate_key"] == key]


# ---------------------------------------------------------------------------------------------------- who gets in
@pytest.mark.parametrize("path", ADMIN_GETS)
def test_ordinary_users_are_refused_and_strangers_must_log_in(db_client, alice, path):
    assert db_client.get(path, headers=alice.headers).status_code == 403
    assert db_client.get(path).status_code == 401


def test_ordinary_users_cannot_change_the_shared_catalogue_through_the_admin_api(db_client, alice, admin):
    m = shared(db_client, admin)[0]
    for method, path, body in [("put", f"/api/admin/materials/{m['id']}/price", {"unit_price": 1}),
                               ("put", f"/api/admin/materials/{m['id']}/hidden", {"hidden": True}),
                               ("post", "/api/admin/materials", {"estimate_key": "cement", "name": "X", "category": "C", "unit": "bag", "unit_price": 1})]:
        assert getattr(db_client, method)(path, json=body, headers=alice.headers).status_code == 403
    assert shared(db_client, admin)[0]["market_price"] == m["market_price"]


def test_the_database_itself_refuses_non_admins_even_without_the_api(db_env, alice, admin):
    """Second lock: the report functions and the shared-catalogue policies check is_admin() inside PostgreSQL."""
    with as_user(db_env, alice.id) as c:
        for fn in ("admin_overview()", "admin_users()"):
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                c.execute(f"select * from public.{fn}")
            c.rollback()
            c.execute("set local role authenticated")
            c.execute("select set_config('request.jwt.claims', %s, true)", (f'{{"sub": "{alice.id}", "role": "authenticated"}}',))
    with as_user(db_env, alice.id) as c:
        with pytest.raises(psycopg.errors.InsufficientPrivilege):  # RLS: a shared row (owner_id null) cannot be added by a user
            c.execute("insert into public.materials (owner_id, estimate_key, name, category, unit) values (null, 'cement', 'Fake', 'C', 'bag')")
    with as_user(db_env, alice.id) as c:  # and an update of a shared price simply matches no rows
        n = c.execute("update public.material_price_records set unit_price = 1 where owner_id is null").rowcount
        assert n == 0
    with as_user(db_env, admin.id, admin=True) as c:
        assert c.execute("select public.admin_overview() ->> 'users_total'").fetchone()[0] == "2"
        c.execute("insert into public.materials (owner_id, estimate_key, name, category, unit) values (null, 'cement', 'Admin cement', 'C', 'bag')")
        assert c.execute("update public.material_price_records set unit_price = unit_price where owner_id is null").rowcount > 0
    with as_user(db_env, admin.id, admin=True) as c:  # nobody, not even an Admin, deletes shared materials (they are hidden instead)
        assert c.execute("delete from public.materials where owner_id is null").rowcount == 0


# ---------------------------------------------------------------------------------------------------- statistics
def test_overview_counts_roles_sign_in_methods_and_activity(db_client, make_user, admin):
    alice = make_user("alice@example.com", "Alice", persona="homeowner")
    make_user("bob@example.com", "Bob", persona="contractor")
    make_user("cara@example.com", "Cara", persona="contractor", provider="google")
    make_user("dev@example.com", "Dev", provider="google")  # signed up with Google: no role chosen
    db_client.post("/api/projects", json=copy.deepcopy(PROJECT) | {"rooms": copy.deepcopy(ROOMS)}, headers=alice.headers)
    o = db_client.get("/api/admin/overview", headers=admin.headers).json()
    assert (o["users_total"], o["homeowners"], o["contractors"], o["no_role"]) == (5, 1, 2, 2)  # the admin has no role either
    assert o["by_provider"] == {"email": 3, "google": 2}
    assert o["new_7d"] == o["new_30d"] == o["active_7d"] == o["active_30d"] == 5
    assert o["projects"] == 1
    assert len(o["signups_per_day"]) == 30 and o["signups_per_day"][-1]["count"] == 5


def test_users_list_shows_role_method_and_projects_but_no_secrets(db_client, make_user, admin):
    alice = make_user("alice@example.com", "Alice", persona="homeowner")
    db_client.post("/api/projects", json=copy.deepcopy(PROJECT), headers=alice.headers)
    rows = {u["email"]: u for u in db_client.get("/api/admin/users", headers=admin.headers).json()}
    a = rows["alice@example.com"]
    assert (a["full_name"], a["persona"], a["providers"], a["projects"], a["is_admin"], a["email_confirmed"]) == ("Alice", "homeowner", ["email"], 1, False, True)
    assert rows["owner@example.com"]["is_admin"] is True
    assert not {"password", "encrypted_password", "token"} & set(a)


# ---------------------------------------------------------------------------------------------------- market prices and materials
def test_a_market_price_reaches_every_user_but_each_users_own_price_still_wins(db_client, alice, bob, admin):
    cement = shared(db_client, admin, "cement")[0]
    assert cement["price_is_sample"] is True
    mine = db_client.post("/api/prices", json={"material_id": cement["id"], "unit_price": 399}, headers=bob.headers)
    assert mine.status_code in (200, 201)
    r = db_client.put(f"/api/admin/materials/{cement['id']}/price", json={"unit_price": 455, "supplier": "Market survey", "location": "Hyderabad"}, headers=admin.headers)
    assert r.status_code == 200 and r.json()["market_price"] == 455 and r.json()["price_is_sample"] is False
    seen = {m["id"]: m for m in db_client.get("/api/materials", headers=alice.headers).json()}[cement["id"]]
    assert (seen["unit_price"], seen["price_source"], seen["price_is_sample"]) == (455, "market", False)
    bobs = {m["id"]: m for m in db_client.get("/api/materials", headers=bob.headers).json()}[cement["id"]]
    assert (bobs["unit_price"], bobs["price_source"]) == (399, "own")  # Bob's dealer price is untouched
    assert (bobs["market_price"], bobs["market_price_is_sample"]) == (455, False)  # ...and he still sees the market price next to it


def test_hiding_a_material_takes_it_out_of_the_catalogue_and_estimates_but_never_the_last_of_its_kind(db_client, alice, admin):
    cements = shared(db_client, admin, "cement")
    assert len(cements) >= 2
    r = db_client.put(f"/api/admin/materials/{cements[0]['id']}/hidden", json={"hidden": True}, headers=admin.headers)
    assert r.status_code == 200 and r.json()["is_hidden"] is True
    ids = {m["id"] for m in db_client.get("/api/materials", headers=alice.headers).json()}
    assert cements[0]["id"] not in ids and cements[1]["id"] in ids
    p = db_client.post("/api/projects", json=copy.deepcopy(PROJECT), headers=alice.headers).json()
    est = db_client.post(f"/api/projects/{p['id']}/estimate", headers=alice.headers).json()
    assert cements[0]["id"] not in {a["id"] for a in est["alternatives"]["cement"]}
    for c in cements[1:-1]:
        db_client.put(f"/api/admin/materials/{c['id']}/hidden", json={"hidden": True}, headers=admin.headers)
    last = db_client.put(f"/api/admin/materials/{cements[-1]['id']}/hidden", json={"hidden": True}, headers=admin.headers)
    assert last.status_code == 409  # estimates would lose their cement price
    assert db_client.put(f"/api/admin/materials/{cements[0]['id']}/hidden", json={"hidden": False}, headers=admin.headers).json()["is_hidden"] is False


def test_admin_adds_and_edits_a_shared_material_with_the_same_input_rules(db_client, alice, admin):
    body = {"estimate_key": "cement", "name": "UltraTech OPC 53", "category": "Cement & Binders", "brand": "UltraTech", "grade": "OPC 53", "unit": "bag (50 kg)", "unit_price": 470}
    r = db_client.post("/api/admin/materials", json=body, headers=admin.headers)
    assert r.status_code == 201, r.text
    new = r.json()
    users_view = {m["id"]: m for m in db_client.get("/api/materials", headers=alice.headers).json()}
    assert users_view[new["id"]]["unit_price"] == 470 and users_view[new["id"]]["price_source"] == "market"
    assert users_view[new["id"]]["editable"] is False  # users still cannot edit it
    edited = db_client.put(f"/api/admin/materials/{new['id']}", json={k: body[k] for k in ("estimate_key", "name", "category", "brand", "grade", "unit")} | {"name": "UltraTech OPC 53 Premium"}, headers=admin.headers)
    assert edited.json()["name"] == "UltraTech OPC 53 Premium"
    assert db_client.post("/api/admin/materials", json=body | {"name": "Bad <name>"}, headers=admin.headers).status_code == 422
    assert db_client.post("/api/admin/materials", json=body | {"unit_price": 10_000_001}, headers=admin.headers).status_code == 422


def test_admin_cannot_touch_a_users_private_material(db_client, alice, admin):
    own = db_client.post("/api/materials", json={"estimate_key": "cement", "name": "My cement", "category": "C", "unit": "bag (50 kg)", "unit_price": 1}, headers=alice.headers).json()
    assert db_client.put(f"/api/admin/materials/{own['id']}/price", json={"unit_price": 2}, headers=admin.headers).status_code == 404
    assert own["id"] not in {m["id"] for m in shared(db_client, admin)}


def test_csv_import_updates_market_prices_by_name_and_reports_bad_rows(db_client, admin):
    names = [m["name"] for m in shared(db_client, admin)[:2]]
    csv_text = f"name,unit_price,supplier\n{names[0]},\"1,234\",Survey\n{names[1]},abc,\nNo such thing,10,\n"
    r = db_client.post("/api/admin/prices/import", files={"file": ("p.csv", csv_text.encode(), "text/csv")}, headers=admin.headers)
    assert r.status_code == 200 and r.json()["updated"] == 1 and [e["line"] for e in r.json()["errors"]] == [3, 4]
    assert {m["name"]: m for m in shared(db_client, admin)}[names[0]]["market_price"] == 1234
