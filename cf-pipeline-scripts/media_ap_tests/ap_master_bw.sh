#!/usr/bin/env bash
# Only need to pass in R1
# Assumes ssh-ed in successfully

# if no command line arguments provided
if [ $# -ne 1 ]
  then
    echo "Not enough arguments supplied"
	echo
	echo "Proper Usage - bash ap_generate_bw.sh <full FASTQ file name>"   
	exit 1
fi
# FileName is the first Command Line Input
BAM=$1

cd /data/rs_256/workdir/aligned.aug10
if [ -s $BAM ]; then
    echo "Remote BW: BAM found successfully"
else
    echo "Remote BW: First stage failed. BAM not found"
    exit 1
fi

# Create BigWigs
printf  "$BAM\nN\n" | ./ap_create_bams_without_bw.sh

if [ $? -eq 0 ] && [ -s sorted_${BAM}_norm.bw ]; then
	echo Remote BW: Done Creating BW sorted_${BAM}_norm.bw
else
	echo Remote BW: Failed Creating BW sorted_${BAM}_norm.bw
fi
