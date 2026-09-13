from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import create_token, decode_token, get_current_user, hash_password, require_roles, verify_password
from app.db.session import get_db
from app.models.entities import User
from app.schemas.auth import AdminCreateUserRequest, AuthResponse, CurrentUserResponse, LoginRequest, RegisterRequest

router = APIRouter(prefix="/api/auth", tags=["Authentication"])
settings = get_settings()


def _response_user(user: User) -> CurrentUserResponse:
    return CurrentUserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
        is_active=user.is_active,
    )


def _set_auth_cookies(response: Response, user: User) -> None:
    response.set_cookie(
        settings.access_cookie_name,
        create_token(user, "access"),
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.access_token_minutes * 60,
        path="/",
    )
    response.set_cookie(
        settings.refresh_cookie_name,
        create_token(user, "refresh"),
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        max_age=settings.refresh_token_days * 24 * 60 * 60,
        path="/api/auth",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(settings.access_cookie_name, path="/")
    response.delete_cookie(settings.refresh_cookie_name, path="/api/auth")


def _find_user_for_login(db: Session, identity: str) -> User | None:
    normalized = identity.strip()
    return db.scalar(
        select(User).where(
            or_(
                User.username.ilike(normalized),
                User.email.ilike(normalized),
            )
        )
    )


@router.post("/login", response_model=AuthResponse)
def login(request: LoginRequest, response: Response, db: Annotated[Session, Depends(get_db)]):
    user = _find_user_for_login(db, request.username)
    if user is None or not user.is_active or not verify_password(request.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username/email or password")

    _set_auth_cookies(response, user)
    return AuthResponse(user=_response_user(user))


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(request: RegisterRequest, response: Response, db: Annotated[Session, Depends(get_db)]):
    username = request.username.strip()
    email = str(request.email).lower().strip()

    existing = db.scalar(
        select(User).where(or_(User.username.ilike(username), User.email.ilike(email)))
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Username or email already exists")

    user = User(
        username=username,
        email=email,
        first_name=request.first_name.strip(),
        last_name=request.last_name.strip(),
        password_hash=hash_password(request.password),
        role="user",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    _set_auth_cookies(response, user)
    return AuthResponse(user=_response_user(user))


@router.post("/refresh", status_code=status.HTTP_204_NO_CONTENT)
def refresh_session(request: Request, response: Response, db: Annotated[Session, Depends(get_db)]):
    refresh_token = request.cookies.get(settings.refresh_cookie_name)
    if not refresh_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No refresh session is available")

    try:
        payload = decode_token(refresh_token, "refresh")
        user_id = UUID(str(payload["sub"]))
    except (HTTPException, ValueError, TypeError):
        _clear_auth_cookies(response)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh session is invalid or expired")

    user = db.scalar(select(User).where(User.id == user_id))
    if user is None or not user.is_active:
        _clear_auth_cookies(response)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User account is unavailable")

    _set_auth_cookies(response, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response):
    _clear_auth_cookies(response)


@router.get("/me", response_model=CurrentUserResponse)
def me(user: Annotated[User, Depends(get_current_user)]):
    return _response_user(user)


@router.post("/admin/users", response_model=CurrentUserResponse, status_code=status.HTTP_201_CREATED)
def admin_create_user(
    request: AdminCreateUserRequest,
    _: Annotated[User, Depends(require_roles("admin"))],
    db: Annotated[Session, Depends(get_db)],
):
    username = request.username.strip()
    email = str(request.email).lower().strip()
    existing = db.scalar(select(User).where(or_(User.username.ilike(username), User.email.ilike(email))))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Username or email already exists")

    user = User(
        username=username,
        email=email,
        first_name=request.first_name.strip() if request.first_name else None,
        last_name=request.last_name.strip() if request.last_name else None,
        password_hash=hash_password(request.password),
        role=request.role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _response_user(user)
