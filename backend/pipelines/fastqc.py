# backend/pipelines/fastqc.py
"""FastQC pipeline module — runs inline after FASTQ upload (not via worker job queue)."""

import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

import structlog

from config import settings
from pipelines.base import PipelineError

logger = structlog.get_logger(__name__)


def _resolve_sample_dir() -> Path:
    """Find the cutana/fastqc/ sample data directory.

    Works both locally (relative to project root) and in Docker (/cutana/fastqc).
    """
    # Docker mount path
    docker_path = Path("/cutana/fastqc")
    if docker_path.exists():
        return docker_path
    # Local dev: project_root/cutana/fastqc (2 levels up from pipelines/)
    return Path(__file__).resolve().parents[2] / "cutana" / "fastqc"


_SAMPLE_DIR = _resolve_sample_dir()


@dataclass
class FastqcResult:
    """Parsed result from a FastQC run."""

    total_reads: int | None = None
    sequence_length: int | None = None
    report_html_path: str = ""  # relative path from STORAGE_ROOT
    adapter_status: str | None = None  # "pass", "warn", or "fail"
    module_summaries: dict[str, str] = field(default_factory=dict)


def _strip_fastq_extension(filename: str) -> str:
    """Strip .fastq.gz / .fastq / .fq.gz / .fq extension to get the stem."""
    lower = filename.lower()
    for ext in (".fastq.gz", ".fq.gz", ".fastq", ".fq"):
        if lower.endswith(ext):
            return filename[: len(filename) - len(ext)]
    return filename


def parse_fastqc_data(txt_path: Path) -> FastqcResult:
    """Parse a FastQC data.txt or .stats-fastqc.txt file.

    Extracts Total Sequences and per-module pass/fail/warn statuses.
    """
    total_reads = None
    sequence_length = None
    adapter_status = None
    module_summaries: dict[str, str] = {}

    with open(txt_path) as f:
        for line in f:
            line = line.rstrip("\n")

            # Module headers: >>Module Name\tstatus
            if line.startswith(">>") and not line.startswith(">>END_MODULE"):
                parts = line[2:].split("\t")
                if len(parts) == 2:
                    module_summaries[parts[0]] = parts[1]
                    if parts[0] == "Adapter Content":
                        adapter_status = parts[1]

            if line.startswith("Total Sequences\t"):
                try:
                    total_reads = int(line.split("\t")[1])
                except (IndexError, ValueError):
                    pass

            if line.startswith("Sequence length\t"):
                try:
                    raw_val = line.split("\t")[1].strip()
                    if "-" in raw_val:
                        sequence_length = max(int(x) for x in raw_val.split("-"))
                    else:
                        sequence_length = int(raw_val)
                except (IndexError, ValueError):
                    pass

    return FastqcResult(
        total_reads=total_reads,
        sequence_length=sequence_length,
        adapter_status=adapter_status,
        module_summaries=module_summaries,
    )


def find_fastqc_data_txt(html_abs_path: Path) -> Path | None:
    """Locate the FastQC data TXT file corresponding to an HTML report.

    Real mode: {stem}_fastqc/fastqc_data.txt (extracted zip contents)
    Mock mode: {stem}_fastqc_data.txt (copied alongside HTML)
    """
    stem = html_abs_path.stem  # e.g. "sample_R1_001_fastqc"
    parent = html_abs_path.parent

    # Real mode: extracted subdirectory shares the HTML stem name
    real_txt = parent / stem / "fastqc_data.txt"
    if real_txt.exists():
        return real_txt

    # Mock mode: flat file next to HTML
    if stem.endswith("_fastqc"):
        basename = stem[: -len("_fastqc")]
        mock_txt = parent / f"{basename}_fastqc_data.txt"
        if mock_txt.exists():
            return mock_txt

    return None


def _find_sample_files() -> tuple[Path, Path] | None:
    """Find a sample HTML + TXT pair from cutana/fastqc/ for mock mode."""
    if not _SAMPLE_DIR.exists():
        return None
    html_files = sorted(_SAMPLE_DIR.glob("*.stats-fastqc.html"))
    for html_path in html_files:
        txt_path = html_path.with_suffix("").with_suffix(".stats-fastqc.txt")
        if txt_path.exists():
            return html_path, txt_path
    return None


def mock_run_for_file(fastq_path: Path, output_dir: Path) -> FastqcResult:
    """Mock FastQC run — copies a sample report and parses metrics from it."""
    stem = _strip_fastq_extension(fastq_path.name)
    output_dir.mkdir(parents=True, exist_ok=True)

    sample = _find_sample_files()
    if sample is None:
        logger.warning("fastqc.mock_no_sample_data", sample_dir=str(_SAMPLE_DIR))
        return FastqcResult()

    sample_html, sample_txt = sample
    dest_html = output_dir / f"{stem}_fastqc.html"
    shutil.copy2(sample_html, dest_html)

    # Copy TXT alongside HTML so the summary endpoint can parse it
    dest_txt = output_dir / f"{stem}_fastqc_data.txt"
    shutil.copy2(sample_txt, dest_txt)

    result = parse_fastqc_data(sample_txt)
    result.report_html_path = str(dest_html)
    return result


def run_for_file(fastq_path: Path, output_dir: Path) -> FastqcResult:
    """Real FastQC run — calls fastqc CLI and parses the output."""
    stem = _strip_fastq_extension(fastq_path.name)
    output_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        "fastqc",
        "--outdir",
        str(output_dir),
        "--threads",
        "1",
        "--extract",
        str(fastq_path),
    ]
    logger.info("fastqc.run_start", fastq=fastq_path.name, cmd=" ".join(cmd))

    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if proc.returncode != 0:
        raise PipelineError(f"FastQC failed for {fastq_path.name}: {proc.stderr.strip()}")

    # FastQC creates: {stem}_fastqc.html and {stem}_fastqc/ (extracted dir)
    html_path = output_dir / f"{stem}_fastqc.html"
    data_txt = output_dir / f"{stem}_fastqc" / "fastqc_data.txt"

    if not html_path.exists():
        raise PipelineError(f"FastQC HTML report not found: {html_path}")
    if not data_txt.exists():
        raise PipelineError(f"FastQC data.txt not found: {data_txt}")

    result = parse_fastqc_data(data_txt)
    result.report_html_path = str(html_path)

    # Clean up the ZIP file to save space (HTML + extracted dir are sufficient)
    zip_path = output_dir / f"{stem}_fastqc.zip"
    if zip_path.exists():
        zip_path.unlink()

    logger.info(
        "fastqc.run_complete",
        fastq=fastq_path.name,
        total_reads=result.total_reads,
    )
    return result


def run_fastqc(fastq_path: Path, output_dir: Path) -> FastqcResult:
    """Dispatch to mock or real FastQC based on PIPELINE_MODE."""
    if settings.PIPELINE_MODE == "mock":
        return mock_run_for_file(fastq_path, output_dir)
    return run_for_file(fastq_path, output_dir)
