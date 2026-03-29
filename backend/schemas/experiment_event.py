# backend/schemas/experiment_event.py
from datetime import datetime

from pydantic import ConfigDict

from schemas.common import CamelModel
from schemas.project import UserBrief


class ExperimentEventRead(CamelModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    experiment_id: int
    user_id: int | None = None
    user: UserBrief | None = None
    action: str
    resource_type: str | None = None
    resource_id: int | None = None
    detail: str | None = None
    created_at: datetime
