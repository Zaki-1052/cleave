# backend/pipelines/spike_in_barcodes.py
"""SNAP-CUTANA K-MetStat Panel spike-in barcode counting and normalization.

Reference: references/media_misc/k_metstat_script.sh (Dr. Bryan Venters, EpiCypher)
All 32 barcode sequences (16 PTMs x 2 barcodes A+B) are published and non-proprietary.
"""

import subprocess
from pathlib import Path

import structlog

logger = structlog.get_logger(__name__)

# Canonical PTM order matching the K-MetStat Panel
PTM_NAMES: list[str] = [
    "Unmodified",
    "H3K4me1",
    "H3K4me2",
    "H3K4me3",
    "H3K9me1",
    "H3K9me2",
    "H3K9me3",
    "H3K27me1",
    "H3K27me2",
    "H3K27me3",
    "H3K36me1",
    "H3K36me2",
    "H3K36me3",
    "H4K20me1",
    "H4K20me2",
    "H4K20me3",
]

# 16 PTMs -> (barcode_A, barcode_B) from k_metstat_script.sh lines 76-138
K_METSTAT_BARCODES: dict[str, tuple[str, str]] = {
    "Unmodified": ("TTCGCGCGTAACGACGTACCGT", "CGCGATACGACCGCGTTACGCG"),
    "H3K4me1": ("CGACGTTAACGCGTTTCGTACG", "CGCGACTATCGCGCGTAACGCG"),
    "H3K4me2": ("CCGTACGTCGTGTCGAACGACG", "CGATACGCGTTGGTACGCGTAA"),
    "H3K4me3": ("TAGTTCGCGACACCGTTCGTCG", "TCGACGCGTAAACGGTACGTCG"),
    "H3K9me1": ("TTATCGCGTCGCGACGGACGTA", "CGATCGTACGATAGCGTACCGA"),
    "H3K9me2": ("CGCATATCGCGTCGTACGACCG", "ACGTTCGACCGCGGTCGTACGA"),
    "H3K9me3": ("ACGATTCGACGATCGTCGACGA", "CGATAGTCGCGTCGCACGATCG"),
    "H3K27me1": ("CGCCGATTACGTGTCGCGCGTA", "ATCGTACCGCGCGTATCGGTCG"),
    "H3K27me2": ("CGTTCGAACGTTCGTCGACGAT", "TCGCGATTACGATGTCGCGCGA"),
    "H3K27me3": ("ACGCGAATCGTCGACGCGTATA", "CGCGATATCACTCGACGCGATA"),
    "H3K36me1": ("CGCGAAATTCGTATACGCGTCG", "CGCGATCGGTATCGGTACGCGC"),
    "H3K36me2": ("GTGATATCGCGTTAACGTCGCG", "TATCGCGCGAAACGACCGTTCG"),
    "H3K36me3": ("CCGCGCGTAATGCGCGACGTTA", "CCGCGATACGACTCGTTCGTCG"),
    "H4K20me1": ("GTCGCGAACTATCGTCGATTCG", "CCGCGCGTATAGTCCGAGCGTA"),
    "H4K20me2": ("CGATACGCCGATCGATCGTCGG", "CCGCGCGATAAGACGCGTAACG"),
    "H4K20me3": ("CGATTCGACGGTCGCGACCGTA", "TTTCGACGCGTCGATTCGGCGA"),
}


def _grep_count(barcode: str, fq_path: Path) -> int:
    """Count occurrences of a barcode in a FASTQ file using zgrep (handles .gz)."""
    cmd = ["zgrep", "-c", barcode, str(fq_path)]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    # zgrep returns exit code 1 when count is 0 — not an error
    if proc.returncode > 1:
        logger.warning(
            "spike_in.grep_error",
            barcode=barcode[:10],
            path=str(fq_path),
            stderr=proc.stderr[:200],
        )
        return 0
    return int(proc.stdout.strip()) if proc.stdout.strip() else 0


def count_barcodes(r1_path: Path, r2_path: Path) -> dict[str, int]:
    """Count all 32 K-MetStat barcodes in paired FASTQ files.

    Sums A+B barcode counts for each PTM across both R1 and R2 files.
    Returns {ptm_name: total_count} for all 16 PTMs.
    """
    ptm_counts: dict[str, int] = {}
    for ptm_name, (barcode_a, barcode_b) in K_METSTAT_BARCODES.items():
        count_a = _grep_count(barcode_a, r1_path) + _grep_count(barcode_a, r2_path)
        count_b = _grep_count(barcode_b, r1_path) + _grep_count(barcode_b, r2_path)
        ptm_counts[ptm_name] = count_a + count_b
    return ptm_counts


def normalize_counts(
    ptm_counts: dict[str, int],
    on_target_ptm: str | None,
) -> dict[str, float]:
    """Normalize raw barcode counts to percentage recovery.

    For target antibodies (e.g. H3K4me3): normalize to on-target PTM count.
    For IgG (on_target_ptm is None): normalize to the maximum PTM count.
    Per CUTANA docs: <20% off-target recovery indicates assay success.
    """
    if on_target_ptm and on_target_ptm in ptm_counts:
        ref_count = ptm_counts[on_target_ptm]
    else:
        ref_count = max(ptm_counts.values()) if ptm_counts else 0

    if ref_count == 0:
        return {ptm: 0.0 for ptm in ptm_counts}

    return {ptm: round(count / ref_count * 100, 2) for ptm, count in ptm_counts.items()}
