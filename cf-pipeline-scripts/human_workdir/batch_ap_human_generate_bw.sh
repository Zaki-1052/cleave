#!/bin/bash

FILES=(
    "2401216_index_9_HCC38_Ctrl_H3K27ac_S9_L003_R1_001.fastq.gz"
    "2401216_index_10_HCC38_Nic_H3K27ac_S10_L003_R1_001.fastq.gz"
)

for FILE in "${FILES[@]}"
do
    echo "Processing $FILE..."
    bash ap_generate_bw.sh "$FILE"
    echo "Finished processing $FILE"
done

echo "All samples processed!"
