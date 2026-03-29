# backend/services/job_service.py
"""Job CRUD service — create, get, and list analysis jobs."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.analysis_job import AnalysisJob
from models.experiment import Experiment
from models.job_output import JobOutput
from models.project import ProjectMember
from schemas.job import JobCreate
from services.event_service import log_event
from services.permission_helpers import get_experiment_with_permission


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
    """Fetch a job by ID if user has access to its experiment's project."""
    result = await db.execute(
        select(AnalysisJob)
        .join(Experiment, Experiment.id == AnalysisJob.experiment_id)
        .join(ProjectMember, ProjectMember.project_id == Experiment.project_id)
        .where(
            AnalysisJob.id == job_id,
            ProjectMember.user_id == user_id,
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
    """List all jobs across projects the user is a member of."""
    from models.project import Project

    base = (
        select(AnalysisJob)
        .join(Experiment, Experiment.id == AnalysisJob.experiment_id)
        .join(ProjectMember, ProjectMember.project_id == Experiment.project_id)
        .where(ProjectMember.user_id == user_id)
    )
    if status is not None:
        base = base.where(AnalysisJob.status == status)
    if job_type is not None:
        base = base.where(AnalysisJob.job_type == job_type)
    if search is not None:
        like = f"%{search}%"
        base = base.join(Project, Project.id == Experiment.project_id, isouter=True).where(
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
    experiment = await get_experiment_with_permission(
        db, experiment_id, user_id, ["admin", "contributor", "viewer"]
    )
    if experiment is None:
        return None

    base = select(AnalysisJob).where(AnalysisJob.experiment_id == experiment_id)

    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar_one()

    result = await db.execute(
        base.order_by(AnalysisJob.created_at.desc()).offset((page - 1) * per_page).limit(per_page)
    )
    return list(result.scalars().all()), total
