# backend/pipelines/base.py
from abc import ABC, abstractmethod
from pathlib import Path


class PipelineError(Exception):
    pass


class PipelineStage(ABC):
    """Base class for all pipeline stages."""

    @abstractmethod
    def validate(self, params: dict) -> list[str]:
        """Validate params before execution. Returns list of error messages (empty = valid)."""
        ...

    @abstractmethod
    def run(self, job_id: int, params: dict, working_dir: Path, job_dir: Path) -> dict:
        """Execute the pipeline stage."""
        ...

    def mock_run(self, job_id: int, params: dict, working_dir: Path, job_dir: Path) -> dict:
        """Return canned results for local dev without bioinformatics tools."""
        return {
            "job_id": job_id,
            "status": "complete",
            "message": f"Mock run for {self.__class__.__name__}",
        }

    @abstractmethod
    def generate_methods_text(self, params: dict) -> str:
        """Generate manuscript-ready methods text for this stage."""
        ...
