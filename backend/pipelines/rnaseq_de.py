# backend/pipelines/rnaseq_de.py
"""RNA-seq differential expression analysis — DESeq2.

Supports two quantification input paths:
  1. Salmon (default) — tximport -> DESeqDataSetFromTximport
  2. featureCounts    — DESeqDataSetFromMatrix

Both paths produce identical output sets: de_results.tsv, normalized_counts.csv,
de_summary.json, and 5 plot types (PNG + SVG).
"""

import csv
import json
import re
import shutil
import time
from collections.abc import Callable
from pathlib import Path

import structlog

from config import settings
from pipelines.base import PipelineError, PipelineStage, append_to_master_log, run_cmd
from pipelines.methods_text import rnaseq_de_methods
from pipelines.rnaseq_alignment import RNASEQ_GENOME_CONFIG

logger = structlog.get_logger(__name__)

# Mock DE results for stub outputs
_MOCK_GENES = [
    ("Gapdh", "ENSMUSG00000057666", 5432.1, -0.12, 0.08, -1.5, 0.134, 0.892),
    ("Actb", "ENSMUSG00000029580", 8901.3, 0.05, 0.06, 0.83, 0.407, 0.953),
    ("Myc", "ENSMUSG00000022346", 312.7, 2.45, 0.31, 7.9, 2.8e-15, 1.4e-12),
    ("Trp53", "ENSMUSG00000059552", 678.4, -1.87, 0.28, -6.68, 2.4e-11, 6.0e-9),
    ("Sox2", "ENSMUSG00000074637", 156.2, 3.12, 0.45, 6.93, 4.2e-12, 1.3e-9),
    ("Pou5f1", "ENSMUSG00000024406", 89.5, -2.91, 0.52, -5.6, 2.1e-8, 3.5e-6),
    ("Nanog", "ENSMUSG00000012396", 201.8, 1.56, 0.33, 4.73, 2.2e-6, 2.8e-4),
    ("Klf4", "ENSMUSG00000003032", 445.9, -0.78, 0.19, -4.1, 4.1e-5, 4.1e-3),
]

_RESULTS_HEADER = [
    "gene_name",
    "gene_id",
    "baseMean",
    "log2FoldChange",
    "lfcSE",
    "stat",
    "pvalue",
    "padj",
]

_SCRIPTS_DIR = Path(__file__).resolve().parent / "scripts"

_SCRIPT_MAP = {
    "salmon": "rnaseq_deseq2.R",
    "featurecounts": "rnaseq_deseq2_fc.R",
}

_CONDITION_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_]*$")

# Minimal 1x1 transparent PNG for mock stubs (same as diffbind.py)
_STUB_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
    b"\r\n\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)

_PLOT_TYPES = ["volcano", "ma_plot", "pca", "sample_distance", "top_genes_heatmap"]

_PLOT_CATEGORY_MAP = {
    "volcano": "volcano_plot",
    "ma_plot": "ma_plot",
    "pca": "pca_plot",
    "sample_distance": "distance_heatmap",
    "top_genes_heatmap": "gene_heatmap",
}

# Regex for extracting key-value pairs from GTF attributes column
_GTF_ATTR_RE = re.compile(r'(\w+) "([^"]+)"')


def _resolve_gtf(genome: str) -> Path:
    """Resolve GENCODE GTF annotation file for the given genome."""
    genome_cfg = RNASEQ_GENOME_CONFIG.get(genome)
    if not genome_cfg:
        raise PipelineError(
            f"No RNA-seq genome configuration for '{genome}'. "
            f"Supported genomes: {', '.join(RNASEQ_GENOME_CONFIG.keys())}"
        )
    return Path(settings.GENCODE_GTF_DIR) / genome_cfg["gtf_filename"]


def _generate_tx2gene(gtf_path: Path, output_path: Path) -> None:
    """Parse GENCODE GTF to create transcript-to-gene mapping TSV.

    Reads GTF line by line, filters for transcript features, extracts
    transcript_id, gene_id, and gene_name from the attributes column.
    Writes TSV with columns: TXNAME, GENEID, GENENAME.
    """
    count = 0
    with open(gtf_path) as fin, open(output_path, "w") as fout:
        fout.write("TXNAME\tGENEID\tGENENAME\n")
        for line in fin:
            if line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) < 9 or parts[2] != "transcript":
                continue
            attrs = dict(_GTF_ATTR_RE.findall(parts[8]))
            tx_id = attrs.get("transcript_id", "")
            gene_id = attrs.get("gene_id", "")
            gene_name = attrs.get("gene_name", gene_id)
            if tx_id and gene_id:
                fout.write(f"{tx_id}\t{gene_id}\t{gene_name}\n")
                count += 1
    logger.info("tx2gene generated", path=str(output_path), transcripts=count)


class RnaseqDEStage(PipelineStage):
    """DESeq2 differential expression with Salmon or featureCounts input."""

    def validate(self, params: dict) -> list[str]:
        errors: list[str] = []
        if "experiment_id" not in params:
            errors.append("Missing required parameter: experiment_id")
        if "project_id" not in params:
            errors.append("Missing required parameter: project_id")

        genome = params.get("reference_genome")
        if not genome:
            errors.append("Missing required parameter: reference_genome")
        elif genome not in RNASEQ_GENOME_CONFIG:
            errors.append(
                f"Unsupported reference genome '{genome}'. "
                f"Supported: {', '.join(RNASEQ_GENOME_CONFIG.keys())}"
            )

        source = params.get("quantification_source", "salmon")
        if source not in ("salmon", "featurecounts"):
            errors.append(
                f"Invalid quantification_source '{source}'. Must be 'salmon' or 'featurecounts'"
            )

        if source == "featurecounts" and not params.get("count_matrix_path"):
            errors.append("featureCounts source requires 'count_matrix_path' parameter")

        samples = params.get("samples")
        if not samples:
            errors.append("Missing required parameter: samples (must be non-empty list)")
        else:
            conditions_set: set[str] = set()
            for i, s in enumerate(samples):
                if "reaction_id" not in s:
                    errors.append(f"samples[{i}]: missing 'reaction_id'")
                if "short_name" not in s:
                    errors.append(f"samples[{i}]: missing 'short_name'")

                cond = s.get("condition")
                if not cond:
                    errors.append(f"samples[{i}]: missing 'condition'")
                elif not _CONDITION_RE.match(cond):
                    errors.append(
                        f"samples[{i}]: condition '{cond}' contains invalid characters "
                        "(use alphanumeric and underscores only)"
                    )
                else:
                    conditions_set.add(cond)

                if "replicate" not in s:
                    errors.append(f"samples[{i}]: missing 'replicate'")

                if source == "salmon" and not s.get("salmon_quant_path"):
                    errors.append(f"samples[{i}]: missing 'salmon_quant_path'")

            # Check at least 2 conditions with 2 replicates each
            if samples:
                conditions_count: dict[str, int] = {}
                for s in samples:
                    cond = s.get("condition", "")
                    conditions_count[cond] = conditions_count.get(cond, 0) + 1
                valid = {c: n for c, n in conditions_count.items() if n >= 2}
                if len(valid) < 2:
                    errors.append(
                        "DE analysis requires at least 2 conditions with at least 2 replicates each"
                    )

        # Validate reference_condition if provided
        ref_cond = params.get("reference_condition")
        if ref_cond and samples:
            all_conditions = {s.get("condition", "") for s in samples}
            if ref_cond not in all_conditions:
                errors.append(
                    f"reference_condition '{ref_cond}' is not among the sample "
                    f"conditions: {sorted(all_conditions)}"
                )

        # Real-mode checks
        if errors:
            return errors
        if settings.PIPELINE_MODE != "mock":
            if not shutil.which("Rscript"):
                errors.append("Rscript not found in PATH")
            if genome and genome in RNASEQ_GENOME_CONFIG:
                gtf = _resolve_gtf(genome)
                if not gtf.exists():
                    errors.append(f"GTF annotation not found: {gtf}")

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
        samples = params["samples"]
        genome = params["reference_genome"]
        source = params.get("quantification_source", "salmon")
        ref_cond = params.get("reference_condition", "")

        results_dir = job_dir / "results"
        plots_dir = job_dir / "plots"
        logs_dir = job_dir / "logs"
        for d in [results_dir, plots_dir, logs_dir]:
            d.mkdir(parents=True, exist_ok=True)

        master_log = logs_dir / "rnaseq_de.log"
        rel_job = f"projects/{project_id}/{experiment_id}/jobs/{job_id}"

        conditions = sorted({s["condition"] for s in samples})
        append_to_master_log(
            master_log,
            f"RNA-seq DE analysis job {job_id} started",
            f"Source: {source}\nSamples: {len(samples)}\n"
            f"Conditions: {conditions}\nGenome: {genome}",
        )

        # Write sample metadata CSV
        sample_metadata_path = job_dir / "sample_metadata.csv"
        with open(sample_metadata_path, "w", newline="") as f:
            if source == "salmon":
                writer = csv.DictWriter(
                    f, fieldnames=["sample_id", "condition", "replicate", "quant_path"]
                )
                writer.writeheader()
                for s in samples:
                    abs_path = Path(settings.STORAGE_ROOT) / s["salmon_quant_path"]
                    writer.writerow(
                        {
                            "sample_id": s["short_name"],
                            "condition": s["condition"],
                            "replicate": s["replicate"],
                            "quant_path": str(abs_path),
                        }
                    )
            else:
                writer = csv.DictWriter(f, fieldnames=["sample_id", "condition", "replicate"])
                writer.writeheader()
                for s in samples:
                    writer.writerow(
                        {
                            "sample_id": s["short_name"],
                            "condition": s["condition"],
                            "replicate": s["replicate"],
                        }
                    )

        append_to_master_log(
            master_log, "Sample metadata written", sample_metadata_path.read_text()
        )

        # Select R script and build command
        script_path = _SCRIPTS_DIR / _SCRIPT_MAP[source]
        if not script_path.exists():
            raise PipelineError(f"R script not found: {script_path}")

        if source == "salmon":
            # Generate tx2gene mapping from GTF
            tx2gene_path = job_dir / "tx2gene.tsv"
            _generate_tx2gene(_resolve_gtf(genome), tx2gene_path)
            append_to_master_log(master_log, "tx2gene generated", str(tx2gene_path))

            cmd = [
                "Rscript",
                str(script_path),
                str(sample_metadata_path),
                str(tx2gene_path),
                str(results_dir),
                str(plots_dir),
                ref_cond,
            ]
        else:
            count_matrix_abs = Path(settings.STORAGE_ROOT) / params["count_matrix_path"]
            if not count_matrix_abs.exists():
                raise PipelineError(f"Count matrix not found: {count_matrix_abs}")
            cmd = [
                "Rscript",
                str(script_path),
                str(sample_metadata_path),
                str(count_matrix_abs),
                str(results_dir),
                str(plots_dir),
                ref_cond,
            ]

        run_cmd(
            cmd,
            log_path=logs_dir / "rscript_output.log",
            timeout=14400,
            cwd=job_dir,
            master_log=master_log,
            cancelled=cancelled,
        )

        # Scan and register outputs
        outputs: list[dict] = []

        # Results TSV
        results_tsv = results_dir / "de_results.tsv"
        if results_tsv.exists():
            outputs.append(
                {
                    "file_category": "de_results",
                    "filename": results_tsv.name,
                    "file_path": f"{rel_job}/results/{results_tsv.name}",
                    "file_type": "tsv",
                    "file_size_bytes": results_tsv.stat().st_size,
                    "reaction_id": None,
                }
            )

        # Normalized counts CSV
        counts_csv = results_dir / "normalized_counts.csv"
        if counts_csv.exists():
            outputs.append(
                {
                    "file_category": "normalized_counts",
                    "filename": counts_csv.name,
                    "file_path": f"{rel_job}/results/{counts_csv.name}",
                    "file_type": "csv",
                    "file_size_bytes": counts_csv.stat().st_size,
                    "reaction_id": None,
                }
            )

        # DE summary JSON
        summary_json = results_dir / "de_summary.json"
        if summary_json.exists():
            outputs.append(
                {
                    "file_category": "de_summary",
                    "filename": summary_json.name,
                    "file_path": f"{rel_job}/results/{summary_json.name}",
                    "file_type": "json",
                    "file_size_bytes": summary_json.stat().st_size,
                    "reaction_id": None,
                }
            )

        # Plot files (PNG + SVG pairs)
        for plot_name in _PLOT_TYPES:
            category = _PLOT_CATEGORY_MAP[plot_name]
            for ext in ("png", "svg"):
                plot_file = plots_dir / f"{plot_name}.{ext}"
                if plot_file.exists():
                    outputs.append(
                        {
                            "file_category": category,
                            "filename": plot_file.name,
                            "file_path": f"{rel_job}/plots/{plot_file.name}",
                            "file_type": ext,
                            "file_size_bytes": plot_file.stat().st_size,
                            "reaction_id": None,
                        }
                    )

        # Sample metadata as output
        outputs.append(
            {
                "file_category": "de_sample_sheet",
                "filename": sample_metadata_path.name,
                "file_path": f"{rel_job}/{sample_metadata_path.name}",
                "file_type": "csv",
                "file_size_bytes": sample_metadata_path.stat().st_size,
                "reaction_id": None,
            }
        )

        # Log files
        for log_file in [master_log, logs_dir / "rscript_output.log"]:
            if log_file.exists():
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
            "message": f"DE analysis complete ({source}, {len(samples)} samples)",
            "outputs": outputs,
            "methods_text": self.generate_methods_text(params),
        }

    def mock_run(self, job_id: int, params: dict, working_dir: Path, job_dir: Path) -> dict:
        """Create realistic stub files for the file browser and download."""
        samples = params.get("samples", [])
        project_id = params.get("project_id", 0)
        experiment_id = params.get("experiment_id", 0)
        rel_job = f"projects/{project_id}/{experiment_id}/jobs/{job_id}"

        results_dir = job_dir / "results"
        plots_dir = job_dir / "plots"
        logs_dir = job_dir / "logs"
        for d in [results_dir, plots_dir, logs_dir]:
            d.mkdir(parents=True, exist_ok=True)

        master_log = logs_dir / "rnaseq_de.log"
        outputs: list[dict] = []

        time.sleep(2)

        # Stub results.tsv
        results_tsv = results_dir / "de_results.tsv"
        with open(results_tsv, "w", newline="") as f:
            writer = csv.writer(f, delimiter="\t")
            writer.writerow(_RESULTS_HEADER)
            for row in _MOCK_GENES:
                writer.writerow(row)
        outputs.append(
            {
                "file_category": "de_results",
                "filename": results_tsv.name,
                "file_path": f"{rel_job}/results/{results_tsv.name}",
                "file_type": "tsv",
                "file_size_bytes": results_tsv.stat().st_size,
                "reaction_id": None,
            }
        )

        # Stub normalized_counts.csv
        counts_csv = results_dir / "normalized_counts.csv"
        with open(counts_csv, "w", newline="") as f:
            writer = csv.writer(f)
            sample_names = [s["short_name"] for s in samples]
            writer.writerow(["gene_id"] + sample_names)
            for gene in _MOCK_GENES:
                counts = [round(gene[2] * (0.8 + 0.4 * i), 1) for i in range(len(samples))]
                writer.writerow([gene[1]] + counts)
        outputs.append(
            {
                "file_category": "normalized_counts",
                "filename": counts_csv.name,
                "file_path": f"{rel_job}/results/{counts_csv.name}",
                "file_type": "csv",
                "file_size_bytes": counts_csv.stat().st_size,
                "reaction_id": None,
            }
        )

        # Stub summary.json
        summary = {
            "total_genes": len(_MOCK_GENES),
            "upregulated": sum(1 for g in _MOCK_GENES if g[3] > 0 and g[7] < 0.05),
            "downregulated": sum(1 for g in _MOCK_GENES if g[3] < 0 and g[7] < 0.05),
            "not_significant": sum(1 for g in _MOCK_GENES if g[7] >= 0.05),
            "fdr_threshold": 0.05,
        }
        summary_json = results_dir / "de_summary.json"
        summary_json.write_text(json.dumps(summary, indent=2))
        outputs.append(
            {
                "file_category": "de_summary",
                "filename": summary_json.name,
                "file_path": f"{rel_job}/results/{summary_json.name}",
                "file_type": "json",
                "file_size_bytes": summary_json.stat().st_size,
                "reaction_id": None,
            }
        )

        # Stub plot files (PNG + SVG pairs)
        for plot_name in _PLOT_TYPES:
            category = _PLOT_CATEGORY_MAP[plot_name]
            for ext in ("png", "svg"):
                plot_file = plots_dir / f"{plot_name}.{ext}"
                if ext == "png":
                    plot_file.write_bytes(_STUB_PNG)
                else:
                    plot_file.write_text(
                        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">'
                        f'<text x="10" y="50">Mock {plot_name}</text></svg>'
                    )
                outputs.append(
                    {
                        "file_category": category,
                        "filename": plot_file.name,
                        "file_path": f"{rel_job}/plots/{plot_file.name}",
                        "file_type": ext,
                        "file_size_bytes": plot_file.stat().st_size,
                        "reaction_id": None,
                    }
                )

        # Stub sample metadata CSV
        sample_metadata_path = job_dir / "sample_metadata.csv"
        with open(sample_metadata_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["sample_id", "condition", "replicate"])
            writer.writeheader()
            for s in samples:
                writer.writerow(
                    {
                        "sample_id": s["short_name"],
                        "condition": s["condition"],
                        "replicate": s["replicate"],
                    }
                )
        outputs.append(
            {
                "file_category": "de_sample_sheet",
                "filename": sample_metadata_path.name,
                "file_path": f"{rel_job}/{sample_metadata_path.name}",
                "file_type": "csv",
                "file_size_bytes": sample_metadata_path.stat().st_size,
                "reaction_id": None,
            }
        )

        # Master log
        append_to_master_log(
            master_log,
            "RNA-seq DE analysis (mock)",
            f"Samples: {len(samples)}\n"
            f"Conditions: {set(s['condition'] for s in samples)}\n"
            f"Mock results: {summary['upregulated']} up, "
            f"{summary['downregulated']} down, "
            f"{summary['not_significant']} NS",
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
            "message": f"Mock DE analysis completed for {len(samples)} samples",
            "outputs": outputs,
            "methods_text": self.generate_methods_text(params),
        }

    def generate_methods_text(self, params: dict) -> str:
        return rnaseq_de_methods(params)
