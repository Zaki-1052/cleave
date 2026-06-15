# backend/pipelines/__init__.py
import time
from collections.abc import Callable
from pathlib import Path

from config import settings
from pipelines.alignment import AlignmentStage
from pipelines.base import PipelineError, PipelineStage
from pipelines.custom_heatmap import CustomHeatmapStage
from pipelines.diffbind import DiffBindStage
from pipelines.peak_calling import PeakCallingStage
from pipelines.pearson_correlation import PearsonCorrelationStage
from pipelines.rnaseq_alignment import RnaseqAlignmentStage
from pipelines.rnaseq_de import RnaseqDEStage
from pipelines.rnaseq_feature_counts import FeatureCountsStage
from pipelines.rnaseq_pathway import RnaseqPathwayStage
from pipelines.rnaseq_qc import RnaseqQCStage
from pipelines.rnaseq_trimming import RnaseqTrimmingStage
from pipelines.roman_normalization import RomanNormalizationStage
from pipelines.trimming import TrimmingStage

# Registry of pipeline stages by job_type
_STAGES: dict[str, PipelineStage] = {
    "trimming": TrimmingStage(),
    "rnaseq_trimming": RnaseqTrimmingStage(),
    "rnaseq_alignment": RnaseqAlignmentStage(),
    "rnaseq_de": RnaseqDEStage(),
    "rnaseq_feature_counts": FeatureCountsStage(),
    "rnaseq_qc": RnaseqQCStage(),
    "rnaseq_pathway": RnaseqPathwayStage(),
    "alignment": AlignmentStage(),
    "peak_calling": PeakCallingStage(),
    "diffbind": DiffBindStage(),
    "custom_heatmap": CustomHeatmapStage(),
    "pearson_correlation": PearsonCorrelationStage(),
    "roman_normalization": RomanNormalizationStage(),
}


def run(
    job_type: str,
    params: dict,
    working_dir: Path,
    job_dir: Path,
    cancelled: Callable[[], bool] | None = None,
) -> dict:
    """Dispatch pipeline execution by job type.

    Registered stages use their own mock_run/run methods.
    Unregistered types fall back to a generic mock (for forward compatibility).
    """
    stage = _STAGES.get(job_type)

    if stage is not None:
        errors = stage.validate(params)
        if errors:
            raise PipelineError(f"Validation failed: {'; '.join(errors)}")

        job_id = params.get("job_id", 0)
        if settings.PIPELINE_MODE == "mock":
            return stage.mock_run(job_id, params, working_dir, job_dir)
        return stage.run(job_id, params, working_dir, job_dir, cancelled=cancelled)

    # Fallback for unregistered pipeline types
    if settings.PIPELINE_MODE == "mock":
        return _mock_run(job_type, params, working_dir)
    raise PipelineError(f"Unknown pipeline type: {job_type}")


def _mock_run(job_type: str, params: dict, working_dir: Path) -> dict:
    """Generic mock for unregistered pipeline types."""
    time.sleep(2)
    return {
        "job_type": job_type,
        "status": "complete",
        "message": f"Mock {job_type} completed successfully",
        "outputs": [],
    }
