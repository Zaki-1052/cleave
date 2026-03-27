# backend/schemas/qc_report.py
"""Pydantic schemas for QC reports — column names match CUTANA Cloud CSV exports."""

from schemas.common import CamelModel


class AlignmentReactionMetrics(CamelModel):
    """Per-reaction alignment QC metrics.

    Column mapping to cutana/H3K4me3/Mouse mm10_alignment_metrics.csv:
        short_name               → Short_Name
        total_read_pairs         → Total_Read_Pairs
        aligned_read_pairs       → Aligned_Read_Pairs
        uniquely_aligned_read_pairs → Uniquely_Aligned_Read_Pairs
        unique_alignment_rate    → Unique_Alignment_Rate(%)
        duplication_rate         → Duplication_Rate(%)
        chrm_bandwidth           → chrM_Bandwidth(%)
        ecoli_read_pairs         → Ecoli_Read_Pairs
        ecoli_alignment_rate     → Ecoli_Alignment_Rate(%)
    """

    short_name: str
    total_read_pairs: int
    aligned_read_pairs: int
    uniquely_aligned_read_pairs: int
    unique_alignment_rate: float
    duplication_rate: float
    chrm_bandwidth: float
    ecoli_read_pairs: int
    ecoli_alignment_rate: float
    ecoli_normalization_factor: float


class SpikeInPTMResult(CamelModel):
    """Per-PTM barcode count and recovery percentage."""

    ptm_name: str
    raw_count: int
    pct_recovery: float


class SpikeInReactionResult(CamelModel):
    """Per-reaction spike-in QC results."""

    short_name: str
    on_target_ptm: str | None = None
    total_barcode_reads: int
    ptm_results: list[SpikeInPTMResult]


class AlignmentQCReport(CamelModel):
    """Full alignment QC report for an alignment job."""

    reference_genome: str
    metrics: list[AlignmentReactionMetrics]
    spike_in_results: list[SpikeInReactionResult] | None = None


# ---------------------------------------------------------------------------
# Peak Calling QC Report
# ---------------------------------------------------------------------------


class PeakCallingReactionMetrics(CamelModel):
    """Per-reaction peak calling QC metrics.

    Column mapping to cutana/H3K4me3/peak_caller_metrics.csv:
        short_name                  → Short_Name
        control_short_name          → Control_Short_Name
        reference_genome            → Reference_Genome
        peak_caller                 → Peak_Caller
        peak_size                   → Peak_Size
        significance_threshold      → Significance_Threshold
        uniquely_aligned_read_pairs → Uniquely_Aligned_Read_Pairs
        called_peaks                → Called_Peaks
        reads_in_peaks              → Reads_in_Peaks
        frip                        → FRiP
    """

    short_name: str
    control_short_name: str
    reference_genome: str
    peak_caller: str
    peak_size: str
    significance_threshold: float
    uniquely_aligned_read_pairs: int
    called_peaks: int
    reads_in_peaks: int
    frip: float


class TopCalledPeak(CamelModel):
    """Top called peaks for a reaction."""

    short_name: str
    control_short_name: str
    reference_genome: str
    peak_caller: str
    peak_size: str
    significance_threshold: float
    top_peaks: list[str]


class PeakCallingQCReport(CamelModel):
    """Full peak calling QC report for a peak calling job."""

    reference_genome: str
    peak_caller: str
    peak_size: str
    metrics: list[PeakCallingReactionMetrics]
    top_peaks: list[TopCalledPeak] | None = None
