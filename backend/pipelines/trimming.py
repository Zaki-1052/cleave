# backend/pipelines/trimming.py
"""Trimming pipeline — two-stage: Trimmomatic (adapter+quality) → kseq_test (fixed-length)."""

import os
import shutil
import subprocess
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

import structlog

from config import settings
from pipelines.base import PipelineError, PipelineStage, TerminatedError

logger = structlog.get_logger(__name__)

# Default parameters matching the lab's integrated.sh and cleave-spec-decisions.md §6
DEFAULTS = {
    "adapter_file": "Truseq3.PE.fa",
    "illuminaclip": "2:15:4:4:true",
    "leading": 20,
    "trailing": 20,
    "slidingwindow": "4:15",
    "minlen": 25,
    "kseq_length": 42,
    "threads": 0,  # 0 = auto-detect via os.cpu_count()
}

_ADAPTERS_DIR = Path(__file__).resolve().parent / "adapters"
_TOOLS_DIR = Path(__file__).resolve().parent / "tools"


def _get_threads(params: dict) -> int:
    threads = params.get("threads", DEFAULTS["threads"])
    if not threads or threads <= 0:
        return os.cpu_count() or 4
    return threads


def _get_param(params: dict, key: str):
    """Get a parameter with fallback to defaults."""
    return params.get(key, DEFAULTS.get(key))


def _resolve_trimmomatic_cmd() -> list[str]:
    """Resolve Trimmomatic invocation prefix, portable across install methods.

    Priority:
      1. TRIMMOMATIC_JAR env var (explicit JAR path for manual installs)
      2. Conda share directory ($CONDA_PREFIX/share/trimmomatic-*/trimmomatic.jar)
      3. 'trimmomatic' on PATH called directly (handles conda wrappers, system packages)
    """
    # 1. Explicit JAR path override
    jar_env = os.environ.get("TRIMMOMATIC_JAR")
    if jar_env:
        jar_path = Path(jar_env)
        if jar_path.is_file():
            return ["java", "-jar", str(jar_path)]
        logger.warning("TRIMMOMATIC_JAR set but file not found", path=jar_env)

    # 2. Conda share directory
    conda_prefix = os.environ.get("CONDA_PREFIX", "")
    if conda_prefix:
        jars = sorted(Path(conda_prefix).glob("share/trimmomatic-*/trimmomatic.jar"))
        if jars:
            return ["java", "-jar", str(jars[-1])]

    # 3. trimmomatic on PATH (wrapper script or direct binary)
    trimmomatic_bin = shutil.which("trimmomatic")
    if trimmomatic_bin:
        return [trimmomatic_bin]

    raise PipelineError(
        "Trimmomatic not found. Install via conda, set TRIMMOMATIC_JAR env var, "
        "or ensure 'trimmomatic' is on PATH."
    )


@dataclass(frozen=True)
class _TrimmingContext:
    """Immutable config shared across concurrent pair-processing threads."""

    trimmomatic_cmd_prefix: tuple[str, ...]
    kseq_bin: str
    adapter_path: Path
    illuminaclip: str
    leading: int
    trailing: int
    slidingwindow: str
    minlen: int
    kseq_length: int
    threads: int  # per-pair thread count (after division)
    trimmed_intermediate: Path
    trimmed_final: Path
    log_dir: Path
    project_id: int | str
    experiment_id: int | str
    cancelled: Callable[[], bool] | None


def _process_pair(pair: dict, ctx: _TrimmingContext) -> dict:
    """Process a single FASTQ pair through Trimmomatic + kseq_test. Thread-safe."""
    prefix = pair["prefix"]
    r1_abs = Path(settings.STORAGE_ROOT) / pair["r1_path"]
    r2_abs = Path(settings.STORAGE_ROOT) / pair["r2_path"]

    if not r1_abs.exists():
        raise PipelineError(f"R1 FASTQ not found: {r1_abs}")
    if not r2_abs.exists():
        raise PipelineError(f"R2 FASTQ not found: {r2_abs}")

    # Stage 1: Trimmomatic PE
    r1_paired = ctx.trimmed_intermediate / f"{prefix}_R1_001.paired.fastq.gz"
    r1_unpaired = ctx.trimmed_intermediate / f"{prefix}_R1_001.unpaired.fastq.gz"
    r2_paired = ctx.trimmed_intermediate / f"{prefix}_R2_001.paired.fastq.gz"
    r2_unpaired = ctx.trimmed_intermediate / f"{prefix}_R2_001.unpaired.fastq.gz"

    trim_cmd = [
        *ctx.trimmomatic_cmd_prefix,
        "PE",
        "-threads",
        str(ctx.threads),
        "-phred33",
        str(r1_abs),
        str(r2_abs),
        str(r1_paired),
        str(r1_unpaired),
        str(r2_paired),
        str(r2_unpaired),
        f"ILLUMINACLIP:{ctx.adapter_path}:{ctx.illuminaclip}",
        f"LEADING:{ctx.leading}",
        f"TRAILING:{ctx.trailing}",
        f"SLIDINGWINDOW:{ctx.slidingwindow}",
        f"MINLEN:{ctx.minlen}",
    ]

    if ctx.cancelled and ctx.cancelled():
        raise TerminatedError("Job terminated by user")
    logger.info("trimming.stage1_start", prefix=prefix, cmd=" ".join(trim_cmd))
    proc = subprocess.run(trim_cmd, capture_output=True, text=True, timeout=3600)
    (ctx.log_dir / f"{prefix}_trimmomatic.log").write_text(proc.stdout + "\n" + proc.stderr)
    if proc.returncode != 0:
        raise PipelineError(f"Trimmomatic failed for {prefix}: {proc.stderr.strip()}")

    # Stage 2: kseq_test fixed-length trim
    r1_final = ctx.trimmed_final / f"{prefix}_R1_001_trimmed.fastq.gz"
    r2_final = ctx.trimmed_final / f"{prefix}_R2_001_trimmed.fastq.gz"

    for paired_in, final_out, read in [
        (r1_paired, r1_final, "R1"),
        (r2_paired, r2_final, "R2"),
    ]:
        if ctx.cancelled and ctx.cancelled():
            raise TerminatedError("Job terminated by user")
        kseq_cmd = [ctx.kseq_bin, str(paired_in), str(ctx.kseq_length), str(final_out)]
        logger.info("trimming.stage2_start", prefix=prefix, read=read)
        proc = subprocess.run(kseq_cmd, capture_output=True, text=True, timeout=1800)
        if proc.returncode != 0:
            raise PipelineError(
                f"kseq_test failed for {prefix} {read}: {proc.stderr.strip()}"
            )

    # Build output record
    r1_size = r1_final.stat().st_size if r1_final.exists() else 0
    r2_size = r2_final.stat().st_size if r2_final.exists() else 0
    rel_base = f"projects/{ctx.project_id}/{ctx.experiment_id}/fastqs/trimmed"

    logger.info("trimming.pair_complete", prefix=prefix, r1_size=r1_size, r2_size=r2_size)

    return {
        "prefix": prefix,
        "r1_path": f"{rel_base}/{r1_final.name}",
        "r2_path": f"{rel_base}/{r2_final.name}",
        "r1_filename": r1_final.name,
        "r2_filename": r2_final.name,
        "r1_size": r1_size,
        "r2_size": r2_size,
        "r1_id": pair.get("r1_id"),
        "r2_id": pair.get("r2_id"),
    }


class TrimmingStage(PipelineStage):
    """Two-stage FASTQ trimming: Trimmomatic PE + kseq_test fixed-length trim."""

    def validate(self, params: dict) -> list[str]:
        errors = []
        if "experiment_id" not in params:
            errors.append("Missing required parameter: experiment_id")
        if "project_id" not in params:
            errors.append("Missing required parameter: project_id")
        if "fastq_pairs" not in params or not params["fastq_pairs"]:
            errors.append("Missing required parameter: fastq_pairs (must be non-empty list)")
        else:
            for i, pair in enumerate(params["fastq_pairs"]):
                if "prefix" not in pair:
                    errors.append(f"fastq_pairs[{i}]: missing 'prefix'")
                if "r1_path" not in pair:
                    errors.append(f"fastq_pairs[{i}]: missing 'r1_path'")
                if "r2_path" not in pair:
                    errors.append(f"fastq_pairs[{i}]: missing 'r2_path'")

        adapter = params.get("adapter_file", DEFAULTS["adapter_file"])
        adapter_path = _ADAPTERS_DIR / adapter
        if not adapter_path.exists():
            errors.append(f"Adapter file not found: {adapter}")

        return errors

    def run(
        self,
        job_id: int,
        params: dict,
        working_dir: Path,
        job_dir: Path,
        cancelled: Callable[[], bool] | None = None,
    ) -> dict:
        project_id = params["project_id"]
        experiment_id = params["experiment_id"]
        fastq_pairs = params["fastq_pairs"]
        total_threads = _get_threads(params)

        adapter_file = _get_param(params, "adapter_file")
        adapter_path = _ADAPTERS_DIR / adapter_file
        illuminaclip = _get_param(params, "illuminaclip")
        leading = _get_param(params, "leading")
        trailing = _get_param(params, "trailing")
        slidingwindow = _get_param(params, "slidingwindow")
        minlen = _get_param(params, "minlen")
        kseq_length = _get_param(params, "kseq_length")

        # Resolve kseq_test binary
        kseq_bin = shutil.which("kseq_test")
        if kseq_bin is None:
            kseq_bin_path = _TOOLS_DIR / "kseq_test"
            if kseq_bin_path.exists():
                kseq_bin = str(kseq_bin_path)
            else:
                raise PipelineError(
                    "kseq_test binary not found. Compile from backend/pipelines/tools/kseq_test.c"
                )

        # Resolve Trimmomatic (JAR or wrapper, depending on install method)
        trimmomatic_cmd_prefix = _resolve_trimmomatic_cmd()

        base_dir = working_dir / str(project_id) / str(experiment_id)
        trimmed_intermediate = base_dir / "fastqs" / "trimmed_intermediate"
        trimmed_final = base_dir / "fastqs" / "trimmed"
        log_dir = base_dir / "logs" / f"trimming_{job_id}"
        trimmed_intermediate.mkdir(parents=True, exist_ok=True)
        trimmed_final.mkdir(parents=True, exist_ok=True)
        log_dir.mkdir(parents=True, exist_ok=True)

        # Divide threads among concurrent pairs
        concurrent_count = min(settings.MAX_CONCURRENT_REACTIONS, len(fastq_pairs))
        threads_per_pair = max(2, total_threads // concurrent_count)

        logger.info(
            "trimming.run_start",
            job_id=job_id,
            pairs=len(fastq_pairs),
            total_threads=total_threads,
            concurrent=concurrent_count,
            threads_per_pair=threads_per_pair,
        )

        ctx = _TrimmingContext(
            trimmomatic_cmd_prefix=tuple(trimmomatic_cmd_prefix),
            kseq_bin=kseq_bin,
            adapter_path=adapter_path,
            illuminaclip=illuminaclip,
            leading=leading,
            trailing=trailing,
            slidingwindow=slidingwindow,
            minlen=minlen,
            kseq_length=kseq_length,
            threads=threads_per_pair,
            trimmed_intermediate=trimmed_intermediate,
            trimmed_final=trimmed_final,
            log_dir=log_dir,
            project_id=project_id,
            experiment_id=experiment_id,
            cancelled=cancelled,
        )

        # Dispatch pairs concurrently
        results: dict[int, dict] = {}
        errors: dict[str, str] = {}

        with ThreadPoolExecutor(max_workers=concurrent_count) as executor:
            future_to_pair = {
                executor.submit(_process_pair, pair, ctx): (i, pair["prefix"])
                for i, pair in enumerate(fastq_pairs)
            }
            for future in as_completed(future_to_pair):
                idx, prefix = future_to_pair[future]
                try:
                    results[idx] = future.result()
                except TerminatedError:
                    executor.shutdown(wait=False, cancel_futures=True)
                    raise
                except Exception as exc:
                    errors[prefix] = str(exc)
                    logger.error("trimming.pair_failed", prefix=prefix, error=str(exc))

        # Aggregate outputs in original pair order
        outputs = [results[i] for i in range(len(fastq_pairs)) if i in results]

        if errors:
            error_summary = "; ".join(f"{k}: {v[:100]}" for k, v in errors.items())
            if len(errors) == len(fastq_pairs):
                raise PipelineError(f"All pairs failed: {error_summary}")
            logger.warning(
                "trimming.partial_failure",
                failed=list(errors.keys()),
                succeeded=[fastq_pairs[i]["prefix"] for i in results],
            )

        # Clean up intermediate files to save space
        shutil.rmtree(trimmed_intermediate, ignore_errors=True)

        return {
            "job_id": job_id,
            "status": "complete",
            "message": f"Trimming completed for {len(fastq_pairs)} pairs",
            "outputs": outputs,
            "methods_text": self.generate_methods_text(params),
        }

    def mock_run(self, job_id: int, params: dict, working_dir: Path, job_dir: Path) -> dict:
        """Create real stub files by copying input FASTQs to trimmed output paths."""
        project_id = params["project_id"]
        experiment_id = params["experiment_id"]
        fastq_pairs = params.get("fastq_pairs", [])

        trimmed_dir = working_dir / str(project_id) / str(experiment_id) / "fastqs" / "trimmed"
        trimmed_dir.mkdir(parents=True, exist_ok=True)

        rel_base = f"projects/{project_id}/{experiment_id}/fastqs/trimmed"

        def _mock_process_pair(pair: dict) -> dict:
            time.sleep(1)
            prefix = pair["prefix"]
            r1_abs = Path(settings.STORAGE_ROOT) / pair["r1_path"]
            r2_abs = Path(settings.STORAGE_ROOT) / pair["r2_path"]

            r1_final = trimmed_dir / f"{prefix}_R1_001_trimmed.fastq.gz"
            r2_final = trimmed_dir / f"{prefix}_R2_001_trimmed.fastq.gz"

            if r1_abs.exists():
                shutil.copy2(r1_abs, r1_final)
            else:
                r1_final.write_bytes(b"")
            if r2_abs.exists():
                shutil.copy2(r2_abs, r2_final)
            else:
                r2_final.write_bytes(b"")

            r1_size = r1_final.stat().st_size if r1_final.exists() else 0
            r2_size = r2_final.stat().st_size if r2_final.exists() else 0

            logger.info("trimming.mock_pair_complete", prefix=prefix)

            return {
                "prefix": prefix,
                "r1_path": f"{rel_base}/{r1_final.name}",
                "r2_path": f"{rel_base}/{r2_final.name}",
                "r1_filename": r1_final.name,
                "r2_filename": r2_final.name,
                "r1_size": r1_size,
                "r2_size": r2_size,
                "r1_id": pair.get("r1_id"),
                "r2_id": pair.get("r2_id"),
            }

        concurrent_count = min(settings.MAX_CONCURRENT_REACTIONS, max(len(fastq_pairs), 1))

        with ThreadPoolExecutor(max_workers=concurrent_count) as executor:
            future_to_idx = {
                executor.submit(_mock_process_pair, pair): i
                for i, pair in enumerate(fastq_pairs)
            }
            indexed_results: dict[int, dict] = {}
            for future in as_completed(future_to_idx):
                idx = future_to_idx[future]
                indexed_results[idx] = future.result()

        # Aggregate in original pair order
        outputs = [indexed_results[i] for i in range(len(fastq_pairs))]

        return {
            "job_id": job_id,
            "status": "complete",
            "message": f"Mock trimming completed for {len(fastq_pairs)} pairs",
            "outputs": outputs,
            "methods_text": self.generate_methods_text(params),
        }

    def generate_methods_text(self, params: dict) -> str:
        adapter = _get_param(params, "adapter_file")
        illuminaclip = _get_param(params, "illuminaclip")
        leading = _get_param(params, "leading")
        trailing = _get_param(params, "trailing")
        slidingwindow = _get_param(params, "slidingwindow")
        minlen = _get_param(params, "minlen")
        kseq_length = _get_param(params, "kseq_length")

        return (
            f"Adapter sequences were removed using Trimmomatic (PE mode, "
            f"ILLUMINACLIP:{adapter}:{illuminaclip}, "
            f"LEADING:{leading}, TRAILING:{trailing}, "
            f"SLIDINGWINDOW:{slidingwindow}, MINLEN:{minlen}). "
            f"Reads were subsequently trimmed to a uniform length of {kseq_length}bp "
            f"using kseq_test (CUTRUNTools)."
        )
