import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import get_engine

router = APIRouter(tags=["system"])
log = logging.getLogger("buildora.health")


@router.get("/health")
def health() -> dict:
    """Liveness check used by Render. Does not touch any external service, so a sleeping database cannot fail a deploy."""
    return {"status": "ok", "service": "buildora-api", "auth_configured": get_settings().auth_configured}


@router.get("/health/ready")
def ready():
    """Readiness: also checks the database connection (503 when it is missing or unreachable)."""
    s = get_settings()
    body = {"service": "buildora-api", "auth_configured": s.auth_configured, "database": "not configured"}
    if not s.db_configured:
        return JSONResponse({"status": "unavailable", **body}, status_code=503)
    try:
        with get_engine().connect() as conn:
            conn.execute(text("select 1"))
    except Exception:  # never leak connection details to the caller
        log.exception("readiness check: database unreachable")
        return JSONResponse({"status": "unavailable", **body, "database": "unreachable"}, status_code=503)
    return {"status": "ok", **body, "database": "ok"}
