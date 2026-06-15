# backend/pipelines/rnaseq_trimming.py
"""RNA-seq trimming pipeline — fastp adapter + quality trimming (no fixed-length kseq step)."""

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
from pipelines.methods_text import rnaseq_trimming_methods

logger = structlog.get_logger(__name__)

# Default parameters for fastp — matches RNASEQ-PLAN.md §A.3
DEFAULTS = {
    "qualified_quality_phred": 20,
    "length_required": 25,
    "cut_front": True,
    "cut_tail": True,
    "cut_window_size": 4,
    "cut_mean_quality": 15,
    "detect_adapter_for_pe": True,
    "threads": 0,  # 0 = auto-detect via os.cpu_count()
}


def _get_threads(params: dict) -> int:
    threads = params.get("threads", DEFAULTS["threads"])
    if not threads or threads <= 0:
        return os.cpu_count() or 4
    return threads


def _get_param(params: dict, key: str):
    """Get a parameter with fallback to defaults."""
    return params.get(key, DEFAULTS.get(key))


def _resolve_fastp_bin() -> str:
    """Locate fastp binary on PATH."""
    fastp_bin = shutil.which("fastp")
    if fastp_bin:
        return fastp_bin
    raise PipelineError(
        "fastp not found. Install via conda (conda install -c bioconda fastp) "
        "or ensure 'fastp' is on PATH."
    )


@dataclass(frozen=True)
class _RnaseqTrimmingContext:
    """Immutable config shared across concurrent pair-processing threads."""

    fastp_bin: str
    qualified_quality_phred: int
    length_required: int
    cut_front: bool
    cut_tail: bool
    cut_window_size: int
    cut_mean_quality: int
    detect_adapter_for_pe: bool
    threads: int  # per-pair thread count (after division)
    trimmed_dir: Path
    reports_dir: Path
    log_dir: Path
    project_id: int | str
    experiment_id: int | str
    cancelled: Callable[[], bool] | None


def _process_pair(pair: dict, ctx: _RnaseqTrimmingContext) -> dict:
    """Process a single FASTQ pair through fastp. Thread-safe."""
    prefix = pair["prefix"]
    r1_abs = Path(settings.STORAGE_ROOT) / pair["r1_path"]
    r2_abs = Path(settings.STORAGE_ROOT) / pair["r2_path"]

    if not r1_abs.exists():
        raise PipelineError(f"R1 FASTQ not found: {r1_abs}")
    if not r2_abs.exists():
        raise PipelineError(f"R2 FASTQ not found: {r2_abs}")

    # Output paths
    r1_final = ctx.trimmed_dir / f"{prefix}_R1_001_trimmed.fastq.gz"
    r2_final = ctx.trimmed_dir / f"{prefix}_R2_001_trimmed.fastq.gz"
    json_report = ctx.reports_dir / f"{prefix}.fastp.json"
    html_report = ctx.reports_dir / f"{prefix}.fastp.html"

    if ctx.cancelled and ctx.cancelled():
        raise TerminatedError("Job terminated by user")

    # Build fastp command
    cmd = [
        ctx.fastp_bin,
        "--in1",
        str(r1_abs),
        "--in2",
        str(r2_abs),
        "--out1",
        str(r1_final),
        "--out2",
        str(r2_final),
        "--json",
        str(json_report),
        "--html",
        str(html_report),
        "--thread",
        str(ctx.threads),
        "--qualified_quality_phred",
        str(ctx.qualified_quality_phred),
        "--length_required",
        str(ctx.length_required),
        "--cut_window_size",
        str(ctx.cut_window_size),
        "--cut_mean_quality",
        str(ctx.cut_mean_quality),
    ]
    if ctx.detect_adapter_for_pe:
        cmd.append("--detect_adapter_for_pe")
    if ctx.cut_front:
        cmd.append("--cut_front")
    if ctx.cut_tail:
        cmd.append("--cut_tail")

    logger.info("rnaseq_trimming.fastp_start", prefix=prefix, cmd=" ".join(cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
    (ctx.log_dir / f"{prefix}_fastp.log").write_text(proc.stdout + "\n" + proc.stderr)
    if proc.returncode != 0:
        raise PipelineError(f"fastp failed for {prefix}: {proc.stderr.strip()}")

    r1_size = r1_final.stat().st_size if r1_final.exists() else 0
    r2_size = r2_final.stat().st_size if r2_final.exists() else 0
    rel_base = f"projects/{ctx.project_id}/{ctx.experiment_id}/fastqs/trimmed"

    logger.info("rnaseq_trimming.pair_complete", prefix=prefix, r1_size=r1_size, r2_size=r2_size)

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
        # Temp keys for report collection — stripped before returning from run()
        "_fastp_json": str(json_report),
        "_fastp_html": str(html_report),
    }


def _collect_fastp_reports(
    results: dict[int, dict],
    fastq_pairs: list[dict],
    project_id: int | str,
    experiment_id: int | str,
) -> list[dict]:
    """Build persist_job_outputs-compatible list from per-pair fastp report paths."""
    reports: list[dict] = []
    rel_base = f"projects/{project_id}/{experiment_id}/fastqs/fastp_reports"

    for i in range(len(fastq_pairs)):
        if i not in results:
            continue
        r = results[i]
        for abs_key, category, ftype in [
            ("_fastp_json", "fastp_json", "json"),
            ("_fastp_html", "fastp_html", "html"),
        ]:
            abs_path = Path(r[abs_key])
            if abs_path.exists():
                reports.append(
                    {
                        "file_category": category,
                        "filename": abs_path.name,
                        "file_path": f"{rel_base}/{abs_path.name}",
                        "file_type": ftype,
                        "file_size_bytes": abs_path.stat().st_size,
                    }
                )

    return reports


def _strip_temp_keys(output: dict) -> dict:
    """Remove internal keys before returning output to the worker."""
    return {k: v for k, v in output.items() if not k.startswith("_fastp")}


class RnaseqTrimmingStage(PipelineStage):
    """fastp adapter + quality trimming for RNA-seq paired-end FASTQs."""

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

        fastp_bin = _resolve_fastp_bin()

        # Directory structure
        base_dir = working_dir / str(project_id) / str(experiment_id)
        trimmed_dir = base_dir / "fastqs" / "trimmed"
        reports_dir = base_dir / "fastqs" / "fastp_reports"
        log_dir = base_dir / "logs" / f"rnaseq_trimming_{job_id}"
        trimmed_dir.mkdir(parents=True, exist_ok=True)
        reports_dir.mkdir(parents=True, exist_ok=True)
        log_dir.mkdir(parents=True, exist_ok=True)

        # Divide threads among concurrent pairs
        concurrent_count = min(settings.MAX_CONCURRENT_REACTIONS, len(fastq_pairs))
        threads_per_pair = max(2, total_threads // concurrent_count)

        logger.info(
            "rnaseq_trimming.run_start",
            job_id=job_id,
            pairs=len(fastq_pairs),
            total_threads=total_threads,
            concurrent=concurrent_count,
            threads_per_pair=threads_per_pair,
        )

        ctx = _RnaseqTrimmingContext(
            fastp_bin=fastp_bin,
            qualified_quality_phred=_get_param(params, "qualified_quality_phred"),
            length_required=_get_param(params, "length_required"),
            cut_front=_get_param(params, "cut_front"),
            cut_tail=_get_param(params, "cut_tail"),
            cut_window_size=_get_param(params, "cut_window_size"),
            cut_mean_quality=_get_param(params, "cut_mean_quality"),
            detect_adapter_for_pe=_get_param(params, "detect_adapter_for_pe"),
            threads=threads_per_pair,
            trimmed_dir=trimmed_dir,
            reports_dir=reports_dir,
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
                    logger.error("rnaseq_trimming.pair_failed", prefix=prefix, error=str(exc))

        # Collect fastp reports before stripping temp keys
        fastp_reports = _collect_fastp_reports(results, fastq_pairs, project_id, experiment_id)

        # Aggregate outputs in original pair order, with temp keys stripped
        outputs = [_strip_temp_keys(results[i]) for i in range(len(fastq_pairs)) if i in results]

        if errors:
            error_summary = "; ".join(f"{k}: {v[:100]}" for k, v in errors.items())
            if len(errors) == len(fastq_pairs):
                raise PipelineError(f"All pairs failed: {error_summary}")
            logger.warning(
                "rnaseq_trimming.partial_failure",
                failed=list(errors.keys()),
                succeeded=[fastq_pairs[i]["prefix"] for i in results],
            )

        return {
            "job_id": job_id,
            "status": "complete",
            "message": f"RNA-seq trimming completed for {len(outputs)} pairs",
            "outputs": outputs,
            "fastp_reports": fastp_reports,
            "methods_text": self.generate_methods_text(params),
        }

    def mock_run(self, job_id: int, params: dict, working_dir: Path, job_dir: Path) -> dict:
        """Create real stub files by copying input FASTQs to trimmed output paths."""
        project_id = params["project_id"]
        experiment_id = params["experiment_id"]
        fastq_pairs = params.get("fastq_pairs", [])

        trimmed_dir = working_dir / str(project_id) / str(experiment_id) / "fastqs" / "trimmed"
        reports_dir = (
            working_dir / str(project_id) / str(experiment_id) / "fastqs" / "fastp_reports"
        )
        trimmed_dir.mkdir(parents=True, exist_ok=True)
        reports_dir.mkdir(parents=True, exist_ok=True)

        rel_trimmed = f"projects/{project_id}/{experiment_id}/fastqs/trimmed"

        def _mock_process_pair(pair: dict) -> dict:
            time.sleep(1)
            prefix = pair["prefix"]
            r1_abs = Path(settings.STORAGE_ROOT) / pair["r1_path"]
            r2_abs = Path(settings.STORAGE_ROOT) / pair["r2_path"]

            r1_final = trimmed_dir / f"{prefix}_R1_001_trimmed.fastq.gz"
            r2_final = trimmed_dir / f"{prefix}_R2_001_trimmed.fastq.gz"
            json_report = reports_dir / f"{prefix}.fastp.json"
            html_report = reports_dir / f"{prefix}.fastp.html"

            # Stub trimmed FASTQs
            if r1_abs.exists():
                shutil.copy2(r1_abs, r1_final)
            else:
                r1_final.write_bytes(b"")
            if r2_abs.exists():
                shutil.copy2(r2_abs, r2_final)
            else:
                r2_final.write_bytes(b"")

            # Stub fastp reports
            json_report.write_text("{}")
            html_report.write_text("<html><body>fastp report</body></html>")

            r1_size = r1_final.stat().st_size if r1_final.exists() else 0
            r2_size = r2_final.stat().st_size if r2_final.exists() else 0

            logger.info("rnaseq_trimming.mock_pair_complete", prefix=prefix)

            return {
                "prefix": prefix,
                "r1_path": f"{rel_trimmed}/{r1_final.name}",
                "r2_path": f"{rel_trimmed}/{r2_final.name}",
                "r1_filename": r1_final.name,
                "r2_filename": r2_final.name,
                "r1_size": r1_size,
                "r2_size": r2_size,
                "r1_id": pair.get("r1_id"),
                "r2_id": pair.get("r2_id"),
                "_fastp_json": str(json_report),
                "_fastp_html": str(html_report),
            }

        concurrent_count = min(settings.MAX_CONCURRENT_REACTIONS, max(len(fastq_pairs), 1))

        with ThreadPoolExecutor(max_workers=concurrent_count) as executor:
            future_to_idx = {
                executor.submit(_mock_process_pair, pair): i for i, pair in enumerate(fastq_pairs)
            }
            indexed_results: dict[int, dict] = {}
            for future in as_completed(future_to_idx):
                idx = future_to_idx[future]
                indexed_results[idx] = future.result()

        # Collect fastp reports before stripping temp keys
        fastp_reports = _collect_fastp_reports(
            indexed_results, fastq_pairs, project_id, experiment_id
        )

        # Aggregate in original pair order with temp keys stripped
        outputs = [_strip_temp_keys(indexed_results[i]) for i in range(len(fastq_pairs))]

        return {
            "job_id": job_id,
            "status": "complete",
            "message": f"Mock RNA-seq trimming completed for {len(fastq_pairs)} pairs",
            "outputs": outputs,
            "fastp_reports": fastp_reports,
            "methods_text": self.generate_methods_text(params),
        }

    def generate_methods_text(self, params: dict) -> str:
        return rnaseq_trimming_methods(params)
