# backend/pipelines/rnaseq_feature_counts.py
"""featureCounts gene-level read counting from STAR-aligned BAMs.

Produces a combined gene-by-sample count matrix from coordinate-sorted BAMs
using the Subread featureCounts tool. Unlike other pipeline stages, featureCounts
runs ALL reactions' BAMs in a single invocation (no ThreadPoolExecutor).

featureCounts command reference:
  featureCounts -a <GTF> -o <counts.txt> -p --countReadPairs \
    -T <threads> -s <strandedness> --primary <bam1> <bam2> ... <bamN>
"""

import shutil
import time
from collections.abc import Callable
from pathlib import Path

import structlog

from config import settings
from pipelines.base import (
    PipelineError,
    PipelineStage,
    append_to_master_log,
    get_threads,
    run_cmd,
)
from pipelines.methods_text import rnaseq_feature_counts_methods
from pipelines.rnaseq_alignment import RNASEQ_GENOME_CONFIG

logger = structlog.get_logger(__name__)

# Mapping from Salmon's auto-detected library type to featureCounts -s flag
SALMON_LIB_TYPE_TO_STRANDEDNESS: dict[str, int] = {
    "ISR": 2,  # inward, stranded, reverse → reverse-stranded
    "SR": 2,
    "ISF": 1,  # inward, stranded, forward → forward-stranded
    "SF": 1,
    "IU": 0,  # inward, unstranded
    "U": 0,
    "unknown": 0,
}

# featureCounts summary categories (produced by featureCounts as <output>.summary)
_SUMMARY_CATEGORIES = [
    "Assigned",
    "Unassigned_Unmapped",
    "Unassigned_Read_Type",
    "Unassigned_Singleton",
    "Unassigned_MappingQuality",
    "Unassigned_Chimera",
    "Unassigned_FragmentLength",
    "Unassigned_Duplicate",
    "Unassigned_MultiMapping",
    "Unassigned_Secondary",
    "Unassigned_NonSplit",
    "Unassigned_NoFeatures",
    "Unassigned_Overlapping_Length",
    "Unassigned_Ambiguity",
]


def _resolve_gtf(genome: str) -> Path:
    """Resolve GENCODE GTF annotation file for the given genome."""
    genome_cfg = RNASEQ_GENOME_CONFIG.get(genome)
    if not genome_cfg:
        raise PipelineError(
            f"No RNA-seq genome configuration for '{genome}'. "
            f"Supported genomes: {', '.join(RNASEQ_GENOME_CONFIG.keys())}"
        )
    return Path(settings.GENCODE_GTF_DIR) / genome_cfg["gtf_filename"]


class FeatureCountsStage(PipelineStage):
    """Gene-level read counting from STAR BAMs using featureCounts."""

    def validate(self, params: dict) -> list[str]:
        errors: list[str] = []

        if "experiment_id" not in params:
            errors.append("Missing required parameter: experiment_id")
        if "project_id" not in params:
            errors.append("Missing required parameter: project_id")

        if "reference_genome" not in params:
            errors.append("Missing required parameter: reference_genome")
        elif params["reference_genome"] not in RNASEQ_GENOME_CONFIG:
            errors.append(
                f"No RNA-seq index configuration for genome: {params['reference_genome']}. "
                f"Supported: {', '.join(RNASEQ_GENOME_CONFIG.keys())}"
            )

        if "alignment_job_id" not in params:
            errors.append("Missing required parameter: alignment_job_id")

        strandedness = params.get("strandedness")
        if strandedness is None:
            errors.append("Missing required parameter: strandedness")
        elif strandedness not in (0, 1, 2):
            errors.append(f"Invalid strandedness value: {strandedness}. Must be 0, 1, or 2")

        reactions = params.get("reactions")
        if not reactions:
            errors.append("Missing required parameter: reactions (must be non-empty list)")
        else:
            for i, rxn in enumerate(reactions):
                if "reaction_id" not in rxn:
                    errors.append(f"reactions[{i}]: missing 'reaction_id'")
                if "short_name" not in rxn:
                    errors.append(f"reactions[{i}]: missing 'short_name'")
                if "bam_path" not in rxn:
                    errors.append(f"reactions[{i}]: missing 'bam_path'")

        # Check tools and GTF exist in real mode only
        if settings.PIPELINE_MODE == "real":
            if not shutil.which("featureCounts"):
                errors.append(
                    "Required tool not found in PATH: featureCounts "
                    "(install via conda install -c bioconda subread)"
                )

            genome = params.get("reference_genome", "")
            if genome in RNASEQ_GENOME_CONFIG:
                gtf_path = _resolve_gtf(genome)
                if not gtf_path.exists():
                    errors.append(f"GTF annotation file not found: {gtf_path}")

        return errors

    def run(
        self,
        job_id: int,
        params: dict,
        working_dir: Path,
        job_dir: Path,
        cancelled: Callable[[], bool] | None = None,
    ) -> dict:
        genome = params["reference_genome"]
        reactions = params["reactions"]
        strandedness = params["strandedness"]
        total_threads = get_threads()

        # Resolve featureCounts binary
        fc_bin = shutil.which("featureCounts")
        if not fc_bin:
            raise PipelineError(
                "featureCounts not found. Install via conda (conda install -c bioconda subread) "
                "or ensure 'featureCounts' is on PATH."
            )

        # Resolve GTF annotation
        gtf_path = _resolve_gtf(genome)

        # Resolve BAM paths (absolute)
        bam_paths: list[str] = []
        for rxn in reactions:
            bam_abs = Path(settings.STORAGE_ROOT) / rxn["bam_path"]
            if not bam_abs.exists():
                raise PipelineError(f"BAM file not found: {bam_abs}")
            bam_paths.append(str(bam_abs))

        # Create output directories
        results_dir = job_dir / "results"
        logs_dir = job_dir / "logs"
        results_dir.mkdir(parents=True, exist_ok=True)
        logs_dir.mkdir(parents=True, exist_ok=True)

        master_log = logs_dir / "feature_counts.log"
        counts_file = results_dir / "feature_counts.txt"

        project_id = params["project_id"]
        experiment_id = params["experiment_id"]
        rel_job = f"projects/{project_id}/{experiment_id}/jobs/{job_id}"

        genome_cfg = RNASEQ_GENOME_CONFIG[genome]
        gtf_name = genome_cfg.get("gtf_filename", "unknown")
        append_to_master_log(
            master_log,
            f"featureCounts job {job_id} started",
            f"Genome: {genome} (GTF: {gtf_name})\n"
            f"Reactions: {len(reactions)}\n"
            f"Strandedness: {strandedness}\n"
            f"Threads: {total_threads}\n"
            f"BAMs: {', '.join(r['short_name'] for r in reactions)}",
        )

        # Build featureCounts command — single invocation, all BAMs
        cmd = [
            fc_bin,
            "-a",
            str(gtf_path),
            "-o",
            str(counts_file),
            "-p",
            "--countReadPairs",
            "-T",
            str(total_threads),
            "-s",
            str(strandedness),
            "--primary",
        ] + bam_paths

        append_to_master_log(master_log, "featureCounts command", " ".join(cmd))
        run_cmd(cmd, master_log=master_log, cancelled=cancelled, timeout=7200)

        # Parse summary for logging
        summary_path = Path(f"{counts_file}.summary")
        if summary_path.exists():
            summary_text = summary_path.read_text()
            append_to_master_log(master_log, "featureCounts summary", summary_text)

        append_to_master_log(master_log, "featureCounts completed", "All reactions counted.")

        # Register outputs
        outputs: list[dict] = []

        def _add_output(path: Path, category: str, ftype: str) -> None:
            if path.exists():
                outputs.append(
                    {
                        "file_category": category,
                        "filename": path.name,
                        "file_path": f"{rel_job}/{path.relative_to(job_dir)}",
                        "file_type": ftype,
                        "file_size_bytes": path.stat().st_size,
                        "reaction_id": None,
                    }
                )

        _add_output(counts_file, "count_matrix", "txt")
        _add_output(summary_path, "count_summary", "txt")
        _add_output(master_log, "master_log", "log")

        methods_text = self.generate_methods_text(params)

        return {
            "job_id": job_id,
            "status": "complete",
            "message": f"featureCounts completed for {len(reactions)} reactions",
            "outputs": outputs,
            "methods_text": methods_text,
        }

    def mock_run(self, job_id: int, params: dict, working_dir: Path, job_dir: Path) -> dict:
        reactions = params.get("reactions", [])
        genome = params.get("reference_genome", "mm10")

        # Create output directories
        results_dir = job_dir / "results"
        logs_dir = job_dir / "logs"
        results_dir.mkdir(parents=True, exist_ok=True)
        logs_dir.mkdir(parents=True, exist_ok=True)

        master_log = logs_dir / "feature_counts.log"
        counts_file = results_dir / "feature_counts.txt"
        summary_file = results_dir / "feature_counts.txt.summary"

        project_id = params.get("project_id", 0)
        experiment_id = params.get("experiment_id", 0)
        rel_job = f"projects/{project_id}/{experiment_id}/jobs/{job_id}"

        append_to_master_log(
            master_log,
            f"Mock featureCounts job {job_id}",
            f"Genome: {genome}, Reactions: {len(reactions)}",
        )

        time.sleep(1)

        # Generate mock count matrix
        sample_columns = [rxn["short_name"] for rxn in reactions]
        gene_prefix = "ENSMUSG" if genome == "mm10" else "ENSG"

        header = "\t".join(["Geneid", "Chr", "Start", "End", "Strand", "Length"] + sample_columns)
        lines = [
            "# Program:featureCounts v2.0.6 ; Subread v2.0.6",
            f"# Mock run for job {job_id}",
            header,
        ]
        mock_genes = [
            (f"{gene_prefix}00000000001", "chr1", "3073253", "3074322", "+", "1070"),
            (f"{gene_prefix}00000000002", "chr1", "3102016", "3102125", "+", "110"),
            (f"{gene_prefix}00000000003", "chr1", "3205901", "3671498", "-", "3262"),
            (f"{gene_prefix}00000000004", "chr1", "3214482", "3671498", "-", "2094"),
            (f"{gene_prefix}00000000005", "chr1", "3531795", "3628898", "+", "2412"),
            (f"{gene_prefix}00000000006", "chr1", "3680155", "3681788", "+", "1634"),
            (f"{gene_prefix}00000000007", "chr2", "3002129", "3236757", "-", "5476"),
            (f"{gene_prefix}00000000008", "chr2", "3455067", "3458362", "+", "3296"),
            (f"{gene_prefix}00000000009", "chr3", "3163593", "3252478", "-", "3210"),
            (f"{gene_prefix}00000000010", "chr3", "3281167", "3283853", "+", "2687"),
        ]
        import random

        random.seed(job_id)
        for gene_id, chrom, start, end, strand, length in mock_genes:
            counts = [str(random.randint(0, 5000)) for _ in reactions]
            lines.append("\t".join([gene_id, chrom, start, end, strand, length] + counts))

        counts_file.write_text("\n".join(lines) + "\n")

        # Generate mock summary file
        summary_header = "Status\t" + "\t".join(sample_columns)
        summary_lines = [summary_header]
        for category in _SUMMARY_CATEGORIES:
            if category == "Assigned":
                vals = [str(random.randint(8000000, 10000000)) for _ in reactions]
            elif category in ("Unassigned_NoFeatures", "Unassigned_Ambiguity"):
                vals = [str(random.randint(100000, 500000)) for _ in reactions]
            else:
                vals = [str(random.randint(0, 50000)) for _ in reactions]
            summary_lines.append(f"{category}\t" + "\t".join(vals))
        summary_file.write_text("\n".join(summary_lines) + "\n")

        append_to_master_log(master_log, "Mock featureCounts completed", "Done.")

        # Register outputs
        outputs: list[dict] = []

        def _add_output(path: Path, category: str, ftype: str) -> None:
            if path.exists():
                outputs.append(
                    {
                        "file_category": category,
                        "filename": path.name,
                        "file_path": f"{rel_job}/{path.relative_to(job_dir)}",
                        "file_type": ftype,
                        "file_size_bytes": path.stat().st_size,
                        "reaction_id": None,
                    }
                )

        _add_output(counts_file, "count_matrix", "txt")
        _add_output(summary_file, "count_summary", "txt")
        _add_output(master_log, "master_log", "log")

        return {
            "job_id": job_id,
            "status": "complete",
            "message": f"Mock featureCounts completed for {len(reactions)} reactions",
            "outputs": outputs,
            "methods_text": self.generate_methods_text(params),
        }

    def generate_methods_text(self, params: dict) -> str:
        return rnaseq_feature_counts_methods(params)
