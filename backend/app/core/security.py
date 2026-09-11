from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError, PyJWKClient, PyJWKClientError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.models.entities import User

settings = get_settings()
bearer_scheme = HTTPBearer(auto_error=True)
jwks_client = PyJWKClient(settings.keycloak_jwks_url)


def _extract_role(payload: dict) -> str:
    realm_access = payload.get("realm_access") or {}
    roles = set(realm_access.get("roles") or [])
    return "admin" if "admin" in roles else "user"


def _decode_token(token: str) -> dict:
    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=settings.keycloak_issuer,
            options={"verify_aud": False},
        )
    except (InvalidTokenError, PyJWKClientError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    # Keycloak access tokens issued to the SPA carry the authorized party in azp.
    if payload.get("azp") != settings.keycloak_client_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token was not issued for this application",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload


def _sync_application_user(db: Session, payload: dict) -> User:
    subject = str(payload["sub"])
    username = str(payload.get("preferred_username") or subject)
    email = payload.get("email")
    role = _extract_role(payload)

    user = db.scalar(select(User).where(User.keycloak_subject == subject))

    if user is None:
        user = User(
            keycloak_subject=subject,
            username=username,
            email=email,
            role=role,
            is_active=True,
        )
        db.add(user)
    else:
        user.username = username
        user.email = email
        user.role = role
        user.is_active = True

    db.commit()
    db.refresh(user)
    return user


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    payload = _decode_token(credentials.credentials)
    return _sync_application_user(db, payload)


def require_roles(*allowed_roles: str):
    async def dependency(
        user: Annotated[User, Depends(get_current_user)],
    ) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return user

    return dependency
