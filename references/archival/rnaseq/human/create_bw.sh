#!/bin/bash

#echo "sorting"
#for file in 1M_ctrl_S73Aligned.toTranscriptome.out.bam 2F_ctrl_S75Aligned.toTranscriptome.out.bam
#do
#          echo "file: ${file}"
#          samtools sort ${file} > sorted_${file}
#done

echo "indexing and converting to bw"
for file in 230814G7UDI0053gRNA3doxpcl_S3Aligned.sortedByCoord.out.bam 230814H7UDI0054gRNA3doxpcl_S4Aligned.sortedByCoord.out.bam UDP0055_S5Aligned.sortedByCoord.out.bam UDP0056_S6Aligned.sortedByCoord.out.bam
do 
	echo "file: {$file}"
	samtools index ${file}
	bamCoverage -b "${file}" -o "${file}".bw
done
#rm sorted_*
