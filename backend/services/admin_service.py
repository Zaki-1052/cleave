# backend/services/admin_service.py
"""Admin-only service functions for user, project, and job management."""

import shutil
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models.analysis_job import AnalysisJob
from models.experiment import Experiment
from models.project import Project, ProjectMember
from models.user import User
from schemas.admin import AdminStatsResponse


async def list_users(
    db: AsyncSession,
    page: int,
    per_page: int,
    search: str | None = None,
    role: str | None = None,
    active: str | None = None,
) -> tuple[list, int]:
    """List all users with optional filtering. Returns (rows, total)."""
    # Correlated subquery for project count
    project_count_sq = (
        select(func.count())
        .where(ProjectMember.user_id == User.id)
        .correlate(User)
        .scalar_subquery()
        .label("project_count")
    )

    base = select(User, project_count_sq)

    if search:
        like = f"%{search}%"
        base = base.where(
            or_(
                User.email.ilike(like),
                User.first_name.ilike(like),
                User.last_name.ilike(like),
            )
        )

    if role == "superuser":
        base = base.where(User.is_superuser.is_(True))
    elif role == "regular":
        base = base.where(User.is_superuser.is_(False))

    if active == "active":
        base = base.where(User.is_active.is_(True))
    elif active == "inactive":
        base = base.where(User.is_active.is_(False))

    # Count total matching
    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar_one()

    # Fetch page
    result = await db.execute(
        base.order_by(User.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    )
    rows = result.all()

    # Map rows to dicts for Pydantic
    items = []
    for row in rows:
        user = row[0]
        items.append(
            {
                "id": user.id,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "is_active": user.is_active,
                "is_superuser": user.is_superuser,
                "is_verified": user.is_verified,
                "project_count": row[1] or 0,
                "created_at": user.created_at,
            }
        )

    return items, total


async def update_user_admin(
    db: AsyncSession,
    user_id: int,
    current_user_id: int,
    is_superuser: bool | None = None,
    is_active: bool | None = None,
) -> dict | str:
    """Toggle is_superuser / is_active on a user.

    Returns user dict on success, or error string:
    'not_found', 'self', 'last_superuser'.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        return "not_found"

    if user_id == current_user_id:
        return "self"

    # Prevent demoting the last superuser
    if is_superuser is False and user.is_superuser:
        count_result = await db.execute(select(func.count()).where(User.is_superuser.is_(True)))
        superuser_count = count_result.scalar_one()
        if superuser_count <= 1:
            return "last_superuser"

    if is_superuser is not None:
        user.is_superuser = is_superuser
    if is_active is not None:
        user.is_active = is_active

    await db.commit()
    await db.refresh(user)

    # Fetch project count for response
    pc_result = await db.execute(select(func.count()).where(ProjectMember.user_id == user.id))
    project_count = pc_result.scalar_one()

    return {
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "is_active": user.is_active,
        "is_superuser": user.is_superuser,
        "is_verified": user.is_verified,
        "project_count": project_count,
        "created_at": user.created_at,
    }


async def get_system_stats(db: AsyncSession) -> AdminStatsResponse:
    """Compute aggregate system statistics."""
    total_users = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    active_users = (
        await db.execute(select(func.count()).where(User.is_active.is_(True)))
    ).scalar_one()
    total_projects = (await db.execute(select(func.count()).select_from(Project))).scalar_one()
    total_experiments = (
        await db.execute(select(func.count()).select_from(Experiment))
    ).scalar_one()
    total_jobs = (await db.execute(select(func.count()).select_from(AnalysisJob))).scalar_one()

    # Jobs by status
    status_result = await db.execute(
        select(AnalysisJob.status, func.count()).group_by(AnalysisJob.status)
    )
    jobs_by_status = {row[0]: row[1] for row in status_result.all()}

    # Disk info
    storage_root = Path(settings.STORAGE_ROOT)
    disk_total = disk_used = disk_free = 0
    if storage_root.exists():
        usage = shutil.disk_usage(str(storage_root))
        disk_total = usage.total
        disk_used = usage.used
        disk_free = usage.free

    # Storage used across projects
    storage_result = await db.execute(select(func.coalesce(func.sum(Project.storage_bytes), 0)))
    storage_used_bytes = storage_result.scalar_one()

    return AdminStatsResponse(
        total_users=total_users,
        active_users=active_users,
        total_projects=total_projects,
        total_experiments=total_experiments,
        total_jobs=total_jobs,
        jobs_by_status=jobs_by_status,
        storage_used_bytes=storage_used_bytes,
        storage_quota_bytes=settings.STORAGE_QUOTA_BYTES,
        disk_total=disk_total,
        disk_used=disk_used,
        disk_free=disk_free,
    )


async def list_all_projects(
    db: AsyncSession,
    page: int,
    per_page: int,
    search: str | None = None,
) -> tuple[list, int]:
    """List all projects (no member scoping). Returns (items, total)."""
    # Subqueries for counts
    member_count_sq = (
        select(func.count())
        .where(ProjectMember.project_id == Project.id)
        .correlate(Project)
        .scalar_subquery()
        .label("member_count")
    )
    experiment_count_sq = (
        select(func.count())
        .where(Experiment.project_id == Project.id)
        .correlate(Project)
        .scalar_subquery()
        .label("experiment_count")
    )

    base = select(
        Project, User.email.label("creator_email"), member_count_sq, experiment_count_sq
    ).outerjoin(User, Project.created_by == User.id)

    if search:
        base = base.where(Project.name.ilike(f"%{search}%"))

    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar_one()

    result = await db.execute(
        base.order_by(Project.updated_at.desc()).offset((page - 1) * per_page).limit(per_page)
    )
    rows = result.all()

    items = []
    for row in rows:
        project = row[0]
        items.append(
            {
                "id": project.id,
                "name": project.name,
                "description": project.description,
                "created_by": project.created_by,
                "creator_email": row[1],
                "storage_bytes": project.storage_bytes,
                "is_reference": project.is_reference,
                "status": project.status or "new",
                "member_count": row[2] or 0,
                "experiment_count": row[3] or 0,
                "created_at": project.created_at,
                "updated_at": project.updated_at,
            }
        )

    return items, total


async def list_all_jobs(
    db: AsyncSession,
    page: int,
    per_page: int,
    search: str | None = None,
    status: str | None = None,
) -> tuple[list, int]:
    """List all jobs (no member scoping). Returns (items, total)."""
    launcher = User.__table__.alias("launcher")

    base = (
        select(
            AnalysisJob,
            Experiment.name.label("experiment_name"),
            Project.id.label("project_id"),
            Project.name.label("project_name"),
            launcher.c.email.label("launcher_email"),
        )
        .join(Experiment, AnalysisJob.experiment_id == Experiment.id)
        .join(Project, Experiment.project_id == Project.id)
        .outerjoin(launcher, AnalysisJob.launched_by == launcher.c.id)
    )

    if status:
        base = base.where(AnalysisJob.status == status)

    if search:
        like = f"%{search}%"
        base = base.where(
            or_(
                AnalysisJob.name.ilike(like),
                Experiment.name.ilike(like),
                Project.name.ilike(like),
            )
        )

    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar_one()

    result = await db.execute(
        base.order_by(AnalysisJob.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    )
    rows = result.all()

    items = []
    for row in rows:
        job = row[0]
        items.append(
            {
                "id": job.id,
                "experiment_id": job.experiment_id,
                "experiment_name": row[1],
                "project_id": row[2],
                "project_name": row[3],
                "job_type": job.job_type,
                "name": job.name,
                "status": job.status,
                "launched_by": job.launched_by,
                "launcher_email": row[4],
                "started_at": job.started_at,
                "completed_at": job.completed_at,
                "duration_seconds": job.duration_seconds,
                "created_at": job.created_at,
            }
        )

    return items, total


async def force_terminate_job(
    db: AsyncSession,
    job_id: int,
) -> AnalysisJob | str:
    """Force-terminate a job (superuser only, no permission check).

    Returns job on success, or error string: 'not_found', 'conflict'.
    """
    result = await db.execute(select(AnalysisJob).where(AnalysisJob.id == job_id))
    job = result.scalar_one_or_none()
    if job is None:
        return "not_found"

    if job.status not in ("queued", "running"):
        return "conflict"

    now = datetime.now(timezone.utc)
    job.termination_requested_at = now
    job.status = "terminated"
    job.completed_at = now
    if job.started_at:
        job.duration_seconds = int((now - job.started_at).total_seconds())
    else:
        job.duration_seconds = 0

    await db.commit()
    await db.refresh(job)
    return job


async def force_delete_project(
    db: AsyncSession,
    project_id: int,
) -> str | None:
    """Force-delete a project (superuser only).

    Returns None on success, or 'not_found'.
    """
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None:
        return "not_found"

    await db.delete(project)
    await db.commit()

    # Clean up disk files
    project_dir = Path(settings.STORAGE_ROOT) / "projects" / str(project_id)
    if project_dir.exists():
        shutil.rmtree(project_dir, ignore_errors=True)

    return None
