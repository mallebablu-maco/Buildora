"""Captures what the API really answers and writes it to frontend/src/test/fixtures/api_responses.json.

The frontend's page tests render every screen with these responses, so a page can never be tested only against data its author
imagined. Ids and timestamps are replaced by stable values so the file only changes when the API's data format changes.
Run `pytest` in backend/ to regenerate; commit the file when the format changes on purpose.
"""
from __future__ import annotations

import io
import json
import pathlib
import re

from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).resolve().parents[2] / "frontend" / "src" / "test" / "fixtures" / "api_responses.json"
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
TIME = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")


def normalise(data):
    ids: dict[str, str] = {}

    def walk(x):
        if isinstance(x, dict):
            return {k: walk(v) for k, v in x.items()}
        if isinstance(x, list):
            return [walk(v) for v in x]
        if isinstance(x, str) and UUID.match(x):
            return ids.setdefault(x, f"00000000-0000-4000-8000-{len(ids) + 1:012d}")
        if isinstance(x, str) and TIME.match(x):
            return "2026-10-27T10:00:00+00:00"
        if isinstance(x, str) and re.search(r"[0-9a-f]{32}\.(png|pdf|jpg)", x):
            return re.sub(r"[0-9a-f]{32}", "0" * 32, x)
        return x

    return walk(data)


def plan_png() -> bytes:
    im = Image.new("RGB", (400, 300), "white")
    d = ImageDraw.Draw(im)
    d.rectangle((20, 20, 380, 280), outline="black", width=8)
    d.line((200, 20, 200, 280), fill="black", width=8)
    out = io.BytesIO()
    im.save(out, "PNG")
    return out.getvalue()


def test_export_real_api_responses_for_the_frontend_tests(db_client, alice):
    h = alice.headers
    demo = db_client.post("/api/demo/seed", headers=h).json()
    pid = demo["id"]
    plan = db_client.post(f"/api/projects/{pid}/floorplans", files={"file": ("ground-floor-plan.png", plan_png(), "image/png")}, headers=h)
    assert plan.status_code == 201
    mine = db_client.post("/api/materials", json={"estimate_key": "cement", "name": "My local cement", "category": "Cement & Binders", "unit": "bag (50 kg)", "unit_price": 455, "supplier": "Nair Traders", "location": "Pune"}, headers=h)
    assert mine.status_code == 201
    db_client.put(f"/api/projects/{pid}/config", json={"material_selections": {"cement": mine.json()["id"]}}, headers=h)
    db_client.put("/api/profile", json={"full_name": "Alice Rao", "default_city": "Pune"}, headers=h)
    report = db_client.post(f"/api/projects/{pid}/report", headers=h)
    assert report.status_code == 201
    what_if = db_client.post(f"/api/projects/{pid}/estimate", json={"persist": False, "wastage": {"tiles": 12}}, headers=h)

    def get(path):
        r = db_client.get(path, headers=h)
        assert r.status_code == 200, (path, r.text)
        return r.json()

    data = {
        "generated_by": "backend/tests/test_export_frontend_fixtures.py",
        "projects": get("/api/projects"),
        "project": get(f"/api/projects/{pid}"),
        "estimate": get(f"/api/projects/{pid}/estimate"),
        "what_if_estimate": what_if.json(),
        "recommendations": get(f"/api/projects/{pid}/recommendations"),
        "materials": get("/api/materials"),
        "reports": get("/api/reports"),
        "dashboard": get("/api/dashboard"),
        "profile": get("/api/profile"),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(normalise(data), indent=1, sort_keys=True) + "\n")
    assert data["project"]["room_count"] == 10 and data["estimate"]["items"] and data["dashboard"]["total_projects"] == 1
