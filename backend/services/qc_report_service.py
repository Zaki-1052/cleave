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
from pipelines.spike_in_barcodes import PTM_NAMES, normalize_counts
from schemas.qc_report import (
    AlignmentQCReport,
    AlignmentReactionMetrics,
    PeakCallingQCReport,
    PeakCallingReactionMetrics,
    SpikeInPTMResult,
    SpikeInReactionResult,
    TopCalledPeak,
)


async def _get_authorized_job(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> AnalysisJob | None:
    """Fetch a job if the user has access to its project."""
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
            ecoli = int(row["Ecoli_Read_Pairs"])
            uniq = int(row["Uniquely_Aligned_Read_Pairs"])
            # Backward compat: old CSVs may not have the normalization factor column
            raw_norm = row.get("Ecoli_Normalization_Factor")
            ecoli_norm = (
                float(raw_norm) if raw_norm else (round(ecoli / uniq, 6) if uniq > 0 else 0.0)
            )
            metrics.append(
                AlignmentReactionMetrics(
                    short_name=row["Short_Name"],
                    total_read_pairs=int(row["Total_Read_Pairs"]),
                    aligned_read_pairs=int(row["Aligned_Read_Pairs"]),
                    uniquely_aligned_read_pairs=uniq,
                    unique_alignment_rate=float(row["Unique_Alignment_Rate(%)"]),
                    duplication_rate=float(row["Duplication_Rate(%)"]),
                    chrm_bandwidth=float(row["chrM_Bandwidth(%)"]),
                    ecoli_read_pairs=ecoli,
                    ecoli_alignment_rate=float(row["Ecoli_Alignment_Rate(%)"]),
                    ecoli_normalization_factor=ecoli_norm,
                )
            )
    return metrics


def _parse_spike_in_csv(csv_path: Path) -> list[SpikeInReactionResult]:
    """Parse spike-in barcode QC CSV into structured results."""
    results: list[SpikeInReactionResult] = []
    with open(csv_path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            on_target = row.get("On_Target_PTM") or None
            ptm_counts = {ptm: int(row.get(ptm, 0)) for ptm in PTM_NAMES}
            pct_recovery = normalize_counts(ptm_counts, on_target)
            total = sum(ptm_counts.values())
            ptm_results = [
                SpikeInPTMResult(
                    ptm_name=ptm,
                    raw_count=ptm_counts[ptm],
                    pct_recovery=pct_recovery[ptm],
                )
                for ptm in PTM_NAMES
            ]
            results.append(
                SpikeInReactionResult(
                    short_name=row["Short_Name"],
                    on_target_ptm=on_target,
                    total_barcode_reads=total,
                    ptm_results=ptm_results,
                )
            )
    return results


def _resolve_output_path(job: AnalysisJob, category: str, file_type: str) -> Path | None:
    """Find a job output file on disk by category and type."""
    storage_root = Path(settings.STORAGE_ROOT)
    for output in job.outputs:
        if output.file_category == category and output.file_type == file_type:
            abs_path = storage_root / output.file_path
            if not abs_path.resolve().is_relative_to(storage_root.resolve()):
                return None
            if abs_path.exists():
                return abs_path
    return None


def _resolve_qc_csv_path(job: AnalysisJob) -> Path | None:
    """Find the QC CSV file on disk from job outputs."""
    return _resolve_output_path(job, "qc_report", "csv")


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
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None

    if job.job_type != "alignment" or job.status != "complete":
        raise ValueError(
            f"Job {job_id} is not a completed alignment (type={job.job_type}, status={job.status})"
        )

    csv_path = _resolve_qc_csv_path(job)
    if csv_path is None:
        raise FileNotFoundError(f"QC report CSV not found for job {job_id}")

    genome = job.params.get("reference_genome", "unknown") if job.params else "unknown"
    metrics = _parse_qc_csv(csv_path)

    # Include spike-in data if available
    spike_in_results = None
    spike_csv = _resolve_output_path(job, "spike_in_qc", "csv")
    if spike_csv is not None:
        spike_in_results = _parse_spike_in_csv(spike_csv)

    return AlignmentQCReport(
        reference_genome=genome,
        metrics=metrics,
        spike_in_results=spike_in_results,
    )


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
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None

    if job.job_type != "alignment" or job.status != "complete":
        raise ValueError(
            f"Job {job_id} is not a completed alignment (type={job.job_type}, status={job.status})"
        )

    csv_path = _resolve_qc_csv_path(job)
    if csv_path is None:
        raise FileNotFoundError(f"QC report CSV not found for job {job_id}")

    return csv_path


def _parse_peak_qc_csv(csv_path: Path) -> list[PeakCallingReactionMetrics]:
    """Parse a peak calling metrics CSV into Pydantic models."""
    metrics: list[PeakCallingReactionMetrics] = []
    with open(csv_path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            metrics.append(
                PeakCallingReactionMetrics(
                    short_name=row["Short_Name"],
                    control_short_name=row.get("Control_Short_Name", ""),
                    reference_genome=row.get("Reference_Genome", ""),
                    peak_caller=row.get("Peak_Caller", ""),
                    peak_size=row.get("Peak_Size", ""),
                    significance_threshold=float(row.get("Significance_Threshold", 0)),
                    uniquely_aligned_read_pairs=int(row.get("Uniquely_Aligned_Read_Pairs", 0)),
                    called_peaks=int(row.get("Called_Peaks", 0)),
                    reads_in_peaks=int(row.get("Reads_in_Peaks", 0)),
                    frip=float(row.get("FRiP", 0)),
                )
            )
    return metrics


def _parse_top_peaks_csv(csv_path: Path) -> list[TopCalledPeak]:
    """Parse a top called peaks CSV into Pydantic models."""
    peaks: list[TopCalledPeak] = []
    with open(csv_path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            top_peaks: list[str] = []
            for col in [
                "Top Peak",
                "2' Peak",
                "3' Peak",
                "4' Peak",
                "5' Peak",
                "6' Peak",
                "7' Peak",
                "8' Peak",
                "9' Peak",
                "10' Peak",
            ]:
                val = row.get(col, "")
                if val:
                    top_peaks.append(val)
            peaks.append(
                TopCalledPeak(
                    short_name=row["Short_Name"],
                    control_short_name=row.get("Control_Short_Name", ""),
                    reference_genome=row.get("Reference_Genome", ""),
                    peak_caller=row.get("Peak_Caller", ""),
                    peak_size=row.get("Peak_Size", ""),
                    significance_threshold=float(row.get("Significance_Threshold", 0)),
                    top_peaks=top_peaks,
                )
            )
    return peaks


async def get_peak_calling_qc_report(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> PeakCallingQCReport | None:
    """Return structured QC report data for a peak calling job.

    Returns None if the job is not found or the user lacks access.
    Raises ValueError if the job is not a completed peak_calling job.
    Raises FileNotFoundError if the QC CSV is missing from disk.
    """
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None

    if job.job_type != "peak_calling" or job.status != "complete":
        raise ValueError(
            f"Job {job_id} is not a completed peak calling job "
            f"(type={job.job_type}, status={job.status})"
        )

    csv_path = _resolve_output_path(job, "qc_report", "csv")
    if csv_path is None:
        raise FileNotFoundError(f"Peak calling QC CSV not found for job {job_id}")

    params = job.params or {}
    genome = params.get("reference_genome", "unknown")
    peak_caller = params.get("peak_caller", "unknown")
    peak_size = params.get("peak_size", "unknown")

    metrics = _parse_peak_qc_csv(csv_path)

    top_peaks = None
    top_peaks_path = _resolve_output_path(job, "top_peaks", "csv")
    if top_peaks_path is not None:
        top_peaks = _parse_top_peaks_csv(top_peaks_path)

    return PeakCallingQCReport(
        reference_genome=genome,
        peak_caller=peak_caller,
        peak_size=peak_size,
        metrics=metrics,
        top_peaks=top_peaks,
    )


async def get_peak_calling_qc_csv_path(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> Path | None:
    """Return the absolute path to the peak calling QC CSV file for download."""
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None

    if job.job_type != "peak_calling" or job.status != "complete":
        raise ValueError(
            f"Job {job_id} is not a completed peak calling job "
            f"(type={job.job_type}, status={job.status})"
        )

    csv_path = _resolve_output_path(job, "qc_report", "csv")
    if csv_path is None:
        raise FileNotFoundError(f"Peak calling QC CSV not found for job {job_id}")

    return csv_path
