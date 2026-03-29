# backend/pipelines/peak_calling.py
"""Peak calling pipeline — MACS2 / SICER2 / SEACR + FRiP + HOMER annotation.

Reference scripts (MANDATORY compliance per CLAUDE.md):
  - references/data_workdir/aligned.aug10/integrated.step2.sh  (peak calling, all 3 callers)
  - references/cutruntools/filter_below.awk                    (fragment size filter)
  - references/cutruntools/change.bdg.py                       (SEACR bedgraph preprocessing)
  - references/cutruntools/SEACR_1.1.sh                        (SEACR peak caller)
  - references/cutruntools/get_summits_seacr.py                (SEACR summit extraction)
  - references/cutruntools/get_summits_broadPeak.py            (broad peak summit extraction)
  - references/data_workdir/blklist_subtract/subtract_blacklist.sh  (post-peak blacklist)
"""

import csv
import io
import os
import re
import shutil
import subprocess
import time
from collections.abc import Callable
from pathlib import Path

import structlog

from config import settings
from pipelines.base import (
    PipelineError,
    PipelineStage,
    append_to_master_log,
    count_bam_reads,
    resolve_blacklist,
    run_cmd,
    run_piped_cmd,
)
from pipelines.methods_text import GENOME_DISPLAY_NAMES, peak_calling_methods

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# MACS2 genome size shorthand (integrated.step2.sh: -g mm / -g hs)
MACS2_GENOME_SIZES: dict[str, str] = {
    "mm10": "mm",
    "hg38": "hs",
    "hg19": "hs",
    "dm6": "dm",
    "sacCer3": "12157105",
}

PEAK_CALLERS = {"MACS2", "SICER2", "SEACR"}
PEAK_SIZES: dict[str, set[str]] = {
    "MACS2": {"narrow", "broad"},
    "SICER2": {"broad"},
    "SEACR": {"stringent", "relaxed"},
}

# Default thresholds — lab standard, NOT CUTANA Cloud (cleave-spec-decisions.md §2.1)
DEFAULT_Q_VALUE = 0.01
DEFAULT_BROAD_CUTOFF = 0.1
DEFAULT_SEACR_THRESHOLD = 0.01
DEFAULT_SICER2_FDR = 0.01
DEFAULT_SICER2_WINDOW = 200
DEFAULT_SICER2_GAP = 600
DEFAULT_FRAGMENT_SIZE = 120

_TOOLS_DIR = Path(__file__).resolve().parent / "tools"
_REFERENCE_DIR = Path(__file__).resolve().parent / "reference"
_CHROM_SIZES_DIR = _REFERENCE_DIR / "chrom_sizes"

_CUTANA_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "cutana" / "H3K4me3"
_CUTANA_DATA_DIR_DOCKER = Path("/cutana/H3K4me3")

# QC CSV headers matching CUTANA Cloud peak_caller_metrics.csv column names
_PEAK_QC_CSV_HEADERS = [
    "Short_Name",
    "Control_Short_Name",
    "Reference_Genome",
    "Peak_Caller",
    "Peak_Size",
    "Significance_Threshold",
    "Uniquely_Aligned_Read_Pairs",
    "Called_Peaks",
    "Reads_in_Peaks",
    "FRiP",
]

_FRIP_CSV_HEADERS = [
    "Short_Name",
    "Control_Short_Name",
    "Uniquely_Aligned_Read_Pairs",
    "Reads_in_Peaks",
    "FRiP",
]

_TOP_PEAKS_CSV_HEADERS = [
    "Short_Name",
    "Control_Short_Name",
    "Reference_Genome",
    "Peak_Caller",
    "Peak_Size",
    "Significance_Threshold",
    "Top Peak",
    "2' Peak",
    "3' Peak",
    "4' Peak",
    "5' Peak",
    "6' Peak",
    "7' Peak",
    "8' Peak",
    "9' Peak",
    "10' Peak",
]


# ---------------------------------------------------------------------------
# Subprocess helpers
# ---------------------------------------------------------------------------


def _run_triple_pipe(
    cmd1: list[str],
    cmd2: list[str],
    cmd3: list[str],
    output_path: Path,
    env: dict | None = None,
    timeout: int = 7200,
) -> None:
    """Run three commands piped: cmd1 | cmd2 | cmd3 > output_path.

    Used for the fragment filter: samtools view -h | awk -f filter_below.awk | samtools view -Sb -
    Reference: integrated.step2.sh lines 81-82.
    """
    logger.info(
        "peak_calling.triple_pipe",
        cmd1=" ".join(cmd1),
        cmd2=" ".join(cmd2),
        cmd3=" ".join(cmd3),
    )
    with open(output_path, "wb") as out_f:
        p1 = subprocess.Popen(cmd1, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        p2 = subprocess.Popen(
            cmd2,
            stdin=p1.stdout,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
        )
        if p1.stdout:
            p1.stdout.close()
        p3 = subprocess.Popen(cmd3, stdin=p2.stdout, stdout=out_f, stderr=subprocess.PIPE)
        if p2.stdout:
            p2.stdout.close()
        _, stderr3 = p3.communicate(timeout=timeout)
        _, stderr2 = p2.communicate(timeout=30)
        _, stderr1 = p1.communicate(timeout=30)

    for i, (proc, stderr) in enumerate([(p1, stderr1), (p2, stderr2), (p3, stderr3)], 1):
        if proc.returncode != 0:
            raise PipelineError(
                f"Triple pipe cmd{i} failed (exit {proc.returncode}): "
                f"{stderr.decode('utf-8', errors='replace').strip()[-500:]}"
            )


# ---------------------------------------------------------------------------
# Resolution helpers
# ---------------------------------------------------------------------------


def _resolve_chrom_sizes(genome: str) -> Path | None:
    cs = _CHROM_SIZES_DIR / f"{genome}.chrom.sizes"
    return cs if cs.exists() else None


# ---------------------------------------------------------------------------
# Peak counting and FRiP helpers
# ---------------------------------------------------------------------------


def _count_peaks(peak_file: Path) -> int:
    """Count peaks in a BED/narrowPeak/broadPeak file (skip comments and track lines)."""
    count = 0
    with open(peak_file) as f:
        for line in f:
            stripped = line.strip()
            if stripped and not stripped.startswith("#") and not stripped.startswith("track"):
                count += 1
    return count


def _extract_top_peaks(peak_file: Path, n: int = 10) -> list[str]:
    """Extract top N peaks by score, return as 'chr:start-end' strings.

    For narrowPeak: score is column 7 (signalValue).
    For broadPeak: score is column 7 (signalValue).
    For SEACR BED (6-col): score is column 4 (AUC).
    """
    peaks: list[tuple[float, str]] = []
    with open(peak_file) as f:
        for line in f:
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or stripped.startswith("track"):
                continue
            cols = stripped.split("\t")
            if len(cols) < 3:
                continue
            chrom, start, end = cols[0], cols[1], cols[2]
            # Use column 7 for narrowPeak/broadPeak, column 4 for SEACR/simple BED
            if len(cols) >= 7:
                try:
                    score = float(cols[6])
                except ValueError:
                    score = 0.0
            elif len(cols) >= 4:
                try:
                    score = float(cols[3])
                except ValueError:
                    score = 0.0
            else:
                score = 0.0
            peaks.append((score, f"{chrom}:{start}-{end}"))

    peaks.sort(key=lambda x: x[0], reverse=True)
    return [coord for _, coord in peaks[:n]]


def _calculate_frip(bam_path: Path, peak_bed: Path) -> tuple[int, float]:
    """Calculate Fraction of Reads in Peaks.

    bedtools intersect -abam bam -b peaks -u | samtools view -c
    Divided by samtools view -c bam.
    """
    total = count_bam_reads(bam_path)
    if total == 0:
        return 0, 0.0

    p1 = subprocess.Popen(
        ["bedtools", "intersect", "-abam", str(bam_path), "-b", str(peak_bed), "-u"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    p2 = subprocess.Popen(
        ["samtools", "view", "-c", "-"],
        stdin=p1.stdout,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if p1.stdout:
        p1.stdout.close()
    stdout, _ = p2.communicate(timeout=7200)
    p1.communicate(timeout=30)

    try:
        reads_in_peaks = int(stdout.decode().strip())
    except ValueError:
        reads_in_peaks = 0

    frip = round(reads_in_peaks / total, 4) if total > 0 else 0.0
    return reads_in_peaks, frip


# ---------------------------------------------------------------------------
# QC CSV helpers
# ---------------------------------------------------------------------------


def _write_peak_qc_csv(metrics_list: list[dict], output_path: Path) -> None:
    """Write peak calling QC metrics to CSV in CUTANA Cloud export format."""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=_PEAK_QC_CSV_HEADERS)
    writer.writeheader()
    for m in metrics_list:
        writer.writerow(
            {
                "Short_Name": m["short_name"],
                "Control_Short_Name": m.get("control_short_name", ""),
                "Reference_Genome": m.get("reference_genome", ""),
                "Peak_Caller": m.get("peak_caller", ""),
                "Peak_Size": m.get("peak_size", ""),
                "Significance_Threshold": m.get("significance_threshold", ""),
                "Uniquely_Aligned_Read_Pairs": m.get("uniquely_aligned_read_pairs", 0),
                "Called_Peaks": m.get("called_peaks", 0),
                "Reads_in_Peaks": m.get("reads_in_peaks", 0),
                "FRiP": round(m.get("frip", 0.0), 4),
            }
        )
    output_path.write_text(buf.getvalue())


def _write_frip_csv(metrics_list: list[dict], output_path: Path) -> None:
    """Write FRiP scores to a standalone CSV for the FRiP file category."""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=_FRIP_CSV_HEADERS)
    writer.writeheader()
    for m in metrics_list:
        writer.writerow(
            {
                "Short_Name": m["short_name"],
                "Control_Short_Name": m.get("control_short_name", ""),
                "Uniquely_Aligned_Read_Pairs": m.get("uniquely_aligned_read_pairs", 0),
                "Reads_in_Peaks": m.get("reads_in_peaks", 0),
                "FRiP": round(m.get("frip", 0.0), 4),
            }
        )
    output_path.write_text(buf.getvalue())


def _write_top_peaks_csv(top_peaks_list: list[dict], output_path: Path) -> None:
    """Write top called peaks to CSV in CUTANA Cloud export format."""
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=_TOP_PEAKS_CSV_HEADERS)
    writer.writeheader()
    for entry in top_peaks_list:
        row: dict[str, str] = {
            "Short_Name": entry["short_name"],
            "Control_Short_Name": entry.get("control_short_name", ""),
            "Reference_Genome": entry.get("reference_genome", ""),
            "Peak_Caller": entry.get("peak_caller", ""),
            "Peak_Size": entry.get("peak_size", ""),
            "Significance_Threshold": str(entry.get("significance_threshold", "")),
        }
        peaks = entry.get("top_peaks", [])
        for i, header in enumerate(_TOP_PEAKS_CSV_HEADERS[6:]):
            row[header] = peaks[i] if i < len(peaks) else ""
        writer.writerow(row)
    output_path.write_text(buf.getvalue())


def _load_canned_peak_qc() -> list[dict]:
    """Load canned QC from CUTANA Cloud peak_caller_metrics.csv (tab-separated)."""
    csv_path = _CUTANA_DATA_DIR / "peak_caller_metrics.csv"
    if not csv_path.exists():
        csv_path = _CUTANA_DATA_DIR_DOCKER / "peak_caller_metrics.csv"
    if not csv_path.exists():
        return []

    rows = []
    with open(csv_path, newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            frip_str = row.get("FRiP", "0")
            rows.append(
                {
                    "short_name": row["Short Name"],
                    "control_short_name": row.get("Control Short Name", ""),
                    "reference_genome": row.get("Reference Genome", ""),
                    "peak_caller": row.get("Peak Caller", ""),
                    "peak_size": row.get("Peak Size", ""),
                    "significance_threshold": float(row.get("Significance Threshold", "0.05")),
                    "uniquely_aligned_read_pairs": int(row.get("Uniquely Aligned Read Pairs", "0")),
                    "called_peaks": int(row.get("Called Peaks", "0")),
                    "reads_in_peaks": int(row.get("Reads in Peaks", "0")),
                    "frip": float(frip_str),
                }
            )
    return rows


def _load_canned_top_peaks() -> list[dict]:
    """Load canned top peaks from CUTANA Cloud top_called_peaks.csv (tab-separated)."""
    csv_path = _CUTANA_DATA_DIR / "top_called_peaks.csv"
    if not csv_path.exists():
        csv_path = _CUTANA_DATA_DIR_DOCKER / "top_called_peaks.csv"
    if not csv_path.exists():
        return []

    rows = []
    with open(csv_path, newline="") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            peaks = []
            for header in [
                "Top Peak",
                "2' Peak",
                "3' Peak",
                "4' Peak",
                "5' Peak",
                "6' Peak",
                "7' Peak",
                "8' Peak",
                "9' Peak",
                "10' Peak",
            ]:
                val = row.get(header, "").strip()
                if val:
                    peaks.append(val)
            rows.append(
                {
                    "short_name": row["Short Name"],
                    "control_short_name": row.get("Control Short Name", ""),
                    "reference_genome": row.get("Reference Genome", ""),
                    "peak_caller": row.get("Peak Caller", ""),
                    "peak_size": row.get("Peak Size", ""),
                    "significance_threshold": float(row.get("Significance Threshold", "0.05")),
                    "top_peaks": peaks,
                }
            )
    return rows


# ---------------------------------------------------------------------------
# Fragment filter helper
# ---------------------------------------------------------------------------


def _apply_fragment_filter(
    input_bam: Path,
    output_bam: Path,
    fragment_size: int = DEFAULT_FRAGMENT_SIZE,
) -> None:
    """Filter BAM to fragments < fragment_size bp.

    Exact match to integrated.step2.sh lines 81-82:
      samtools view -h bam | LC_ALL=C awk -f filter_below.awk | samtools view -Sb - > out.bam
    """
    samtools = shutil.which("samtools") or "samtools"

    # filter_below.awk hardcodes SIZE=120 in BEGIN. Use the file for default,
    # inline the script for custom sizes.
    if fragment_size == DEFAULT_FRAGMENT_SIZE:
        awk_cmd = ["awk", "-f", str(_TOOLS_DIR / "filter_below.awk")]
    else:
        s2 = fragment_size * fragment_size
        awk_script = (
            f'BEGIN {{ FS="\\t"; SIZE={fragment_size}; S2={s2} }} '
            "/^@/ { print $0; next } "
            "{ if ($9*$9 < S2) print $0 }"
        )
        awk_cmd = ["awk", awk_script]

    env_with_lc = {**os.environ, "LC_ALL": "C"}

    _run_triple_pipe(
        [samtools, "view", "-h", str(input_bam)],
        awk_cmd,
        [samtools, "view", "-Sb", "-"],
        output_bam,
        env=env_with_lc,
    )

    # Index the filtered BAM
    run_cmd([samtools, "index", str(output_bam)], timeout=3600)

    logger.info(
        "peak_calling.fragment_filter_complete",
        input=str(input_bam),
        output=str(output_bam),
        fragment_size=fragment_size,
    )


# ---------------------------------------------------------------------------
# Peak caller dispatch helpers
# ---------------------------------------------------------------------------


def _call_macs2_narrow(
    call_bam: Path,
    control_bam: Path | None,
    genome: str,
    short_name: str,
    peaks_dir: Path,
    logs_dir: Path,
    q_value: float,
) -> tuple[Path, Path]:
    """MACS2 narrow peak calling. Exact flags from integrated.step2.sh line 115."""
    macs2 = shutil.which("macs2") or "macs2"
    macs2_genome = MACS2_GENOME_SIZES[genome]

    cmd = [
        macs2,
        "callpeak",
        "-t",
        str(call_bam),
        "-g",
        macs2_genome,
        "-f",
        "BAMPE",
        "-n",
        short_name,
        "--outdir",
        str(peaks_dir),
        "-q",
        str(q_value),
        "-B",
        "--SPMR",
        "--keep-dup",
        "all",
    ]
    if control_bam:
        cmd.extend(["-c", str(control_bam)])

    run_cmd(cmd, log_path=logs_dir / f"{short_name}_macs2_narrow.log", timeout=14400)

    peak_file = peaks_dir / f"{short_name}_peaks.narrowPeak"
    summit_file = peaks_dir / f"{short_name}_summits.bed"
    return peak_file, summit_file


def _call_macs2_broad(
    call_bam: Path,
    control_bam: Path | None,
    genome: str,
    short_name: str,
    peaks_dir: Path,
    logs_dir: Path,
    broad_cutoff: float,
) -> tuple[Path, Path]:
    """MACS2 broad peak calling. Exact flags from integrated.step2.sh line 119."""
    macs2 = shutil.which("macs2") or "macs2"
    macs2_genome = MACS2_GENOME_SIZES[genome]

    cmd = [
        macs2,
        "callpeak",
        "-t",
        str(call_bam),
        "-g",
        macs2_genome,
        "-f",
        "BAMPE",
        "-n",
        short_name,
        "--outdir",
        str(peaks_dir),
        "--broad",
        "--broad-cutoff",
        str(broad_cutoff),
        "-B",
        "--SPMR",
        "--keep-dup",
        "all",
    ]
    if control_bam:
        cmd.extend(["-c", str(control_bam)])

    run_cmd(cmd, log_path=logs_dir / f"{short_name}_macs2_broad.log", timeout=14400)

    peak_file = peaks_dir / f"{short_name}_peaks.broadPeak"

    # Extract summits from broadPeak (integrated.step2.sh line 121)
    summit_file = peaks_dir / f"{short_name}_summits.bed"
    run_piped_cmd(
        ["python", str(_TOOLS_DIR / "get_summits_broadPeak.py"), str(peak_file)],
        ["bedtools", "sort", "-i", "-"],
        summit_file,
    )
    return peak_file, summit_file


def _call_seacr(
    call_bam: Path,
    control_bam: Path | None,
    genome: str,
    short_name: str,
    peaks_dir: Path,
    logs_dir: Path,
    q_value: float,
    seacr_threshold: float,
    seacr_mode: str,
) -> tuple[Path, Path]:
    """SEACR peak calling chain. Exact from integrated.step2.sh lines 125-146.

    Chain: MACS2 bedgraph (no --SPMR) → change.bdg.py → SEACR_1.1.sh
    """
    macs2 = shutil.which("macs2") or "macs2"
    macs2_genome = MACS2_GENOME_SIZES[genome]
    seacr_macs_name = f"{short_name}_seacr_pre"

    # Step C1: MACS2 bedgraph generation (NO --SPMR, per lab line 125)
    bdg_cmd = [
        macs2,
        "callpeak",
        "-t",
        str(call_bam),
        "-g",
        macs2_genome,
        "-f",
        "BAMPE",
        "-n",
        seacr_macs_name,
        "--outdir",
        str(peaks_dir),
        "-q",
        str(q_value),
        "-B",
        "--keep-dup",
        "all",
    ]
    if control_bam:
        bdg_cmd.extend(["-c", str(control_bam)])
    run_cmd(bdg_cmd, log_path=logs_dir / f"{short_name}_seacr_macs2.log", timeout=14400)

    treat_bdg = peaks_dir / f"{seacr_macs_name}_treat_pileup.bdg"
    if not treat_bdg.exists():
        raise PipelineError(f"MACS2 bedgraph not found: {treat_bdg}")

    # Step C2: Float → integer conversion (integrated.step2.sh line 127)
    integer_bdg = peaks_dir / f"{short_name}_treat_integer.bdg"
    proc = subprocess.run(
        ["python", str(_TOOLS_DIR / "change.bdg.py"), str(treat_bdg)],
        capture_output=True,
        text=True,
        timeout=3600,
    )
    if proc.returncode != 0:
        raise PipelineError(f"change.bdg.py failed for {short_name}: {proc.stderr[-500:]}")
    integer_bdg.write_text(proc.stdout)

    # Step C3: SEACR (integrated.step2.sh lines 129/141)
    rscript = shutil.which("Rscript")
    rscript_bin = str(Path(rscript).parent) if rscript else "/usr/bin"
    seacr_output_prefix = str(peaks_dir / f"{short_name}_seacr")

    seacr_cmd = [
        "bash",
        str(_TOOLS_DIR / "SEACR_1.1.sh"),
        str(integer_bdg),
        str(seacr_threshold),
        "non",
        seacr_mode,
        seacr_output_prefix,
        rscript_bin,
    ]
    # SEACR creates temp files in CWD; run from peaks_dir
    run_cmd(seacr_cmd, log_path=logs_dir / f"{short_name}_seacr.log", timeout=14400, cwd=peaks_dir)

    seacr_peak_file = Path(f"{seacr_output_prefix}.{seacr_mode}.bed")
    if not seacr_peak_file.exists():
        raise PipelineError(f"SEACR output not found: {seacr_peak_file}")

    # Step C4: Sort peaks (bedtools sort replaces sort-bed from BEDOPS)
    sorted_peak = peaks_dir / f"{short_name}_peaks.{seacr_mode}.sort.bed"
    run_piped_cmd(
        ["cat", str(seacr_peak_file)],
        ["bedtools", "sort", "-i", "-"],
        sorted_peak,
    )

    # Step C5: Extract summits (integrated.step2.sh lines 133/145)
    summit_file = peaks_dir / f"{short_name}_summits.bed"
    run_piped_cmd(
        ["python", str(_TOOLS_DIR / "get_summits_seacr.py"), str(seacr_peak_file)],
        ["bedtools", "sort", "-i", "-"],
        summit_file,
    )

    # Step C6: Clean up intermediate MACS2 files (integrated.step2.sh lines 135-138)
    for suffix in [
        "_summits.bed",
        "_peaks.xls",
        "_peaks.narrowPeak",
        "_control_lambda.bdg",
        "_treat_pileup.bdg",
    ]:
        cleanup = peaks_dir / f"{seacr_macs_name}{suffix}"
        cleanup.unlink(missing_ok=True)
    integer_bdg.unlink(missing_ok=True)

    return sorted_peak, summit_file


def _call_sicer2(
    call_bam: Path,
    control_bam: Path | None,
    genome: str,
    short_name: str,
    peaks_dir: Path,
    logs_dir: Path,
    window: int,
    gap: int,
    fdr: float,
) -> tuple[Path, Path]:
    """SICER2 broad peak calling (no lab reference; standard CLI)."""
    sicer = shutil.which("sicer") or "sicer"

    cmd = [
        sicer,
        "-t",
        str(call_bam),
        "-s",
        genome,
        "-w",
        str(window),
        "-g",
        str(gap),
        "--false_discovery_rate",
        str(fdr),
        "-o",
        str(peaks_dir),
    ]
    if control_bam:
        cmd.extend(["-c", str(control_bam)])

    run_cmd(cmd, log_path=logs_dir / f"{short_name}_sicer2.log", timeout=14400)

    # SICER2 names output based on input BAM filename
    bam_stem = call_bam.stem
    sicer_matches = list(peaks_dir.glob(f"{bam_stem}*-island.bed"))
    if not sicer_matches:
        # Fallback: any island.bed in peaks_dir
        sicer_matches = list(peaks_dir.glob("*-island.bed"))
    if not sicer_matches:
        raise PipelineError(f"SICER2 output not found for {short_name}")

    # Rename to standard naming
    std_peak = peaks_dir / f"{short_name}_peaks.sicer2.bed"
    shutil.move(str(sicer_matches[0]), str(std_peak))

    # Extract summits as midpoints (same logic as get_summits_broadPeak.py)
    summit_file = peaks_dir / f"{short_name}_summits.bed"
    run_piped_cmd(
        ["python", str(_TOOLS_DIR / "get_summits_broadPeak.py"), str(std_peak)],
        ["bedtools", "sort", "-i", "-"],
        summit_file,
    )
    return std_peak, summit_file


# ---------------------------------------------------------------------------
# PeakCallingStage
# ---------------------------------------------------------------------------


class PeakCallingStage(PipelineStage):
    """Peak calling pipeline: fragment filter → caller dispatch → FRiP → HOMER.

    Supports 5 modes:
      - MACS2 narrow  (q-value 0.01)
      - MACS2 broad   (broad-cutoff 0.1)
      - SICER2 broad  (FDR 0.01)
      - SEACR stringent (threshold 0.01)
      - SEACR relaxed   (threshold 0.01)

    Steps per reaction:
      1. Locate input BAM from parent alignment job
      2. Fragment size filter (<120bp) via filter_below.awk [optional, default ON]
      3. Resolve IgG control BAM (passed as MACS2 -c flag)
      4. Peak calling (dispatch to correct caller)
      5. Blacklist subtraction (bedtools subtract)
      6. FRiP calculation (bedtools intersect / samtools view -c)
      7. HOMER peak annotation (annotatePeaks.pl)
    """

    def validate(self, params: dict) -> list[str]:
        errors: list[str] = []

        if "experiment_id" not in params:
            errors.append("Missing required parameter: experiment_id")
        if "project_id" not in params:
            errors.append("Missing required parameter: project_id")
        if "parent_job_id" not in params:
            errors.append("Missing required parameter: parent_job_id")

        genome = params.get("reference_genome")
        if not genome:
            errors.append("Missing required parameter: reference_genome")
        elif genome not in MACS2_GENOME_SIZES:
            errors.append(
                f"Unsupported reference genome: {genome}. "
                f"Supported: {', '.join(sorted(MACS2_GENOME_SIZES))}"
            )

        peak_caller = params.get("peak_caller")
        if not peak_caller:
            errors.append("Missing required parameter: peak_caller")
        elif peak_caller not in PEAK_CALLERS:
            errors.append(
                f"Unsupported peak caller: {peak_caller}. "
                f"Supported: {', '.join(sorted(PEAK_CALLERS))}"
            )

        peak_size = params.get("peak_size")
        if not peak_size:
            errors.append("Missing required parameter: peak_size")
        elif peak_caller and peak_caller in PEAK_SIZES:
            if peak_size not in PEAK_SIZES[peak_caller]:
                valid = ", ".join(sorted(PEAK_SIZES[peak_caller]))
                errors.append(f"Invalid peak_size '{peak_size}' for {peak_caller}. Valid: {valid}")

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
                if "bam_path" not in rxn:
                    errors.append(f"reactions[{i}]: missing 'bam_path'")

        # In real mode, verify tools exist
        if settings.PIPELINE_MODE != "mock":
            required_tools = ["samtools", "bedtools", "macs2"]
            if peak_caller == "SICER2":
                required_tools.append("sicer")
            if peak_caller == "SEACR":
                required_tools.append("Rscript")
            for tool in required_tools:
                if not shutil.which(tool):
                    errors.append(f"Required tool not found in PATH: {tool}")
            if not shutil.which("annotatePeaks.pl"):
                errors.append("Required tool not found in PATH: annotatePeaks.pl (HOMER)")

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
        peak_caller = params["peak_caller"]
        peak_size = params["peak_size"]
        q_value = params.get("q_value", DEFAULT_Q_VALUE)
        broad_cutoff = params.get("broad_cutoff", DEFAULT_BROAD_CUTOFF)
        fragment_filter = params.get("fragment_filter", True)
        fragment_size = params.get("fragment_size", DEFAULT_FRAGMENT_SIZE)
        seacr_threshold = params.get("seacr_threshold", DEFAULT_SEACR_THRESHOLD)
        sicer2_window = params.get("sicer2_window", DEFAULT_SICER2_WINDOW)
        sicer2_gap = params.get("sicer2_gap", DEFAULT_SICER2_GAP)
        sicer2_fdr = params.get("sicer2_fdr", DEFAULT_SICER2_FDR)
        blacklist_type = params.get("blacklist", "encode_dac")
        reactions = params["reactions"]
        project_id = params["project_id"]
        experiment_id = params["experiment_id"]

        genome_display = GENOME_DISPLAY_NAMES.get(genome, genome)
        rel_job = f"projects/{project_id}/{experiment_id}/jobs/{job_id}"

        # Create output directories
        filtered_bams_dir = job_dir / "filtered_bams"
        peaks_dir = job_dir / "peaks"
        annotation_dir = job_dir / "annotation"
        qc_dir = job_dir / "qc"
        logs_dir = job_dir / "logs"
        for d in [filtered_bams_dir, peaks_dir, annotation_dir, qc_dir, logs_dir]:
            d.mkdir(parents=True, exist_ok=True)

        # Master log: consolidated output from all pipeline steps
        master_log = logs_dir / "peak_calling.log"
        append_to_master_log(
            master_log,
            f"Peak calling job {job_id} started",
            f"Genome: {genome}\nPeak caller: {peak_caller}\nPeak size: {peak_size}\n"
            f"Reactions: {len(reactions)}\nFragment filter: {fragment_filter}\n"
            f"Blacklist: {blacklist_type}",
        )

        # Local helpers that auto-pass master_log and cancelled
        def _run(cmd, **kwargs):
            return run_cmd(cmd, master_log=master_log, cancelled=cancelled, **kwargs)

        def _run_piped(cmd1, cmd2, output_path, **kwargs):
            return run_piped_cmd(
                cmd1, cmd2, output_path, master_log=master_log, cancelled=cancelled, **kwargs
            )

        # Blacklist(s) for post-peak-calling subtraction
        blacklists: list[Path] = []
        if blacklist_type == "both":
            for bl_type in ("encode_dac", "lab_custom"):
                bl = resolve_blacklist(genome, bl_type)
                if bl:
                    blacklists.append(bl)
        elif blacklist_type != "none":
            bl = resolve_blacklist(genome, blacklist_type)
            if bl:
                blacklists.append(bl)

        all_metrics: list[dict] = []
        all_top_peaks: list[dict] = []
        outputs: list[dict] = []
        # Cache filtered IgG BAMs (shared across reactions)
        igg_filtered_cache: dict[str, Path] = {}

        for rxn in reactions:
            short_name = rxn["short_name"]
            reaction_id = rxn["reaction_id"]

            logger.info("peak_calling.reaction_start", short_name=short_name, caller=peak_caller)

            # ---- Step 1: Locate input BAM ----
            input_bam = Path(settings.STORAGE_ROOT) / rxn["bam_path"]
            if not input_bam.exists():
                raise PipelineError(f"Input BAM not found: {input_bam}")

            # ---- Step 2: Fragment size filter ----
            if fragment_filter:
                filtered_bam = filtered_bams_dir / f"{short_name}_filtered.bam"
                _apply_fragment_filter(input_bam, filtered_bam, fragment_size)
                call_bam = filtered_bam
            else:
                call_bam = input_bam

            # ---- Step 3: Resolve IgG control BAM ----
            control_bam = None
            igg_bam_path = rxn.get("igg_bam_path")
            if igg_bam_path:
                if fragment_filter:
                    # Filter IgG once, cache for reuse across reactions
                    if igg_bam_path not in igg_filtered_cache:
                        igg_abs = Path(settings.STORAGE_ROOT) / igg_bam_path
                        if igg_abs.exists():
                            igg_filtered = filtered_bams_dir / "IgG_filtered.bam"
                            _apply_fragment_filter(igg_abs, igg_filtered, fragment_size)
                            igg_filtered_cache[igg_bam_path] = igg_filtered
                        else:
                            logger.warning("peak_calling.igg_bam_not_found", path=str(igg_abs))
                    control_bam = igg_filtered_cache.get(igg_bam_path)
                else:
                    igg_abs = Path(settings.STORAGE_ROOT) / igg_bam_path
                    control_bam = igg_abs if igg_abs.exists() else None

            # ---- Step 4: Peak calling dispatch ----
            if peak_caller == "MACS2" and peak_size == "narrow":
                peak_file, summit_file = _call_macs2_narrow(
                    call_bam,
                    control_bam,
                    genome,
                    short_name,
                    peaks_dir,
                    logs_dir,
                    q_value,
                )
            elif peak_caller == "MACS2" and peak_size == "broad":
                peak_file, summit_file = _call_macs2_broad(
                    call_bam,
                    control_bam,
                    genome,
                    short_name,
                    peaks_dir,
                    logs_dir,
                    broad_cutoff,
                )
            elif peak_caller == "SEACR":
                peak_file, summit_file = _call_seacr(
                    call_bam,
                    control_bam,
                    genome,
                    short_name,
                    peaks_dir,
                    logs_dir,
                    q_value,
                    seacr_threshold,
                    peak_size,
                )
            elif peak_caller == "SICER2":
                peak_file, summit_file = _call_sicer2(
                    call_bam,
                    control_bam,
                    genome,
                    short_name,
                    peaks_dir,
                    logs_dir,
                    sicer2_window,
                    sicer2_gap,
                    sicer2_fdr,
                )
            else:
                raise PipelineError(f"Unsupported caller/size: {peak_caller}/{peak_size}")

            # ---- Step 5: Blacklist subtraction ----
            for bl_bed in blacklists:
                if not peak_file.exists():
                    break
                bl_name = bl_bed.stem  # e.g. "mm10.blacklist" or "mm10.lab.blacklist"
                clean_peak = peaks_dir / f"{peak_file.stem}_clean{peak_file.suffix}"
                bl_cmd = ["bedtools", "subtract", "-a", str(peak_file), "-b", str(bl_bed)]
                proc = subprocess.run(
                    bl_cmd,
                    capture_output=True,
                    text=True,
                    timeout=3600,
                )
                append_to_master_log(
                    master_log,
                    f"Blacklist subtraction ({bl_name}) — {short_name} (exit {proc.returncode})",
                    proc.stderr,
                )
                if proc.returncode == 0:
                    clean_peak.write_text(proc.stdout)
                    peak_file = clean_peak
                else:
                    logger.warning(
                        "peak_calling.blacklist_subtraction_failed",
                        short_name=short_name,
                        blacklist=bl_name,
                        error=proc.stderr[-200:],
                    )

            # ---- Step 6: FRiP calculation ----
            total_reads = count_bam_reads(call_bam)
            reads_in_peaks, frip = _calculate_frip(call_bam, peak_file)

            # ---- Step 7: HOMER peak annotation ----
            annotation_file = annotation_dir / f"{short_name}_annotation.txt"
            annotation_stats = annotation_dir / f"{short_name}_annotation_stats.txt"
            homer = shutil.which("annotatePeaks.pl")
            if homer and peak_file.exists():
                homer_cmd = [homer, str(peak_file), genome, "-annStats", str(annotation_stats)]
                logger.info("pipeline.subprocess", cmd=" ".join(homer_cmd))
                proc = subprocess.run(
                    homer_cmd,
                    capture_output=True,
                    text=True,
                    timeout=7200,
                )
                append_to_master_log(
                    master_log,
                    f"HOMER annotatePeaks — {short_name} (exit {proc.returncode})",
                    proc.stderr,
                )
                if proc.returncode == 0:
                    annotation_file.write_text(proc.stdout)
                else:
                    logger.warning(
                        "peak_calling.homer_failed",
                        short_name=short_name,
                        error=proc.stderr[-300:],
                    )

            # ---- Step 8: Count peaks and extract top ----
            called_peaks_count = _count_peaks(peak_file) if peak_file.exists() else 0
            top_peaks = _extract_top_peaks(peak_file) if peak_file.exists() else []

            # ---- Step 9: Collect QC metrics ----
            control_short_name = rxn.get("igg_short_name", "")
            sig_threshold = q_value
            if peak_caller == "MACS2" and peak_size == "broad":
                sig_threshold = broad_cutoff
            elif peak_caller == "SEACR":
                sig_threshold = seacr_threshold
            elif peak_caller == "SICER2":
                sig_threshold = sicer2_fdr

            all_metrics.append(
                {
                    "short_name": short_name,
                    "control_short_name": control_short_name,
                    "reference_genome": genome_display,
                    "peak_caller": peak_caller,
                    "peak_size": peak_size.capitalize(),
                    "significance_threshold": sig_threshold,
                    "uniquely_aligned_read_pairs": total_reads,
                    "called_peaks": called_peaks_count,
                    "reads_in_peaks": reads_in_peaks,
                    "frip": frip,
                }
            )
            all_top_peaks.append(
                {
                    "short_name": short_name,
                    "control_short_name": control_short_name,
                    "reference_genome": genome_display,
                    "peak_caller": peak_caller,
                    "peak_size": peak_size.capitalize(),
                    "significance_threshold": sig_threshold,
                    "top_peaks": top_peaks,
                }
            )

            # ---- Step 10: Register output files ----
            def _add_output(path: Path, category: str, ftype: str, rid: int | None = reaction_id):
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

            _add_output(peak_file, "bed", peak_file.suffix.lstrip("."))
            _add_output(summit_file, "bed", "bed")
            if annotation_file.exists():
                _add_output(annotation_file, "annotation", "txt")
            if annotation_stats.exists():
                _add_output(annotation_stats, "annotation_stats", "txt")
            for log_file in sorted(logs_dir.glob(f"{short_name}*.log")):
                _add_output(log_file, "log", "txt")

            logger.info(
                "peak_calling.reaction_complete",
                short_name=short_name,
                peaks=called_peaks_count,
                frip=frip,
            )

        # ---- Write QC CSVs ----
        qc_csv = qc_dir / "peak_caller_metrics.csv"
        _write_peak_qc_csv(all_metrics, qc_csv)
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

        top_csv = qc_dir / "top_called_peaks.csv"
        _write_top_peaks_csv(all_top_peaks, top_csv)
        outputs.append(
            {
                "file_category": "top_peaks",
                "filename": top_csv.name,
                "file_path": f"{rel_job}/qc/{top_csv.name}",
                "file_type": "csv",
                "file_size_bytes": top_csv.stat().st_size,
                "reaction_id": None,
            }
        )

        frip_csv = qc_dir / "frip_scores.csv"
        _write_frip_csv(all_metrics, frip_csv)
        outputs.append(
            {
                "file_category": "frip",
                "filename": frip_csv.name,
                "file_path": f"{rel_job}/qc/{frip_csv.name}",
                "file_type": "csv",
                "file_size_bytes": frip_csv.stat().st_size,
                "reaction_id": None,
            }
        )

        # Consolidate individual tool logs into master log
        for log_file in sorted(logs_dir.glob("*.log")):
            if log_file.name == "peak_calling.log":
                continue
            append_to_master_log(master_log, f"Tool log: {log_file.name}", log_file.read_text())

        append_to_master_log(
            master_log,
            "Peak calling complete",
            f"Processed {len(reactions)} reactions, {len(all_metrics)} results",
        )

        # Register the master log as a job output
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

        return {
            "job_id": job_id,
            "status": "complete",
            "message": f"Peak calling completed for {len(reactions)} reactions",
            "outputs": outputs,
            "methods_text": self.generate_methods_text(params),
            "qc_metrics": all_metrics,
        }

    def mock_run(self, job_id: int, params: dict, working_dir: Path, job_dir: Path) -> dict:
        """Create real stub files on disk so file browser and downloads work."""
        time.sleep(5)

        reactions = params.get("reactions", [])
        project_id = params.get("project_id", 0)
        experiment_id = params.get("experiment_id", 0)
        peak_caller = params.get("peak_caller", "MACS2")
        peak_size = params.get("peak_size", "narrow")
        genome = params.get("reference_genome", "mm10")
        genome_display = GENOME_DISPLAY_NAMES.get(genome, genome)
        rel_job = f"projects/{project_id}/{experiment_id}/jobs/{job_id}"

        # Create output directories
        peaks_dir = job_dir / "peaks"
        annotation_dir = job_dir / "annotation"
        qc_dir = job_dir / "qc"
        logs_dir = job_dir / "logs"
        for d in [peaks_dir, annotation_dir, qc_dir, logs_dir]:
            d.mkdir(parents=True, exist_ok=True)

        # Load canned QC data from CUTANA Cloud export
        canned_metrics = _load_canned_peak_qc()
        canned_top_peaks = _load_canned_top_peaks()
        all_metrics: list[dict] = []
        all_top_peaks: list[dict] = []
        outputs: list[dict] = []

        for i, rxn in enumerate(reactions):
            short_name = rxn["short_name"]
            reaction_id = rxn["reaction_id"]
            control_short_name = rxn.get("igg_short_name", "IgG")

            # Map to canned data (cycle through)
            if canned_metrics:
                canned = canned_metrics[i % len(canned_metrics)]
                metrics = {**canned, "short_name": short_name}
            else:
                metrics = {
                    "short_name": short_name,
                    "control_short_name": control_short_name,
                    "reference_genome": genome_display,
                    "peak_caller": peak_caller,
                    "peak_size": peak_size.capitalize(),
                    "significance_threshold": params.get("q_value", DEFAULT_Q_VALUE),
                    "uniquely_aligned_read_pairs": 15000000,
                    "called_peaks": 22000,
                    "reads_in_peaks": 11000000,
                    "frip": 0.73,
                }
            all_metrics.append(metrics)

            if canned_top_peaks:
                tp = canned_top_peaks[i % len(canned_top_peaks)]
                top_entry = {**tp, "short_name": short_name}
            else:
                top_entry = {
                    "short_name": short_name,
                    "control_short_name": control_short_name,
                    "reference_genome": genome_display,
                    "peak_caller": peak_caller,
                    "peak_size": peak_size.capitalize(),
                    "significance_threshold": params.get("q_value", DEFAULT_Q_VALUE),
                    "top_peaks": [
                        f"chr{j + 1}:{1000000 + j * 5000}-{1004000 + j * 5000}" for j in range(10)
                    ],
                }
            all_top_peaks.append(top_entry)

            # Create stub peak file (valid narrowPeak/broadPeak/BED content)
            if peak_caller == "MACS2" and peak_size == "broad":
                peak_ext = "broadPeak"
            elif peak_caller == "SEACR":
                peak_ext = f"{peak_size}.sort.bed"
            elif peak_caller == "SICER2":
                peak_ext = "sicer2.bed"
            else:
                peak_ext = "narrowPeak"

            peak_file = peaks_dir / f"{short_name}_peaks.{peak_ext}"
            peak_file.write_text(
                "chr1\t1000000\t1005000\tpeak_1\t500\t.\t50.0\t10.0\t5.0\t2500\n"
                "chr2\t2000000\t2003000\tpeak_2\t400\t.\t40.0\t8.0\t4.0\t1500\n"
                "chr3\t3000000\t3004000\tpeak_3\t300\t.\t30.0\t6.0\t3.0\t2000\n"
            )

            summit_file = peaks_dir / f"{short_name}_summits.bed"
            summit_file.write_text(
                "chr1\t1002500\t1002501\nchr2\t2001500\t2001501\nchr3\t3002000\t3002001\n"
            )

            annotation_file = annotation_dir / f"{short_name}_annotation.txt"
            annotation_file.write_text(
                "PeakID\tChr\tStart\tEnd\tStrand\tAnnotation\tDetailed Annotation\n"
            )

            annotation_stats_file = annotation_dir / f"{short_name}_annotation_stats.txt"
            is_igg = not rxn.get("igg_bam_path") or short_name.lower().startswith("igg")
            if is_igg:
                # IgG-like: heavy intergenic/intron, low promoter
                annotation_stats_file.write_text(
                    "Annotation\tNumber of peaks\tTotal size (bp)\tLog2 Enrichment\n"
                    "Promoter-TSS\t800\t4000000\t0.5\n"
                    "Intron\t4500\t135000000\t0.9\n"
                    "Intergenic\t5200\t156000000\t1.1\n"
                    "Exon\t400\t6000000\t0.3\n"
                    "3' UTR\t200\t3000000\t0.2\n"
                    "5' UTR\t50\t500000\t0.1\n"
                    "TTS\t150\t1500000\t0.2\n"
                    "non-coding\t80\t800000\t0.1\n"
                )
            else:
                # Target-like: heavy promoter (H3K4me3 biology)
                annotation_stats_file.write_text(
                    "Annotation\tNumber of peaks\tTotal size (bp)\tLog2 Enrichment\n"
                    "Promoter-TSS\t8500\t42500000\t3.2\n"
                    "Intron\t5000\t150000000\t0.5\n"
                    "Intergenic\t3000\t90000000\t-0.5\n"
                    "Exon\t3500\t52500000\t1.8\n"
                    "3' UTR\t800\t12000000\t0.7\n"
                    "5' UTR\t400\t4000000\t0.8\n"
                    "TTS\t500\t5000000\t0.4\n"
                    "non-coding\t200\t2000000\t0.2\n"
                )

            log_file = logs_dir / f"{short_name}_macs2.log"
            log_file.write_text(f"Mock peak calling log for {short_name}\n")

            # Register outputs
            stub_files = [
                (peak_file, "bed", peak_ext.split(".")[-1]),
                (summit_file, "bed", "bed"),
                (annotation_file, "annotation", "txt"),
                (annotation_stats_file, "annotation_stats", "txt"),
                (log_file, "log", "txt"),
            ]
            for path, category, ftype in stub_files:
                outputs.append(
                    {
                        "file_category": category,
                        "filename": path.name,
                        "file_path": f"{rel_job}/{path.relative_to(job_dir)}",
                        "file_type": ftype,
                        "file_size_bytes": path.stat().st_size,
                        "reaction_id": reaction_id,
                    }
                )

            logger.info("peak_calling.mock_reaction_complete", short_name=short_name)

        # Write QC CSVs
        qc_csv = qc_dir / "peak_caller_metrics.csv"
        _write_peak_qc_csv(all_metrics, qc_csv)
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

        top_csv = qc_dir / "top_called_peaks.csv"
        _write_top_peaks_csv(all_top_peaks, top_csv)
        outputs.append(
            {
                "file_category": "top_peaks",
                "filename": top_csv.name,
                "file_path": f"{rel_job}/qc/{top_csv.name}",
                "file_type": "csv",
                "file_size_bytes": top_csv.stat().st_size,
                "reaction_id": None,
            }
        )

        frip_csv = qc_dir / "frip_scores.csv"
        _write_frip_csv(all_metrics, frip_csv)
        outputs.append(
            {
                "file_category": "frip",
                "filename": frip_csv.name,
                "file_path": f"{rel_job}/qc/{frip_csv.name}",
                "file_type": "csv",
                "file_size_bytes": frip_csv.stat().st_size,
                "reaction_id": None,
            }
        )

        return {
            "job_id": job_id,
            "status": "complete",
            "message": f"Mock peak calling completed for {len(reactions)} reactions",
            "outputs": outputs,
            "methods_text": self.generate_methods_text(params),
            "qc_metrics": all_metrics,
        }

    def generate_methods_text(self, params: dict) -> str:
        return peak_calling_methods(params)
