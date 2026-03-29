# backend/schemas/auto_pipeline.py
from schemas.common import CamelModel


class AutoPipelineConfig(CamelModel):
    """Configuration for auto-pipeline mode."""

    reference_genome: str
    peak_caller: str = "macs2"
    peak_size: str = "narrow"
    macs2_qvalue: float = 0.01
    fragment_filter: bool = True
    include_normalization: bool = True
    include_diffbind: bool = True
    include_heatmap: bool = True
    include_pearson: bool = True


class AutoPipelineStatusRead(CamelModel):
    """Current auto-pipeline state for an experiment."""

    auto_pipeline: bool
    auto_pipeline_status: str | None
    auto_pipeline_config: dict | None
