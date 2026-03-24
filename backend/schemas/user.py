# backend/schemas/user.py
from datetime import datetime

from pydantic import ConfigDict

from schemas.common import CamelModel


class UserRead(CamelModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    is_active: bool = True
    first_name: str | None = None
    last_name: str | None = None
    email_notifications: str = "always"
    created_at: datetime


class UserUpdate(CamelModel):
    first_name: str | None = None
    last_name: str | None = None
    email_notifications: str | None = None
