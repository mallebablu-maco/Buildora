from __future__ import annotations

import base64
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.projects import owned_project, touch, uid
from app.core.auth import Identity, current_identity
from app.core.config import get_settings
from app.core.db import get_db
from app.models import FloorPlan
from app.schemas import CalibrationIn, FloorPlanOut
from app.services.floorplan import processing
from app.services.storage import storage_for

router = APIRouter(tags=["floorplans"])

_EXT = {"application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg"}


def _owned_floorplan(db: Session, identity: Identity, fid: uuid.UUID) -> FloorPlan:
    fp = db.scalar(select(FloorPlan).where(FloorPlan.id == str(fid)))
    if fp is None or fp.owner_id != uid(identity):
        raise HTTPException(404, "Floor plan not found.")
    return fp


def _stored_bytes(fp: FloorPlan, identity: Identity) -> bytes:
    st = storage_for("floorplans", identity)
    if not st.exists(fp.storage_key):
        raise HTTPException(404, "The stored floor-plan file is no longer available. Please upload it again.")
    return st.read(fp.storage_key)


@router.get("/projects/{project_id}/floorplans", response_model=list[FloorPlanOut])
def list_floorplans(project_id: uuid.UUID, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    return [FloorPlanOut.model_validate(f) for f in owned_project(db, identity, project_id).floorplans]


@router.post("/projects/{project_id}/floorplans", response_model=FloorPlanOut, status_code=status.HTTP_201_CREATED)
async def upload_floorplan(project_id: uuid.UUID, file: UploadFile = File(...), db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    p = owned_project(db, identity, project_id)
    max_bytes = get_settings().max_upload_mb * 1024 * 1024
    data = await file.read(max_bytes + 1)  # never read more than the limit + 1 byte
    try:
        ctype, w, h = processing.validate_upload(file.filename or "", data, max_bytes)
    except processing.UploadError as e:
        raise HTTPException(413 if "large" in str(e) else 422, str(e)) from None
    key = f"{uuid.uuid4().hex}{_EXT[ctype]}"
    storage_for("floorplans", identity).save(key, data)  # the file lives in Storage, not in the database
    fp = FloorPlan(project_id=p.id, owner_id=uid(identity), original_name=(file.filename or "floorplan")[:255], content_type=ctype,
                   size_bytes=len(data), storage_key=key, width_px=w, height_px=h)
    p.floorplans.append(fp)
    touch(p)
    db.commit()
    db.refresh(fp)
    return FloorPlanOut.model_validate(fp)


@router.get("/floorplans/{fid}/file")
def get_floorplan_file(fid: uuid.UUID, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    fp = _owned_floorplan(db, identity, fid)
    return Response(_stored_bytes(fp, identity), media_type=fp.content_type,
                    headers={"Content-Disposition": f'inline; filename="{fp.storage_key}"', "X-Content-Type-Options": "nosniff"})


@router.put("/floorplans/{fid}/calibration", response_model=FloorPlanOut)
def calibrate(fid: uuid.UUID, body: CalibrationIn, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    fp = _owned_floorplan(db, identity, fid)
    if fp.content_type == "application/pdf":
        raise HTTPException(422, "Scale calibration is available for image floor plans only. Export the PDF page as PNG/JPG or enter dimensions manually.")
    for v, lim in ((body.x1, fp.width_px), (body.x2, fp.width_px), (body.y1, fp.height_px), (body.y2, fp.height_px)):
        if lim and not (0 <= v <= lim):
            raise HTTPException(422, "Calibration points must lie inside the image.")
    try:
        scale = processing.compute_scale(body.x1, body.y1, body.x2, body.y2, body.real_length_m)
    except processing.UploadError as e:
        raise HTTPException(422, str(e)) from None
    fp.scale_m_per_px = scale
    fp.calibration = body.model_dump()
    db.commit()
    db.refresh(fp)
    return FloorPlanOut.model_validate(fp)


@router.post("/floorplans/{fid}/analyze")
def analyze(fid: uuid.UUID, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    """Optional OpenCV pre-processing. Returns a base64 overlay; a visual aid only."""
    fp = _owned_floorplan(db, identity, fid)
    if fp.content_type == "application/pdf":
        raise HTTPException(422, "Image analysis is available for JPG/PNG floor plans only.")
    try:
        res = processing.analyze_image(_stored_bytes(fp, identity))
    except processing.UploadError as e:
        raise HTTPException(422, str(e)) from None
    return {
        "overlay_png_base64": base64.b64encode(res["overlay_png"]).decode(),
        "edges_png_base64": base64.b64encode(res["edges_png"]).decode(),
        "contour_count": res["contour_count"], "image_size": res["image_size"], "disclaimer": res["disclaimer"],
    }


@router.post("/floorplans/{fid}/detect-rooms")
def detect(fid: uuid.UUID, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    """Suggest room rectangles from the image. A heuristic: the user must review and confirm before anything is created."""
    fp = _owned_floorplan(db, identity, fid)
    if fp.content_type == "application/pdf":
        raise HTTPException(422, "Room detection works on JPG/PNG plans. Export the PDF page as an image, or enter rooms manually.")
    try:
        res = processing.detect_rooms(_stored_bytes(fp, identity))
    except processing.UploadError as e:
        raise HTTPException(422, str(e)) from None
    return {
        "rooms": res["rooms"], "image_size": res["image_size"], "warnings": res["warnings"], "disclaimer": res["disclaimer"],
        "overlay_png_base64": base64.b64encode(res["overlay_png"]).decode(), "scale_m_per_px": fp.scale_m_per_px,
    }


@router.delete("/floorplans/{fid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_floorplan(fid: uuid.UUID, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    fp = _owned_floorplan(db, identity, fid)
    key = fp.storage_key
    db.delete(fp)
    db.commit()
    try:
        storage_for("floorplans", identity).delete(key)
    except Exception:  # noqa: BLE001 - a missing file must not block removing the record
        pass
    return Response(status_code=status.HTTP_204_NO_CONTENT)
