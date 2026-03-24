#!/bin/bash

while read p; do
	echo "unzipping $p"
	gunzip "/data2/rs_256/rnaseq/human/fastqs/$p"*
	echo "done unzipping $p"
	./align_reads.sh "$p"
	echo "done aligning $p"
	gzip "/data2/rs_256/rnaseq/human/fastqs/$p"*.fastq &
	echo "done zipping $p"
done<22322_fqs.txt
