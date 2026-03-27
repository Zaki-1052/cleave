# backend/worker.py
"""Standalone worker process — polls analysis_jobs table and runs pipelines."""

import asyncio
import logging
import time
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select, update

from config import settings
from database import async_session_factory
from models.analysis_job import AnalysisJob
from models.experiment import Experiment
from models.notification import Notification
from pipelines import run as pipeline_run
from services.trimming_service import create_trimmed_fastq_records

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cleave.worker")


async def _create_job_notification(
    user_id: int | None,
    job_name: str,
    status: str,
    experiment_name: str,
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

        # Fetch experiment name for notifications
        exp_result = await db.execute(
            select(Experiment.name).where(Experiment.id == job.experiment_id)
        )
        experiment_name = exp_result.scalar_one_or_none() or "Unknown"

        # Snapshot job attributes before detaching from session
        job_id = job.id
        job_type = job.job_type
        job_params = dict(job.params) if job.params else {}
        experiment_id = job.experiment_id
        launched_by = job.launched_by
        job_name = job.name

        logger.info("Starting job %d (%s)", job_id, job_type)
        now = datetime.now(timezone.utc)
        await db.execute(
            update(AnalysisJob)
            .where(AnalysisJob.id == job_id)
            .values(status="running", started_at=now)
        )
        await db.commit()

    # Run pipeline outside the DB session to avoid long-held connections
    run_params = {**job_params, "job_id": job_id}
    working_dir = Path(settings.STORAGE_ROOT) / "projects"
    start = time.time()
    pipeline_result = None

    try:
        pipeline_result = pipeline_run(job_type, run_params, working_dir)
        duration = int(time.time() - start)

        async with async_session_factory() as db:
            completed_at = datetime.now(timezone.utc)
            values = {
                "status": "complete",
                "duration_seconds": duration,
                "completed_at": completed_at,
            }
            if pipeline_result and pipeline_result.get("methods_text"):
                values["methods_text"] = pipeline_result["methods_text"]

            await db.execute(update(AnalysisJob).where(AnalysisJob.id == job_id).values(**values))
            await db.commit()

        logger.info("Job %d completed in %ds", job_id, duration)

        # Post-pipeline dispatch: persist outputs based on job type
        if job_type == "trimming" and pipeline_result and pipeline_result.get("outputs"):
            await create_trimmed_fastq_records(
                experiment_id=experiment_id,
                project_id=job_params.get("project_id", 0),
                job_id=job_id,
                trimmed_outputs=pipeline_result["outputs"],
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
        logger.error("Job %d failed: %s", job_id, exc)

    # Create notification for job launcher
    final_status = "complete" if pipeline_result is not None else "error"
    await _create_job_notification(launched_by, job_name, final_status, experiment_name)


async def main() -> None:
    logger.info("Worker started (poll interval: %ds)", settings.WORKER_POLL_INTERVAL_SECONDS)
    while True:
        await poll_and_run()
        await asyncio.sleep(settings.WORKER_POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    asyncio.run(main())
