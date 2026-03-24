#!/bin/bash

# Create output directories
mkdir -p chr1_3 chr4_6 chr7_9 chr10_12 chr13_15 chr16_19X
 
for file in contacts*.txt; do
    base=$(basename "$file" .txt)

     # chr1–chr3
    grep -E '^chr([1-3])[[:space:]]' "$file" > "chr1_3/${base}_chr1_3.txt"
    
    # chr4–chr6
    grep -E '^chr([4-6])[[:space:]]' "$file" > "chr4_6/${base}_chr4_6.txt"

    # chr7–chr9
    grep -E '^chr([7-9])[[:space:]]' "$file" > "chr7_9/${base}_chr7_9.txt"

    # chr10–chr12   
    grep -E '^chr(1[0-2])[[:space:]]' "$file" > "chr10_12/${base}_chr10_12.txt"

    # chr13–chr15
    grep -E '^chr(1[3-5])[[:space:]]' "$file" > "chr13_15/${base}_chr13_15.txt" 
                                                                                                       
    # chr16–chr19,X
    grep -E '^chr(1[6-9]|X)[[:space:]]' "$file" > "chr16_19X/${base}_chr16_19X.txt"

done
