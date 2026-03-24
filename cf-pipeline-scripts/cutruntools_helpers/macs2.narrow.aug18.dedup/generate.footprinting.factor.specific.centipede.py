#!/usr/bin/python
import shutil
import sys
import os
import re
import json
import argparse

def generate_TF_specific_footprint_script_sh(config, pval, motif_file, tf_interest, output=None, dedup=False):
	outp = sys.stdout
	if output is not None:
		fw = open(output, "w")
		outp = fw
	header = """#!/bin/bash
#SBATCH -n 1                               # Request one core
#SBATCH -N 1                               # Request one node (if you request more than one core with -n, also using
                                           # -N 1 means all cores will be on the same node)
#SBATCH -t %s                         # Runtime in D-HH:MM format
#SBATCH -p %s                           # Partition to run in
#SBATCH --mem=%s                        # Memory total in MB (for all cores)
#SBATCH -o hostname_%%j.out                 # File to which STDOUT will be written, including job ID
#SBATCH -e hostname_%%j.err                 # File to which STDERR will be written, including job ID
#SBATCH --mail-type=ALL                    # Type of email notification- BEGIN,END,FAIL,ALL
#SBATCH --mail-user=%s   # Email to which notifications will be sent
""" % (config["cluster"]["step_footprinting"]["time_limit"], config["cluster"]["step_footprinting"]["queue"], 
	config["cluster"]["step_footprinting"]["memory"], config["cluster"]["email"])

	script = """
pythonbin=%s

peak_file=$1 #a narrowPeak file
peak_filename=`basename $peak_file`
mbase=""
summit=""
summitfa=""
if [[ "$peak_file" == *narrowPeak ]]
then
	mbase=`basename $peak_file _peaks.narrowPeak`
	summit=$mbase"_summits.bed"
	summitfa=$mbase"_summits_padded.fa"
elif [[ "$peak_file" == *broadPeak ]]
then
	mbase=`basename $peak_file _peaks.broadPeak`
	summit=$mbase"_summits.bed"
	summitfa=$mbase"_summits_padded.fa"
elif [[ "$peak_file" == *stringent.sort.bed ]]
then
	mbase=`basename $peak_file _treat.stringent.sort.bed`
	summit=$mbase"_treat.stringent.sort.summits.bed"
	summitfa=$mbase"_treat.stringent.sort.summits_padded.fa"
fi

#expand the path for $peak_file
relinfile=`realpath -s $peak_file`
dirname=`dirname $relinfile`

#cd to current directory (macs2.narrow.aug10)
cd $dirname
""" % config["pythonbin"]

	p_pythonbase = config["pythonbin"].rstrip("/").rstrip("/bin")

	script2 = """
memebin=%s
bedopsbin=%s
bedtoolsbin=%s
genome_sequence=%s
samtoolsbin=%s
makecutmatrixbin=%s
Rscriptbin=%s
extrasettings=%s

pythonldlibrary=%s
ldlibrary=`echo $LD_LIBRARY_PATH | tr : "\n" | grep -v $pythonldlibrary | paste -s -d:`
unset LD_LIBRARY_PATH
export LD_LIBRARY_PATH=$pythonldlibrary:$ldlibrary

p=%.5f
motif_file=%s
workdir=`pwd`

dir=blk_filtered
fa_dir=blk_filtered.fa
if [ ! -d $fa_dir ]; then
mkdir $fa_dir
fi
if [ ! -d $dir ]; then
mkdir $dir
fi

if [ ! -f $dir/"$peak_filename" ]; then
blacklist=$extrasettings/%s.blacklist.bed
cat $peak_file | grep -v -e "chrM" | $bedopsbin/sort-bed - | $bedopsbin/bedops -n 1 - $blacklist > $dir/$peak_filename
cat $summit | grep -v -e "chrM" | $bedopsbin/sort-bed - | $bedopsbin/bedops -n 1 - $blacklist > $dir/$summit
fi

""" % (config["memebin"], config["bedopsbin"], config["bedtoolsbin"], 
	config["genome_sequence"], config["samtoolsbin"], 
	config["makecutmatrixbin"], config["Rscriptbin"],
	config["extrasettings"], p_pythonbase + "/lib", 
	pval, motif_file, 
	config["input/output"]["organism_build"])

	script3 = """
echo "get fasta"
$bedtoolsbin/bedtools getfasta -fi $genome_sequence -bed $workdir/$dir/"$peak_filename" -fo $fa_dir/"$mbase".fa
echo "fix sequence"
$pythonbin/python fix_sequence.py $fa_dir/"$mbase".fa

outdir=fimo.%s.result
for d in $outdir $outdir/$mbase; do
if [ ! -d $d ]; then
mkdir $d
fi
done

motif=`basename $motif_file .meme`
fimo_d=$outdir/$mbase/fimo2.$motif
if [ ! -d $fimo_d ]; then
mkdir $fimo_d
fi
echo "get fimo"
$memebin/fimo --thresh $p --parse-genomic-coord -oc $fimo_d "$motif".meme $fa_dir/"$mbase".fa

cur_path=`echo $PATH | tr : "
" | grep -v $bedopsbin | paste -s -d:`
unset PATH
export PATH=$cur_path:$bedopsbin

$bedopsbin/gff2bed < $fimo_d/fimo.gff | awk 'BEGIN {IFS="	"; OFS="	";} {print $1,$2,$3,$4,$5,$6}' > $fimo_d/fimo.bed
""" % (tf_interest)
	script4 = """


bamfile=../aligned.aug10/dedup.120bp/"$mbase".bam

workdir=`pwd`
dir=`dirname $bamfile`
bambase=`basename $bamfile .bam`

dest=centipede.bam
outbam=$dest/"$bambase".bam
if [ ! -d $dest ]; then
mkdir $dest
fi
"""
	script5 = """
cd $dest
ln -s ../../aligned.aug10/dedup.120bp/"$mbase".bam .
ln -s ../../aligned.aug10/dedup.120bp/"$mbase".bam.bai .
cd ..
"""


	script7 = """
#peakfile=blk_filtered/"$base"_peaks.narrowPeak
fimo_dir=$outdir/"$mbase"

for i in `ls -1 $fimo_dir`; do #shows a list of motifs
echo "Doing $i..."
fimo_d=$fimo_dir/$i
tmp=`cat $motif_file |grep "MOTIF"|cut -d" " -f3|wc -c`
mlen=$(( tmp - 1 ))
$makecutmatrixbin/make_cut_matrix -v -b '(25-150 1)' -d -o 0 -r 100 -p 1 -f 3 -F 4 -F 8 -q 0 $outbam $fimo_d/fimo.bed > $fimo_d/fimo.cuts.freq.txt
$Rscriptbin/Rscript run_centipede_parker.R $fimo_d/fimo.cuts.freq.txt $fimo_d/fimo.bed $fimo_d/fimo.png $mlen
done
"""
	outp.write(header + "\n")
	outp.write(script + "\n")
	outp.write(script2 + "\n")
	outp.write(script3 + "\n")
	outp.write(script4 + "\n")
	outp.write(script5 + "\n")
	outp.write(script7 + "\n")

	if output is not None:
		outp.close()

if __name__=="__main__":
	f = open("../current_config.json")
	config = json.load(f)
	f.close()

	parser = argparse.ArgumentParser(description="generates a footprint script for a given TF PWM matrix", formatter_class=argparse.ArgumentDefaultsHelpFormatter)
	parser.add_argument("-b", "--motif", dest="motif", help="motif file in MEME format", type=str, required=True)
	parser.add_argument("-p", "--pvalue", dest="pvalue", help="pvalue cutoff for motif scanning in FIMO", type=float, required=True)
	parser.add_argument("-n", "--name", dest="name", help="name of factor", type=str, required=True)

	args = parser.parse_args()

	pval = args.pvalue
	motif_file = args.motif
	tf_interest = args.name


	outfile = "integrate.footprinting.%s.centipede.sh" % tf_interest
	generate_TF_specific_footprint_script_sh(config, pval, motif_file, tf_interest, output=outfile, dedup=True)
	st = os.stat(outfile)
	os.chmod(outfile, st.st_mode | 0o111)

