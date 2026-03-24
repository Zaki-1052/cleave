#!/bin/bash

# TOBIAS Pipeline for ATAC-seq Analysis

set -e  # Exit on any error

### Set directories and parameters

# Base directories
BASE_DIR="/data2/rs_256/workdir"
DATA_DIR="${BASE_DIR}/aligned.aug10/sorted"
OUTPUT_DIR="${BASE_DIR}/TOBIAS/tobias_output"
REFERENCE_DIR="/home/ubuntu/cutruntools/assemblies/chrom.mm10"

# Reference files (update paths as needed)
GENOME_FASTA="${REFERENCE_DIR}/mm10.fa"
GENOME_INDEX="${REFERENCE_DIR}/mm10.fa.fai"
BLACKLIST_BED="/data2/rs_256/workdir/Func_annotation_v2/250123blacklist.bed"
MOTIF_DB="${BASE_DIR}/TOBIAS/JASPAR_Database/JASPAR2024_CORE_vertebratesant_pfms_jaspar.txt"  # or .meme format

# Sample information
CTRL_BAM="${BASE_DIR}/TOBIAS/merged/bam/ctrl_merged_ATAC.bam"
MUT_BAM="${BASE_DIR}/TOBIAS/merged/bam/mut_merged_ATAC.bam"
CTRL_PEAKS="${BASE_DIR}/TOBIAS/merged/peaks/ctrl_merged.narrowPeak"
MUT_PEAKS="${BASE_DIR}/TOBIAS/merged/peaks/mut_merged.narrowPeak"
### Calculate footprinting scores

# Calculate scores for ctrl
TOBIAS FootprintScores \
    --signal ${OUTPUT_DIR}/atacorrect/ctrl/ctrl_merged_ATAC_corrected.bw \
    --regions $CTRL_PEAKS \
    --output ${OUTPUT_DIR}/atacorrect/ctrl/ctrl_footprint.bw \
    --cores 14
 
# Calculate scores for ctrl
 TOBIAS FootprintScores \
    --signal ${OUTPUT_DIR}/atacorrect/mut/mut_merged_ATAC_corrected.bw \
    --regions $MUT_PEAKS \
    --output ${OUTPUT_DIR}/atacorrect/mut/mut_footprint.bw \
    --cores 14

### Prepare a unified peakset for comparative analysis

mkdir -p ${OUTPUT_DIR}/ctrl_mut

# Combine peaks from both conditions into a unified set
cat $CTRL_PEAKS \
    $MUT_PEAKS | \
    sort -k1,1 -k2,2n | \
    bedtools merge > ${OUTPUT_DIR}/ctrl_mut/ctrl_mut_combined.narrowPeak

# Annotate combined peaks with nearby genes
uropa \
    --bed ${OUTPUT_DIR}/ctrl_mut/ctrl_mut_combined.narrowPeak \
    --gtf ~/rnaseq/mouse/gencode.vM10.annotation.gtf \
    --show_attributes gene_id gene_name \
    --feature_anchor start \
    --distance 20000 10000 \
    --feature gene \
    -o ${OUTPUT_DIR}/ctrl_mut

# Extract header for the annotated peaks
cut -f 1-6,16-17 ${OUTPUT_DIR}/ctrl_mut/ctrl_mut_combined_finalhits.txt | \
	head -n 1 > ${OUTPUT_DIR}/ctrl_mut/ctrl_mut_combined_finalhits_header.txt
 
# Match the header and the annotated peaks
cut -f 1-6,16-17 ${OUTPUT_DIR}/ctrl_mut/ctrl_mut_combined_finalhits.txt > \
	${OUTPUT_DIR}/ctrl_mut/ctrl_mut_combined_finalhits_2.bed
 
# Filter for standard chromosomes only (removes contigs and alternative assemblies)
grep -E '^chr[0-9XY]+\s' ${OUTPUT_DIR}/ctrl_mut/ctrl_mut_combined_finalhits_2.bed > \
	${OUTPUT_DIR}/ctrl_mut/ctrl_mut_combined_finalhits_3.bed

### Detect Differential Testing

# Identify differential TF binding sites between ctrl and mut
TOBIAS BINDetect \
    --motifs $MOTIF_DB \
    --signals ${OUTPUT_DIR}/atacorrect/ctrl/ctrl_footprint.bw \
             ${OUTPUT_DIR}/atacorrect/mut/mut_footprint.bw \
    --genome $GENOME_FASTA \
    --peaks ${OUTPUT_DIR}/ctrl_mut/ctrl_mut_combined_finalhits_3.bed \
    --peak_header ${OUTPUT_DIR}/ctrl_mut/ctrl_mut_combined_finalhits_header.txt \
    --outdir ${OUTPUT_DIR}/ctrl_mut \
    --cond_names ctrl mut \
    --cores 14

echo "TOBIAS analysis complete"
