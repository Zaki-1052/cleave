# backend/pipelines/rnaseq_alignment.py
"""RNA-seq alignment pipeline — STAR + Salmon quantification + BigWig generation.

Reference scripts (MANDATORY compliance per CLAUDE.md):
  - references/archival/rnaseq/mouse/align_reads.sh       (STAR alignment flags)
  - references/archival/rnaseq/mouse/salmon_quant2.sh      (Salmon quant flags)
  - references/archival/rnaseq/mouse/create_bw.sh          (bamCoverage, improved w/ RPKM)
  - references/archival/rnaseq/mouse/create_index.sh       (index params — sjdbOverhang 101)
  - references/archival/rnaseq/human/new_align_reads.sh    (human STAR alignment)
  - references/archival/rnaseq/human/create_index.sh       (human index — gencode v29)
"""

import csv
import io
import json
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
    resolve_fastq_paths,
    run_cmd,
)
from pipelines.methods_text import EFFECTIVE_GENOME_SIZES, rnaseq_alignment_methods

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# RNA-SEQ GENOME INDEX CONFIGURATION
#
# TODO(genome-versions): When updating genome annotation versions:
#   1. Rebuild STAR + Salmon indices on EC2 with the new GTF
#   2. Update "gtf_filename" below to match the new GTF
#   3. Update RNASEQ_ANNOTATION_VERSIONS in methods_text.py to match
#      (that dict controls the version string in auto-generated methods text)
#   4. Optionally update "star_index_subdir" / "salmon_index_subdir" if the
#      new indices live under a different directory name
#
# Current versions (from lab reference scripts):
#   Mouse mm10: gencode.vM10 — references/archival/rnaseq/mouse/create_index.sh
#   Human hg38: gencode.v29  — references/archival/rnaseq/human/create_index.sh
#
# Index root directories are in config.py:
#   STAR_INDEX_DIR   (default /data/cleave/genomes/star)
#   SALMON_INDEX_DIR (default /data/cleave/genomes/salmon)
# ---------------------------------------------------------------------------

RNASEQ_GENOME_CONFIG: dict[str, dict[str, str]] = {
    "mm10": {
        "star_index_subdir": "mm10",  # → {STAR_INDEX_DIR}/mm10/
        "salmon_index_subdir": "mm10",  # → {SALMON_INDEX_DIR}/mm10/
        "gtf_filename": "gencode.vM10.annotation.gtf",  # TODO(genome-versions)
    },
    "hg38": {
        "star_index_subdir": "hg38",  # → {STAR_INDEX_DIR}/hg38/
        "salmon_index_subdir": "hg38",  # → {SALMON_INDEX_DIR}/hg38/
        "gtf_filename": "gencode.v29.annotation.gtf",  # TODO(genome-versions)
    },
}

# QC CSV column headers for RNA-seq alignment
_QC_CSV_HEADERS = [
    "Short_Name",
    "Total_Input_Reads",
    "Uniquely_Mapped_Reads",
    "Unique_Mapping_Rate(%)",
    "Multi_Mapped_Rate(%)",
    "Unmapped_Rate(%)",
    "Average_Mapped_Length",
    "Num_Splices",
    "Num_Splices_Annotated",
    "Num_Splices_GT_AG",
    "Num_Splices_GC_AG",
    "Num_Splices_AT_AC",
    "Num_Splices_Non_Canonical",
    "Mismatch_Rate(%)",
    "Salmon_Mapping_Rate(%)",
    "Salmon_Library_Type",
    "Salmon_Num_Processed",
    "Salmon_Frag_Length_Mean",
    "Salmon_Frag_Length_SD",
]


# ---------------------------------------------------------------------------
# Helpers — STAR log and Salmon meta parsers
# ---------------------------------------------------------------------------


def _parse_star_log(log_path: Path) -> dict:
    """Extract alignment stats from STAR Log.final.out.

    STAR Log.final.out format is tab-separated with '|' delimiter:
        Uniquely mapped reads number |\\t9435272
        Uniquely mapped reads % |\\t94.35%
    """
    result = {
        "total_input_reads": 0,
        "uniquely_mapped_reads": 0,
        "unique_mapping_rate": 0.0,
        "multi_mapped_rate": 0.0,
        "unmapped_rate": 0.0,
        "average_mapped_length": 0.0,
        "num_splices": 0,
        "num_splices_annotated": 0,
        "num_splices_gt_ag": 0,
        "num_splices_gc_ag": 0,
        "num_splices_at_ac": 0,
        "num_splices_non_canonical": 0,
        "mismatch_rate": 0.0,
    }

    if not log_path.exists():
        logger.warning("rnaseq_alignment.star_log_missing", path=str(log_path))
        return result

    text = log_path.read_text()

    def _extract_int(pattern: str) -> int:
        m = re.search(pattern + r"\s*\|\s*(\d+)", text)
        return int(m.group(1)) if m else 0

    def _extract_float(pattern: str) -> float:
        m = re.search(pattern + r"\s*\|\s*([\d.]+)%?", text)
        return float(m.group(1)) if m else 0.0

    result["total_input_reads"] = _extract_int(r"Number of input reads")
    result["uniquely_mapped_reads"] = _extract_int(r"Uniquely mapped reads number")
    result["unique_mapping_rate"] = _extract_float(r"Uniquely mapped reads %")
    result["average_mapped_length"] = _extract_float(r"Average mapped length")
    result["num_splices"] = _extract_int(r"Number of splices:\s*Total")
    result["num_splices_annotated"] = _extract_int(r"Number of splices:\s*Annotated \(sjdb\)")
    result["num_splices_gt_ag"] = _extract_int(r"Number of splices:\s*GT/AG")
    result["num_splices_gc_ag"] = _extract_int(r"Number of splices:\s*GC/AG")
    result["num_splices_at_ac"] = _extract_int(r"Number of splices:\s*AT/AC")
    result["num_splices_non_canonical"] = _extract_int(r"Number of splices:\s*Non-canonical")
    result["mismatch_rate"] = _extract_float(r"Mismatch rate per base, %")

    # Multi-mapped: sum of "multiple loci" and "too many loci"
    multi_loci = _extract_float(r"% of reads mapped to multiple loci")
    too_many_loci = _extract_float(r"% of reads mapped to too many loci")
    result["multi_mapped_rate"] = round(multi_loci + too_many_loci, 2)

    # Unmapped: sum of all unmapped categories
    unmapped_mismatch = _extract_float(r"% of reads unmapped: too many mismatches")
    unmapped_short = _extract_float(r"% of reads unmapped: too short")
    unmapped_other = _extract_float(r"% of reads unmapped: other")
    result["unmapped_rate"] = round(unmapped_mismatch + unmapped_short + unmapped_other, 2)

    return result


def _parse_salmon_meta(meta_path: Path) -> dict:
    """Extract quantification stats from Salmon aux_info/meta_info.json."""
    result = {
        "salmon_mapping_rate": 0.0,
        "salmon_library_type": "unknown",
        "salmon_num_processed": 0,
        "salmon_frag_length_mean": 0.0,
        "salmon_frag_length_sd": 0.0,
    }

    if not meta_path.exists():
        logger.warning("rnaseq_alignment.salmon_meta_missing", path=str(meta_path))
        return result

    data = json.loads(meta_path.read_text())

    # Mapping rate: 'percent_mapped' (float 0-100) or 'mapping_rate' (float 0-1)
    if "percent_mapped" in data:
        result["salmon_mapping_rate"] = round(float(data["percent_mapped"]), 2)
    elif "mapping_rate" in data:
        result["salmon_mapping_rate"] = round(float(data["mapping_rate"]) * 100, 2)

    # Library type: list of detected types
    lib_types = data.get("library_types", [])
    result["salmon_library_type"] = lib_types[0] if lib_types else "unknown"

    result["salmon_num_processed"] = int(data.get("num_processed", 0))
    result["salmon_frag_length_mean"] = round(float(data.get("frag_length_mean", 0.0)), 2)
    result["salmon_frag_length_sd"] = round(float(data.get("frag_length_sd", 0.0)), 2)

    return result


def _write_rnaseq_qc_csv(metrics_list: list[dict], output_path: Path) -> None:
    """Write RNA-seq alignment QC metrics to CSV."""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=_QC_CSV_HEADERS)
    writer.writeheader()
    for m in metrics_list:
        writer.writerow(
            {
                "Short_Name": m["short_name"],
                "Total_Input_Reads": m["total_input_reads"],
                "Uniquely_Mapped_Reads": m["uniquely_mapped_reads"],
                "Unique_Mapping_Rate(%)": round(m["unique_mapping_rate"], 2),
                "Multi_Mapped_Rate(%)": round(m["multi_mapped_rate"], 2),
                "Unmapped_Rate(%)": round(m["unmapped_rate"], 2),
                "Average_Mapped_Length": round(m["average_mapped_length"], 2),
                "Num_Splices": m["num_splices"],
                "Num_Splices_Annotated": m["num_splices_annotated"],
                "Num_Splices_GT_AG": m["num_splices_gt_ag"],
                "Num_Splices_GC_AG": m["num_splices_gc_ag"],
                "Num_Splices_AT_AC": m["num_splices_at_ac"],
                "Num_Splices_Non_Canonical": m["num_splices_non_canonical"],
                "Mismatch_Rate(%)": round(m["mismatch_rate"], 2),
                "Salmon_Mapping_Rate(%)": round(m["salmon_mapping_rate"], 2),
                "Salmon_Library_Type": m["salmon_library_type"],
                "Salmon_Num_Processed": m["salmon_num_processed"],
                "Salmon_Frag_Length_Mean": round(m["salmon_frag_length_mean"], 2),
                "Salmon_Frag_Length_SD": round(m["salmon_frag_length_sd"], 2),
            }
        )
    output_path.write_text(buf.getvalue())


def _resolve_star_bin() -> str:
    """Locate STAR binary on PATH."""
    star_bin = shutil.which("STAR")
    if star_bin:
        return star_bin
    raise PipelineError(
        "STAR not found. Install via conda (conda install -c bioconda star) "
        "or ensure 'STAR' is on PATH."
    )


def _resolve_salmon_bin() -> str:
    """Locate salmon binary on PATH."""
    salmon_bin = shutil.which("salmon")
    if salmon_bin:
        return salmon_bin
    raise PipelineError(
        "salmon not found. Install via conda (conda install -c bioconda salmon) "
        "or ensure 'salmon' is on PATH."
    )


def _resolve_star_index(genome: str) -> str:
    """Resolve STAR index directory for the given genome."""
    genome_cfg = RNASEQ_GENOME_CONFIG.get(genome)
    if not genome_cfg:
        raise PipelineError(
            f"No RNA-seq genome configuration for '{genome}'. "
            f"Supported genomes: {', '.join(RNASEQ_GENOME_CONFIG.keys())}"
        )
    index_dir = Path(settings.STAR_INDEX_DIR) / genome_cfg["star_index_subdir"]
    return str(index_dir)


def _resolve_salmon_index(genome: str) -> str:
    """Resolve Salmon index directory for the given genome."""
    genome_cfg = RNASEQ_GENOME_CONFIG.get(genome)
    if not genome_cfg:
        raise PipelineError(
            f"No RNA-seq genome configuration for '{genome}'. "
            f"Supported genomes: {', '.join(RNASEQ_GENOME_CONFIG.keys())}"
        )
    index_dir = Path(settings.SALMON_INDEX_DIR) / genome_cfg["salmon_index_subdir"]
    return str(index_dir)


# ---------------------------------------------------------------------------
# Concurrent reaction processing — shared immutable context
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class _RnaseqAlignmentContext:
    """Immutable config shared across concurrent reaction threads."""

    star_bin: str
    samtools: str
    salmon_bin: str
    bam_coverage: str | None
    genome: str
    star_index: str
    salmon_index: str
    eff_genome_size: int
    threads: int
    remove_dups: bool
    bin_size: int
    smoothed_bin_size: int
    bams_dir: Path
    bigwigs_dir: Path
    salmon_dir: Path
    qc_dir: Path
    logs_dir: Path
    job_dir: Path
    rel_job: str
    cancelled: Callable[[], bool] | None
    job_id: int


def _process_reaction(rxn: dict, ctx: _RnaseqAlignmentContext, reaction_log: Path) -> dict:
    """Process a single reaction through STAR + Salmon + BigWig pipeline.

    Thread-safe: writes only to reaction-specific files and its own log.
    Returns {"metrics": dict, "outputs": list[dict]}.
    """
    short_name = rxn["short_name"]
    reaction_id = rxn["reaction_id"]
    r1_abs, r2_abs = resolve_fastq_paths(rxn, settings.STORAGE_ROOT)

    if not r1_abs.exists():
        raise PipelineError(f"R1 FASTQ not found: {r1_abs}")
    if not r2_abs.exists():
        raise PipelineError(f"R2 FASTQ not found: {r2_abs}")

    logger.info(
        "rnaseq_alignment.reaction_start",
        job_id=ctx.job_id,
        short_name=short_name,
    )

    def _run(cmd, **kwargs):
        return run_cmd(cmd, master_log=reaction_log, cancelled=ctx.cancelled, **kwargs)

    outputs: list[dict] = []

    def _add_output(path: Path, category: str, ftype: str, rid: int | None = reaction_id) -> None:
        if path.exists():
            outputs.append(
                {
                    "file_category": category,
                    "filename": path.name,
                    "file_path": f"{ctx.rel_job}/{path.relative_to(ctx.job_dir)}",
                    "file_type": ftype,
                    "file_size_bytes": path.stat().st_size,
                    "reaction_id": rid,
                }
            )

    # ---- Step 1: STAR alignment ----
    # Reference: references/archival/rnaseq/mouse/align_reads.sh
    # STAR --runThreadN 15 --genomeDir <index> --readFilesIn <R1> <R2>
    #   --outFileNamePrefix <prefix> --outSAMtype BAM SortedByCoordinate
    #   --quantMode TranscriptomeSAM
    # Improvement: --readFilesCommand zcat handles .gz natively (reference
    # scripts manually gunzip/gzip — see new_align_reads.sh lines 10-16)
    star_prefix = str(ctx.bams_dir / short_name)
    star_cmd = [
        ctx.star_bin,
        "--runThreadN",
        str(ctx.threads),
        "--genomeDir",
        ctx.star_index,
        "--readFilesIn",
        str(r1_abs),
        str(r2_abs),
        "--readFilesCommand",
        "zcat",
        "--outSAMtype",
        "BAM",
        "SortedByCoordinate",
        "--quantMode",
        "TranscriptomeSAM",
        "--outFileNamePrefix",
        star_prefix,
    ]

    _run(star_cmd, timeout=7200)

    # STAR output file paths (STAR appends these suffixes to the prefix)
    sorted_bam = Path(f"{star_prefix}Aligned.sortedByCoord.out.bam")
    transcriptome_bam = Path(f"{star_prefix}Aligned.toTranscriptome.out.bam")
    star_log_final = Path(f"{star_prefix}Log.final.out")

    if not sorted_bam.exists():
        raise PipelineError(f"STAR sorted BAM not found: {sorted_bam}")

    # ---- Step 2: samtools index ----
    # Reference: references/archival/rnaseq/mouse/create_bw.sh line 14
    _run([ctx.samtools, "index", str(sorted_bam)])
    bam_index = Path(f"{sorted_bam}.bai")

    # ---- Step 3: Duplicate removal (optional, default OFF for RNA-seq) ----
    final_bam = sorted_bam
    if ctx.remove_dups:
        dedup_bam = Path(f"{star_prefix}_dedup.bam")
        _run(
            [ctx.samtools, "view", "-bh", "-F", "1024", str(sorted_bam), "-o", str(dedup_bam)],
        )
        _run([ctx.samtools, "index", str(dedup_bam)])
        final_bam = dedup_bam
        bam_index = Path(f"{dedup_bam}.bai")

    # ---- Step 4: Salmon quantification ----
    # Reference: references/archival/rnaseq/mouse/salmon_quant2.sh
    # salmon quant -i vM10_index/ --libType A -1 <R1.fq.gz> -2 <R2.fq.gz>
    #   -p 13 --gcBias --validateMappings -o <output_dir>
    salmon_out = ctx.salmon_dir / short_name
    salmon_cmd = [
        ctx.salmon_bin,
        "quant",
        "-i",
        ctx.salmon_index,
        "--libType",
        "A",
        "-1",
        str(r1_abs),
        "-2",
        str(r2_abs),
        "-p",
        str(ctx.threads),
        "--gcBias",
        "--validateMappings",
        "-o",
        str(salmon_out),
    ]
    _run(salmon_cmd, timeout=3600)

    # ---- Step 5: bamCoverage (unsmoothed bigWig) ----
    # Reference: references/archival/rnaseq/mouse/create_bw.sh line 15
    # (reference uses bare bamCoverage -b -o; we add RPKM normalization
    # to match the CUT&RUN pipeline standard and RNASEQ-PLAN.md spec)
    unsmoothed_bw = ctx.bigwigs_dir / f"{short_name}.bw"
    if ctx.bam_coverage:
        bw_cmd = [
            ctx.bam_coverage,
            "-b",
            str(final_bam),
            "-o",
            str(unsmoothed_bw),
            "--binSize",
            str(ctx.bin_size),
            "--normalizeUsing",
            "RPKM",
            "--effectiveGenomeSize",
            str(ctx.eff_genome_size),
        ]
        _run(bw_cmd, timeout=3600)
    else:
        logger.warning("rnaseq_alignment.no_bamcoverage", short_name=short_name)

    # ---- Step 6: bamCoverage (smoothed bigWig) ----
    smoothed_bw = ctx.bigwigs_dir / f"{short_name}_smoothed.bw"
    if ctx.bam_coverage:
        bw_smooth_cmd = [
            ctx.bam_coverage,
            "-b",
            str(final_bam),
            "-o",
            str(smoothed_bw),
            "--binSize",
            str(ctx.smoothed_bin_size),
            "--normalizeUsing",
            "RPKM",
            "--effectiveGenomeSize",
            str(ctx.eff_genome_size),
        ]
        _run(bw_smooth_cmd, timeout=3600)

    # ---- Step 7: Parse QC metrics ----
    star_metrics = _parse_star_log(star_log_final)

    salmon_meta_path = salmon_out / "aux_info" / "meta_info.json"
    salmon_metrics = _parse_salmon_meta(salmon_meta_path)

    metrics = {
        "short_name": short_name,
        **star_metrics,
        **salmon_metrics,
    }

    # ---- Register outputs ----
    _add_output(final_bam, "sorted_bam", "bam")
    _add_output(bam_index, "bam_index", "bai")
    _add_output(transcriptome_bam, "transcriptome_bam", "bam")
    _add_output(unsmoothed_bw, "bigwig", "bw")
    _add_output(smoothed_bw, "smoothed_bigwig", "bw")

    # Salmon quant.sf
    quant_sf = salmon_out / "quant.sf"
    _add_output(quant_sf, "salmon_quant", "sf")

    # STAR Log.final.out
    _add_output(star_log_final, "star_log", "txt")

    # If dups were removed, also register the original STAR sorted BAM
    if ctx.remove_dups:
        _add_output(sorted_bam, "star_sorted_bam", "bam")

    logger.info(
        "rnaseq_alignment.reaction_complete",
        job_id=ctx.job_id,
        short_name=short_name,
        unique_rate=metrics["unique_mapping_rate"],
        salmon_rate=metrics["salmon_mapping_rate"],
    )

    return {"metrics": metrics, "outputs": outputs}


# ---------------------------------------------------------------------------
# Pipeline stage class
# ---------------------------------------------------------------------------


class RnaseqAlignmentStage(PipelineStage):
    """STAR alignment + Salmon quantification + BigWig generation for RNA-seq."""

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
                f"Unsupported RNA-seq reference genome: {params['reference_genome']}. "
                f"Supported: {', '.join(RNASEQ_GENOME_CONFIG.keys())}"
            )

        reactions = params.get("reactions")
        if not reactions:
            errors.append("Missing required parameter: reactions (must be non-empty list)")
        else:
            for i, rxn in enumerate(reactions):
                if "reaction_id" not in rxn:
                    errors.append(f"reactions[{i}]: missing 'reaction_id'")
                if "short_name" not in rxn:
                    errors.append(f"reactions[{i}]: missing 'short_name'")
                if "r1_path" not in rxn:
                    errors.append(f"reactions[{i}]: missing 'r1_path'")
                if "r2_path" not in rxn:
                    errors.append(f"reactions[{i}]: missing 'r2_path'")

        # Check tools and indices exist in real mode only
        if settings.PIPELINE_MODE == "real":
            for tool in ["STAR", "samtools", "salmon", "bamCoverage"]:
                if not shutil.which(tool):
                    errors.append(f"Required tool not found in PATH: {tool}")

            genome = params.get("reference_genome", "")
            if genome in RNASEQ_GENOME_CONFIG:
                cfg = RNASEQ_GENOME_CONFIG[genome]
                star_idx = Path(settings.STAR_INDEX_DIR) / cfg["star_index_subdir"]
                if not star_idx.exists():
                    errors.append(f"STAR index not found: {star_idx}")
                salmon_idx = Path(settings.SALMON_INDEX_DIR) / cfg["salmon_index_subdir"]
                if not salmon_idx.exists():
                    errors.append(f"Salmon index not found: {salmon_idx}")

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
        remove_dups = params.get("remove_duplicates", False)
        bin_size = params.get("bam_coverage_bin_size", 20)
        smoothed_bin_size = params.get("smoothed_bin_size", 100)
        total_threads = get_threads()

        # Resolve tool paths
        star_bin = _resolve_star_bin()
        samtools = shutil.which("samtools")
        if not samtools:
            raise PipelineError("samtools must be in PATH")
        salmon_bin = _resolve_salmon_bin()
        bam_coverage = shutil.which("bamCoverage")

        # Resolve genome indices
        star_index = _resolve_star_index(genome)
        salmon_index = _resolve_salmon_index(genome)

        # Create output directories
        bams_dir = job_dir / "bams"
        bigwigs_dir = job_dir / "bigwigs"
        salmon_dir = job_dir / "salmon"
        qc_dir = job_dir / "qc"
        logs_dir = job_dir / "logs"
        for d in [bams_dir, bigwigs_dir, salmon_dir, qc_dir, logs_dir]:
            d.mkdir(parents=True, exist_ok=True)

        # Master log
        master_log = logs_dir / "rnaseq_alignment.log"

        # Compute concurrency (STAR uses ~30GB RAM — limit parallel reactions)
        concurrent_count = min(settings.MAX_CONCURRENT_RNASEQ_REACTIONS, len(reactions))
        threads_per_reaction = max(2, total_threads // concurrent_count)

        eff_genome_size = EFFECTIVE_GENOME_SIZES[genome]
        project_id = params["project_id"]
        experiment_id = params["experiment_id"]
        rel_job = f"projects/{project_id}/{experiment_id}/jobs/{job_id}"

        genome_cfg = RNASEQ_GENOME_CONFIG[genome]
        gtf_name = genome_cfg.get("gtf_filename", "unknown")
        append_to_master_log(
            master_log,
            f"RNA-seq alignment job {job_id} started",
            f"Genome: {genome} (GTF: {gtf_name})\n"
            f"Reactions: {len(reactions)}\n"
            f"Remove duplicates: {remove_dups}\n"
            f"Bin size: {bin_size}\nSmoothed bin size: {smoothed_bin_size}\n"
            f"STAR index: {star_index}\nSalmon index: {salmon_index}\n"
            f"Threads: {total_threads} ({concurrent_count} concurrent × "
            f"{threads_per_reaction} threads/reaction)",
        )

        ctx = _RnaseqAlignmentContext(
            star_bin=star_bin,
            samtools=samtools,
            salmon_bin=salmon_bin,
            bam_coverage=bam_coverage,
            genome=genome,
            star_index=star_index,
            salmon_index=salmon_index,
            eff_genome_size=eff_genome_size,
            threads=threads_per_reaction,
            remove_dups=remove_dups,
            bin_size=bin_size,
            smoothed_bin_size=smoothed_bin_size,
            bams_dir=bams_dir,
            bigwigs_dir=bigwigs_dir,
            salmon_dir=salmon_dir,
            qc_dir=qc_dir,
            logs_dir=logs_dir,
            job_dir=job_dir,
            rel_job=rel_job,
            cancelled=cancelled,
            job_id=job_id,
        )

        # Per-reaction log files
        reaction_logs = {
            rxn["short_name"]: logs_dir / f"{rxn['short_name']}_pipeline.log" for rxn in reactions
        }

        # ---- Concurrent reaction dispatch ----
        results: dict[str, dict] = {}
        errors: dict[str, str] = {}

        with ThreadPoolExecutor(max_workers=concurrent_count) as executor:
            future_to_name = {
                executor.submit(
                    _process_reaction,
                    rxn,
                    ctx,
                    reaction_logs[rxn["short_name"]],
                ): rxn["short_name"]
                for rxn in reactions
            }
            for future in as_completed(future_to_name):
                name = future_to_name[future]
                try:
                    results[name] = future.result()
                except TerminatedError:
                    executor.shutdown(wait=False, cancel_futures=True)
                    raise
                except Exception as exc:
                    errors[name] = str(exc)
                    logger.error(
                        "rnaseq_alignment.reaction_failed", short_name=name, error=str(exc)
                    )

        # ---- Merge per-reaction logs into master log (original order) ----
        for rxn in reactions:
            name = rxn["short_name"]
            rxn_log = reaction_logs[name]
            if rxn_log.exists():
                content = rxn_log.read_text()
                if content.strip():
                    with open(master_log, "a") as f:
                        f.write(content)

        # ---- Aggregate results in original reaction order ----
        all_metrics: list[dict] = []
        outputs: list[dict] = []
        for rxn in reactions:
            name = rxn["short_name"]
            if name in results:
                r = results[name]
                all_metrics.append(r["metrics"])
                outputs.extend(r["outputs"])

        # ---- Handle partial failures ----
        if errors:
            error_summary = "; ".join(f"{k}: {v[:100]}" for k, v in errors.items())
            append_to_master_log(master_log, "Reaction failures", error_summary)
            if len(errors) == len(reactions):
                raise PipelineError(f"All reactions failed: {error_summary}")
            logger.warning(
                "rnaseq_alignment.partial_failure",
                failed=list(errors.keys()),
                succeeded=list(results.keys()),
            )

        # ---- Write QC CSV ----
        qc_csv = qc_dir / "rnaseq_alignment_metrics.csv"
        _write_rnaseq_qc_csv(all_metrics, qc_csv)
        outputs.append(
            {
                "file_category": "qc_report",
                "filename": qc_csv.name,
                "file_path": f"{rel_job}/qc/{qc_csv.name}",
                "file_type": "csv",
                "file_size_bytes": qc_csv.stat().st_size,
                "reaction_id": None,
            }
        )

        append_to_master_log(
            master_log,
            "RNA-seq alignment complete",
            f"Processed {len(reactions)} reactions ({len(results)} succeeded, "
            f"{len(errors)} failed), {len(all_metrics)} QC records",
        )

        # Register master log
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
            "message": f"RNA-seq alignment completed for {len(reactions)} reactions",
            "outputs": outputs,
            "methods_text": self.generate_methods_text(params),
            "qc_metrics": all_metrics,
        }

    def mock_run(self, job_id: int, params: dict, working_dir: Path, job_dir: Path) -> dict:
        """Create real stub files on disk so file browser, IGV, and downloads work."""
        reactions = params.get("reactions", [])
        project_id = params.get("project_id", 0)
        experiment_id = params.get("experiment_id", 0)
        rel_job = f"projects/{project_id}/{experiment_id}/jobs/{job_id}"

        bams_dir = job_dir / "bams"
        bigwigs_dir = job_dir / "bigwigs"
        salmon_dir = job_dir / "salmon"
        qc_dir = job_dir / "qc"
        logs_dir = job_dir / "logs"
        for d in [bams_dir, bigwigs_dir, salmon_dir, qc_dir, logs_dir]:
            d.mkdir(parents=True, exist_ok=True)

        def _mock_process_reaction(i: int, rxn: dict) -> dict:
            """Process one mock reaction. Thread-safe — no shared mutable state."""
            time.sleep(1)
            short_name = rxn["short_name"]
            reaction_id = rxn["reaction_id"]
            rxn_outputs: list[dict] = []

            # Stub STAR BAM files
            sorted_bam = bams_dir / f"{short_name}Aligned.sortedByCoord.out.bam"
            sorted_bam.write_bytes(b"")
            bam_index = bams_dir / f"{short_name}Aligned.sortedByCoord.out.bam.bai"
            bam_index.write_bytes(b"")
            transcriptome_bam = bams_dir / f"{short_name}Aligned.toTranscriptome.out.bam"
            transcriptome_bam.write_bytes(b"")

            for path, category, ftype in [
                (sorted_bam, "sorted_bam", "bam"),
                (bam_index, "bam_index", "bai"),
                (transcriptome_bam, "transcriptome_bam", "bam"),
            ]:
                rxn_outputs.append(
                    {
                        "file_category": category,
                        "filename": path.name,
                        "file_path": f"{rel_job}/{path.relative_to(job_dir)}",
                        "file_type": ftype,
                        "file_size_bytes": 0,
                        "reaction_id": reaction_id,
                    }
                )

            # Stub bigWig files
            for path, category in [
                (bigwigs_dir / f"{short_name}.bw", "bigwig"),
                (bigwigs_dir / f"{short_name}_smoothed.bw", "smoothed_bigwig"),
            ]:
                path.write_bytes(b"")
                rxn_outputs.append(
                    {
                        "file_category": category,
                        "filename": path.name,
                        "file_path": f"{rel_job}/{path.relative_to(job_dir)}",
                        "file_type": "bw",
                        "file_size_bytes": 0,
                        "reaction_id": reaction_id,
                    }
                )

            # Stub Salmon quant.sf
            salmon_out = salmon_dir / short_name
            salmon_aux = salmon_out / "aux_info"
            salmon_aux.mkdir(parents=True, exist_ok=True)

            quant_sf = salmon_out / "quant.sf"
            quant_sf.write_text(
                "Name\tLength\tEffectiveLength\tTPM\tNumReads\n"
                "ENSMUST00000000001.4\t3634\t3484.0\t12.345\t1500\n"
                "ENSMUST00000000003.11\t902\t752.0\t5.678\t500\n"
                "ENSMUST00000000028.11\t2143\t1993.0\t8.901\t800\n"
                "ENSMUST00000000049.5\t1564\t1414.0\t3.456\t300\n"
                "ENSMUST00000000058.7\t1253\t1103.0\t7.890\t600\n"
            )
            rxn_outputs.append(
                {
                    "file_category": "salmon_quant",
                    "filename": quant_sf.name,
                    "file_path": f"{rel_job}/{quant_sf.relative_to(job_dir)}",
                    "file_type": "sf",
                    "file_size_bytes": quant_sf.stat().st_size,
                    "reaction_id": reaction_id,
                }
            )

            # Stub Salmon meta_info.json
            meta_info = salmon_aux / "meta_info.json"
            meta_info.write_text(
                json.dumps(
                    {
                        "salmon_version": "1.10.0",
                        "num_processed": 10000000,
                        "num_mapped": 9250000,
                        "percent_mapped": 92.50,
                        "library_types": ["ISR"],
                        "frag_length_mean": 234.5,
                        "frag_length_sd": 48.2,
                    },
                    indent=2,
                )
            )

            # Stub STAR Log.final.out
            star_log = bams_dir / f"{short_name}Log.final.out"
            star_log.write_text(
                "                                 Started job on |\tMock\n"
                "                          Number of input reads |\t10000000\n"
                "                      Average input read length |\t202\n"
                "                   Uniquely mapped reads number |\t9435272\n"
                "                        Uniquely mapped reads % |\t94.35%\n"
                "                          Average mapped length |\t199.19\n"
                "                       Number of splices: Total |\t7218019\n"
                "            Number of splices: Annotated (sjdb) |\t6503217\n"
                "                    Number of splices: GT/AG |\t7139825\n"
                "                    Number of splices: GC/AG |\t52341\n"
                "                    Number of splices: AT/AC |\t7521\n"
                "               Number of splices: Non-canonical |\t18332\n"
                "                      Mismatch rate per base, % |\t0.22%\n"
                "             % of reads mapped to multiple loci |\t3.91%\n"
                "             % of reads mapped to too many loci |\t0.06%\n"
                "  Number of reads unmapped: too many mismatches |\t0\n"
                "       % of reads unmapped: too many mismatches |\t0.00%\n"
                "            Number of reads unmapped: too short |\t162174\n"
                "                 % of reads unmapped: too short |\t1.62%\n"
                "                Number of reads unmapped: other |\t5635\n"
                "                     % of reads unmapped: other |\t0.06%\n"
            )
            rxn_outputs.append(
                {
                    "file_category": "star_log",
                    "filename": star_log.name,
                    "file_path": f"{rel_job}/{star_log.relative_to(job_dir)}",
                    "file_type": "txt",
                    "file_size_bytes": star_log.stat().st_size,
                    "reaction_id": reaction_id,
                }
            )

            # Parse mock QC
            star_metrics = _parse_star_log(star_log)
            salmon_meta = _parse_salmon_meta(meta_info)
            metrics = {"short_name": short_name, **star_metrics, **salmon_meta}

            logger.info("rnaseq_alignment.mock_reaction_complete", short_name=short_name)
            return {"metrics": metrics, "outputs": rxn_outputs}

        # ---- Concurrent mock dispatch ----
        concurrent_count = min(settings.MAX_CONCURRENT_RNASEQ_REACTIONS, max(len(reactions), 1))
        all_metrics: list[dict] = []
        outputs: list[dict] = []

        with ThreadPoolExecutor(max_workers=concurrent_count) as executor:
            future_to_idx = {
                executor.submit(_mock_process_reaction, i, rxn): i
                for i, rxn in enumerate(reactions)
            }
            indexed_results: dict[int, dict] = {}
            for future in as_completed(future_to_idx):
                idx = future_to_idx[future]
                indexed_results[idx] = future.result()

        for i in range(len(reactions)):
            r = indexed_results[i]
            all_metrics.append(r["metrics"])
            outputs.extend(r["outputs"])

        # Write QC CSV
        qc_csv = qc_dir / "rnaseq_alignment_metrics.csv"
        _write_rnaseq_qc_csv(all_metrics, qc_csv)
        outputs.append(
            {
                "file_category": "qc_report",
                "filename": qc_csv.name,
                "file_path": f"{rel_job}/qc/{qc_csv.name}",
                "file_type": "csv",
                "file_size_bytes": qc_csv.stat().st_size,
                "reaction_id": None,
            }
        )

        return {
            "job_id": job_id,
            "status": "complete",
            "message": f"Mock RNA-seq alignment completed for {len(reactions)} reactions",
            "outputs": outputs,
            "methods_text": self.generate_methods_text(params),
            "qc_metrics": all_metrics,
        }

    def generate_methods_text(self, params: dict) -> str:
        return rnaseq_alignment_methods(params)
