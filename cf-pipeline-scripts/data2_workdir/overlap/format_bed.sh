#!/bin/bash

# Set the directory containing the BED files (can be "." for current directory)
BED_DIR="."

# Output directory for modified files
OUTPUT_DIR="modified_beds"
mkdir -p "$OUTPUT_DIR"

# Loop through all BED files in the directory
for bedfile in "$BED_DIR"/*.bed; do
    filename=$(basename "$bedfile")
    output_file="$OUTPUT_DIR/${filename%.bed}_modified.bed"

    echo "Processing $filename..."

    awk 'BEGIN{OFS="\t"} {print $0, "peak_"NR, "+", "1000"}' "$bedfile" > "$output_file"
done

echo "All BED files processed. Modified files are in: $OUTPUT_DIR"
