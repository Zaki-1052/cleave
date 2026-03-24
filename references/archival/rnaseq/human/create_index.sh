#!/bin/bash

STAR --runThreadN 15 --runMode genomeGenerate --genomeDir /data2/rs_256/rnaseq/human/index/ --genomeFastaFiles /data2/rs_256/rnaseq/human/GRCh38.primary_assembly.genome.fa --sjdbGTFfile /data2/rs_256/rnaseq/human/gencode.v29.annotation.gtf --sjdbOverhang 101
