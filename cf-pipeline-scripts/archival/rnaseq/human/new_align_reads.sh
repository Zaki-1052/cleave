#!/bin/bash

while read -r prefix; do
    echo "Processing $prefix"

    fastq1="/data2/rs_256/rnaseq/human/fastqs/${prefix}_L001_R1_001.fastq.gz"
    fastq2="/data2/rs_256/rnaseq/human/fastqs/${prefix}_L001_R2_001.fastq.gz"
    output_prefix="/data2/rs_256/rnaseq/human/aligned/${prefix}"

    gunzip -c "$fastq1" > "${fastq1%.gz}"
    gunzip -c "$fastq2" > "${fastq2%.gz}"

    STAR --runThreadN 15 --genomeDir /data2/rs_256/rnaseq/human/index/ --readFilesIn "${fastq1%.gz}" "${fastq2%.gz}" --outFileNamePrefix "$output_prefix" --outSAMtype BAM SortedByCoordinate --quantMode TranscriptomeSAM

    gzip "${fastq1%.gz}"
    gzip "${fastq2%.gz}"

    echo "Finished processing $prefix"
done < 22322_fqs.txt

