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


class JobUpdate(CamelModel):
    notes: str | None = None


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


class JobQueueRead(CamelModel):
    """Lean job schema for the cross-project Analysis Queue page."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    experiment_id: int
    experiment_name: str
    project_id: int
    project_name: str
    job_type: str
    name: str
    status: str = "queued"
    launched_by: int | None = None
    launcher: UserBrief | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_seconds: int | None = None
    created_at: datetime

    @classmethod
    def from_job(cls, job) -> "JobQueueRead":
        """Build from an AnalysisJob with eagerly-loaded experiment.project and launcher."""
        return cls(
            id=job.id,
            experiment_id=job.experiment_id,
            experiment_name=job.experiment.name,
            project_id=job.experiment.project_id,
            project_name=job.experiment.project.name,
            job_type=job.job_type,
            name=job.name,
            status=job.status,
            launched_by=job.launched_by,
            launcher=(
                UserBrief.model_validate(job.launcher, from_attributes=True)
                if job.launcher
                else None
            ),
            started_at=job.started_at,
            completed_at=job.completed_at,
            duration_seconds=job.duration_seconds,
            created_at=job.created_at,
        )


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
