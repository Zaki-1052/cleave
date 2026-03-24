#!/bin/bash

# TOBIAS Pipeline for ATAC-seq Analysis
# Author: Generated for ATAC-seq footprinting analysis

set -e  # Exit on any error

### Set directories and parameters

# Base directories
BASE_DIR="/data2/rs_256/workdir/TOBIAS/tobias_output"
TOBIAS_DIR="${BASE_DIR}/ctrl_mut"
OUTPUT_DIR="${BASE_DIR}/TF_plots"
REFERENCE_DIR="/home/ubuntu/cutruntools/assemblies/chrom.mm10"

echo 'Atoh1_MA0461.3 BHLHE22_MA0818.2 ZIC5_MA1584.2 NFIX_MA1528.2 RORC_MA1151.2' > TF_names.txt

TOBIAS PlotChanges \
    --bindetect ${TOBIAS_DIR}/bindetect_results.txt \
    --TFS TF_names.txt


