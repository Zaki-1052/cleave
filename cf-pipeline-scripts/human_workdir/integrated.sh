#!/bin/bash
#SBATCH -n 1                               # Request one core
#SBATCH -N 1                               # Request one node (if you request more than one core with -n, also using
                                           # -N 1 means all cores will be on the same node)
#SBATCH -t 0-12:00                         # Runtime in D-HH:MM format
#SBATCH -p short                           # Partition to run in
#SBATCH --mem=32000                        # Memory total in MB (for all cores)
#SBATCH -o hostname_%j.out                 # File to which STDOUT will be written, including job ID
#SBATCH -e hostname_%j.err                 # File to which STDERR will be written, including job ID
#SBATCH --mail-type=ALL                    # Type of email notification- BEGIN,END,FAIL,ALL
#SBATCH --mail-user=rsasik@ucsd.edu   # Email to which notifications will be sent

trimmomaticbin=/home/ubuntu/miniconda3/bin
trimmomaticjarfile=trimmomatic.jar
adapterpath=/home/ubuntu/cutruntools/adapters
bowtie2bin=/home/ubuntu/miniconda3/bin
samtoolsbin=/home/ubuntu/miniconda3/bin
javabin=/home/ubuntu/miniconda3/bin

bt2idx=/home/ubuntu/cutruntools/assemblies/chrom.hg38
kseqbin=/home/ubuntu/cutruntools

infile=$1
#expand the path of infile
relinfile=`realpath -s $infile`
dirname=`dirname $relinfile`
base=`basename $infile _R1_001.fastq.gz`
>&2 echo "Input file is $relinfile"
>&2 date

#cd to current directory
cd $dirname
workdir=`pwd`

len=`cat length`
trimdir=$workdir/trimmed
trimdir2=$workdir/trimmed3
logdir=$workdir/logs
aligndir=$workdir/aligned.aug10

for d in $trimdir $trimdir2 $logdir $aligndir; do
if [ ! -d $d ]; then
mkdir $d
fi
done



#trimming paired-end
#good version
>&2 echo "Trimming file $base ..."
>&2 date
$javabin/java -jar $trimmomaticbin/$trimmomaticjarfile PE -threads 16 -phred33 $dirname/"$base"_R1_001.fastq.gz $dirname/"$base"_R2_001.fastq.gz $trimdir/"$base"_1.paired.fastq.gz $trimdir/"$base"_1.unpaired.fastq.gz $trimdir/"$base"_2.paired.fastq.gz $trimdir/"$base"_2.unpaired.fastq.gz ILLUMINACLIP:$adapterpath/Truseq3.PE.fa:2:15:4:4:true LEADING:20 TRAILING:20 SLIDINGWINDOW:4:15 MINLEN:25

>&2 echo "Second stage trimming $base ..."
>&2 date
$kseqbin/kseq_test $trimdir/"$base"_1.paired.fastq.gz $len $trimdir2/"$base"_1.paired.fastq.gz
$kseqbin/kseq_test $trimdir/"$base"_2.paired.fastq.gz $len $trimdir2/"$base"_2.paired.fastq.gz

>&2 echo "Aligning file $base ..."
>&2 date
$bowtie2bin/bowtie2 -p 16 --dovetail --phred33 -x $bt2idx/GRCh38 -1 $trimdir2/"$base"_1.paired.fastq.gz -2 $trimdir2/"$base"_2.paired.fastq.gz > $aligndir/"$base"_aligned_reads.sam 2> $logdir/"$base".bowtie2 
$samtoolsbin/samtools view -bS -@ 16 $aligndir/"$base"_aligned_reads.sam > $aligndir/"$base"_aligned_reads.bam 
rm $aligndir/"$base"_aligned_reads.sam

>&2 echo "Finished"
>&2 date

