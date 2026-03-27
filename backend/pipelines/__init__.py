# backend/pipelines/__init__.py
import time
from pathlib import Path

from config import settings
from pipelines.alignment import AlignmentStage
from pipelines.base import PipelineError, PipelineStage
from pipelines.trimming import TrimmingStage

# Registry of pipeline stages by job_type
_STAGES: dict[str, PipelineStage] = {
    "trimming": TrimmingStage(),
    "alignment": AlignmentStage(),
}


def run(job_type: str, params: dict, working_dir: Path, job_dir: Path) -> dict:
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
        return stage.run(job_id, params, working_dir, job_dir)

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
