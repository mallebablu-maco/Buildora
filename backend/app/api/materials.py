from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app import limits as L
from app.api.projects import uid
from app.core.auth import Identity, current_identity
from app.core.db import get_db
from app.models import Material, PriceRecord, Project
from app.schemas import MaterialCreate, MaterialOut, MaterialUpdate, PriceCreate, PriceOut, PriceUpdate
from app.services.estimation import ITEM_ORDER
from app.services.pricing.service import effective_price, visible_materials

router = APIRouter(tags=["materials"])

MAX_CSV_ROWS = 2000


def material_out(m: Material, user_id: str) -> MaterialOut:
    p = effective_price(m, user_id)
    return MaterialOut.model_validate({
        **{c.name: getattr(m, c.name) for c in Material.__table__.columns},
        "editable": m.owner_id == user_id,
        "unit_price": p.unit_price if p else None, "currency": p.currency if p else None,
        "supplier": p.supplier if p else "", "location": p.location if p else "",
        "price_is_sample": bool(p and p.is_sample), "price_id": p.id if p else None,
        "last_updated": p.updated_at if p else None,
    })


def _material(db: Session, user_id: str, material_id: uuid.UUID | str, require_owner: bool = True) -> Material:
    m = db.get(Material, str(material_id))
    if not m or m.owner_id not in (None, user_id):
        raise HTTPException(404, "Material not found.")
    if require_owner and m.owner_id != user_id:
        raise HTTPException(403, "Sample catalogue materials are read-only. Add your own price record or create a custom material.")
    return m


@router.get("/materials", response_model=list[MaterialOut])
def list_materials(estimate_key: str | None = None, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    ms = visible_materials(db, uid(identity))
    if estimate_key:
        ms = [m for m in ms if m.estimate_key == estimate_key]
    return [material_out(m, uid(identity)) for m in ms]


@router.post("/materials", response_model=MaterialOut, status_code=status.HTTP_201_CREATED)
def create_material(body: MaterialCreate, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    me = uid(identity)
    m = Material(owner_id=me, **body.model_dump(include=set(MaterialUpdate.model_fields)))
    if body.unit_price is not None:
        m.prices.append(PriceRecord(owner_id=me, unit_price=body.unit_price, currency=body.currency,
                                    supplier=body.supplier, location=body.location, is_sample=False))
    db.add(m)
    db.commit()
    db.refresh(m)
    return material_out(m, me)


@router.put("/materials/{material_id}", response_model=MaterialOut)
def update_material(material_id: uuid.UUID, body: MaterialUpdate, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    me = uid(identity)
    m = _material(db, me, material_id)
    for k, v in body.model_dump().items():
        setattr(m, k, v)
    db.commit()
    db.refresh(m)
    return material_out(m, me)


@router.delete("/materials/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_material(material_id: uuid.UUID, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    me = uid(identity)
    m = _material(db, me, material_id)
    for p in db.scalars(select(Project).where(Project.owner_id == me)):  # drop project choices that point at this material
        if m.id in (p.material_selections or {}).values():
            p.material_selections = {k: v for k, v in p.material_selections.items() if v != m.id}
    db.delete(m)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------------------------------- prices
@router.get("/prices", response_model=list[PriceOut])
def list_prices(material_id: uuid.UUID | None = None, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    me = uid(identity)
    q = select(PriceRecord).where(or_(PriceRecord.owner_id == me, PriceRecord.owner_id.is_(None)))
    if material_id:
        q = q.where(PriceRecord.material_id == str(material_id))
    return [PriceOut.model_validate(r) for r in db.scalars(q.order_by(PriceRecord.updated_at.desc()))]


@router.post("/prices", response_model=PriceOut, status_code=status.HTTP_201_CREATED)
def create_price(body: PriceCreate, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    me = uid(identity)
    m = _material(db, me, body.material_id, require_owner=False)
    rec = PriceRecord(material_id=m.id, owner_id=me, unit_price=body.unit_price, currency=body.currency,
                      supplier=body.supplier, location=body.location, is_sample=False)
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return PriceOut.model_validate(rec)


def _own_price(db: Session, user_id: str, price_id: uuid.UUID) -> PriceRecord:
    rec = db.get(PriceRecord, str(price_id))
    if not rec or rec.owner_id != user_id:
        raise HTTPException(404, "Price record not found (sample prices cannot be edited; add your own).")
    return rec


@router.put("/prices/{price_id}", response_model=PriceOut)
def update_price(price_id: uuid.UUID, body: PriceUpdate, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    rec = _own_price(db, uid(identity), price_id)
    rec.unit_price, rec.supplier, rec.location = body.unit_price, body.supplier, body.location
    rec.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(rec)
    return PriceOut.model_validate(rec)


@router.delete("/prices/{price_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_price(price_id: uuid.UUID, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    db.delete(_own_price(db, uid(identity), price_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/prices/import")
async def import_prices(file: UploadFile = File(...), db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    """CSV columns: estimate_key,name,category,brand,grade,unit,unit_price,supplier,location (header required)."""
    me = uid(identity)
    raw = await file.read(1_000_001)
    if len(raw) > 1_000_000:
        raise HTTPException(413, "CSV file is too large (max 1 MB).")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(422, "CSV must be UTF-8 encoded.") from None
    reader = csv.DictReader(io.StringIO(text))
    required = {"estimate_key", "name", "unit", "unit_price"}
    if not reader.fieldnames or not required <= {f.strip() for f in reader.fieldnames}:
        raise HTTPException(422, f"CSV must have a header with at least: {', '.join(sorted(required))}.")
    created, errors = 0, []
    for line_no, row in enumerate(reader, start=2):
        if line_no - 1 > MAX_CSV_ROWS:
            errors.append({"line": line_no, "message": f"Only the first {MAX_CSV_ROWS} rows are imported."})
            break
        try:
            row = {k.strip(): (v or "").strip() for k, v in row.items() if k}
            key = row["estimate_key"].lower()
            if key not in ITEM_ORDER:
                raise ValueError(f"estimate_key must be one of {', '.join(ITEM_ORDER)}")
            price = float(row["unit_price"])
            if not (0 <= price <= L.MAX_UNIT_PRICE):
                raise ValueError(f"unit_price must be between 0 and {L.MAX_UNIT_PRICE:,.0f}")
            if not row["name"] or not row["unit"]:
                raise ValueError("name and unit are required")
            for field, kind in (("name", "material"), ("category", "title"), ("brand", "material"), ("grade", "grade"), ("unit", "unit"), ("supplier", "title"), ("location", "place")):
                problem = L.text_problem(kind, row.get(field, ""))
                if problem:
                    raise ValueError(f"{field}: {problem}")
            m = Material(owner_id=me, estimate_key=key, name=row["name"][:L.MATERIAL_NAME], category=(row.get("category") or key.title())[:L.CATEGORY],
                         brand=row.get("brand", "")[:L.BRAND], grade=row.get("grade", "")[:L.GRADE], unit=row["unit"][:L.UNIT])
            m.prices.append(PriceRecord(owner_id=me, unit_price=price, supplier=row.get("supplier", "")[:L.SUPPLIER], location=row.get("location", "")[:L.PRICE_LOCATION]))
            db.add(m)
            created += 1
        except (ValueError, KeyError) as e:
            errors.append({"line": line_no, "message": str(e)})
    db.commit()
    return {"created": created, "errors": errors}


@router.get("/catalogue/summary")
def catalogue_summary(db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    """Counts shown under the catalogue table."""
    me = uid(identity)
    total = db.scalar(select(func.count(Material.id)).where(or_(Material.owner_id.is_(None), Material.owner_id == me))) or 0
    return {"materials": total}
