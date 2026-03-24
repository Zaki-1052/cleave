#!/bin/bash

prefix="$1"

STAR --runThreadN 15 --genomeDir /data2/rs_256/rnaseq/human/index/ --readFilesIn /data2/rs_256/rnaseq/human/fastqs/${prefix}_L004_R1_001.fastq /data2/rs_256/rnaseq/human/fastqs/${prefix}_L004_R2_001.fastq --outFileNamePrefix /data2/rs_256/rnaseq/human/aligned/${prefix} --outSAMtype BAM SortedByCoordinate --quantMode TranscriptomeSAM


