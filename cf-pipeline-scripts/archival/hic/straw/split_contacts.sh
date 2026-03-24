#!/bin/bash

# Create output directories
mkdir -p chr1_5 chr6_10 chr11_15 chr16_19X

for file in contacts*.txt; do
    base=$(basename "$file" .txt)

    # chr1–chr5
    grep -E '^chr([1-5])[[:space:]]' "$file" > "chr1_5/${base}_chr1_5.txt"

    # chr6–chr10
    grep -E '^chr([6-9]|10)[[:space:]]' "$file" > "chr6_10/${base}_chr6_10.txt"

    # chr11–chr15
    grep -E '^chr(1[1-5])[[:space:]]' "$file" > "chr11_15/${base}_chr11_15.txt"

    # chr16–chr19,X
    grep -E '^chr(1[6-9]|X)[[:space:]]' "$file" > "chr16_19X/${base}_chr16_19X.txt"
done
