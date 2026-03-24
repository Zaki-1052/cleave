#!/bin/bash

prefix="$1"

STAR --runThreadN 15 --genomeDir /data2/rs_256/rnaseq/mouse/index/ --readFilesIn /data2/rs_256/rnaseq/mouse/fastqs/${prefix}_R1_001.fastq /data2/rs_256/rnaseq/mouse/fastqs/${prefix}_R2_001.fastq --outFileNamePrefix /data2/rs_256/rnaseq/mouse/aligned/${prefix} --outSAMtype BAM SortedByCoordinate --quantMode TranscriptomeSAM
