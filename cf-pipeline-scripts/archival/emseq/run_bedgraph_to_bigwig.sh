#!/bin/bash

# Usage: ./bedgraph_to_bigwig.sh bedgraph_list.txt mm10.chrom.sizes

BEDGRAPH_LIST="$1"
CHROM_SIZES="$2"
BIGWIG_DIR="/data/rs_256/emseq_workdir/bigwigs"

mkdir -p "$BIGWIG_DIR"

# Input checks
if [[ ! -f "$BEDGRAPH_LIST" ]]; then
  echo "BedGraph list not found: $BEDGRAPH_LIST"
  echo "Usage: $0 bedgraph_list.txt mm10.chrom.sizes"
  exit 1
fi

if [[ ! -f "$CHROM_SIZES" ]]; then
  echo "Chromosome sizes file not found: $CHROM_SIZES"
  exit 1
fi

# Loop through specified .bedGraph.gz files
while IFS= read -r BEDGRAPH_GZ; do
  if [[ ! -f "$BEDGRAPH_GZ" ]]; then
    echo "Skipping: file not found: $BEDGRAPH_GZ"
    continue
  fi

  SAMPLE=$(basename "$BEDGRAPH_GZ" .bedGraph.gz)
  SORTED_BG="$BIGWIG_DIR/${SAMPLE}.sorted.bedGraph"
  BIGWIG="$BIGWIG_DIR/${SAMPLE}.bw"

 # Skip if BigWig already exists
  if [[ -f "$BIGWIG" ]]; then
    echo "✅ Skipping $SAMPLE — BigWig already exists."
    continue
  fi

  echo "Converting $SAMPLE to BigWig..."

  zcat "$BEDGRAPH_GZ" | sort -k1,1 -k2,2n > "$SORTED_BG"

  bedGraphToBigWig "$SORTED_BG" "$CHROM_SIZES" "$BIGWIG"

done < "$BEDGRAPH_LIST"

