# backend/schemas/job.py
from datetime import datetime
from typing import Any

from pydantic import ConfigDict, Field

from schemas.common import CamelModel


class JobCreate(CamelModel):
    job_type: str
    name: str = Field(..., max_length=30)
    notes: str | None = None
    params: dict[str, Any] = {}
    parent_job_id: int | None = None


class JobRead(CamelModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    experiment_id: int
    job_type: str
    name: str
    notes: str | None = None
    status: str = "queued"
    params: dict[str, Any] = {}
    parent_job_id: int | None = None
    launched_by: int | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_seconds: int | None = None
    error_message: str | None = None
    methods_text: str | None = None
    created_at: datetime
