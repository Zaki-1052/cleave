# backend/services/qc_report_service.py
"""Service for reading and returning QC report data (alignment + peak calling)."""

import csv
import io
import json
from pathlib import Path

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from config import settings
from models.analysis_job import AnalysisJob
from models.experiment import Experiment
from models.project import Project, ProjectMember
from pipelines.spike_in_barcodes import PTM_NAMES, normalize_counts
from schemas.qc_report import (
    AlignmentQCReport,
    AlignmentReactionMetrics,
    CustomHeatmapPlotInfo,
    CustomHeatmapReport,
    DiffBindPlotInfo,
    DiffBindReport,
    NormalizationFactorEntry,
    PathwayPlotInfo,
    PathwayReport,
    PeakAnnotationResult,
    PeakCallingQCReport,
    PeakCallingReactionMetrics,
    PearsonCorrelationPlotInfo,
    PearsonCorrelationReport,
    RnaseqAlignmentQCReport,
    RnaseqAlignmentReactionMetrics,
    RnaseqDEPlotInfo,
    RnaseqDEReport,
    RnaseqQCDashboardReport,
    RomanNormalizationReport,
    RSeQCReactionMetrics,
    SpikeInPTMResult,
    SpikeInReactionResult,
    TopCalledPeak,
)


async def _get_authorized_job(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> AnalysisJob | None:
    """Fetch a job if the user has access (project member or reference project)."""
    result = await db.execute(
        select(AnalysisJob)
        .join(Experiment, Experiment.id == AnalysisJob.experiment_id)
        .join(Project, Project.id == Experiment.project_id)
        .outerjoin(
            ProjectMember,
            and_(
                ProjectMember.project_id == Experiment.project_id,
                ProjectMember.user_id == user_id,
            ),
        )
        .where(
            AnalysisJob.id == job_id,
            or_(ProjectMember.user_id.isnot(None), Project.is_reference.is_(True)),
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


def _resolve_output_by_name(job: AnalysisJob, filename: str) -> Path | None:
    """Find a job output file on disk by exact filename (fallback for category mismatches)."""
    storage_root = Path(settings.STORAGE_ROOT)
    for output in job.outputs:
        if output.filename == filename:
            abs_path = storage_root / output.file_path
            if not abs_path.resolve().is_relative_to(storage_root.resolve()):
                return None
            if abs_path.exists():
                return abs_path
    return None


def _resolve_all_outputs(
    job: AnalysisJob, category: str, file_type: str
) -> list[tuple[int | None, Path]]:
    """Find all job output files matching category and type.

    Returns (reaction_id, path) pairs for per-reaction output files.
    """
    storage_root = Path(settings.STORAGE_ROOT)
    results: list[tuple[int | None, Path]] = []
    for output in job.outputs:
        if output.file_category == category and output.file_type == file_type:
            abs_path = storage_root / output.file_path
            if abs_path.resolve().is_relative_to(storage_root.resolve()) and abs_path.exists():
                results.append((output.reaction_id, abs_path))
    return results


# Ordered list of genomic feature categories for peak annotation (matches CUTANA Cloud)
ANNOTATION_CATEGORIES = [
    "Promoter",
    "Exon",
    "Intron",
    "Intergenic",
    "3UTR",
    "5UTR",
    "TTS",
    "ncRNA",
    "miRNA",
    "pseudo",
]

# Prefix-based mapping from HOMER annotation labels to CUTANA Cloud categories.
# HOMER appends gene details (e.g. "Intron (ENSMUSG...)") so we match on prefix.
_ANNOTATION_PREFIX_MAP: list[tuple[str, str]] = [
    ("Promoter", "Promoter"),
    ("5' UTR", "5UTR"),
    ("3' UTR", "3UTR"),
    ("5UTR", "5UTR"),
    ("3UTR", "3UTR"),
    ("Exon", "Exon"),
    ("exon", "Exon"),
    ("Intron", "Intron"),
    ("intron", "Intron"),
    ("Intergenic", "Intergenic"),
    ("TTS", "TTS"),
    ("non-coding", "ncRNA"),
    ("ncRNA", "ncRNA"),
    ("miRNA", "miRNA"),
    ("pseudo", "pseudo"),
]


def _classify_annotation(raw_label: str) -> str:
    """Map a HOMER annotation label to a CUTANA Cloud category."""
    for prefix, category in _ANNOTATION_PREFIX_MAP:
        if raw_label.startswith(prefix):
            return category
    return "Intergenic"


def _parse_annotation_stats(stats_path: Path) -> dict[str, float]:
    """Parse a HOMER annotation_stats.txt file into {category: percentage}."""
    counts: dict[str, int] = {cat: 0 for cat in ANNOTATION_CATEGORIES}
    total = 0
    with open(stats_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("Annotation"):
                continue
            parts = line.split("\t")
            if len(parts) < 2:
                continue
            raw_label = parts[0]
            try:
                peak_count = int(float(parts[1]))
            except ValueError:
                continue
            category = _classify_annotation(raw_label)
            counts[category] += peak_count
            total += peak_count

    if total == 0:
        return {cat: 0.0 for cat in ANNOTATION_CATEGORIES}
    return {cat: round(counts[cat] / total * 100, 2) for cat in ANNOTATION_CATEGORIES}


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


# ---------------------------------------------------------------------------
# RNA-seq Alignment QC Report
# ---------------------------------------------------------------------------


def _parse_rnaseq_qc_csv(csv_path: Path) -> list[RnaseqAlignmentReactionMetrics]:
    """Parse an RNA-seq alignment metrics CSV into Pydantic models."""
    metrics: list[RnaseqAlignmentReactionMetrics] = []
    with open(csv_path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            metrics.append(
                RnaseqAlignmentReactionMetrics(
                    short_name=row["Short_Name"],
                    total_input_reads=int(row["Total_Input_Reads"]),
                    uniquely_mapped_reads=int(row["Uniquely_Mapped_Reads"]),
                    unique_mapping_rate=float(row["Unique_Mapping_Rate(%)"]),
                    multi_mapped_rate=float(row["Multi_Mapped_Rate(%)"]),
                    unmapped_rate=float(row["Unmapped_Rate(%)"]),
                    average_mapped_length=float(row["Average_Mapped_Length"]),
                    num_splices=int(row["Num_Splices"]),
                    num_splices_annotated=int(row.get("Num_Splices_Annotated", 0)),
                    num_splices_gt_ag=int(row.get("Num_Splices_GT_AG", 0)),
                    num_splices_gc_ag=int(row.get("Num_Splices_GC_AG", 0)),
                    num_splices_at_ac=int(row.get("Num_Splices_AT_AC", 0)),
                    num_splices_non_canonical=int(row.get("Num_Splices_Non_Canonical", 0)),
                    mismatch_rate=float(row["Mismatch_Rate(%)"]),
                    salmon_mapping_rate=float(row["Salmon_Mapping_Rate(%)"]),
                    salmon_library_type=row["Salmon_Library_Type"],
                    salmon_num_processed=int(row["Salmon_Num_Processed"]),
                    salmon_frag_length_mean=float(row.get("Salmon_Frag_Length_Mean", 0.0)),
                    salmon_frag_length_sd=float(row.get("Salmon_Frag_Length_SD", 0.0)),
                )
            )
    return metrics


async def get_rnaseq_alignment_qc_report(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> RnaseqAlignmentQCReport | None:
    """Return structured QC report data for an RNA-seq alignment job.

    Returns None if the job is not found or the user lacks access.
    Raises ValueError if the job is not a completed rnaseq_alignment.
    Raises FileNotFoundError if the QC CSV is missing from disk.
    """
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None

    if job.job_type != "rnaseq_alignment" or job.status != "complete":
        raise ValueError(
            f"Job {job_id} is not a completed RNA-seq alignment "
            f"(type={job.job_type}, status={job.status})"
        )

    csv_path = _resolve_qc_csv_path(job)
    if csv_path is None:
        raise FileNotFoundError(f"QC report CSV not found for job {job_id}")

    genome = job.params.get("reference_genome", "unknown") if job.params else "unknown"
    metrics = _parse_rnaseq_qc_csv(csv_path)

    return RnaseqAlignmentQCReport(
        reference_genome=genome,
        metrics=metrics,
    )


async def get_rnaseq_qc_csv_path(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> Path | None:
    """Return the absolute path to the RNA-seq QC CSV file for download.

    Returns None if the job is not found or the user lacks access.
    Raises ValueError if the job is not a completed rnaseq_alignment.
    Raises FileNotFoundError if the QC CSV is missing from disk.
    """
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None

    if job.job_type != "rnaseq_alignment" or job.status != "complete":
        raise ValueError(
            f"Job {job_id} is not a completed RNA-seq alignment "
            f"(type={job.job_type}, status={job.status})"
        )

    csv_path = _resolve_qc_csv_path(job)
    if csv_path is None:
        raise FileNotFoundError(f"QC report CSV not found for job {job_id}")

    return csv_path


# ---------------------------------------------------------------------------
# Peak Calling QC Report
# ---------------------------------------------------------------------------


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
    top_peaks_path = _resolve_output_path(job, "top_peaks", "csv") or _resolve_output_by_name(
        job, "top_called_peaks.csv"
    )
    if top_peaks_path is not None:
        top_peaks = _parse_top_peaks_csv(top_peaks_path)

    # Load per-reaction peak annotation stats from HOMER output
    annotations = None
    annotation_outputs = _resolve_all_outputs(job, "annotation_stats", "txt")
    if annotation_outputs:
        rxn_lookup: dict[int, str] = {
            rxn["reaction_id"]: rxn["short_name"] for rxn in params.get("reactions", [])
        }
        annotations = []
        for reaction_id, stats_path in annotation_outputs:
            short_name = rxn_lookup.get(reaction_id, f"reaction_{reaction_id}")  # type: ignore[arg-type]
            pcts = _parse_annotation_stats(stats_path)
            annotations.append(PeakAnnotationResult(short_name=short_name, categories=pcts))

    return PeakCallingQCReport(
        reference_genome=genome,
        peak_caller=peak_caller,
        peak_size=peak_size,
        metrics=metrics,
        top_peaks=top_peaks,
        annotations=annotations,
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


async def get_top_peaks_csv_path(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> Path | None:
    """Return the absolute path to the top called peaks CSV file for download."""
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None

    if job.job_type != "peak_calling" or job.status != "complete":
        raise ValueError(
            f"Job {job_id} is not a completed peak calling job "
            f"(type={job.job_type}, status={job.status})"
        )

    csv_path = _resolve_output_path(job, "top_peaks", "csv") or _resolve_output_by_name(
        job, "top_called_peaks.csv"
    )
    if csv_path is None:
        raise FileNotFoundError(f"Top called peaks CSV not found for job {job_id}")

    return csv_path


async def get_peak_annotation_csv(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> str:
    """Generate a CSV string with peak annotation percentages for all reactions.

    Returns None if the job is not found or the user lacks access.
    Raises ValueError if the job is not a completed peak_calling job.
    Raises FileNotFoundError if no annotation stats files exist.
    """
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        raise FileNotFoundError(f"Job {job_id} not found or access denied")

    if job.job_type != "peak_calling" or job.status != "complete":
        raise ValueError(
            f"Job {job_id} is not a completed peak calling job "
            f"(type={job.job_type}, status={job.status})"
        )

    annotation_outputs = _resolve_all_outputs(job, "annotation_stats", "txt")
    if not annotation_outputs:
        raise FileNotFoundError(f"No annotation stats files found for job {job_id}")

    params = job.params or {}
    rxn_lookup: dict[int, str] = {
        rxn["reaction_id"]: rxn["short_name"] for rxn in params.get("reactions", [])
    }

    buf = io.StringIO()
    fieldnames = ["Short_Name", *ANNOTATION_CATEGORIES]
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    for reaction_id, stats_path in annotation_outputs:
        pcts = _parse_annotation_stats(stats_path)
        row: dict[str, str | float] = {
            "Short_Name": rxn_lookup.get(reaction_id, f"reaction_{reaction_id}"),  # type: ignore[arg-type]
        }
        row.update(pcts)
        writer.writerow(row)  # type: ignore[arg-type]

    return buf.getvalue()


# ---------------------------------------------------------------------------
# DiffBind Report
# ---------------------------------------------------------------------------

_DIFFBIND_PLOT_CATEGORIES = {
    "pca": "diffbind_plot_pca",
    "heatmap_group": "diffbind_plot_heatmap_group",
    "heatmap_condition": "diffbind_plot_heatmap_condition",
    "ma": "diffbind_plot_ma",
    "volcano": "diffbind_plot_volcano",
}


def _parse_diffbind_results_tsv(
    tsv_path: Path,
    max_rows: int = 100,
) -> tuple[list[str], list[dict[str, str | float]], int, int, int]:
    """Parse DiffBind results TSV. Returns (columns, preview_rows,
    total_peaks, sig_005, sig_001)."""
    columns: list[str] = []
    rows: list[dict[str, str | float]] = []
    total = 0
    sig_005 = 0
    sig_001 = 0

    with open(tsv_path, newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        columns = list(reader.fieldnames or [])
        for row in reader:
            total += 1
            fdr_str = row.get("FDR", "1")
            try:
                fdr = float(fdr_str)
            except ValueError:
                fdr = 1.0
            if fdr < 0.05:
                sig_005 += 1
            if fdr < 0.01:
                sig_001 += 1
            if total <= max_rows:
                parsed: dict[str, str | float] = {}
                for col in columns:
                    val = row.get(col, "")
                    try:
                        parsed[col] = float(val)
                    except ValueError:
                        parsed[col] = val
                rows.append(parsed)

    return columns, rows, total, sig_005, sig_001


def _find_plot_output_ids(
    job: AnalysisJob,
) -> list[DiffBindPlotInfo]:
    """Match job outputs to DiffBind plot types (PNG + SVG pairs)."""
    plot_infos: list[DiffBindPlotInfo] = []
    for plot_type, category in _DIFFBIND_PLOT_CATEGORIES.items():
        png_id = None
        svg_id = None
        for output in job.outputs:
            if output.file_category == category:
                if output.file_type == "png":
                    png_id = output.id
                elif output.file_type == "svg":
                    svg_id = output.id
        if png_id or svg_id:
            plot_infos.append(
                DiffBindPlotInfo(
                    plot_type=plot_type,
                    output_id_png=png_id,
                    output_id_svg=svg_id,
                )
            )
    return plot_infos


async def get_diffbind_report(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> DiffBindReport | None:
    """Return structured DiffBind report for a completed diffbind job."""
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None

    if job.job_type != "diffbind" or job.status != "complete":
        raise ValueError(
            f"Job {job_id} is not a completed diffbind job "
            f"(type={job.job_type}, status={job.status})"
        )

    tsv_path = _resolve_output_path(job, "diffbind_results", "tsv")
    if tsv_path is None:
        raise FileNotFoundError(f"DiffBind results TSV not found for job {job_id}")

    columns, preview, total, sig_005, sig_001 = _parse_diffbind_results_tsv(tsv_path)

    params = job.params or {}
    conditions = sorted({s["condition"] for s in params.get("samples", [])})
    method = params.get("analysis_method", "unknown")
    plot_infos = _find_plot_output_ids(job)

    return DiffBindReport(
        analysis_method=method,
        conditions=conditions,
        column_names=columns,
        total_peaks=total,
        significant_peaks_005=sig_005,
        significant_peaks_001=sig_001,
        results_preview=preview,
        plot_outputs=plot_infos,
    )


async def get_diffbind_results_path(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> Path | None:
    """Return absolute path to DiffBind results TSV for download."""
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None
    if job.job_type != "diffbind" or job.status != "complete":
        raise ValueError(f"Job {job_id} is not a completed diffbind job")
    path = _resolve_output_path(job, "diffbind_results", "tsv")
    if path is None:
        raise FileNotFoundError(f"DiffBind results not found for job {job_id}")
    return path


async def get_diffbind_counts_path(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> Path | None:
    """Return absolute path to normalized counts CSV for download."""
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None
    if job.job_type != "diffbind" or job.status != "complete":
        raise ValueError(f"Job {job_id} is not a completed diffbind job")
    path = _resolve_output_path(job, "normalized_counts", "csv")
    if path is None:
        raise FileNotFoundError(f"Normalized counts not found for job {job_id}")
    return path


# ---------------------------------------------------------------------------
# RNA-seq DE report
# ---------------------------------------------------------------------------

_RNASEQ_DE_PLOT_CATEGORIES = {
    "volcano": "volcano_plot",
    "ma": "ma_plot",
    "pca": "pca_plot",
    "distance_heatmap": "distance_heatmap",
    "gene_heatmap": "gene_heatmap",
}


def _parse_rnaseq_de_results_tsv(
    tsv_path: Path,
    max_rows: int = 100,
) -> tuple[list[str], list[dict[str, str | float]], int, int, int, int, int]:
    """Parse RNA-seq DE results TSV. Returns (columns, preview_rows,
    total_genes, sig_005, sig_001, upregulated, downregulated)."""
    columns: list[str] = []
    rows: list[dict[str, str | float]] = []
    total = 0
    sig_005 = 0
    sig_001 = 0
    up = 0
    down = 0

    with open(tsv_path, newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        columns = list(reader.fieldnames or [])
        for row in reader:
            total += 1
            padj_str = row.get("padj", "1")
            lfc_str = row.get("log2FoldChange", "0")
            try:
                padj = float(padj_str)
            except ValueError:
                padj = 1.0
            try:
                lfc = float(lfc_str)
            except ValueError:
                lfc = 0.0
            if padj < 0.05:
                sig_005 += 1
                if lfc > 0:
                    up += 1
                elif lfc < 0:
                    down += 1
            if padj < 0.01:
                sig_001 += 1
            if total <= max_rows:
                parsed: dict[str, str | float] = {}
                for col in columns:
                    val = row.get(col, "")
                    try:
                        parsed[col] = float(val)
                    except ValueError:
                        parsed[col] = val
                rows.append(parsed)

    return columns, rows, total, sig_005, sig_001, up, down


def _find_de_plot_output_ids(
    job: AnalysisJob,
) -> list[RnaseqDEPlotInfo]:
    """Match job outputs to RNA-seq DE plot types (PNG + SVG pairs)."""
    plot_infos: list[RnaseqDEPlotInfo] = []
    for plot_type, category in _RNASEQ_DE_PLOT_CATEGORIES.items():
        png_id = None
        svg_id = None
        for output in job.outputs:
            if output.file_category == category:
                if output.file_type == "png":
                    png_id = output.id
                elif output.file_type == "svg":
                    svg_id = output.id
        if png_id or svg_id:
            plot_infos.append(
                RnaseqDEPlotInfo(
                    plot_type=plot_type,
                    output_id_png=png_id,
                    output_id_svg=svg_id,
                )
            )
    return plot_infos


async def get_rnaseq_de_report(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> RnaseqDEReport | None:
    """Return structured DE report for a completed rnaseq_de job."""
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None

    if job.job_type != "rnaseq_de" or job.status != "complete":
        raise ValueError(
            f"Job {job_id} is not a completed rnaseq_de job "
            f"(type={job.job_type}, status={job.status})"
        )

    tsv_path = _resolve_output_path(job, "de_results", "tsv")
    if tsv_path is None:
        raise FileNotFoundError(f"DE results TSV not found for job {job_id}")

    columns, preview, total, sig_005, sig_001, up, down = _parse_rnaseq_de_results_tsv(tsv_path)

    params = job.params or {}
    conditions = sorted({s["condition"] for s in params.get("samples", [])})
    source = params.get("quantification_source", "salmon")
    ref_cond = params.get("reference_condition")
    plot_infos = _find_de_plot_output_ids(job)

    return RnaseqDEReport(
        quantification_source=source,
        conditions=conditions,
        reference_condition=ref_cond,
        column_names=columns,
        total_genes=total,
        significant_genes_005=sig_005,
        significant_genes_001=sig_001,
        upregulated=up,
        downregulated=down,
        results_preview=preview,
        plot_outputs=plot_infos,
    )


async def get_rnaseq_de_results_path(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> Path | None:
    """Return absolute path to DE results TSV for download."""
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None
    if job.job_type != "rnaseq_de" or job.status != "complete":
        raise ValueError(f"Job {job_id} is not a completed rnaseq_de job")
    path = _resolve_output_path(job, "de_results", "tsv")
    if path is None:
        raise FileNotFoundError(f"DE results not found for job {job_id}")
    return path


async def get_rnaseq_de_counts_path(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> Path | None:
    """Return absolute path to normalized counts CSV for download."""
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None
    if job.job_type != "rnaseq_de" or job.status != "complete":
        raise ValueError(f"Job {job_id} is not a completed rnaseq_de job")
    path = _resolve_output_path(job, "normalized_counts", "csv")
    if path is None:
        raise FileNotFoundError(f"Normalized counts not found for job {job_id}")
    return path


# ---------------------------------------------------------------------------
# Custom Heatmap report
# ---------------------------------------------------------------------------


def _find_heatmap_plot_info(
    job: AnalysisJob,
    category: str,
) -> CustomHeatmapPlotInfo:
    """Match job outputs to a plot type's PNG + SVG by file category."""
    png_id = None
    svg_id = None
    for output in job.outputs:
        if output.file_category == category:
            if output.file_type == "png":
                png_id = output.id
            elif output.file_type == "svg":
                svg_id = output.id
    return CustomHeatmapPlotInfo(output_id_png=png_id, output_id_svg=svg_id)


async def get_custom_heatmap_report(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> CustomHeatmapReport | None:
    """Return structured report for a completed custom heatmap job."""
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None

    if job.job_type != "custom_heatmap" or job.status != "complete":
        raise ValueError(
            f"Job {job_id} is not a completed custom_heatmap job "
            f"(type={job.job_type}, status={job.status})"
        )

    params = job.params or {}
    samples = params.get("samples", [])

    plot_info = _find_heatmap_plot_info(job, "custom_heatmap_plot")
    profile_info = _find_heatmap_plot_info(job, "custom_heatmap_profile")

    matrix_output_id = None
    for output in job.outputs:
        if output.file_category == "custom_heatmap_matrix":
            matrix_output_id = output.id
            break

    return CustomHeatmapReport(
        bed_label=params.get("bed_label", "custom regions"),
        sample_count=len(samples),
        sample_labels=[s.get("label", s.get("short_name", "")) for s in samples],
        flanking_upstream=params.get("flanking_upstream", 1500),
        flanking_downstream=params.get("flanking_downstream", 1500),
        reference_point=params.get("reference_point", "center"),
        sort_order=params.get("sort_order", "descend"),
        color_map=params.get("color_map"),
        plot_output=plot_info,
        profile_output=profile_info,
        matrix_output_id=matrix_output_id,
    )


async def get_custom_heatmap_matrix_path(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> Path | None:
    """Return absolute path to heatmap matrix .gz for download."""
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None
    if job.job_type != "custom_heatmap" or job.status != "complete":
        raise ValueError(f"Job {job_id} is not a completed custom_heatmap job")
    path = _resolve_output_path(job, "custom_heatmap_matrix", "gz")
    if path is None:
        raise FileNotFoundError(f"Heatmap matrix not found for job {job_id}")
    return path


# ---------------------------------------------------------------------------
# Pearson Correlation
# ---------------------------------------------------------------------------


def _find_pearson_plot_info(
    job: AnalysisJob,
    category: str,
) -> PearsonCorrelationPlotInfo:
    """Match job outputs to a plot type's PNG + SVG by file category."""
    png_id = None
    svg_id = None
    for output in job.outputs:
        if output.file_category == category:
            if output.file_type == "png":
                png_id = output.id
            elif output.file_type == "svg":
                svg_id = output.id
    return PearsonCorrelationPlotInfo(output_id_png=png_id, output_id_svg=svg_id)


async def get_pearson_correlation_report(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> PearsonCorrelationReport | None:
    """Return structured report for a completed Pearson correlation job."""
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None

    if job.job_type != "pearson_correlation" or job.status != "complete":
        raise ValueError(
            f"Job {job_id} is not a completed pearson_correlation job "
            f"(type={job.job_type}, status={job.status})"
        )

    params = job.params or {}
    samples = params.get("samples", [])
    genome = params.get("reference_genome", "mm10")

    plot_info = _find_pearson_plot_info(job, "pearson_heatmap")

    coverage_output_id = None
    correlation_output_id = None
    for output in job.outputs:
        if output.file_category == "pearson_matrix":
            coverage_output_id = output.id
        elif output.file_category == "pearson_correlation":
            correlation_output_id = output.id

    return PearsonCorrelationReport(
        sample_count=len(samples),
        sample_labels=[s.get("label", s.get("short_name", "")) for s in samples],
        reference_genome=genome,
        masking_applied=genome == "mm10",
        restrict_bed_label=params.get("restrict_bed_label"),
        plot_output=plot_info,
        coverage_matrix_output_id=coverage_output_id,
        correlation_matrix_output_id=correlation_output_id,
    )


async def get_pearson_correlation_matrix_path(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> Path | None:
    """Return absolute path to Pearson correlation CSV for download."""
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None
    if job.job_type != "pearson_correlation" or job.status != "complete":
        raise ValueError(f"Job {job_id} is not a completed pearson_correlation job")
    path = _resolve_output_path(job, "pearson_correlation", "csv")
    if path is None:
        raise FileNotFoundError(f"Correlation matrix not found for job {job_id}")
    return path


async def get_pearson_coverage_matrix_path(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> Path | None:
    """Return absolute path to Pearson coverage matrix CSV for download."""
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None
    if job.job_type != "pearson_correlation" or job.status != "complete":
        raise ValueError(f"Job {job_id} is not a completed pearson_correlation job")
    path = _resolve_output_path(job, "pearson_matrix", "csv")
    if path is None:
        raise FileNotFoundError(f"Coverage matrix not found for job {job_id}")
    return path


# ---------------------------------------------------------------------------
# Roman Normalization
# ---------------------------------------------------------------------------


async def get_roman_normalization_report(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> RomanNormalizationReport | None:
    """Return structured report for a completed Roman normalization job."""
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None

    if job.job_type != "roman_normalization" or job.status != "complete":
        raise ValueError(
            f"Job {job_id} is not a completed roman_normalization job "
            f"(type={job.job_type}, status={job.status})"
        )

    params = job.params or {}
    samples = params.get("samples", [])

    # Parse normalization factors from CSV output
    factors: list[NormalizationFactorEntry] = []
    factors_csv_output_id = None
    for output in job.outputs:
        if output.file_category == "normalization_factors" and output.file_type == "csv":
            factors_csv_output_id = output.id
            csv_path = Path(settings.STORAGE_ROOT) / output.file_path
            if csv_path.exists():
                with open(csv_path) as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        factors.append(
                            NormalizationFactorEntry(
                                sample_name=row["SampleName"],
                                percentile_99=float(row["Percentile99"]),
                                normalization_factor=float(row["NormalizationFactor"]),
                            )
                        )
            break

    # Find plot outputs
    png_id = None
    svg_id = None
    for output in job.outputs:
        if output.file_category == "normalization_plot":
            if output.file_type == "png":
                png_id = output.id
            elif output.file_type == "svg":
                svg_id = output.id

    # Reference sample is the first in the list
    sample_labels = [s.get("label", s.get("short_name", "")) for s in samples]
    reference_sample = sample_labels[0] if sample_labels else ""

    return RomanNormalizationReport(
        sample_count=len(samples),
        sample_labels=sample_labels,
        reference_genome="mm10",
        reference_sample=reference_sample,
        normalization_factors=factors,
        plot_output_id_png=png_id,
        plot_output_id_svg=svg_id,
        factors_csv_output_id=factors_csv_output_id,
    )


async def get_roman_normalization_factors_path(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> Path | None:
    """Return absolute path to normalization factors CSV for download."""
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None
    if job.job_type != "roman_normalization" or job.status != "complete":
        raise ValueError(f"Job {job_id} is not a completed roman_normalization job")
    path = _resolve_output_path(job, "normalization_factors", "csv")
    if path is None:
        raise FileNotFoundError(f"Normalization factors not found for job {job_id}")
    return path


# ---------------------------------------------------------------------------
# RSeQC + MultiQC QC Dashboard
# ---------------------------------------------------------------------------


def _parse_rseqc_metrics_csv(csv_path: Path) -> list[RSeQCReactionMetrics]:
    """Parse the aggregate RSeQC metrics CSV into Pydantic models."""
    metrics: list[RSeQCReactionMetrics] = []
    with open(csv_path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            metrics.append(
                RSeQCReactionMetrics(
                    short_name=row.get("Short_Name", ""),
                    fraction_sense=float(row.get("Fraction_Sense", 0)),
                    fraction_antisense=float(row.get("Fraction_Antisense", 0)),
                    fraction_undetermined=float(row.get("Fraction_Undetermined", 0)),
                    inferred_strandedness=row.get("Inferred_Strandedness", ""),
                    cds_exons_tags=int(float(row.get("CDS_Exons_Tags", 0))),
                    five_utr_exons_tags=int(float(row.get("5UTR_Exons_Tags", 0))),
                    three_utr_exons_tags=int(float(row.get("3UTR_Exons_Tags", 0))),
                    intron_tags=int(float(row.get("Intron_Tags", 0))),
                    intergenic_tags=int(float(row.get("Intergenic_Tags", 0))),
                    coverage_skewness=float(row.get("Coverage_Skewness", 0)),
                    inner_distance_mean=float(row.get("Inner_Distance_Mean", 0)),
                    inner_distance_sd=float(row.get("Inner_Distance_SD", 0)),
                )
            )
    return metrics


async def get_rnaseq_qc_dashboard_report(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> RnaseqQCDashboardReport | None:
    """Build the full RSeQC + MultiQC QC dashboard report."""
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None

    if job.job_type != "rnaseq_qc":
        raise ValueError(f"Job {job_id} is not an rnaseq_qc job (got {job.job_type})")
    if job.status != "complete":
        raise ValueError(f"Job {job_id} is not complete (status: {job.status})")

    csv_path = _resolve_output_path(job, "rseqc_metrics", "csv")
    if csv_path is None:
        raise FileNotFoundError(f"RSeQC metrics CSV not found for job {job_id}")

    metrics = _parse_rseqc_metrics_csv(csv_path)

    multiqc_output_id: int | None = None
    for output in job.outputs:
        if output.file_category == "multiqc_report" and output.file_type == "html":
            multiqc_output_id = output.id
            break

    genome = (job.params or {}).get("reference_genome", "")

    return RnaseqQCDashboardReport(
        reference_genome=genome,
        modules_run=[
            "infer_experiment",
            "read_distribution",
            "geneBody_coverage",
            "inner_distance",
            "junction_saturation",
        ],
        metrics=metrics,
        multiqc_output_id=multiqc_output_id,
    )


async def get_rnaseq_qc_dashboard_csv_path(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> Path | None:
    """Return absolute path to the RSeQC metrics CSV for download."""
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None
    if job.job_type != "rnaseq_qc":
        raise ValueError(f"Job {job_id} is not an rnaseq_qc job (got {job.job_type})")
    if job.status != "complete":
        raise ValueError(f"Job {job_id} is not complete (status: {job.status})")
    path = _resolve_output_path(job, "rseqc_metrics", "csv")
    if path is None:
        raise FileNotFoundError(f"RSeQC metrics CSV not found for job {job_id}")
    return path


# ---------------------------------------------------------------------------
# RNA-seq Pathway Analysis report
# ---------------------------------------------------------------------------

_PATHWAY_PLOT_CATEGORIES = {
    "go_bp": "go_bp_plot",
    "go_mf": "go_mf_plot",
    "go_cc": "go_cc_plot",
    "kegg": "kegg_plot",
    "gsea": "gsea_plot",
}


def _parse_pathway_csv(
    csv_path: Path,
    max_rows: int = 50,
) -> tuple[list[str], list[dict[str, str | float | int]]]:
    """Parse GO or KEGG results CSV. Returns (column_names, preview_rows)."""
    columns: list[str] = []
    rows: list[dict[str, str | float | int]] = []
    with open(csv_path, newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        columns = list(reader.fieldnames or [])
        for i, row in enumerate(reader):
            if i >= max_rows:
                break
            parsed: dict[str, str | float | int] = {}
            for col in columns:
                val = row.get(col, "")
                try:
                    parsed[col] = float(val)
                except ValueError:
                    try:
                        parsed[col] = int(val)
                    except ValueError:
                        parsed[col] = val
            rows.append(parsed)
    return columns, rows


def _find_pathway_plot_output_ids(
    job: AnalysisJob,
) -> list[PathwayPlotInfo]:
    """Match job outputs to pathway plot types (PNG only)."""
    plot_infos: list[PathwayPlotInfo] = []
    for plot_type, category in _PATHWAY_PLOT_CATEGORIES.items():
        png_id = None
        for output in job.outputs:
            if output.file_category == category and output.file_type == "png":
                png_id = output.id
        if png_id is not None:
            plot_infos.append(PathwayPlotInfo(plot_type=plot_type, output_id_png=png_id))
    return plot_infos


async def get_pathway_report(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> PathwayReport | None:
    """Return structured pathway report for a completed rnaseq_pathway job."""
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None

    if job.job_type != "rnaseq_pathway":
        raise ValueError(f"Job {job_id} is not an rnaseq_pathway job (got {job.job_type})")
    if job.status != "complete":
        raise ValueError(f"Job {job_id} is not complete (status: {job.status})")

    params = job.params or {}

    # Read summary JSON
    summary_path = _resolve_output_path(job, "pathway_summary", "json")
    summary: dict = {}
    if summary_path is not None:
        summary = json.loads(summary_path.read_text())

    # Read GO preview
    go_columns: list[str] = []
    go_preview: list[dict[str, str | float | int]] = []
    go_csv = _resolve_output_path(job, "go_results", "csv")
    if go_csv is not None:
        go_columns, go_preview = _parse_pathway_csv(go_csv)

    # Read KEGG preview
    kegg_columns: list[str] = []
    kegg_preview: list[dict[str, str | float | int]] = []
    kegg_csv = _resolve_output_path(job, "kegg_results", "csv")
    if kegg_csv is not None:
        kegg_columns, kegg_preview = _parse_pathway_csv(kegg_csv)

    plot_infos = _find_pathway_plot_output_ids(job)

    return PathwayReport(
        gene_list_source=params.get("gene_list_source", "both"),
        fdr_threshold=float(params.get("fdr_threshold", 0.05)),
        total_input_genes=summary.get("total_input_genes", 0),
        mapped_entrez_genes=summary.get("mapped_entrez_genes", 0),
        unmapped_genes=summary.get("unmapped_genes", 0),
        go_bp_terms=summary.get("go_bp_terms", 0),
        go_mf_terms=summary.get("go_mf_terms", 0),
        go_cc_terms=summary.get("go_cc_terms", 0),
        kegg_pathways=summary.get("kegg_pathways", 0),
        gsea_enabled=summary.get("gsea_enabled", False),
        gsea_terms=summary.get("gsea_terms", 0),
        go_column_names=go_columns,
        kegg_column_names=kegg_columns,
        go_preview=go_preview,
        kegg_preview=kegg_preview,
        plot_outputs=plot_infos,
    )


async def get_pathway_go_csv_path(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> Path | None:
    """Return absolute path to GO results CSV for download."""
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None
    if job.job_type != "rnaseq_pathway" or job.status != "complete":
        raise ValueError(f"Job {job_id} is not a completed rnaseq_pathway job")
    path = _resolve_output_path(job, "go_results", "csv")
    if path is None:
        raise FileNotFoundError(f"GO results not found for job {job_id}")
    return path


async def get_pathway_kegg_csv_path(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> Path | None:
    """Return absolute path to KEGG results CSV for download."""
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None
    if job.job_type != "rnaseq_pathway" or job.status != "complete":
        raise ValueError(f"Job {job_id} is not a completed rnaseq_pathway job")
    path = _resolve_output_path(job, "kegg_results", "csv")
    if path is None:
        raise FileNotFoundError(f"KEGG results not found for job {job_id}")
    return path


async def get_pathway_gene_list_path(
    db: AsyncSession,
    job_id: int,
    user_id: int,
) -> Path | None:
    """Return absolute path to filtered gene list TSV for download."""
    job = await _get_authorized_job(db, job_id, user_id)
    if job is None:
        return None
    if job.job_type != "rnaseq_pathway" or job.status != "complete":
        raise ValueError(f"Job {job_id} is not a completed rnaseq_pathway job")
    path = _resolve_output_path(job, "gene_list", "tsv")
    if path is None:
        raise FileNotFoundError(f"Gene list not found for job {job_id}")
    return path
