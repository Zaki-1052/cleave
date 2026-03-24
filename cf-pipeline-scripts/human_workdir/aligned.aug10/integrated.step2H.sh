{\rtf1\ansi\ansicpg1252\cocoartf2761
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;\f1\fmodern\fcharset0 Courier;}
{\colortbl;\red255\green255\blue255;\red251\green2\blue255;\red255\green255\blue255;\red27\green27\blue27;
}
{\*\expandedcolortbl;;\cssrgb\c100000\c25279\c100000;\cssrgb\c100000\c100000\c100000;\cssrgb\c14118\c14118\c14118;
}
\margl1440\margr1440\vieww30440\viewh14820\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 #!/bin/bash\
#SBATCH -n 1                               # Request one core\
#SBATCH -N 1                               # Request one node \
#SBATCH -t 0-12:00                         # Runtime in D-HH:MM format\
#SBATCH -p short                           # Partition to run in\
#SBATCH --mem=32000                        # Memory total in MB (for all cores)\
#SBATCH -o hostname_%j.out                 # File to which STDOUT will be written, including job ID\
#SBATCH -e hostname_%j.err                 # File to which STDERR will be written, including job ID\
#SBATCH --mail-type=ALL                    # Type of email notification- BEGIN,END,FAIL,ALL\
#SBATCH --mail-user=rsasik@ucsd.edu        # Email to which notifications will be sent\
\
Rscriptbin=/home/ubuntu/miniconda3/bin\
pythonbin=/home/ubuntu/miniconda3/bin\
bedopsbin=/home/ubuntu/miniconda3/bin\
picardbin=/home/ubuntu/miniconda3/bin\
picardjarfile=picard.jar\
samtoolsbin=/home/ubuntu/miniconda3/bin\
macs2bin=/home/ubuntu/miniconda3/bin\
javabin=/home/ubuntu/miniconda3/bin\
extratoolsbin=/home/ubuntu/cutruntools\
extrasettings=/home/ubuntu/cutruntools\
chromsizedir=`dirname /home/ubuntu/cutruntools/assemblies/chrom.hg38/hg38.fa`\
macs2pythonlib=/home/ubuntu/miniconda3/lib/python3.8/site-packages/\
\
pythonlib=`echo $PYTHONPATH | tr : "\\n" | grep -v $macs2pythonlib | paste -s -d:`\
unset PYTHONPATH\
export PYTHONPATH=$macs2pythonlib:$pythonlib\
\
pythonldlibrary=/home/ubuntu/miniconda3/lib\
ldlibrary=`echo $LD_LIBRARY_PATH | tr : "\\n" | grep -v $pythonldlibrary | paste -s -d:`\
unset LD_LIBRARY_PATH\
export LD_LIBRARY_PATH=$pythonldlibrary:$ldlibrary\
\
>&2 echo "Input parameters are: $1"\
>&2 date\
\
# Expand the path of $1\
relinfile=`realpath -s $1`\
dirname=`dirname $relinfile`\
base=`basename $1 .bam`\
\
# Change to the working directory\
cd $dirname\
workdir=`pwd`\
logdir=$workdir/logs\
\
# Create required directories\
for d in $logdir sorted dup.marked dedup; do\
    if [ ! -d $d ]; then\
        mkdir $d\
    fi\
done\
\
>&2 echo "Filtering unmapped fragments... ""$base".bam\
>&2 date\
$samtoolsbin/samtools view -bh -f 3 -F 4 -F 8 $dirname/"$base".bam > sorted/"$base".step1.bam\
\
>&2 echo "Sorting BAM... ""$base".bam\
>&2 date\
$javabin/java -jar $picardbin/$picardjarfile SortSam INPUT=sorted/"$base".step1.bam OUTPUT=sorted/"$base".bam SORT_ORDER=coordinate VALIDATION_STRINGENCY=SILENT\
rm -rf sorted/"$base".step1.bam\
\
>&2 echo "Marking duplicates... ""$base".bam\
>&2 date\
$javabin/java -jar $picardbin/$picardjarfile MarkDuplicates INPUT=sorted/"$base".bam OUTPUT=dup.marked/"$base".bam VALIDATION_STRINGENCY=SILENT METRICS_FILE=metrics."$base".txt\
\
>&2 echo "Removing duplicates... ""$base".bam\
>&2 date\
$samtoolsbin/samtools view -bh -F 1024 dup.marked/"$base".bam > dedup/"$base".bam\
\
# Create additional directories\
for d in dup.marked.120bp dedup.120bp; do\
    if [ ! -d $d ]; then\
        mkdir $d\
    fi\
done\
\
>&2 echo "Filtering to <120bp... ""$base".bam\
>&2 date\
$samtoolsbin/samtools view -h dup.marked/"$base".bam | LC_ALL=C awk -f $extrasettings/filter_below.awk | $samtoolsbin/samtools view -Sb - > dup.marked.120bp/"$base".bam\
$samtoolsbin/samtools view -h dedup/"$base".bam | LC_ALL=C awk -f $extrasettings/filter_below.awk | $samtoolsbin/samtools view -Sb - > dedup.120bp/"$base".bam\
\
>&2 echo "Creating BAM index files... ""$base".bam\
>&2 date\
$samtoolsbin/samtools index sorted/"$base".bam\
$samtoolsbin/samtools index dup.marked/"$base".bam\
$samtoolsbin/samtools index dedup/"$base".bam\
$samtoolsbin/samtools index dup.marked.120bp/"$base".bam\
$samtoolsbin/samtools index dedup.120bp/"$base".bam\
\
\cf2 >&2 echo "Peak calling using MACS2... ""$base".bam\cf0 \
>&2 echo "Logs are stored in $logdir"\
>&2 date\
bam_file=dup.marked.120bp/"$base".bam\
dir=`dirname $bam_file`\
base_file=`basename $bam_file .bam`\
\
outdir=$workdir/../macs2.narrow.human # Modified for human\
outdir2=$workdir/../macs2.narrow.human.dedup \
\
outdirbroad=$workdir/../macs2.broad.human \
outdirbroad2=$workdir/../macs2.broad.human.dedup \
\
for d in $outdir $outdir2 $outdirbroad $outdirbroad2; do\
    if [ ! -d $d ]; then\
        mkdir $d\
    fi\
done\
\
\pard\pardeftab720\partightenfactor0

\f1\fs28 \cf2 \cb3 \expnd0\expndtw0\kerning0
# Peak calling using MACS2 on filtered and deduplicated fragments
\f0\fs24 \cf0 \cb1 \kerning1\expnd0\expndtw0 \
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0
\cf0 $macs2bin/macs2 callpeak -t $workdir/$dir/"$base_file".bam -g hs -f BAMPE -n $base_file --outdir $outdir -q 0.01 -B --SPMR --keep-dup all 2> $logdir/"$base_file".macs2\
$macs2bin/macs2 callpeak -t $workdir/$dir/"$base_file".bam -g hs -f BAMPE -n $base_file --outdir $outdir2 -q 0.01 -B --SPMR 2> $logdir/"$base_file".dedup.macs2\
\
\cf2 #broad peak calls\cf0 \
$macs2bin/macs2 callpeak -t $workdir/$dir/"$base_file".bam -g hs -f BAMPE -n $base_file --outdir $outdirbroad --broad --broad-cutoff 0.1 -B --SPMR --keep-dup all 2> $logdir/"$base_file".broad.all.frag.macs2\
$macs2bin/macs2 callpeak -t $workdir/$dir/"$base_file".bam -g hs -f BAMPE -n $base_file --outdir $outdirbroad2 --broad --broad-cutoff 0.1 -B --SPMR 2> $logdir/"$base_file".broad.all.frag.dedup.macs2\
$pythonbin/python $extratoolsbin/get_summits_broadPeak.py $outdirbroad/"$base_file"_peaks.broadPeak|$bedopsbin/sort-bed - > $outdirbroad/"$base_file"_summits.bed\
$pythonbin/python $extratoolsbin/get_summits_broadPeak.py $outdirbroad2/"$base_file"_peaks.broadPeak|$bedopsbin/sort-bed - > $outdirbroad2/"$base_file"_summits.bed\
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardeftab720\pardirnatural\partightenfactor0
\cf0 \
\
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0
\cf0 #SEACR peak calls\
$macs2bin/macs2 callpeak -t $workdir/$dir/"$base_file".bam -g hs -f BAMPE -n $base_file --outdir $outdirseac -q 0.01 -B --keep-dup all\
$macs2bin/macs2 callpeak -t $workdir/$dir/"$base_file".bam -g hs -f BAMPE -n $base_file --outdir $outdirseac2 -q 0.01 -B\
$pythonbin/python $extratoolsbin/change.bdg.py $outdirseac/"$base_file"_treat_pileup.bdg > $outdirseac/"$base_file"_treat_integer.bdg\
$pythonbin/python $extratoolsbin/change.bdg.py $outdirseac2/"$base_file"_treat_pileup.bdg > $outdirseac2/"$base_file"_treat_integer.bdg\
$extratoolsbin/SEACR_1.1.sh $outdirseac/"$base_file"_treat_integer.bdg 0.01 non stringent $outdirseac/"$base_file"_treat $Rscriptbin\
$extratoolsbin/SEACR_1.1.sh $outdirseac2/"$base_file"_treat_integer.bdg 0.01 non stringent $outdirseac2/"$base_file"_treat $Rscriptbin\
$bedopsbin/sort-bed $outdirseac/"$base_file"_treat.stringent.bed > $outdirseac/"$base_file"_treat.stringent.sort.bed\
$bedopsbin/sort-bed $outdirseac2/"$base_file"_treat.stringent.bed > $outdirseac2/"$base_file"_treat.stringent.sort.bed\
$pythonbin/python $extratoolsbin/get_summits_seacr.py $outdirseac/"$base_file"_treat.stringent.bed|$bedopsbin/sort-bed - > $outdirseac/"$base_file"_treat.stringent.sort.summits.bed\
$pythonbin/python $extratoolsbin/get_summits_seacr.py $outdirseac2/"$base_file"_treat.stringent.bed|$bedopsbin/sort-bed - > $outdirseac2/"$base_file"_treat.stringent.sort.summits.bed\
for i in _summits.bed _peaks.xls _peaks.narrowPeak _control_lambda.bdg _treat_pileup.bdg; do \
rm -rf $outdirseac/"$base_file"$i\
rm -rf $outdirseac2/"$base_file"$i\
done\
\
#SEACR relaxed peak calls\
$extratoolsbin/SEACR_1.1.sh $outdirseac/"$base_file"_treat_integer.bdg 0.01 non relaxed $outdirseac/"$base_file"_treat $Rscriptbin\
$extratoolsbin/SEACR_1.1.sh $outdirseac2/"$base_file"_treat_integer.bdg 0.01 non relaxed $outdirseac2/"$base_file"_treat $Rscriptbin\
$bedopsbin/sort-bed $outdirseac/"$base_file"_treat.relaxed.bed > $outdirseac/"$base_file"_treat.relaxed.sort.bed\
$bedopsbin/sort-bed $outdirseac2/"$base_file"_treat.relaxed.bed > $outdirseac2/"$base_file"_treat.relaxed.sort.bed\
$pythonbin/python $extratoolsbin/get_summits_seacr.py $outdirseac/"$base_file"_treat.relaxed.bed|$bedopsbin/sort-bed - > $outdirseac/"$base_file"_treat.relaxed.sort.summits.bed\
$pythonbin/python $extratoolsbin/get_summits_seacr.py $outdirseac2/"$base_file"_treat.relaxed.bed|$bedopsbin/sort-bed - > $outdirseac2/"$base_file"_treat.relaxed.sort.summits.bed\
\
cur=`pwd`\
>&2 echo "Converting bedgraph to bigwig... ""$base".bam\
>&2 date\
cd $outdir\
LC_ALL=C sort -k1,1 -k2,2n $outdir/"$base_file"_treat_pileup.bdg > $outdir/"$base_file".sort.bdg\
$extratoolsbin/bedGraphToBigWig $outdir/"$base_file".sort.bdg $chromsizedir/hg38.chrom.sizes $outdir/"$base_file".sorted.bw\
rm -rf "$base_file".sort.bdg\
\
cd $outdir2\
LC_ALL=C sort -k1,1 -k2,2n $outdir2/"$base_file"_treat_pileup.bdg > $outdir2/"$base_file".sort.bdg\
$extratoolsbin/bedGraphToBigWig $outdir2/"$base_file".sort.bdg $chromsizedir/hg38.chrom.sizes $outdir2/"$base_file".sorted.bw\
rm -rf "$base_file".sort.bdg\
\
#====================================================================================================================================\
\
#all fragments\
cd $cur\
bam_file=dup.marked/"$base".bam\
dir=`dirname $bam_file`\
base_file=`basename $bam_file .bam`\
\
outdir=$workdir/../macs2.narrow.all.frag.aug18 #for macs2\
outdir2=$workdir/../macs2.narrow.all.frag.aug18.dedup #for macs2 dedup version\
\
outdirbroad=$workdir/../macs2.broad.all.frag.aug18 #for macs2\
outdirbroad2=$workdir/../macs2.broad.all.frag.aug18.dedup #for macs2 dedup version\
\
\
#SEACR peak calling\
outdirseac=$workdir/../seacr.aug12.all.frag #for seacr\
outdirseac2=$workdir/../seacr.aug12.all.frag.dedup #for seacr dedup version\
\
for d in $outdir $outdir2 $outdirbroad $outdirbroad2 $outdirseac $outdirseac2; do\
if [ ! -d $d ]; then\
mkdir $d\
fi\
done\
\
\pard\pardeftab720\partightenfactor0

\f1\fs28 \cf2 \cb3 \expnd0\expndtw0\kerning0
# Peak calling using MACS2 on all fragments
\f0\fs24 \cf0 \cb1 \kerning1\expnd0\expndtw0 \
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0
\cf0 $macs2bin/macs2 callpeak -t $workdir/$dir/"$base_file".bam -g hs -f BAMPE -n $base_file --outdir $outdir -q 0.01 -B --SPMR --keep-dup all 2> $logdir/"$base_file".macs2\
$macs2bin/macs2 callpeak -t $workdir/$dir/"$base_file".bam -g hs -f BAMPE -n $base_file --outdir $outdir2 -q 0.01 -B --SPMR 2> $logdir/"$base_file".dedup.macs2\
\
\cf2 #broad peak calls\cf0 \
$macs2bin/macs2 callpeak -t $workdir/$dir/"$base_file".bam -g hs -f BAMPE -n $base_file --outdir $outdirbroad --broad --broad-cutoff 0.1 -B --keep-dup all 2> $logdir/"$base_file".broad.all.frag.macs2\
$macs2bin/macs2 callpeak -t $workdir/$dir/"$base_file".bam -g hs -f BAMPE -n $base_file --outdir $outdirbroad2 --broad --broad-cutoff 0.1 -B 2> $logdir/"$base_file".broad.all.frag.dedup.macs2\
$pythonbin/python $extratoolsbin/get_summits_broadPeak.py $outdirbroad/"$base_file"_peaks.broadPeak|$bedopsbin/sort-bed - > $outdirbroad/"$base_file"_summits.bed\
$pythonbin/python $extratoolsbin/get_summits_broadPeak.py $outdirbroad2/"$base_file"_peaks.broadPeak|$bedopsbin/sort-bed - > $outdirbroad2/"$base_file"_summits.bed\
\
#SEACR peak calling\
$macs2bin/macs2 callpeak -t $workdir/$dir/"$base_file".bam -g hs -f BAMPE -n $base_file --outdir $outdirseac -q 0.01 -B --keep-dup all\
$macs2bin/macs2 callpeak -t $workdir/$dir/"$base_file".bam -g hs -f BAMPE -n $base_file --outdir $outdirseac2 -q 0.01 -B \
$pythonbin/python $extratoolsbin/change.bdg.py $outdirseac/"$base_file"_treat_pileup.bdg > $outdirseac/"$base_file"_treat_integer.bdg\
$pythonbin/python $extratoolsbin/change.bdg.py $outdirseac2/"$base_file"_treat_pileup.bdg > $outdirseac2/"$base_file"_treat_integer.bdg\
$extratoolsbin/SEACR_1.1.sh $outdirseac/"$base_file"_treat_integer.bdg 0.01 non stringent $outdirseac/"$base_file"_treat $Rscriptbin\
$extratoolsbin/SEACR_1.1.sh $outdirseac2/"$base_file"_treat_integer.bdg 0.01 non stringent $outdirseac2/"$base_file"_treat $Rscriptbin\
$bedopsbin/sort-bed $outdirseac/"$base_file"_treat.stringent.bed > $outdirseac/"$base_file"_treat.stringent.sort.bed\
$bedopsbin/sort-bed $outdirseac2/"$base_file"_treat.stringent.bed > $outdirseac2/"$base_file"_treat.stringent.sort.bed\
$pythonbin/python $extratoolsbin/get_summits_seacr.py $outdirseac/"$base_file"_treat.stringent.bed|$bedopsbin/sort-bed - > $outdirseac/"$base_file"_treat.stringent.sort.summits.bed\
$pythonbin/python $extratoolsbin/get_summits_seacr.py $outdirseac2/"$base_file"_treat.stringent.bed|$bedopsbin/sort-bed - > $outdirseac2/"$base_file"_treat.stringent.sort.summits.bed\
for i in _summits.bed _peaks.xls _peaks.narrowPeak _control_lambda.bdg _treat_pileup.bdg; do \
rm -rf $outdirseac/"$base_file"$i\
rm -rf $outdirseac2/"$base_file"$i\
done\
\
$extratoolsbin/SEACR_1.1.sh $outdirseac/"$base_file"_treat_integer.bdg 0.01 non relaxed $outdirseac/"$base_file"_treat $Rscriptbin\
$extratoolsbin/SEACR_1.1.sh $outdirseac2/"$base_file"_treat_integer.bdg 0.01 non relaxed $outdirseac2/"$base_file"_treat $Rscriptbin\
$bedopsbin/sort-bed $outdirseac/"$base_file"_treat.relaxed.bed > $outdirseac/"$base_file"_treat.relaxed.sort.bed\
$bedopsbin/sort-bed $outdirseac2/"$base_file"_treat.relaxed.bed > $outdirseac2/"$base_file"_treat.relaxed.sort.bed\
$pythonbin/python $extratoolsbin/get_summits_seacr.py $outdirseac/"$base_file"_treat.relaxed.bed|$bedopsbin/sort-bed - > $outdirseac/"$base_file"_treat.relaxed.sort.summits.bed\
$pythonbin/python $extratoolsbin/get_summits_seacr.py $outdirseac2/"$base_file"_treat.relaxed.bed|$bedopsbin/sort-bed - > $outdirseac2/"$base_file"_treat.relaxed.sort.summits.bed\
\
\
>&2 echo "Converting bedgraph to bigwig... ""$base".bam\
>&2 date\
cd $outdir\
LC_ALL=C sort -k1,1 -k2,2n $outdir/"$base_file"_treat_pileup.bdg > $outdir/"$base_file".sort.bdg\
$extratoolsbin/bedGraphToBigWig $outdir/"$base_file".sort.bdg $chromsizedir/hg38.chrom.sizes $outdir/"$base_file".sorted.bw\
rm -rf "$base_file".sort.bdg\
\
cd $outdir2\
LC_ALL=C sort -k1,1 -k2,2n $outdir2/"$base_file"_treat_pileup.bdg > $outdir2/"$base_file".sort.bdg\
$extratoolsbin/bedGraphToBigWig $outdir2/"$base_file".sort.bdg $chromsizedir/hg38.chrom.sizes $outdir2/"$base_file".sorted.bw\
rm -rf "$base_file".sort.bdg\
\
\
>&2 echo "Finished"\
>&2 date\
\
}