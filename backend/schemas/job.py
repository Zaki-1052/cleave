# backend/schemas/job.py
from datetime import datetime
from typing import Any

from pydantic import ConfigDict, Field

from schemas.common import CamelModel
from schemas.project import UserBrief


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
    launcher: UserBrief | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_seconds: int | None = None
    error_message: str | None = None
    methods_text: str | None = None
    created_at: datetime


class JobOutputRead(CamelModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_id: int
    reaction_id: int | None = None
    file_category: str
    filename: str
    file_path: str
    file_type: str | None = None
    file_size_bytes: int | None = None
    created_at: datetime
