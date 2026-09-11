from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import decode_token, get_current_user, require_roles, sync_application_user
from app.db.session import get_db
from app.models.entities import User
from app.schemas.auth import AdminCreateUserRequest, AuthResponse, CurrentUserResponse, LoginRequest, RegisterRequest
from app.services.keycloak import keycloak_service

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
settings = get_settings()


def _set_auth_cookies(response: Response, token_payload: dict) -> None:
    response.set_cookie(
        settings.access_cookie_name,
        token_payload["access_token"],
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=int(token_payload.get("expires_in", 300)),
        path="/",
    )
    response.set_cookie(
        settings.refresh_cookie_name,
        token_payload["refresh_token"],
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=int(token_payload.get("refresh_expires_in", 1800)),
        path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(settings.access_cookie_name, path="/")
    response.delete_cookie(settings.refresh_cookie_name, path="/")


def _response_user(user: User) -> CurrentUserResponse:
    return CurrentUserResponse(
        id=user.id,
        username=user.username,
        role=user.role,
        is_active=user.is_active,
    )


@router.post("/login", response_model=AuthResponse)
async def login(
    request: LoginRequest,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
):
    tokens = await keycloak_service.password_login(request.username, request.password)
    user = sync_application_user(db, decode_token(tokens["access_token"]))
    _set_auth_cookies(response, tokens)
    return AuthResponse(user=_response_user(user))


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: RegisterRequest,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
):
    # Public registration never accepts a role. The backend always assigns only `user`.
    await keycloak_service.register_user(
        username=request.username,
        email=str(request.email),
        password=request.password,
        first_name=request.first_name,
        last_name=request.last_name,
    )

    tokens = await keycloak_service.password_login(request.username, request.password)
    user = sync_application_user(db, decode_token(tokens["access_token"]))
    if user.role != "user":
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "New registrations must receive the user role")

    _set_auth_cookies(response, tokens)
    return AuthResponse(user=_response_user(user))


@router.post("/refresh", status_code=status.HTTP_204_NO_CONTENT)
async def refresh_session(request: Request, response: Response):
    refresh_token = request.cookies.get(settings.refresh_cookie_name)
    if not refresh_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No refresh session is available")

    tokens = await keycloak_service.refresh(refresh_token)
    _set_auth_cookies(response, tokens)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response):
    refresh_token = request.cookies.get(settings.refresh_cookie_name)
    await keycloak_service.logout(refresh_token)
    _clear_auth_cookies(response)


@router.get("/me", response_model=CurrentUserResponse)
def me(user: Annotated[User, Depends(get_current_user)]):
    return _response_user(user)


@router.post("/admin/users", status_code=status.HTTP_201_CREATED)
async def create_user_by_admin(
    request: AdminCreateUserRequest,
    _: Annotated[User, Depends(require_roles("admin"))],
):
    await keycloak_service.create_user_by_admin(
        username=request.username,
        email=str(request.email),
        password=request.password,
        role=request.role,
    )
    return {"message": f"{request.role.capitalize()} account created successfully"}
