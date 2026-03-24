# Ferguson Lab CUT&RUN/CUT&Tag/ATAC-seq Pipeline
## Implementation Specification for CUTANA Cloud Clone

> This document captures every pipeline stage, script, parameter, directory convention, and software dependency used in the Ferguson Lab's CUT&RUN processing workflow. It serves as the authoritative reference for implementing equivalent functionality in the CUTANA Cloud clone web application.

---

## 1. Infrastructure & Environment

### Compute
- **Platform**: AWS EC2 instance (single shared instance for the whole lab)
- **AWS Account**: `433642023207` (IAM login)
- **Auth**: PEM key (`210323.pem`) + SSH
- **SSH pattern**: `ssh -i ./210323.pem ubuntu@<ec2-public-dns>.compute.amazonaws.com`
- **OS**: Ubuntu (apt-get available)
- **Critical rule**: Never terminate the instance — only stop it. Check user count before stopping (`0` = safe to stop).

### Storage Layout

```
/data/rs_256/
├── fastq/                    # Mouse FASTQ storage
├── human_fastq/              # Human FASTQ storage
├── atac_fastq/               # ATAC-seq FASTQ storage
├── workdir/                  # Mouse CUT&RUN working directory
│   ├── integrated.sh         # Main alignment+trim script
│   ├── integrated.step2.sh   # Peak calling + bigWig script
│   ├── aligned.aug10/        # Output BAMs + bigWigs
│   │   └── create_bams.sh    # BigWig generation script
│   ├── blklist_subtract/
│   │   ├── to_subtract/      # Input BED files
│   │   ├── subtracted_bedfiles/  # Output blacklist-subtracted BEDs
│   │   └── subtract_blacklist.sh
│   └── DPA/                  # (may also be on /data2)
│       ├── diffbind.R
│       └── diffbind_peaklist.R
├── human_workdir/            # Human CUT&RUN working directory
│   └── aligned.aug10/
└── atac_workdir/             # ATAC-seq working directory
    └── aligned.aug10/

/data2/rs_256/
├── workdir/
│   └── DPA/                  # Differential Peak Analysis
│       ├── diffbind.R
│       └── diffbind_peaklist.R
└── genomewide_plots/
    ├── ap_refpoint_heatmap2.sh
    └── heatmapjai.sh

/media/rs_256/
├── ap_tests/                 # AP's simplified scripts
│   ├── ap_generate_bw.sh          # Mouse bigWigs
│   ├── ap_human_generate_bw.sh    # Human bigWigs
│   ├── ap_bed_files.sh            # Mouse BED files
│   ├── ap_remove_files.sh         # Cleanup FASTQ artifacts
│   └── ap_remove_bed.sh           # Cleanup BED artifacts
├── normalization/
│   └── master_files/
│       ├── normalization.r         # Roman normalization (mouse only)
│       └── input_normalization.r   # AP's normalization variant
└── pearson_corr/
    ├── peak_extractor.r      # Extract peaks for correlation
    └── pearson.py            # Generate correlation heatmaps

~/cutruntools/
├── create_scripts.py         # Creates symlinks + working dirs
├── atac_create_scripts.py    # ATAC-seq variant
├── config2.json              # Mouse config (/data)
├── config3.json              # Mouse config (/data2)
├── config_human.json         # Human config
├── config_atac.json          # ATAC-seq config
└── assemblies/
    └── chrom.mm10            # mm10 chromosome sizes
```

### Conda Environments

| Environment | Purpose | Activation |
|---|---|---|
| `base` | General tools, MultiQC | `conda activate base` |
| (default) | Alignment, bigWig generation, AP's scripts | `conda activate` |
| `bwnorm` | Roman normalization (R-based) | `conda activate bwnorm` |
| `deeptools_env` | Genome-wide heatmaps | `conda activate deeptools_env` |
| `diffbind` | Differential peak analysis | `conda activate diffbind` |

**Critical lab rule**: Never modify existing conda environments without permission. Copy to a new one if modifications are needed.

---

## 2. Pipeline Stages — Full Specification

### Stage 0: Data Import

#### Methods
1. **Local SCP upload**: `scp -r -i ./210323.pem '<local-path>' ubuntu@<ec2>:/data/rs_256/fastq/`
2. **FTP from IGM server**: `lftp -u <user>,<pass> ftp://<igm-server-url>/` then `mget <files>`
3. **Multi-file upload**: List multiple files separated by spaces in the SCP command.

#### Routing by Organism/Assay
| Assay + Organism | FASTQ Directory | Working Directory |
|---|---|---|
| CUT&RUN — Mouse | `/data/rs_256/fastq/` | `/data/rs_256/workdir/` |
| CUT&RUN — Human | `/data/rs_256/human_fastq/` | `/data/rs_256/human_workdir/` |
| ATAC-seq — Mouse | `/data/rs_256/atac_fastq/` | `/data/rs_256/atac_workdir/` |

#### FASTQ Naming Convention
Illumina standard: `{date}_{index}_{condition}_{library}_{mark}_trimmed_{lane}_R{1|2}_001.fastq.gz`

Example: `230301_index_25_ctrl_1_old_PUM1_H3K4me3_trimmed_L001_R1_001.fastq.gz`

**Multi-lane handling**: If sequenced across multiple lanes, concatenate before processing:
```bash
cat yoursamplename_*_R1_*.fastq.gz > yoursamplename_SXX_cat_R1_001.fastq.gz
cat yoursamplename_*_R2_*.fastq.gz > yoursamplename_SXX_cat_R2_001.fastq.gz
```

### Stage 0.5: FastQC

```bash
# Individual file
fastqc -o fastQC_reports inputfile.fastq.gz

# All files at once
fastqc -o fastQC_reports *fastq.gz

# Aggregate into MultiQC report
conda activate base
multiqc fastQC_reports
```

- ~2-3 minutes per FASTQ file
- Output: HTML QC reports per file + combined MultiQC report

### Stage 1: Symlink Creation

Creates working directory links between FASTQ storage and processing directories.

```bash
cd ~/cutruntools

# Mouse (data partition)
./create_scripts.py config2.json

# Mouse (data2 partition)
./create_scripts.py config3.json

# Human
./create_scripts.py config_human.json

# ATAC-seq
./atac_create_scripts.py config_atac.json
```

After running, FASTQ files appear as symlinks in the corresponding `workdir/` directory.

**Implementation note for clone**: This step exists because the lab uses a shared filesystem. In the web app, this maps to the experiment→FASTQ association step (CUTANA Cloud's Reactions sheet linking FASTQ Prefix to metadata).

### Stage 2: Alignment + Trimming (BAM Generation)

**Script**: `integrated.sh` (in workdir)
**Input**: R1 FASTQ filename only (script finds R2 automatically)
**Output**: BAM files in `aligned.aug10/`

```bash
cd /data/rs_256/workdir/  # or human_workdir, atac_workdir
./integrated.sh '<fastq_R1_filename>'
```

#### What `integrated.sh` Does
1. Adapter trimming
2. Alignment to reference genome (Bowtie2)
   - Mouse: mm10
   - Human: hg38 (verify inside script if issues arise)
3. SAM→BAM conversion
4. Sorting
5. Filtering (multi-mappers, etc.)

**Key behavior**: Must run ALL samples before proceeding to next stage. Screen must not sleep during processing (files will appear to process but actually won't).

**Troubleshooting**:
- Check file sizes with `ls -l` after completion — BAMs should be very large
- Check available disk space with `df -h` before running
- For human samples: verify reference genome is set to `hg38` inside the script

### Stage 3: BigWig Generation

#### Method A: Lab Standard Script
```bash
cd /data/rs_256/workdir/aligned.aug10/
conda activate
./create_bams.sh
# Interactive: enter BAM filenames one per line, type "N" when done
```

#### Method B: AP's Simplified Scripts
```bash
conda activate
cd /media/rs_256/ap_tests/

# Mouse
bash ap_generate_bw.sh <R1_fastq_file>

# Human
bash ap_human_generate_bw.sh <R1_fastq_file>
```

**Output**: `.bw` (bigWig) files in `aligned.aug10/`

**Key note from lab (Leya)**: The bigWig files from `create_bams.sh` and `integrated.step2.sh` are identical — they just get placed in different directories. `create_bams.sh` was created by extracting the bigWig portion from `integrated.step2.sh` since the full script produces more files than always needed.

### Stage 4: Export Files

```bash
# Logout first
logout

# Export bigWigs
scp -r -i ./210323.pem ubuntu@<ec2>:/data/rs_256/workdir/aligned.aug10/<sample>.bw .

# Export normalized files
scp -r -i ./210323.pem ubuntu@<ec2>:/media/rs_256/normalization/<sample>.bw .
```

**Implementation note for clone**: This maps to CUTANA Cloud's file download functionality. The clone should offer per-file and batch download from the Files tab.

### Stage 5: Roman Normalization

**Limitation**: Mouse samples only — not available for human.

#### Prerequisite
Move/copy bigWig files to normalization directory:
```bash
mv /data/rs_256/workdir/aligned.aug10/<filename>.bw /media/rs_256/normalization/
```

#### Configuration
```bash
cd /media/rs_256/normalization/master_files/
vim normalization.r
```

Edit the script:
- List sample names under `samples` (without `.bw` extension)
- Change the output CSV name
- When normalizing 4 samples, all are normalized to the **first sample listed** for the same histone modification

#### Execution
```bash
conda activate bwnorm
Rscript normalization.r
conda deactivate
```

**Output**: `.rnorm.bw` files (Roman-normalized bigWigs)

**AP's variant**: `Rscript input_normalization.r` (in same directory)

**Implementation note for clone**: This is analogous to but different from CUTANA Cloud's E. coli spike-in normalization. The lab's Roman normalization is a sample-to-sample normalization, while CUTANA uses spike-in-derived scalar factors. The clone should support both approaches.

### Stage 6: Peak Calling

**Script**: `integrated.step2.sh`
**Input**: Unsorted BAM file
**Limitation**: Mouse only in the original script (human requires modification)

```bash
cd /data/rs_256/workdir/  # or /data2/rs_256/workdir/
./integrated.step2.sh "<bam_filename>"
```

#### What It Produces
Runs peak calling with **three algorithms simultaneously**:
1. **MACS2 Narrow** — `.narrowPeak` files
2. **MACS2 Broad** — `.broadPeak` files
3. **SEACR** — `.stringent.sort.bed` and `.relaxed.sort.bed` files

Output goes to `macs/` subdirectories. Files in `dedup/` folders have PCR duplicates removed (use these). `all.frag` folders contain unfiltered versions.

#### AP's BED File Script (Alternative)
```bash
conda activate
cd /media/rs_256/ap_tests/
bash ap_bed_files.sh <R1_fastq_file>
```

#### Peak Caller Selection Guide (Lab Best Practices)

| Target Type | Recommended Peak Caller | File Extension |
|---|---|---|
| Most CUT&RUNs (general) | SEACR stringent | `*.stringent.sort.bed` |
| H3K4me1 | MACS2 narrow | `*.narrowPeak` |
| ATAC-seq | MACS2 narrow | `*.narrowPeak` |
| Me-CUT&RUN (methylation) | MACS2 broad | `*.broadPeak` |
| Peak summits (for heatmaps) | MACS2 narrow | summit files |

**Lab consensus (Aditya Parmar)**: SEACR stringent is the default for peak calling, but MACS2 narrow is preferred for peak summits (1bp peaks used in heatmaps) as it's more accurate.

**Comparison to CUTANA Cloud**: CUTANA offers MACS2 and SICER2. The lab additionally uses SEACR (and runs all three simultaneously). The clone should support all three: MACS2, SICER2, and SEACR.

### Stage 7: Blacklist Subtraction

```bash
# Copy BED files to input directory
cp <bed_files> /data/rs_256/workdir/blklist_subtract/to_subtract/

# Run subtraction
cd /data/rs_256/workdir/blklist_subtract/
./subtract_blacklist.sh

# Output appears in:
# /data/rs_256/workdir/blklist_subtract/subtracted_bedfiles/
```

Uses ENCODE DAC Exclusion List regions. This is equivalent to CUTANA Cloud's "Remove ENCODE DAC Exclusion List regions" checkbox in alignment Advanced Settings, but applied post-peak-calling in the lab pipeline.

### Stage 8: Genome-wide Heatmaps

**Location**: `/data2/rs_256/genomewide_plots/`
**Scripts**: `ap_refpoint_heatmap2.sh` or `heatmapjai.sh`
**Environment**: `deeptools_env`

```bash
cd /data2/rs_256/genomewide_plots/
conda activate deeptools_env
./heatmapjai.sh
```

**Interactive prompts**:
1. Number of controls and mutants
2. Path to each sample's normalized bigWig file
3. Summit BED files (can be A/B compartment files)
4. Histone modification name (used for titles, not a file)
5. Output directory for heatmap

**Run on a screen** — this is long-running:
```bash
screen -S heatmap
# ... run script ...
# Ctrl+A, D to detach
```

**Implementation note for clone**: CUTANA Cloud generates TSS and Gene Body heatmaps automatically during alignment. The lab's script is more flexible (arbitrary reference points, A/B compartments). The clone should support both preset (TSS/gene body) and custom (user-provided BED) heatmaps.

### Stage 9: Differential Peak Analysis (DiffBind)

**Location**: `/data2/rs_256/workdir/DPA/`
**Environment**: `diffbind`

#### Prerequisites
1. **Sorted BAM files** (`.bam`) with accompanying `.bai` index files on the instance
2. **Blacklist-subtracted BED peak files** on the instance
3. **Sample sheet CSV** with specific format

#### Sample Sheet Format

```csv
SampleID,Factor,Condition,Replicate,bamReads,Peaks,Peakcaller
P51ctrl1,H2AK119ub,ctrl,1,/path/to/sorted.bam,/path/to/blacklist_subtracted.bed,bed
P51ctrl2,H2AK119ub,ctrl,2,/path/to/sorted.bam,/path/to/blacklist_subtracted.bed,bed
P51mut1,H2AK119ub,mut,1,/path/to/sorted.bam,/path/to/blacklist_subtracted.bed,bed
P51mut2,H2AK119ub,mut,2,/path/to/sorted.bam,/path/to/blacklist_subtracted.bed,bed
```

| Column | Description |
|---|---|
| SampleID | Unique name specifying age + genotype |
| Factor | Transcription factor or histone modification |
| Condition | `ctrl` or `mut` |
| Replicate | Number (each ctrl-mut pair gets a different number) |
| bamReads | Full path to sorted BAM file |
| Peaks | Full path to blacklist-subtracted BED file |
| Peakcaller | Always `bed` |

**Critical**: No extra blank rows in the CSV. This confuses DiffBind into thinking there are additional unassigned samples.

#### Execution

```bash
conda activate diffbind
cd /data2/rs_256/workdir/DPA/

# Standard run
Rscript diffbind.R <experiment_name> <samplesheet.csv>

# With consensus peakset (remove Peaks + Peakcaller columns from CSV)
Rscript diffbind_peaklist.R <experiment_name> <samplesheet.csv> <peakset.bed>
```

#### Output
- Results load into a folder named after `<experiment_name>`
- **Known bug (as of 250504)**: Top row of output `.txt` file is missing expected column names. Must manually add header row:
  `seqnames | start | end | width | strand | Conc | Conc_mut | Conc_ctrl | Fold | p.value | FDR`

**Implementation note for clone**: DiffBind is NOT in CUTANA Cloud. This is a major lab-specific extension. The clone needs a DiffBind analysis wizard with sample sheet builder, condition/replicate assignment UI, and results visualization (volcano plots, MA plots, heatmaps).

### Stage 10: Cistrome Analysis (Post-DiffBind)

A downstream analysis using the Cistrome DB Toolkit web service.

#### Workflow
1. Extract `up.bed` and `down.bed` from DiffBind secondary analysis R script
2. Upload to [http://dbtoolkit.cistrome.org/](http://dbtoolkit.cistrome.org/)
3. Run for both TF (Transcription Factor) and HM (Histone Modification) data types
4. Download results CSV
5. Add `Biosource_Group` column using Excel formula (classifies biosources into: Cerebellum, ESC, NPC, Other Brain, Other)
6. Visualize in R with ggplot2 (jitter plot of top 10 factors by GIGGLE score, colored by biosource group)

#### Biosource Classification Categories
| Group | Search Terms |
|---|---|
| Cerebellum | cerebellum, cerebellar |
| ESC | embryonic stem |
| NPC | neural progenitor, neural crest, neuronal progenitor, neural stem, neuronal stem |
| Other Brain | brain, cortex, neuron, hippocampus, olfactory bulb, striatum, midbrain, forebrain, hindbrain, cranial, nucleus accumben, dendritic, ganglionic eminence, astrocyte |
| Other | Everything else |

**Implementation note for clone**: This could be partially automated in the web app — build a Cistrome integration that submits BED files to the API, auto-classifies biosources, and renders the jitter plot. However, the Cistrome DB Toolkit may not have a public API, so this might need to remain a manual/export workflow with visualization support in the app.

### Stage 11: Pearson Correlation Matrices

**Location**: `/media/rs_256/pearson_corr/`

#### Workflow
1. Run `peak_extractor.r`:
   - Edit the "Modify" section at top: list bigWig filenames (without `.bw`) under `samples`
   - Change output CSV name
   - (Optional) For restricted matrix (e.g., within H3K27me3 regions): uncomment lines 82–88, set BED file in `keep` variable
2. Run `pearson.py`:
   - Change CSV filename on line 10
   - Change heatmap output filename on line 20

**Implementation note for clone**: Add as a QC/visualization feature. Given a set of bigWig files (from an experiment's reactions), compute pairwise Pearson correlations and display as a heatmap. Useful for assessing replicate concordance.

---

## 3. Cleanup Protocol

After exporting results, free instance space by removing:

1. Files in `trimmed/` and `trimmed3/` directories
2. `.bai` index files (can be regenerated)
3. Sorted BAM files
4. Old/outdated files
5. FASTQ files (after confirming local copies)
6. BAM files (largest space consumers)

**AP's cleanup scripts**:
```bash
# Remove FASTQ processing artifacts
bash ap_remove_files.sh <full_FASTQ_file>

# Remove BED processing artifacts
bash ap_remove_bed.sh <full_FASTQ_file>
```

**Implementation note for clone**: The web app should have automatic storage management — archive/delete intermediate files after pipeline completion, keep only final outputs. Show storage usage per project/experiment (CUTANA Cloud already does this).

---

## 4. Feature Gap Analysis: Lab Pipeline vs. CUTANA Cloud

### Already Covered by CUTANA Cloud (implement as-is)
| Feature | CUTANA Cloud | Lab Equivalent |
|---|---|---|
| FASTQ upload/import | Drag-drop, BaseSpace, AWS, Server, cross-experiment | SCP, FTP |
| FastQC | Auto-generated per file | Manual `fastqc` command |
| Alignment (Bowtie2) | Automated pipeline | `integrated.sh` |
| Duplicate removal | Picard (optional checkbox) | Built into pipeline |
| DAC Exclusion List filtering | BEDTools (optional checkbox) | `subtract_blacklist.sh` (post-hoc) |
| BigWig generation | deepTools bamCoverage (20bp + 100bp) | `create_bams.sh` / AP scripts |
| TSS/Gene Body heatmaps | deepTools computeMatrix + plotHeatmap | `heatmapjai.sh` |
| Peak calling (MACS2) | MACS2 narrow | `integrated.step2.sh` |
| Peak calling (SICER2) | SICER2 broad | Not in lab pipeline |
| Peak annotation (HOMER) | HOMER 4.11.1 | `annotatePeaks.pl` (retired manual) |
| FRiP calculation | BEDTools + SAMtools | Not explicitly in lab pipeline |
| IGV visualization | IGV.js embedded | External IGV (manual export) |
| E. coli spike-in normalization | Built-in | Not used (Roman norm instead) |
| SNAP-CUTANA spike-in QC | Built-in heatmap | Not used |
| Methods text generation | Auto-generated | Not available |
| Notification system | Email + in-app | Not available |

### Lab Features NOT in CUTANA Cloud (must add to clone)
| Feature | Lab Tool | Priority | Complexity |
|---|---|---|---|
| **SEACR peak calling** | `integrated.step2.sh` | High | Medium — add as third peak caller option |
| **MACS2 broad peaks** | `integrated.step2.sh` | High | Low — MACS2 already present, add broad mode |
| **Roman normalization** | `normalization.r` | Medium | Medium — R script integration, mouse-only |
| **Differential Peak Analysis** | DiffBind R package | High | High — sample sheet builder, statistical analysis, visualization |
| **Genome-wide custom heatmaps** | `heatmapjai.sh` | Medium | Medium — extend existing heatmap with custom BED input |
| **Pearson correlation matrices** | `peak_extractor.r` + `pearson.py` | Medium | Low — pairwise computation + heatmap viz |
| **Cistrome integration** | dbtoolkit.cistrome.org | Low | High — may need scraping or manual workflow |
| **ATAC-seq support** | Separate pipeline branch | Low | High — different adapter trimming, peak calling defaults |
| **Multi-lane FASTQ concatenation** | `cat` command | Medium | Low — detect and auto-merge |
| **Functional annotation (GO)** | HOMER `-go` flag | Medium | Low — add to existing HOMER step |
| **Replicate overlap (intersect)** | `bedtools intersect` | Medium | Low — add as post-peak-calling step |

---

## 5. Software Dependencies (Complete)

### From Lab Pipeline
| Tool | Known Version | Purpose |
|---|---|---|
| Bowtie2 | (in CUTRUNTools) | Alignment |
| SAMtools | (in CUTRUNTools) | BAM processing |
| BEDTools | (in CUTRUNTools) | Interval operations, blacklist subtraction |
| Picard | (in CUTRUNTools) | Duplicate removal |
| deepTools | (in deeptools_env) | bigWigs, heatmaps, computeMatrix |
| MACS2 | (in CUTRUNTools) | Peak calling (narrow + broad) |
| SEACR | (in CUTRUNTools) | Peak calling (stringent + relaxed) |
| HOMER | (in CUTRUNTools) | Peak annotation, GO enrichment |
| FastQC | (system) | QC reports |
| MultiQC | (base conda) | Aggregated QC |
| DiffBind | (diffbind conda) | Differential peak analysis |
| R | (multiple envs) | Normalization, DiffBind, visualization |
| Python | (system) | Pearson correlation, various scripts |

### From CUTANA Cloud (confirmed versions)
| Tool | Version | Purpose |
|---|---|---|
| Bowtie2 | 2.2.9 | Alignment |
| SAMtools | 1.13 | BAM processing |
| BEDTools | 2.30.0 | Interval operations |
| Picard | 2.27.1 | Duplicate removal |
| deepTools | 3.5.1 | bigWigs, heatmaps |
| MACS2 | 2.2.9.1 | Peak calling |
| SICER2 | (unknown) | Broad peak calling |
| HOMER | 4.11.1 | Peak annotation |
| FastQC | 0.12.1 | QC reports |

---

## 6. Reference Genomes

| Organism | Build | Lab Support | CUTANA Support |
|---|---|---|---|
| Mouse | mm10 | Yes (primary) | Yes |
| Human | hg38 | Yes | Yes (also hg19, T2T-CHM13v2.0) |
| Human | hg19 | Not documented | Yes |
| Human | T2T-CHM13v2.0 | Not documented | Yes |
| Drosophila | dm6 | Not documented | Yes |
| Yeast | sacCer3 | Not documented | Yes |
| E. coli | K12 MG1655 | Spike-in only | Spike-in only |

Lab assemblies already available at `~/cutruntools/assemblies/chrom.mm10`.

---

## 7. Config File Reference

The `config*.json` files in `~/cutruntools/` control how `create_scripts.py` sets up working directories. Key fields likely include:

- FASTQ input directory path
- Working directory path
- Reference genome path
- Organism identifier
- Adapter sequences (for trimming)
- Bowtie2 index path

**These files need to be captured** to understand the exact parameter mappings between the lab's manual pipeline and what the web app needs to configure.

---

## 8. Key Experimental Design Patterns

### Standard CUT&RUN Experiment (from test data)
- 1 IgG negative control + N target samples
- Paired-end sequencing (R1 + R2 per sample)
- Typical targets: H3K4me3, H3K27me3, H3K27ac, CTCF, H2AK119ub, PUM1
- Conditions: ctrl vs. mut (with biological replicates: ctrl_1, ctrl_2, mut_1, mut_2)
- Expected 5-10M reads per sample

### DiffBind Experimental Design
- Requires matched ctrl-mut pairs with replicates
- Each replicate number must be unique across the ctrl-mut pair
- Factor (histone mark) must be consistent within an analysis
- Sorted BAMs + blacklist-subtracted BEDs required as input

---

## 9. Implementation Priority Order

Based on the lab's actual workflow frequency and the features already available in CUTANA Cloud:

1. **Core pipeline** (CUTANA Cloud parity): Upload → FastQC → Alignment → BigWig → Peak Calling (MACS2) → HOMER annotation → IGV → File download
2. **SEACR peak calling**: Lab's default peak caller — critical addition
3. **MACS2 broad mode**: Needed for methylation marks
4. **DiffBind integration**: Most requested downstream analysis
5. **Custom heatmaps**: Flexible reference-point heatmaps beyond TSS/gene body
6. **Pearson correlation**: Quick replicate QC
7. **Roman normalization**: Mouse-specific but frequently used
8. **Blacklist subtraction** (post-peak-calling): Already in alignment but lab also applies post-hoc
9. **Cistrome integration**: Nice-to-have for publication figures
10. **ATAC-seq support**: Separate pipeline branch, lower priority
