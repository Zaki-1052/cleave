#!/bin/bash

cd 230216_old_filtering
mkdir filtered

for FILE in *.bed; do
	if [ ${FILE} = "masked_regions.bed" ]; then
		continue
	fi
	#echo ${FILE}
	FILE_TRUNC=${FILE%.*}
	#echo ${FILE_TRUNC}
	echo "filtering ${FILE_TRUNC}"
	#echo "outfile ${FILE_TRUNC}_filtered.bed"
	bedtools intersect -a ${FILE} -b ../masked_regions.bed -v > filtered/${FILE_TRUNC}_filtered.bed 
	echo "outfile filtered/${FILE_TRUNC}_filtered.bed"
	echo
done
