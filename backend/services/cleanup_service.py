# backend/services/cleanup_service.py
"""Storage lifecycle cleanup — deletes expired pipeline logs and stale tus staging files."""

from datetime import datetime, timedelta, timezone
from pathlib import Path

import structlog
from sqlalchemy import select

from config import settings
from database import async_session_factory
from models.analysis_job import AnalysisJob
from models.experiment import Experiment
from models.job_output import JobOutput
from services.job_output_service import update_storage_bytes

logger = structlog.get_logger("cleave.cleanup")


async def cleanup_expired_logs() -> dict:
    """Delete JobOutput records with file_category='log' whose parent job
    completed more than LOG_RETENTION_DAYS ago.

    Returns summary dict: {deleted_count, freed_bytes}.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.LOG_RETENTION_DAYS)
    deleted_count = 0
    freed_bytes = 0

    async with async_session_factory() as db:
        result = await db.execute(
            select(JobOutput, AnalysisJob.experiment_id, Experiment.project_id)
            .join(AnalysisJob, AnalysisJob.id == JobOutput.job_id)
            .join(Experiment, Experiment.id == AnalysisJob.experiment_id)
            .where(
                JobOutput.file_category == "log",
                AnalysisJob.status == "complete",
                AnalysisJob.completed_at <= cutoff,
            )
        )
        rows = result.all()

        # Group freed bytes by (experiment_id, project_id) to batch storage updates
        deltas: dict[tuple[int, int], int] = {}

        for job_output, experiment_id, project_id in rows:
            file_size = job_output.file_size_bytes or 0

            abs_path = Path(settings.STORAGE_ROOT) / job_output.file_path
            abs_path.unlink(missing_ok=True)

            key = (experiment_id, project_id)
            deltas[key] = deltas.get(key, 0) + file_size

            await db.delete(job_output)
            deleted_count += 1
            freed_bytes += file_size

        for (experiment_id, project_id), delta in deltas.items():
            if delta > 0:
                await update_storage_bytes(db, experiment_id, project_id, -delta)

        await db.commit()

    logger.info(
        "cleanup.expired_logs",
        deleted_count=deleted_count,
        freed_bytes=freed_bytes,
        cutoff=cutoff.isoformat(),
    )
    return {"deleted_count": deleted_count, "freed_bytes": freed_bytes}


async def cleanup_stale_tus_uploads() -> dict:
    """Remove incomplete tus upload staging files older than TUS_STAGING_RETENTION_HOURS."""
    staging_dir = Path(settings.STORAGE_ROOT) / "uploads"
    if not staging_dir.exists():
        return {"deleted_count": 0, "freed_bytes": 0}

    cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.TUS_STAGING_RETENTION_HOURS)
    deleted_count = 0
    freed_bytes = 0

    for f in staging_dir.iterdir():
        if not f.is_file():
            continue
        mtime = datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc)
        if mtime < cutoff:
            size = f.stat().st_size
            f.unlink(missing_ok=True)
            deleted_count += 1
            freed_bytes += size

    logger.info(
        "cleanup.stale_tus_uploads",
        deleted_count=deleted_count,
        freed_bytes=freed_bytes,
    )
    return {"deleted_count": deleted_count, "freed_bytes": freed_bytes}


async def run_full_cleanup() -> dict:
    """Run all cleanup tasks. Returns combined summary."""
    log_result = await cleanup_expired_logs()
    tus_result = await cleanup_stale_tus_uploads()
    return {
        "logs": log_result,
        "tus_staging": tus_result,
    }
