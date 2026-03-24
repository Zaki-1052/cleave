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


pythonbin=/home/ubuntu/miniconda3/bin
peak_file=$1 #a narrowPeak/broadPeak/SEACR bed file
mbase=`basename $peak_file _peaks.narrowPeak`
peak=$mbase"_peaks.narrowPeak"
mdiscovery=random.5000/MEME_"$mbase"_shuf

#expand the path for $peak_file
relinfile=`realpath -s $peak_file`
dirname=`dirname $relinfile`

#cd to current directory (macs2.narrow.aug10)
cd $dirname

$pythonbin/python read.meme.py $mdiscovery


memebin=/home/ubuntu/miniconda3/bin
bedopsbin=/home/ubuntu/miniconda3/bin
bedtoolsbin=/home/ubuntu/miniconda3/bin
genome_sequence=/home/ubuntu/cutruntools/assemblies/chrom.mm10/mm10.fa
samtoolsbin=/home/ubuntu/miniconda3/bin
makecutmatrixbin=/home/ubuntu/git/atactk/scripts/
Rscriptbin=/home/ubuntu/miniconda3/bin
extrasettings=/home/ubuntu/cutruntools

pythonldlibrary=/home/ubuntu/miniconda3/lib
ldlibrary=`echo $LD_LIBRARY_PATH | tr : "\n" | grep -v $pythonldlibrary | paste -s -d:`
unset LD_LIBRARY_PATH
export LD_LIBRARY_PATH=$pythonldlibrary:$ldlibrary

p=0.00050
motif_dir=$mdiscovery/motifs #a directory containing a list of *.meme files
peak_filename=`basename $peak_file`
workdir=`pwd`
dir=blk_filtered
fa_dir=blk_filtered.fa

if [ ! -d $fa_dir ]; then
mkdir $fa_dir
fi

if [ ! -d $dir ] || [ ! -f $dir/$peak ] ; then
blacklist=$extrasettings/mm10.blacklist.bed
cat $workdir/$dir/"$peak_filename" | grep -v -e "chrM" | $bedopsbin/sort-bed - | $bedopsbin/bedops -n 1 - $blacklist > $workdir/$dir/$peak
fi



$bedtoolsbin/bedtools getfasta -fi $genome_sequence -bed $workdir/$dir/$peak -fo $fa_dir/"$mbase".fa
$pythonbin/python fix_sequence.py $fa_dir/"$mbase".fa

outdir=fimo.result
for d in $outdir $outdir/$mbase; do
if [ ! -d $d ]; then
mkdir $d
fi
done

for m in `ls -1 $motif_dir`; do
motif=`basename $m .meme`
fimo_d=$outdir/$mbase/fimo2.$motif
if [ ! -d $fimo_d ]; then
mkdir $fimo_d
fi
$memebin/fimo --thresh $p --parse-genomic-coord -oc $fimo_d $motif_dir/"$motif".meme $fa_dir/"$mbase".fa
cur_path=`echo $PATH | tr : "\n" | grep -v $bedopsbin | paste -s -d:`
unset PATH
export PATH=$cur_path:$bedopsbin

$bedopsbin/gff2bed < $fimo_d/fimo.gff | awk 'BEGIN {IFS="	"; OFS="	";} {print $1,$2,$3,$4,$5,$6}' > $fimo_d/fimo.bed
done


bamfile=../aligned.aug10/dedup.120bp/"$mbase".bam


workdir=`pwd`
dir=`dirname $bamfile`
bambase=`basename $bamfile .bam`

dest=centipede.bam
outbam=$dest/"$bambase".bam
if [ ! -d $dest ]; then
mkdir $dest
fi


cd $dest
ln -s ../../aligned.aug10/dedup.120bp/"$mbase".bam .
ln -s ../../aligned.aug10/dedup.120bp/"$mbase".bam.bai .
cd ..


fimo_dir=$outdir/$mbase

for i in `ls -1 $fimo_dir`; do #shows a list of motifs
echo "Doing $i..."
fimo_d=$fimo_dir/$i
tmp=`echo $i|cut -d "." -f3|wc -c`
mlen=$(( tmp - 1 ))
$makecutmatrixbin/make_cut_matrix -v -b '(25-150 1)' -d -o 0 -r 100 -p 1 -f 3 -F 4 -F 8 -q 0 $outbam $fimo_d/fimo.bed > $fimo_d/fimo.cuts.freq.txt
$Rscriptbin/Rscript run_centipede_parker.R $fimo_d/fimo.cuts.freq.txt $fimo_d/fimo.bed $fimo_d/fimo.png $mlen
done

