from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.auth import Identity, current_identity
from app.core.db import get_db
from app.models import Profile
from app.schemas import ProfileOut, ProfileUpdate
from app.services.estimation import ITEM_ORDER

router = APIRouter(tags=["account"])


def _profile(db: Session, identity: Identity) -> Profile:
    """The caller's profile. Created on first use from the name given at sign-up (no database trigger on Supabase's auth tables)."""
    uid = str(uuid.UUID(identity.id))
    db.execute(insert(Profile).values(id=uid, full_name=identity.full_name[:120]).on_conflict_do_nothing(index_elements=["id"]))
    db.commit()
    return db.scalar(select(Profile).where(Profile.id == uid))


def _out(p: Profile, identity: Identity) -> ProfileOut:
    return ProfileOut(id=p.id, email=identity.email, full_name=p.full_name, default_city=p.default_city, default_wastage=p.default_wastage or {})


@router.get("/profile", response_model=ProfileOut)
def get_profile(db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    return _out(_profile(db, identity), identity)


@router.put("/profile", response_model=ProfileOut)
def update_profile(body: ProfileUpdate, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    p = _profile(db, identity)
    p.full_name = body.full_name
    if body.default_city is not None:
        p.default_city = body.default_city
    if body.default_wastage is not None:
        bad = [k for k, v in body.default_wastage.items() if k not in ITEM_ORDER or not 0 <= v <= 50]
        if bad:
            raise HTTPException(422, f"Default wastage must use known materials and values from 0 to 50 % (check: {', '.join(bad)}).")
        p.default_wastage = body.default_wastage
    db.commit()
    return _out(p, identity)
