# backend/pipelines/roman_normalization.py
"""Roman normalization pipeline — mouse-only 99th-percentile quantile normalization.

Ports the lab's references/media_normalization/normalization.r into a
parameterised R script + Python visualization:
  1. roman_normalization.R — bigWig → coverage matrix → mask → normalise → _rnorm.bw
  2. roman_normalization_plot.py — normalization factors bar chart (PNG + SVG)

Input: RPKM-normalised bigWig files from alignment.
Output: Per-sample *_rnorm.bw files + normalization_factors.csv.
Constraint: Mouse mm10 only (chr1-19, chrX).
"""

import csv
import io
import shutil
import time
from pathlib import Path

import structlog

from config import settings
from pipelines.base import PipelineError, PipelineStage, append_to_master_log, run_cmd
from pipelines.methods_text import roman_normalization_methods

logger = structlog.get_logger(__name__)

_SCRIPTS_DIR = Path(__file__).resolve().parent / "scripts"
_MASKS_DIR = Path(__file__).resolve().parent / "reference" / "masks"

# Minimal 1x1 transparent PNG for mock stubs
_STUB_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
    b"\r\n\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


class RomanNormalizationStage(PipelineStage):
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
        elif genome != "mm10":
            errors.append(
                f"Roman normalization is mouse-only (mm10). Got: '{genome}'. "
                "This pipeline cannot be used with non-mouse genomes."
            )

        samples = params.get("samples")
        if not samples or not isinstance(samples, list):
            errors.append("samples must be a non-empty list")
            return errors

        if len(samples) < 2:
            errors.append(f"Roman normalization requires at least 2 samples, got {len(samples)}")

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

    def run(self, job_id: int, params: dict, working_dir: Path, job_dir: Path) -> dict:
        project_id = params["project_id"]
        experiment_id = params["experiment_id"]
        samples = params["samples"]

        results_dir = job_dir / "results"
        logs_dir = job_dir / "logs"
        for d in [results_dir, logs_dir]:
            d.mkdir(parents=True, exist_ok=True)

        master_log = logs_dir / "roman_normalization.log"
        norm_name = f"normalization_job_{job_id}"
        rel_job = f"projects/{project_id}/{experiment_id}/jobs/{job_id}"

        append_to_master_log(
            master_log,
            f"Roman normalization job {job_id} started",
            f"Genome: mm10\nSamples: {len(samples)}",
        )

        # Write sample sheet CSV (use short_name for filename safety)
        storage = Path(settings.STORAGE_ROOT)
        sample_sheet_path = job_dir / "sample_sheet.csv"
        self._write_sample_sheet(samples, sample_sheet_path, storage)
        append_to_master_log(master_log, "Sample sheet written", sample_sheet_path.read_text())

        # Resolve mask BED (always mm10)
        mask_path = _MASKS_DIR / "manual.mask.ultimate.bed"
        if not mask_path.exists():
            raise PipelineError(f"Mask file not found: {mask_path}")
        append_to_master_log(master_log, "Masking enabled", f"{mask_path} (158 entries)")

        # --- Run R script: bigWig → normalize → _rnorm.bw ---
        r_script = _SCRIPTS_DIR / "roman_normalization.R"
        if not r_script.exists():
            raise PipelineError(f"R script not found: {r_script}")

        r_cmd = [
            "Rscript",
            str(r_script),
            str(sample_sheet_path),
            str(results_dir),
            str(mask_path),
        ]

        append_to_master_log(master_log, "Running roman_normalization.R", " ".join(r_cmd))
        run_cmd(
            r_cmd,
            log_path=logs_dir / "roman_normalization_r.log",
            timeout=14400,  # 4 hours for large bigWig processing
            master_log=master_log,
        )

        # Verify normalization factors CSV
        factors_csv = results_dir / "normalization_factors.csv"
        if not factors_csv.exists():
            raise PipelineError(f"R script did not produce normalization factors: {factors_csv}")

        # Verify each _rnorm.bw exists
        for s in samples:
            bw_name = f"{s['short_name']}_rnorm.bw"
            bw_path = results_dir / bw_name
            if not bw_path.exists():
                raise PipelineError(f"R script did not produce normalized bigWig: {bw_path}")

        # --- Run Python script: factors CSV → bar chart ---
        py_script = _SCRIPTS_DIR / "roman_normalization_plot.py"
        if not py_script.exists():
            raise PipelineError(f"Python script not found: {py_script}")

        png_path = results_dir / f"{norm_name}_factors.png"
        svg_path = results_dir / f"{norm_name}_factors.svg"
        py_cmd = [
            "python3",
            str(py_script),
            str(factors_csv),
            str(png_path),
            str(svg_path),
        ]

        append_to_master_log(master_log, "Running roman_normalization_plot.py", " ".join(py_cmd))
        run_cmd(
            py_cmd,
            log_path=logs_dir / "roman_normalization_plot_py.log",
            timeout=3600,
            master_log=master_log,
        )

        append_to_master_log(
            master_log,
            "Roman normalization complete",
            f"Outputs in {results_dir}",
        )

        # Register outputs
        outputs: list[dict] = []

        # Per-reaction normalized bigWig files
        for s in samples:
            bw_name = f"{s['short_name']}_rnorm.bw"
            bw_path = results_dir / bw_name
            if bw_path.exists():
                outputs.append(
                    {
                        "file_category": "normalization_bigwig",
                        "filename": bw_name,
                        "file_path": f"{rel_job}/results/{bw_name}",
                        "file_type": "bw",
                        "file_size_bytes": bw_path.stat().st_size,
                        "reaction_id": s["reaction_id"],
                    }
                )

        # Normalization factors CSV
        if factors_csv.exists():
            outputs.append(
                {
                    "file_category": "normalization_factors",
                    "filename": factors_csv.name,
                    "file_path": f"{rel_job}/results/{factors_csv.name}",
                    "file_type": "csv",
                    "file_size_bytes": factors_csv.stat().st_size,
                    "reaction_id": None,
                }
            )

        # Plot PNG + SVG
        for path, ftype in [(png_path, "png"), (svg_path, "svg")]:
            if path.exists():
                outputs.append(
                    {
                        "file_category": "normalization_plot",
                        "filename": path.name,
                        "file_path": f"{rel_job}/results/{path.name}",
                        "file_type": ftype,
                        "file_size_bytes": path.stat().st_size,
                        "reaction_id": None,
                    }
                )

        # Sample sheet
        outputs.append(
            {
                "file_category": "normalization_sample_sheet",
                "filename": sample_sheet_path.name,
                "file_path": f"{rel_job}/{sample_sheet_path.name}",
                "file_type": "csv",
                "file_size_bytes": sample_sheet_path.stat().st_size,
                "reaction_id": None,
            }
        )

        # Log files
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
            "message": (f"Roman normalization complete ({len(samples)} samples, mm10)"),
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
        norm_name = f"normalization_job_{job_id}"
        rel_job = f"projects/{project_id}/{experiment_id}/jobs/{job_id}"

        results_dir = job_dir / "results"
        logs_dir = job_dir / "logs"
        for d in [results_dir, logs_dir]:
            d.mkdir(parents=True, exist_ok=True)

        outputs: list[dict] = []

        # Write sample sheet (same as real run)
        storage = Path(settings.STORAGE_ROOT)
        sample_sheet_path = job_dir / "sample_sheet.csv"
        self._write_sample_sheet(samples, sample_sheet_path, storage)
        outputs.append(
            {
                "file_category": "normalization_sample_sheet",
                "filename": sample_sheet_path.name,
                "file_path": f"{rel_job}/{sample_sheet_path.name}",
                "file_type": "csv",
                "file_size_bytes": sample_sheet_path.stat().st_size,
                "reaction_id": None,
            }
        )

        # Stub per-reaction normalized bigWig files
        for s in samples:
            bw_name = f"{s['short_name']}_rnorm.bw"
            bw_path = results_dir / bw_name
            # Write a small stub (bigWig is binary; just needs non-zero bytes)
            bw_path.write_bytes(b"\x00" * 64)
            outputs.append(
                {
                    "file_category": "normalization_bigwig",
                    "filename": bw_name,
                    "file_path": f"{rel_job}/results/{bw_name}",
                    "file_type": "bw",
                    "file_size_bytes": bw_path.stat().st_size,
                    "reaction_id": s["reaction_id"],
                }
            )

        # Stub normalization factors CSV with realistic mock data
        factors_csv = results_dir / "normalization_factors.csv"
        fac_buf = io.StringIO()
        fac_writer = csv.writer(fac_buf)
        fac_writer.writerow(["SampleName", "Percentile99", "NormalizationFactor"])
        for i, s in enumerate(samples):
            p99 = 12.5 + i * 0.3
            nf = p99 / 12.5  # first sample = reference (NF ≈ 1.0)
            fac_writer.writerow([s["short_name"], f"{p99:.4f}", f"{nf:.4f}"])
        factors_csv.write_text(fac_buf.getvalue())
        outputs.append(
            {
                "file_category": "normalization_factors",
                "filename": factors_csv.name,
                "file_path": f"{rel_job}/results/{factors_csv.name}",
                "file_type": "csv",
                "file_size_bytes": factors_csv.stat().st_size,
                "reaction_id": None,
            }
        )

        # Stub plot PNG
        png_path = results_dir / f"{norm_name}_factors.png"
        png_path.write_bytes(_STUB_PNG)
        outputs.append(
            {
                "file_category": "normalization_plot",
                "filename": png_path.name,
                "file_path": f"{rel_job}/results/{png_path.name}",
                "file_type": "png",
                "file_size_bytes": png_path.stat().st_size,
                "reaction_id": None,
            }
        )

        # Stub plot SVG
        svg_path = results_dir / f"{norm_name}_factors.svg"
        svg_path.write_text(
            '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400">'
            '<text x="10" y="30">Mock Roman Normalization Factors</text></svg>'
        )
        outputs.append(
            {
                "file_category": "normalization_plot",
                "filename": svg_path.name,
                "file_path": f"{rel_job}/results/{svg_path.name}",
                "file_type": "svg",
                "file_size_bytes": svg_path.stat().st_size,
                "reaction_id": None,
            }
        )

        # Stub log
        master_log = logs_dir / "roman_normalization.log"
        labels = [s.get("short_name", "") for s in samples]
        master_log.write_text(
            f"Mock Roman normalization run for job {job_id}\n"
            f"Genome: mm10\n"
            f"Samples: {', '.join(labels)}\n"
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
            "message": (f"Mock Roman normalization complete ({len(samples)} samples, mm10)"),
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
        """Write sample sheet CSV for the R script.

        Uses short_name as SampleName for bigWig output filename safety.
        """
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=["SampleName", "BigWigPath"])
        writer.writeheader()
        for s in samples:
            bw_abs = storage / s["bigwig_path"]
            writer.writerow(
                {
                    "SampleName": s["short_name"],
                    "BigWigPath": str(bw_abs),
                }
            )
        output_path.write_text(buf.getvalue())

    # ------------------------------------------------------------------
    # Methods text
    # ------------------------------------------------------------------

    def generate_methods_text(self, params: dict) -> str:
        return roman_normalization_methods(params)
