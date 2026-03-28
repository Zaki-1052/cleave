# backend/pipelines/custom_heatmap.py
"""Custom reference-point heatmap pipeline using deepTools.

Ports the lab's heatmaps.sh (references/genomewide_plots/heatmaps.sh):
  computeMatrix reference-point --referencePoint center -R <bed> -S <bigwigs> -a 1500 -b 1500
  plotHeatmap -m <matrix> --samplesLabel <labels> -out <output.png>

User-configurable options (flanking distance, sort order, color map, reference
point) are layered on top of the lab defaults.
"""

import gzip
import shutil
import time
from pathlib import Path

import structlog

from config import settings
from pipelines.base import PipelineError, PipelineStage, append_to_master_log, run_cmd
from pipelines.methods_text import custom_heatmap_methods

logger = structlog.get_logger(__name__)

_VALID_SORT_ORDERS = {"descend", "ascend", "no", "keep"}
_VALID_REFERENCE_POINTS = {"center", "TSS", "TES"}

# Minimal 1x1 transparent PNG for mock plot stubs (same as diffbind.py)
_STUB_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
    b"\r\n\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


class CustomHeatmapStage(PipelineStage):
    # ------------------------------------------------------------------
    # Validation
    # ------------------------------------------------------------------

    def validate(self, params: dict) -> list[str]:
        errors: list[str] = []

        for field in ("experiment_id", "project_id", "parent_job_id", "alignment_job_id"):
            if not params.get(field):
                errors.append(f"Missing required param: {field}")

        if not params.get("bed_path"):
            errors.append("Missing required param: bed_path")

        samples = params.get("samples")
        if not samples or not isinstance(samples, list):
            errors.append("samples must be a non-empty list")
            return errors

        for i, s in enumerate(samples):
            prefix = f"samples[{i}]"
            for field in ("reaction_id", "short_name", "label", "bigwig_path"):
                if not s.get(field) and s.get(field) != 0:
                    errors.append(f"{prefix} missing {field}")

        upstream = params.get("flanking_upstream", 1500)
        downstream = params.get("flanking_downstream", 1500)
        for name, val in [("flanking_upstream", upstream), ("flanking_downstream", downstream)]:
            if not isinstance(val, int) or val < 100 or val > 10000:
                errors.append(f"{name} must be an integer between 100 and 10000, got {val}")

        sort_order = params.get("sort_order", "descend")
        if sort_order not in _VALID_SORT_ORDERS:
            valid = sorted(_VALID_SORT_ORDERS)
            errors.append(f"Invalid sort_order '{sort_order}'. Must be one of: {valid}")

        ref_point = params.get("reference_point", "center")
        if ref_point not in _VALID_REFERENCE_POINTS:
            errors.append(
                f"Invalid reference_point '{ref_point}'. "
                f"Must be one of: {sorted(_VALID_REFERENCE_POINTS)}"
            )

        if settings.PIPELINE_MODE != "mock":
            for tool in ("computeMatrix", "plotHeatmap"):
                if not shutil.which(tool):
                    errors.append(f"{tool} not found in PATH")

        return errors

    # ------------------------------------------------------------------
    # Real run
    # ------------------------------------------------------------------

    def run(self, job_id: int, params: dict, working_dir: Path, job_dir: Path) -> dict:
        project_id = params["project_id"]
        experiment_id = params["experiment_id"]
        samples = params["samples"]
        bed_label = params.get("bed_label", "custom regions")
        upstream = params.get("flanking_upstream", 1500)
        downstream = params.get("flanking_downstream", 1500)
        ref_point = params.get("reference_point", "center")
        sort_order = params.get("sort_order", "descend")
        color_map = params.get("color_map") or None
        z_min = params.get("z_min")
        z_max = params.get("z_max")

        results_dir = job_dir / "results"
        logs_dir = job_dir / "logs"
        for d in [results_dir, logs_dir]:
            d.mkdir(parents=True, exist_ok=True)

        master_log = logs_dir / "custom_heatmap.log"
        heatmap_name = f"heatmap_job_{job_id}"
        rel_job = f"projects/{project_id}/{experiment_id}/jobs/{job_id}"

        append_to_master_log(
            master_log,
            f"Custom heatmap job {job_id} started",
            f"BED: {bed_label}\nSamples: {len(samples)}\n"
            f"Flanking: {upstream}bp upstream, {downstream}bp downstream\n"
            f"Reference point: {ref_point}",
        )

        # Resolve input file paths
        storage = Path(settings.STORAGE_ROOT)
        bed_abs = storage / params["bed_path"]
        if not bed_abs.exists():
            raise PipelineError(f"BED file not found: {bed_abs}")

        bigwig_paths: list[Path] = []
        for s in samples:
            bw = storage / s["bigwig_path"]
            if not bw.exists():
                raise PipelineError(f"bigWig not found for {s['short_name']}: {bw}")
            bigwig_paths.append(bw)

        # Copy BED to results for archival
        bed_copy = results_dir / f"{heatmap_name}_regions.bed"
        shutil.copy2(bed_abs, bed_copy)

        # --- computeMatrix reference-point ---
        # Matches lab script: references/genomewide_plots/heatmaps.sh line 74
        matrix_path = results_dir / f"matrix_{heatmap_name}.gz"
        compute_cmd = [
            "computeMatrix",
            "reference-point",
            "--referencePoint",
            ref_point,
            "-R",
            str(bed_abs),
            "-S",
            *[str(p) for p in bigwig_paths],
            "-a",
            str(downstream),
            "-b",
            str(upstream),
            "-o",
            str(matrix_path),
        ]

        append_to_master_log(master_log, "Running computeMatrix", " ".join(compute_cmd))
        run_cmd(
            compute_cmd,
            log_path=logs_dir / "computeMatrix.log",
            timeout=7200,
            master_log=master_log,
        )

        if not matrix_path.exists():
            raise PipelineError(f"computeMatrix did not produce matrix: {matrix_path}")

        # --- plotHeatmap (PNG) ---
        # Matches lab script: references/genomewide_plots/heatmaps.sh line 76
        sample_labels = [s["label"] for s in samples]
        png_path = results_dir / f"{heatmap_name}.png"
        plot_cmd = [
            "plotHeatmap",
            "-m",
            str(matrix_path),
            "--samplesLabel",
            *sample_labels,
            "-out",
            str(png_path),
        ]
        # Optional overrides (not in lab script, but user-configurable)
        if sort_order != "descend":
            plot_cmd.extend(["--sortRegions", sort_order])
        if color_map:
            plot_cmd.extend(["--colorMap", color_map])
        if z_min is not None:
            plot_cmd.extend(["--zMin", str(z_min)])
        if z_max is not None:
            plot_cmd.extend(["--zMax", str(z_max)])

        append_to_master_log(master_log, "Running plotHeatmap (PNG)", " ".join(plot_cmd))
        run_cmd(
            plot_cmd,
            log_path=logs_dir / "plotHeatmap_png.log",
            timeout=3600,
            master_log=master_log,
        )

        # --- plotHeatmap (SVG) — same matrix, vector output ---
        svg_path = results_dir / f"{heatmap_name}.svg"
        svg_cmd = [
            "plotHeatmap",
            "-m",
            str(matrix_path),
            "--samplesLabel",
            *sample_labels,
            "--plotFileFormat",
            "svg",
            "-out",
            str(svg_path),
        ]
        if sort_order != "descend":
            svg_cmd.extend(["--sortRegions", sort_order])
        if color_map:
            svg_cmd.extend(["--colorMap", color_map])
        if z_min is not None:
            svg_cmd.extend(["--zMin", str(z_min)])
        if z_max is not None:
            svg_cmd.extend(["--zMax", str(z_max)])

        append_to_master_log(master_log, "Running plotHeatmap (SVG)", " ".join(svg_cmd))
        run_cmd(
            svg_cmd,
            log_path=logs_dir / "plotHeatmap_svg.log",
            timeout=3600,
            master_log=master_log,
        )

        append_to_master_log(master_log, "Custom heatmap complete", f"Outputs in {results_dir}")

        # Register outputs
        outputs: list[dict] = []

        for path, ftype in [(png_path, "png"), (svg_path, "svg")]:
            if path.exists():
                outputs.append(
                    {
                        "file_category": "custom_heatmap_plot",
                        "filename": path.name,
                        "file_path": f"{rel_job}/results/{path.name}",
                        "file_type": ftype,
                        "file_size_bytes": path.stat().st_size,
                        "reaction_id": None,
                    }
                )

        if matrix_path.exists():
            outputs.append(
                {
                    "file_category": "custom_heatmap_matrix",
                    "filename": matrix_path.name,
                    "file_path": f"{rel_job}/results/{matrix_path.name}",
                    "file_type": "gz",
                    "file_size_bytes": matrix_path.stat().st_size,
                    "reaction_id": None,
                }
            )

        if bed_copy.exists():
            outputs.append(
                {
                    "file_category": "custom_heatmap_bed",
                    "filename": bed_copy.name,
                    "file_path": f"{rel_job}/results/{bed_copy.name}",
                    "file_type": "bed",
                    "file_size_bytes": bed_copy.stat().st_size,
                    "reaction_id": None,
                }
            )

        # Logs
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
            "message": f"Custom heatmap complete ({len(samples)} samples, {bed_label})",
            "outputs": outputs,
            "methods_text": self.generate_methods_text(params),
        }

    # ------------------------------------------------------------------
    # Mock run
    # ------------------------------------------------------------------

    def mock_run(self, job_id: int, params: dict, working_dir: Path, job_dir: Path) -> dict:
        time.sleep(3)

        project_id = params["project_id"]
        experiment_id = params["experiment_id"]
        samples = params.get("samples", [])
        bed_label = params.get("bed_label", "custom regions")
        heatmap_name = f"heatmap_job_{job_id}"
        rel_job = f"projects/{project_id}/{experiment_id}/jobs/{job_id}"

        results_dir = job_dir / "results"
        logs_dir = job_dir / "logs"
        for d in [results_dir, logs_dir]:
            d.mkdir(parents=True, exist_ok=True)

        outputs: list[dict] = []

        # Stub heatmap PNG
        png_path = results_dir / f"{heatmap_name}.png"
        png_path.write_bytes(_STUB_PNG)
        outputs.append(
            {
                "file_category": "custom_heatmap_plot",
                "filename": png_path.name,
                "file_path": f"{rel_job}/results/{png_path.name}",
                "file_type": "png",
                "file_size_bytes": png_path.stat().st_size,
                "reaction_id": None,
            }
        )

        # Stub heatmap SVG
        svg_path = results_dir / f"{heatmap_name}.svg"
        svg_path.write_text(
            '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600">'
            '<text x="10" y="30">Mock Custom Heatmap</text></svg>'
        )
        outputs.append(
            {
                "file_category": "custom_heatmap_plot",
                "filename": svg_path.name,
                "file_path": f"{rel_job}/results/{svg_path.name}",
                "file_type": "svg",
                "file_size_bytes": svg_path.stat().st_size,
                "reaction_id": None,
            }
        )

        # Stub matrix (minimal gzip)
        matrix_path = results_dir / f"matrix_{heatmap_name}.gz"
        with gzip.open(matrix_path, "wb") as gz:
            gz.write(b"@mock deepTools matrix\n")
        outputs.append(
            {
                "file_category": "custom_heatmap_matrix",
                "filename": matrix_path.name,
                "file_path": f"{rel_job}/results/{matrix_path.name}",
                "file_type": "gz",
                "file_size_bytes": matrix_path.stat().st_size,
                "reaction_id": None,
            }
        )

        # Stub BED copy
        bed_copy = results_dir / f"{heatmap_name}_regions.bed"
        sample_labels = [
            s.get("label", s.get("short_name", f"sample_{i}")) for i, s in enumerate(samples)
        ]
        bed_lines = [
            f"chr{(i % 19) + 1}\t{1000 + i * 500}\t{1500 + i * 500}\tregion_{i}" for i in range(20)
        ]
        bed_copy.write_text("\n".join(bed_lines) + "\n")
        outputs.append(
            {
                "file_category": "custom_heatmap_bed",
                "filename": bed_copy.name,
                "file_path": f"{rel_job}/results/{bed_copy.name}",
                "file_type": "bed",
                "file_size_bytes": bed_copy.stat().st_size,
                "reaction_id": None,
            }
        )

        # Stub log
        master_log = logs_dir / "custom_heatmap.log"
        master_log.write_text(
            f"Mock custom heatmap run for job {job_id}\n"
            f"Samples: {', '.join(sample_labels)}\n"
            f"BED: {bed_label}\n"
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
            "message": f"Mock custom heatmap complete ({len(samples)} samples, {bed_label})",
            "outputs": outputs,
            "methods_text": self.generate_methods_text(params),
        }

    # ------------------------------------------------------------------
    # Methods text
    # ------------------------------------------------------------------

    def generate_methods_text(self, params: dict) -> str:
        return custom_heatmap_methods(params)
