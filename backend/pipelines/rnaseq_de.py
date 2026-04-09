# backend/pipelines/rnaseq_de.py
"""RNA-seq differential expression analysis — DESeq2 via tximport (Salmon).

Stub stage for Phase B auto-pipeline integration. Validates params and runs
in mock mode. Phase C will implement the real run() with DESeq2 R scripts.
"""

import csv
import json
import time
from collections.abc import Callable
from pathlib import Path

import structlog

from pipelines.base import PipelineError, PipelineStage, append_to_master_log

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


class RnaseqDEStage(PipelineStage):
    """DESeq2 differential expression via Salmon + tximport.

    Phase C will implement the real run() with R subprocess calls.
    Mock mode creates realistic stub output files.
    """

    def validate(self, params: dict) -> list[str]:
        errors: list[str] = []
        if "experiment_id" not in params:
            errors.append("Missing required parameter: experiment_id")
        if "project_id" not in params:
            errors.append("Missing required parameter: project_id")
        if "reference_genome" not in params:
            errors.append("Missing required parameter: reference_genome")

        samples = params.get("samples")
        if not samples:
            errors.append("Missing required parameter: samples (must be non-empty list)")
        else:
            for i, s in enumerate(samples):
                if "reaction_id" not in s:
                    errors.append(f"samples[{i}]: missing 'reaction_id'")
                if "short_name" not in s:
                    errors.append(f"samples[{i}]: missing 'short_name'")
                if "condition" not in s:
                    errors.append(f"samples[{i}]: missing 'condition'")
                if "replicate" not in s:
                    errors.append(f"samples[{i}]: missing 'replicate'")

            # Check at least 2 conditions with 2 replicates each
            if samples:
                conditions: dict[str, int] = {}
                for s in samples:
                    cond = s.get("condition", "")
                    conditions[cond] = conditions.get(cond, 0) + 1
                valid = {c: n for c, n in conditions.items() if n >= 2}
                if len(valid) < 2:
                    errors.append(
                        "DE analysis requires at least 2 conditions with at least 2 replicates each"
                    )

        return errors

    def run(
        self,
        job_id: int,
        params: dict,
        working_dir: Path,
        job_dir: Path,
        cancelled: Callable[[], bool] | None = None,
    ) -> dict:
        raise PipelineError(
            "DESeq2 differential expression is not yet implemented. "
            "Use PIPELINE_MODE=mock for testing, or run DE analysis manually. "
            "Full implementation will be available in Phase C."
        )

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

        # Stub plot files (empty PNGs)
        for plot_name, category in [
            ("volcano.png", "volcano_plot"),
            ("ma_plot.png", "ma_plot"),
            ("pca.png", "pca_plot"),
            ("sample_distance.png", "distance_heatmap"),
            ("top_genes_heatmap.png", "gene_heatmap"),
        ]:
            plot_path = plots_dir / plot_name
            plot_path.write_bytes(b"")
            outputs.append(
                {
                    "file_category": category,
                    "filename": plot_name,
                    "file_path": f"{rel_job}/plots/{plot_name}",
                    "file_type": "png",
                    "file_size_bytes": 0,
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
        genome = params.get("reference_genome", "unknown")
        source = params.get("quantification_source", "salmon")
        samples = params.get("samples", [])
        conditions = sorted(set(s.get("condition", "") for s in samples))

        text = "Differential expression analysis was performed using DESeq2 (Love et al., 2014). "
        if source == "salmon":
            text += (
                "Transcript-level abundance estimates from Salmon were imported "
                "to gene-level counts using tximport (Soneson et al., 2015). "
            )
        text += (
            f"The design formula ~condition was used to test for differential "
            f"expression between {' and '.join(conditions)}. "
            f"Genes with an adjusted p-value (Benjamini-Hochberg) < 0.05 were "
            f"considered significantly differentially expressed. "
            f"Reference genome: {genome}."
        )
        return text
