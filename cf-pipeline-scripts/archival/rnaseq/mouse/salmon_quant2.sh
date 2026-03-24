#!/bin/bash

fastq_dir="/home/ubuntu/rnaseq/mouse/fastqs"

prefix="$1"

salmon quant -i vM10_index/ --libType A -1 $fastq_dir/${prefix}_R1_001.fastq.gz -2 $fastq_dir/${prefix}_R2_001.fastq.gz -p 13 --gcBias --validateMappings -o salmon_quant_output/${prefix}.quant
					
