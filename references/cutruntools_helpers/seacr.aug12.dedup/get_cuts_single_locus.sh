#!/bin/bash

region=$1
bamfile=$2
outdir=$3
chromsizedir=`dirname /home/ubuntu/cutruntools/assemblies/chrom.mm10/mm10.fa`
chromsizefile=$chromsizedir/mm10.chrom.sizes
pythonbin=/home/ubuntu/miniconda3/bin
samtoolsbin=/home/ubuntu/miniconda3/bin
bedtoolsbin=/home/ubuntu/miniconda3/bin
bedopsbin=/home/ubuntu/miniconda3/bin
extratoolsbin=/home/ubuntu/cutruntools
samtoolsflags="-f 3 -F 4 -F 8 -F 1024"

regionname=`echo $region|sed "s/:/-/g"`
basename=`basename $bamfile .bam`
newbamfile="$basename"-"$regionname".bam
newbase=`basename $newbamfile .bam`

if [ ! -d $outdir ]; then
mkdir $outdir
fi
$samtoolsbin/samtools view -bh $samtoolsflags $bamfile "$region" > $outdir/$newbamfile
$samtoolsbin/samtools index $outdir/$newbamfile
$samtoolsbin/samtools view -b $outdir/$newbamfile|$samtoolsbin/samtools sort -O bam -n - -T tmp.test|$bedtoolsbin/bedtools bamtobed -i stdin -bedpe > $outdir/"$newbase".frag.ends.txt

$pythonbin/python check_coordinate.py $chromsizefile $outdir/"$newbase".frag.ends.txt > $outdir/"$newbase".frag.ends.checked.txt

$pythonbin/python quantify_separate.py $outdir/"$newbase".frag.ends.checked.txt $outdir/"$newbase".frag.ends.R1.bed $outdir/"$newbase".frag.ends.R2.bed
$bedopsbin/sort-bed $outdir/"$newbase".frag.ends.R1.bed > $outdir/"$newbase".frag.ends.R1.sorted.bed
$bedopsbin/sort-bed $outdir/"$newbase".frag.ends.R2.bed > $outdir/"$newbase".frag.ends.R2.sorted.bed
$bedtoolsbin/groupBy -i $outdir/"$newbase".frag.ends.R1.sorted.bed -g 1,2,3 -c 2 -o count > $outdir/"$newbase".frag.ends.R1.bdg
$bedtoolsbin/groupBy -i $outdir/"$newbase".frag.ends.R2.sorted.bed -g 1,2,3 -c 2 -o count > $outdir/"$newbase".frag.ends.R2.bdg
$extratoolsbin/bedGraphToBigWig $outdir/"$newbase".frag.ends.R1.bdg $chromsizefile $outdir/"$newbase".frag.ends.R1.bw
$extratoolsbin/bedGraphToBigWig $outdir/"$newbase".frag.ends.R2.bdg $chromsizefile $outdir/"$newbase".frag.ends.R2.bw

$pythonbin/python quantify.py $outdir/"$newbase".frag.ends.checked.txt $outdir/"$newbase".frag.ends.bed
$bedopsbin/sort-bed $outdir/"$newbase".frag.ends.bed > $outdir/"$newbase".frag.ends.sorted.bed
$bedtoolsbin/groupBy -i $outdir/"$newbase".frag.ends.sorted.bed -g 1,2,3 -c 2 -o count > $outdir/"$newbase".frag.ends.bdg
$extratoolsbin/bedGraphToBigWig $outdir/"$newbase".frag.ends.bdg $chromsizefile $outdir/"$newbase".frag.ends.bw


