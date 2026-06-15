# backend/pipelines/rnaseq_qc.py
"""RNA-seq QC pipeline — RSeQC per-reaction metrics + MultiQC aggregation.

Runs 5 RSeQC modules per reaction BAM and aggregates all upstream QC
(fastp, STAR, Salmon, RSeQC, featureCounts) into a single MultiQC HTML report.
"""

import csv
import io
import os
import re
import shutil
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

import structlog

from config import settings
from pipelines.base import (
    PipelineError,
    PipelineStage,
    TerminatedError,
    append_to_master_log,
    get_threads,
    run_cmd,
)
from pipelines.methods_text import rnaseq_qc_methods

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

RSEQC_BED_CONFIG: dict[str, str] = {
    "mm10": "mm10_gencode_vM10.bed12",
    "hg38": "hg38_gencode_v29.bed12",
}

_RSEQC_MODULES = [
    "infer_experiment",
    "read_distribution",
    "geneBody_coverage",
    "inner_distance",
    "junction_saturation",
]

_RSEQC_METRICS_CSV_HEADERS = [
    "Short_Name",
    "Fraction_Sense",
    "Fraction_Antisense",
    "Fraction_Undetermined",
    "Inferred_Strandedness",
    "CDS_Exons_Tags",
    "5UTR_Exons_Tags",
    "3UTR_Exons_Tags",
    "Intron_Tags",
    "Intergenic_Tags",
    "Coverage_Skewness",
    "Inner_Distance_Mean",
    "Inner_Distance_SD",
]

_STUB_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00"
    b"\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00"
    b"\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def _resolve_bed12(genome: str) -> Path:
    """Resolve BED12 gene model path for the given genome."""
    filename = RSEQC_BED_CONFIG.get(genome)
    if not filename:
        raise PipelineError(
            f"No RSeQC BED12 annotation for genome '{genome}'. "
            f"Supported: {', '.join(RSEQC_BED_CONFIG.keys())}"
        )
    return Path(settings.RSEQC_BED_DIR) / filename


def _parse_infer_experiment(stdout: str) -> dict:
    """Parse infer_experiment.py stdout into strandedness metrics.

    Expected output lines (RSeQC 4.x+):
        Fraction of reads failed to determine: 0.0112
        Fraction of reads explained by "1++,1--,2+-,2-+": 0.4756
        Fraction of reads explained by "1+-,1-+,2++,2--": 0.5132
    """
    fraction_sense = 0.0
    fraction_antisense = 0.0
    fraction_undetermined = 0.0

    for line in stdout.splitlines():
        line = line.strip()
        if "failed to determine" in line.lower():
            m = re.search(r":\s*([\d.]+)", line)
            if m:
                fraction_undetermined = float(m.group(1))
        elif "1++,1--,2+-,2-+" in line:
            m = re.search(r":\s*([\d.]+)", line)
            if m:
                fraction_sense = float(m.group(1))
        elif "1+-,1-+,2++,2--" in line:
            m = re.search(r":\s*([\d.]+)", line)
            if m:
                fraction_antisense = float(m.group(1))

    if fraction_sense > 0.7:
        strandedness = "RF"
    elif fraction_antisense > 0.7:
        strandedness = "FR"
    else:
        strandedness = "unstranded"

    return {
        "fraction_sense": fraction_sense,
        "fraction_antisense": fraction_antisense,
        "fraction_undetermined": fraction_undetermined,
        "inferred_strandedness": strandedness,
    }


def _parse_read_distribution(stdout: str) -> dict:
    """Parse read_distribution.py stdout into feature tag counts.

    Expected table rows:
        CDS_Exons          2817489  ...
        5'UTR_Exons        120345   ...
        3'UTR_Exons        456789   ...
        Introns            1234567  ...
        Intergenic_regions 345678   ...
    """
    mapping = {
        "CDS_Exons": "cds_exons_tags",
        "5'UTR_Exons": "five_utr_exons_tags",
        "3'UTR_Exons": "three_utr_exons_tags",
        "Introns": "intron_tags",
        "Intergenic_regions": "intergenic_tags",
    }

    result: dict[str, int] = {v: 0 for v in mapping.values()}

    for line in stdout.splitlines():
        parts = line.split()
        if len(parts) >= 3 and parts[0] in mapping:
            try:
                result[mapping[parts[0]]] = int(parts[1])
            except ValueError:
                pass

    return result


def _write_rseqc_metrics_csv(metrics_list: list[dict], output_path: Path) -> None:
    """Write aggregate RSeQC metrics to CSV."""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=_RSEQC_METRICS_CSV_HEADERS)
    writer.writeheader()
    for m in metrics_list:
        writer.writerow(
            {
                "Short_Name": m.get("short_name", ""),
                "Fraction_Sense": m.get("fraction_sense", 0),
                "Fraction_Antisense": m.get("fraction_antisense", 0),
                "Fraction_Undetermined": m.get("fraction_undetermined", 0),
                "Inferred_Strandedness": m.get("inferred_strandedness", ""),
                "CDS_Exons_Tags": m.get("cds_exons_tags", 0),
                "5UTR_Exons_Tags": m.get("five_utr_exons_tags", 0),
                "3UTR_Exons_Tags": m.get("three_utr_exons_tags", 0),
                "Intron_Tags": m.get("intron_tags", 0),
                "Intergenic_Tags": m.get("intergenic_tags", 0),
                "Coverage_Skewness": m.get("coverage_skewness", 0),
                "Inner_Distance_Mean": m.get("inner_distance_mean", 0),
                "Inner_Distance_SD": m.get("inner_distance_sd", 0),
            }
        )
    output_path.write_text(buf.getvalue())


# ---------------------------------------------------------------------------
# Frozen context for concurrent reaction processing
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _RnaseqQCContext:
    """Immutable config shared across concurrent reaction threads."""

    infer_experiment_bin: str
    read_distribution_bin: str
    genebody_coverage_bin: str
    inner_distance_bin: str
    junction_saturation_bin: str
    multiqc_bin: str
    bed12_path: str
    threads: int
    job_dir: Path
    rseqc_dir: Path
    multiqc_dir: Path
    logs_dir: Path
    rel_job: str
    cancelled: Callable[[], bool] | None
    job_id: int


# ---------------------------------------------------------------------------
# Per-reaction RSeQC processing (thread-safe, module-level function)
# ---------------------------------------------------------------------------


def _process_rseqc_reaction(rxn: dict, ctx: _RnaseqQCContext, reaction_log: Path) -> dict:
    """Run 5 RSeQC modules on a single reaction BAM.

    Thread-safe: writes only to reaction-specific files and its own log.
    Returns {"metrics": dict, "outputs": list[dict]}.
    """
    short_name = rxn["short_name"]
    reaction_id = rxn["reaction_id"]
    bam_abs = Path(settings.STORAGE_ROOT) / rxn["bam_path"]

    if not bam_abs.exists():
        raise PipelineError(f"BAM not found: {bam_abs}")

    logger.info("rnaseq_qc.reaction_start", job_id=ctx.job_id, short_name=short_name)

    def _run(cmd, **kwargs):
        return run_cmd(cmd, master_log=reaction_log, cancelled=ctx.cancelled, **kwargs)

    outputs: list[dict] = []
    rxn_dir = ctx.rseqc_dir / short_name
    rxn_dir.mkdir(parents=True, exist_ok=True)

    def _add_output(path: Path, category: str, ftype: str, rid: int | None = reaction_id) -> None:
        if path.exists():
            outputs.append(
                {
                    "file_category": category,
                    "filename": path.name,
                    "file_path": f"{ctx.rel_job}/rseqc/{short_name}/{path.name}",
                    "file_type": ftype,
                    "file_size_bytes": path.stat().st_size,
                    "reaction_id": rid,
                }
            )

    # ---- 1. infer_experiment.py ----
    infer_proc = _run(
        [ctx.infer_experiment_bin, "-r", ctx.bed12_path, "-i", str(bam_abs)],
        log_path=rxn_dir / "infer_experiment.log",
    )
    infer_out = rxn_dir / "infer_experiment.txt"
    infer_out.write_text(infer_proc.stdout)
    _add_output(infer_out, "rseqc_infer_experiment", "txt")
    infer_metrics = _parse_infer_experiment(infer_proc.stdout)

    # ---- 2. read_distribution.py ----
    rdist_proc = _run(
        [ctx.read_distribution_bin, "-r", ctx.bed12_path, "-i", str(bam_abs)],
        log_path=rxn_dir / "read_distribution.log",
    )
    rdist_out = rxn_dir / "read_distribution.txt"
    rdist_out.write_text(rdist_proc.stdout)
    _add_output(rdist_out, "rseqc_read_distribution", "txt")
    rdist_metrics = _parse_read_distribution(rdist_proc.stdout)

    # ---- 3. geneBody_coverage.py (non-critical) ----
    coverage_skewness = 0.0
    prefix_gc = str(rxn_dir / short_name)
    try:
        _run(
            [ctx.genebody_coverage_bin, "-r", ctx.bed12_path, "-i", str(bam_abs), "-o", prefix_gc],
            check=False,
        )
        gc_txt = rxn_dir / f"{short_name}.geneBodyCoverage.txt"
        if gc_txt.exists():
            _add_output(gc_txt, "rseqc_genebody_coverage", "txt")
            lines = gc_txt.read_text().strip().splitlines()
            if len(lines) >= 2:
                vals = [float(v) for v in lines[-1].split("\t") if v.strip()]
                if len(vals) >= 10:
                    first_quarter = sum(vals[: len(vals) // 4])
                    last_quarter = sum(vals[3 * len(vals) // 4 :])
                    if last_quarter > 0:
                        coverage_skewness = round(first_quarter / last_quarter, 4)
        for suffix in [".geneBodyCoverage.curves.pdf", ".geneBodyCoverage.r"]:
            p = rxn_dir / f"{short_name}{suffix}"
            if p.exists():
                _add_output(p, "rseqc_genebody_coverage", suffix.split(".")[-1])
    except (PipelineError, TerminatedError):
        raise
    except Exception as exc:
        append_to_master_log(reaction_log, f"geneBody_coverage skipped for {short_name}", str(exc))

    # ---- 4. inner_distance.py (non-critical) ----
    inner_distance_mean = 0.0
    inner_distance_sd = 0.0
    prefix_id = str(rxn_dir / short_name)
    try:
        _run(
            [ctx.inner_distance_bin, "-r", ctx.bed12_path, "-i", str(bam_abs), "-o", prefix_id],
            check=False,
        )
        freq_file = rxn_dir / f"{short_name}.inner_distance_freq.txt"
        if freq_file.exists():
            _add_output(freq_file, "rseqc_inner_distance", "txt")
            total_count = 0
            weighted_sum = 0.0
            weighted_sq_sum = 0.0
            for line in freq_file.read_text().splitlines():
                parts = line.strip().split("\t")
                if len(parts) >= 3:
                    try:
                        lo, hi, count = float(parts[0]), float(parts[1]), int(parts[2])
                        midpoint = (lo + hi) / 2.0
                        total_count += count
                        weighted_sum += midpoint * count
                        weighted_sq_sum += midpoint * midpoint * count
                    except ValueError:
                        continue
            if total_count > 0:
                inner_distance_mean = round(weighted_sum / total_count, 2)
                variance = (weighted_sq_sum / total_count) - inner_distance_mean**2
                inner_distance_sd = round(max(0, variance) ** 0.5, 2)
        for suffix in [".inner_distance_plot.pdf", ".inner_distance_plot.r"]:
            p = rxn_dir / f"{short_name}{suffix}"
            if p.exists():
                _add_output(p, "rseqc_inner_distance", suffix.split(".")[-1])
    except (PipelineError, TerminatedError):
        raise
    except Exception as exc:
        append_to_master_log(reaction_log, f"inner_distance skipped for {short_name}", str(exc))

    # ---- 5. junction_saturation.py (non-critical) ----
    prefix_js = str(rxn_dir / short_name)
    try:
        js_cmd = [
            ctx.junction_saturation_bin,
            "-r",
            ctx.bed12_path,
            "-i",
            str(bam_abs),
            "-o",
            prefix_js,
        ]
        _run(js_cmd, check=False)
        for suffix in [".junctionSaturation_plot.r", ".junctionSaturation_plot.pdf"]:
            p = rxn_dir / f"{short_name}{suffix}"
            if p.exists():
                _add_output(p, "rseqc_junction_saturation", suffix.split(".")[-1])
    except (PipelineError, TerminatedError):
        raise
    except Exception as exc:
        append_to_master_log(
            reaction_log, f"junction_saturation skipped for {short_name}", str(exc)
        )

    metrics = {
        "short_name": short_name,
        **infer_metrics,
        **rdist_metrics,
        "coverage_skewness": coverage_skewness,
        "inner_distance_mean": inner_distance_mean,
        "inner_distance_sd": inner_distance_sd,
    }

    return {"metrics": metrics, "outputs": outputs}


# ---------------------------------------------------------------------------
# MultiQC aggregation
# ---------------------------------------------------------------------------


def _run_multiqc(
    ctx: _RnaseqQCContext,
    staging_dir: Path,
    prior_paths: list[str],
    master_log: Path | None,
) -> Path | None:
    """Symlink prior QC outputs into staging dir and run MultiQC."""
    staging_dir.mkdir(parents=True, exist_ok=True)

    for rel_path in prior_paths:
        abs_path = Path(settings.STORAGE_ROOT) / rel_path
        if abs_path.exists():
            link = staging_dir / abs_path.name
            try:
                if not link.exists():
                    os.symlink(abs_path, link)
            except OSError:
                pass

    # Also symlink all RSeQC outputs
    for item in ctx.rseqc_dir.rglob("*"):
        if item.is_file():
            link = staging_dir / item.name
            try:
                if not link.exists():
                    os.symlink(item, link)
            except OSError:
                pass

    try:
        run_cmd(
            [ctx.multiqc_bin, str(staging_dir), "--outdir", str(ctx.multiqc_dir), "--force"],
            master_log=master_log,
            cancelled=ctx.cancelled,
        )
    except PipelineError as exc:
        append_to_master_log(master_log, "MultiQC failed (non-fatal)", str(exc))
        return None

    report = ctx.multiqc_dir / "multiqc_report.html"
    return report if report.exists() else None


# ---------------------------------------------------------------------------
# Pipeline Stage
# ---------------------------------------------------------------------------


class RnaseqQCStage(PipelineStage):
    """RSeQC per-reaction QC + MultiQC aggregation for RNA-seq experiments."""

    def validate(self, params: dict) -> list[str]:
        errors: list[str] = []

        if not params.get("experiment_id"):
            errors.append("experiment_id is required")
        if not params.get("project_id"):
            errors.append("project_id is required")

        genome = params.get("reference_genome", "")
        if not genome:
            errors.append("reference_genome is required")
        elif genome not in RSEQC_BED_CONFIG:
            errors.append(
                f"Unsupported genome '{genome}' for RSeQC QC. "
                f"Supported: {', '.join(RSEQC_BED_CONFIG.keys())}"
            )

        if not params.get("alignment_job_id"):
            errors.append("alignment_job_id is required")

        reactions = params.get("reactions", [])
        if not reactions:
            errors.append("At least one reaction is required")
        for rxn in reactions:
            if not rxn.get("bam_path"):
                errors.append(f"Reaction {rxn.get('short_name', '?')} is missing bam_path")

        if settings.PIPELINE_MODE != "mock" and not errors:
            tools = {
                "infer_experiment.py": "RSeQC infer_experiment",
                "read_distribution.py": "RSeQC read_distribution",
                "geneBody_coverage.py": "RSeQC geneBody_coverage",
                "inner_distance.py": "RSeQC inner_distance",
                "junction_saturation.py": "RSeQC junction_saturation",
                "multiqc": "MultiQC",
            }
            for binary, label in tools.items():
                if not shutil.which(binary):
                    errors.append(f"{label} ({binary}) not found on PATH")

            if genome:
                bed12 = _resolve_bed12(genome)
                if not bed12.exists():
                    errors.append(f"BED12 file not found: {bed12}")

        return errors

    def run(
        self,
        job_id: int,
        params: dict,
        working_dir: Path,
        job_dir: Path,
        cancelled: Callable[[], bool] | None = None,
    ) -> dict:
        reactions = params.get("reactions", [])
        genome = params["reference_genome"]
        project_id = params.get("project_id", 0)
        experiment_id = params.get("experiment_id", 0)
        rel_job = f"projects/{project_id}/{experiment_id}/jobs/{job_id}"

        rseqc_dir = job_dir / "rseqc"
        multiqc_dir = job_dir / "multiqc"
        logs_dir = job_dir / "logs"
        staging_dir = job_dir / "multiqc_staging"
        for d in [rseqc_dir, multiqc_dir, logs_dir]:
            d.mkdir(parents=True, exist_ok=True)

        master_log = logs_dir / "rnaseq_qc_master.log"
        master_log.touch()

        bed12 = _resolve_bed12(genome)
        total_threads = get_threads()
        max_concurrent = getattr(settings, "MAX_CONCURRENT_RNASEQ_REACTIONS", 2)
        per_reaction_threads = max(1, total_threads // max(1, min(len(reactions), max_concurrent)))

        ctx = _RnaseqQCContext(
            infer_experiment_bin=shutil.which("infer_experiment.py") or "infer_experiment.py",
            read_distribution_bin=shutil.which("read_distribution.py") or "read_distribution.py",
            genebody_coverage_bin=shutil.which("geneBody_coverage.py") or "geneBody_coverage.py",
            inner_distance_bin=shutil.which("inner_distance.py") or "inner_distance.py",
            junction_saturation_bin=(
                shutil.which("junction_saturation.py") or "junction_saturation.py"
            ),
            multiqc_bin=shutil.which("multiqc") or "multiqc",
            bed12_path=str(bed12),
            threads=per_reaction_threads,
            job_dir=job_dir,
            rseqc_dir=rseqc_dir,
            multiqc_dir=multiqc_dir,
            logs_dir=logs_dir,
            rel_job=rel_job,
            cancelled=cancelled,
            job_id=job_id,
        )

        reaction_logs: dict[str, Path] = {}
        for rxn in reactions:
            name = rxn["short_name"]
            rxn_log = logs_dir / f"rseqc_{name}.log"
            rxn_log.touch()
            reaction_logs[name] = rxn_log

        results: dict[str, dict] = {}
        errors: dict[str, str] = {}

        with ThreadPoolExecutor(max_workers=max_concurrent) as executor:
            futures = {
                executor.submit(
                    _process_rseqc_reaction, rxn, ctx, reaction_logs[rxn["short_name"]]
                ): rxn["short_name"]
                for rxn in reactions
            }
            for future in as_completed(futures):
                name = futures[future]
                try:
                    results[name] = future.result()
                except TerminatedError:
                    raise
                except Exception as exc:
                    errors[name] = str(exc)
                    logger.warning("rnaseq_qc.reaction_failed", short_name=name, error=str(exc))

        # Merge per-reaction logs into master log (original order)
        for rxn in reactions:
            name = rxn["short_name"]
            rxn_log = reaction_logs[name]
            if rxn_log.exists():
                content = rxn_log.read_text()
                if content.strip():
                    with open(master_log, "a") as f:
                        f.write(content)

        # Aggregate results in original reaction order
        all_metrics: list[dict] = []
        outputs: list[dict] = []
        for rxn in reactions:
            name = rxn["short_name"]
            if name in results:
                r = results[name]
                all_metrics.append(r["metrics"])
                outputs.extend(r["outputs"])

        if errors:
            error_summary = "; ".join(f"{k}: {v[:100]}" for k, v in errors.items())
            append_to_master_log(master_log, "Reaction failures", error_summary)
            if len(errors) == len(reactions):
                raise PipelineError(f"All reactions failed: {error_summary}")
            logger.warning(
                "rnaseq_qc.partial_failure",
                failed=list(errors.keys()),
                succeeded=list(results.keys()),
            )

        # Collect prior QC output paths for MultiQC staging
        prior_paths: list[str] = []
        for key in ("fastp_report_paths", "star_log_paths", "salmon_meta_paths"):
            prior_paths.extend(params.get(key, []))
        fc_summary = params.get("featurecounts_summary_path")
        if fc_summary:
            prior_paths.append(fc_summary)

        # Run MultiQC
        multiqc_report = _run_multiqc(ctx, staging_dir, prior_paths, master_log)
        if multiqc_report and multiqc_report.exists():
            outputs.append(
                {
                    "file_category": "multiqc_report",
                    "filename": multiqc_report.name,
                    "file_path": f"{rel_job}/multiqc/{multiqc_report.name}",
                    "file_type": "html",
                    "file_size_bytes": multiqc_report.stat().st_size,
                    "reaction_id": None,
                }
            )

        # Write aggregate metrics CSV
        metrics_csv = rseqc_dir / "rseqc_metrics.csv"
        _write_rseqc_metrics_csv(all_metrics, metrics_csv)
        outputs.append(
            {
                "file_category": "rseqc_metrics",
                "filename": metrics_csv.name,
                "file_path": f"{rel_job}/rseqc/{metrics_csv.name}",
                "file_type": "csv",
                "file_size_bytes": metrics_csv.stat().st_size,
                "reaction_id": None,
            }
        )

        append_to_master_log(
            master_log,
            "RSeQC + MultiQC complete",
            f"Processed {len(reactions)} reactions ({len(results)} succeeded, "
            f"{len(errors)} failed), {len(all_metrics)} metrics records",
        )

        if master_log.exists():
            outputs.append(
                {
                    "file_category": "master_log",
                    "filename": master_log.name,
                    "file_path": f"{rel_job}/logs/{master_log.name}",
                    "file_type": "log",
                    "file_size_bytes": master_log.stat().st_size,
                    "reaction_id": None,
                }
            )

        return {
            "job_id": job_id,
            "status": "complete",
            "message": f"RSeQC + MultiQC completed for {len(reactions)} reactions",
            "outputs": outputs,
            "methods_text": self.generate_methods_text(params),
            "qc_metrics": all_metrics,
        }

    def mock_run(self, job_id: int, params: dict, working_dir: Path, job_dir: Path) -> dict:
        """Create realistic stub files for local dev without RSeQC/MultiQC."""
        reactions = params.get("reactions", [])
        project_id = params.get("project_id", 0)
        experiment_id = params.get("experiment_id", 0)
        genome = params.get("reference_genome", "mm10")
        rel_job = f"projects/{project_id}/{experiment_id}/jobs/{job_id}"

        rseqc_dir = job_dir / "rseqc"
        multiqc_dir = job_dir / "multiqc"
        logs_dir = job_dir / "logs"
        for d in [rseqc_dir, multiqc_dir, logs_dir]:
            d.mkdir(parents=True, exist_ok=True)

        outputs: list[dict] = []
        all_metrics: list[dict] = []

        for i, rxn in enumerate(reactions):
            time.sleep(0.2)
            short_name = rxn["short_name"]
            reaction_id = rxn["reaction_id"]
            rxn_dir = rseqc_dir / short_name
            rxn_dir.mkdir(parents=True, exist_ok=True)

            def _add(path: Path, category: str, ftype: str, rid: int | None = reaction_id) -> None:
                outputs.append(
                    {
                        "file_category": category,
                        "filename": path.name,
                        "file_path": f"{rel_job}/rseqc/{short_name}/{path.name}",
                        "file_type": ftype,
                        "file_size_bytes": path.stat().st_size,
                        "reaction_id": rid,
                    }
                )

            # Mock infer_experiment
            sense = 0.47 + i * 0.01
            antisense = 0.51 - i * 0.01
            undetermined = round(1.0 - sense - antisense, 4)
            infer_txt = rxn_dir / "infer_experiment.txt"
            infer_txt.write_text(
                f"Fraction of reads failed to determine: {undetermined}\n"
                f'Fraction of reads explained by "1++,1--,2+-,2-+": {sense}\n'
                f'Fraction of reads explained by "1+-,1-+,2++,2--": {antisense}\n'
            )
            _add(infer_txt, "rseqc_infer_experiment", "txt")

            # Mock read_distribution
            rdist_txt = rxn_dir / "read_distribution.txt"
            rdist_txt.write_text(
                "Group\tTag_count\tTags/Kb\n"
                "CDS_Exons\t2817489\t120.5\n"
                "5'UTR_Exons\t120345\t8.2\n"
                "3'UTR_Exons\t456789\t25.1\n"
                "Introns\t1234567\t5.3\n"
                "Intergenic_regions\t345678\t1.2\n"
            )
            _add(rdist_txt, "rseqc_read_distribution", "txt")

            # Mock geneBody_coverage
            gc_txt = rxn_dir / f"{short_name}.geneBodyCoverage.txt"
            percentiles = "\t".join(str(j) for j in range(1, 101))
            values = "\t".join(str(50 + j % 10) for j in range(1, 101))
            gc_txt.write_text(f"Percentile\t{percentiles}\n{short_name}\t{values}\n")
            _add(gc_txt, "rseqc_genebody_coverage", "txt")

            gc_pdf = rxn_dir / f"{short_name}.geneBodyCoverage.curves.pdf"
            gc_pdf.write_bytes(_STUB_PNG)
            _add(gc_pdf, "rseqc_genebody_coverage", "pdf")

            # Mock inner_distance
            freq_txt = rxn_dir / f"{short_name}.inner_distance_freq.txt"
            freq_txt.write_text(
                "100\t110\t500\n110\t120\t800\n120\t130\t1200\n"
                "130\t140\t1500\n140\t150\t1800\n150\t160\t1200\n"
                "160\t170\t800\n170\t180\t500\n"
            )
            _add(freq_txt, "rseqc_inner_distance", "txt")

            id_pdf = rxn_dir / f"{short_name}.inner_distance_plot.pdf"
            id_pdf.write_bytes(_STUB_PNG)
            _add(id_pdf, "rseqc_inner_distance", "pdf")

            # Mock junction_saturation
            js_pdf = rxn_dir / f"{short_name}.junctionSaturation_plot.pdf"
            js_pdf.write_bytes(_STUB_PNG)
            _add(js_pdf, "rseqc_junction_saturation", "pdf")

            strandedness = "unstranded" if sense < 0.7 and antisense < 0.7 else "RF"
            metrics = {
                "short_name": short_name,
                "fraction_sense": sense,
                "fraction_antisense": antisense,
                "fraction_undetermined": undetermined,
                "inferred_strandedness": strandedness,
                "cds_exons_tags": 2817489,
                "five_utr_exons_tags": 120345,
                "three_utr_exons_tags": 456789,
                "intron_tags": 1234567,
                "intergenic_tags": 345678,
                "coverage_skewness": 1.02,
                "inner_distance_mean": 145.5,
                "inner_distance_sd": 22.3,
            }
            all_metrics.append(metrics)

        # Mock MultiQC report
        multiqc_html = multiqc_dir / "multiqc_report.html"
        multiqc_html.write_text(
            "<html><head><title>MultiQC Report</title></head>"
            "<body><h1>MultiQC Report (mock)</h1></body></html>"
        )
        outputs.append(
            {
                "file_category": "multiqc_report",
                "filename": multiqc_html.name,
                "file_path": f"{rel_job}/multiqc/{multiqc_html.name}",
                "file_type": "html",
                "file_size_bytes": multiqc_html.stat().st_size,
                "reaction_id": None,
            }
        )

        # Aggregate metrics CSV
        metrics_csv = rseqc_dir / "rseqc_metrics.csv"
        _write_rseqc_metrics_csv(all_metrics, metrics_csv)
        outputs.append(
            {
                "file_category": "rseqc_metrics",
                "filename": metrics_csv.name,
                "file_path": f"{rel_job}/rseqc/{metrics_csv.name}",
                "file_type": "csv",
                "file_size_bytes": metrics_csv.stat().st_size,
                "reaction_id": None,
            }
        )

        # Master log
        master_log = logs_dir / "rnaseq_qc_master.log"
        master_log.write_text(
            f"Mock RSeQC + MultiQC: {len(reactions)} reactions, genome={genome}\n"
        )
        outputs.append(
            {
                "file_category": "master_log",
                "filename": master_log.name,
                "file_path": f"{rel_job}/logs/{master_log.name}",
                "file_type": "log",
                "file_size_bytes": master_log.stat().st_size,
                "reaction_id": None,
            }
        )

        return {
            "job_id": job_id,
            "status": "complete",
            "message": f"Mock RSeQC + MultiQC for {len(reactions)} reactions",
            "outputs": outputs,
            "methods_text": self.generate_methods_text(params),
            "qc_metrics": all_metrics,
        }

    def generate_methods_text(self, params: dict) -> str:
        return rnaseq_qc_methods(params)
