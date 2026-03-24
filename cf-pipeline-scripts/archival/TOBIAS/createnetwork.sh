#!/bin/bash

set -e  # Exit on any error

BASE_DIR="/data2/rs_256/workdir/TOBIAS/tobias_outputs"
OUTPUT_DIR="${BASE_DIR}/CreateNetwork"
mkdir -p $OUTPUT_DIR

# Create network based on differential binding
TOBIAS CreateNetwork \
    --TFBS ${OUTPUT_DIR}/ctrl_mut \
    --origin ${OUTPUT_DIR}/CreateNetwork/network_origin.txt \
    --network ${OUTPUT_DIR}/CreateNetwork/TF_network.txt \
    --TFS ${OUTPUT_DIR}/CreateNetwork/TF_list.txt
