# backend/services/event_service.py
"""Experiment event logging — records audit trail for all experiment mutations."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import async_session_factory
from models.experiment_event import ExperimentEvent
from services.permission_helpers import get_experiment_with_permission


async def log_event(
    db: AsyncSession,
    experiment_id: int,
    user_id: int | None,
    action: str,
    resource_type: str | None = None,
    resource_id: int | None = None,
    detail: str | None = None,
) -> ExperimentEvent:
    """Add an event to the session. Does NOT commit — caller's commit flushes it."""
    event = ExperimentEvent(
        experiment_id=experiment_id,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        detail=detail,
    )
    db.add(event)
    return event


async def log_event_standalone(
    experiment_id: int,
    user_id: int | None,
    action: str,
    resource_type: str | None = None,
    resource_id: int | None = None,
    detail: str | None = None,
) -> None:
    """Log event with a standalone session (for worker process)."""
    async with async_session_factory() as db:
        event = ExperimentEvent(
            experiment_id=experiment_id,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            detail=detail,
        )
        db.add(event)
        await db.commit()


async def list_events(
    db: AsyncSession,
    experiment_id: int,
    user_id: int,
    page: int,
    per_page: int,
) -> tuple[list[ExperimentEvent], int] | None:
    """List events for an experiment. Returns None if not authorized."""
    experiment = await get_experiment_with_permission(
        db, experiment_id, user_id, ["admin", "contributor", "viewer"]
    )
    if experiment is None:
        return None

    base = select(ExperimentEvent).where(ExperimentEvent.experiment_id == experiment_id)

    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar_one()

    result = await db.execute(
        base.order_by(ExperimentEvent.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .options(selectinload(ExperimentEvent.user))
    )
    return list(result.scalars().all()), total
