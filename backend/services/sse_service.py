# backend/services/sse_service.py
import asyncio
import json
from collections.abc import AsyncGenerator

import structlog
from sqlalchemy import func, select

from config import settings
from database import async_session_factory
from models.analysis_job import AnalysisJob
from models.experiment import Experiment
from models.notification import Notification
from models.project import ProjectMember

log = structlog.get_logger("sse_service")

ACTIVE_STATUSES = ("queued", "running")
TERMINAL_STATUSES = ("complete", "error", "terminated")


def _format_sse(event: str, data: dict) -> str:
    """Format a single SSE event with event type and JSON data."""
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def _seed_notification_watermark(user_id: int, session) -> int:
    """Get the max notification ID for this user (or 0 if none)."""
    result = await session.execute(
        select(func.max(Notification.id)).where(Notification.user_id == user_id)
    )
    return result.scalar() or 0


async def _query_active_jobs(
    user_id: int, tracked_ids: set[int], session
) -> dict[int, tuple[int, str]]:
    """Query jobs visible to this user that are active or previously tracked.

    Returns {job_id: (experiment_id, status)}.
    """
    query = (
        select(AnalysisJob.id, AnalysisJob.experiment_id, AnalysisJob.status)
        .join(Experiment, Experiment.id == AnalysisJob.experiment_id)
        .join(ProjectMember, ProjectMember.project_id == Experiment.project_id)
        .where(ProjectMember.user_id == user_id)
    )
    if tracked_ids:
        query = query.where(
            AnalysisJob.status.in_(ACTIVE_STATUSES) | AnalysisJob.id.in_(tracked_ids)
        )
    else:
        query = query.where(AnalysisJob.status.in_(ACTIVE_STATUSES))

    result = await session.execute(query)
    return {row.id: (row.experiment_id, row.status) for row in result.all()}


async def sse_event_generator(user_id: int) -> AsyncGenerator[str, None]:
    """Poll notifications and analysis_jobs tables, yield SSE events for changes.

    Each connection tracks watermarks to detect changes since the last poll:
    - last_notification_id: max notification ID seen
    - tracked_jobs: {job_id: status} for active/recently-active jobs
    """
    poll_interval = settings.WORKER_POLL_INTERVAL_SECONDS
    keepalive_interval = settings.SSE_KEEPALIVE_SECONDS
    max_db_errors = 5

    async with async_session_factory() as session:
        try:
            # Seed initial state — no stale event burst on connect
            last_notification_id = await _seed_notification_watermark(user_id, session)
            current_jobs = await _query_active_jobs(user_id, set(), session)
            tracked_jobs: dict[int, str] = {
                jid: status for jid, (_, status) in current_jobs.items()
            }

            consecutive_errors = 0
            polls_since_keepalive = 0
            keepalive_every_n_polls = max(1, keepalive_interval // poll_interval)

            while True:
                await asyncio.sleep(poll_interval)

                try:
                    # --- Check for new notifications ---
                    notif_result = await session.execute(
                        select(Notification.id, Notification.type)
                        .where(
                            Notification.user_id == user_id,
                            Notification.id > last_notification_id,
                        )
                        .order_by(Notification.id)
                    )
                    new_notifications = notif_result.all()

                    for notif in new_notifications:
                        yield _format_sse(
                            "notification",
                            {
                                "id": notif.id,
                                "type": notif.type,
                            },
                        )
                        last_notification_id = notif.id

                    # --- Check for job status changes ---
                    tracked_ids = set(tracked_jobs.keys())
                    current_jobs = await _query_active_jobs(user_id, tracked_ids, session)

                    for job_id, (experiment_id, new_status) in current_jobs.items():
                        old_status = tracked_jobs.get(job_id)
                        if old_status != new_status:
                            yield _format_sse(
                                "job_status",
                                {
                                    "jobId": job_id,
                                    "experimentId": experiment_id,
                                    "status": new_status,
                                },
                            )

                    # Rebuild tracked set: keep active jobs, drop terminal ones
                    tracked_jobs = {
                        jid: status
                        for jid, (_, status) in current_jobs.items()
                        if status not in TERMINAL_STATUSES
                    }

                    # Expire cached ORM state so next poll sees fresh DB data
                    session.expire_all()

                    consecutive_errors = 0
                    polls_since_keepalive += 1

                    # Send keepalive comment if no real events were emitted recently
                    if (
                        not new_notifications
                        and not any(
                            tracked_jobs.get(jid) != status
                            for jid, (_, status) in current_jobs.items()
                        )
                        and polls_since_keepalive >= keepalive_every_n_polls
                    ):
                        yield ": keepalive\n\n"
                        polls_since_keepalive = 0

                except Exception:
                    consecutive_errors += 1
                    log.warning(
                        "sse_poll_error",
                        user_id=user_id,
                        consecutive_errors=consecutive_errors,
                        exc_info=True,
                    )
                    if consecutive_errors >= max_db_errors:
                        log.error(
                            "sse_max_errors_reached",
                            user_id=user_id,
                            max_errors=max_db_errors,
                        )
                        return
                    await asyncio.sleep(poll_interval)

        except asyncio.CancelledError:
            log.debug("sse_client_disconnected", user_id=user_id)
