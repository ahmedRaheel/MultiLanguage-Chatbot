from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.security import get_current_user
from app.models.entities import User
from app.schemas.auth import CurrentUserResponse

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.get("/me", response_model=CurrentUserResponse)
def me(user: Annotated[User, Depends(get_current_user)]):
    return CurrentUserResponse(
        id=user.id,
        username=user.username,
        role=user.role,
        is_active=user.is_active,
    )
