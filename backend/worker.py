# backend/worker.py
"""Standalone worker process — polls analysis_jobs table and runs pipelines."""

import asyncio
import time
from datetime import datetime, timezone
from pathlib import Path

import structlog
from sqlalchemy import func, select, update

from config import settings
from database import async_session_factory
from logging_config import setup_logging
from models.analysis_job import AnalysisJob
from models.experiment import Experiment
from models.notification import Notification
from pipelines import run as pipeline_run
from services.job_output_service import persist_job_outputs
from services.trimming_service import create_trimmed_fastq_records

setup_logging()
logger = structlog.get_logger("cleave.worker")


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
        elif job_status == "complete":
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


async def _create_job_notification(
    user_id: int | None,
    job_name: str,
    status: str,
    experiment_name: str,
    experiment_id: int,
) -> None:
    """Create a notification for the user who launched the job."""
    if user_id is None:
        return

    if status == "complete":
        title = "Job Complete"
        message = f'"{job_name}" in experiment "{experiment_name}" has completed successfully.'
        notif_type = "job_complete"
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

        # Fetch experiment name and project_id for working directory + notifications
        exp_result = await db.execute(
            select(Experiment.name, Experiment.project_id).where(Experiment.id == job.experiment_id)
        )
        exp_row = exp_result.one_or_none()
        experiment_name = exp_row.name if exp_row else "Unknown"
        project_id = exp_row.project_id if exp_row else 0

        # Snapshot job attributes before detaching from session
        job_id = job.id
        job_type = job.job_type
        job_params = dict(job.params) if job.params else {}
        experiment_id = job.experiment_id
        launched_by = job.launched_by
        job_name = job.name

        logger.info("worker.job_starting", job_id=job_id, job_type=job_type)
        now = datetime.now(timezone.utc)
        await db.execute(
            update(AnalysisJob)
            .where(AnalysisJob.id == job_id)
            .values(status="running", started_at=now)
        )
        await db.commit()

    # Update experiment status to in_progress
    await _update_experiment_status(experiment_id, "running")

    # Construct working directories
    working_dir = Path(settings.STORAGE_ROOT) / "projects"
    job_dir = working_dir / str(project_id) / str(experiment_id) / "jobs" / str(job_id)
    job_dir.mkdir(parents=True, exist_ok=True)

    # Run pipeline outside the DB session to avoid long-held connections
    run_params = {**job_params, "job_id": job_id}
    start = time.time()
    final_status = "error"

    try:
        pipeline_result = pipeline_run(job_type, run_params, working_dir, job_dir)
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

    # Update experiment status based on final outcome
    await _update_experiment_status(experiment_id, final_status)

    # Create notification for job launcher
    await _create_job_notification(
        launched_by, job_name, final_status, experiment_name, experiment_id
    )


async def main() -> None:
    logger.info(
        "worker.started",
        poll_interval=settings.WORKER_POLL_INTERVAL_SECONDS,
        pipeline_mode=settings.PIPELINE_MODE,
    )
    while True:
        await poll_and_run()
        await asyncio.sleep(settings.WORKER_POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    asyncio.run(main())
