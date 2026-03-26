# backend/services/trimming_service.py
"""Post-trimming DB persistence — creates FastqFile + JobOutput records for trimmed FASTQs."""

import structlog
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from database import async_session_factory
from models.experiment import Experiment
from models.fastq_file import FastqFile
from models.job_output import JobOutput
from models.project import Project
from services.fastqc_service import FastqcInput, run_fastqc_for_files

logger = structlog.get_logger(__name__)


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


async def create_trimmed_fastq_records(
    experiment_id: int,
    project_id: int,
    job_id: int,
    trimmed_outputs: list[dict],
) -> None:
    """Create FastqFile and JobOutput records for trimmed FASTQ files.

    Called by the worker after successful trimming pipeline completion.
    Uses its own DB session since worker sessions are per-poll-cycle.
    """
    total_bytes = 0
    fastqc_inputs: list[FastqcInput] = []

    async with async_session_factory() as db:
        for output in trimmed_outputs:
            prefix = output["prefix"]

            # Create FastqFile records for R1 and R2
            for read, path_key, size_key, filename_key in [
                ("R1", "r1_path", "r1_size", "r1_filename"),
                ("R2", "r2_path", "r2_size", "r2_filename"),
            ]:
                file_path = output[path_key]
                file_size = output[size_key]
                filename = output[filename_key]

                fastq_record = FastqFile(
                    experiment_id=experiment_id,
                    filename=filename,
                    prefix=prefix,
                    read_direction=read,
                    file_size_bytes=file_size,
                    file_path=file_path,
                    is_trimmed=True,
                    upload_source="trimming",
                )
                db.add(fastq_record)
                await db.flush()  # Get the ID for JobOutput FK

                # Create JobOutput linking this file to the job
                job_output = JobOutput(
                    job_id=job_id,
                    file_category="trimmed_fastq",
                    filename=filename,
                    file_path=file_path,
                    file_type="fastq.gz",
                    file_size_bytes=file_size,
                )
                db.add(job_output)

                total_bytes += file_size

                # Queue FastQC for the trimmed file
                fastqc_inputs.append({
                    "fastq_id": fastq_record.id,
                    "file_path": file_path,
                    "filename": filename,
                })

        if total_bytes > 0:
            await _update_storage_bytes(db, experiment_id, project_id, total_bytes)

        await db.commit()

    logger.info(
        "trimming_service.records_created",
        experiment_id=experiment_id,
        job_id=job_id,
        pairs=len(trimmed_outputs),
        total_bytes=total_bytes,
    )

    # Run FastQC on trimmed files (post-trim QC)
    if fastqc_inputs:
        await run_fastqc_for_files(fastqc_inputs, project_id, experiment_id)
