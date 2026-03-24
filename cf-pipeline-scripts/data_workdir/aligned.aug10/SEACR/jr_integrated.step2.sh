#!/bin/bash
# jr_integrated.step2.sh
# Usage: ./jr_integrated.step2.sh input.bam

set -euo pipefail

# --------- User-configurable ---------
INPUT_BAM=$1
BASE=$(basename "$INPUT_BAM" .bam)
WORKDIR=$(dirname "$INPUT_BAM")       # outputs next to BAM file
SORTED_DIR="$WORKDIR/sorted"
DUP_DIR="$WORKDIR/dup.marked"
DEDUP_DIR="$WORKDIR/dedup"
SEACR_DIR="$WORKDIR/seacr"

MIN_BP=0        # Change to 120 if you want to filter <120bp
GENOME_SIZE=hs  # Adjust for SEACR (hs = human, mm = mouse)

mkdir -p "$SORTED_DIR" "$DUP_DIR" "$DEDUP_DIR" "$SEACR_DIR"

# --------- Step 1: Filter unmapped reads ---------
echo "Filtering unmapped reads..."
samtools view -bh -F 4 "$INPUT_BAM" > "$SORTED_DIR/${BASE}.filtered.bam"

# --------- Step 2: Sort BAM ---------
echo "Sorting BAM..."
samtools sort "$SORTED_DIR/${BASE}.filtered.bam" -o "$SORTED_DIR/${BASE}.sorted.bam"

# --------- Step 3: Mark duplicates ---------
echo "Marking duplicates..."
picard MarkDuplicates \
    INPUT="$SORTED_DIR/${BASE}.sorted.bam" \
    OUTPUT="$DUP_DIR/${BASE}.bam" \
    METRICS_FILE="$DUP_DIR/metrics_${BASE}.txt" \
    REMOVE_DUPLICATES=false \
    VALIDATION_STRINGENCY=SILENT

# --------- Step 4: Optional filter <120bp ---------
if [ "$MIN_BP" -gt 0 ]; then
    echo "Filtering reads shorter than $MIN_BP bp..."
    samtools view -h "$DUP_DIR/${BASE}.bam" | \
        awk -v minbp=$MIN_BP 'BEGIN{OFS="\t"} /^@/ {print $0; next} {if(length($10)>=minbp) print $0}' | \
        samtools view -b -o "$DEDUP_DIR/${BASE}.bam"
    BAM_FOR_SEACR="$DEDUP_DIR/${BASE}.bam"
else
    BAM_FOR_SEACR="$DUP_DIR/${BASE}.bam"
fi

# --------- Step 5: BAM -> bedgraph ---------
echo "Creating bedgraph..."
bedtools genomecov -ibam "$BAM_FOR_SEACR" -bg > "$SEACR_DIR/${BASE}.bedgraph"

# --------- Step 6: Run SEACR ---------
echo "Running SEACR..."
seacr.sh "$SEACR_DIR/${BASE}.bedgraph" "" stringent "$SEACR_DIR/${BASE}_treat.stringent.bed"

# --------- Step 7: Sort BED file ---------
echo "Sorting BED file..."
sort -k1,1 -k2,2n "$SEACR_DIR/${BASE}_treat.stringent.bed" > "$SEACR_DIR/${BASE}_treat.stringent.sorted.bed"

echo "Done! Output BED file: $SEACR_DIR/${BASE}_treat.stringent.sorted.bed"

