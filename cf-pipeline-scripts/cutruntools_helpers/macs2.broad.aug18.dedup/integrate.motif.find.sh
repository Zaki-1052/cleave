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

memebin=/home/ubuntu/miniconda3/bin
bedopsbin=/home/ubuntu/miniconda3/bin
bedtoolsbin=/home/ubuntu/miniconda3/bin
pythonbin=/home/ubuntu/miniconda3/bin
perlbin=/home/ubuntu/miniconda3/bin
genome_sequence=/home/ubuntu/cutruntools/assemblies/chrom.mm10/mm10.fa
extrasettings=/home/ubuntu/cutruntools
blacklist=$extrasettings/mm10.blacklist.bed

i=$1 #filename must end with .narrowPeak or .broadPeak or .bed (if SEACR)
>&2 echo "Input file is $i"

#expand the path for $1
relinfile=`realpath -s $i`
dirname=`dirname $relinfile`

#cd to current directory
cd $dirname

for d in blk_filtered; do
if [ ! -d $d ]; then
mkdir $d
fi
done

workdir=`pwd`
fname=`basename $i _peaks.broadPeak`
peak=$fname"_peaks.broadPeak"
summit=$fname"_summits.bed"
summitfa=$fname"_summits_padded.fa"

>&2 echo "Get filtered peaks..."
cat $peak | grep -v -e "chrM" | $bedopsbin/sort-bed - | $bedopsbin/bedops -n 1 - $blacklist > blk_filtered/$peak
cat $summit | grep -v -e "chrM" | $bedopsbin/sort-bed - | $bedopsbin/bedops -n 1 - $blacklist > blk_filtered/$summit

#motif discovery starts here
motif_dir=random.5000
msummit=$motif_dir/summits
mpadded=$motif_dir/padded
mpaddedfa=$motif_dir/padded.fa

for d in $motif_dir $msummit $mpadded $mpaddedfa; do
if [ ! -d $d ]; then
mkdir $d
fi
done

>&2 echo "Get randomized 5000 peaks..."
cat blk_filtered/$peak | sort -t"	" -g -k8 -r | head -n 15000 | shuf | head -n 5000 | $bedopsbin/sort-bed - > $motif_dir/$peak
$bedopsbin/bedops -e 1 blk_filtered/$summit $motif_dir/$peak > $msummit/$summit
$bedopsbin/bedops --range 150 -u $msummit/$summit > $mpadded/$summit

$bedtoolsbin/bedtools getfasta -fi $genome_sequence -bed $mpadded/$summit -fo $mpaddedfa/$summitfa

>&2 echo "Start MEME analysis for de novo motif finding..."
meme_outdir=$motif_dir/MEME_"$fname"_shuf
$memebin/meme-chip -oc $meme_outdir -dreme-m 20 -meme-nmotifs 20 -meme-p 8 -spamo-skip -fimo-skip $mpaddedfa/$summitfa

>&2 echo "Finished"

