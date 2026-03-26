# backend/services/permission_helpers.py
"""Shared permission helpers for experiment-level access checks."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.experiment import Experiment
from models.project import ProjectMember


async def get_experiment_with_permission(
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


async def check_experiment_membership(
    db: AsyncSession, experiment_id: int, user_id: int
) -> Experiment | None:
    """Fetch experiment if user is a member of its project (any role)."""
    result = await db.execute(
        select(Experiment)
        .join(ProjectMember, ProjectMember.project_id == Experiment.project_id)
        .where(
            Experiment.id == experiment_id,
            ProjectMember.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()
