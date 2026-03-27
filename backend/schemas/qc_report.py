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
