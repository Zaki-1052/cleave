# backend/pipelines/diffbind.py
"""DiffBind differential peak analysis pipeline.

Ports the lab's DiffBind R scripts (references/DPA/) with bug fixes from
cleave-spec-decisions.md §4. Three analysis modes:
  - deseq2_consensus: consensus peakset, DESeq2 (default)
  - deseq2_peaklist: user-supplied peakset, DESeq2
  - edger_peaklist: user-supplied peakset, edgeR + TMM normalization

Output column names (Conc_<condition1>, Conc_<condition2>) are DYNAMIC —
they come from dba.report() based on the sample sheet Condition column.
"""

import csv
import io
import json
import re
import shutil
import time
from collections.abc import Callable
from pathlib import Path

import structlog

from config import settings
from pipelines.base import PipelineError, PipelineStage, append_to_master_log, run_cmd
from pipelines.methods_text import diffbind_methods

logger = structlog.get_logger(__name__)

_SCRIPTS_DIR = Path(__file__).resolve().parent / "scripts"

_SCRIPT_MAP = {
    "deseq2_consensus": "diffbind_consensus.R",
    "deseq2_peaklist": "diffbind_peaklist.R",
    "edger_peaklist": "diffbind_peaklist_edger.R",
}

_VALID_METHODS = set(_SCRIPT_MAP.keys())
_CONDITION_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_]*$")
_SHORT_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_\-\.]*$")

# Minimal 1x1 transparent PNG for mock plot stubs
_STUB_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
    b"\r\n\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)

# Plots produced by each mode
_PLOT_TYPES_FULL = ["pca", "heatmap_group", "heatmap_condition", "ma", "volcano"]
_PLOT_TYPES_EDGER = ["pca", "ma", "volcano"]

# File name fragments for each plot type
_PLOT_FILENAME_MAP = {
    "pca": "_PCA_plot",
    "heatmap_group": "_heatmapgroup_plot",
    "heatmap_condition": "_heatmapcondition_plot",
    "ma": "_MA_plot",
    "volcano": "_volcano_plot",
}

# File categories for output registration
_PLOT_CATEGORY_MAP = {
    "pca": "diffbind_plot_pca",
    "heatmap_group": "diffbind_plot_heatmap_group",
    "heatmap_condition": "diffbind_plot_heatmap_condition",
    "ma": "diffbind_plot_ma",
    "volcano": "diffbind_plot_volcano",
}


class DiffBindStage(PipelineStage):
    def validate(self, params: dict) -> list[str]:
        errors: list[str] = []

        for field in ("experiment_id", "project_id", "parent_job_id", "alignment_job_id"):
            if not params.get(field):
                errors.append(f"Missing required param: {field}")

        method = params.get("analysis_method", "")
        if method not in _VALID_METHODS:
            valid = sorted(_VALID_METHODS)
            errors.append(f"Invalid analysis_method '{method}'. Must be one of: {valid}")

        samples = params.get("samples")
        if not samples or not isinstance(samples, list):
            errors.append("samples must be a non-empty list")
            return errors

        if len(samples) < 4:
            errors.append(f"DiffBind requires at least 4 samples, got {len(samples)}")

        conditions: dict[str, int] = {}
        for i, s in enumerate(samples):
            prefix = f"samples[{i}]"
            required_fields = (
                "reaction_id",
                "short_name",
                "condition",
                "replicate",
                "bam_path",
                "peak_path",
            )
            for field in required_fields:
                if not s.get(field) and s.get(field) != 0:
                    errors.append(f"{prefix} missing {field}")

            cond = s.get("condition", "")
            if cond and not _CONDITION_RE.match(cond):
                errors.append(f"{prefix} condition '{cond}' must be alphanumeric + underscores")

            sn = s.get("short_name", "")
            if sn and not _SHORT_NAME_RE.match(sn):
                errors.append(f"{prefix} short_name '{sn}' has invalid characters")

            rep = s.get("replicate")
            if rep is not None and (not isinstance(rep, int) or rep < 1):
                errors.append(f"{prefix} replicate must be a positive integer")

            if cond:
                conditions[cond] = conditions.get(cond, 0) + 1

        if len(conditions) < 2:
            cond_names = list(conditions.keys())
            errors.append(
                f"DiffBind requires at least 2 conditions, got {len(conditions)}: {cond_names}"
            )

        for cond, count in conditions.items():
            if count < 2:
                errors.append(f"Condition '{cond}' has only {count} replicate(s), need at least 2")

        if "peaklist" in method and not params.get("custom_peakset_path"):
            errors.append(f"analysis_method '{method}' requires custom_peakset_path")

        if settings.PIPELINE_MODE != "mock":
            if not shutil.which("Rscript"):
                errors.append("Rscript not found in PATH")

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
        method = params["analysis_method"]
        samples = params["samples"]

        results_dir = job_dir / "results"
        logs_dir = job_dir / "logs"
        for d in [results_dir, logs_dir]:
            d.mkdir(parents=True, exist_ok=True)

        master_log = logs_dir / "diffbind.log"
        experiment_name = f"diffbind_job_{job_id}"
        rel_job = f"projects/{project_id}/{experiment_id}/jobs/{job_id}"

        append_to_master_log(
            master_log,
            f"DiffBind job {job_id} started",
            f"Method: {method}\nSamples: {len(samples)}\n"
            f"Conditions: {sorted({s['condition'] for s in samples})}",
        )

        # Write sample sheet CSV in DiffBind format
        sample_sheet_path = job_dir / "sample_sheet.csv"
        self._write_sample_sheet(samples, sample_sheet_path)

        append_to_master_log(master_log, "Sample sheet written", sample_sheet_path.read_text())

        # Select and run the R script
        script_name = _SCRIPT_MAP[method]
        script_path = _SCRIPTS_DIR / script_name
        if not script_path.exists():
            raise PipelineError(f"R script not found: {script_path}")

        cmd = ["Rscript", str(script_path), experiment_name, str(sample_sheet_path)]
        if "peaklist" in method:
            peakset_abs = Path(settings.STORAGE_ROOT) / params["custom_peakset_path"]
            if not peakset_abs.exists():
                raise PipelineError(f"Custom peakset not found: {peakset_abs}")
            cmd.append(str(peakset_abs))

        run_cmd(
            cmd,
            log_path=logs_dir / "rscript_output.log",
            timeout=14400,
            cwd=job_dir,
            master_log=master_log,
            cancelled=cancelled,
        )

        # Locate output directory created by R script
        output_dir = job_dir / experiment_name
        if not output_dir.is_dir():
            raise PipelineError(f"R script did not create output directory: {output_dir}")

        # Parse results and register outputs
        outputs: list[dict] = []

        # Results TSV
        results_tsv = output_dir / f"{experiment_name}_diffbind_results.txt"
        if results_tsv.exists():
            outputs.append(
                {
                    "file_category": "diffbind_results",
                    "filename": results_tsv.name,
                    "file_path": f"{rel_job}/{experiment_name}/{results_tsv.name}",
                    "file_type": "tsv",
                    "file_size_bytes": results_tsv.stat().st_size,
                    "reaction_id": None,
                }
            )
            # Parse column names from TSV header for frontend dynamic rendering
            column_names = self._parse_tsv_columns(results_tsv)
            columns_json = output_dir / "results_columns.json"
            columns_json.write_text(json.dumps(column_names))

        # Normalized counts CSV
        counts_csv = output_dir / f"{experiment_name}_normalized_counts.csv"
        if counts_csv.exists():
            outputs.append(
                {
                    "file_category": "normalized_counts",
                    "filename": counts_csv.name,
                    "file_path": f"{rel_job}/{experiment_name}/{counts_csv.name}",
                    "file_type": "csv",
                    "file_size_bytes": counts_csv.stat().st_size,
                    "reaction_id": None,
                }
            )

        # Plot files (PNG + SVG pairs)
        plot_types = _PLOT_TYPES_EDGER if method == "edger_peaklist" else _PLOT_TYPES_FULL
        for plot_type in plot_types:
            fname_frag = _PLOT_FILENAME_MAP[plot_type]
            category = _PLOT_CATEGORY_MAP[plot_type]
            for ext in ("png", "svg"):
                plot_file = output_dir / f"{experiment_name}{fname_frag}.{ext}"
                if plot_file.exists():
                    outputs.append(
                        {
                            "file_category": category,
                            "filename": plot_file.name,
                            "file_path": f"{rel_job}/{experiment_name}/{plot_file.name}",
                            "file_type": ext,
                            "file_size_bytes": plot_file.stat().st_size,
                            "reaction_id": None,
                        }
                    )

        # Sample sheet as output
        outputs.append(
            {
                "file_category": "diffbind_sample_sheet",
                "filename": sample_sheet_path.name,
                "file_path": f"{rel_job}/{sample_sheet_path.name}",
                "file_type": "csv",
                "file_size_bytes": sample_sheet_path.stat().st_size,
                "reaction_id": None,
            }
        )

        # Master log
        if master_log.exists():
            outputs.append(
                {
                    "file_category": "log",
                    "filename": master_log.name,
                    "file_path": f"{rel_job}/logs/{master_log.name}",
                    "file_type": "txt",
                    "file_size_bytes": master_log.stat().st_size,
                    "reaction_id": None,
                }
            )

        # R script output log
        rscript_log = logs_dir / "rscript_output.log"
        if rscript_log.exists():
            outputs.append(
                {
                    "file_category": "log",
                    "filename": rscript_log.name,
                    "file_path": f"{rel_job}/logs/{rscript_log.name}",
                    "file_type": "txt",
                    "file_size_bytes": rscript_log.stat().st_size,
                    "reaction_id": None,
                }
            )

        return {
            "job_id": job_id,
            "status": "complete",
            "message": f"DiffBind analysis complete ({method}, {len(samples)} samples)",
            "outputs": outputs,
            "methods_text": self.generate_methods_text(params),
        }

    def mock_run(self, job_id: int, params: dict, working_dir: Path, job_dir: Path) -> dict:
        time.sleep(5)

        project_id = params["project_id"]
        experiment_id = params["experiment_id"]
        method = params.get("analysis_method", "deseq2_consensus")
        samples = params.get("samples", [])
        experiment_name = f"diffbind_job_{job_id}"
        rel_job = f"projects/{project_id}/{experiment_id}/jobs/{job_id}"

        output_dir = job_dir / experiment_name
        logs_dir = job_dir / "logs"
        for d in [output_dir, logs_dir]:
            d.mkdir(parents=True, exist_ok=True)

        outputs: list[dict] = []

        # Write sample sheet
        sample_sheet_path = job_dir / "sample_sheet.csv"
        self._write_sample_sheet(samples, sample_sheet_path)
        outputs.append(
            {
                "file_category": "diffbind_sample_sheet",
                "filename": sample_sheet_path.name,
                "file_path": f"{rel_job}/{sample_sheet_path.name}",
                "file_type": "csv",
                "file_size_bytes": sample_sheet_path.stat().st_size,
                "reaction_id": None,
            }
        )

        # Create mock results TSV with dynamic column names
        conditions = sorted({s["condition"] for s in samples})
        cond1 = conditions[0] if len(conditions) > 0 else "cond1"
        cond2 = conditions[1] if len(conditions) > 1 else "cond2"
        columns = [
            "seqnames",
            "start",
            "end",
            "width",
            "strand",
            "Conc",
            f"Conc_{cond1}",
            f"Conc_{cond2}",
            "Fold",
            "p.value",
            "FDR",
        ]
        results_tsv = output_dir / f"{experiment_name}_diffbind_results.txt"
        buf = io.StringIO()
        writer = csv.writer(buf, delimiter="\t")
        writer.writerow(columns)
        # Write 50 mock peaks
        for i in range(50):
            fdr = 0.001 * (i + 1) if i < 20 else 0.1 + 0.01 * i
            writer.writerow(
                [
                    f"chr{(i % 19) + 1}",
                    1000000 + i * 5000,
                    1005000 + i * 5000,
                    5000,
                    "*",
                    f"{5.0 + i * 0.1:.2f}",
                    f"{4.5 + i * 0.05:.2f}",
                    f"{5.5 + i * 0.15:.2f}",
                    f"{(-1) ** i * (2.0 - i * 0.03):.4f}",
                    f"{0.0001 * (i + 1):.6f}",
                    f"{fdr:.6f}",
                ]
            )
        results_tsv.write_text(buf.getvalue())
        outputs.append(
            {
                "file_category": "diffbind_results",
                "filename": results_tsv.name,
                "file_path": f"{rel_job}/{experiment_name}/{results_tsv.name}",
                "file_type": "tsv",
                "file_size_bytes": results_tsv.stat().st_size,
                "reaction_id": None,
            }
        )

        # Save column names JSON
        columns_json = output_dir / "results_columns.json"
        columns_json.write_text(json.dumps(columns))

        # Mock normalized counts CSV
        counts_csv = output_dir / f"{experiment_name}_normalized_counts.csv"
        counts_buf = io.StringIO()
        counts_writer = csv.writer(counts_buf)
        sample_names = [s["short_name"] for s in samples]
        counts_writer.writerow(["", "seqnames", "start", "end"] + sample_names)
        for i in range(20):
            counts_writer.writerow(
                [i + 1, f"chr{(i % 19) + 1}", 1000000 + i * 5000, 1005000 + i * 5000]
                + [f"{50 + i * 3 + j * 10:.1f}" for j in range(len(samples))]
            )
        counts_csv.write_text(counts_buf.getvalue())
        outputs.append(
            {
                "file_category": "normalized_counts",
                "filename": counts_csv.name,
                "file_path": f"{rel_job}/{experiment_name}/{counts_csv.name}",
                "file_type": "csv",
                "file_size_bytes": counts_csv.stat().st_size,
                "reaction_id": None,
            }
        )

        # Mock plot files (stub PNGs + empty SVGs)
        plot_types = _PLOT_TYPES_EDGER if method == "edger_peaklist" else _PLOT_TYPES_FULL
        for plot_type in plot_types:
            fname_frag = _PLOT_FILENAME_MAP[plot_type]
            category = _PLOT_CATEGORY_MAP[plot_type]
            for ext in ("png", "svg"):
                plot_file = output_dir / f"{experiment_name}{fname_frag}.{ext}"
                if ext == "png":
                    plot_file.write_bytes(_STUB_PNG)
                else:
                    plot_file.write_text(
                        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">'
                        '<text x="10" y="50">Mock DiffBind Plot</text></svg>'
                    )
                outputs.append(
                    {
                        "file_category": category,
                        "filename": plot_file.name,
                        "file_path": f"{rel_job}/{experiment_name}/{plot_file.name}",
                        "file_type": ext,
                        "file_size_bytes": plot_file.stat().st_size,
                        "reaction_id": None,
                    }
                )

        # Mock master log
        master_log = logs_dir / "diffbind.log"
        master_log.write_text(f"Mock DiffBind run for job {job_id}\n")
        outputs.append(
            {
                "file_category": "log",
                "filename": master_log.name,
                "file_path": f"{rel_job}/logs/{master_log.name}",
                "file_type": "txt",
                "file_size_bytes": master_log.stat().st_size,
                "reaction_id": None,
            }
        )

        return {
            "job_id": job_id,
            "status": "complete",
            "message": f"Mock DiffBind complete ({method}, {len(samples)} samples)",
            "outputs": outputs,
            "methods_text": self.generate_methods_text(params),
        }

    def generate_methods_text(self, params: dict) -> str:
        return diffbind_methods(params)

    # -- Private helpers --

    def _write_sample_sheet(
        self,
        samples: list[dict],
        output_path: Path,
    ) -> None:
        """Write the DiffBind sample sheet CSV with absolute paths for BAM/peak files."""
        buf = io.StringIO()
        cols = [
            "SampleID",
            "Factor",
            "Condition",
            "Replicate",
            "bamReads",
            "Peaks",
            "PeakCaller",
        ]
        writer = csv.DictWriter(buf, fieldnames=cols)
        writer.writeheader()
        for s in samples:
            bam_abs = Path(settings.STORAGE_ROOT) / s["bam_path"]
            peak_abs = Path(settings.STORAGE_ROOT) / s["peak_path"]
            writer.writerow(
                {
                    "SampleID": s["short_name"],
                    "Factor": s.get("factor", "Factor1"),
                    "Condition": s["condition"],
                    "Replicate": s["replicate"],
                    "bamReads": str(bam_abs),
                    "Peaks": str(peak_abs),
                    "PeakCaller": s.get("peak_caller", "bed"),
                }
            )
        output_path.write_text(buf.getvalue())

    def _parse_tsv_columns(self, tsv_path: Path) -> list[str]:
        """Read the header row from the DiffBind results TSV."""
        with open(tsv_path) as f:
            header = f.readline().strip()
        return header.split("\t")
