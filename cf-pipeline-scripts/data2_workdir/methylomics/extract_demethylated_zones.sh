#!/bin/bash

# Usage: ./extract_demethylated_zones.sh input.bedGraph output.bed

# Input and output files
METHYL_BDG=$1   # Input methylomics BedGraph file
OUTPUT_BED=$2   # Output file for demethylated zones

# Threshold for demethylation (adjustable)
THRESHOLD=0.3

# Ensure correct usage
if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <input.bedGraph> <output.bed>"
    exit 1
fi

# Step 1: Filter for low-methylation regions (≤ THRESHOLD)
awk -v thr="$THRESHOLD" '$4 <= thr' "$METHYL_BDG" > low_methylation.bedGraph

# Step 2: Convert BedGraph to BED (remove methylation scores)
cat low_methylation.bedGraph | awk '{print $1 "\t" $2 "\t" $3}' > low_methylation.bed

# Step 3: Merge adjacent/overlapping regions
sort -k1,1 -k2,2n low_methylation.bed | bedtools merge -i - > merged_regions.bed

# Step 4: Extract regions of at least 1000 bp
awk '($3 - $2) >= 1000 && ($3 - $2) <= 5000' merged_regions.bed > "$OUTPUT_BED"

# Cleanup intermediate files
rm low_methylation.bedGraph low_methylation.bed merged_regions.bed

echo "Demethylated zones (≥1000 bp) saved in: $OUTPUT_BED"
