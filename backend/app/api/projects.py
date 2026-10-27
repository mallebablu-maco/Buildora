from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import distinct_on
from sqlalchemy.orm import Session, selectinload

from app.core.auth import Identity, current_identity
from app.core.db import get_db
from app.models import Estimate, Project, Report, Room
from app.schemas import (
    EstimateRequest, LayoutIn, ProjectConfigUpdate, ProjectCreate, ProjectDetail, ProjectOut, ProjectUpdate, RoomIn, RoomOut,
    RoomsReplace, check_floors,
)
from app.services.estimate_service import compute_estimate, estimate_to_payload, save_estimate
from app.services.estimation import EstimationError
from app.services.storage import storage_for

router = APIRouter(tags=["projects"])


def project_dict(p: Project, room_count: int, latest_cost: float | None, has_estimate: bool) -> dict:
    footprint = p.built_up_area or p.length * p.width
    return {
        **{c.name: getattr(p, c.name) for c in Project.__table__.columns},
        "room_count": room_count, "floor_area": footprint, "total_built_up_area": footprint * p.floors,
        "latest_total_cost": latest_cost, "has_estimate": has_estimate,
    }


# Endpoints return fully built response models (never live database objects), so nothing is read lazily after the session closes.
def project_detail(p: Project) -> ProjectDetail:
    est = p.estimates[0] if p.estimates else None
    return ProjectDetail.model_validate({
        **project_dict(p, len(p.rooms), est.total_material_cost if est else None, est is not None),
        "rooms": [RoomOut.model_validate(r) for r in p.rooms], "floorplans": list(p.floorplans),
    })


def _rooms_out(p: Project) -> list[RoomOut]:
    return [RoomOut.model_validate(r) for r in p.rooms]


def uid(identity: Identity) -> str:
    return str(uuid.UUID(identity.id))  # canonical lower-case text


def owned_project(db: Session, identity: Identity, project_id: uuid.UUID | str) -> Project:
    """Ownership check. 404 (not 403) so the existence of other users' projects is not revealed. The database's Row Level Security
    hides them as well, so this is a second guard."""
    p = db.scalar(
        select(Project).options(selectinload(Project.rooms), selectinload(Project.floorplans), selectinload(Project.estimates))
        .where(Project.id == str(project_id)).execution_options(populate_existing=True)
    )
    if p is None or p.owner_id != uid(identity):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found.")
    return p


def _require_floors_fit(rooms, floors: int) -> None:
    try:
        check_floors(rooms, floors)
    except ValueError as e:
        raise HTTPException(422, str(e)) from None


def _new_room(owner_id: str, body: RoomIn) -> Room:
    return Room(owner_id=owner_id, **body.model_dump())  # project_id is filled in when the room joins a project's collection


def touch(p: Project) -> None:
    p.updated_at = func.now()  # a change to a room, the layout or the settings counts as a change to the project


# ---------------------------------------------------------------------------------------------------- projects
@router.get("/projects", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    counts = select(Room.project_id, func.count(Room.id).label("n")).group_by(Room.project_id).subquery()
    latest = (select(Estimate.project_id, Estimate.total_material_cost.label("cost")).ext(distinct_on(Estimate.project_id))
              .order_by(Estimate.project_id, Estimate.created_at.desc()).subquery())
    rows = db.execute(
        select(Project, func.coalesce(counts.c.n, 0), latest.c.cost, latest.c.project_id.is_not(None))
        .outerjoin(counts, counts.c.project_id == Project.id).outerjoin(latest, latest.c.project_id == Project.id)
        .order_by(Project.created_at.desc(), Project.id)  # newest created first, whatever was edited since
    ).all()
    return [ProjectOut.model_validate(project_dict(p, n, cost, has)) for p, n, cost, has in rows]


@router.post("/projects", response_model=ProjectDetail, status_code=status.HTTP_201_CREATED)
def create_project(body: ProjectCreate, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    owner = uid(identity)
    p = Project(id=str(uuid.uuid4()), owner_id=owner, **body.model_dump(exclude={"rooms"}))
    p.rooms = [_new_room(owner, r) for r in body.rooms]
    db.add(p)
    db.commit()
    return project_detail(owned_project(db, identity, p.id))


@router.get("/projects/{project_id}", response_model=ProjectDetail)
def get_project(project_id: uuid.UUID, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    return project_detail(owned_project(db, identity, project_id))


@router.put("/projects/{project_id}", response_model=ProjectDetail)
def update_project(project_id: uuid.UUID, body: ProjectUpdate, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    p = owned_project(db, identity, project_id)
    _require_floors_fit(p.rooms, body.floors)  # cannot drop below the highest floor that still has rooms
    for k, v in body.model_dump().items():
        setattr(p, k, v)
    db.commit()
    return project_detail(owned_project(db, identity, project_id))


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: uuid.UUID, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    p = owned_project(db, identity, project_id)
    files = [(f.storage_key, "floorplans") for f in p.floorplans]
    files += [(r.storage_key, "reports") for r in db.scalars(select(Report).where(Report.project_id == p.id))]
    db.delete(p)
    db.commit()
    for key, bucket in files:  # remove the stored files too; a failure here must not undo the delete
        try:
            storage_for(bucket, identity).delete(key)
        except Exception:  # noqa: BLE001
            pass
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------------------------------- rooms
def _owned_room(p: Project, room_id: uuid.UUID) -> Room:
    room = next((r for r in p.rooms if r.id == str(room_id)), None)
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found.")
    return room


@router.get("/projects/{project_id}/rooms", response_model=list[RoomOut])
def list_rooms(project_id: uuid.UUID, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    return _rooms_out(owned_project(db, identity, project_id))


@router.post("/projects/{project_id}/rooms", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
def add_room(project_id: uuid.UUID, body: RoomIn, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    p = owned_project(db, identity, project_id)
    _require_floors_fit([body], p.floors)
    room = _new_room(p.owner_id, body)
    p.rooms.append(room)
    touch(p)
    db.commit()
    db.refresh(room)
    return RoomOut.model_validate(room)


@router.put("/projects/{project_id}/rooms/{room_id}", response_model=RoomOut)
def update_room(project_id: uuid.UUID, room_id: uuid.UUID, body: RoomIn, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    p = owned_project(db, identity, project_id)
    _require_floors_fit([body], p.floors)
    room = _owned_room(p, room_id)
    for k, v in body.model_dump().items():
        setattr(room, k, v)
    touch(p)
    db.commit()
    db.refresh(room)
    return RoomOut.model_validate(room)


@router.delete("/projects/{project_id}/rooms/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_room(project_id: uuid.UUID, room_id: uuid.UUID, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    p = owned_project(db, identity, project_id)
    p.rooms.remove(_owned_room(p, room_id))  # delete-orphan removes the row
    touch(p)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/projects/{project_id}/rooms", response_model=list[RoomOut])
def replace_rooms(project_id: uuid.UUID, body: RoomsReplace, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    """Atomically replace every room (used by the layout generator and by confirmed floor-plan imports): all or nothing."""
    p = owned_project(db, identity, project_id)
    _require_floors_fit(body.rooms, p.floors)
    p.rooms = [_new_room(p.owner_id, r) for r in body.rooms]
    p.layout = None  # door/window positions and furniture of the old rooms no longer apply
    touch(p)
    db.commit()
    return _rooms_out(owned_project(db, identity, project_id))


# ---------------------------------------------------------------------------------------------------- 3D layout
@router.put("/projects/{project_id}/layout", response_model=ProjectDetail)
def save_layout(project_id: uuid.UUID, body: LayoutIn, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    """Persist custom openings, furniture arrangement, settings and the summary the estimator reads."""
    p = owned_project(db, identity, project_id)
    p.layout = body.model_dump()
    touch(p)
    db.commit()
    return project_detail(owned_project(db, identity, project_id))


@router.delete("/projects/{project_id}/layout", response_model=ProjectDetail)
def reset_layout(project_id: uuid.UUID, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    """Back to the fully automatic arrangement."""
    p = owned_project(db, identity, project_id)
    p.layout = None
    touch(p)
    db.commit()
    return project_detail(owned_project(db, identity, project_id))


# ---------------------------------------------------------------------------------------------------- estimate settings and estimate
@router.put("/projects/{project_id}/config", response_model=ProjectDetail)
def update_config(project_id: uuid.UUID, body: ProjectConfigUpdate, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    """Estimate configuration: assumptions, wastage, material choices, extra costs, planned purchases."""
    p = owned_project(db, identity, project_id)
    for k, v in (body.wastage or {}).items():
        if not 0 <= v <= 100:
            raise HTTPException(422, f"Wastage for '{k}' must be between 0 and 100 %.")
    for field in ("assumptions", "wastage", "material_selections", "extra_costs", "purchase_quantities"):
        val = getattr(body, field)
        if val is None:
            continue
        merged = val if field == "extra_costs" else {**(getattr(p, field) or {}), **val}
        if field in ("material_selections", "purchase_quantities"):
            merged = {k: v for k, v in merged.items() if v is not None}
        setattr(p, field, merged)
    touch(p)
    db.commit()
    return project_detail(owned_project(db, identity, project_id))


@router.post("/projects/{project_id}/estimate")
def run_estimate(project_id: uuid.UUID, body: EstimateRequest | None = None, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    body = body or EstimateRequest()
    p = owned_project(db, identity, project_id)
    overrides = body.model_dump(exclude={"persist"}, exclude_none=True)
    try:
        payload = compute_estimate(db, uid(identity), p, overrides)
    except EstimationError as e:
        raise HTTPException(422, str(e)) from None
    if body.persist and not overrides:
        est = save_estimate(db, uid(identity), p, payload)
        p = owned_project(db, identity, project_id)
        out = estimate_to_payload(est, p)
        out["alternatives"] = payload["alternatives"]
        out["persisted"] = True
        return out
    payload["persisted"] = False
    return payload


@router.get("/projects/{project_id}/estimate")
def get_estimate(project_id: uuid.UUID, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    p = owned_project(db, identity, project_id)
    if not p.estimates:
        raise HTTPException(404, "No estimate has been calculated for this project yet.")
    return {**estimate_to_payload(p.estimates[0], p), "persisted": True}


@router.get("/projects/{project_id}/recommendations")
def get_recommendations(project_id: uuid.UUID, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    """Recommendations for the CURRENT project data (recomputed, then stored with the estimate)."""
    p = owned_project(db, identity, project_id)
    try:
        payload = compute_estimate(db, uid(identity), p)
    except EstimationError as e:
        raise HTTPException(422, str(e)) from None
    save_estimate(db, uid(identity), p, payload)
    return payload["recommendations"]
