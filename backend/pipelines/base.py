# backend/pipelines/base.py
import os
import subprocess
from abc import ABC, abstractmethod
from pathlib import Path

import structlog

logger = structlog.get_logger(__name__)


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


# ---------------------------------------------------------------------------
# Shared subprocess helpers — used by alignment.py and peak_calling.py
# ---------------------------------------------------------------------------

_REFERENCE_DIR = Path(__file__).resolve().parent / "reference"
_BLACKLISTS_DIR = _REFERENCE_DIR / "blacklists"


def get_threads() -> int:
    """Return available CPU count (fallback 4)."""
    return os.cpu_count() or 4


def run_cmd(
    cmd: list[str],
    log_path: Path | None = None,
    timeout: int = 7200,
    check: bool = True,
    cwd: Path | None = None,
) -> subprocess.CompletedProcess:
    """Run a subprocess, capture output, optionally write to log, raise on failure."""
    logger.info("pipeline.subprocess", cmd=" ".join(cmd))
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        cwd=cwd,
    )
    if log_path:
        log_path.write_text(proc.stdout + "\n" + proc.stderr)
    if check and proc.returncode != 0:
        stderr_tail = proc.stderr.strip()[-500:] if proc.stderr else "(no stderr)"
        raise PipelineError(f"Command failed (exit {proc.returncode}): {stderr_tail}")
    return proc


def run_piped_cmd(
    cmd1: list[str],
    cmd2: list[str],
    output_path: Path,
    log_path: Path | None = None,
    timeout: int = 7200,
) -> None:
    """Run two commands piped together: cmd1 | cmd2 > output_path."""
    logger.info(
        "pipeline.piped_subprocess",
        cmd1=" ".join(cmd1),
        cmd2=" ".join(cmd2),
    )
    with open(output_path, "wb") as out_f:
        p1 = subprocess.Popen(cmd1, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        p2 = subprocess.Popen(cmd2, stdin=p1.stdout, stdout=out_f, stderr=subprocess.PIPE)
        if p1.stdout:
            p1.stdout.close()
        _, stderr2 = p2.communicate(timeout=timeout)
        _, stderr1 = p1.communicate(timeout=30)

    if log_path and stderr1:
        log_path.write_text(stderr1.decode("utf-8", errors="replace"))

    if p1.returncode != 0:
        raise PipelineError(
            f"Pipe cmd1 failed (exit {p1.returncode}): "
            f"{stderr1.decode('utf-8', errors='replace').strip()[-500:]}"
        )
    if p2.returncode != 0:
        raise PipelineError(
            f"Pipe cmd2 failed (exit {p2.returncode}): "
            f"{stderr2.decode('utf-8', errors='replace').strip()[-500:]}"
        )


def count_bam_reads(bam_path: Path) -> int:
    """Count reads in a BAM file via samtools view -c."""
    proc = subprocess.run(
        ["samtools", "view", "-c", str(bam_path)],
        capture_output=True,
        text=True,
    )
    try:
        return int(proc.stdout.strip())
    except ValueError:
        return 0


def resolve_blacklist(genome: str) -> Path | None:
    """Find the blacklist BED file for the given genome."""
    bed = _BLACKLISTS_DIR / f"{genome}.blacklist.bed"
    return bed if bed.exists() else None
