# backend/pipelines/alignment.py
"""Alignment pipeline — Bowtie2 + post-processing + bigWig + heatmaps.

Reference scripts (MANDATORY compliance per CLAUDE.md):
  - references/data_workdir/integrated.sh          (Bowtie2 alignment, flags)
  - references/data_workdir/aligned.aug10/integrated.step2.sh  (post-processing)
  - references/data_workdir/aligned.aug10/create_bams.sh       (bigWig generation)
  - references/cutruntools/config2.json             (mm10 index paths)
  - references/cutruntools/config_human.json        (hg38 index: GRCh38)
  - references/cutruntools/ecoli_config.json        (E. coli index)
"""

import csv
import io
import re
import shutil
import subprocess
import time
from pathlib import Path

import structlog

from config import settings
from pipelines.base import (
    PipelineError,
    PipelineStage,
    count_bam_reads,
    get_threads,
    resolve_blacklist,
    run_cmd,
    run_piped_cmd,
)
from pipelines.methods_text import EFFECTIVE_GENOME_SIZES, alignment_methods
from pipelines.spike_in_barcodes import PTM_NAMES, count_barcodes, normalize_counts

logger = structlog.get_logger(__name__)

# Bowtie2 index base names (from config2.json, config_human.json, ecoli_config.json)
BOWTIE2_INDEX_NAMES = {
    "mm10": "mm10",
    "hg38": "GRCh38",
    "hg19": "hg19",
    "dm6": "dm6",
    "sacCer3": "sacCer3",
    "ecoli": "ecoli",
}

_REFERENCE_DIR = Path(__file__).resolve().parent / "reference"
_ANNOTATIONS_DIR = _REFERENCE_DIR / "annotations"

# Canned QC data location for mock mode
_CUTANA_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "cutana" / "H3K4me3"
# In Docker the cutana dir may be at /cutana
_CUTANA_DATA_DIR_DOCKER = Path("/cutana/H3K4me3")

# QC CSV column headers matching CUTANA Cloud export format
_QC_CSV_HEADERS = [
    "Short_Name",
    "Total_Read_Pairs",
    "Aligned_Read_Pairs",
    "Uniquely_Aligned_Read_Pairs",
    "Unique_Alignment_Rate(%)",
    "Duplication_Rate(%)",
    "chrM_Bandwidth(%)",
    "Ecoli_Read_Pairs",
    "Ecoli_Alignment_Rate(%)",
    "Ecoli_Normalization_Factor",
]

# Minimal 1x1 transparent PNG (89 bytes) for mock heatmap stubs
_STUB_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01"
    b"\r\n\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def _parse_bowtie2_log(log_path: Path) -> dict:
    """Extract alignment stats from bowtie2 stderr log.

    Example bowtie2 stderr output:
        9519486 reads; of these:
          9519486 (100.00%) were paired; of these:
            398786 (4.19%) aligned concordantly 0 times
            8889064 (93.38%) aligned concordantly exactly 1 time
            231636 (2.43%) aligned concordantly >1 times
        ...
        95.81% overall alignment rate
    """
    text = log_path.read_text()
    result = {"total_reads": 0, "aligned_reads": 0, "alignment_rate": 0.0}

    # Total reads: first line "N reads; of these:"
    m = re.search(r"(\d+) reads; of these:", text)
    if m:
        result["total_reads"] = int(m.group(1))

    # Overall alignment rate
    m = re.search(r"([\d.]+)% overall alignment rate", text)
    if m:
        result["alignment_rate"] = float(m.group(1))
        result["aligned_reads"] = int(result["total_reads"] * result["alignment_rate"] / 100)

    return result


def _parse_picard_metrics(metrics_path: Path) -> float:
    """Extract duplication rate (%) from Picard MarkDuplicates metrics file.

    Picard output format: comment lines starting with #, then a header row,
    then one data row. We need the PERCENT_DUPLICATION column.
    """
    lines = metrics_path.read_text().strip().split("\n")
    header_idx = None
    for i, line in enumerate(lines):
        if line.startswith("## METRICS CLASS"):
            header_idx = i + 1
            break

    if header_idx is None or header_idx + 1 >= len(lines):
        logger.warning("alignment.picard_parse_failed", path=str(metrics_path))
        return 0.0

    headers = lines[header_idx].split("\t")
    values = lines[header_idx + 1].split("\t")

    try:
        dup_col = headers.index("PERCENT_DUPLICATION")
        return float(values[dup_col]) * 100  # Convert fraction to percentage
    except (ValueError, IndexError):
        logger.warning("alignment.picard_no_dup_col", path=str(metrics_path))
        return 0.0


def _count_chrm_reads(bam_path: Path) -> int:
    """Count chrM reads via samtools idxstats."""
    proc = subprocess.run(
        ["samtools", "idxstats", str(bam_path)],
        capture_output=True,
        text=True,
    )
    for line in proc.stdout.strip().split("\n"):
        parts = line.split("\t")
        if len(parts) >= 3 and parts[0] == "chrM":
            return int(parts[2])
    return 0


def _write_qc_csv(metrics_list: list[dict], output_path: Path) -> None:
    """Write alignment QC metrics to CSV in CUTANA Cloud export format."""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=_QC_CSV_HEADERS)
    writer.writeheader()
    for m in metrics_list:
        writer.writerow(
            {
                "Short_Name": m["short_name"],
                "Total_Read_Pairs": m["total_read_pairs"],
                "Aligned_Read_Pairs": m["aligned_read_pairs"],
                "Uniquely_Aligned_Read_Pairs": m["uniquely_aligned_read_pairs"],
                "Unique_Alignment_Rate(%)": round(m["unique_alignment_rate"], 2),
                "Duplication_Rate(%)": round(m["duplication_rate"], 2),
                "chrM_Bandwidth(%)": round(m["chrm_bandwidth"], 2),
                "Ecoli_Read_Pairs": m["ecoli_read_pairs"],
                "Ecoli_Alignment_Rate(%)": round(m["ecoli_alignment_rate"], 2),
                "Ecoli_Normalization_Factor": round(m["ecoli_normalization_factor"], 6),
            }
        )
    output_path.write_text(buf.getvalue())


def _write_spike_in_csv(spike_in_data: list[dict], output_path: Path) -> None:
    """Write spike-in barcode QC data to CSV."""
    headers = ["Short_Name", "On_Target_PTM", "Total_Barcode_Reads"] + PTM_NAMES
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=headers)
    writer.writeheader()
    for entry in spike_in_data:
        row: dict[str, str | int] = {
            "Short_Name": entry["short_name"],
            "On_Target_PTM": entry.get("on_target_ptm") or "",
            "Total_Barcode_Reads": entry["total_barcode_reads"],
        }
        for ptm in PTM_NAMES:
            row[ptm] = entry["ptm_counts"].get(ptm, 0)
        writer.writerow(row)
    output_path.write_text(buf.getvalue())


def _load_canned_qc_data() -> list[dict]:
    """Load canned QC data from CUTANA Cloud alignment metrics CSV for mock mode."""
    csv_path = _CUTANA_DATA_DIR / "Mouse mm10_alignment_metrics.csv"
    if not csv_path.exists():
        csv_path = _CUTANA_DATA_DIR_DOCKER / "Mouse mm10_alignment_metrics.csv"
    if not csv_path.exists():
        return []

    rows = []
    with open(csv_path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ecoli = int(row["Ecoli_Read_Pairs"])
            uniq = int(row["Uniquely_Aligned_Read_Pairs"])
            rows.append(
                {
                    "short_name": row["Short_Name"],
                    "total_read_pairs": int(row["Total_Read_Pairs"]),
                    "aligned_read_pairs": int(row["Aligned_Read_Pairs"]),
                    "uniquely_aligned_read_pairs": uniq,
                    "unique_alignment_rate": float(row["Unique_Alignment_Rate(%)"]),
                    "duplication_rate": float(row["Duplication_Rate(%)"]),
                    "chrm_bandwidth": float(row["chrM_Bandwidth(%)"]),
                    "ecoli_read_pairs": ecoli,
                    "ecoli_alignment_rate": float(row["Ecoli_Alignment_Rate(%)"]),
                    "ecoli_normalization_factor": round(ecoli / uniq, 6) if uniq > 0 else 0.0,
                }
            )
    return rows


def _resolve_annotation(genome: str) -> Path | None:
    """Find the gene annotation BED for TSS/gene body heatmaps."""
    bed = _ANNOTATIONS_DIR / f"{genome}_refGene.bed"
    return bed if bed.exists() else None


# ---------------------------------------------------------------------------
# AlignmentStage
# ---------------------------------------------------------------------------


class AlignmentStage(PipelineStage):
    """Full alignment pipeline: Bowtie2 → post-processing → bigWig → heatmaps.

    Processing order per reaction (from lab's integrated.sh + integrated.step2.sh):
      1. Bowtie2 alignment (--dovetail --phred33)
      2. SAM → BAM conversion (samtools view -bS)
      3. Filter unmapped/unpaired + multi-mapper removal (-f 3 -F 4 -F 8 -q 10)
      4. DAC Exclusion List filtering (bedtools intersect -v)
      5. Coordinate sort (picard SortSam)
      6. Mark duplicates (picard MarkDuplicates)
      7. Remove duplicates (samtools view -F 1024)
      8. Index final BAM
      9. Unsmoothed bigWig (bamCoverage, 20bp bins)
     10. Smoothed bigWig (bamCoverage, 100bp bins)
     11. TSS heatmap (computeMatrix reference-point + plotHeatmap)
     12. Gene body heatmap (computeMatrix scale-regions + plotHeatmap)
    """

    def validate(self, params: dict) -> list[str]:
        errors: list[str] = []

        if "experiment_id" not in params:
            errors.append("Missing required parameter: experiment_id")
        if "project_id" not in params:
            errors.append("Missing required parameter: project_id")

        genome = params.get("reference_genome")
        if not genome:
            errors.append("Missing required parameter: reference_genome")
        elif genome not in EFFECTIVE_GENOME_SIZES:
            errors.append(
                f"Unsupported reference genome: {genome}. "
                f"Supported: {', '.join(EFFECTIVE_GENOME_SIZES)}"
            )

        reactions = params.get("reactions")
        if not reactions:
            errors.append("Missing required parameter: reactions (must be non-empty)")
        else:
            for i, rxn in enumerate(reactions):
                if "reaction_id" not in rxn:
                    errors.append(f"reactions[{i}]: missing 'reaction_id'")
                if "short_name" not in rxn:
                    errors.append(f"reactions[{i}]: missing 'short_name'")
                elif not re.match(r"^[A-Za-z0-9][A-Za-z0-9_\-\.]*$", rxn["short_name"]):
                    errors.append(
                        f"reactions[{i}]: short_name contains unsafe characters "
                        "(only letters, digits, underscores, hyphens, dots allowed)"
                    )
                if "r1_path" not in rxn:
                    errors.append(f"reactions[{i}]: missing 'r1_path'")
                if "r2_path" not in rxn:
                    errors.append(f"reactions[{i}]: missing 'r2_path'")

        # In real mode, verify tools and indices exist
        if settings.PIPELINE_MODE != "mock" and genome:
            index_name = BOWTIE2_INDEX_NAMES.get(genome)
            if index_name:
                idx_dir = Path(settings.GENOME_INDEX_DIR) / genome
                # Check for at least one .bt2 file
                if idx_dir.exists():
                    bt2_files = list(idx_dir.glob(f"{index_name}*.bt2"))
                    if not bt2_files:
                        errors.append(f"Bowtie2 index not found at {idx_dir}/{index_name}*.bt2")
                else:
                    errors.append(f"Genome index directory not found: {idx_dir}")

            for tool in ["bowtie2", "samtools"]:
                if not shutil.which(tool):
                    errors.append(f"Required tool not found in PATH: {tool}")

        return errors

    def run(self, job_id: int, params: dict, working_dir: Path, job_dir: Path) -> dict:
        genome = params["reference_genome"]
        reactions = params["reactions"]
        remove_dups = params.get("remove_duplicates", True)
        remove_dac = params.get("remove_dac_exclusion", True)
        bin_size = params.get("bam_coverage_bin_size", 20)
        smoothed_bin_size = params.get("smoothed_bin_size", 100)
        threads = get_threads()

        # Resolve tool paths
        bowtie2 = shutil.which("bowtie2")
        samtools = shutil.which("samtools")
        bedtools = shutil.which("bedtools")
        bam_coverage = shutil.which("bamCoverage")
        compute_matrix = shutil.which("computeMatrix")
        plot_heatmap = shutil.which("plotHeatmap")

        if not bowtie2 or not samtools:
            raise PipelineError("bowtie2 and samtools must be in PATH")

        # Picard: conda provides a wrapper script, or use java -jar
        picard = shutil.which("picard")
        if not picard:
            raise PipelineError("picard not found in PATH. Install via conda: conda install picard")

        # Genome index
        index_name = BOWTIE2_INDEX_NAMES.get(genome, genome)
        bt2_index = str(Path(settings.GENOME_INDEX_DIR) / genome / index_name)

        # E. coli index (for spike-in alignment)
        ecoli_index_name = BOWTIE2_INDEX_NAMES["ecoli"]
        ecoli_bt2_index = str(Path(settings.GENOME_INDEX_DIR) / "ecoli" / ecoli_index_name)

        # Blacklist BED
        blacklist_bed = resolve_blacklist(genome) if remove_dac else None
        if remove_dac and not blacklist_bed:
            logger.warning("alignment.no_blacklist", genome=genome)

        # Annotation BED for heatmaps
        annotation_bed = _resolve_annotation(genome)

        # Create output directories
        bams_dir = job_dir / "bams"
        bigwigs_dir = job_dir / "bigwigs"
        heatmaps_dir = job_dir / "heatmaps"
        qc_dir = job_dir / "qc"
        logs_dir = job_dir / "logs"
        for d in [bams_dir, bigwigs_dir, heatmaps_dir, qc_dir, logs_dir]:
            d.mkdir(parents=True, exist_ok=True)

        eff_genome_size = EFFECTIVE_GENOME_SIZES[genome]
        all_metrics: list[dict] = []
        spike_in_data: list[dict] = []
        outputs: list[dict] = []
        project_id = params["project_id"]
        experiment_id = params["experiment_id"]
        rel_job = f"projects/{project_id}/{experiment_id}/jobs/{job_id}"

        for rxn in reactions:
            short_name = rxn["short_name"]
            reaction_id = rxn["reaction_id"]
            r1_abs = Path(settings.STORAGE_ROOT) / rxn["r1_path"]
            r2_abs = Path(settings.STORAGE_ROOT) / rxn["r2_path"]

            if not r1_abs.exists():
                raise PipelineError(f"R1 FASTQ not found: {r1_abs}")
            if not r2_abs.exists():
                raise PipelineError(f"R2 FASTQ not found: {r2_abs}")

            logger.info(
                "alignment.reaction_start",
                job_id=job_id,
                short_name=short_name,
            )

            # ---- Step 1: Bowtie2 alignment → SAM ----
            # Flags from integrated.sh line 62: --dovetail --phred33 -p 16
            sam_path = bams_dir / f"{short_name}_aligned_reads.sam"
            bt2_log = logs_dir / f"{short_name}.bowtie2"
            bt2_cmd = [
                bowtie2,
                "-p",
                str(threads),
                "--dovetail",
                "--phred33",
                "-x",
                bt2_index,
                "-1",
                str(r1_abs),
                "-2",
                str(r2_abs),
            ]
            # Bowtie2 writes SAM to stdout, stats to stderr
            logger.info("alignment.bowtie2_start", short_name=short_name)
            with open(sam_path, "w") as sam_f:
                proc = subprocess.run(
                    bt2_cmd,
                    stdout=sam_f,
                    stderr=subprocess.PIPE,
                    text=True,
                    timeout=43200,  # 12 hours max (from SLURM config)
                )
            bt2_log.write_text(proc.stderr)
            if proc.returncode != 0:
                raise PipelineError(
                    f"Bowtie2 failed for {short_name}: {proc.stderr.strip()[-500:]}"
                )

            # ---- Step 2: SAM → BAM conversion ----
            # From integrated.sh line 63: samtools view -bS -@ 16
            raw_bam = bams_dir / f"{short_name}_aligned_reads.bam"
            with open(raw_bam, "wb") as bam_f:
                proc = subprocess.run(
                    [samtools, "view", "-bS", "-@", str(threads), str(sam_path)],
                    stdout=bam_f,
                    stderr=subprocess.PIPE,
                    timeout=3600,
                )
            if proc.returncode != 0:
                raise PipelineError(
                    f"SAM→BAM failed for {short_name}: "
                    f"{proc.stderr.decode('utf-8', errors='replace').strip()[-500:]}"
                )
            # Delete SAM to save space (integrated.sh line 64)
            sam_path.unlink(missing_ok=True)

            # ---- Step 3: Filter unmapped/unpaired + multi-mapper removal ----
            # -f 3: properly paired (integrated.step2.sh line 58)
            # -F 4 -F 8: both mates mapped (integrated.step2.sh line 58)
            # -q 10: MAPQ >= 10, removes multi-mappers (CUTANA Cloud/PLAN.md)
            uniq_bam = bams_dir / f"{short_name}_uniq.bam"
            with open(uniq_bam, "wb") as out_f:
                proc = subprocess.run(
                    [
                        samtools,
                        "view",
                        "-bh",
                        "-f",
                        "3",
                        "-F",
                        "4",
                        "-F",
                        "8",
                        "-q",
                        "10",
                        str(raw_bam),
                    ],
                    stdout=out_f,
                    stderr=subprocess.PIPE,
                    timeout=3600,
                )
            if proc.returncode != 0:
                raise PipelineError(f"Filter/multi-mapper removal failed for {short_name}")
            # Remove raw BAM (intermediate)
            raw_bam.unlink(missing_ok=True)

            # ---- Step 4: DAC Exclusion List filtering ----
            if remove_dac and blacklist_bed and bedtools:
                filtered_bam = bams_dir / (f"{short_name}_exclusion_list_filtered_uniq.bam")
                with open(filtered_bam, "wb") as out_f:
                    proc = subprocess.run(
                        [
                            bedtools,
                            "intersect",
                            "-v",
                            "-abam",
                            str(uniq_bam),
                            "-b",
                            str(blacklist_bed),
                        ],
                        stdout=out_f,
                        stderr=subprocess.PIPE,
                        timeout=3600,
                    )
                if proc.returncode != 0:
                    raise PipelineError(f"DAC exclusion list filtering failed for {short_name}")
                # Use filtered BAM going forward, remove uniq
                input_for_sort = filtered_bam
                uniq_bam.unlink(missing_ok=True)
            else:
                input_for_sort = uniq_bam

            # ---- Step 5: Coordinate sort ----
            # From integrated.step2.sh line 62:
            # picard SortSam INPUT=... OUTPUT=... SORT_ORDER=coordinate
            #   VALIDATION_STRINGENCY=SILENT
            sorted_bam = bams_dir / f"{short_name}_sorted.bam"
            run_cmd(
                [
                    picard,
                    "SortSam",
                    f"INPUT={input_for_sort}",
                    f"OUTPUT={sorted_bam}",
                    "SORT_ORDER=coordinate",
                    "VALIDATION_STRINGENCY=SILENT",
                ],
                timeout=7200,
            )
            input_for_sort.unlink(missing_ok=True)

            # ---- Step 6: Mark duplicates ----
            # From integrated.step2.sh line 67:
            # picard MarkDuplicates INPUT=... OUTPUT=... VALIDATION_STRINGENCY=SILENT
            #   METRICS_FILE=metrics.txt
            dup_marked_bam = bams_dir / f"{short_name}_dup_marked.bam"
            picard_metrics = logs_dir / f"{short_name}_picard_metrics.txt"
            run_cmd(
                [
                    picard,
                    "MarkDuplicates",
                    f"INPUT={sorted_bam}",
                    f"OUTPUT={dup_marked_bam}",
                    "VALIDATION_STRINGENCY=SILENT",
                    f"METRICS_FILE={picard_metrics}",
                ],
                timeout=7200,
            )
            sorted_bam.unlink(missing_ok=True)

            # Parse duplication rate from Picard metrics
            dup_rate = _parse_picard_metrics(picard_metrics)

            # ---- Step 7: Remove duplicates ----
            # From integrated.step2.sh line 71: samtools view -bh -F 1024
            final_bam = bams_dir / f"{short_name}_final.bam"
            if remove_dups:
                with open(final_bam, "wb") as out_f:
                    proc = subprocess.run(
                        [samtools, "view", "-bh", "-F", "1024", str(dup_marked_bam)],
                        stdout=out_f,
                        stderr=subprocess.PIPE,
                        timeout=3600,
                    )
                if proc.returncode != 0:
                    raise PipelineError(f"Duplicate removal failed for {short_name}")
                dup_marked_bam.unlink(missing_ok=True)
            else:
                shutil.move(str(dup_marked_bam), str(final_bam))

            # ---- Step 8: Index final BAM ----
            run_cmd([samtools, "index", str(final_bam)], timeout=1800)
            final_bai = bams_dir / f"{short_name}_final.bam.bai"

            # ---- Step 9: Unsmoothed bigWig (20bp bins) ----
            # From create_bams.sh line 36: bamCoverage --effectiveGenomeSize
            #   --normalizeUsing RPKM
            # Uses CORRECT per-genome size (fixes lab bug per
            #   cleave-spec-decisions.md §7)
            unsmoothed_bw = bigwigs_dir / f"{short_name}.bw"
            if bam_coverage:
                run_cmd(
                    [
                        bam_coverage,
                        "-b",
                        str(final_bam),
                        "--effectiveGenomeSize",
                        str(eff_genome_size),
                        "--normalizeUsing",
                        "RPKM",
                        "--binSize",
                        str(bin_size),
                        "-o",
                        str(unsmoothed_bw),
                    ],
                    timeout=7200,
                )
            else:
                logger.warning("alignment.no_bamCoverage", short_name=short_name)
                unsmoothed_bw.write_bytes(b"")

            # ---- Step 10: Smoothed bigWig (100bp bins) ----
            smoothed_bw = bigwigs_dir / f"{short_name}_smoothed.bw"
            if bam_coverage:
                run_cmd(
                    [
                        bam_coverage,
                        "-b",
                        str(final_bam),
                        "--effectiveGenomeSize",
                        str(eff_genome_size),
                        "--normalizeUsing",
                        "RPKM",
                        "--binSize",
                        str(smoothed_bin_size),
                        "-o",
                        str(smoothed_bw),
                    ],
                    timeout=7200,
                )
            else:
                smoothed_bw.write_bytes(b"")

            # ---- Step 11 & 12: TSS + Gene body heatmaps ----
            tss_heatmap = heatmaps_dir / f"{short_name}_tss_heatmap.png"
            genebody_heatmap = heatmaps_dir / f"{short_name}_genebody_heatmap.png"

            if annotation_bed and compute_matrix and plot_heatmap:
                # TSS heatmap (reference-point mode)
                # Flanking from lab's heatmaps.sh line 74: -a 1500 -b 1500
                tss_matrix = heatmaps_dir / f"{short_name}_tss_matrix.gz"
                run_cmd(
                    [
                        compute_matrix,
                        "reference-point",
                        "--referencePoint",
                        "TSS",
                        "-R",
                        str(annotation_bed),
                        "-S",
                        str(unsmoothed_bw),
                        "-a",
                        "1500",
                        "-b",
                        "1500",
                        "-o",
                        str(tss_matrix),
                        "--skipZeros",
                    ],
                    timeout=7200,
                )
                run_cmd(
                    [
                        plot_heatmap,
                        "-m",
                        str(tss_matrix),
                        "-o",
                        str(tss_heatmap),
                        "--colorMap",
                        "RdYlBu_r",
                    ],
                    timeout=3600,
                )
                tss_matrix.unlink(missing_ok=True)

                # Gene body heatmap (scale-regions mode)
                genebody_matrix = heatmaps_dir / (f"{short_name}_genebody_matrix.gz")
                run_cmd(
                    [
                        compute_matrix,
                        "scale-regions",
                        "-R",
                        str(annotation_bed),
                        "-S",
                        str(unsmoothed_bw),
                        "-a",
                        "1500",
                        "-b",
                        "1500",
                        "-o",
                        str(genebody_matrix),
                        "--skipZeros",
                    ],
                    timeout=7200,
                )
                run_cmd(
                    [
                        plot_heatmap,
                        "-m",
                        str(genebody_matrix),
                        "-o",
                        str(genebody_heatmap),
                        "--colorMap",
                        "RdYlBu_r",
                    ],
                    timeout=3600,
                )
                genebody_matrix.unlink(missing_ok=True)
            else:
                if not annotation_bed:
                    logger.warning(
                        "alignment.no_annotation_bed",
                        genome=genome,
                    )
                tss_heatmap.write_bytes(_STUB_PNG)
                genebody_heatmap.write_bytes(_STUB_PNG)

            # ---- Step 13: E. coli spike-in alignment (if applicable) ----
            ecoli_reads = 0
            ecoli_rate = 0.0
            if rxn.get("ecoli_spike_in"):
                ecoli_log = logs_dir / f"{short_name}.ecoli.bowtie2"
                ecoli_bam = bams_dir / f"{short_name}_ecoli.bam"

                ecoli_idx_dir = Path(settings.GENOME_INDEX_DIR) / "ecoli"
                if ecoli_idx_dir.exists():
                    # Pipe bowtie2 directly into samtools (Harvard pattern)
                    ecoli_bt2_cmd = [
                        bowtie2,
                        "-p",
                        str(threads),
                        "--dovetail",
                        "--phred33",
                        "-x",
                        ecoli_bt2_index,
                        "-1",
                        str(r1_abs),
                        "-2",
                        str(r2_abs),
                    ]
                    ecoli_sam_cmd = [
                        samtools,
                        "view",
                        "-bS",
                        "-@",
                        str(threads),
                        "-",
                    ]
                    run_piped_cmd(
                        ecoli_bt2_cmd,
                        ecoli_sam_cmd,
                        ecoli_bam,
                        log_path=ecoli_log,
                        timeout=43200,
                    )

                    ecoli_stats = _parse_bowtie2_log(ecoli_log)
                    ecoli_reads = ecoli_stats.get("aligned_reads", 0)
                else:
                    logger.warning("alignment.no_ecoli_index")

            # ---- Step 14: K-MetStat spike-in barcode count (if applicable) ----
            spike_in_type = rxn.get("cutana_spike_in")
            if spike_in_type and spike_in_type != "None":
                logger.info(
                    "alignment.spike_in_barcode_count",
                    short_name=short_name,
                    spike_in_type=spike_in_type,
                )
                ptm_counts = count_barcodes(r1_abs, r2_abs)
                on_target = rxn.get("cutana_spike_in_target")
                pct_recovery = normalize_counts(ptm_counts, on_target)
                spike_in_data.append(
                    {
                        "short_name": short_name,
                        "on_target_ptm": on_target,
                        "total_barcode_reads": sum(ptm_counts.values()),
                        "ptm_counts": ptm_counts,
                        "pct_recovery": pct_recovery,
                    }
                )

            # ---- Collect QC metrics ----
            bt2_stats = _parse_bowtie2_log(bt2_log)
            total_reads = rxn.get("total_reads") or bt2_stats["total_reads"]
            uniq_reads = count_bam_reads(final_bam)
            chrm_reads = _count_chrm_reads(final_bam)

            if total_reads > 0:
                unique_rate = round(uniq_reads / total_reads * 100, 2)
                chrm_pct = round(chrm_reads / total_reads * 100, 2)
                ecoli_rate = round(ecoli_reads / total_reads * 100, 2)
            else:
                unique_rate = 0.0
                chrm_pct = 0.0
                ecoli_rate = 0.0

            ecoli_norm_factor = round(ecoli_reads / uniq_reads, 6) if uniq_reads > 0 else 0.0

            all_metrics.append(
                {
                    "short_name": short_name,
                    "total_read_pairs": total_reads,
                    "aligned_read_pairs": bt2_stats["aligned_reads"],
                    "uniquely_aligned_read_pairs": uniq_reads,
                    "unique_alignment_rate": unique_rate,
                    "duplication_rate": round(dup_rate, 2),
                    "chrm_bandwidth": chrm_pct,
                    "ecoli_read_pairs": ecoli_reads,
                    "ecoli_alignment_rate": ecoli_rate,
                    "ecoli_normalization_factor": ecoli_norm_factor,
                }
            )

            # ---- Build outputs for this reaction ----
            def _add_output(
                path: Path, category: str, ftype: str, rid: int | None = reaction_id
            ) -> None:
                if path.exists():
                    outputs.append(
                        {
                            "file_category": category,
                            "filename": path.name,
                            "file_path": f"{rel_job}/{path.relative_to(job_dir)}",
                            "file_type": ftype,
                            "file_size_bytes": path.stat().st_size,
                            "reaction_id": rid,
                        }
                    )

            _add_output(final_bam, "unique_bam", "bam")
            _add_output(final_bai, "unique_bam", "bai")
            _add_output(unsmoothed_bw, "bigwig", "bw")
            _add_output(smoothed_bw, "smoothed_bigwig", "bw")
            _add_output(tss_heatmap, "tss_heatmap", "png")
            _add_output(genebody_heatmap, "genebody_heatmap", "png")
            _add_output(picard_metrics, "log", "txt")
            _add_output(bt2_log, "log", "txt")

            logger.info(
                "alignment.reaction_complete",
                job_id=job_id,
                short_name=short_name,
                unique_alignment_rate=unique_rate,
            )

        # ---- Write QC CSV ----
        qc_csv = qc_dir / "alignment_metrics.csv"
        _write_qc_csv(all_metrics, qc_csv)
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

        # ---- Write spike-in QC CSV (if any reactions had spike-in) ----
        if spike_in_data:
            spike_csv = qc_dir / "spike_in_qc.csv"
            _write_spike_in_csv(spike_in_data, spike_csv)
            outputs.append(
                {
                    "file_category": "spike_in_qc",
                    "filename": spike_csv.name,
                    "file_path": f"{rel_job}/qc/{spike_csv.name}",
                    "file_type": "csv",
                    "file_size_bytes": spike_csv.stat().st_size,
                    "reaction_id": None,
                }
            )

        return {
            "job_id": job_id,
            "status": "complete",
            "message": f"Alignment completed for {len(reactions)} reactions",
            "outputs": outputs,
            "methods_text": self.generate_methods_text(params),
            "qc_metrics": all_metrics,
        }

    def mock_run(self, job_id: int, params: dict, working_dir: Path, job_dir: Path) -> dict:
        """Create real stub files on disk so file browser, IGV, and downloads work."""
        time.sleep(5)

        reactions = params.get("reactions", [])
        project_id = params.get("project_id", 0)
        experiment_id = params.get("experiment_id", 0)
        rel_job = f"projects/{project_id}/{experiment_id}/jobs/{job_id}"

        # Create output directories
        bams_dir = job_dir / "bams"
        bigwigs_dir = job_dir / "bigwigs"
        heatmaps_dir = job_dir / "heatmaps"
        qc_dir = job_dir / "qc"
        logs_dir = job_dir / "logs"
        for d in [bams_dir, bigwigs_dir, heatmaps_dir, qc_dir, logs_dir]:
            d.mkdir(parents=True, exist_ok=True)

        # Load canned QC data from CUTANA Cloud export
        canned = _load_canned_qc_data()
        all_metrics: list[dict] = []
        outputs: list[dict] = []

        for i, rxn in enumerate(reactions):
            short_name = rxn["short_name"]
            reaction_id = rxn["reaction_id"]

            # Map to canned QC data (cycle through if fewer canned rows)
            if canned:
                canned_row = canned[i % len(canned)]
                metrics = {**canned_row, "short_name": short_name}
            else:
                mock_uniq = int(rxn.get("total_reads", 1000000) * 0.80)
                mock_ecoli = 500
                metrics = {
                    "short_name": short_name,
                    "total_read_pairs": rxn.get("total_reads", 1000000),
                    "aligned_read_pairs": int(rxn.get("total_reads", 1000000) * 0.85),
                    "uniquely_aligned_read_pairs": mock_uniq,
                    "unique_alignment_rate": 80.0,
                    "duplication_rate": 12.0,
                    "chrm_bandwidth": 0.01,
                    "ecoli_read_pairs": mock_ecoli,
                    "ecoli_alignment_rate": 0.05,
                    "ecoli_normalization_factor": (
                        round(mock_ecoli / mock_uniq, 6) if mock_uniq > 0 else 0.0
                    ),
                }
            all_metrics.append(metrics)

            # Create stub files
            stub_files = [
                (bams_dir / f"{short_name}_final.bam", "unique_bam", "bam"),
                (bams_dir / f"{short_name}_final.bam.bai", "unique_bam", "bai"),
                (bigwigs_dir / f"{short_name}.bw", "bigwig", "bw"),
                (bigwigs_dir / f"{short_name}_smoothed.bw", "smoothed_bigwig", "bw"),
            ]
            for path, category, ftype in stub_files:
                path.write_bytes(b"")
                outputs.append(
                    {
                        "file_category": category,
                        "filename": path.name,
                        "file_path": f"{rel_job}/{path.relative_to(job_dir)}",
                        "file_type": ftype,
                        "file_size_bytes": 0,
                        "reaction_id": reaction_id,
                    }
                )

            # Heatmap stubs (1x1 PNG)
            heatmap_files = [
                (
                    heatmaps_dir / f"{short_name}_tss_heatmap.png",
                    "tss_heatmap",
                ),
                (
                    heatmaps_dir / f"{short_name}_genebody_heatmap.png",
                    "genebody_heatmap",
                ),
            ]
            for path, category in heatmap_files:
                path.write_bytes(_STUB_PNG)
                outputs.append(
                    {
                        "file_category": category,
                        "filename": path.name,
                        "file_path": f"{rel_job}/{path.relative_to(job_dir)}",
                        "file_type": "png",
                        "file_size_bytes": len(_STUB_PNG),
                        "reaction_id": reaction_id,
                    }
                )

            # Mock log files
            bt2_log = logs_dir / f"{short_name}.bowtie2"
            bt2_log.write_text(f"Mock bowtie2 log for {short_name}\n")
            outputs.append(
                {
                    "file_category": "log",
                    "filename": bt2_log.name,
                    "file_path": f"{rel_job}/logs/{bt2_log.name}",
                    "file_type": "txt",
                    "file_size_bytes": bt2_log.stat().st_size,
                    "reaction_id": reaction_id,
                }
            )

            logger.info("alignment.mock_reaction_complete", short_name=short_name)

        # Write QC CSV with canned data
        qc_csv = qc_dir / "alignment_metrics.csv"
        _write_qc_csv(all_metrics, qc_csv)
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

        # Write mock spike-in CSV if any reaction has spike-in
        mock_spike_in_data: list[dict] = []
        for rxn in reactions:
            spike_type = rxn.get("cutana_spike_in")
            if spike_type and spike_type != "None":
                on_target = rxn.get("cutana_spike_in_target")
                # Generate plausible mock counts
                ptm_counts: dict[str, int] = {}
                for ptm in PTM_NAMES:
                    if ptm == on_target:
                        ptm_counts[ptm] = 50000
                    elif ptm == "Unmodified" and on_target is None:
                        ptm_counts[ptm] = 30000
                    else:
                        ptm_counts[ptm] = int(50000 * 0.05)  # ~5% off-target
                mock_spike_in_data.append(
                    {
                        "short_name": rxn["short_name"],
                        "on_target_ptm": on_target,
                        "total_barcode_reads": sum(ptm_counts.values()),
                        "ptm_counts": ptm_counts,
                    }
                )

        if mock_spike_in_data:
            spike_csv = qc_dir / "spike_in_qc.csv"
            _write_spike_in_csv(mock_spike_in_data, spike_csv)
            outputs.append(
                {
                    "file_category": "spike_in_qc",
                    "filename": spike_csv.name,
                    "file_path": f"{rel_job}/qc/{spike_csv.name}",
                    "file_type": "csv",
                    "file_size_bytes": spike_csv.stat().st_size,
                    "reaction_id": None,
                }
            )

        return {
            "job_id": job_id,
            "status": "complete",
            "message": f"Mock alignment completed for {len(reactions)} reactions",
            "outputs": outputs,
            "methods_text": self.generate_methods_text(params),
            "qc_metrics": all_metrics,
        }

    def generate_methods_text(self, params: dict) -> str:
        return alignment_methods(params)
