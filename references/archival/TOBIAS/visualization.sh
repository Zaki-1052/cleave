#!/bin/bash

# TOBIAS Pipeline for ATAC-seq Analysis
# Author: Generated for ATAC-seq footprinting analysis

set -e  # Exit on any error

### Set directories and parameters

TF=$1
# Base directories
BASE_DIR="/data2/rs_256/workdir/TOBIAS/tobias_output"
TOBIAS_DIR="${BASE_DIR}/ctrl_mut"
OUTPUT_DIR="${BASE_DIR}/TF_plots"
REFERENCE_DIR="/home/ubuntu/cutruntools/assemblies/chrom.mm10"

mkdir -p ${OUTPUT_DIR}/${TF}

#Sample files
CTRL_corrected="${BASE_DIR}/atacorrect/ctrl/ctrl_merged_ATAC_corrected.bw"
MUT_corrected="${BASE_DIR}/atacorrect/mut/mut_merged_ATAC_corrected.bw"

# Plot aggregate footprints for specified TF across conditions
TOBIAS PlotAggregate \
    --TFBS ${TOBIAS_DIR}/${TF}/beds/${TF}_ctrl_bound.bed \
           ${TOBIAS_DIR}/${TF}/beds/${TF}_mut_bound.bed \
    --signals $CTRL_corrected \
			$MUT_corrected \
	--output ${OUTPUT_DIR}/${TF}/footprint_aggregate.png \
    --share_y both \
    --plot_boundaries \
    --signal_labels ctrl mut \
    --smooth 5

# Create heatmaps comparing bound and unbound sites between conditions
TOBIAS PlotHeatmap \
    --TFBS ${TOBIAS_DIR}/${TF}/beds/${TF}_ctrl_bound.bed \
			${TOBIAS_DIR}/${TF}/beds/${TF}_ctrl_unbound.bed \
    --TFBS ${TOBIAS_DIR}/${TF}/beds/${TF}_mut_bound.bed \
			${TOBIAS_DIR}/${TF}/beds/${TF}_mut_unbound.bed \
	--signals $CTRL_corrected \
              $MUT_corrected \
	--output ${OUTPUT_DIR}/${TF}/footprint_heatmap.png \
	--signal_labels ctrl mut \
    --share_colorbar \
    --sort_by -1


