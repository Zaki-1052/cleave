# backend/services/fastqc_service.py
"""Background orchestration for FastQC — runs after FASTQ upload completes."""

import asyncio
from pathlib import Path
from typing import TypedDict

import structlog
from sqlalchemy import update

from config import settings
from database import async_session_factory
from models.fastq_file import FastqFile
from pipelines.fastqc import run_fastqc
from services.job_output_service import update_storage_bytes

logger = structlog.get_logger(__name__)


class FastqcInput(TypedDict):
    fastq_id: int
    file_path: str
    filename: str


async def run_fastqc_for_files(
    fastqc_inputs: list[FastqcInput],
    project_id: int,
    experiment_id: int,
    user_id: int | None = None,
    experiment_name: str | None = None,
) -> None:
    """Run FastQC on each uploaded FASTQ file and update DB with results.

    Called as a background task after upload. Uses its own DB session
    since the request session is closed by the time this runs.
    Each file is processed independently — errors in one do not affect others.
    """
    output_dir = (
        Path(settings.STORAGE_ROOT) / "projects" / str(project_id) / str(experiment_id) / "fastqc"
    )

    completed_count = 0
    total_count = len(fastqc_inputs)

    for inp in fastqc_inputs:
        try:
            fastq_abs = Path(settings.STORAGE_ROOT) / inp["file_path"]
            result = await asyncio.to_thread(run_fastqc, fastq_abs, output_dir)

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
                    await update_storage_bytes(db, experiment_id, project_id, report_size)
                await db.commit()

            completed_count += 1
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

    # Send notification when all files are processed
    if user_id and completed_count > 0:
        from services.notification_service import create_notification

        exp_label = f' in experiment "{experiment_name}"' if experiment_name else ""
        async with async_session_factory() as db:
            await create_notification(
                db,
                user_id=user_id,
                type="fastqc_complete",
                title="FastQC Complete",
                message=f"FastQC finished for {completed_count}/{total_count} file(s){exp_label}.",
                link_target=f"/experiments/{experiment_id}/fastqs",
            )
