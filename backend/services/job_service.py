# backend/services/job_service.py
"""Job CRUD service — create, get, and list analysis jobs."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.analysis_job import AnalysisJob
from models.experiment import Experiment
from models.project import ProjectMember
from schemas.job import JobCreate


async def _get_experiment_with_permission(
    db: AsyncSession, experiment_id: int, user_id: int, roles: list[str]
) -> Experiment | None:
    """Fetch experiment if user is a project member with one of the given roles."""
    result = await db.execute(
        select(Experiment)
        .join(ProjectMember, ProjectMember.project_id == Experiment.project_id)
        .where(
            Experiment.id == experiment_id,
            ProjectMember.user_id == user_id,
            ProjectMember.role.in_(roles),
        )
    )
    return result.scalar_one_or_none()


async def create_job(
    db: AsyncSession,
    experiment_id: int,
    user_id: int,
    job_create: JobCreate,
) -> AnalysisJob | None:
    """Create a queued analysis job. Returns None if unauthorized."""
    experiment = await _get_experiment_with_permission(
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
        .options(selectinload(AnalysisJob.outputs))
    )
    return result.scalar_one_or_none()


async def list_jobs_for_experiment(
    db: AsyncSession,
    experiment_id: int,
    user_id: int,
    page: int,
    per_page: int,
) -> tuple[list[AnalysisJob], int] | None:
    """List jobs for an experiment. Returns None if unauthorized."""
    experiment = await _get_experiment_with_permission(
        db, experiment_id, user_id, ["admin", "contributor", "viewer"]
    )
    if experiment is None:
        return None

    base = select(AnalysisJob).where(AnalysisJob.experiment_id == experiment_id)

    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar_one()

    result = await db.execute(
        base.order_by(AnalysisJob.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    return list(result.scalars().all()), total
