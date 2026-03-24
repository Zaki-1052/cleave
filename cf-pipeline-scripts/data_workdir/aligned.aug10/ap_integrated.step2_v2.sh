#!/bin/bash
#SBATCH -n 1
#SBATCH -N 1
#SBATCH -t 0-12:00
#SBATCH -p short
#SBATCH --mem=32000
#SBATCH -o hostname_%j.out
#SBATCH -e hostname_%j.err
#SBATCH --mail-type=ALL
#SBATCH --mail-user=rsasik@ucsd.edu

# -------------------------------
# Binary paths
# -------------------------------
Rscriptbin=/home/ubuntu/miniconda3/bin
pythonbin=/home/ubuntu/miniconda3/bin
bedopsbin=/home/ubuntu/miniconda3/bin
picardbin=/home/ubuntu/miniconda3/bin
picardjarfile=picard.jar
samtoolsbin=/home/ubuntu/miniconda3/bin
macs2bin=/home/ubuntu/miniconda3/bin
javabin=/home/ubuntu/miniconda3/bin
extratoolsbin=/home/ubuntu/cutruntools
extrasettings=/home/ubuntu/cutruntools
chromsizedir=/home/ubuntu/cutruntools/assemblies/chrom.mm10

# -------------------------------
# PYTHON and LD_LIBRARY_PATH setup
# -------------------------------
macs2pythonlib=/home/ubuntu/miniconda3/lib/python3.8/site-packages/
pythonlib=$(echo $PYTHONPATH | tr : "\n" | grep -v $macs2pythonlib | paste -s -d:)
unset PYTHONPATH
export PYTHONPATH=$macs2pythonlib:$pythonlib

pythonldlibrary=/home/ubuntu/miniconda3/lib
ldlibrary=$(echo $LD_LIBRARY_PATH | tr : "\n" | grep -v $pythonldlibrary | paste -s -d:)
unset LD_LIBRARY_PATH
export LD_LIBRARY_PATH=$pythonldlibrary:$ldlibrary

# -------------------------------
# Input
# -------------------------------
>&2 echo "Input BAM: $1"
>&2 date

relinfile=$(realpath -s $1)
base=$(basename $relinfile .bam)

# -------------------------------
# Set aligned.aug10 as base workdir
# -------------------------------
workdir=/data/rs_256/workdir/aligned.aug10

# -------------------------------
# Create all necessary subdirectories
# -------------------------------
for d in logs sorted dup.marked dedup dup.marked.120bp dedup.120bp \
         macs2.narrow macs2.narrow.dedup macs2.broad macs2.broad.dedup \
         seacr seacr.dedup; do
    mkdir -p $workdir/$d
done

logdir=$workdir/logs

# -------------------------------
# Preprocessing BAMs
# -------------------------------
>&2 echo "Filtering unmapped fragments: $base.bam"
$samtoolsbin/samtools view -bh -f 3 -F 4 -F 8 $relinfile > $workdir/sorted/"$base".step1.bam

>&2 echo "Sorting BAM: $base.bam"
$javabin/java -jar $picardbin/$picardjarfile SortSam INPUT=$workdir/sorted/"$base".step1.bam OUTPUT=$workdir/sorted/"$base".bam SORT_ORDER=coordinate VALIDATION_STRINGENCY=SILENT
rm -rf $workdir/sorted/"$base".step1.bam

>&2 echo "Marking duplicates: $base.bam"
$javabin/java -jar $picardbin/$picardjarfile MarkDuplicates INPUT=$workdir/sorted/"$base".bam OUTPUT=$workdir/dup.marked/"$base".bam VALIDATION_STRINGENCY=SILENT METRICS_FILE=$workdir/logs/metrics."$base".txt

>&2 echo "Removing duplicates: $base.bam"
$samtoolsbin/samtools view -bh -F 1024 $workdir/dup.marked/"$base".bam > $workdir/dedup/"$base".bam

>&2 echo "Filtering to <120bp: $base.bam"
$samtoolsbin/samtools view -h $workdir/dup.marked/"$base".bam | awk -f $extrasettings/filter_below.awk | $samtoolsbin/samtools view -Sb - > $workdir/dup.marked.120bp/"$base".bam
$samtoolsbin/samtools view -h $workdir/dedup/"$base".bam | awk -f $extrasettings/filter_below.awk | $samtoolsbin/samtools view -Sb - > $workdir/dedup.120bp/"$base".bam

>&2 echo "Indexing BAMs: $base.bam"
for b in sorted dup.marked dedup dup.marked.120bp dedup.120bp; do
    $samtoolsbin/samtools index $workdir/$b/"$base".bam
done

# -------------------------------
# MACS2 narrow and broad peak output
# -------------------------------
>&2 echo "Calling MACS2 peaks..."
bam_file=$workdir/dup.marked.120bp/"$base".bam
base_file=$(basename $bam_file .bam)

# Narrow
$macs2bin/macs2 callpeak -t $bam_file -g mm -f BAMPE -n $base_file --outdir $workdir/macs2.narrow -q 0.01 -B --SPMR --keep-dup all 2> $logdir/"$base_file".macs2
$macs2bin/macs2 callpeak -t $bam_file -g mm -f BAMPE -n $base_file --outdir $workdir/macs2.narrow.dedup -q 0.01 -B --SPMR 2> $logdir/"$base_file".dedup.macs2

# Broad
$macs2bin/macs2 callpeak -t $bam_file -g mm -f BAMPE -n $base_file --outdir $workdir/macs2.broad --broad --broad-cutoff 0.1 -B --keep-dup all 2> $logdir/"$base_file".broad.macs2
$pythonbin/python $extratoolsbin/get_summits_broadPeak.py $workdir/macs2.broad/"$base_file"_peaks.broadPeak | $bedopsbin/sort-bed - > $workdir/macs2.broad/"$base_file"_summits.bed

$macs2bin/macs2 callpeak -t $bam_file -g mm -f BAMPE -n $base_file --outdir $workdir/macs2.broad.dedup --broad --broad-cutoff 0.1 -B 2> $logdir/"$base_file".broad.dedup.macs2
$pythonbin/python $extratoolsbin/get_summits_broadPeak.py $workdir/macs2.broad.dedup/"$base_file"_peaks.broadPeak | $bedopsbin/sort-bed - > $workdir/macs2.broad.dedup/"$base_file"_summits.bed

# -------------------------------
# SEACR peak calling
# -------------------------------
$pythonbin/python $extratoolsbin/change.bdg.py $workdir/seacr/"$base_file"_treat_pileup.bdg > $workdir/seacr/"$base_file"_treat_integer.bdg
$extratoolsbin/SEACR_1.1.sh $workdir/seacr/"$base_file"_treat_integer.bdg 0.01 non stringent $workdir/seacr/"$base_file"_treat $Rscriptbin

$bedopsbin/sort-bed $workdir/seacr/"$base_file"_treat.stringent.bed > $workdir/seacr/"$base_file"_treat.stringent.sort.bed
$pythonbin/python $extratoolsbin/get_summits_seacr.py $workdir/seacr/"$base_file"_treat.stringent.bed | $bedopsbin/sort-bed - > $workdir/seacr/"$base_file"_treat.stringent.sort.summits.bed

# Relaxed
$extratoolsbin/SEACR_1.1.sh $workdir/seacr/"$base_file"_treat_integer.bdg 0.01 non relaxed $workdir/seacr/"$base_file"_treat $Rscriptbin
$bedopsbin/sort-bed $workdir/seacr/"$base_file"_treat.relaxed.bed > $workdir/seacr/"$base_file"_treat.relaxed.sort.bed
$pythonbin/python $extratoolsbin/get_summits_seacr.py $workdir/seacr/"$base_file"_treat.relaxed.bed | $bedopsbin/sort-bed - > $workdir/seacr/"$base_file"_treat.relaxed.sort.summits.bed

>&2 echo "Finished: $base.bam"
>&2 date
