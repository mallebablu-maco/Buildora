from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.api.projects import owned_project, project_dict, project_detail, uid
from app.core.auth import Identity, current_identity
from app.core.db import get_db
from app.models import Estimate, Project, Report, Room
from app.schemas import ProjectDetail, ProjectOut, ReportOut
from app.services.estimate_service import compute_estimate, save_estimate

router = APIRouter(tags=["dashboard"])

# (name, type, length, width, floor, doors, windows, pos_x, pos_y): rooms tile each 10 x 8 m floor exactly.
DEMO_ROOMS = [
    ("Living Room", "living", 5.0, 4.0, 1, 2, 2, 0.0, 0.0), ("Kitchen", "kitchen", 5.0, 4.0, 1, 1, 2, 5.0, 0.0),
    ("Master Bedroom", "bedroom", 5.0, 4.0, 1, 1, 2, 0.0, 4.0), ("Bathroom", "bathroom", 2.5, 4.0, 1, 1, 0, 5.0, 4.0),
    ("Staircase", "staircase", 2.5, 4.0, 1, 1, 0, 7.5, 4.0),
    ("Bedroom 2", "bedroom", 5.0, 4.0, 2, 1, 2, 0.0, 0.0), ("Study", "study", 5.0, 4.0, 2, 1, 2, 5.0, 0.0),
    ("Bathroom 2", "bathroom", 2.5, 4.0, 2, 1, 1, 0.0, 4.0), ("Landing", "corridor", 5.0, 4.0, 2, 1, 1, 2.5, 4.0), ("Staircase 2", "staircase", 2.5, 4.0, 2, 1, 0, 7.5, 4.0),
]


@router.post("/demo/seed", response_model=ProjectDetail, status_code=status.HTTP_201_CREATED)
def seed_demo(db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    """Create a clearly labelled demo project (is_demo = true) for exploring the app."""
    me = uid(identity)
    p = Project(owner_id=me, name="DEMO – Two-storey residence", description="Demonstration data. Dimensions are illustrative only.",
                owner_name=identity.full_name, building_type="residential", location="Demo location", floors=2, currency="INR",
                budget=2_500_000, length=10.0, width=8.0, height=3.0, wall_thickness=0.23, slab_thickness=0.15, is_demo=True)
    for name, rt, ln, w, fl, d, win, x, y in DEMO_ROOMS:
        p.rooms.append(Room(owner_id=me, name=name, room_type=rt, length=ln, width=w, height=3.0, floor_number=fl, doors=d, windows=win, pos_x=x, pos_y=y))
    db.add(p)
    db.commit()
    p = owned_project(db, identity, p.id)
    save_estimate(db, me, p, compute_estimate(db, me, p))
    return project_detail(owned_project(db, identity, p.id))


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    me = uid(identity)
    projects = list(db.scalars(
        select(Project).options(selectinload(Project.rooms), selectinload(Project.estimates).selectinload(Estimate.items))
        .where(Project.owner_id == me).order_by(Project.created_at.desc())
    ))
    latest = {p.id: (p.estimates[0] if p.estimates else None) for p in projects}
    ests = [(p, latest[p.id]) for p in projects if latest[p.id]]
    cat: dict[str, float] = {}
    qty: dict[str, dict] = {}
    for _, e in ests:
        for c in e.summary.get("by_category", []):
            cat[c["category"]] = cat.get(c["category"], 0.0) + c["cost"]
        for row in e.items:
            it = row.data
            if it["key"] in ("concrete", "mortar", "plaster"):
                continue  # intermediate quantities; keep the chart readable
            q = qty.setdefault(it["key"], {"name": it["name"], "unit": it["unit"], "quantity": 0.0})
            q["quantity"] += it["gross_quantity"]
    per_sqft = [e.summary["cost_per_sqft"] for _, e in ests if e.summary.get("cost_per_sqft")]
    reports = db.scalars(select(Report).where(Report.owner_id == me).order_by(Report.created_at.desc()).limit(5))
    return {
        "total_projects": len(projects),
        "saved_estimates": len(ests),
        "total_estimated_cost": sum(e.total_material_cost for _, e in ests),
        "avg_cost_per_sqft": sum(per_sqft) / len(per_sqft) if per_sqft else None,
        "has_demo_data": any(p.is_demo for p in projects),
        "recent_projects": [ProjectOut.model_validate(project_dict(p, len(p.rooms), latest[p.id].total_material_cost if latest[p.id] else None, latest[p.id] is not None)) for p in projects[:5]],
        "recent_reports": [ReportOut.model_validate(r) for r in reports],
        "cost_distribution": [{"category": k, "cost": v} for k, v in cat.items()],
        "material_quantities": list(qty.values()),
    }
