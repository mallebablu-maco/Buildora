from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.auth import Identity, current_identity
from app.core.db import get_db
from app.models import Profile
from app.schemas import ProfileOut, ProfileUpdate

router = APIRouter(tags=["account"])


def _profile(db: Session, identity: Identity) -> Profile:
    """The caller's profile. Created on first use from the name given at sign-up (no database trigger on Supabase's auth tables)."""
    uid = uuid.UUID(identity.id)
    db.execute(insert(Profile).values(id=uid, full_name=identity.full_name[:120]).on_conflict_do_nothing(index_elements=["id"]))
    db.commit()
    return db.scalar(select(Profile).where(Profile.id == uid))


@router.get("/profile", response_model=ProfileOut)
def get_profile(db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    p = _profile(db, identity)
    return ProfileOut(id=p.id, email=identity.email, full_name=p.full_name)


@router.put("/profile", response_model=ProfileOut)
def update_profile(body: ProfileUpdate, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    p = _profile(db, identity)
    p.full_name = body.full_name
    db.commit()
    return ProfileOut(id=p.id, email=identity.email, full_name=p.full_name)
