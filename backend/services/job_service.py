# backend/services/job_service.py
"""Job CRUD service — create, get, list, terminate, and retry analysis jobs."""

from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from config import settings
from models.analysis_job import AnalysisJob
from models.experiment import Experiment
from models.job_output import JobOutput
from models.project import Project, ProjectMember
from schemas.job import JobCreate
from services.event_service import log_event
from services.permission_helpers import check_experiment_membership, get_experiment_with_permission


async def create_job(
    db: AsyncSession,
    experiment_id: int,
    user_id: int,
    job_create: JobCreate,
) -> AnalysisJob | None:
    """Create a queued analysis job. Returns None if unauthorized."""
    experiment = await get_experiment_with_permission(
        db, experiment_id, user_id, ["admin", "contributor"]
    )
    if experiment is None:
        return None

    job = AnalysisJob(
        experiment_id=experiment_id,
        job_type=job_create.job_type,
        name=job_create.name,
        notes=job_create.notes,
        params=job_create.params,
        parent_job_id=job_create.parent_job_id,
        launched_by=user_id,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    await log_event(
        db,
        experiment_id,
        user_id,
        action="job_launched",
        resource_type="job",
        resource_id=job.id,
        detail=f"Launched {job_create.job_type} job '{job_create.name}'",
    )
    await db.commit()
    return job


async def get_job(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> AnalysisJob | None:
    """Fetch a job by ID if user has access (project member or reference project)."""
    result = await db.execute(
        select(AnalysisJob)
        .join(Experiment, Experiment.id == AnalysisJob.experiment_id)
        .join(Project, Project.id == Experiment.project_id)
        .outerjoin(
            ProjectMember,
            and_(
                ProjectMember.project_id == Experiment.project_id,
                ProjectMember.user_id == user_id,
            ),
        )
        .where(
            AnalysisJob.id == job_id,
            or_(ProjectMember.user_id.isnot(None), Project.is_reference.is_(True)),
        )
        .options(
            selectinload(AnalysisJob.outputs),
            selectinload(AnalysisJob.launcher),
        )
    )
    return result.scalar_one_or_none()


async def update_job_notes(
    db: AsyncSession,
    job_id: int,
    user_id: int,
    notes: str | None,
) -> AnalysisJob | None:
    """Update notes on a job. Returns None if unauthorized or not found."""
    job = await get_job(db, job_id, user_id)
    if job is None:
        return None

    # Verify user has edit permission (admin or contributor)
    experiment = await get_experiment_with_permission(
        db, job.experiment_id, user_id, ["admin", "contributor"]
    )
    if experiment is None:
        return None

    job.notes = notes
    await db.commit()
    await db.refresh(job)
    return job


async def get_job_outputs(
    db: AsyncSession,
    job_id: int,
    user_id: int,
    category: str | None = None,
) -> list[JobOutput] | None:
    """List output files for a job. Returns None if unauthorized."""
    # Verify user has access to this job's project
    job = await get_job(db, job_id, user_id)
    if job is None:
        return None

    stmt = select(JobOutput).where(JobOutput.job_id == job_id)
    if category is not None:
        stmt = stmt.where(JobOutput.file_category == category)
    stmt = stmt.order_by(JobOutput.filename)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def list_all_jobs_for_user(
    db: AsyncSession,
    user_id: int,
    page: int,
    per_page: int,
    status: str | None = None,
    job_type: str | None = None,
    search: str | None = None,
) -> tuple[list[AnalysisJob], int]:
    """List all jobs across projects the user is a member of (+ reference projects)."""
    base = (
        select(AnalysisJob)
        .join(Experiment, Experiment.id == AnalysisJob.experiment_id)
        .join(Project, Project.id == Experiment.project_id)
        .outerjoin(
            ProjectMember,
            and_(
                ProjectMember.project_id == Experiment.project_id,
                ProjectMember.user_id == user_id,
            ),
        )
        .where(or_(ProjectMember.user_id.isnot(None), Project.is_reference.is_(True)))
    )
    if status is not None:
        base = base.where(AnalysisJob.status == status)
    if job_type is not None:
        base = base.where(AnalysisJob.job_type == job_type)
    if search is not None:
        like = f"%{search}%"
        base = base.where(
            AnalysisJob.name.ilike(like) | Experiment.name.ilike(like) | Project.name.ilike(like)
        )

    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar_one()

    result = await db.execute(
        base.order_by(AnalysisJob.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .options(
            selectinload(AnalysisJob.launcher),
            selectinload(AnalysisJob.experiment).selectinload(Experiment.project),
        )
    )
    return list(result.scalars().unique().all()), total


async def list_jobs_for_experiment(
    db: AsyncSession,
    experiment_id: int,
    user_id: int,
    page: int,
    per_page: int,
) -> tuple[list[AnalysisJob], int] | None:
    """List jobs for an experiment. Returns None if unauthorized."""
    experiment = await check_experiment_membership(db, experiment_id, user_id)
    if experiment is None:
        return None

    base = select(AnalysisJob).where(AnalysisJob.experiment_id == experiment_id)

    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar_one()

    result = await db.execute(
        base.order_by(AnalysisJob.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    )
    return list(result.scalars().all()), total


async def terminate_job(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> AnalysisJob | None | str:
    """Terminate a queued or running job.

    Returns job on success, None if not found, or 'conflict' string.
    """
    job = await get_job(db, job_id, user_id)
    if job is None:
        return None

    # Must have admin or contributor role
    experiment = await get_experiment_with_permission(
        db, job.experiment_id, user_id, ["admin", "contributor"]
    )
    if experiment is None:
        return None

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

    await log_event(
        db,
        job.experiment_id,
        user_id,
        action="job_terminated",
        resource_type="job",
        resource_id=job.id,
        detail=f"Terminated {job.job_type} job '{job.name}'",
    )

    await db.commit()
    await db.refresh(job)
    return job


async def retry_job(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> AnalysisJob | None | str:
    """Retry a failed or terminated job by creating a new one with same params."""
    job = await get_job(db, job_id, user_id)
    if job is None:
        return None

    experiment = await get_experiment_with_permission(
        db, job.experiment_id, user_id, ["admin", "contributor"]
    )
    if experiment is None:
        return None

    if job.status not in ("error", "terminated"):
        return "conflict"

    new_job = AnalysisJob(
        experiment_id=job.experiment_id,
        job_type=job.job_type,
        name=job.name,
        params=dict(job.params) if job.params else {},
        parent_job_id=job.parent_job_id,
        retry_of_job_id=job.id,
        launched_by=user_id,
        auto_pipeline=job.auto_pipeline,
    )
    db.add(new_job)

    # If this is an auto-pipeline job, reset the experiment status so the chain resumes
    if job.auto_pipeline:
        await db.execute(
            update(Experiment)
            .where(Experiment.id == job.experiment_id)
            .values(auto_pipeline_status="running")
        )

    await db.commit()
    await db.refresh(new_job)

    await log_event(
        db,
        job.experiment_id,
        user_id,
        action="job_retried",
        resource_type="job",
        resource_id=new_job.id,
        detail=f"Retried {job.job_type} job '{job.name}' (original #{job.id})",
    )
    await db.commit()
    return new_job


async def get_job_log_tail(
    db: AsyncSession,
    job_id: int,
    user_id: int,
    lines: int = 50,
) -> dict | None:
    """Return the last N lines of a job's pipeline log. None if unauthorized."""
    job = await get_job(db, job_id, user_id)
    if job is None:
        return None

    # Resolve project_id from experiment
    exp_result = await db.execute(
        select(Experiment.project_id).where(Experiment.id == job.experiment_id)
    )
    row = exp_result.one_or_none()
    if row is None:
        return {"log_tail": "", "total_lines": 0}

    project_id = row.project_id
    logs_dir = (
        Path(settings.STORAGE_ROOT)
        / "projects"
        / str(project_id)
        / str(job.experiment_id)
        / "jobs"
        / str(job_id)
        / "logs"
    )

    if not logs_dir.exists():
        return {"log_tail": "", "total_lines": 0}

    # Find any .log file in the logs directory
    log_files = sorted(logs_dir.glob("*.log"))
    if not log_files:
        return {"log_tail": "", "total_lines": 0}

    # Use the first (typically only) log file
    log_path = log_files[0]
    try:
        all_lines = log_path.read_text(errors="replace").splitlines()
    except OSError:
        return {"log_tail": "", "total_lines": 0}

    total = len(all_lines)
    tail = all_lines[-lines:] if len(all_lines) > lines else all_lines
    return {"log_tail": "\n".join(tail), "total_lines": total}
