# backend/pipelines/pearson_correlation.py
"""Pearson correlation matrix pipeline for replicate concordance assessment.

Ports the lab's two-script workflow:
  1. peak_extractor.r (R/rtracklayer) — bigWig → coverage matrix at 50bp resolution
  2. pearson.py (Python/seaborn) — coverage matrix → pairwise correlation heatmap

Reference scripts: references/media_pearson_corr/peak_extractor.r + pearson.py
"""

import csv
import io
import shutil
import time
from collections.abc import Callable
from pathlib import Path

import structlog

from config import settings
from pipelines.base import PipelineError, PipelineStage, append_to_master_log, run_cmd
from pipelines.methods_text import pearson_correlation_methods

logger = structlog.get_logger(__name__)

_SCRIPTS_DIR = Path(__file__).resolve().parent / "scripts"
_MASKS_DIR = Path(__file__).resolve().parent / "reference" / "masks"

_VALID_GENOMES = {"mm10", "hg38", "hg19", "dm6", "sacCer3"}

# Minimal 1x1 transparent PNG for mock plot stubs (same as diffbind.py / custom_heatmap.py)
_STUB_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
    b"\r\n\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


class PearsonCorrelationStage(PipelineStage):
    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    def validate(self, params: dict) -> list[str]:
        errors: list[str] = []

        for field in (
            "experiment_id",
            "project_id",
            "parent_job_id",
            "alignment_job_id",
        ):
            if not params.get(field):
                errors.append(f"Missing required param: {field}")

        genome = params.get("reference_genome", "")
        if not genome:
            errors.append("Missing required param: reference_genome")
        elif genome not in _VALID_GENOMES:
            valid = sorted(_VALID_GENOMES)
            errors.append(f"Invalid reference_genome '{genome}'. Must be one of: {valid}")

        samples = params.get("samples")
        if not samples or not isinstance(samples, list):
            errors.append("samples must be a non-empty list")
            return errors

        if len(samples) < 2:
            errors.append(f"Pearson correlation requires at least 2 samples, got {len(samples)}")

        for i, s in enumerate(samples):
            prefix = f"samples[{i}]"
            for field in ("reaction_id", "short_name", "label", "bigwig_path"):
                if not s.get(field) and s.get(field) != 0:
                    errors.append(f"{prefix} missing {field}")

        if settings.PIPELINE_MODE != "mock":
            if not shutil.which("Rscript"):
                errors.append("Rscript not found in PATH")
            if not shutil.which("python3"):
                errors.append("python3 not found in PATH")

        return errors

    # ------------------------------------------------------------------
    # Real run
    # ------------------------------------------------------------------

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
        samples = params["samples"]
        genome = params["reference_genome"]
        restrict_bed = params.get("restrict_bed_path") or None

        results_dir = job_dir / "results"
        logs_dir = job_dir / "logs"
        for d in [results_dir, logs_dir]:
            d.mkdir(parents=True, exist_ok=True)

        master_log = logs_dir / "pearson_correlation.log"
        corr_name = f"pearson_job_{job_id}"
        rel_job = f"projects/{project_id}/{experiment_id}/jobs/{job_id}"

        append_to_master_log(
            master_log,
            f"Pearson correlation job {job_id} started",
            f"Genome: {genome}\nSamples: {len(samples)}\nRestrict BED: {restrict_bed or 'none'}",
        )

        # Write sample sheet CSV for R script
        storage = Path(settings.STORAGE_ROOT)
        sample_sheet_path = job_dir / "sample_sheet.csv"
        self._write_sample_sheet(samples, sample_sheet_path, storage)
        append_to_master_log(master_log, "Sample sheet written", sample_sheet_path.read_text())

        # Resolve mask BED (mouse only)
        mask_bed_arg = ""
        if genome == "mm10":
            mask_path = _MASKS_DIR / "manual.mask.ultimate.bed"
            if mask_path.exists():
                mask_bed_arg = str(mask_path)
                append_to_master_log(master_log, "Masking enabled", f"{mask_path} (158 entries)")
            else:
                append_to_master_log(
                    master_log,
                    "WARNING: mask file not found",
                    str(mask_path),
                )
        else:
            append_to_master_log(
                master_log,
                "Masking skipped",
                f"No mask available for {genome}",
            )

        # Resolve optional restrict BED
        restrict_bed_arg = ""
        if restrict_bed:
            restrict_abs = storage / restrict_bed
            if restrict_abs.exists():
                restrict_bed_arg = str(restrict_abs)
                append_to_master_log(master_log, "BED restriction enabled", str(restrict_abs))
            else:
                raise PipelineError(f"Restrict BED file not found: {restrict_abs}")

        # --- Run R script: bigWig → coverage matrix ---
        r_script = _SCRIPTS_DIR / "pearson_matrix.R"
        if not r_script.exists():
            raise PipelineError(f"R script not found: {r_script}")

        coverage_csv = results_dir / f"{corr_name}_coverage_matrix.csv"
        r_cmd = [
            "Rscript",
            str(r_script),
            str(sample_sheet_path),
            str(coverage_csv),
            genome,
            mask_bed_arg,
            restrict_bed_arg,
        ]

        append_to_master_log(master_log, "Running pearson_matrix.R", " ".join(r_cmd))
        run_cmd(
            r_cmd,
            log_path=logs_dir / "pearson_matrix_r.log",
            timeout=14400,  # 4 hours for large bigWig processing
            master_log=master_log,
            cancelled=cancelled,
        )

        if not coverage_csv.exists():
            raise PipelineError(f"R script did not produce coverage matrix: {coverage_csv}")

        # --- Run Python script: coverage matrix → correlation heatmap ---
        py_script = _SCRIPTS_DIR / "pearson_heatmap.py"
        if not py_script.exists():
            raise PipelineError(f"Python script not found: {py_script}")

        png_path = results_dir / f"{corr_name}_heatmap.png"
        svg_path = results_dir / f"{corr_name}_heatmap.svg"
        corr_csv = results_dir / f"{corr_name}_correlation.csv"
        py_cmd = [
            "python3",
            str(py_script),
            str(coverage_csv),
            str(png_path),
            str(svg_path),
            str(corr_csv),
        ]

        append_to_master_log(master_log, "Running pearson_heatmap.py", " ".join(py_cmd))
        run_cmd(
            py_cmd,
            log_path=logs_dir / "pearson_heatmap_py.log",
            timeout=3600,
            master_log=master_log,
            cancelled=cancelled,
        )

        if not png_path.exists():
            raise PipelineError(f"Python script did not produce heatmap: {png_path}")

        append_to_master_log(
            master_log,
            "Pearson correlation complete",
            f"Outputs in {results_dir}",
        )

        # Register outputs
        outputs: list[dict] = []

        for path, ftype in [(png_path, "png"), (svg_path, "svg")]:
            if path.exists():
                outputs.append(
                    {
                        "file_category": "pearson_heatmap",
                        "filename": path.name,
                        "file_path": f"{rel_job}/results/{path.name}",
                        "file_type": ftype,
                        "file_size_bytes": path.stat().st_size,
                        "reaction_id": None,
                    }
                )

        if coverage_csv.exists():
            outputs.append(
                {
                    "file_category": "pearson_matrix",
                    "filename": coverage_csv.name,
                    "file_path": f"{rel_job}/results/{coverage_csv.name}",
                    "file_type": "csv",
                    "file_size_bytes": coverage_csv.stat().st_size,
                    "reaction_id": None,
                }
            )

        if corr_csv.exists():
            outputs.append(
                {
                    "file_category": "pearson_correlation",
                    "filename": corr_csv.name,
                    "file_path": f"{rel_job}/results/{corr_csv.name}",
                    "file_type": "csv",
                    "file_size_bytes": corr_csv.stat().st_size,
                    "reaction_id": None,
                }
            )

        outputs.append(
            {
                "file_category": "pearson_sample_sheet",
                "filename": sample_sheet_path.name,
                "file_path": f"{rel_job}/{sample_sheet_path.name}",
                "file_type": "csv",
                "file_size_bytes": sample_sheet_path.stat().st_size,
                "reaction_id": None,
            }
        )

        for log_file in logs_dir.iterdir():
            if log_file.is_file():
                outputs.append(
                    {
                        "file_category": "log",
                        "filename": log_file.name,
                        "file_path": f"{rel_job}/logs/{log_file.name}",
                        "file_type": "txt",
                        "file_size_bytes": log_file.stat().st_size,
                        "reaction_id": None,
                    }
                )

        return {
            "job_id": job_id,
            "status": "complete",
            "message": (f"Pearson correlation complete ({len(samples)} samples, {genome})"),
            "outputs": outputs,
            "methods_text": self.generate_methods_text(params),
        }

    # ------------------------------------------------------------------
    # Mock run
    # ------------------------------------------------------------------

    def mock_run(self, job_id: int, params: dict, working_dir: Path, job_dir: Path) -> dict:
        time.sleep(4)

        project_id = params["project_id"]
        experiment_id = params["experiment_id"]
        samples = params.get("samples", [])
        genome = params.get("reference_genome", "mm10")
        corr_name = f"pearson_job_{job_id}"
        rel_job = f"projects/{project_id}/{experiment_id}/jobs/{job_id}"

        results_dir = job_dir / "results"
        logs_dir = job_dir / "logs"
        for d in [results_dir, logs_dir]:
            d.mkdir(parents=True, exist_ok=True)

        outputs: list[dict] = []
        sample_labels = [
            s.get("label", s.get("short_name", f"s{i}")) for i, s in enumerate(samples)
        ]

        # Write sample sheet (same as real run)
        storage = Path(settings.STORAGE_ROOT)
        sample_sheet_path = job_dir / "sample_sheet.csv"
        self._write_sample_sheet(samples, sample_sheet_path, storage)
        outputs.append(
            {
                "file_category": "pearson_sample_sheet",
                "filename": sample_sheet_path.name,
                "file_path": f"{rel_job}/{sample_sheet_path.name}",
                "file_type": "csv",
                "file_size_bytes": sample_sheet_path.stat().st_size,
                "reaction_id": None,
            }
        )

        # Stub heatmap PNG
        png_path = results_dir / f"{corr_name}_heatmap.png"
        png_path.write_bytes(_STUB_PNG)
        outputs.append(
            {
                "file_category": "pearson_heatmap",
                "filename": png_path.name,
                "file_path": f"{rel_job}/results/{png_path.name}",
                "file_type": "png",
                "file_size_bytes": png_path.stat().st_size,
                "reaction_id": None,
            }
        )

        # Stub heatmap SVG
        svg_path = results_dir / f"{corr_name}_heatmap.svg"
        svg_path.write_text(
            '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">'
            '<text x="10" y="30">Mock Pearson Correlation Heatmap</text></svg>'
        )
        outputs.append(
            {
                "file_category": "pearson_heatmap",
                "filename": svg_path.name,
                "file_path": f"{rel_job}/results/{svg_path.name}",
                "file_type": "svg",
                "file_size_bytes": svg_path.stat().st_size,
                "reaction_id": None,
            }
        )

        # Stub coverage CSV with sample columns
        coverage_csv = results_dir / f"{corr_name}_coverage_matrix.csv"
        cov_buf = io.StringIO()
        cov_writer = csv.writer(cov_buf)
        cov_writer.writerow([""] + sample_labels)
        for i in range(20):
            row = [f"chr{(i % 19) + 1}.{1000 + i * 50}"]
            for j in range(len(samples)):
                row.append(f"{0.5 + i * 0.1 + j * 0.3:.2f}")
            cov_writer.writerow(row)
        coverage_csv.write_text(cov_buf.getvalue())
        outputs.append(
            {
                "file_category": "pearson_matrix",
                "filename": coverage_csv.name,
                "file_path": f"{rel_job}/results/{coverage_csv.name}",
                "file_type": "csv",
                "file_size_bytes": coverage_csv.stat().st_size,
                "reaction_id": None,
            }
        )

        # Stub correlation CSV (N×N matrix)
        corr_csv = results_dir / f"{corr_name}_correlation.csv"
        corr_buf = io.StringIO()
        corr_writer = csv.writer(corr_buf)
        corr_writer.writerow([""] + sample_labels)
        for i, label in enumerate(sample_labels):
            row = [label]
            for j in range(len(sample_labels)):
                if i == j:
                    row.append("1.00")
                elif abs(i - j) <= 1:
                    row.append("0.95")
                else:
                    row.append(f"{0.60 + (i + j) * 0.02:.2f}")
            corr_writer.writerow(row)
        corr_csv.write_text(corr_buf.getvalue())
        outputs.append(
            {
                "file_category": "pearson_correlation",
                "filename": corr_csv.name,
                "file_path": f"{rel_job}/results/{corr_csv.name}",
                "file_type": "csv",
                "file_size_bytes": corr_csv.stat().st_size,
                "reaction_id": None,
            }
        )

        # Stub log
        master_log = logs_dir / "pearson_correlation.log"
        master_log.write_text(
            f"Mock Pearson correlation run for job {job_id}\n"
            f"Genome: {genome}\n"
            f"Samples: {', '.join(sample_labels)}\n"
        )
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
            "message": (f"Mock Pearson correlation complete ({len(samples)} samples, {genome})"),
            "outputs": outputs,
            "methods_text": self.generate_methods_text(params),
        }

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _write_sample_sheet(
        self,
        samples: list[dict],
        output_path: Path,
        storage: Path,
    ) -> None:
        """Write sample sheet CSV for the R script."""
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=["SampleName", "BigWigPath"])
        writer.writeheader()
        for s in samples:
            bw_abs = storage / s["bigwig_path"]
            writer.writerow(
                {
                    "SampleName": s["label"],
                    "BigWigPath": str(bw_abs),
                }
            )
        output_path.write_text(buf.getvalue())

    # ------------------------------------------------------------------
    # Methods text
    # ------------------------------------------------------------------

    def generate_methods_text(self, params: dict) -> str:
        return pearson_correlation_methods(params)
