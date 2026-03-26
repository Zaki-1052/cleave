# backend/services/fastqc_service.py
"""Background orchestration for FastQC — runs after FASTQ upload completes."""

from pathlib import Path
from typing import TypedDict

import structlog
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import async_session_factory
from models.experiment import Experiment
from models.fastq_file import FastqFile
from models.project import Project
from pipelines.fastqc import run_fastqc

logger = structlog.get_logger(__name__)


class FastqcInput(TypedDict):
    fastq_id: int
    file_path: str
    filename: str


async def _update_storage_bytes(
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


async def run_fastqc_for_files(
    fastqc_inputs: list[FastqcInput],
    project_id: int,
    experiment_id: int,
) -> None:
    """Run FastQC on each uploaded FASTQ file and update DB with results.

    Called as a FastAPI BackgroundTask after upload. Uses its own DB session
    since the request session is closed by the time this runs.
    Each file is processed independently — errors in one do not affect others.
    """
    output_dir = (
        Path(settings.STORAGE_ROOT) / "projects" / str(project_id) / str(experiment_id) / "fastqc"
    )

    for inp in fastqc_inputs:
        try:
            fastq_abs = Path(settings.STORAGE_ROOT) / inp["file_path"]
            result = run_fastqc(fastq_abs, output_dir)

            # Build relative path for DB storage
            report_relative = None
            report_size = 0
            if result.report_html_path:
                report_abs = Path(result.report_html_path)
                if report_abs.exists():
                    report_size = report_abs.stat().st_size
                    # Store path relative to STORAGE_ROOT
                    try:
                        report_relative = str(report_abs.relative_to(settings.STORAGE_ROOT))
                    except ValueError:
                        report_relative = str(report_abs)

            # Update DB in its own session and commit per-file
            async with async_session_factory() as db:
                await db.execute(
                    update(FastqFile)
                    .where(FastqFile.id == inp["fastq_id"])
                    .values(
                        total_reads=result.total_reads,
                        fastqc_report_path=report_relative,
                        adapter_status=result.adapter_status,
                    )
                )
                if report_size > 0:
                    await _update_storage_bytes(db, experiment_id, project_id, report_size)
                await db.commit()

            logger.info(
                "fastqc.file_complete",
                fastq_id=inp["fastq_id"],
                filename=inp["filename"],
                total_reads=result.total_reads,
                adapter_status=result.adapter_status,
            )

        except Exception:
            logger.exception(
                "fastqc.file_error",
                fastq_id=inp["fastq_id"],
                filename=inp["filename"],
            )
