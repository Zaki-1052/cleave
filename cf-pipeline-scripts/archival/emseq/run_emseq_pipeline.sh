#!/bin/bash

#define file locations and samples
samples_file=$1
fastq_dir="/data/rs_256/emseq_fastq"
genome_dir="/data/rs_256/emseq_workdir/genome"
workdir="/data/rs_256/emseq_workdir"
trimmed_dir="/data/rs_256/emseq_workdir/trimmed"
aligned_dir="/data/rs_256/emseq_workdir/aligned"

#check if file paths are found
if [[ ! -f "$samples_file" ]]; then
  echo "sample list file '$samples_file' not found!"
  exit 1
fi

mkdir -p "$trimmed_dir" "$aligned_dir"
mapfile -t samples < "$samples_file"

#trim files with trim galore

echo "trimming reads with trim galore..." 

for sample in "${samples[@]}"; do
  R1="$fastq_dir/${sample}_R1_001.fastq.gz"
  R2="$fastq_dir/${sample}_R2_001.fastq.gz"
  OUT1="$trimmed_dir/${sample}_R1_001_val_1.fq.gz"
  OUT2="$trimmed_dir/${sample}_R2_001_val_2.fq.gz"

if [[ -f "$OUT1" && -f "$OUT2" ]]; then
    echo "Skipping trimming for $sample (output already exists)"
  else
    echo "Trimming paired-end reads for $sample..."
    trim_galore --paired --output_dir "$trimmed_dir" "$R1" "$R2"
  fi
done

#aligning with Bismark

echo "aligning trimmed reads with Bismark..."

 for sample in "${samples[@]}"; do
  R1_TRIM="$trimmed_dir/${sample}_R1_001_val_1.fq.gz"
  R2_TRIM="$trimmed_dir/${sample}_R2_001_val_2.fq.gz"
  OUT_BAM="$aligned_dir/${sample}_bismark_bt2_pe.bam"

  if [[ -f "$OUT_BAM" ]]; then
    echo "skipping alignment for $sample (BAM already exists)"
  else
    echo "aligning $sample..."
    bismark "$genome_dir" \
      -1 "$R1_TRIM" -2 "$R2_TRIM" \
      --output_dir "$aligned_dir" \
      --basename "$sample"
  fi
done

echo "done: All alignments saved to "$aligned_dir""
