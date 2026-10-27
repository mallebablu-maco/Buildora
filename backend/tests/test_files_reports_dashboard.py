"""Floor plan uploads and room detection, PDF reports, the dashboard and the demo project, plus their database rules."""
from __future__ import annotations

import base64
import copy
import io

import psycopg
import pytest
from PIL import Image, ImageDraw

from app.services.storage import MemoryStorage
from tests.conftest import PROJECT, ROOMS, as_user, superuser

PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"


def plan_png(fmt="PNG") -> bytes:
    """A clean plan: an outer wall and one partition that closes two rooms."""
    im = Image.new("RGB", (400, 300), "white")
    d = ImageDraw.Draw(im)
    d.rectangle((20, 20, 380, 280), outline="black", width=8)
    d.line((200, 20, 200, 280), fill="black", width=8)
    out = io.BytesIO()
    im.save(out, fmt)
    return out.getvalue()


def make(client, user, **over):
    r = client.post("/api/projects", json=copy.deepcopy(PROJECT) | {"rooms": copy.deepcopy(ROOMS)} | over, headers=user.headers)
    assert r.status_code == 201, r.text
    return r.json()


def upload(client, user, pid, data=None, name="plan.png", ctype="image/png"):
    return client.post(f"/api/projects/{pid}/floorplans", files={"file": (name, data if data is not None else plan_png(), ctype)}, headers=user.headers)


# ---------------------------------------------------------------------------------------------------- floor plans
def test_a_floor_plan_is_uploaded_listed_and_stored_in_the_users_own_folder(db_client, alice):
    p = make(db_client, alice)
    r = upload(db_client, alice, p["id"])
    assert r.status_code == 201, r.text
    fp = r.json()
    assert (fp["width_px"], fp["height_px"], fp["content_type"], fp["scale_m_per_px"]) == (400, 300, "image/png", None)
    assert any(k.startswith(f"floorplans/{alice.id}/") for k in MemoryStorage.files)
    assert [f["id"] for f in db_client.get(f"/api/projects/{p['id']}", headers=alice.headers).json()["floorplans"]] == [fp["id"]]
    assert [f["id"] for f in db_client.get(f"/api/projects/{p['id']}/floorplans", headers=alice.headers).json()] == [fp["id"]]
    got = db_client.get(f"/api/floorplans/{fp['id']}/file", headers=alice.headers)
    assert got.status_code == 200 and got.content == plan_png() and got.headers["content-type"] == "image/png"
    assert got.headers["x-content-type-options"] == "nosniff"


def test_jpeg_and_pdf_plans_are_accepted(db_client, alice):
    p = make(db_client, alice)
    assert upload(db_client, alice, p["id"], plan_png("JPEG"), "plan.jpg", "image/jpeg").json()["content_type"] == "image/jpeg"
    pdf = upload(db_client, alice, p["id"], PDF, "plan.pdf", "application/pdf")
    assert pdf.status_code == 201 and pdf.json()["width_px"] is None


BAD_UPLOADS = [
    ("a text file", b"hello", "notes.txt", "text/plain", 422),
    ("a PNG pretending to be a JPG", plan_png(), "plan.jpg", "image/jpeg", 422),
    ("an empty file", b"", "plan.png", "image/png", 422),
    ("garbage named .png", b"not an image at all", "plan.png", "image/png", 422),
    ("a fake PDF", b"MZ not a pdf", "plan.pdf", "application/pdf", 422),
    ("a script", b"<script>alert(1)</script>", "x.html", "text/html", 422),
]


@pytest.mark.parametrize("label,data,name,ctype,code", BAD_UPLOADS, ids=[b[0] for b in BAD_UPLOADS])
def test_bad_uploads_are_refused_and_nothing_is_stored(db_client, alice, label, data, name, ctype, code):
    p = make(db_client, alice)
    assert upload(db_client, alice, p["id"], data, name, ctype).status_code == code, label
    assert MemoryStorage.files == {} and db_client.get(f"/api/projects/{p['id']}/floorplans", headers=alice.headers).json() == []


def test_files_over_the_size_limit_are_refused(db_client, alice, app_env):
    from app.core.config import get_settings

    p = make(db_client, alice)
    app_env.setenv("MAX_UPLOAD_MB", "0")
    get_settings.cache_clear()
    assert upload(db_client, alice, p["id"]).status_code == 413 and MemoryStorage.files == {}


def test_scale_calibration(db_client, alice):
    p = make(db_client, alice)
    fid = upload(db_client, alice, p["id"]).json()["id"]
    r = db_client.put(f"/api/floorplans/{fid}/calibration", json={"x1": 20, "y1": 20, "x2": 380, "y2": 20, "real_length_m": 12}, headers=alice.headers)
    assert r.status_code == 200 and r.json()["scale_m_per_px"] == pytest.approx(12 / 360)
    for bad in ({"x1": -5, "y1": 20, "x2": 380, "y2": 20, "real_length_m": 12}, {"x1": 20, "y1": 20, "x2": 900, "y2": 20, "real_length_m": 12},
                {"x1": 20, "y1": 20, "x2": 21, "y2": 20, "real_length_m": 12}, {"x1": 20, "y1": 20, "x2": 380, "y2": 20, "real_length_m": 0}):
        assert db_client.put(f"/api/floorplans/{fid}/calibration", json=bad, headers=alice.headers).status_code == 422, bad


def test_pdf_plans_cannot_be_calibrated_or_analysed(db_client, alice):
    p = make(db_client, alice)
    fid = upload(db_client, alice, p["id"], PDF, "plan.pdf", "application/pdf").json()["id"]
    assert db_client.put(f"/api/floorplans/{fid}/calibration", json={"x1": 0, "y1": 0, "x2": 5, "y2": 5, "real_length_m": 3}, headers=alice.headers).status_code == 422
    assert db_client.post(f"/api/floorplans/{fid}/detect-rooms", headers=alice.headers).status_code == 422
    assert db_client.post(f"/api/floorplans/{fid}/analyze", headers=alice.headers).status_code == 422


def test_room_detection_suggests_rooms_and_is_explicit_that_they_are_only_suggestions(db_client, alice):
    p = make(db_client, alice)
    fid = upload(db_client, alice, p["id"]).json()["id"]
    r = db_client.post(f"/api/floorplans/{fid}/detect-rooms", headers=alice.headers)
    assert r.status_code == 200, r.text
    out = r.json()
    assert len(out["rooms"]) == 2 and "suggestions only" in out["disclaimer"] and out["scale_m_per_px"] is None
    assert base64.b64decode(out["overlay_png_base64"])[:4] == b"\x89PNG"
    for room in out["rooms"]:
        assert room["w"] > 100 and room["h"] > 200 and room["rectangular"] is True
    # nothing was created from the suggestion
    assert db_client.get(f"/api/projects/{p['id']}", headers=alice.headers).json()["room_count"] == 3


def test_analysis_returns_an_overlay(db_client, alice):
    p = make(db_client, alice)
    fid = upload(db_client, alice, p["id"]).json()["id"]
    out = db_client.post(f"/api/floorplans/{fid}/analyze", headers=alice.headers).json()
    assert out["contour_count"] >= 1 and base64.b64decode(out["overlay_png_base64"])[:4] == b"\x89PNG"


def test_deleting_a_floor_plan_removes_the_record_and_the_file(db_client, alice):
    p = make(db_client, alice)
    fid = upload(db_client, alice, p["id"]).json()["id"]
    assert db_client.delete(f"/api/floorplans/{fid}", headers=alice.headers).status_code == 204
    assert db_client.get(f"/api/floorplans/{fid}/file", headers=alice.headers).status_code == 404
    assert MemoryStorage.files == {}


def test_a_missing_stored_file_is_explained_not_a_crash(db_client, alice):
    p = make(db_client, alice)
    fid = upload(db_client, alice, p["id"]).json()["id"]
    MemoryStorage.files.clear()
    r = db_client.get(f"/api/floorplans/{fid}/file", headers=alice.headers)
    assert r.status_code == 404 and "upload it again" in r.json()["detail"]


def test_other_people_cannot_see_or_change_a_floor_plan(db_client, alice, bob):
    p = make(db_client, alice)
    fid = upload(db_client, alice, p["id"]).json()["id"]
    cal = {"x1": 20, "y1": 20, "x2": 380, "y2": 20, "real_length_m": 12}
    assert upload(db_client, bob, p["id"]).status_code == 404
    assert db_client.get(f"/api/projects/{p['id']}/floorplans", headers=bob.headers).status_code == 404
    assert db_client.get(f"/api/floorplans/{fid}/file", headers=bob.headers).status_code == 404
    assert db_client.put(f"/api/floorplans/{fid}/calibration", json=cal, headers=bob.headers).status_code == 404
    assert db_client.post(f"/api/floorplans/{fid}/detect-rooms", headers=bob.headers).status_code == 404
    assert db_client.post(f"/api/floorplans/{fid}/analyze", headers=bob.headers).status_code == 404
    assert db_client.delete(f"/api/floorplans/{fid}", headers=bob.headers).status_code == 404
    assert db_client.get(f"/api/floorplans/{fid}/file", headers=alice.headers).status_code == 200


def test_a_stored_file_cannot_be_reached_through_another_users_folder(db_client, alice, bob):
    """Storage keys are server-made names; the user id of the folder always comes from the verified token."""
    p = make(db_client, alice)
    upload(db_client, alice, p["id"])
    storage = MemoryStorage("floorplans", bob.id)
    with pytest.raises(ValueError):
        storage.read("../" + alice.id + "/x.png")
    assert all(k.startswith(f"floorplans/{alice.id}/") for k in MemoryStorage.files)


# ---------------------------------------------------------------------------------------------------- reports
def test_a_report_is_a_real_pdf_stored_in_the_users_folder(db_client, alice):
    p = make(db_client, alice)
    r = db_client.post(f"/api/projects/{p['id']}/report", headers=alice.headers)
    assert r.status_code == 201, r.text
    rep = r.json()
    assert rep["file_name"].startswith("Buildora_Sample_G_1_Residence_") and rep["file_name"].endswith(".pdf")
    assert rep["size_bytes"] > 2000 and rep["total_cost"] > 0 and rep["currency"] == "INR"
    assert any(k.startswith(f"reports/{alice.id}/") for k in MemoryStorage.files)
    dl = db_client.get(f"/api/reports/{rep['id']}/download", headers=alice.headers)
    assert dl.status_code == 200 and dl.content[:5] == b"%PDF-" and len(dl.content) == rep["size_bytes"]
    assert rep["file_name"] in dl.headers["content-disposition"]
    assert db_client.get("/api/projects", headers=alice.headers).json()[0]["has_estimate"] is True  # the report saved a fresh estimate


def pdf_text(data: bytes) -> str:
    """All text drawn in a ReportLab PDF (its streams are ASCII85 + Flate compressed)."""
    import re
    import zlib

    out = []
    for raw in re.findall(rb"stream\r?\n(.*?)endstream", data, re.S):
        raw = raw.strip()
        try:
            raw = base64.a85decode(raw, adobe=True) if raw.endswith(b"~>") else raw
            out.append(zlib.decompress(raw).decode("latin-1"))
        except Exception:  # noqa: BLE001 - fonts and images are not text streams
            continue
    return " ".join(out)


def test_the_report_contains_the_project_the_numbers_and_the_disclaimer(db_client, alice):
    p = make(db_client, alice, name="Kothrud Row House", location="Pune")
    rep = db_client.post(f"/api/projects/{p['id']}/report", headers=alice.headers).json()
    text = pdf_text(db_client.get(f"/api/reports/{rep['id']}/download", headers=alice.headers).content)
    assert "Kothrud Row House" in text and "Buildora" in text and "Pune" in text
    assert "Living" in text and "Kitchen" in text  # the rooms
    assert "BuildWise" not in text
    low = text.lower()
    assert "preliminary" in low and "qualified engineer" in low  # the disclaimer is on the sheet


def test_a_project_without_rooms_still_gets_a_report(db_client, alice):
    p = db_client.post("/api/projects", json={"name": "Bare", "length": 10, "width": 8}, headers=alice.headers).json()
    r = db_client.post(f"/api/projects/{p['id']}/report", headers=alice.headers)
    assert r.status_code == 201 and r.json()["size_bytes"] > 1000


def test_reports_are_listed_newest_first_and_can_be_deleted(db_client, alice):
    p = make(db_client, alice)
    a = db_client.post(f"/api/projects/{p['id']}/report", headers=alice.headers).json()
    b = db_client.post(f"/api/projects/{p['id']}/report", headers=alice.headers).json()
    assert [r["id"] for r in db_client.get("/api/reports", headers=alice.headers).json()] == [b["id"], a["id"]]
    assert db_client.delete(f"/api/reports/{a['id']}", headers=alice.headers).status_code == 204
    assert [r["id"] for r in db_client.get("/api/reports", headers=alice.headers).json()] == [b["id"]]
    assert db_client.get(f"/api/reports/{a['id']}/download", headers=alice.headers).status_code == 404
    assert len(MemoryStorage.files) == 1


def test_other_people_cannot_list_download_or_delete_reports(db_client, alice, bob):
    p = make(db_client, alice)
    rep = db_client.post(f"/api/projects/{p['id']}/report", headers=alice.headers).json()
    assert db_client.get("/api/reports", headers=bob.headers).json() == []
    assert db_client.get(f"/api/reports/{rep['id']}/download", headers=bob.headers).status_code == 404
    assert db_client.delete(f"/api/reports/{rep['id']}", headers=bob.headers).status_code == 404
    assert db_client.post(f"/api/projects/{p['id']}/report", headers=bob.headers).status_code == 404
    assert db_client.get(f"/api/reports/{rep['id']}/download", headers=alice.headers).status_code == 200


def test_deleting_a_project_removes_its_stored_files_and_records(db_client, alice, pg_uri):
    p = make(db_client, alice)
    upload(db_client, alice, p["id"])
    db_client.post(f"/api/projects/{p['id']}/report", headers=alice.headers)
    assert len(MemoryStorage.files) == 2
    assert db_client.delete(f"/api/projects/{p['id']}", headers=alice.headers).status_code == 204
    assert MemoryStorage.files == {}
    with superuser(pg_uri) as c:
        for t in ("floor_plan_files", "reports", "project_estimates", "estimate_items", "optimization_recommendations", "project_rooms", "projects"):
            assert c.execute(f"select count(*) from {t}").fetchone()[0] == 0, t


# ---------------------------------------------------------------------------------------------------- dashboard and demo
def test_the_dashboard_is_empty_for_a_new_user(db_client, alice):
    d = db_client.get("/api/dashboard", headers=alice.headers).json()
    assert (d["total_projects"], d["saved_estimates"], d["total_estimated_cost"], d["avg_cost_per_sqft"], d["has_demo_data"]) == (0, 0, 0, None, False)
    assert d["recent_projects"] == [] and d["recent_reports"] == [] and d["cost_distribution"] == [] and d["material_quantities"] == []


def test_the_dashboard_summarises_projects_estimates_and_reports(db_client, alice, bob):
    a, b = make(db_client, alice, name="A"), make(db_client, alice, name="B")
    make(db_client, bob, name="Bob's")
    db_client.post(f"/api/projects/{a['id']}/estimate", headers=alice.headers)
    db_client.post(f"/api/projects/{b['id']}/report", headers=alice.headers)  # a report also saves an estimate
    d = db_client.get("/api/dashboard", headers=alice.headers).json()
    assert d["total_projects"] == 2 and d["saved_estimates"] == 2
    assert d["total_estimated_cost"] > 0 and d["avg_cost_per_sqft"] > 0
    assert [p["name"] for p in d["recent_projects"]] == ["B", "A"] and len(d["recent_reports"]) == 1
    assert sum(c["cost"] for c in d["cost_distribution"]) == pytest.approx(d["total_estimated_cost"])
    keys = {m["name"] for m in d["material_quantities"]}
    assert keys and "Masonry Mortar" not in keys and "Plaster" not in keys  # intermediate lines are left out
    assert db_client.get("/api/dashboard", headers=bob.headers).json()["total_projects"] == 1


def test_the_demo_project_is_labelled_complete_and_private(db_client, alice, bob):
    r = db_client.post("/api/demo/seed", headers=alice.headers)
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["is_demo"] is True and p["name"].startswith("DEMO") and p["floors"] == 2 and p["room_count"] == 10
    assert (p["length"], p["width"]) == (10.0, 8.0) and p["has_estimate"] is True
    assert {r_["name"] for r_ in p["rooms"]} >= {"Living Room", "Master Bedroom", "Landing", "Staircase 2"}
    assert all(r_["pos_x"] is not None for r_ in p["rooms"])  # placed rooms, so the 3D view is not a schematic
    assert db_client.get("/api/dashboard", headers=alice.headers).json()["has_demo_data"] is True
    assert db_client.get("/api/projects", headers=bob.headers).json() == []


# ---------------------------------------------------------------------------------------------------- database rules for the new tables
def test_database_rules_for_estimates_reports_and_floor_plans(db_client, alice, bob, pg_uri):
    pa = make(db_client, alice)
    pb = make(db_client, bob)
    for u, p in ((alice, pa), (bob, pb)):
        upload(db_client, u, p["id"])
        db_client.post(f"/api/projects/{p['id']}/report", headers=u.headers)
    for table in ("floor_plan_files", "project_estimates", "estimate_items", "optimization_recommendations", "reports"):
        with as_user(pg_uri, alice.id) as c:
            own = c.execute(f"select count(*) from {table}").fetchone()[0]
            assert own > 0, table
            assert c.execute(f"select count(*) from {table} where owner_id <> %s", (alice.id,)).fetchone()[0] == 0, table
            assert c.execute(f"delete from {table} where owner_id = %s", (bob.id,)).rowcount == 0, table
    with as_user(pg_uri, alice.id) as c, pytest.raises(psycopg.errors.InsufficientPrivilege):  # an estimate for someone else's project
        c.execute("insert into project_estimates (project_id) values (%s)", (pb["id"],))
    with as_user(pg_uri, alice.id) as c, pytest.raises(psycopg.errors.InsufficientPrivilege):
        c.execute("insert into reports (project_id, file_name, storage_key) values (%s, 'x.pdf', 'k.pdf')", (pb["id"],))
    for table in ("floor_plan_files", "project_estimates", "reports", "materials"):
        with as_user(pg_uri, None, role="anon") as c, pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute(f"select * from {table}")
    with superuser(pg_uri) as c, pytest.raises(psycopg.errors.CheckViolation):  # only real image/PDF types are accepted, even by the server
        c.execute("insert into floor_plan_files (project_id, owner_id, original_name, content_type, size_bytes, storage_key) values (%s, %s, 'a', 'text/html', 1, 'k')", (pa["id"], alice.id))
