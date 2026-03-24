# backend/schemas/auth.py
from fastapi_users import schemas as fu_schemas


class UserCreate(fu_schemas.BaseUserCreate):
    first_name: str | None = None
    last_name: str | None = None


class UserUpdate(fu_schemas.BaseUserUpdate):
    first_name: str | None = None
    last_name: str | None = None
    email_notifications: str | None = None
