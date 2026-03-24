#!/bin/bash

fastq_dir="/data2/rs_256/rnaseq/mouse/fastqs"

prefix="$1"

#
for i in "$fastq_dir"/*_R1.fast.gz; do
	#Extract sample name from file name
	sample_name=$(basename "$i" _R1.fastq.gz)

	#Define output file names
	quant_file="salmon_quant_output/$sample_name.quant"
	
	#Run Salmon
	salmon quant 	-i vM10_index \
					--libType A \
					-1 "$fastq_dir"/"$sample_name"_R1.fastq.gz \
					-2 "$fastq_dir"/"$sample_name"_R2.fastq.gz \
					-p 13 --gcBias \
					-o $quant_file \

	#Print progress
    echo "Salmon quantification completed for sample $sample_name"

done
					
