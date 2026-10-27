from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.projects import owned_project, uid
from app.core.auth import Identity, current_identity
from app.core.db import get_db
from app.models import Project, Report
from app.schemas import ReportOut, RoomOut
from app.services.estimate_service import compute_estimate, save_estimate
from app.services.estimation import EstimationError
from app.services.reports.pdf import build_report_pdf
from app.services.storage import storage_for

router = APIRouter(tags=["reports"])


def _owned_report(db: Session, identity: Identity, rid: uuid.UUID) -> Report:
    rep = db.scalar(select(Report).where(Report.id == str(rid)))
    if rep is None or rep.owner_id != uid(identity):
        raise HTTPException(404, "Report not found.")
    return rep


@router.post("/projects/{project_id}/report", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
def create_report(project_id: uuid.UUID, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    """Always regenerated from the CURRENT saved project data, so a PDF can never be stale or empty."""
    me = uid(identity)
    p = owned_project(db, identity, project_id)
    try:
        payload = compute_estimate(db, me, p)
    except EstimationError as e:
        raise HTTPException(422, f"Cannot generate a report: {e}") from None
    est = save_estimate(db, me, p, payload)
    p = owned_project(db, identity, project_id)
    data = {
        "project": {c.name: getattr(p, c.name) for c in Project.__table__.columns},
        "rooms": [RoomOut.model_validate(r).model_dump() for r in p.rooms],
        "estimate": payload, "recommendations": payload["recommendations"],
        "generated_at": datetime.now(timezone.utc).strftime("%d %B %Y, %H:%M UTC"), "user_name": identity.full_name or identity.email,
    }
    pdf = build_report_pdf(data)
    safe = re.sub(r"[^A-Za-z0-9_-]+", "_", p.name).strip("_")[:50] or "project"
    key = f"{uuid.uuid4().hex}.pdf"
    storage_for("reports", identity).save(key, pdf)
    rep = Report(project_id=p.id, owner_id=me, estimate_id=est.id, file_name=f"Buildora_{safe}_{datetime.now().strftime('%Y%m%d')}.pdf",
                 storage_key=key, size_bytes=len(pdf), total_cost=payload["summary"]["material_total"], currency=p.currency)
    db.add(rep)
    db.commit()
    db.refresh(rep)
    return ReportOut.model_validate(rep)


@router.get("/reports", response_model=list[ReportOut])
def list_reports(db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    rows = db.scalars(select(Report).where(Report.owner_id == uid(identity)).order_by(Report.created_at.desc()))
    return [ReportOut.model_validate(r) for r in rows]


@router.get("/reports/{rid}/download")
def download_report(rid: uuid.UUID, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    rep = _owned_report(db, identity, rid)
    st = storage_for("reports", identity)
    if not st.exists(rep.storage_key):
        raise HTTPException(404, "The report file is no longer available. Generate it again.")
    return Response(st.read(rep.storage_key), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{rep.file_name}"', "X-Content-Type-Options": "nosniff"})


@router.delete("/reports/{rid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report(rid: uuid.UUID, db: Session = Depends(get_db), identity: Identity = Depends(current_identity)):
    rep = _owned_report(db, identity, rid)
    key = rep.storage_key
    db.delete(rep)
    db.commit()
    try:
        storage_for("reports", identity).delete(key)
    except Exception:  # noqa: BLE001 - a missing file must not block removing the record
        pass
    return Response(status_code=status.HTTP_204_NO_CONTENT)
