#!/bin/bash

# set up paths
bam_list="$1"
aligned_dir="/data/rs_256/emseq_workdir/aligned"
methyl_dir="/data/rs_256/emseq_workdir/methylation"
genome_dir="/data/rs_256/emseq_workdir/genome"

if [[ -z "$bam_list" || ! -f "$bam_list" ]]; then
  echo "please provide a valid list of BAM files to process."
  echo "Usage: $0 emseq_bam_list.txt"
  exit 1
fi

mkdir -p "$methyl_dir"

while IFS= read -r BAM_FILE; do
  # Support either relative name or full path
  if [[ ! -f "$BAM_FILE" ]]; then
    BAM_FILE="$aligned_dir/$BAM_FILE"
  fi

  if [[ ! -f "$BAM_FILE" ]]; then
    echo "Skipping: BAM file not found: $BAM_FILE"
    continue
  fi

SAMPLE=$(basename "$BAM_FILE" _bismark_bt2_pe.bam)
  SORTED_BAM="$methyl_dir/${SAMPLE}_sorted.bam"

  echo "Sorting $SAMPLE by read name."
  samtools sort -n -o "$SORTED_BAM" "$BAM_FILE"

  echo "Extracting methylation for $SAMPLE..."
bismark_methylation_extractor \
    --paired-end \
    --comprehensive \
    --bedGraph \
    --buffer_size 10G \
    --cytosine_report \
    --genome_folder "$genome_dir" \
    --output "$methyl_dir" \
    "$SORTED_BAM"

done < "$bam_list"
