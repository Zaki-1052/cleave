#!/bin/bash

## Store all sample IDS in an array
sample="start"
declare -a samples
while [ $sample != "N" ]
do
	echo "Enter another bam file or enter 'N' to continue"
	read sample
	if [ $sample != "N" ]
	then
		samples+=($sample)
	fi
	echo
done

## store all sorted sample IDs in new array
declare -a sorted

# sort all bam files
for index in "${samples[@]}"
do
	file=${index} 
	echo "sorting "${file}
	samtools sort ${file} > "sorted_${file}"
	sorted+=("sorted_${file}")

done

# index all sorted bam files and create normalized bigwig
for index in "${sorted[@]}"
do
	file=${index}
	echo "indexing bam: "${file}
	samtools index ${file}
#	bamCoverage -b "${file}" --effectiveGenomeSize 2467481108 --normalizeUsing RPKM -o "${file}"_norm.bw
	echo done processing ${file}
done

#for file in  *index_17_*.bam *index_18_*.bam *index_19_*.bam *index_20_*.bam *index_21_*.bam *index_22_*.bam *index_23_*.bam *index_24_*.bam
#do
#	samtools sort "${file}" > sorted_"${file}"
#done

#for file in sorted_*index_17_*.bam sorted_*index_18_*.bam sorted_*index_19_*.bam sorted_*index_20_*.bam sorted_*index_21_*.bam sorted_*index_22_*.bam sorted_*index_23_*.bam sorted_*index_24_*.bam
#do
#	samtools index "${file}"
#	bamCoverage -b "${file}" --effectiveGenomeSize 2467481108 --normalizeUsing RPKM -o "${file}"_norm.bw
#done
