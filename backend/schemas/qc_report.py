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
# RNA-seq Alignment QC Report
# ---------------------------------------------------------------------------


class RnaseqAlignmentReactionMetrics(CamelModel):
    """Per-reaction RNA-seq alignment QC metrics (STAR + Salmon)."""

    short_name: str
    # STAR metrics
    total_input_reads: int
    uniquely_mapped_reads: int
    unique_mapping_rate: float
    multi_mapped_rate: float
    unmapped_rate: float
    average_mapped_length: float
    num_splices: int
    num_splices_annotated: int = 0
    num_splices_gt_ag: int = 0
    num_splices_gc_ag: int = 0
    num_splices_at_ac: int = 0
    num_splices_non_canonical: int = 0
    mismatch_rate: float
    # Salmon metrics
    salmon_mapping_rate: float
    salmon_library_type: str
    salmon_num_processed: int
    salmon_frag_length_mean: float = 0.0
    salmon_frag_length_sd: float = 0.0


class RnaseqAlignmentQCReport(CamelModel):
    """Full RNA-seq alignment QC report for an rnaseq_alignment job."""

    reference_genome: str
    metrics: list[RnaseqAlignmentReactionMetrics]


# ---------------------------------------------------------------------------
# RSeQC + MultiQC QC Dashboard Report
# ---------------------------------------------------------------------------


class RSeQCReactionMetrics(CamelModel):
    """Per-reaction RSeQC metrics."""

    short_name: str
    fraction_sense: float
    fraction_antisense: float
    fraction_undetermined: float
    inferred_strandedness: str
    cds_exons_tags: int
    five_utr_exons_tags: int
    three_utr_exons_tags: int
    intron_tags: int
    intergenic_tags: int
    coverage_skewness: float = 0.0
    inner_distance_mean: float = 0.0
    inner_distance_sd: float = 0.0


class RnaseqQCDashboardReport(CamelModel):
    """Full RSeQC + MultiQC QC dashboard report."""

    reference_genome: str
    modules_run: list[str]
    metrics: list[RSeQCReactionMetrics]
    multiqc_output_id: int | None = None


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
# RNA-seq DE Report
# ---------------------------------------------------------------------------


class RnaseqDEPlotInfo(CamelModel):
    """Metadata for an RNA-seq DE plot output (PNG + SVG pair)."""

    plot_type: str  # volcano, ma, pca, distance_heatmap, gene_heatmap
    output_id_png: int | None = None
    output_id_svg: int | None = None


class RnaseqDEReport(CamelModel):
    """Full RNA-seq DESeq2 results report.

    column_names and results_preview follow the same dynamic pattern as DiffBind.
    """

    quantification_source: str  # "salmon" or "featurecounts"
    conditions: list[str]
    reference_condition: str | None = None
    column_names: list[str]
    total_genes: int
    significant_genes_005: int
    significant_genes_001: int
    upregulated: int
    downregulated: int
    results_preview: list[dict[str, str | float]]
    plot_outputs: list[RnaseqDEPlotInfo]


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


class PearsonCorrelationPlotInfo(CamelModel):
    """Metadata for a Pearson correlation heatmap output (PNG + SVG)."""

    output_id_png: int | None = None
    output_id_svg: int | None = None


class PearsonCorrelationReport(CamelModel):
    """Report for a completed Pearson correlation job."""

    sample_count: int
    sample_labels: list[str]
    reference_genome: str
    masking_applied: bool
    restrict_bed_label: str | None = None
    plot_output: PearsonCorrelationPlotInfo
    coverage_matrix_output_id: int | None = None
    correlation_matrix_output_id: int | None = None


# ---------------------------------------------------------------------------
# Roman Normalization Report
# ---------------------------------------------------------------------------


class NormalizationFactorEntry(CamelModel):
    """Per-sample normalization factor from Roman normalization."""

    sample_name: str
    percentile_99: float
    normalization_factor: float


class RomanNormalizationReport(CamelModel):
    """Report for a completed Roman normalization job."""

    sample_count: int
    sample_labels: list[str]
    reference_genome: str
    reference_sample: str
    normalization_factors: list[NormalizationFactorEntry]
    plot_output_id_png: int | None = None
    plot_output_id_svg: int | None = None
    factors_csv_output_id: int | None = None
