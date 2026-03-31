# backend/routers/admin.py
"""Admin-only endpoints for system maintenance, user/project/job management."""

import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import current_active_user
from config import settings
from database import get_db
from models.experiment import Experiment
from models.project import Project
from models.user import User
from schemas.admin import (
    AdminJobRead,
    AdminProjectRead,
    AdminStatsResponse,
    AdminUserRead,
    AdminUserUpdate,
)
from schemas.common import PaginatedResponse
from services import admin_service
from services.cleanup_service import run_full_cleanup

router = APIRouter()


def require_superuser(
    current_user: User = Depends(current_active_user),
) -> User:
    """Dependency that gates endpoints to superusers only."""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superuser access required",
        )
    return current_user


# ── System ────────────────────────────────────────────────────────────────


@router.get("/stats", response_model=AdminStatsResponse)
async def get_system_stats(
    _: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate system statistics for the admin dashboard."""
    return await admin_service.get_system_stats(db)


@router.get("/storage-info")
async def get_storage_info(
    _: User = Depends(require_superuser),
):
    """Disk usage and storage quota info."""
    storage_root = Path(settings.STORAGE_ROOT)
    disk_info = {"total": 0, "used": 0, "free": 0}
    if storage_root.exists():
        usage = shutil.disk_usage(str(storage_root))
        disk_info = {"total": usage.total, "used": usage.used, "free": usage.free}

    return {
        "quotaBytes": settings.STORAGE_QUOTA_BYTES,
        "disk": disk_info,
    }


@router.post("/cleanup")
async def trigger_cleanup(
    _: User = Depends(require_superuser),
):
    """Manually trigger storage cleanup (expired logs + stale tus uploads)."""
    return await run_full_cleanup()


# ── Users ─────────────────────────────────────────────────────────────────


@router.get("/users", response_model=PaginatedResponse[AdminUserRead])
async def list_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100, alias="perPage"),
    search: str | None = Query(None),
    role: str | None = Query(None, pattern="^(superuser|regular)$"),
    active: str | None = Query(None, pattern="^(active|inactive)$"),
    _: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """List all users with optional search and role/active filters."""
    items, total = await admin_service.list_users(
        db, page, per_page, search=search, role=role, active=active
    )
    return PaginatedResponse(items=items, total=total, page=page, per_page=per_page)


@router.patch("/users/{user_id}", response_model=AdminUserRead)
async def update_user(
    user_id: int,
    body: AdminUserUpdate,
    current_user: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Toggle is_superuser or is_active on a user."""
    result = await admin_service.update_user_admin(
        db,
        user_id,
        current_user.id,
        is_superuser=body.is_superuser,
        is_active=body.is_active,
    )

    if result == "not_found":
        raise HTTPException(status_code=404, detail="User not found")
    if result == "self":
        raise HTTPException(status_code=400, detail="Cannot modify your own account")
    if result == "last_superuser":
        raise HTTPException(status_code=400, detail="Cannot demote the last superuser")

    return result


# ── Projects ──────────────────────────────────────────────────────────────


@router.get("/projects", response_model=PaginatedResponse[AdminProjectRead])
async def list_projects(
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100, alias="perPage"),
    search: str | None = Query(None),
    _: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """List all projects (not member-scoped)."""
    items, total = await admin_service.list_all_projects(db, page, per_page, search=search)
    return PaginatedResponse(items=items, total=total, page=page, per_page=per_page)


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(
    project_id: int,
    _: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Force-delete a project and all its data."""
    result = await admin_service.force_delete_project(db, project_id)
    if result == "not_found":
        raise HTTPException(status_code=404, detail="Project not found")


# ── Jobs ──────────────────────────────────────────────────────────────────


@router.get("/jobs", response_model=PaginatedResponse[AdminJobRead])
async def list_jobs(
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100, alias="perPage"),
    search: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    _: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """List all jobs (not member-scoped)."""
    items, total = await admin_service.list_all_jobs(
        db, page, per_page, search=search, status=status_filter
    )
    return PaginatedResponse(items=items, total=total, page=page, per_page=per_page)


@router.post("/jobs/{job_id}/terminate", response_model=AdminJobRead)
async def terminate_job(
    job_id: int,
    _: User = Depends(require_superuser),
    db: AsyncSession = Depends(get_db),
):
    """Force-terminate a queued or running job."""
    result = await admin_service.force_terminate_job(db, job_id)

    if result == "not_found":
        raise HTTPException(status_code=404, detail="Job not found")
    if result == "conflict":
        raise HTTPException(status_code=409, detail="Job is not in a terminable state")

    # Build response with experiment/project context
    job = result
    exp_result = await db.execute(
        select(Experiment.name, Project.id, Project.name)
        .join(Project, Experiment.project_id == Project.id)
        .where(Experiment.id == job.experiment_id)
    )
    row = exp_result.one()

    launcher_email = None
    if job.launched_by:
        u_result = await db.execute(select(User.email).where(User.id == job.launched_by))
        launcher_email = u_result.scalar_one_or_none()

    return {
        "id": job.id,
        "experiment_id": job.experiment_id,
        "experiment_name": row[0],
        "project_id": row[1],
        "project_name": row[2],
        "job_type": job.job_type,
        "name": job.name,
        "status": job.status,
        "launched_by": job.launched_by,
        "launcher_email": launcher_email,
        "started_at": job.started_at,
        "completed_at": job.completed_at,
        "duration_seconds": job.duration_seconds,
        "created_at": job.created_at,
    }
