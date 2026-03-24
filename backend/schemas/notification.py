# backend/schemas/notification.py
from datetime import datetime

from pydantic import ConfigDict

from schemas.common import CamelModel


class NotificationRead(CamelModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    type: str
    title: str
    message: str
    link_target: str | None = None
    is_read: bool = False
    created_at: datetime
