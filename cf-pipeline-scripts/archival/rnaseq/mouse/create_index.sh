#!/bin/bash

STAR --runThreadN 15 --runMode genomeGenerate --genomeDir /data2/rs_256/rnaseq/index/ --genomeFastaFiles ~/cutruntools/assemblies/chrom.mm10/mm10.fa --sjdbGTFfile /data2/rs_256/rnaseq/gencode.vM10.annotation.gtf --sjdbOverhang 101
