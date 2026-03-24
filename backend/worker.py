# backend/worker.py
"""Standalone worker process — polls analysis_jobs table and runs pipelines."""
import asyncio
import logging
import time
from pathlib import Path

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import async_session_factory
from models.analysis_job import AnalysisJob
from pipelines import run as pipeline_run

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cleave.worker")


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

        logger.info("Starting job %d (%s)", job.id, job.job_type)
        await db.execute(
            update(AnalysisJob)
            .where(AnalysisJob.id == job.id)
            .values(status="running")
        )
        await db.commit()

        working_dir = Path(settings.STORAGE_ROOT) / "projects"
        start = time.time()
        try:
            pipeline_run(job.job_type, job.params, working_dir)
            duration = int(time.time() - start)
            await db.execute(
                update(AnalysisJob)
                .where(AnalysisJob.id == job.id)
                .values(status="complete", duration_seconds=duration)
            )
            logger.info("Job %d completed in %ds", job.id, duration)
        except Exception as exc:
            duration = int(time.time() - start)
            await db.execute(
                update(AnalysisJob)
                .where(AnalysisJob.id == job.id)
                .values(status="error", error_message=str(exc), duration_seconds=duration)
            )
            logger.error("Job %d failed: %s", job.id, exc)
        await db.commit()


async def main() -> None:
    logger.info("Worker started (poll interval: %ds)", settings.WORKER_POLL_INTERVAL_SECONDS)
    while True:
        await poll_and_run()
        await asyncio.sleep(settings.WORKER_POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    asyncio.run(main())
