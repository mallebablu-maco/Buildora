from fastapi import APIRouter, Depends

from app.core.auth import Identity, current_identity

router = APIRouter(tags=["account"])


@router.get("/me")
def me(identity: Identity = Depends(current_identity)) -> dict:
    """The verified caller. Proves the whole chain: Supabase sign-in -> browser token -> API verification."""
    return identity.public()
