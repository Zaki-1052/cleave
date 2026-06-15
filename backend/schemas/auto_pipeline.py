# backend/schemas/auto_pipeline.py
from schemas.common import CamelModel


class AutoPipelineConfig(CamelModel):
    """Configuration for auto-pipeline mode.

    Single schema for both CUT&RUN and RNA-seq. Unused fields for the other
    assay type are harmlessly stored in the config JSON.
    """

    reference_genome: str
    # CUT&RUN fields (unused for RNA-seq)
    peak_caller: str = "SEACR"
    peak_size: str = "stringent"
    macs2_qvalue: float = 0.01
    fragment_filter: bool = True
    include_normalization: bool = True
    include_diffbind: bool = True
    include_heatmap: bool = True
    include_pearson: bool = True
    # RNA-seq fields (unused for CUT&RUN)
    remove_duplicates: bool = False
    include_qc: bool = True
    include_de: bool = True


class AutoPipelineStatusRead(CamelModel):
    """Current auto-pipeline state for an experiment."""

    auto_pipeline: bool
    auto_pipeline_status: str | None
    auto_pipeline_config: dict | None
