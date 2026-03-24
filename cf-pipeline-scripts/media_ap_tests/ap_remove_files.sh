if [ $# -ne 1 ]
then
	echo Incorrect number of arguments.
	echo "Proper Usage - bash ap_remove_files.sh <full FASTQ file>"
	exit 1
fi
FASTQ_R1=$1
BAM=`echo $FASTQ_R1 | sed 's/_R.*//'`_aligned_reads.bam
common=`echo $FASTQ_R1 | sed 's/_R.*//'`
echo $BAM

echo $common
cd /data/rs_256/workdir/aligned.aug10
if [ ! -f $BAM ]
then
	echo BAM file does not exist: $BAM
fi
FASTQ_R2=`echo $FASTQ_R1|sed 's/_R1/_R2/'`
rm ../$FASTQ_R1
rm ../$FASTQ_R2 
rm ../../fastq/$FASTQ_R1
rm ../../fastq/$FASTQ_R2
rm $BAM
rm ../trimmed/$common*
rm ../trimmed/$common*
#rm sorted_$BAM
#rm sorted_$BAM.bai
#rm sorted_${BAM}_norm.bw

#bash ap_remove_bed.sh $common
