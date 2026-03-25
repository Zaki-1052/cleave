# backend/services/experiment_service.py
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.experiment import Experiment
from models.project import ProjectMember
from schemas.experiment import ExperimentCreate, ExperimentUpdate


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
    await db.delete(experiment)
    await db.commit()
    return True
