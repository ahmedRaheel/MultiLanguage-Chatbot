from collections.abc import Generator

from pwdlib import PasswordHash
from sqlalchemy import create_engine, or_, select, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.db.base import Base

settings = get_settings()
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)
password_hasher = PasswordHash.recommended()


def init_db() -> None:
    """Create fresh-schema objects and bootstrap the configured administrator.

    Existing databases must apply backend/migrations/005_local_jwt_auth.sql first.
    Schema migrations are deliberately not hidden inside application startup.
    """
    # pgvector is required by DocumentChunk and AnswerCache.
    with engine.begin() as connection:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

    Base.metadata.create_all(bind=engine)
    _ensure_bootstrap_admin()


def _ensure_bootstrap_admin() -> None:
    # Import here to avoid an import cycle while SQLAlchemy metadata is initialized.
    from app.models.entities import User

    username = settings.admin_username.strip()
    email = settings.admin_email.strip().lower()

    with SessionLocal.begin() as db:
        admin = db.scalar(
            select(User).where(
                or_(
                    User.username.ilike(username),
                    User.email.ilike(email),
                )
            )
        )

        if admin is None:
            db.add(
                User(
                    username=username,
                    email=email,
                    password_hash=password_hasher.hash(settings.admin_password),
                    role="admin",
                    is_active=True,
                )
            )
            return

        # Recover only a legacy Keycloak-projected bootstrap account. Never reset
        # a valid administrator password on every application restart.
        if admin.password_hash == "!LOCAL_PASSWORD_NOT_SET!":
            admin.password_hash = password_hasher.hash(settings.admin_password)

        admin.role = "admin"
        admin.is_active = True


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
