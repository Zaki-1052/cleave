#!/bin/bash

# Define the directory containing BED files
BED_DIR="/data/rs_256/workdir/blklist_subtract/to_subtract"

# Define the blacklisted peak BED file to subtract from all others
Blacklist_BED="/data/rs_256/workdir/blklist_subtract/250123blacklist.bed"

# Create an output directory for subtracted files
mkdir -p subtracted_bedfiles

# Loop through all BED files in the directory
for file in "$BED_DIR"/*.bed; do

    # Perform bedtools subtract
    bedtools subtract -a "$file" -b "$Blacklist_BED" > "subtracted_bedfiles/$(basename "$file" .bed)_subtracted.bed" || echo "Error with $file"    
	
    echo "Processed: $file"
done
