"""The admin website's API: user statistics and upkeep of the shared catalogue and market prices.

Two independent locks: `require_admin` here (from the token's app_metadata, which users cannot edit), and the database's own
is_admin() check in every policy and report function (migration 3), so a mistake in this file still could not let a user in.
"""
from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session, selectinload

from app import limits as L
from app.core.auth import Identity, current_identity
from app.core.db import get_db
from app.models import Material, PriceRecord
from app.schemas import AdminHideIn, AdminMaterialCreate, AdminMaterialOut, AdminPriceIn, MaterialUpdate

router = APIRouter(prefix="/admin", tags=["admin"])
MAX_CSV_ROWS = 2000


def require_admin(identity: Identity = Depends(current_identity)) -> Identity:
    if not identity.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admins only.")
    return identity


def _market_price(m: Material) -> PriceRecord | None:
    shared = [p for p in m.prices if p.owner_id is None]
    return max(shared, key=lambda p: p.updated_at) if shared else None


def _out(m: Material) -> AdminMaterialOut:
    p = _market_price(m)
    return AdminMaterialOut(
        id=m.id, estimate_key=m.estimate_key, name=m.name, category=m.category, brand=m.brand, grade=m.grade,
        specification=m.specification, durability_notes=m.durability_notes, unit=m.unit, is_hidden=m.is_hidden,
        market_price=p.unit_price if p else None, currency=p.currency if p else "INR", supplier=p.supplier if p else "",
        location=p.location if p else "", price_is_sample=bool(p and p.is_sample), price_updated_at=p.updated_at if p else None,
    )


def _shared(db: Session, material_id: uuid.UUID | str) -> Material:
    m = db.scalar(select(Material).options(selectinload(Material.prices)).where(Material.id == str(material_id), Material.owner_id.is_(None)))
    if not m:
        raise HTTPException(404, "Material not found in the shared catalogue.")
    return m


def _set_market_price(m: Material, admin_id: str, unit_price: float, supplier: str = "", location: str = "") -> None:
    """Replace the shared price in place (one market price per material); it stops being a placeholder sample."""
    p = _market_price(m)
    if p is None:
        p = PriceRecord(owner_id=None, currency="INR")
        m.prices.append(p)
    p.unit_price, p.supplier, p.location = unit_price, supplier, location
    p.is_sample, p.updated_by, p.updated_at = False, admin_id, datetime.now(timezone.utc)


# ---------------------------------------------------------------------------------------------------- who am I / statistics
@router.get("/me")
def admin_me(identity: Identity = Depends(require_admin)):
    return identity.public()


@router.get("/overview")
def overview(db: Session = Depends(get_db), identity: Identity = Depends(require_admin)):
    return db.execute(text("select private.admin_overview()")).scalar_one()


@router.get("/users")
def users(db: Session = Depends(get_db), identity: Identity = Depends(require_admin)):
    rows = db.execute(text("select * from private.admin_users()")).mappings().all()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------------------------------- shared catalogue
@router.get("/materials", response_model=list[AdminMaterialOut])
def list_materials(db: Session = Depends(get_db), identity: Identity = Depends(require_admin)):
    ms = db.scalars(select(Material).options(selectinload(Material.prices)).where(Material.owner_id.is_(None))
                    .order_by(Material.estimate_key, Material.created_at, Material.name))
    return [_out(m) for m in ms]


@router.post("/materials", response_model=AdminMaterialOut, status_code=status.HTTP_201_CREATED)
def create_material(body: AdminMaterialCreate, db: Session = Depends(get_db), identity: Identity = Depends(require_admin)):
    m = Material(owner_id=None, is_sample=False, **body.model_dump(include=set(MaterialUpdate.model_fields)))
    _set_market_price(m, identity.id, body.unit_price, body.supplier, body.location)
    db.add(m)
    db.commit()
    return _out(_shared(db, m.id))


@router.put("/materials/{material_id}", response_model=AdminMaterialOut)
def update_material(material_id: uuid.UUID, body: MaterialUpdate, db: Session = Depends(get_db), identity: Identity = Depends(require_admin)):
    m = _shared(db, material_id)
    for k, v in body.model_dump().items():
        setattr(m, k, v)
    db.commit()
    return _out(_shared(db, material_id))


@router.put("/materials/{material_id}/price", response_model=AdminMaterialOut)
def set_price(material_id: uuid.UUID, body: AdminPriceIn, db: Session = Depends(get_db), identity: Identity = Depends(require_admin)):
    m = _shared(db, material_id)
    _set_market_price(m, identity.id, body.unit_price, body.supplier, body.location)
    db.commit()
    return _out(_shared(db, material_id))


@router.put("/materials/{material_id}/hidden", response_model=AdminMaterialOut)
def set_hidden(material_id: uuid.UUID, body: AdminHideIn, db: Session = Depends(get_db), identity: Identity = Depends(require_admin)):
    m = _shared(db, material_id)
    if body.hidden and not m.is_hidden:
        visible_same_kind = db.scalar(select(func.count(Material.id)).where(
            Material.owner_id.is_(None), Material.is_hidden.is_(False), Material.estimate_key == m.estimate_key))
        if visible_same_kind <= 1:
            raise HTTPException(409, "This is the only visible material of its type, so estimates would have no price for it. Add another one first.")
    m.is_hidden = body.hidden
    db.commit()
    return _out(_shared(db, material_id))


@router.post("/prices/import")
async def import_market_prices(file: UploadFile = File(...), db: Session = Depends(get_db), identity: Identity = Depends(require_admin)):
    """Update market prices in bulk. CSV header: name,unit_price (optional: supplier,location). Rows match shared materials by name."""
    raw = await file.read(1_000_001)
    if len(raw) > 1_000_000:
        raise HTTPException(413, "CSV file is too large (max 1 MB).")
    try:
        content = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(422, "CSV must be UTF-8 encoded.") from None
    reader = csv.DictReader(io.StringIO(content))
    if not reader.fieldnames or not {"name", "unit_price"} <= {f.strip() for f in reader.fieldnames}:
        raise HTTPException(422, "CSV must have a header with at least: name, unit_price.")
    by_name = {m.name.strip().lower(): m for m in db.scalars(select(Material).options(selectinload(Material.prices)).where(Material.owner_id.is_(None)))}
    updated, errors = 0, []
    for line_no, row in enumerate(reader, start=2):
        if line_no - 1 > MAX_CSV_ROWS:
            errors.append({"line": line_no, "message": f"Only the first {MAX_CSV_ROWS} rows are read."})
            break
        row = {k.strip(): (v or "").strip() for k, v in row.items() if k}
        m = by_name.get(row.get("name", "").lower())
        if m is None:
            errors.append({"line": line_no, "message": f"No shared material named '{row.get('name', '')}'."})
            continue
        try:
            price = float(row["unit_price"].replace(",", ""))
        except ValueError:
            errors.append({"line": line_no, "message": "unit_price must be a number."})
            continue
        if not 0 <= price <= L.MAX_UNIT_PRICE:
            errors.append({"line": line_no, "message": f"unit_price must be between 0 and {L.MAX_UNIT_PRICE:,.0f}."})
            continue
        supplier, location = row.get("supplier", "")[:L.SUPPLIER], row.get("location", "")[:L.PRICE_LOCATION]
        problem = L.text_problem("title", supplier) or L.text_problem("place", location)
        if problem:
            errors.append({"line": line_no, "message": problem})
            continue
        _set_market_price(m, identity.id, price, supplier, location)
        updated += 1
    db.commit()
    return {"updated": updated, "errors": errors}
