# backend/services/permission_helpers.py
"""Shared permission helpers for experiment-level access checks."""

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.experiment import Experiment
from models.project import Project, ProjectMember


async def get_experiment_with_permission(
    db: AsyncSession, experiment_id: int, user_id: int, roles: list[str]
) -> Experiment | None:
    """Fetch experiment if user is a project member with one of the given roles.

    Reference projects always return None — this function gates write operations.
    """
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


async def check_experiment_membership(
    db: AsyncSession, experiment_id: int, user_id: int
) -> Experiment | None:
    """Fetch experiment if user is a member of its project (any role) OR project is a reference."""
    result = await db.execute(
        select(Experiment)
        .join(Project, Project.id == Experiment.project_id)
        .outerjoin(
            ProjectMember,
            and_(
                ProjectMember.project_id == Experiment.project_id,
                ProjectMember.user_id == user_id,
            ),
        )
        .where(
            Experiment.id == experiment_id,
            or_(ProjectMember.user_id.isnot(None), Project.is_reference.is_(True)),
        )
    )
    return result.scalar_one_or_none()


async def is_reference_experiment(db: AsyncSession, experiment_id: int) -> bool:
    """Check if an experiment belongs to a reference project."""
    result = await db.execute(
        select(Project.is_reference)
        .join(Experiment, Experiment.project_id == Project.id)
        .where(Experiment.id == experiment_id)
    )
    val = result.scalar_one_or_none()
    return val is True
