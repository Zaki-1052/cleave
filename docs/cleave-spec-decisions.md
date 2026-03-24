# Cleave — Specification Decisions & Script Audit

> **Status**: Living Document
> **Date**: 2026-03-23
> **Author**: Zakir Alibhai + Claude (automated audit)
> **Source**: TODO.md outstanding questions, resolved by reading every script in `references/`

This document records all resolved questions from TODO.md, corrections to existing documentation based on reading the actual lab pipeline scripts, and remaining architectural decisions. It is the single source of truth for "what the pipeline actually does" vs. "what the docs say it does."

---

## 1. User Decisions

These decisions were made during the pre-build planning session on 2026-03-23.

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **MACS2 q-value default** | `0.01` (lab standard) | Matches the lab's existing workflow. More stringent = fewer false positives. CUTANA Cloud's `0.05` available in Peak Calling Advanced Settings. |
| **Fragment size filter (<120bp)** | Default ON | Match the lab workflow. Exposed as checkbox in Peak Calling Advanced Settings (default checked). Sub-nucleosomal fragments are the biologically relevant CUT&RUN signal. |
| **SNAP-CUTANA spike-in QC** | Implement in Phase 3 | Barcode sequences are in the repo (`k_metstat_script.sh`). Low effort (grep counts on FASTQs), high value for QC. Matches CUTANA Cloud's heatmap output. |
| **QC data export** | User will export CSVs | CSVs from the CUTANA Cloud H3K4me3 test run will define the exact QC report schema for mock pipeline data and frontend components. |
| **File upload approach** | Plain multipart initially | 8-10 users on decent internet. Add tus protocol later if resumable uploads are needed. Simplifies Phase 1. |
| **SSE implementation** | 2-second polling initially | Simpler than PG LISTEN/NOTIFY, no asyncpg dependency. Upgrade path to LISTEN/NOTIFY in Phase 7 if polling causes UX issues. |
| **IgG in peak calling** | Run on IgG, flag as control | Lab runs IgG through same pipeline as targets. Clone: run peak calling on IgG, flag as "control" in QC report for benchmark comparison. |
| **Multi-lane FASTQs** | Concatenate server-side | Detect multi-lane files and offer "Merge Lanes" utility, or auto-concatenate during upload processing. |
| **Domain setup** | `coleferguson.com`, end-of-project | DNS propagation is fast with Cloudflare. Not blocking for development. |

---

## 2. Critical Corrections to Existing Documentation

These errors were found by reading the actual scripts in `references/` and comparing against what the documentation says.

### 2.1 MACS2 q-value Discrepancy

- **What docs say**: CUTANA Cloud uses q-value `0.05` (cutana-cloud-docs.md, cutana-cloud-info.md)
- **What lab scripts say**: `-q 0.01` consistently across ALL variants
- **Evidence**: `references/data_workdir/aligned.aug10/integrated.step2.sh` line 115:
  ```
  macs2 callpeak -t ... -g mm -f BAMPE -n ... --outdir ... -q 0.01 -B --SPMR --keep-dup all
  ```
- **Resolution**: Cleave defaults to `0.01` (lab standard). `0.05` available in Advanced Settings.

### 2.2 MACS2 Broad Mode Cutoff (Undocumented)

- **What docs say**: Not documented anywhere
- **What lab scripts say**: `--broad --broad-cutoff 0.1`
- **Evidence**: `integrated.step2.sh` line 119:
  ```
  macs2 callpeak -t ... --broad --broad-cutoff 0.1 -B --SPMR --keep-dup all
  ```
- **Resolution**: Document `0.1` as the default broad cutoff. Expose in Advanced Settings.

### 2.3 Fragment Size Filter (<120bp) — Completely Undocumented

- **What docs say**: Not mentioned in ANY existing document
- **What lab scripts say**: BAMs are filtered to fragments <120bp before peak calling
- **Evidence**: `integrated.step2.sh` lines 79-82:
  ```bash
  samtools view -h dup.marked/"$base".bam | LC_ALL=C awk -f $extrasettings/filter_below.awk | samtools view -Sb - > dup.marked.120bp/"$base".bam
  ```
  The `filter_below.awk` script checks `$9*$9 < 14400` (i.e., absolute TLEN < 120bp).
- **Why this matters**: Fragments <120bp represent sub-nucleosomal fragments (protein footprints), which are the biologically relevant signal in CUT&RUN. Larger fragments are likely nucleosomal carry-over.
- **Resolution**: Cleave includes this filter as default ON in Peak Calling Advanced Settings.

### 2.4 SEACR Version

- **What docs say**: TODO.md speculates "1.3"; cf-lab-pipeline-spec.md says version unknown
- **What repo contains**: `SEACR_1.1.sh` and `SEACR_1.1.R`
- **Evidence**: `references/cutruntools/SEACR_1.1.sh` filename and internal docs
- **Resolution**: Lab uses SEACR 1.1. Pin this version in the clone.

### 2.5 SEACR Uses Numeric Threshold, Not IgG Control

- **What docs imply**: SEACR uses IgG control bedgraph for background subtraction
- **What lab scripts actually do**: Pass a numeric threshold `0.01` with `non` normalization
- **Evidence**: `integrated.step2.sh` line 129:
  ```
  SEACR_1.1.sh ... 0.01 non stringent ...
  ```
  This means "select top 1% of regions by AUC" — no IgG control file is used.
- **Resolution**: Clone supports both modes (IgG bedgraph OR numeric threshold). Default: numeric `0.01` to match lab behavior. Document that SEACR's IgG mode is also available.

### 2.6 SEACR Requires MACS2 Bedgraph Preprocessing (Undocumented)

- **What docs say**: Not documented
- **What lab scripts do**: MACS2 generates bedgraph → `change.bdg.py` converts float scores to integers → SEACR runs on integer bedgraph
- **Evidence**: `integrated.step2.sh` lines 125-129:
  ```bash
  macs2 callpeak -t ... -q 0.01 -B --keep-dup all           # generates _treat_pileup.bdg
  python change.bdg.py ..._treat_pileup.bdg > ..._treat_integer.bdg  # float → int
  SEACR_1.1.sh ..._treat_integer.bdg 0.01 non stringent ...  # SEACR on int bdg
  ```
- **Resolution**: Clone's SEACR pipeline module must include MACS2 bedgraph generation and integer conversion as prerequisite steps.

### 2.7 effectiveGenomeSize Bug in Human BigWig Generation

- **What docs say**: Not documented
- **What lab scripts do**: ALL `create_bams.sh` scripts (including human) use `--effectiveGenomeSize 2467481108` — this is the mm10 value
- **Evidence**: `references/human_workdir/aligned.aug10/create_bams.sh` uses mm10's effective genome size for hg38 bigWig generation
- **Correct values**: See Section 8 below
- **Resolution**: Clone uses correct per-genome effective genome sizes. This is a genuine bug in the lab's pipeline.

### 2.8 Thread Count — Script Variants Differ

- **What docs say**: cf-lab-pipeline-spec.md says `-p 16`
- **Harvard original**: `references/cutruntools/integrated.sh` line 64 uses `-p 2`
- **Lab instance**: `references/data_workdir/integrated.sh` uses `-p 16`
- **Resolution**: The Harvard original is from a shared cluster (conservative thread count). The lab instance script uses the full CPU. Clone parameterizes threads via `nproc` or config setting. Docs are correct about the lab's actual usage.

### 2.9 DiffBind Output Columns Are Dynamic

- **What docs ask**: "Are Conc_mut and Conc_ctrl always those exact strings?"
- **Answer**: NO. They come from DiffBind's `dba.report()` function, which uses condition names from the sample sheet CSV's `Condition` column.
- **Evidence**: `references/DPA/diffbind.R` line 36-41:
  ```r
  dbObj <- dba.contrast(dbObj, categories = DBA_CONDITION, minMembers = 2)
  dbAnalyze <- dba.analyze(dbObj)
  diffResults <- dba.report(dbAnalyze, contrast=1, th=1)
  out <- as.data.frame(diffResults)
  ```
  The `dba.report()` GRanges object columns include `Conc`, `Conc_<condition1>`, `Conc_<condition2>`, `Fold`, `p.value`, `FDR` where condition names are dynamic.
- **Resolution**: Clone's DiffBind wrapper must read the condition column names dynamically from the sample sheet, not hard-code "Conc_mut"/"Conc_ctrl".

---

## 3. Resolved TODO.md Questions

### Q1: Can you export QC data (CSVs) from your CUTANA Cloud test run?
**Status**: RESOLVED — Both CSVs exported and in repo at `cutana/H3K4me3/Mouse mm10_alignment_metrics.csv` (alignment QC) and `cutana/H3K4me3/peak_caller_metrics.csv` (peak calling QC).

### Q2: Tusd vs. Python-native tus vs. plain multipart upload?
**Status**: RESOLVED — Start with plain multipart upload with generous NGINX `client_max_body_size`. Add tus protocol later if needed. For 8-10 lab users on decent internet, this is sufficient for Phase 1.

### Q3: PG LISTEN/NOTIFY vs. simple polling for SSE?
**Status**: RESOLVED — Start with 2-second polling. Simpler, no asyncpg dependency, perfectly adequate for 8-10 users. Upgrade to LISTEN/NOTIFY in Phase 7 (Polish) if polling causes UX issues.

### Q4: Does the lab instance have pre-built Bowtie2 indices?
**Status**: RESOLVED — Config files confirm indices exist:
- **mm10**: `config2.json` → `bt2idx: /home/ubuntu/cutruntools/assemblies/chrom.mm10` ✅
- **hg38**: `config_human.json` → `bt2idx: /home/ubuntu/cutruntools/assemblies/chrom.hg38` ✅
- **E. coli**: `ecoli_config.json` → `bt2idx: /home/ubuntu/cutruntools/assemblies/chrom.ecoli` ✅
- **Action**: scp all three from lab instance to avoid rebuilding (saves hours).

### Q5: What gene annotation BED file does the lab use for heatmaps?
**Status**: RESOLVED — The lab does NOT use gene annotation BEDs for heatmaps.
- **Evidence**: `references/genomewide_plots/heatmaps.sh` line 74:
  ```
  computeMatrix reference-point --referencePoint center -R "${bedFile}" -S"${matrix_string}" -a 1500 -b 1500
  ```
  The `bedFile` is a summit BED from MACS2, not a gene annotation file.
- **CUTANA Cloud** uses TSS and gene body heatmaps, which DO need RefSeq/GENCODE BEDs.
- **Clone supports BOTH**: Preset heatmaps (TSS/gene body from RefSeq BEDs, matching CUTANA Cloud) + custom heatmaps (user-provided summit/region BEDs, matching lab workflow).
- **Action**: Download RefSeq BEDs from UCSC Table Browser for mm10 and hg38.

### Q6: What ENCODE blacklist version does the lab use?
**Status**: RESOLVED — ENCODE/DAC v1 (NOT Boyle Lab v2).
- **Evidence**: `references/cutruntools/blacklist.readme`:
  ```
  hg19 blacklists is merge of two files:
  Duke_Hg19SignalRepeatArtifactRegions.bed wgEncodeDacMapabilityConsensusExcludable.bed
  ```
- Files in repo: `mm10.blacklist.bed` (164 lines), `hg38.blacklist.bed` (38 lines), `hg19.blacklist.bed` (2060 lines)
- **Note**: The hg38 blacklist is unusually small (38 lines). Consider supplementing with Boyle Lab v2 (`hg38-blacklist.v2.bed.gz`, ~910 entries) for better filtering.
- **Action**: Ship the existing files from the repo. Optionally add Boyle Lab v2 as an alternative.

### Q7: Is the kseq_test fixed-length trim step actually necessary?
**Status**: RESOLVED — YES, 42bp default, user-configurable.
- **Evidence**: Config files confirm `fastq_sequence_length: 42` across all organisms.
- kseq_test source (`kseq_test.c`), header (`kseq.h`), build script (`make_kseq_test.sh`), and pre-compiled binary are all in `references/cutruntools/`.
- Build command: `gcc -O2 kseq_test.c -lz -o kseq_test`

### Q8: Is SNAP-CUTANA spike-in QC a priority?
**Status**: RESOLVED — YES, implement in Phase 3.
- **Key finding**: ALL 32 barcode sequences (16 PTMs × 2 barcodes A+B) are published in `references/media_misc/k_metstat_script.sh`, written by Dr. Bryan Venters of EpiCypher.
- Implementation is straightforward: `grep -c $barcode` on unzipped FASTQs for each of 32 barcodes, then normalize and generate heatmap.
- This was previously considered blocked by "proprietary data" — the data is freely available.

### Q9: Get copies of lab scripts (diffbind.R, normalization.r, etc.)
**Status**: RESOLVED — ALL scripts are already in the repo under `references/`.

Complete inventory of scripts that TODO.md said needed to be collected:

| Script | Location in Repo | Status |
|--------|-----------------|--------|
| `diffbind.R` | `references/DPA/diffbind.R` | In repo (has bugs — see Section 4) |
| `diffbind_peaklist.R` | `references/DPA/diffbind_peaklist.R` | In repo (has bugs — see Section 4) |
| `diffbind_peaklist_edgeR.R` | `references/DPA/diffbind_peaklist_edgeR.R` | In repo (has bugs) |
| `normalization.r` | `references/media_normalization/normalization.r` | In repo |
| `input_normalization.r` | `references/media_normalization/input_normalization.r` | In repo |
| `peak_extractor.r` | `references/media_pearson_corr/peak_extractor.r` | In repo |
| `pearson.py` | `references/media_pearson_corr/pearson.py` | In repo |
| `heatmapjai.sh` / `heatmaps.sh` | `references/genomewide_plots/heatmaps.sh` | In repo |
| `subtract_blacklist.sh` | `references/data_workdir/blklist_subtract/subtract_blacklist.sh` | In repo |
| `integrated.sh` (all variants) | `references/{cutruntools,data_workdir,human_workdir}/integrated.sh` | In repo |
| `integrated.step2.sh` | `references/data_workdir/aligned.aug10/integrated.step2.sh` | In repo |
| `create_bams.sh` | `references/data_workdir/aligned.aug10/create_bams.sh` | In repo |
| `SEACR_1.1.sh` + `SEACR_1.1.R` | `references/cutruntools/SEACR_1.1.{sh,R}` | In repo |
| `k_metstat_script.sh` | `references/media_misc/k_metstat_script.sh` | In repo |
| All AP test scripts | `references/media_ap_tests/` | In repo |
| Conda env YAMLs (27 files) | `references/conda_envs/` | In repo |

### Q10: DiffBind output columns — are "Conc_mut" and "Conc_ctrl" always those exact strings?
**Status**: RESOLVED — NO, they are dynamic. See Section 2.9 above.

### Q11: IgG control handling in peak calling
**Status**: RESOLVED — Lab runs IgG through the same pipeline as all other samples (no special treatment in `integrated.step2.sh`). CUTANA Cloud includes IgG in peak annotation plots. Clone: run peak calling on IgG, flag as control in QC report.

### Q12: Multi-lane FASTQ strategy
**Status**: RESOLVED — Concatenate before processing. Already documented in cf-lab-pipeline-spec.md Stage 0.

### Q13: Domain setup timing
**Status**: RESOLVED — `coleferguson.com`, end-of-project task. Not blocking.

---

## 4. DiffBind Script Bugs

Three bugs found in the DiffBind R scripts at `references/DPA/`. These must be fixed when implementing the clone's DiffBind pipeline module.

### Bug 1: Missing closing parenthesis on `write.csv()`

**Affected files**: `diffbind.R` line 88, `diffbind_peaklist.R` line 89

```r
# BROKEN (line 88):
write.csv(dba.peakset(dbAnalyze, bRetrieve = TRUE), file = normalized_counts

# FIXED:
write.csv(dba.peakset(dbAnalyze, bRetrieve = TRUE), file = normalized_counts)
```

### Bug 2: Malformed completion message

**Affected files**: `diffbind.R` line 91-92, `diffbind_peaklist.R` line 92

```r
# BROKEN (diffbind.R line 91):
cat(paste("DiffBind analysis complete. Export txt file for functional analysis. Results are in") results_dir))

# FIXED:
cat(paste("DiffBind analysis complete. Export txt file for functional analysis. Results are in", results_dir))
```

### Bug 3: Missing `dev.off()` between PNG and SVG device opens

**Affected files**: All three DiffBind scripts, repeated across 5 plot blocks

```r
# BROKEN pattern (e.g., lines 48-52):
png(pca_plot_file)
dba.plotPCA(dbAnalyze, contrast = 1)
svg(pca_plot_svg, width=10, height=10)    # PNG device never closed!
dba.plotPCA(dbAnalyze, contrast = 1)
dev.off()                                  # Only closes SVG

# FIXED:
png(pca_plot_file)
dba.plotPCA(dbAnalyze, contrast = 1)
dev.off()                                  # Close PNG device
svg(pca_plot_svg, width=10, height=10)
dba.plotPCA(dbAnalyze, contrast = 1)
dev.off()                                  # Close SVG device
```

**Note**: The `write.table()` call on line 43 DOES include headers by default (`row.names=F`). The TODO.md claim about "missing header row" likely refers to an older version of the script or a different output format. The current scripts produce correctly-headed output.

---

## 5. Roman Normalization Algorithm

Exact algorithm from reading `references/media_normalization/normalization.r`:

1. **Load bigWig files** using `rtracklayer::import.bw()` at 50bp resolution
2. **Extract mouse chromosomes only**: chr1-19, chrX (no chrY, no random/Un contigs)
3. **Build coverage matrix**: rows = 50bp genomic bins, columns = samples. Each cell = signal value at that bin
4. **Remove zero-coverage bins**: Rows where ALL samples have zero signal are discarded
5. **Apply masking** from `manual.mask.ultimate.bed` (158 regions of artificially high/low signal). Bins overlapping masked regions are removed
6. **Calculate 99th percentile** of signal for each sample using `quantile(x, 0.99)`
7. **Compute normalization factor**: `nf = percentile_99[sample] / percentile_99[sample_1]` (all samples normalized to the first sample listed)
8. **Divide all signal values** by the normalization factor: `normalized = original / nf`
9. **Export normalized bigWig files** with `_rnorm.bw` suffix using `rtracklayer::export.bw()`

**Key insight**: This is NOT simple read-depth normalization. It's a 99th-percentile quantile normalization with custom masking. The masking removes regions with artificially high/low signal that would skew the percentile calculation.

**Limitation**: Mouse only (hardcoded chromosome list). Human normalization would need chr1-22 + chrX.

---

## 6. Pipeline Parameter Reference

Consolidated from ALL script variants in the repo:

| Parameter | Harvard Original | Lab Instance | CUTANA Cloud | Cleave Default |
|-----------|-----------------|-------------|--------------|----------------|
| Bowtie2 threads | `-p 2` | `-p 16` | Unknown | `nproc` (auto) |
| Trimmomatic threads | `-threads 1` | `-threads 16` | N/A | `nproc` (auto) |
| Bowtie2 flags | `--dovetail --phred33` | `--dovetail --phred33` | Unknown | `--dovetail --phred33` |
| Trimmomatic adapters | `Truseq3.PE.fa` | `Truseq3.PE.fa` | N/A | `Truseq3.PE.fa` |
| ILLUMINACLIP | `2:15:4:4:true` | `2:15:4:4:true` | N/A | `2:15:4:4:true` |
| LEADING | 20 | 20 | N/A | 20 |
| TRAILING | 20 | 20 | N/A | 20 |
| SLIDINGWINDOW | `4:15` | `4:15` | N/A | `4:15` |
| MINLEN | 25 | 25 | N/A | 25 |
| kseq_test length | 42bp | 42bp | N/A | 42bp |
| MACS2 narrow q-value | `-q 0.01` | `-q 0.01` | `-q 0.05` | **`0.01`** |
| MACS2 broad cutoff | N/A | `--broad-cutoff 0.1` | Unknown | `0.1` |
| MACS2 genome size | `-g hs` / `-g mm` | `-g mm` / `-g hs` | Auto | Auto from organism |
| MACS2 format | `-f BAMPE` | `-f BAMPE` | Unknown | `-f BAMPE` |
| Fragment filter | N/A | `<120bp` ON | None | **`<120bp` ON** |
| SEACR version | N/A | 1.1 | N/A | 1.1 |
| SEACR threshold | N/A | `0.01 non stringent` | N/A | `0.01 non stringent` |
| bamCoverage binsize | N/A | N/A (uses MACS2 bdg→bw) | 20bp / 100bp | 20bp / 100bp |
| bamCoverage normalization | N/A | N/A | RPKM | RPKM |
| Heatmap flanking | N/A | `-a 1500 -b 1500` | Unknown | `-a 1500 -b 1500` |

---

## 7. Effective Genome Sizes

Correct values for `bamCoverage --effectiveGenomeSize`:

| Genome | Effective Size | Source |
|--------|---------------|--------|
| mm10 | 2,467,481,108 | deepTools documentation |
| hg38 | 2,913,022,398 | deepTools documentation |
| hg19 | 2,864,785,220 | deepTools documentation |
| dm6 | 142,573,017 | deepTools documentation |
| sacCer3 | 12,157,105 | deepTools documentation |

**Bug in lab pipeline**: The lab's `create_bams.sh` scripts (including `human_workdir/`) use `2467481108` (mm10's value) for ALL organisms. This means human bigWig files have been generated with incorrect normalization. The clone MUST use the correct per-genome values.

---

## 8. SNAP-CUTANA K-MetStat Panel Barcode Sequences

All 32 barcode sequences (16 PTMs × 2 barcodes each) are in `references/media_misc/k_metstat_script.sh`, written by Dr. Bryan Venters of EpiCypher (updated 29 OCT 2021).

| PTM | Barcode A | Barcode B |
|-----|-----------|-----------|
| Unmodified | TTCGCGCGTAACGACGTACCGT | CGCGATACGACCGCGTTACGCG |
| H3K4me1 | CGACGTTAACGCGTTTCGTACG | CGCGACTATCGCGCGTAACGCG |
| H3K4me2 | CCGTACGTCGTGTCGAACGACG | CGATACGCGTTGGTACGCGTAA |
| H3K4me3 | TAGTTCGCGACACCGTTCGTCG | TCGACGCGTAAACGGTACGTCG |
| H3K9me1 | TTATCGCGTCGCGACGGACGTA | CGATCGTACGATAGCGTACCGA |
| H3K9me2 | CGCATATCGCGTCGTACGACCG | ACGTTCGACCGCGGTCGTACGA |
| H3K9me3 | ACGATTCGACGATCGTCGACGA | CGATAGTCGCGTCGCACGATCG |
| H3K27me1 | CGCCGATTACGTGTCGCGCGTA | ATCGTACCGCGCGTATCGGTCG |
| H3K27me2 | CGTTCGAACGTTCGTCGACGAT | TCGCGATTACGATGTCGCGCGA |
| H3K27me3 | ACGCGAATCGTCGACGCGTATA | CGCGATATCACTCGACGCGATA |
| H3K36me1 | CGCGAAATTCGTATACGCGTCG | CGCGATCGGTATCGGTACGCGC |
| H3K36me2 | GTGATATCGCGTTAACGTCGCG | TATCGCGCGAAACGACCGTTCG |
| H3K36me3 | CCGCGCGTAATGCGCGACGTTA | CCGCGATACGACTCGTTCGTCG |
| H4K20me1 | GTCGCGAACTATCGTCGATTCG | CCGCGCGTATAGTCCGAGCGTA |
| H4K20me2 | CGATACGCCGATCGATCGTCGG | CCGCGCGATAAGACGCGTAACG |
| H4K20me3 | CGATTCGACGGTCGCGACCGTA | TTTCGACGCGTCGATTCGGCGA |

Implementation: `grep -c $barcode` on unzipped R1 and R2 FASTQs, sum A+B counts per PTM, normalize relative to on-target PTM, generate heatmap. EpiCypher considers <20% off-target binding as passing.

---

## 9. Data Already in Repo — Complete File Index

### 9.1 Adapter FASTAs
Copy to `backend/pipelines/adapters/`:
- `references/cutruntools/adapters/Truseq3.PE.fa` (260 B, primary)
- `references/cutruntools/adapters/Truseq3.SE.fa` (120 B)
- `references/cutruntools/adapters/NexteraPE-PE.fa` (240 B)
- `references/cutruntools/adapters/TruSeqAdapters.fa` (8.9 KB)

### 9.2 Blacklist BED Files
Copy to `backend/pipelines/reference/blacklists/`:
- `references/cutruntools/mm10.blacklist.bed` (164 entries)
- `references/cutruntools/hg38.blacklist.bed` (38 entries — unusually small)
- `references/cutruntools/hg19.blacklist.bed` (2060 entries)
- `references/cutruntools/mm9.blacklist.bed` (3038 entries)
- `references/data_workdir/blklist_subtract/250123blacklist.bed` (254 entries, custom mm10)

### 9.3 Chromosome Sizes
Copy to `backend/pipelines/reference/chrom_sizes/`:
- `references/cutruntools/assemblies/chrom.mm10/mm10.chrom.sizes`
- `references/cutruntools/assemblies/chrom.hg38/hg38.chrom.sizes`
- `references/cutruntools/assemblies/chrom.hg19/hg19.chrom.sizes`
- `references/cutruntools/assemblies/chrom.mm9/mm9.chrom.sizes`
- `references/cutruntools/assemblies/chrom.ecoli/ecoli.chrom.sizes`

### 9.4 Pipeline Helper Tools
Copy to `backend/pipelines/tools/`:
- `references/cutruntools/SEACR_1.1.sh` — SEACR peak caller (bash)
- `references/cutruntools/SEACR_1.1.R` — SEACR R component
- `references/cutruntools/filter_below.awk` — Fragment size filter (<120bp)
- `references/cutruntools/change.bdg.py` — Float→integer bedgraph conversion (SEACR prereq)
- `references/cutruntools/get_summits_seacr.py` — Extract summits from SEACR peaks
- `references/cutruntools/get_summits_broadPeak.py` — Extract summits from MACS2 broad peaks

### 9.5 kseq_test Source
Copy to `backend/pipelines/tools/`:
- `references/cutruntools/kseq_test.c` (C source)
- `references/cutruntools/kseq.h` (header)
- `references/cutruntools/make_kseq_test.sh` (`gcc -O2 kseq_test.c -lz -o kseq_test`)
- `references/cutruntools/kseq_test` (pre-compiled x86_64 binary from lab instance)

### 9.6 Spike-in Barcode Sequences
- `references/media_misc/k_metstat_script.sh` — All 32 sequences (see Section 8)

### 9.7 Masking BEDs
Copy to `backend/pipelines/reference/masks/`:
- `references/media_normalization/manual.mask.ultimate.bed` (158 entries, mouse mm10)

### 9.8 Lab Analysis Scripts (Reference Implementation)
These are the actual scripts to port into Cleave's pipeline modules:
- `references/DPA/diffbind.R` — DiffBind standard analysis
- `references/DPA/diffbind_peaklist.R` — DiffBind with consensus peakset
- `references/DPA/diffbind_peaklist_edgeR.R` — DiffBind with edgeR backend
- `references/media_normalization/normalization.r` — Roman normalization
- `references/media_pearson_corr/peak_extractor.r` — Pearson correlation (R: bigWig→matrix)
- `references/media_pearson_corr/pearson.py` — Pearson correlation (Python: matrix→heatmap)
- `references/genomewide_plots/heatmaps.sh` — Custom reference-point heatmaps

### 9.9 Core Pipeline Scripts (Reference Implementation)
- `references/cutruntools/integrated.sh` — Harvard original alignment
- `references/data_workdir/integrated.sh` — Lab mm10 alignment (16 threads)
- `references/human_workdir/integrated.sh` — Lab hg38 alignment
- `references/data_workdir/aligned.aug10/integrated.step2.sh` — Peak calling (all 3 callers)
- `references/data_workdir/aligned.aug10/create_bams.sh` — BigWig generation

### 9.10 Config Files
- `references/cutruntools/config2.json` — mm10 config (paths, params)
- `references/cutruntools/config_human.json` — hg38 config
- `references/cutruntools/ecoli_config.json` — E. coli spike-in config
- `references/cutruntools/config_atac.json` — ATAC-seq config

### 9.11 Conda Environment Specs
- `references/conda_envs/conda_cutrunseq.yml` — Main CUT&RUN tools
- `references/conda_envs/conda_diffbind.yml` — DiffBind + dependencies
- `references/conda_envs/conda_bwnorm.yml` — Roman normalization (R + rtracklayer)
- `references/conda_envs/conda_deeptools_env.yml` — deepTools for heatmaps
- `references/conda_envs/conda_homer.yml` — HOMER annotation
- `references/conda_envs/conda_picard_env.yml` — Picard tools

---

## 10. Data Download Steps for Local Mac Development

### 10.1 Small Files — Copy from Repo (Do Now)

```bash
cd /Users/zakiralibhai/Documents/VS_Code/cleave

# Create target directory structure
mkdir -p backend/pipelines/{adapters,reference/{blacklists,chrom_sizes,masks},tools}

# Adapters
cp references/cutruntools/adapters/*.fa backend/pipelines/adapters/

# Blacklists
cp references/cutruntools/{mm10,hg38,hg19}.blacklist.bed backend/pipelines/reference/blacklists/

# Chromosome sizes
cp references/cutruntools/assemblies/chrom.mm10/mm10.chrom.sizes backend/pipelines/reference/chrom_sizes/
cp references/cutruntools/assemblies/chrom.hg38/hg38.chrom.sizes backend/pipelines/reference/chrom_sizes/
cp references/cutruntools/assemblies/chrom.hg19/hg19.chrom.sizes backend/pipelines/reference/chrom_sizes/
cp references/cutruntools/assemblies/chrom.ecoli/ecoli.chrom.sizes backend/pipelines/reference/chrom_sizes/

# Pipeline tools
cp references/cutruntools/{SEACR_1.1.sh,SEACR_1.1.R,filter_below.awk,change.bdg.py} backend/pipelines/tools/
cp references/cutruntools/{get_summits_seacr.py,get_summits_broadPeak.py} backend/pipelines/tools/
cp references/cutruntools/{kseq_test.c,kseq.h,make_kseq_test.sh} backend/pipelines/tools/

# Masks
cp references/media_normalization/manual.mask.ultimate.bed backend/pipelines/reference/masks/
```

### 10.2 Large Files — EC2 Instance Setup (Do Later)

```bash
# Bowtie2 indices — scp from lab instance (saves hours vs rebuilding)
scp -i 210323.pem ubuntu@<ec2>:/home/ubuntu/cutruntools/assemblies/chrom.mm10/mm10*.bt2 /data/cleave/genomes/mm10/
scp -i 210323.pem ubuntu@<ec2>:/home/ubuntu/cutruntools/assemblies/chrom.hg38/hg38*.bt2 /data/cleave/genomes/hg38/
scp -i 210323.pem ubuntu@<ec2>:/home/ubuntu/cutruntools/assemblies/chrom.ecoli/ecoli*.bt2 /data/cleave/genomes/ecoli/

# Gene annotation BEDs for TSS/gene body heatmaps
# Option A: UCSC Table Browser → assembly (mm10/hg38) → track "NCBI RefSeq" → table "refGene" → output BED
# Option B: GENCODE GTFs from gencodegenes.org (mm10: Release M25, hg38: Release 44)

# HOMER genome data
perl configureHomer.pl -install mm10
perl configureHomer.pl -install hg38
```

### 10.3 Test Data Creation

```bash
# Downsample FASTQs to 100K reads for local testing (requires seqtk)
# brew install seqtk  # or conda install seqtk
seqtk sample -s42 input_R1.fastq.gz 100000 | gzip > test_data/test_R1.fastq.gz
seqtk sample -s42 input_R2.fastq.gz 100000 | gzip > test_data/test_R2.fastq.gz
```

---

## 11. Peak Calling Pipeline — Full Flow (From Scripts)

The actual peak calling pipeline from `integrated.step2.sh`, documented for implementation:

```
Input: aligned_reads.bam (from integrated.sh)
                │
                ▼
    ┌───────────────────────┐
    │ samtools view -bh      │  Filter unmapped fragments
    │ -f 3 -F 4 -F 8        │  (properly paired, both mapped)
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │ Picard SortSam         │  Sort by coordinate
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │ Picard MarkDuplicates  │  Mark PCR duplicates
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────────┐
    │ samtools view -bh      │  Remove duplicates
    │ -F 1024                │  → dedup/
    └───────────┬───────────┘
                │
        ┌───────┴───────┐
        ▼               ▼
  dup.marked/      dedup/
        │               │
        ▼               ▼
    ┌───────────────────────┐
    │ filter_below.awk       │  Fragment size filter (<120bp)
    │ (sub-nucleosomal)      │  → dup.marked.120bp/ and dedup.120bp/
    └───────────┬───────────┘
                │
        ┌───────┼───────┐
        ▼       ▼       ▼
    MACS2     MACS2    SEACR
    narrow    broad    (stringent + relaxed)
    -q 0.01   --broad
              -cutoff
              0.1

    For SEACR: MACS2 bdg → change.bdg.py → SEACR_1.1.sh
```

Each caller runs in both `dup.marked.120bp` (with duplicates) and `dedup.120bp` (without duplicates) modes, producing 12 output directories total. The clone should expose the key dimensions (peak caller, dedup strategy, fragment filter) as user choices.

---

## 12. Web App Infrastructure Decisions

Decisions on the web app scaffolding layer, resolved 2026-03-23 (second round).

### Phase 1 — Bake Into Scaffold

| # | Item | Decision |
|---|------|----------|
| 1 | **Env var inventory** | Create `.env.example` from day one. Phase 1 vars: `DATABASE_URL`, `SECRET_KEY`, `REFRESH_SECRET_KEY`, `ACCESS_TOKEN_EXPIRE_MINUTES=15`, `REFRESH_TOKEN_EXPIRE_DAYS=7`, `CORS_ORIGINS=http://localhost:5173`, `UPLOAD_DIR`, `MAX_UPLOAD_SIZE_MB=5000`, `PIPELINE_MODE=mock`, `STORAGE_ROOT=/data/cleave`. Phase 3+ adds: `GENOME_INDEX_DIR`, `AWS_SES_REGION`, `AWS_SES_FROM_EMAIL`, `WORKER_POLL_INTERVAL=2`. |
| 2 | **API error format** | Standardize all error responses to `{"error": str, "detail": str \| null, "field_errors": dict \| null}`. Validation errors populate `field_errors`. Auth/permission/not-found populate `error` + `detail`. FastAPI exception handlers normalize everything to this shape. |
| 3 | **Pagination contract** | All list endpoints return `{"items": [...], "total": int, "page": int, "per_page": int}`. Query params: `?page=1&per_page=25`. Matches CUTANA Cloud's "Records per page" UI pattern. |
| 4 | **CORS** | FastAPI `CORSMiddleware` allowing `http://localhost:5173` in dev. In production, NGINX proxies everything through one origin so CORS isn't needed — but local dev breaks without it. |
| 5 | **Refresh token / CSRF** | Now handled by fastapi-users `CookieTransport` configuration: `cookie_httponly=True`, `cookie_samesite="lax"`, `cookie_secure=True` (prod), `cookie_max_age=604800` (7 days). Access token via `BearerTransport` (15-min expiry), stored in memory by Axios. Same security properties as the original hand-rolled plan, but trivially auditable as named parameters. |
| 6 | **Password reset** | **Deferred to Phase 3**, not permanently skipped. fastapi-users includes a complete, secure password reset flow (`get_reset_password_router()`) out of the box, but it requires email transport (SES) to send the reset link. Enable in Phase 3 when SES is configured for job completion emails — this is a config flag flip, not a feature build. Add `/auth/forgot-password` to the rate limiting list when enabled. |
| 7 | **Frontend API client** | Axios with interceptors. Auth header injection (`Authorization: Bearer <token>`), 401 → automatic refresh flow, error response normalization to match backend schema. Request cancellation and progress events useful for FASTQ uploads. |
| 8 | **Application logging** | Python `logging` + `structlog` for structured JSON logging. Set up in scaffold so all modules use a consistent logger from day one. Covers API requests, auth events, errors. Pipeline execution logs are separate (stdout/stderr captured to files). |
| 9 | **Rate limiting** | Add `slowapi` as a backend dependency. Apply rate limits to auth endpoints: `/api/v1/auth/login` (5 attempts/min per IP), `/api/v1/auth/register` (3/min per IP). ~20 lines of middleware configuration. fastapi-users does not include rate limiting — this must be added separately. |

### Phase 3+ — Implement Later

| # | Item | Decision |
|---|------|----------|
| 10 | **Email notifications** | Amazon SES from Phase 3. Already on AWS, pennies per email. In-app notifications + SSE only for Phases 1-2. Env vars: `AWS_SES_REGION`, `AWS_SES_FROM_EMAIL`. |
| 11 | **QC report schemas** | Define `AlignmentQCReport` and `PeakCallingQCReport` Pydantic models based on exported CSVs in `cutana/H3K4me3/`. Both the mock pipeline and real pipeline must produce data conforming to these schemas. |
| 12 | **hg38 blacklist supplement** | Ship both the lab's ENCODE/DAC v1 file (38 entries) AND Boyle Lab v2 (~910 entries). Default to Boyle Lab v2 in the UI. Let users pick in Advanced Settings. |
| 13 | **Gene annotation BEDs** | Download RefSeq BEDs from UCSC Table Browser (mm10, hg38) for TSS/gene body heatmaps. Needed for Phase 3 alignment heatmaps. Not blocking Phase 1. |
