"""The database protects itself: Row Level Security, constraints and storage rules, tested against the REAL migration SQL."""
from __future__ import annotations

import copy
import uuid

import psycopg
import pytest

from tests.conftest import MIGRATIONS, PROJECT, ROOMS, as_user, superuser


def make_project(client, user, name="P"):
    r = client.post("/api/projects", json=copy.deepcopy(PROJECT) | {"name": name, "rooms": copy.deepcopy(ROOMS)}, headers=user.headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_the_migration_can_be_run_twice(pg_uri):
    """Safe to run again: pasting it into the SQL editor twice must not fail or duplicate anything."""
    with superuser(pg_uri) as c:
        for m in MIGRATIONS:
            c.execute(m.read_text())
        assert c.execute("select count(*) from storage.buckets where id in ('floorplans','reports')").fetchone()[0] == 2
        assert c.execute("select count(*) from pg_policies where schemaname='public' and tablename='project_rooms'").fetchone()[0] == 1


def test_row_level_security_is_on_for_every_table(pg_uri):
    with superuser(pg_uri) as c:
        rows = c.execute("select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'").fetchall()
    assert {r[0] for r in rows} >= {"profiles", "projects", "project_rooms"}
    assert all(on for _, on in rows), rows


def test_each_user_sees_only_their_own_rows(db_client, alice, bob, pg_uri):
    pa, pb = make_project(db_client, alice, "A house"), make_project(db_client, bob, "B house")
    with as_user(pg_uri, alice.id) as c:
        assert {r[0] for r in c.execute("select name from projects")} == {"A house"}
        assert c.execute("select count(*) from project_rooms").fetchone()[0] == 3
        assert c.execute("select count(*) from projects where id = %s", (pb,)).fetchone()[0] == 0
    with as_user(pg_uri, bob.id) as c:
        assert {r[0] for r in c.execute("select name from projects")} == {"B house"}
        assert c.execute("select count(*) from projects where id = %s", (pa,)).fetchone()[0] == 0


def test_a_user_cannot_modify_or_delete_someone_elses_rows(db_client, alice, bob, pg_uri):
    pb = make_project(db_client, bob, "B only")
    with as_user(pg_uri, alice.id) as c:
        assert c.execute("update projects set name = 'hacked' where id = %s", (pb,)).rowcount == 0
        assert c.execute("delete from projects where id = %s", (pb,)).rowcount == 0
        assert c.execute("update project_rooms set name = 'hacked' where project_id = %s", (pb,)).rowcount == 0
        assert c.execute("delete from project_rooms where project_id = %s", (pb,)).rowcount == 0
    assert db_client.get(f"/api/projects/{pb}", headers=bob.headers).json()["name"] == "B only"


def test_a_user_cannot_attach_rooms_to_someone_elses_project_or_forge_an_owner(db_client, alice, bob, pg_uri):
    pb = make_project(db_client, bob)
    with as_user(pg_uri, alice.id) as c, pytest.raises(psycopg.errors.InsufficientPrivilege):
        c.execute("insert into project_rooms (project_id, name, length, width) values (%s, 'sneaky', 3, 3)", (pb,))
    with as_user(pg_uri, alice.id) as c, pytest.raises(psycopg.errors.InsufficientPrivilege):
        c.execute("insert into projects (owner_id, name, length, width) values (%s, 'forged', 5, 5)", (bob.id,))
    with as_user(pg_uri, alice.id) as c, pytest.raises(psycopg.errors.InsufficientPrivilege):
        # a project the user owns, but a room claiming to belong to someone else
        c.execute("insert into projects (id, name, length, width) values (%s, 'mine', 5, 5)", (str(uuid.uuid4()),))
        c.execute("insert into project_rooms (project_id, owner_id, name, length, width) select id, %s, 'x', 3, 3 from projects limit 1", (bob.id,))


def test_a_user_cannot_move_their_own_project_to_someone_else(db_client, alice, bob, pg_uri):
    pa = make_project(db_client, alice)
    with as_user(pg_uri, alice.id) as c, pytest.raises(psycopg.errors.InsufficientPrivilege):
        c.execute("update projects set owner_id = %s where id = %s", (bob.id, pa))


@pytest.mark.parametrize("table", ["projects", "project_rooms", "profiles"])
def test_anonymous_visitors_have_no_access_at_all(db_client, pg_uri, table):
    with as_user(pg_uri, None, role="anon") as c, pytest.raises(psycopg.errors.InsufficientPrivilege):
        c.execute(f"select * from {table}")


def test_signed_in_users_cannot_truncate_or_alter(db_client, alice, pg_uri):
    with as_user(pg_uri, alice.id) as c, pytest.raises(psycopg.errors.InsufficientPrivilege):
        c.execute("truncate project_rooms")


def test_api_queries_really_run_as_the_signed_in_user(db_client, alice, bob):
    """Python's ownership check is not the only guard: even without it, the database hides other users' rows."""
    from sqlalchemy import text
    from sqlalchemy.orm import Session

    from app.core.db import get_engine, rls_claims
    from app.core.auth import Identity
    from app.models import Project

    pa, pb = make_project(db_client, alice), make_project(db_client, bob)
    ident = lambda u: Identity(id=u.id, email=u.email)  # noqa: E731
    with Session(get_engine()) as db:
        db.info["rls_claims"] = rls_claims(ident(alice))
        assert db.execute(text("select current_user")).scalar() == "authenticated"
        assert db.get(Project, uuid.UUID(pb)) is None and db.get(Project, uuid.UUID(pa)) is not None
        db.commit()  # a NEW transaction must be bound again
        assert db.execute(text("select current_user")).scalar() == "authenticated"
        assert db.execute(text("select count(*) from projects")).scalar() == 1
    with Session(get_engine()) as db:  # no claims: the API's own maintenance role
        assert db.execute(text("select current_user")).scalar() != "authenticated"


def test_a_pooled_connection_never_carries_one_users_identity_to_the_next(db_client, alice, bob):
    """The pool reuses connections. SET LOCAL must end with the transaction, or user B could inherit user A's identity."""
    from sqlalchemy import text
    from sqlalchemy.orm import Session

    from app.core.auth import Identity
    from app.core.db import get_engine, rls_claims

    make_project(db_client, alice, "A"), make_project(db_client, bob, "B")
    seen = []
    for user in (alice, bob, alice, bob, alice):
        with Session(get_engine()) as db:
            db.info["rls_claims"] = rls_claims(Identity(id=user.id, email=user.email))
            seen.append(sorted(r[0] for r in db.execute(text("select name from projects"))))
    assert seen == [["A"], ["B"], ["A"], ["B"], ["A"]]


def test_the_database_enforces_its_own_rules_even_for_the_server(pg_uri):
    bad = [
        "insert into projects (owner_id, name, length, width) values ('{u}', 'x', 0, 5)",
        "insert into projects (owner_id, name, length, width, floors) values ('{u}', 'x', 5, 5, 0)",
        "insert into projects (owner_id, name, length, width) values ('{u}', '   ', 5, 5)",
        "insert into projects (owner_id, name, length, width, building_type) values ('{u}', 'x', 5, 5, 'castle')",
        "insert into projects (owner_id, name, length, width, currency) values ('{u}', 'x', 5, 5, 'rupees')",
        "insert into projects (owner_id, name, length, width, budget) values ('{u}', 'x', 5, 5, -1)",
    ]
    uid = str(uuid.uuid4())
    with superuser(pg_uri) as c:
        c.execute("insert into auth.users (id, email) values (%s, 'rules@example.com')", (uid,))
        for sql in bad:
            with pytest.raises(psycopg.errors.CheckViolation):
                c.execute(sql.format(u=uid))
        c.execute("delete from auth.users where id = %s", (uid,))


def test_deleting_a_user_removes_all_of_their_data(db_client, alice, pg_uri):
    from tests.conftest import superuser as su

    db_client.get("/api/profile", headers=alice.headers)  # creates the profile
    make_project(db_client, alice)
    with su(pg_uri) as c:
        c.execute("delete from auth.users where id = %s", (alice.id,))
        assert [c.execute(f"select count(*) from {t}").fetchone()[0] for t in ("projects", "project_rooms", "profiles")] == [0, 0, 0]


def test_updated_at_is_maintained_by_the_database(db_client, alice, pg_uri):
    pid = make_project(db_client, alice)
    with superuser(pg_uri) as c:
        before = c.execute("select updated_at from projects where id = %s", (pid,)).fetchone()[0]
        c.execute("update projects set description = 'changed' where id = %s", (pid,))
        after = c.execute("select updated_at from projects where id = %s", (pid,)).fetchone()[0]
    assert after > before


def test_storage_policy_confines_users_to_their_own_folder(db_env, alice, bob, pg_uri):
    with as_user(pg_uri, alice.id) as c:
        c.execute("insert into storage.objects (bucket_id, name) values ('floorplans', %s)", (f"{alice.id}/plan.png",))
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("insert into storage.objects (bucket_id, name) values ('floorplans', %s)", (f"{bob.id}/plan.png",))
    with superuser(pg_uri) as c:
        c.execute("insert into storage.objects (bucket_id, name) values ('reports', %s)", (f"{alice.id}/r.pdf",))
    with as_user(pg_uri, bob.id) as c:
        assert c.execute("select count(*) from storage.objects").fetchone()[0] == 0  # Bob sees none of Alice's files
    with as_user(pg_uri, alice.id) as c:
        assert c.execute("select count(*) from storage.objects").fetchone()[0] == 1
    with superuser(pg_uri) as c:
        assert {r[0] for r in c.execute("select id from storage.buckets where public is false")} >= {"floorplans", "reports"}
