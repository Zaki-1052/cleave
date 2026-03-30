# backend/worker.py
"""Standalone worker process — polls analysis_jobs table and runs pipelines."""

import asyncio
import time
from datetime import datetime, timezone
from pathlib import Path

import structlog
from sqlalchemy import create_engine, func, select, text, update

from config import settings
from database import async_session_factory
from logging_config import setup_logging
from models.analysis_job import AnalysisJob
from models.experiment import Experiment
from models.notification import Notification
from models.project import Project
from models.user import User
from pipelines import run as pipeline_run
from pipelines.base import TerminatedError
from services.cleanup_service import run_full_cleanup
from services.email_service import send_job_notification_email
from services.event_service import log_event_standalone
from services.job_output_service import persist_job_outputs
from services.trimming_service import create_trimmed_fastq_records

setup_logging()
logger = structlog.get_logger("cleave.worker")

# ---------------------------------------------------------------------------
# Sync engine for termination checks (pipeline code is synchronous)
# ---------------------------------------------------------------------------
_sync_engine = None


def _get_sync_engine():
    global _sync_engine
    if _sync_engine is None:
        sync_url = settings.DATABASE_URL.replace("+asyncpg", "")
        _sync_engine = create_engine(sync_url, pool_size=1)
    return _sync_engine


def _sync_check_terminated(job_id: int) -> bool:
    """Check if termination was requested for a job (sync, for pipeline threads)."""
    with _get_sync_engine().connect() as conn:
        row = conn.execute(
            text("SELECT termination_requested_at FROM analysis_jobs WHERE id = :id"),
            {"id": job_id},
        ).fetchone()
        return row is not None and row[0] is not None


async def _update_experiment_status(experiment_id: int, job_status: str) -> None:
    """Update experiment status based on job state transitions."""
    async with async_session_factory() as db:
        if job_status == "running":
            # Transition from new -> in_progress
            await db.execute(
                update(Experiment)
                .where(Experiment.id == experiment_id, Experiment.status == "new")
                .values(status="in_progress")
            )
        elif job_status == "error":
            await db.execute(
                update(Experiment).where(Experiment.id == experiment_id).values(status="error")
            )
        elif job_status in ("complete", "terminated"):
            # Check if any jobs are still pending for this experiment
            result = await db.execute(
                select(func.count())
                .select_from(AnalysisJob)
                .where(
                    AnalysisJob.experiment_id == experiment_id,
                    AnalysisJob.status.notin_(["complete", "terminated"]),
                )
            )
            pending = result.scalar_one()
            if pending == 0:
                await db.execute(
                    update(Experiment)
                    .where(Experiment.id == experiment_id)
                    .values(status="complete")
                )
        await db.commit()


async def _update_project_status(project_id: int) -> None:
    """Recompute and persist the project's derived status."""
    async with async_session_factory() as db:
        from services.project_service import recompute_project_status

        await recompute_project_status(db, project_id)
        await db.commit()


async def _create_job_notification(
    user_id: int | None,
    job_name: str,
    status: str,
    experiment_name: str,
    experiment_id: int,
    project_name: str = "Unknown",
    duration_seconds: int | None = None,
) -> None:
    """Create an in-app notification and send email for the user who launched the job."""
    if user_id is None:
        return

    if status == "complete":
        title = "Job Complete"
        message = f'"{job_name}" in experiment "{experiment_name}" has completed successfully.'
        notif_type = "job_complete"
    elif status == "terminated":
        title = "Job Terminated"
        message = f'"{job_name}" in experiment "{experiment_name}" was terminated.'
        notif_type = "job_terminated"
    else:
        title = "Job Failed"
        message = f'"{job_name}" in experiment "{experiment_name}" has failed.'
        notif_type = "job_error"

    async with async_session_factory() as db:
        notification = Notification(
            user_id=user_id,
            type=notif_type,
            title=title,
            message=message,
            link_target=f"/experiments/{experiment_id}",
        )
        db.add(notification)
        await db.commit()

        # Send email notification (best-effort, non-blocking)
        user_result = await db.execute(
            select(User.email, User.email_notifications).where(User.id == user_id)
        )
        user_row = user_result.one_or_none()
        if user_row:
            try:
                await send_job_notification_email(
                    to=user_row.email,
                    job_name=job_name,
                    experiment_name=experiment_name,
                    project_name=project_name,
                    status=status,
                    duration_seconds=duration_seconds,
                    experiment_id=experiment_id,
                    preference=user_row.email_notifications,
                )
            except Exception:
                logger.exception("worker.email_failed", user_id=user_id, job_name=job_name)


async def poll_and_run() -> None:
    async with async_session_factory() as db:
        result = await db.execute(
            select(AnalysisJob)
            .where(AnalysisJob.status == "queued")
            .order_by(AnalysisJob.created_at)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        job = result.scalar_one_or_none()
        if job is None:
            return

        # Fetch experiment name, project_id, and project name for notifications
        exp_result = await db.execute(
            select(Experiment.name, Experiment.project_id, Project.name.label("project_name"))
            .join(Project, Project.id == Experiment.project_id)
            .where(Experiment.id == job.experiment_id)
        )
        exp_row = exp_result.one_or_none()
        experiment_name = exp_row.name if exp_row else "Unknown"
        project_id = exp_row.project_id if exp_row else 0
        project_name = exp_row.project_name if exp_row else "Unknown"

        # Snapshot job attributes before detaching from session
        job_id = job.id
        job_type = job.job_type
        job_params = dict(job.params) if job.params else {}
        experiment_id = job.experiment_id
        launched_by = job.launched_by
        job_name = job.name
        is_auto_pipeline_job = job.auto_pipeline

        # Check if termination was requested while queued (race condition)
        if job.termination_requested_at is not None:
            logger.info("worker.job_already_terminated", job_id=job_id)
            await db.execute(
                update(AnalysisJob)
                .where(AnalysisJob.id == job_id)
                .values(
                    status="terminated",
                    completed_at=datetime.now(timezone.utc),
                    duration_seconds=0,
                )
            )
            await db.commit()
            await _update_experiment_status(experiment_id, "terminated")
            await _update_project_status(project_id)
            await _create_job_notification(
                launched_by,
                job_name,
                "terminated",
                experiment_name,
                experiment_id,
                project_name=project_name,
                duration_seconds=0,
            )
            return

        logger.info("worker.job_starting", job_id=job_id, job_type=job_type)
        now = datetime.now(timezone.utc)
        await db.execute(
            update(AnalysisJob)
            .where(AnalysisJob.id == job_id)
            .values(status="running", started_at=now)
        )
        await db.commit()

    # Update experiment and project status
    await _update_experiment_status(experiment_id, "running")
    await _update_project_status(project_id)

    # Construct working directories
    working_dir = Path(settings.STORAGE_ROOT) / "projects"
    job_dir = working_dir / str(project_id) / str(experiment_id) / "jobs" / str(job_id)
    job_dir.mkdir(parents=True, exist_ok=True)

    # Build cancellation callback for pipeline stages
    cancelled = lambda: _sync_check_terminated(job_id)  # noqa: E731

    # Run pipeline outside the DB session to avoid long-held connections
    run_params = {**job_params, "job_id": job_id}
    start = time.time()
    final_status = "error"

    try:
        pipeline_result = pipeline_run(
            job_type, run_params, working_dir, job_dir, cancelled=cancelled
        )
        duration = int(time.time() - start)

        async with async_session_factory() as db:
            completed_at = datetime.now(timezone.utc)
            values: dict = {
                "status": "complete",
                "duration_seconds": duration,
                "completed_at": completed_at,
            }
            if pipeline_result and pipeline_result.get("methods_text"):
                values["methods_text"] = pipeline_result["methods_text"]

            await db.execute(update(AnalysisJob).where(AnalysisJob.id == job_id).values(**values))
            await db.commit()

        logger.info("worker.job_completed", job_id=job_id, duration=duration)
        final_status = "complete"

        await log_event_standalone(
            experiment_id,
            launched_by,
            action="job_completed",
            resource_type="job",
            resource_id=job_id,
            detail=f"Job '{job_name}' completed in {duration}s",
        )

        # Post-pipeline output persistence
        if pipeline_result and pipeline_result.get("outputs"):
            if job_type == "trimming":
                # Trimming has its own specialized handler (creates FastqFile + JobOutput + FastQC)
                await create_trimmed_fastq_records(
                    experiment_id=experiment_id,
                    project_id=job_params.get("project_id", project_id),
                    job_id=job_id,
                    trimmed_outputs=pipeline_result["outputs"],
                )
            else:
                # Generic handler for alignment and future pipelines
                await persist_job_outputs(
                    job_id=job_id,
                    experiment_id=experiment_id,
                    project_id=project_id,
                    outputs=pipeline_result["outputs"],
                )

        # Auto-pipeline: queue next step if applicable
        if is_auto_pipeline_job:
            try:
                from services.auto_pipeline_service import on_job_complete

                await on_job_complete(experiment_id, job_id, job_type)
            except Exception:
                logger.exception("worker.auto_pipeline_hook_failed", job_id=job_id)

    except TerminatedError:
        duration = int(time.time() - start)
        async with async_session_factory() as db:
            await db.execute(
                update(AnalysisJob)
                .where(AnalysisJob.id == job_id)
                .values(
                    status="terminated",
                    duration_seconds=duration,
                    completed_at=datetime.now(timezone.utc),
                )
            )
            await db.commit()
        logger.info("worker.job_terminated", job_id=job_id, duration=duration)
        final_status = "terminated"

        await log_event_standalone(
            experiment_id,
            launched_by,
            action="job_terminated",
            resource_type="job",
            resource_id=job_id,
            detail=f"Job '{job_name}' terminated by user after {duration}s",
        )

    except Exception as exc:
        duration = int(time.time() - start)
        async with async_session_factory() as db:
            await db.execute(
                update(AnalysisJob)
                .where(AnalysisJob.id == job_id)
                .values(
                    status="error",
                    error_message=str(exc),
                    duration_seconds=duration,
                    completed_at=datetime.now(timezone.utc),
                )
            )
            await db.commit()
        logger.error("worker.job_failed", job_id=job_id, error=str(exc))

        await log_event_standalone(
            experiment_id,
            launched_by,
            action="job_failed",
            resource_type="job",
            resource_id=job_id,
            detail=f"Job '{job_name}' failed: {str(exc)[:200]}",
        )

        # Auto-pipeline: mark pipeline as errored
        if is_auto_pipeline_job:
            try:
                from services.auto_pipeline_service import on_job_error

                await on_job_error(experiment_id, job_id, job_type)
            except Exception:
                logger.exception("worker.auto_pipeline_error_hook_failed", job_id=job_id)

    # Update experiment and project status based on final outcome
    await _update_experiment_status(experiment_id, final_status)
    await _update_project_status(project_id)

    # Create notification + email for job launcher
    await _create_job_notification(
        launched_by,
        job_name,
        final_status,
        experiment_name,
        experiment_id,
        project_name=project_name,
        duration_seconds=duration,
    )


_last_cleanup_at: float = 0.0


async def _maybe_run_cleanup() -> None:
    """Run storage cleanup if enabled and enough time has elapsed."""
    global _last_cleanup_at

    if not settings.CLEANUP_ENABLED:
        return

    now = time.time()
    interval_seconds = settings.CLEANUP_INTERVAL_HOURS * 3600
    if now - _last_cleanup_at < interval_seconds:
        return

    _last_cleanup_at = now
    try:
        result = await run_full_cleanup()
        logger.info("worker.cleanup_complete", result=result)
    except Exception as exc:
        logger.error("worker.cleanup_failed", error=str(exc))


async def main() -> None:
    logger.info(
        "worker.started",
        poll_interval=settings.WORKER_POLL_INTERVAL_SECONDS,
        pipeline_mode=settings.PIPELINE_MODE,
    )
    while True:
        await poll_and_run()
        await _maybe_run_cleanup()
        await asyncio.sleep(settings.WORKER_POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    asyncio.run(main())
