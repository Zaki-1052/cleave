#!/bin/bash

#echo "sorting"
#for file in 1M_ctrl_S73Aligned.toTranscriptome.out.bam 2F_ctrl_S75Aligned.toTranscriptome.out.bam
#do
#          echo "file: ${file}"
#          samtools sort ${file} > sorted_${file}
#done

echo "indexing and converting to bw"
for file in 250312_B8_UDP0058_P21_Vac14ingls_Cortex_mut1_S23_L006Aligned.sortedByCoord.out.bam 250312_D8_UDP0060_P20_Vac14ingls_Cortex_mut2_S25_L006Aligned.sortedByCoord.out.bam
do
	echo "file: {$file}"
	samtools index ${file}
	bamCoverage -b "${file}" -o "${file}".bw
done
#rm sorted_*
