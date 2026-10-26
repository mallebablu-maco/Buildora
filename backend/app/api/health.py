from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter(tags=["system"])


@router.get("/health")
def health() -> dict:
    """Liveness check used by Render. Does not touch any external service."""
    return {"status": "ok", "service": "buildora-api", "auth_configured": get_settings().auth_configured}
