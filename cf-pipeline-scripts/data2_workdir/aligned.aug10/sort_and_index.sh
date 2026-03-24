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
	echo "indexing and creating bigwig for "${file}
	samtools index ${file}
	echo done processing ${file}
done
