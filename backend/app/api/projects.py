from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.auth import Identity, current_identity
from app.core.db import get_db
from app.models import Project, Room
from app.schemas import (
    ProjectCreate, ProjectDetail, ProjectOut, ProjectUpdate, RoomIn, RoomOut, RoomsReplace, check_floors,
)

router = APIRouter(tags=["projects"])


def _project_dict(p: Project, room_count: int) -> dict:
    footprint = p.built_up_area or p.length * p.width
    return {
        **{c.name: getattr(p, c.name) for c in Project.__table__.columns},
        "room_count": room_count, "floor_area": footprint, "total_built_up_area": footprint * p.floors,
    }


# Endpoints return fully built response models (never live database objects), so nothing is read lazily after the session closes.
def _detail(p: Project) -> ProjectDetail:
    return ProjectDetail.model_validate({**_project_dict(p, len(p.rooms)), "rooms": [RoomOut.model_validate(r) for r in p.rooms]})


def _rooms_out(p: Project) -> list[RoomOut]:
    return [RoomOut.model_validate(r) for r in p.rooms]


def _owned_project(db: Session, identity: Identity, project_id: uuid.UUID) -> Project:
    """Ownership check. 404 (not 403) so the existence of other users' projects is not revealed. The database's Row Level Security
    hides them as well, so this is a second guard."""
    p = db.scalar(select(Project).options(selectinload(Project.rooms)).where(Project.id == project_id).execution_options(populate_existing=True))
    if p is None or p.owner_id != uuid.UUID(identity.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found.")
    return p


def _require_floors_fit(rooms, floors: int) -> None:
    try:
        check_floors(rooms, floors)
    except ValueError as e:
        raise HTTPException(422, str(e)) from None


def _new_room(owner_id: uuid.UUID, body: RoomIn) -> Room:
    return Room(owner_id=owner_id, **body.model_dump())  # project_id is filled in when the room joins a project's collection


# ---------------------------------------------------------------------------------------------------- projects
@router.get("/projects", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    counts = select(Room.project_id, func.count(Room.id).label("n")).group_by(Room.project_id).subquery()
    rows = db.execute(
        select(Project, func.coalesce(counts.c.n, 0)).outerjoin(counts, counts.c.project_id == Project.id).order_by(Project.updated_at.desc())
    ).all()
    return [ProjectOut.model_validate(_project_dict(p, n)) for p, n in rows]


@router.post("/projects", response_model=ProjectDetail, status_code=status.HTTP_201_CREATED)
def create_project(body: ProjectCreate, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    owner = uuid.UUID(identity.id)
    p = Project(id=uuid.uuid4(), owner_id=owner, **body.model_dump(exclude={"rooms"}))
    p.rooms = [_new_room(owner, r) for r in body.rooms]
    db.add(p)
    db.commit()
    return _detail(_owned_project(db, identity, p.id))


@router.get("/projects/{project_id}", response_model=ProjectDetail)
def get_project(project_id: uuid.UUID, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    return _detail(_owned_project(db, identity, project_id))


@router.put("/projects/{project_id}", response_model=ProjectDetail)
def update_project(project_id: uuid.UUID, body: ProjectUpdate, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    p = _owned_project(db, identity, project_id)
    _require_floors_fit(p.rooms, body.floors)  # cannot drop below the highest floor that still has rooms
    for k, v in body.model_dump().items():
        setattr(p, k, v)
    db.commit()
    return _detail(_owned_project(db, identity, project_id))


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: uuid.UUID, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    db.delete(_owned_project(db, identity, project_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------------------------------- rooms
def _touch(p: Project) -> None:
    p.updated_at = func.now()  # a change to a room counts as a change to the project


def _owned_room(p: Project, room_id: uuid.UUID) -> Room:
    room = next((r for r in p.rooms if r.id == room_id), None)
    if room is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found.")
    return room


@router.get("/projects/{project_id}/rooms", response_model=list[RoomOut])
def list_rooms(project_id: uuid.UUID, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    return _rooms_out(_owned_project(db, identity, project_id))


@router.post("/projects/{project_id}/rooms", response_model=RoomOut, status_code=status.HTTP_201_CREATED)
def add_room(project_id: uuid.UUID, body: RoomIn, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    p = _owned_project(db, identity, project_id)
    _require_floors_fit([body], p.floors)
    room = _new_room(p.owner_id, body)
    p.rooms.append(room)
    _touch(p)
    db.commit()
    db.refresh(room)
    return RoomOut.model_validate(room)


@router.put("/projects/{project_id}/rooms/{room_id}", response_model=RoomOut)
def update_room(project_id: uuid.UUID, room_id: uuid.UUID, body: RoomIn, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    p = _owned_project(db, identity, project_id)
    _require_floors_fit([body], p.floors)
    room = _owned_room(p, room_id)
    for k, v in body.model_dump().items():
        setattr(room, k, v)
    _touch(p)
    db.commit()
    db.refresh(room)
    return RoomOut.model_validate(room)


@router.delete("/projects/{project_id}/rooms/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_room(project_id: uuid.UUID, room_id: uuid.UUID, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    p = _owned_project(db, identity, project_id)
    p.rooms.remove(_owned_room(p, room_id))  # delete-orphan removes the row
    _touch(p)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/projects/{project_id}/rooms", response_model=list[RoomOut])
def replace_rooms(project_id: uuid.UUID, body: RoomsReplace, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    """Atomically replace every room (used by the layout generator and by confirmed floor-plan imports): all or nothing."""
    p = _owned_project(db, identity, project_id)
    _require_floors_fit(body.rooms, p.floors)
    p.rooms = [_new_room(p.owner_id, r) for r in body.rooms]
    _touch(p)
    db.commit()
    return _rooms_out(_owned_project(db, identity, project_id))
