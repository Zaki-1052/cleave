# backend/schemas/admin.py
"""Schemas for the superuser admin panel."""

from datetime import datetime

from pydantic import ConfigDict

from schemas.common import CamelModel


class AdminUserRead(CamelModel):
    """User record for admin panel with aggregate stats."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    first_name: str | None = None
    last_name: str | None = None
    is_active: bool = True
    is_superuser: bool = False
    is_verified: bool = False
    project_count: int = 0
    created_at: datetime


class AdminUserUpdate(CamelModel):
    """Toggleable fields for admin user management."""

    is_superuser: bool | None = None
    is_active: bool | None = None


class AdminProjectRead(CamelModel):
    """Project record for admin panel with ownership and aggregate stats."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    created_by: int | None = None
    creator_email: str | None = None
    storage_bytes: int = 0
    is_reference: bool = False
    status: str = "new"
    member_count: int = 0
    experiment_count: int = 0
    created_at: datetime
    updated_at: datetime


class AdminJobRead(CamelModel):
    """Job record for admin panel with project/experiment context."""

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
    launcher_email: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    duration_seconds: int | None = None
    created_at: datetime


class AdminStatsResponse(CamelModel):
    """Dashboard aggregate statistics."""

    total_users: int
    active_users: int
    total_projects: int
    total_experiments: int
    total_jobs: int
    jobs_by_status: dict[str, int]
    storage_used_bytes: int
    storage_quota_bytes: int
    disk_total: int
    disk_used: int
    disk_free: int
