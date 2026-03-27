# backend/services/qc_report_service.py
"""Service for reading and returning alignment QC report data."""

import csv
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from config import settings
from models.analysis_job import AnalysisJob
from models.experiment import Experiment
from models.project import ProjectMember
from schemas.qc_report import AlignmentQCReport, AlignmentReactionMetrics


async def _get_authorized_alignment_job(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> AnalysisJob | None:
    """Fetch an alignment job if the user has access to its project."""
    result = await db.execute(
        select(AnalysisJob)
        .join(Experiment, Experiment.id == AnalysisJob.experiment_id)
        .join(ProjectMember, ProjectMember.project_id == Experiment.project_id)
        .where(
            AnalysisJob.id == job_id,
            ProjectMember.user_id == user_id,
        )
        .options(selectinload(AnalysisJob.outputs))
    )
    return result.scalar_one_or_none()


def _parse_qc_csv(csv_path: Path) -> list[AlignmentReactionMetrics]:
    """Parse an alignment metrics CSV into Pydantic models."""
    metrics: list[AlignmentReactionMetrics] = []
    with open(csv_path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            metrics.append(
                AlignmentReactionMetrics(
                    short_name=row["Short_Name"],
                    total_read_pairs=int(row["Total_Read_Pairs"]),
                    aligned_read_pairs=int(row["Aligned_Read_Pairs"]),
                    uniquely_aligned_read_pairs=int(row["Uniquely_Aligned_Read_Pairs"]),
                    unique_alignment_rate=float(row["Unique_Alignment_Rate(%)"]),
                    duplication_rate=float(row["Duplication_Rate(%)"]),
                    chrm_bandwidth=float(row["chrM_Bandwidth(%)"]),
                    ecoli_read_pairs=int(row["Ecoli_Read_Pairs"]),
                    ecoli_alignment_rate=float(row["Ecoli_Alignment_Rate(%)"]),
                )
            )
    return metrics


def _resolve_qc_csv_path(job: AnalysisJob) -> Path | None:
    """Find the QC CSV file on disk from job outputs."""
    storage_root = Path(settings.STORAGE_ROOT)
    for output in job.outputs:
        if output.file_category == "qc_report" and output.file_type == "csv":
            abs_path = storage_root / output.file_path
            # Path traversal guard
            if not abs_path.resolve().is_relative_to(storage_root.resolve()):
                return None
            if abs_path.exists():
                return abs_path
    return None


async def get_alignment_qc_report(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> AlignmentQCReport | None:
    """Return structured QC report data for an alignment job.

    Returns None if the job is not found or the user lacks access.
    Raises ValueError if the job is not a completed alignment.
    Raises FileNotFoundError if the QC CSV is missing from disk.
    """
    job = await _get_authorized_alignment_job(db, job_id, user_id)
    if job is None:
        return None

    if job.job_type != "alignment" or job.status != "complete":
        raise ValueError(
            f"Job {job_id} is not a completed alignment"
            f" (type={job.job_type}, status={job.status})"
        )

    csv_path = _resolve_qc_csv_path(job)
    if csv_path is None:
        raise FileNotFoundError(f"QC report CSV not found for job {job_id}")

    genome = job.params.get("reference_genome", "unknown") if job.params else "unknown"
    metrics = _parse_qc_csv(csv_path)

    return AlignmentQCReport(reference_genome=genome, metrics=metrics)


async def get_qc_csv_path(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> Path | None:
    """Return the absolute path to the QC CSV file for download.

    Returns None if the job is not found or the user lacks access.
    Raises ValueError if the job is not a completed alignment.
    Raises FileNotFoundError if the QC CSV is missing from disk.
    """
    job = await _get_authorized_alignment_job(db, job_id, user_id)
    if job is None:
        return None

    if job.job_type != "alignment" or job.status != "complete":
        raise ValueError(
            f"Job {job_id} is not a completed alignment"
            f" (type={job.job_type}, status={job.status})"
        )

    csv_path = _resolve_qc_csv_path(job)
    if csv_path is None:
        raise FileNotFoundError(f"QC report CSV not found for job {job_id}")

    return csv_path
