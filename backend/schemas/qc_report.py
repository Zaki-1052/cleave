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


class PeakAnnotationResult(CamelModel):
    """Per-reaction peak annotation distribution (% peaks per genomic feature)."""

    short_name: str
    categories: dict[str, float]


class PeakCallingQCReport(CamelModel):
    """Full peak calling QC report for a peak calling job."""

    reference_genome: str
    peak_caller: str
    peak_size: str
    metrics: list[PeakCallingReactionMetrics]
    top_peaks: list[TopCalledPeak] | None = None
    annotations: list[PeakAnnotationResult] | None = None


# ---------------------------------------------------------------------------
# DiffBind Report
# ---------------------------------------------------------------------------


class DiffBindPlotInfo(CamelModel):
    """Metadata for a DiffBind plot output (PNG + SVG pair)."""

    plot_type: str  # pca, ma, volcano, heatmap_group, heatmap_condition
    output_id_png: int | None = None
    output_id_svg: int | None = None


class DiffBindReport(CamelModel):
    """Full DiffBind results report.

    column_names and results_preview use dynamic keys — the Conc_X columns
    come from dba.report() based on the sample sheet Condition column values.
    """

    analysis_method: str
    conditions: list[str]
    column_names: list[str]
    total_peaks: int
    significant_peaks_005: int
    significant_peaks_001: int
    results_preview: list[dict[str, str | float]]
    plot_outputs: list[DiffBindPlotInfo]


# ---------------------------------------------------------------------------
# Custom Heatmap Report
# ---------------------------------------------------------------------------


class CustomHeatmapPlotInfo(CamelModel):
    """Metadata for a custom heatmap plot output (PNG + SVG)."""

    output_id_png: int | None = None
    output_id_svg: int | None = None


class CustomHeatmapReport(CamelModel):
    """Report for a completed custom reference-point heatmap job."""

    bed_label: str
    sample_count: int
    sample_labels: list[str]
    flanking_upstream: int
    flanking_downstream: int
    reference_point: str
    sort_order: str
    color_map: str | None = None
    plot_output: CustomHeatmapPlotInfo
    profile_output: CustomHeatmapPlotInfo
    matrix_output_id: int | None = None
