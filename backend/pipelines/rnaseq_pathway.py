# backend/pipelines/rnaseq_pathway.py
"""RNA-seq pathway analysis — clusterProfiler GO enrichment + KEGG pathway.

Takes DE results TSV as input, filters genes by significance and direction,
then runs clusterProfiler in R for GO (BP/MF/CC) enrichment and KEGG
pathway analysis. Optional GSEA using the full ranked gene list.
"""

import csv
import json
import shutil
import time
from collections.abc import Callable
from pathlib import Path

import structlog

from config import settings
from pipelines.base import PipelineError, PipelineStage, append_to_master_log, run_cmd
from pipelines.methods_text import rnaseq_pathway_methods

logger = structlog.get_logger(__name__)

ORGANISM_MAP = {
    "mm10": {"code": "mmu", "org_db": "org.Mm.eg.db", "display": "Mouse (mm10)"},
    "hg38": {"code": "hsa", "org_db": "org.Hs.eg.db", "display": "Human (hg38)"},
}

_VALID_GENE_LIST_SOURCES = {"upregulated", "downregulated", "both"}

_SCRIPTS_DIR = Path(__file__).resolve().parent / "scripts"

# Minimal 1x1 transparent PNG for mock stubs
_STUB_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
    b"\r\n\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)

_PLOT_TYPES = ["go_bp", "go_mf", "go_cc", "kegg", "gsea_plot"]

_PLOT_CATEGORY_MAP = {
    "go_bp": "go_bp_plot",
    "go_mf": "go_mf_plot",
    "go_cc": "go_cc_plot",
    "kegg": "kegg_plot",
    "gsea_plot": "gsea_plot",
}

_MOCK_GO_RESULTS = [
    (
        "GO:0007399",
        "nervous system development",
        "45/312",
        "2051/21754",
        1.2e-8,
        5.6e-6,
        4.8e-6,
        "MYC/SOX2/NANOG/KLF4/POU5F1",
        45,
        "BP",
    ),
    (
        "GO:0048699",
        "generation of neurons",
        "38/312",
        "1523/21754",
        3.4e-7,
        8.1e-5,
        7.0e-5,
        "SOX2/NANOG/POU5F1",
        38,
        "BP",
    ),
    (
        "GO:0030182",
        "neuron differentiation",
        "35/312",
        "1401/21754",
        5.6e-7,
        8.9e-5,
        7.7e-5,
        "SOX2/NANOG",
        35,
        "BP",
    ),
    (
        "GO:0045944",
        "positive regulation of transcription",
        "42/312",
        "1812/21754",
        1.1e-6,
        1.3e-4,
        1.1e-4,
        "MYC/SOX2/NANOG/KLF4",
        42,
        "BP",
    ),
    (
        "GO:0003723",
        "RNA binding",
        "28/312",
        "1100/21754",
        2.3e-5,
        2.1e-3,
        1.8e-3,
        "MYC/KLF4",
        28,
        "MF",
    ),
    (
        "GO:0003677",
        "DNA binding",
        "32/312",
        "1350/21754",
        4.5e-5,
        3.2e-3,
        2.8e-3,
        "SOX2/NANOG/POU5F1",
        32,
        "MF",
    ),
    (
        "GO:0005634",
        "nucleus",
        "55/312",
        "3200/21754",
        8.9e-6,
        1.0e-3,
        8.7e-4,
        "MYC/SOX2/NANOG/KLF4/POU5F1/TRP53",
        55,
        "CC",
    ),
    (
        "GO:0005654",
        "nucleoplasm",
        "40/312",
        "2100/21754",
        3.2e-5,
        2.8e-3,
        2.4e-3,
        "MYC/SOX2/TRP53",
        40,
        "CC",
    ),
]

_MOCK_KEGG_RESULTS = [
    (
        "mmu04550",
        "Signaling pathways regulating pluripotency",
        "18/250",
        "295/8925",
        2.1e-5,
        1.8e-3,
        1.5e-3,
        "22346/74637/12396/16600",
        18,
    ),
    (
        "mmu04010",
        "MAPK signaling pathway",
        "22/250",
        "354/8925",
        4.5e-5,
        1.9e-3,
        1.6e-3,
        "22346/59552",
        22,
    ),
    (
        "mmu04151",
        "PI3K-Akt signaling pathway",
        "20/250",
        "340/8925",
        6.7e-5,
        2.2e-3,
        1.9e-3,
        "22346/59552/12396",
        20,
    ),
]

_GO_HEADER = [
    "ID",
    "Description",
    "GeneRatio",
    "BgRatio",
    "pvalue",
    "p.adjust",
    "qvalue",
    "geneID",
    "Count",
    "ontology",
]
_KEGG_HEADER = [
    "ID",
    "Description",
    "GeneRatio",
    "BgRatio",
    "pvalue",
    "p.adjust",
    "qvalue",
    "geneID",
    "Count",
]


def _filter_de_results(
    de_results_path: Path,
    fdr_threshold: float,
    gene_list_source: str,
) -> list[dict]:
    """Read DE results TSV and filter by significance + direction."""
    genes: list[dict] = []
    with open(de_results_path, newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            padj_str = row.get("padj", "")
            if not padj_str or padj_str.lower() == "na":
                continue
            try:
                padj = float(padj_str)
            except ValueError:
                continue
            if padj >= fdr_threshold:
                continue

            lfc_str = row.get("log2FoldChange", "0")
            try:
                lfc = float(lfc_str)
            except ValueError:
                lfc = 0.0

            if gene_list_source == "upregulated" and lfc <= 0:
                continue
            if gene_list_source == "downregulated" and lfc >= 0:
                continue

            genes.append(
                {
                    "gene_id": row.get("gene_id", ""),
                    "gene_name": row.get("gene_name", ""),
                    "log2FoldChange": lfc_str,
                    "padj": padj_str,
                }
            )
    return genes


class RnaseqPathwayStage(PipelineStage):
    """GO enrichment + KEGG pathway analysis via clusterProfiler."""

    def validate(self, params: dict) -> list[str]:
        errors: list[str] = []
        if "experiment_id" not in params:
            errors.append("Missing required parameter: experiment_id")
        if "project_id" not in params:
            errors.append("Missing required parameter: project_id")
        if "de_job_id" not in params:
            errors.append("Missing required parameter: de_job_id")

        genome = params.get("reference_genome")
        if not genome:
            errors.append("Missing required parameter: reference_genome")
        elif genome not in ORGANISM_MAP:
            supported = ", ".join(ORGANISM_MAP.keys())
            errors.append(
                f"Unsupported reference genome '{genome}' for pathway analysis. "
                f"Supported: {supported} (organism annotation databases required)"
            )

        source = params.get("gene_list_source", "both")
        if source not in _VALID_GENE_LIST_SOURCES:
            errors.append(
                f"Invalid gene_list_source '{source}'. "
                f"Must be one of: {', '.join(sorted(_VALID_GENE_LIST_SOURCES))}"
            )

        fdr = params.get("fdr_threshold", 0.05)
        try:
            fdr_val = float(fdr)
            if not 0 < fdr_val <= 1:
                errors.append(f"fdr_threshold must be between 0 and 1, got {fdr_val}")
        except (TypeError, ValueError):
            errors.append(f"fdr_threshold must be a number, got '{fdr}'")

        if not params.get("de_results_path"):
            errors.append("Missing required parameter: de_results_path")

        if errors:
            return errors
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
        genome = params["reference_genome"]
        organism = ORGANISM_MAP[genome]
        fdr_threshold = float(params.get("fdr_threshold", 0.05))
        gene_list_source = params.get("gene_list_source", "both")
        enable_gsea = params.get("enable_gsea", False)
        de_results_path = Path(settings.STORAGE_ROOT) / params["de_results_path"]

        rel_job = f"projects/{project_id}/{experiment_id}/jobs/{job_id}"

        results_dir = job_dir / "results"
        plots_dir = job_dir / "plots"
        logs_dir = job_dir / "logs"
        for d in [results_dir, plots_dir, logs_dir]:
            d.mkdir(parents=True, exist_ok=True)

        master_log = logs_dir / "rnaseq_pathway.log"

        append_to_master_log(
            master_log,
            "Pathway Analysis — Start",
            f"Genome: {genome}\n"
            f"Gene list source: {gene_list_source}\n"
            f"FDR threshold: {fdr_threshold}\n"
            f"GSEA enabled: {enable_gsea}\n"
            f"DE results: {de_results_path}",
        )

        if cancelled and cancelled():
            from pipelines.base import TerminatedError

            raise TerminatedError("Job cancelled before gene filtering")

        # Filter DE results
        logger.info(
            "filtering_de_results",
            de_results_path=str(de_results_path),
            fdr_threshold=fdr_threshold,
            gene_list_source=gene_list_source,
        )

        if not de_results_path.exists():
            raise PipelineError(f"DE results file not found: {de_results_path}")

        filtered_genes = _filter_de_results(de_results_path, fdr_threshold, gene_list_source)

        if not filtered_genes:
            raise PipelineError(
                f"No significant genes found at FDR < {fdr_threshold} "
                f"(source: {gene_list_source}). Try relaxing the threshold."
            )

        # Write filtered gene list
        gene_list_path = job_dir / "gene_list.tsv"
        with open(gene_list_path, "w", newline="") as f:
            writer = csv.DictWriter(
                f, fieldnames=["gene_id", "gene_name", "log2FoldChange", "padj"], delimiter="\t"
            )
            writer.writeheader()
            writer.writerows(filtered_genes)

        append_to_master_log(
            master_log,
            "Gene Filtering Complete",
            f"Filtered genes: {len(filtered_genes)} ({gene_list_source})",
        )

        logger.info("gene_list_written", genes=len(filtered_genes), path=str(gene_list_path))

        if cancelled and cancelled():
            from pipelines.base import TerminatedError

            raise TerminatedError("Job cancelled before R script")

        # Run clusterProfiler R script
        script_path = _SCRIPTS_DIR / "rnaseq_pathway.R"
        cmd = [
            "Rscript",
            str(script_path),
            str(gene_list_path),
            organism["code"],
            organism["org_db"],
            str(results_dir),
            str(plots_dir),
            str(fdr_threshold),
            str(enable_gsea).lower(),
        ]

        run_cmd(
            cmd,
            log_path=logs_dir / "rscript_output.log",
            master_log=master_log,
            step_name="clusterProfiler GO/KEGG",
            timeout=7200,
            cancelled=cancelled,
        )

        # Scan and register outputs
        outputs: list[dict] = []

        # Result CSVs
        for fname, category, ftype in [
            ("go_results.csv", "go_results", "csv"),
            ("kegg_results.csv", "kegg_results", "csv"),
            ("pathway_summary.json", "pathway_summary", "json"),
        ]:
            fpath = results_dir / fname
            if fpath.exists():
                outputs.append(
                    {
                        "file_category": category,
                        "filename": fpath.name,
                        "file_path": f"{rel_job}/results/{fpath.name}",
                        "file_type": ftype,
                        "file_size_bytes": fpath.stat().st_size,
                        "reaction_id": None,
                    }
                )

        # Plot PNGs
        for plot_name, category in _PLOT_CATEGORY_MAP.items():
            plot_file = plots_dir / f"{plot_name}.png"
            if plot_file.exists():
                outputs.append(
                    {
                        "file_category": category,
                        "filename": plot_file.name,
                        "file_path": f"{rel_job}/plots/{plot_file.name}",
                        "file_type": "png",
                        "file_size_bytes": plot_file.stat().st_size,
                        "reaction_id": None,
                    }
                )

        # Gene list input file
        outputs.append(
            {
                "file_category": "gene_list",
                "filename": gene_list_path.name,
                "file_path": f"{rel_job}/{gene_list_path.name}",
                "file_type": "tsv",
                "file_size_bytes": gene_list_path.stat().st_size,
                "reaction_id": None,
            }
        )

        # Log files
        log_categories = {master_log.name: "master_log", "rscript_output.log": "log"}
        for log_file in [master_log, logs_dir / "rscript_output.log"]:
            if log_file.exists():
                outputs.append(
                    {
                        "file_category": log_categories.get(log_file.name, "log"),
                        "filename": log_file.name,
                        "file_path": f"{rel_job}/logs/{log_file.name}",
                        "file_type": "log",
                        "file_size_bytes": log_file.stat().st_size,
                        "reaction_id": None,
                    }
                )

        return {
            "job_id": job_id,
            "status": "complete",
            "message": f"Pathway analysis complete ({len(filtered_genes)} genes)",
            "outputs": outputs,
            "methods_text": self.generate_methods_text(params),
        }

    def mock_run(self, job_id: int, params: dict, working_dir: Path, job_dir: Path) -> dict:
        """Create realistic stub files for the file browser and download."""
        project_id = params.get("project_id", 0)
        experiment_id = params.get("experiment_id", 0)
        genome = params.get("reference_genome", "mm10")
        enable_gsea = params.get("enable_gsea", False)
        rel_job = f"projects/{project_id}/{experiment_id}/jobs/{job_id}"

        results_dir = job_dir / "results"
        plots_dir = job_dir / "plots"
        logs_dir = job_dir / "logs"
        for d in [results_dir, plots_dir, logs_dir]:
            d.mkdir(parents=True, exist_ok=True)

        master_log = logs_dir / "rnaseq_pathway.log"
        outputs: list[dict] = []

        time.sleep(2)

        # Stub GO results CSV
        go_csv = results_dir / "go_results.csv"
        with open(go_csv, "w", newline="") as f:
            writer = csv.writer(f, delimiter="\t")
            writer.writerow(_GO_HEADER)
            for row in _MOCK_GO_RESULTS:
                writer.writerow(row)
        outputs.append(
            {
                "file_category": "go_results",
                "filename": go_csv.name,
                "file_path": f"{rel_job}/results/{go_csv.name}",
                "file_type": "csv",
                "file_size_bytes": go_csv.stat().st_size,
                "reaction_id": None,
            }
        )

        # Stub KEGG results CSV
        kegg_csv = results_dir / "kegg_results.csv"
        kegg_data = _MOCK_KEGG_RESULTS
        if genome == "hg38":
            kegg_data = [(r[0].replace("mmu", "hsa"), *r[1:]) for r in _MOCK_KEGG_RESULTS]
        with open(kegg_csv, "w", newline="") as f:
            writer = csv.writer(f, delimiter="\t")
            writer.writerow(_KEGG_HEADER)
            for row in kegg_data:
                writer.writerow(row)
        outputs.append(
            {
                "file_category": "kegg_results",
                "filename": kegg_csv.name,
                "file_path": f"{rel_job}/results/{kegg_csv.name}",
                "file_type": "csv",
                "file_size_bytes": kegg_csv.stat().st_size,
                "reaction_id": None,
            }
        )

        # Stub summary JSON
        bp_count = sum(1 for r in _MOCK_GO_RESULTS if r[9] == "BP")
        mf_count = sum(1 for r in _MOCK_GO_RESULTS if r[9] == "MF")
        cc_count = sum(1 for r in _MOCK_GO_RESULTS if r[9] == "CC")
        summary = {
            "total_input_genes": 312,
            "mapped_entrez_genes": 280,
            "unmapped_genes": 32,
            "go_bp_terms": bp_count,
            "go_mf_terms": mf_count,
            "go_cc_terms": cc_count,
            "kegg_pathways": len(_MOCK_KEGG_RESULTS),
            "gsea_enabled": enable_gsea,
            "gsea_terms": 5 if enable_gsea else 0,
        }
        summary_json = results_dir / "pathway_summary.json"
        summary_json.write_text(json.dumps(summary, indent=2))
        outputs.append(
            {
                "file_category": "pathway_summary",
                "filename": summary_json.name,
                "file_path": f"{rel_job}/results/{summary_json.name}",
                "file_type": "json",
                "file_size_bytes": summary_json.stat().st_size,
                "reaction_id": None,
            }
        )

        # Stub plot PNGs
        plot_names = ["go_bp", "go_mf", "go_cc", "kegg"]
        if enable_gsea:
            plot_names.append("gsea_plot")
        for plot_name in plot_names:
            category = _PLOT_CATEGORY_MAP[plot_name]
            plot_file = plots_dir / f"{plot_name}.png"
            plot_file.write_bytes(_STUB_PNG)
            outputs.append(
                {
                    "file_category": category,
                    "filename": plot_file.name,
                    "file_path": f"{rel_job}/plots/{plot_file.name}",
                    "file_type": "png",
                    "file_size_bytes": plot_file.stat().st_size,
                    "reaction_id": None,
                }
            )

        # Stub gene list TSV
        gene_list_path = job_dir / "gene_list.tsv"
        with open(gene_list_path, "w", newline="") as f:
            writer = csv.writer(f, delimiter="\t")
            writer.writerow(["gene_id", "gene_name", "log2FoldChange", "padj"])
            writer.writerow(["ENSMUSG00000022346", "Myc", "2.45", "1.4e-12"])
            writer.writerow(["ENSMUSG00000074637", "Sox2", "3.12", "1.3e-9"])
            writer.writerow(["ENSMUSG00000012396", "Nanog", "1.56", "2.8e-4"])
            writer.writerow(["ENSMUSG00000059552", "Trp53", "-1.87", "6.0e-9"])
            writer.writerow(["ENSMUSG00000024406", "Pou5f1", "-2.91", "3.5e-6"])
        outputs.append(
            {
                "file_category": "gene_list",
                "filename": gene_list_path.name,
                "file_path": f"{rel_job}/{gene_list_path.name}",
                "file_type": "tsv",
                "file_size_bytes": gene_list_path.stat().st_size,
                "reaction_id": None,
            }
        )

        # Master log
        append_to_master_log(
            master_log,
            "Pathway Analysis (mock)",
            f"GO terms: BP={bp_count}, MF={mf_count}, CC={cc_count}\n"
            f"KEGG pathways: {len(_MOCK_KEGG_RESULTS)}\n"
            f"GSEA: {'enabled' if enable_gsea else 'disabled'}",
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
            "message": "Pathway analysis complete (mock)",
            "outputs": outputs,
            "methods_text": self.generate_methods_text(params),
        }

    def generate_methods_text(self, params: dict) -> str:
        return rnaseq_pathway_methods(params)
