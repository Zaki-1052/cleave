# backend/pipelines/methods_text.py
"""Reusable methods text generators for pipeline stages.

Each function produces manuscript-ready text describing the exact tools,
versions, and parameters used — suitable for copy-paste into a Methods section.
"""

# Correct per-genome effective genome sizes (cleave-spec-decisions.md §7)
EFFECTIVE_GENOME_SIZES = {
    "mm10": 2_467_481_108,
    "hg38": 2_913_022_398,
    "hg19": 2_864_785_220,
    "dm6": 142_573_017,
    "sacCer3": 12_157_105,
}

# Human-readable genome names for methods text
GENOME_DISPLAY_NAMES = {
    "mm10": "Mouse mm10",
    "hg38": "Human GRCh38/hg38",
    "hg19": "Human hg19",
    "dm6": "Drosophila dm6",
    "sacCer3": "Yeast sacCer3",
}


def alignment_methods(params: dict) -> str:
    """Generate alignment methods text matching CUTANA Cloud format.

    Reference: cutana/H3K4me3/methods.txt
    """
    genome = params.get("reference_genome", "mm10")
    genome_display = GENOME_DISPLAY_NAMES.get(genome, genome)
    remove_dups = params.get("remove_duplicates", True)
    remove_dac = params.get("remove_dac_exclusion", True)
    bin_size = params.get("bam_coverage_bin_size", 20)
    smoothed_bin_size = params.get("smoothed_bin_size", 100)
    eff_size = EFFECTIVE_GENOME_SIZES.get(genome, 0)

    text = (
        f"Paired-end reads were aligned to the {genome_display} reference genome "
        f"using Bowtie2 (--dovetail --phred33). "
        f"Multi-aligned reads (MAPQ < 10) were removed using SAMtools. "
    )
    if remove_dac:
        text += "Reads mapping to ENCODE DAC Exclusion List regions were removed using BEDTools. "
    if remove_dups:
        text += "Duplicate reads were identified with Picard MarkDuplicates and removed. "
    text += (
        f"RPKM-normalized bigWig files were generated via deepTools bamCoverage "
        f"(--binSize {bin_size}, effectiveGenomeSize {eff_size}). "
        f"Smoothed bigWig files were generated with --binSize {smoothed_bin_size} "
        f"for IGV visualization. "
        f"Enrichment at transcription start sites (reference-point mode) and "
        f"annotated gene bodies (scale-regions mode) was computed using deepTools "
        f"computeMatrix and visualized with plotHeatmap."
    )
    return text
