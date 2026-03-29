# backend/services/experiment_service.py
import shutil
from pathlib import Path

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from config import settings
from models.experiment import Experiment
from models.project import Project, ProjectMember
from schemas.experiment import ExperimentCreate, ExperimentUpdate
from services.event_service import log_event


async def create_experiment(
    db: AsyncSession, project_id: int, data: ExperimentCreate, creator_id: int
) -> Experiment | None:
    # Verify creator is a project member with create permissions
    member_result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == creator_id,
            ProjectMember.role.in_(["admin", "contributor"]),
        )
    )
    if member_result.scalar_one_or_none() is None:
        return None

    experiment = Experiment(
        project_id=project_id,
        name=data.name,
        assay_type=data.assay_type,
        description=data.description,
        created_by=creator_id,
    )
    db.add(experiment)
    await db.commit()

    # Re-fetch with creator relationship loaded
    result = await db.execute(
        select(Experiment)
        .where(Experiment.id == experiment.id)
        .options(selectinload(Experiment.creator))
    )
    return result.scalar_one()


async def list_experiments(
    db: AsyncSession,
    user_id: int,
    project_id: int | None,
    page: int,
    per_page: int,
) -> tuple[list[Experiment], int]:
    base = (
        select(Experiment)
        .join(ProjectMember, ProjectMember.project_id == Experiment.project_id)
        .where(ProjectMember.user_id == user_id)
    )
    if project_id is not None:
        base = base.where(Experiment.project_id == project_id)
    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar_one()
    result = await db.execute(
        base.options(selectinload(Experiment.creator))
        .order_by(Experiment.updated_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    return list(result.scalars().all()), total


async def get_experiment(db: AsyncSession, experiment_id: int, user_id: int) -> Experiment | None:
    result = await db.execute(
        select(Experiment)
        .join(ProjectMember, ProjectMember.project_id == Experiment.project_id)
        .where(Experiment.id == experiment_id, ProjectMember.user_id == user_id)
        .options(selectinload(Experiment.creator))
    )
    return result.scalar_one_or_none()


async def update_experiment(
    db: AsyncSession, experiment_id: int, data: ExperimentUpdate, user_id: int
) -> Experiment | None:
    result = await db.execute(
        select(Experiment)
        .join(ProjectMember, ProjectMember.project_id == Experiment.project_id)
        .where(
            Experiment.id == experiment_id,
            ProjectMember.user_id == user_id,
            ProjectMember.role.in_(["admin", "contributor"]),
        )
        .options(selectinload(Experiment.creator))
    )
    experiment = result.scalar_one_or_none()
    if experiment is None:
        return None
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(experiment, field, value)

    changed_fields = list(update_data.keys())
    await log_event(
        db,
        experiment_id,
        user_id,
        action="metadata_updated",
        resource_type="experiment",
        detail=f"Updated {', '.join(changed_fields)}",
    )
    await db.commit()
    await db.refresh(experiment)
    return experiment


async def delete_experiment(db: AsyncSession, experiment_id: int, user_id: int) -> bool:
    result = await db.execute(
        select(Experiment)
        .join(ProjectMember, ProjectMember.project_id == Experiment.project_id)
        .where(
            Experiment.id == experiment_id,
            ProjectMember.user_id == user_id,
            ProjectMember.role.in_(["admin", "contributor"]),
        )
    )
    experiment = result.scalar_one_or_none()
    if experiment is None:
        return False

    project_id = experiment.project_id
    storage_bytes = experiment.storage_bytes or 0

    await db.delete(experiment)

    # Decrement project storage_bytes by the experiment's tracked usage
    if storage_bytes > 0:
        await db.execute(
            update(Project)
            .where(Project.id == project_id)
            .values(storage_bytes=Project.storage_bytes - storage_bytes)
        )

    await db.commit()

    # Clean up disk files after successful commit
    experiment_dir = Path(settings.STORAGE_ROOT) / "projects" / str(project_id) / str(experiment_id)
    if experiment_dir.exists():
        shutil.rmtree(experiment_dir, ignore_errors=True)

    return True
