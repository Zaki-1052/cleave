# backend/auth.py
from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, Request
from fastapi_users import BaseUserManager, FastAPIUsers, IntegerIDMixin
from fastapi_users.authentication import AuthenticationBackend, BearerTransport, JWTStrategy
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from models.user import User


async def get_user_db(session: AsyncSession = Depends(get_db)):
    yield SQLAlchemyUserDatabase(session, User)


class UserManager(IntegerIDMixin, BaseUserManager[User, int]):
    reset_password_token_secret = settings.SECRET_KEY
    reset_password_token_lifetime_seconds = settings.RESET_TOKEN_LIFETIME_SECONDS
    verification_token_secret = settings.SECRET_KEY

    async def on_after_register(self, user: User, request: Optional[Request] = None):
        from services.notification_service import create_notification

        session = self.user_db.session
        await create_notification(
            session,
            user.id,
            "welcome",
            "Welcome to Cleave",
            f"Welcome {user.first_name or user.email}! Your account is ready.",
        )

    async def on_after_forgot_password(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        from services.email_service import send_password_reset_email

        await send_password_reset_email(
            to=user.email,
            token=token,
            user_name=user.first_name or user.email,
        )

    async def on_after_reset_password(self, user: User, request: Optional[Request] = None):
        from services.email_service import send_password_reset_confirmation_email

        session = self.user_db.session
        user.password_changed_at = datetime.now(timezone.utc)
        await session.commit()
        await send_password_reset_confirmation_email(
            to=user.email,
            user_name=user.first_name or user.email,
        )


async def get_user_manager(user_db: SQLAlchemyUserDatabase = Depends(get_user_db)):
    yield UserManager(user_db)


# --- JWT Strategies ---


def get_access_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(
        secret=settings.SECRET_KEY,
        lifetime_seconds=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


def get_refresh_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(
        secret=settings.REFRESH_SECRET_KEY,
        lifetime_seconds=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
    )


# --- Auth Backend (Bearer transport for access tokens) ---

bearer_transport = BearerTransport(tokenUrl="/api/v1/auth/login")

auth_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_access_jwt_strategy,
)

# --- FastAPIUsers instance ---

fastapi_users = FastAPIUsers[User, int](
    get_user_manager=get_user_manager,
    auth_backends=[auth_backend],
)

current_active_user = fastapi_users.current_user(active=True)
