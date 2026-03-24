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
chromsizedir=`dirname /home/ubuntu/cutruntools/assemblies/chrom.mm10/mm10.fa`
macs2pythonlib=/home/ubuntu/miniconda3/lib/python3.8/site-packages/

pythonlib=`echo $PYTHONPATH | tr : "\n" | grep -v $macs2pythonlib | paste -s -d:`
unset PYTHONPATH
export PYTHONPATH=$macs2pythonlib:$pythonlib

pythonldlibrary=/home/ubuntu/miniconda3/lib
ldlibrary=`echo $LD_LIBRARY_PATH | tr : "\n" | grep -v $pythonldlibrary | paste -s -d:`
unset LD_LIBRARY_PATH
export LD_LIBRARY_PATH=$pythonldlibrary:$ldlibrary


>&2 echo "Input parameters are: $1"
>&2 date

#expand the path of $1
relinfile=`realpath -s $1`
dirname=`dirname $relinfile`
base=`basename $1 .bam`

#cd to current directory (aligned.aug10)
cd $dirname

workdir=`pwd`
logdir=$workdir/logs

for d in $logdir sorted dup.marked dedup; do
if [ ! -d $d ]; then
mkdir $d
fi
done

>&2 echo "Filtering unmapped fragments... ""$base".bam
>&2 date
$samtoolsbin/samtools view -bh -f 3 -F 4 -F 8 $dirname/"$base".bam > sorted/"$base".step1.bam

>&2 echo "Sorting BAM... ""$base".bam
>&2 date
$javabin/java -jar $picardbin/$picardjarfile SortSam INPUT=sorted/"$base".step1.bam OUTPUT=sorted/"$base".bam SORT_ORDER=coordinate VALIDATION_STRINGENCY=SILENT
rm -rf sorted/"$base".step1.bam

>&2 echo "Marking duplicates... ""$base".bam
>&2 date
$javabin/java -jar $picardbin/$picardjarfile MarkDuplicates INPUT=sorted/"$base".bam OUTPUT=dup.marked/"$base".bam VALIDATION_STRINGENCY=SILENT METRICS_FILE=metrics."$base".txt

>&2 echo "Removing duplicates... ""$base".bam
>&2 date
$samtoolsbin/samtools view -bh -F 1024 dup.marked/"$base".bam > dedup/"$base".bam

for d in dup.marked.120bp dedup.120bp; do
if [ ! -d $d ]; then
mkdir $d
fi
done

>&2 echo "Filtering to <120bp... ""$base".bam
>&2 date
$samtoolsbin/samtools view -h dup.marked/"$base".bam |LC_ALL=C awk -f $extrasettings/filter_below.awk |$samtoolsbin/samtools view -Sb - > dup.marked.120bp/"$base".bam
$samtoolsbin/samtools view -h dedup/"$base".bam |LC_ALL=C awk -f $extrasettings/filter_below.awk |$samtoolsbin/samtools view -Sb - > dedup.120bp/"$base".bam

>&2 echo "Creating bam index files... ""$base".bam
>&2 date
$samtoolsbin/samtools index sorted/"$base".bam
$samtoolsbin/samtools index dup.marked/"$base".bam
$samtoolsbin/samtools index dedup/"$base".bam
$samtoolsbin/samtools index dup.marked.120bp/"$base".bam
$samtoolsbin/samtools index dedup.120bp/"$base".bam

outdirseac=$workdir/../seacr.aug12 #for seacr
outdirseac2=$workdir/../seacr.aug12.dedup #for seacr dedup version

for d in $outdir $outdir2 $outdirbroad $outdirbroad2 $outdirseac $outdirseac2; do
if [ ! -d $d ]; then
mkdir $d
fi
done

#SEACR peak calls
$macs2bin/macs2 callpeak -t $workdir/$dir/"$base_file".bam -g mm -f BAMPE -n $base_file --outdir $outdirseac -q 0.01 -B --keep-dup all
$macs2bin/macs2 callpeak -t $workdir/$dir/"$base_file".bam -g mm -f BAMPE -n $base_file --outdir $outdirseac2 -q 0.01 -B
$pythonbin/python $extratoolsbin/change.bdg.py $outdirseac/"$base_file"_treat_pileup.bdg > $outdirseac/"$base_file"_treat_integer.bdg
$pythonbin/python $extratoolsbin/change.bdg.py $outdirseac2/"$base_file"_treat_pileup.bdg > $outdirseac2/"$base_file"_treat_integer.bdg
$extratoolsbin/SEACR_1.1.sh $outdirseac/"$base_file"_treat_integer.bdg 0.01 non stringent $outdirseac/"$base_file"_treat $Rscriptbin
$extratoolsbin/SEACR_1.1.sh $outdirseac2/"$base_file"_treat_integer.bdg 0.01 non stringent $outdirseac2/"$base_file"_treat $Rscriptbin
$bedopsbin/sort-bed $outdirseac/"$base_file"_treat.stringent.bed > $outdirseac/"$base_file"_treat.stringent.sort.bed
$bedopsbin/sort-bed $outdirseac2/"$base_file"_treat.stringent.bed > $outdirseac2/"$base_file"_treat.stringent.sort.bed
$pythonbin/python $extratoolsbin/get_summits_seacr.py $outdirseac/"$base_file"_treat.stringent.bed|$bedopsbin/sort-bed - > $outdirseac/"$base_file"_treat.stringent.sort.summits.bed
$pythonbin/python $extratoolsbin/get_summits_seacr.py $outdirseac2/"$base_file"_treat.stringent.bed|$bedopsbin/sort-bed - > $outdirseac2/"$base_file"_treat.stringent.sort.summits.bed
for i in _summits.bed _peaks.xls _peaks.narrowPeak _control_lambda.bdg _treat_pileup.bdg; do 
rm -rf $outdirseac/"$base_file"$i
rm -rf $outdirseac2/"$base_file"$i
done

#====================================================================================================================================

#all fragments
cd $cur
bam_file=dup.marked/"$base".bam
dir=`dirname $bam_file`
base_file=`basename $bam_file .bam`

#SEACR peak calling
outdirseac=$workdir/../seacr.aug12.all.frag #for seacr
outdirseac2=$workdir/../seacr.aug12.all.frag.dedup #for seacr dedup version

for d in $outdir $outdir2 $outdirbroad $outdirbroad2 $outdirseac $outdirseac2; do
if [ ! -d $d ]; then
mkdir $d
fi
done

#SEACR peak calling
$macs2bin/macs2 callpeak -t $workdir/$dir/"$base_file".bam -g mm -f BAMPE -n $base_file --outdir $outdirseac -q 0.01 -B --keep-dup all
$macs2bin/macs2 callpeak -t $workdir/$dir/"$base_file".bam -g mm -f BAMPE -n $base_file --outdir $outdirseac2 -q 0.01 -B 
$pythonbin/python $extratoolsbin/change.bdg.py $outdirseac/"$base_file"_treat_pileup.bdg > $outdirseac/"$base_file"_treat_integer.bdg
$pythonbin/python $extratoolsbin/change.bdg.py $outdirseac2/"$base_file"_treat_pileup.bdg > $outdirseac2/"$base_file"_treat_integer.bdg
$extratoolsbin/SEACR_1.1.sh $outdirseac/"$base_file"_treat_integer.bdg 0.01 non stringent $outdirseac/"$base_file"_treat $Rscriptbin
$extratoolsbin/SEACR_1.1.sh $outdirseac2/"$base_file"_treat_integer.bdg 0.01 non stringent $outdirseac2/"$base_file"_treat $Rscriptbin
$bedopsbin/sort-bed $outdirseac/"$base_file"_treat.stringent.bed > $outdirseac/"$base_file"_treat.stringent.sort.bed
$bedopsbin/sort-bed $outdirseac2/"$base_file"_treat.stringent.bed > $outdirseac2/"$base_file"_treat.stringent.sort.bed
$pythonbin/python $extratoolsbin/get_summits_seacr.py $outdirseac/"$base_file"_treat.stringent.bed|$bedopsbin/sort-bed - > $outdirseac/"$base_file"_treat.stringent.sort.summits.bed
$pythonbin/python $extratoolsbin/get_summits_seacr.py $outdirseac2/"$base_file"_treat.stringent.bed|$bedopsbin/sort-bed - > $outdirseac2/"$base_file"_treat.stringent.sort.summits.bed
for i in _summits.bed _peaks.xls _peaks.narrowPeak _control_lambda.bdg _treat_pileup.bdg; do 
rm -rf $outdirseac/"$base_file"$i
rm -rf $outdirseac2/"$base_file"$i
done

$extratoolsbin/SEACR_1.1.sh $outdirseac/"$base_file"_treat_integer.bdg 0.01 non relaxed $outdirseac/"$base_file"_treat $Rscriptbin
$extratoolsbin/SEACR_1.1.sh $outdirseac2/"$base_file"_treat_integer.bdg 0.01 non relaxed $outdirseac2/"$base_file"_treat $Rscriptbin
$bedopsbin/sort-bed $outdirseac/"$base_file"_treat.relaxed.bed > $outdirseac/"$base_file"_treat.relaxed.sort.bed
$bedopsbin/sort-bed $outdirseac2/"$base_file"_treat.relaxed.bed > $outdirseac2/"$base_file"_treat.relaxed.sort.bed
$pythonbin/python $extratoolsbin/get_summits_seacr.py $outdirseac/"$base_file"_treat.relaxed.bed|$bedopsbin/sort-bed - > $outdirseac/"$base_file"_treat.relaxed.sort.summits.bed
$pythonbin/python $extratoolsbin/get_summits_seacr.py $outdirseac2/"$base_file"_treat.relaxed.bed|$bedopsbin/sort-bed - > $outdirseac2/"$base_file"_treat.relaxed.sort.summits.bed

>&2 echo "Finished"
>&2 date

