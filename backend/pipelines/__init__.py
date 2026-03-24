# backend/pipelines/__init__.py
import time
from pathlib import Path

from config import settings


def run(job_type: str, params: dict, working_dir: Path) -> dict:
    """Dispatch pipeline execution by job type.

    In mock mode, returns canned results after a short delay.
    In real mode, raises NotImplementedError until pipeline modules are built.
    """
    if settings.PIPELINE_MODE == "mock":
        return _mock_run(job_type, params, working_dir)
    raise NotImplementedError(f"Pipeline '{job_type}' not yet implemented")


def _mock_run(job_type: str, params: dict, working_dir: Path) -> dict:
    time.sleep(2)
    return {
        "job_type": job_type,
        "status": "complete",
        "message": f"Mock {job_type} completed successfully",
        "outputs": [],
    }
