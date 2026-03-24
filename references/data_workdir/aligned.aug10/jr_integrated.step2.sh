#!/bin/bash

#stuff for SLURM job scheduling. Requesting space in a CPU and just tells the cluster schedule how to run the job
#SBATCH -n 1
#SBATCH -N 1
#SBATCH -t 0-12:00
#SBATCH -p short
#SBATCH --mem=32000
#SBATCH -o hostname_%j.out
#SBATCH -e hostname_%j.err
#SBATCH --mail-type=ALL
#SBATCH --mail-user=rsasik@ucsd.edu

#THIS SCRIPT IS MODIFIED FROM /data/rs_256/workdir/aligned.aug10/ap_integrated.step2.sh

set -euo pipefail
# -e: exit on first error
# -u: treat unset variables as errors
# -o pipefail: fail if any command in a pipe fails

# -----------------------------------------------------------------
# DRY-RUN MODE (safe test mode)
# -----------------------------------------------------------------
# Usage: ./jr_integrated.step2.sh --dry-run input.bam
DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  shift
  echo "[INFO] Running in dry-run mode — commands will be printed, not executed."
fi

run() {
  if $DRY_RUN; then
    echo "[DRY-RUN] $*"
  else
    eval "$@"
  fi
}

# -----------------------------------------------------------------
# Safe defaults for variables that might be unset
# -----------------------------------------------------------------
: "${PYTHONPATH:=}"
: "${LD_LIBRARY_PATH:=}"

#Defines program paths and software tools in the pipeline.
Rscriptbin=/home/ubuntu/miniconda3/bin
pythonbin=/home/ubuntu/miniconda3/bin
bedopsbin=/home/ubuntu/miniconda3/bin
picardbin=/home/ubuntu/miniconda3/bin
picardjarfile=picard.jar
samtoolsbin=/home/ubuntu/miniconda3/bin
macs2bin=/home/ubuntu/miniconda3/bin
javabin=/home/ubuntu/miniconda3/bin

#extratoolsbin and extrasettings are custom scripts for CUT&RUN processing.
extratoolsbin=/home/ubuntu/cutruntools
extrasettings=/home/ubuntu/cutruntools

#chromsizedir points to chromosome sizes files, which is needed by some tools.
chromsizedir=$(dirname /home/ubuntu/cutruntools/assemblies/chrom.mm10/mm10.fa)
macs2pythonlib=/home/ubuntu/miniconda3/lib/python3.8/site-packages/

# Set environmental variables from python and C so MACS2 and others can run.
pythonlib=$(echo "$PYTHONPATH" | tr : "\n" | grep -v "$macs2pythonlib" | paste -s -d:)
unset PYTHONPATH
export PYTHONPATH="$macs2pythonlib:$pythonlib"

pythonldlibrary=/home/ubuntu/miniconda3/lib
ldlibrary=$(echo "$LD_LIBRARY_PATH" | tr : "\n" | grep -v "$pythonldlibrary" | paste -s -d:)
unset LD_LIBRARY_PATH
export LD_LIBRARY_PATH="$pythonldlibrary:$ldlibrary"

#Input and Working Directories Info. $1 is the input BAM file.
>&2 echo "Input parameters are: $1"
>&2 date

#Find the path of the BAM file given.
relinfile=$(realpath -s "$1")
dirname=$(dirname "$relinfile")
base=$(basename "$1" .bam)

#cd to current directory (aligned.aug10)
cd "$dirname"

#create subdirectories
workdir=$(pwd)
logdir=$workdir/logs

for d in "$logdir" sorted dup.marked dedup; do
  [ ! -d "$d" ] && run "mkdir -p '$d'"
done

#Use samtools to filter for properly paired reads and remove unmapped fragments.
>&2 echo "Filtering unmapped fragments... $base.bam"
run "$samtoolsbin/samtools view -bh -f 3 -F 4 -F 8 '$dirname/$base.bam' > sorted/'$base'.step1.bam"

#Sort BAM by genomic coordinates.
>&2 echo "Sorting BAM... $base.bam"
run "$javabin/java -jar $picardbin/$picardjarfile SortSam INPUT=sorted/'$base'.step1.bam OUTPUT=sorted/'$base'.bam SORT_ORDER=coordinate VALIDATION_STRINGENCY=SILENT"
run "rm -f sorted/'$base'.step1.bam"

#Picard identifies PCR duplicates and flags them.
>&2 echo "Marking duplicates... $base.bam"
run "$javabin/java -jar $picardbin/$picardjarfile MarkDuplicates INPUT=sorted/'$base'.bam OUTPUT=dup.marked/'$base'.bam VALIDATION_STRINGENCY=SILENT METRICS_FILE=metrics.'$base'.txt"

#Removes PCR duplicates. -F 1024 keeps only unique fragments.
>&2 echo "Removing duplicates... $base.bam"
run "$samtoolsbin/samtools view -bh -F 1024 dup.marked/'$base'.bam > dedup/'$base'.bam"

#Filter for <120bp reads
for d in dup.marked.120bp dedup.120bp; do
  [ ! -d "$d" ] && run "mkdir -p '$d'"
done

>&2 echo "Filtering to <120bp... $base.bam"
run "$samtoolsbin/samtools view -h dup.marked/'$base'.bam | LC_ALL=C awk -f '$extrasettings/filter_below.awk' | $samtoolsbin/samtools view -Sb - > dup.marked.120bp/'$base'.bam"
run "$samtoolsbin/samtools view -h dedup/'$base'.bam | LC_ALL=C awk -f '$extrasettings/filter_below.awk' | $samtoolsbin/samtools view -Sb - > dedup.120bp/'$base'.bam"

#Index the BAM files
>&2 echo "Creating bam index files... $base.bam"
for d in sorted dup.marked dedup dup.marked.120bp dedup.120bp; do
  run "$samtoolsbin/samtools index '$d/$base.bam'"
done

#Peak calling using MACS2
cur=$(pwd)
>&2 echo "Peak calling using MACS2... $base.bam"
>&2 echo "Logs are stored in $logdir"
>&2 date

outdir=$workdir/../macs2.narrow.all.frag.aug18
outdir2=$workdir/../macs2.narrow.all.frag.aug18.dedup
outdirbroad=$workdir/../macs2.broad.all.frag.aug18
outdirbroad2=$workdir/../macs2.broad.all.frag.aug18.dedup
outdirseac=$workdir/../seacr.aug12.all.frag
outdirseac2=$workdir/../seacr.aug12.all.frag.dedup

for d in "$outdir" "$outdir2" "$outdirbroad" "$outdirbroad2" "$outdirseac" "$outdirseac2"; do
  [ ! -d "$d" ] && run "mkdir -p '$d'"
done

#Define the BAM file for SEACR
bam_file="dup.marked.120bp/${base}.bam"
base_file=$(basename "$bam_file" .bam)

#Run MACS2 to generate pileup for SEACR
run "$macs2bin/macs2 callpeak -t '$bam_file' -g mm -f BAMPE -n '$base_file' --outdir '$outdirseac' -q 0.01 -B --keep-dup all"

#Convert floating-point pileup to integer for SEACR
run "$pythonbin/python '$extratoolsbin/change.bdg.py' '$outdirseac/${base_file}_treat_pileup.bdg' > '$outdirseac/${base_file}_treat_integer.bdg'"

#Call peaks using SEACR
run "$extratoolsbin/SEACR_1.1.sh '$outdirseac/${base_file}_treat_integer.bdg' 0.01 non stringent '$outdirseac/${base_file}_treat' '$Rscriptbin'"

#Sort SEACR peaks
run "$bedopsbin/sort-bed '$outdirseac/${base_file}_treat.stringent.bed' > '$outdirseac/${base_file}_treat.stringent.sort.bed'"

#Extract summits
run "$pythonbin/python '$extratoolsbin/get_summits_seacr.py' '$outdirseac/${base_file}_treat.stringent.bed' | $bedopsbin/sort-bed - > '$outdirseac/${base_file}_treat.stringent.sort.summits.bed'"

#Clean up intermediate files
for i in _summits.bed _peaks.xls _peaks.narrowPeak _control_lambda.bdg _treat_pileup.bdg; do
  run "rm -f '$outdirseac/${base_file}$i' '$outdirseac2/${base_file}$i'"
done

>&2 echo "Finished SEACR processing for $base_file"
>&2 date

