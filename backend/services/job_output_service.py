# backend/services/job_output_service.py
"""Generic post-pipeline output persistence — creates JobOutput records for any pipeline type."""

import structlog
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from database import async_session_factory
from models.experiment import Experiment
from models.job_output import JobOutput
from models.project import Project

logger = structlog.get_logger(__name__)


async def update_storage_bytes(
    db: AsyncSession, experiment_id: int, project_id: int, delta_bytes: int
) -> None:
    """Atomically increment storage_bytes on both experiment and project."""
    await db.execute(
        update(Experiment)
        .where(Experiment.id == experiment_id)
        .values(storage_bytes=Experiment.storage_bytes + delta_bytes)
    )
    await db.execute(
        update(Project)
        .where(Project.id == project_id)
        .values(storage_bytes=Project.storage_bytes + delta_bytes)
    )


async def persist_job_outputs(
    job_id: int,
    experiment_id: int,
    project_id: int,
    outputs: list[dict],
) -> int:
    """Create JobOutput records and update storage_bytes.

    Each output dict must contain:
        file_category: str  (e.g., "bam", "bigwig", "bed", "heatmap", "log")
        filename: str
        file_path: str      (relative to STORAGE_ROOT)
        file_type: str | None  (extension: "bam", "bw", "bed", "png", etc.)
        file_size_bytes: int
        reaction_id: int | None  (optional, links output to a specific reaction)

    Uses its own DB session since this runs in the worker context.
    Returns total bytes persisted.
    """
    if not outputs:
        return 0

    total_bytes = 0

    async with async_session_factory() as db:
        for output in outputs:
            job_output = JobOutput(
                job_id=job_id,
                reaction_id=output.get("reaction_id"),
                file_category=output["file_category"],
                filename=output["filename"],
                file_path=output["file_path"],
                file_type=output.get("file_type"),
                file_size_bytes=output.get("file_size_bytes", 0),
            )
            db.add(job_output)
            total_bytes += output.get("file_size_bytes", 0)

        if total_bytes > 0:
            await update_storage_bytes(db, experiment_id, project_id, total_bytes)

        await db.commit()

    logger.info(
        "job_output_service.outputs_persisted",
        job_id=job_id,
        count=len(outputs),
        total_bytes=total_bytes,
    )
    return total_bytes
