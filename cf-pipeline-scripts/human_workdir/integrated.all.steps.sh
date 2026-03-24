#!/bin/bash

sample=$1
#expand the path for $sample
relsample=`realpath -s $sample`
dirname=`dirname $relsample`
base=`basename $relsample _R1_001.fastq.gz`

cd $dirname

echo "Submitting job 1..."
jid1=$(sbatch ./integrated.sh $relsample)
jid1=${jid1##* }
echo "Submitting job 2..."
jid2=$(sbatch -d afterany:$jid1 aligned.aug10/integrated.step2.sh aligned.aug10/"$base"_aligned_reads.bam)
jid2=${jid2##* }
echo "Submitting job 3..."
jid3=$(sbatch -d afterany:$jid2 macs2.narrow.aug18/integrate.motif.find.sh macs2.narrow.aug18/"$base"_aligned_reads_peaks.narrowPeak)
jid3=${jid3##* }
echo "Submitting job 4..."
jid4=$(sbatch -d afterany:$jid3 macs2.narrow.aug18/integrate.footprinting.sh macs2.narrow.aug18/"$base"_aligned_reads_peaks.narrowPeak)
jid4=${jid4##* }

echo "Submitting job 5..."
jid5=$(sbatch -d afterany:$jid4 macs2.narrow.aug18.dedup/integrate.motif.find.sh macs2.narrow.aug18.dedup/"$base"_aligned_reads_peaks.narrowPeak)
jid5=${jid5##* }
echo "Submitting job 6..."
jid6=$(sbatch -d afterany:$jid5 macs2.narrow.aug18.dedup/integrate.footprinting.sh macs2.narrow.aug18.dedup/"$base"_aligned_reads_peaks.narrowPeak)
jid6=${jid6##* }

