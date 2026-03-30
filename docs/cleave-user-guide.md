# Cleave User Guide

> Platform documentation, pipeline reference, QC interpretation, and step-by-step tutorials for the Ferguson Lab's CUT&RUN/CUT&Tag analysis platform.

---

## Platform Overview

Cleave is a self-hosted bioinformatics web platform for CUT&RUN and CUT&Tag data analysis, built for the Ferguson Lab at UCSD. It replicates the core functionality of EpiCypher's CUTANA Cloud and extends it with lab-specific features -- FASTQ trimming, SEACR peak calling, MACS2 broad mode, DiffBind differential analysis, custom heatmaps, Pearson correlation, Roman normalization, and one-click auto-pipeline mode.

Cleave runs on a single AWS EC2 instance and is designed for ~8-10 lab members. No command-line tools or bioinformatics expertise is required -- the entire workflow is GUI-driven, from FASTQ upload through publication-ready outputs.

### What Cleave Does

Upload paired-end FASTQ files, run a validated analysis pipeline, and generate publication-ready outputs -- all from a web browser:

1. **Upload** FASTQ files (drag-and-drop, resumable uploads, or FTP/SFTP import)
2. **QC** with automatic FastQC reports
3. **Trim** adapters and quality-filter reads (Trimmomatic + kseq 42bp fixed-length)
4. **Align** reads to a reference genome (Bowtie2 + SAMtools + BEDTools + Picard + deepTools)
5. **Call peaks** using MACS2, SICER2, or SEACR with HOMER annotation
6. **Visualize** in an embedded genome browser (IGV.js) and enrichment heatmaps
7. **Extend** with DiffBind differential analysis, custom heatmaps, Pearson correlation, and Roman normalization
8. **Download** all output files (BAMs, bigWigs, BEDs, QC reports, heatmaps)

Auto-pipeline mode chains steps 2-5 into a single one-click operation.

### Cleave vs. CUTANA Cloud

| Feature | CUTANA Cloud | Cleave |
|---------|:---:|:---:|
| FASTQ upload + FastQC | Yes | Yes |
| FTP/SFTP server import | Yes | Yes |
| Bowtie2 alignment + QC | Yes | Yes |
| MACS2 narrow peaks | Yes | Yes |
| SICER2 broad peaks | Yes | Yes |
| SEACR peak calling | -- | Yes |
| MACS2 broad mode | -- | Yes |
| FASTQ trimming (Trimmomatic + kseq) | -- | Yes |
| Fragment size filter (<120bp) | -- | Yes |
| DiffBind differential analysis | -- | Yes |
| Custom reference-point heatmaps | -- | Yes |
| Pearson correlation matrices | -- | Yes |
| Roman normalization (mouse) | -- | Yes |
| SNAP-CUTANA spike-in QC | Yes | Yes |
| E. coli spike-in normalization | Yes | Yes |
| IGV.js genome browser | Yes | Yes |
| Auto-generated methods text | Yes | Yes |
| Parallel pipeline processing | -- | Yes |
| Dark mode | -- | Yes |
| One-click auto-pipeline | -- | Yes |
| Self-hosted (no per-credit cost) | -- | Yes |

---

## Data Hierarchy

```
Project (shared workspace with access controls)
└── Experiment (analysis hub for a set of reactions)
    ├── FASTQ Files (paired-end sequencing data)
    ├── Reactions (sample metadata linked to FASTQs)
    ├── Trimming Run(s) (adapter + quality trimming)
    ├── Alignment Run(s) (maps reads to reference genome)
    │   ├── QC Report (alignment stats, spike-in, heatmaps)
    │   ├── Unique BAMs, bigWigs, heatmaps
    │   └── IGV visualization
    ├── Peak Calling Run(s) (identifies enriched regions)
    │   ├── QC Report (FRiP, annotation plots)
    │   ├── BED files, annotation files
    │   └── IGV visualization
    └── Lab Extensions
        ├── DiffBind (differential peak analysis)
        ├── Custom Heatmaps (reference-point heatmaps)
        ├── Pearson Correlation (replicate concordance)
        └── Roman Normalization (mouse bigWig normalization)
```

---

## Projects

A Project is a shared workspace where authorized lab members manage data analysis across one or more Experiments.

### Creating a Project

1. Click **New Project** from the dashboard.
2. Enter a project **name** and optional **description**.
3. The project creator is automatically assigned the **Admin** role.

### Member Roles

| Role | Capabilities |
|------|-------------|
| **Admin** | Full project control: manage members, edit/delete project, create experiments, run analyses, download files. |
| **Contributor** | Create experiments, upload FASTQs, run analyses, download files. Cannot manage members or delete the project. |
| **Viewer** | Read-only access to all project data and files. Cannot upload, run analyses, or modify anything. |

### Managing Members

1. Navigate to your project's detail page.
2. Click **Manage Members**.
3. Invite users by email address and assign a role (default: Contributor).
4. Admins can change roles or remove members at any time.

---

## Experiments

An Experiment is the central hub within a Project for conducting a CUT&RUN or CUT&Tag analysis. Each experiment contains its own FASTQ files, reaction metadata, and analysis results.

### Creating an Experiment

A 3-step wizard guides you through experiment creation:

1. **Details**: Provide the experiment name (up to 100 characters), select assay type (**CUT&RUN** or **CUT&Tag**), and add an optional description.
2. **FASTQs**: Upload or import your sequencing files (see FASTQ Upload section).
3. **Reactions**: Define sample metadata linking FASTQs to biological conditions (see Reactions section).

### Experiment Status

Each experiment tracks its own status:

| Status | Meaning |
|--------|---------|
| **New** | Created but no analyses run yet. |
| **In Progress** | One or more analyses are currently running. |
| **Complete** | All analyses finished successfully. |
| **Error** | One or more analyses encountered an error. |
| **Terminated** | User cancelled an analysis in progress. |

### Experiment Tabs

Once created, an experiment has the following tabs:

- **Description** -- Experiment details and metadata
- **FASTQs** -- Uploaded sequencing files with FastQC reports
- **Reactions** -- Sample metadata sheet
- **Alignment** -- Alignment runs with QC reports, files, and IGV browser
- **Peak Calling** -- Peak calling runs with QC reports, annotation plots, and IGV
- **DiffBind** -- Differential peak analysis results
- **Custom Heatmaps** -- Reference-point heatmap results
- **Pearson Correlation** -- Correlation matrix results
- **Normalization** -- Roman normalization results
- **History** -- Audit log of all actions taken on this experiment
- **All Files** -- Hierarchical file browser with batch download

---

## FASTQ Files

### Sequencing Requirements

- **Paired-end sequencing only** -- Cleave requires paired-end data (R1 and R2 files per sample).
- **Recommended**: 2x50 bp sequencing for CUT&RUN libraries.
- Longer sequencing runs (e.g., 2x150 bp) will contain adapter sequences -- use Cleave's built-in trimming step to handle this automatically.
- Supported formats: `.fastq.gz` (gzipped FASTQ).

### File Naming

- R1 and R2 files must share the **same filename** except for the R1/R2 designation.
- Files should preserve the standard Illumina suffix: `..._L001_R1_001.fastq.gz` / `..._L001_R2_001.fastq.gz`.
- The **FASTQ Prefix** is the shared portion of the filename between R1 and R2, and is used to link files to reactions.
- Example: For files `230301_ctrl_H3K4me3_S1_L001_R1_001.fastq.gz` and `230301_ctrl_H3K4me3_S1_L001_R2_001.fastq.gz`, the prefix is `230301_ctrl_H3K4me3_S1_L001`.

### Upload Methods

#### 1. Local Upload (Browser)

- **During experiment creation**: Use the drag-and-drop area or Browse button in Step 2.
- **After creation**: Navigate to the FASTQs tab and click **+ Add FASTQs**.
- Uploads use the **tus protocol** (chunked and resumable) -- if your connection drops during a multi-GB upload, it will resume from where it left off.

#### 2. FTP/SFTP Server Import

For files on a remote server (e.g., IGM sequencing facility):

1. Navigate to the FASTQs tab and click **Import from Server**.
2. Enter the server hostname, port, username, and password.
3. Optionally save the server credentials for future use.
4. Browse the remote directory tree and select the FASTQ files to import.
5. Click **Import** -- files transfer in the background with progress tracking.

**Security**: Cleave blocks connections to private IP ranges, localhost, and AWS metadata endpoints to prevent SSRF attacks. Saved server passwords are encrypted at rest with Fernet (AES-128-CBC).

### FastQC Reports

FastQC reports are **automatically generated** for each uploaded FASTQ file. Access them via the icon link next to each file in the FASTQs table. Reports include:

- Per-base sequence quality
- Per-sequence quality scores
- Per-base sequence content
- GC content distribution
- Sequence duplication levels
- Adapter content (key indicator for whether trimming is needed)
- Overrepresented sequences

---

## Reactions (Sample Metadata)

A **Reaction** represents a single CUT&RUN or CUT&Tag sample, identified by its **FASTQ Prefix**.

### Required Fields

| Field | Description |
|-------|-------------|
| **FASTQ Prefix** | The shared portion of the R1/R2 filenames. Auto-detected from uploaded FASTQs. |
| **Short Name** | A unique label for figures and outputs. Must be unique per organism within the experiment. |
| **Organism** | Reference genome organism: Mouse (mm10), Human (hg38/hg19), Drosophila (dm6), or Yeast (sacCer3). |
| **Assay Type** | CUT&RUN or CUT&Tag. |
| **CUTANA Spike-in** | The SNAP-CUTANA spike-in panel used, or "None". Do not leave blank. |
| **CUTANA Spike-in Target** | The on-target spike-in for this reaction (e.g., "H3K4me3", "Unmodified" for IgG). |
| **E. coli Spike-in** | Whether the reaction contains CUTANA E. coli Spike-in DNA (Yes/No). If Yes, reads are also aligned to the E. coli K12 MG1655 genome. |

### Optional Fields

Available via column customization: Cell Type, Cell Number, Sample Prep, Experimental Condition, Antibody Vendor, Antibody Cat No, Antibody Lot No, CUTANA Spike-in 2, CUTANA Spike-in Target 2.

### Creating Reactions

Three methods:

1. **Manual entry**: Click **+ Add Reaction** and fill in the fields.
2. **CSV import**: Download the CSV template, fill it in, and upload. All-or-nothing validation -- if any row has errors, none are imported.
3. **Bulk create**: Use the JSON bulk creation endpoint for programmatic access.

### Auto-Detected Prefixes

Cleave automatically detects FASTQ prefixes from uploaded files and presents them in a dropdown when creating reactions. This eliminates manual prefix entry errors.

---

## Supported Reference Genomes

| Organism | Build | Alignment | Peak Calling | Heatmaps | Roman Normalization |
|----------|-------|:---------:|:------------:|:--------:|:-------------------:|
| Mouse | mm10 | Yes | Yes | Yes | Yes |
| Human | hg38 | Yes | Yes | Yes | No |
| Human | hg19 | Yes | Yes | Yes | No |
| Drosophila | dm6 | Yes | Yes | Yes | No |
| Yeast | sacCer3 | Yes | Yes | No | No |
| E. coli | K12 MG1655 | Spike-in only | -- | -- | -- |

---

## Pipeline Stages

### Stage 1: Trimming

Cleave includes a built-in two-stage trimming pipeline -- a key advantage over CUTANA Cloud, which requires pre-trimmed FASTQs.

#### What Trimming Does

1. **Trimmomatic** (adapter + quality trimming): Removes Illumina adapter sequences and low-quality bases from read ends.
2. **kseq_test** (fixed-length trimming): Trims all reads to exactly 42bp -- the optimal length for CUT&RUN/CUT&Tag alignment.

#### When to Trim

- **Always recommended** if your reads are longer than 50bp (e.g., 2x150 bp from core facilities).
- Check FastQC reports for adapter contamination -- if the "Adapter Content" module shows warn or fail status, trimming is strongly recommended.
- Trimming is built into the auto-pipeline and runs automatically.

#### Trimming Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| Adapter file | TruSeq3.PE.fa | Illumina TruSeq paired-end adapters |
| ILLUMINACLIP | 2:15:4:4:true | Seed mismatches:palindrome threshold:simple threshold:min adapter length:keep both reads |
| LEADING | 20 | Remove leading bases below quality 20 |
| TRAILING | 20 | Remove trailing bases below quality 20 |
| SLIDINGWINDOW | 4:15 | Cut when average quality in 4-base window drops below 15 |
| MINLEN | 25 | Discard reads shorter than 25bp |
| kseq length | 42 | Fixed-length trim to 42bp |

#### Trimming Outputs

- Trimmed FASTQ files (paired R1/R2)
- New FastQC reports generated automatically for trimmed files
- Pipeline log

Trimmed FASTQs are registered in the system and become available for alignment.

---

### Stage 2: Alignment

Alignment maps paired-end reads to a reference genome, revealing where sequences are enriched across the genome.

#### Launching Alignment

Via the **New Alignment Wizard** (3 steps):

1. **Details**: Name the alignment run and add optional notes.
2. **Choose Reactions**: Select which reactions to align.
3. **Alignment Settings**: Configure reference genome and advanced options.

#### The Alignment Pipeline (13 Steps)

For each selected reaction, Cleave runs:

1. **Bowtie2** alignment to the reference genome (paired-end, dovetail mode, MAPQ filtering)
2. **SAMtools** SAM-to-BAM conversion
3. **SAMtools** proper-pair filtering (keep only properly paired reads, MAPQ >= 10)
4. **BEDTools** ENCODE DAC Exclusion List removal (optional, default ON)
5. **Picard** coordinate sorting
6. **Picard** duplicate marking
7. **SAMtools** duplicate removal (optional, default ON)
8. **SAMtools** BAM indexing
9. **deepTools bamCoverage** unsmoothed bigWig (20bp bins, RPKM-normalized)
10. **deepTools bamCoverage** smoothed bigWig (100bp bins, RPKM-normalized)
11. **deepTools computeMatrix + plotHeatmap** TSS enrichment heatmap
12. **deepTools computeMatrix + plotHeatmap** gene body enrichment heatmap
13. **E. coli spike-in alignment** + K-MetStat barcode counting (if spike-in enabled)

Reactions are processed **in parallel** using a thread pool for maximum throughput.

#### Configurable Alignment Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Remove Duplicate Reads | On | Filters PCR/optical duplicates via Picard MarkDuplicates. |
| Remove ENCODE DAC Exclusion List Regions | On | Filters reads in known false-positive regions via BEDTools. |
| Unsmoothed bigWig Bin Size | 20 bp | Bin size for heatmap-quality bigWigs. |
| Smoothed bigWig Bin Size | 100 bp | Bin size for IGV visualization bigWigs. |

#### Alignment Outputs

| Output | Description |
|--------|-------------|
| **Methods Text** | Auto-generated text with exact software versions and parameters -- copy-paste into manuscripts. |
| **QC Report** | Alignment statistics, spike-in results, heatmap thumbnails. Downloadable as CSV. |
| **Unique BAM Files** | Final high-quality BAMs after all filtering. Primary input for peak calling. |
| **BAI Index Files** | BAM index files for genome browser loading. |
| **Unsmoothed bigWig Files** | RPKM-normalized, 20bp bins. Used for heatmaps and quantitative analysis. |
| **Smoothed bigWig Files** | RPKM-normalized, 100bp bins. Used for IGV visualization. |
| **TSS Heatmaps** | Enrichment around transcription start sites (PNG). |
| **Gene Body Heatmaps** | Enrichment across gene bodies (PNG). |
| **FastQC Reports** | Regenerated per-reaction quality reports. |
| **Pipeline Logs** | Detailed execution logs for troubleshooting. |

---

### Stage 3: Peak Calling

Peak calling identifies genomic regions where target signal is significantly enriched above background. This is the step that converts raw enrichment signal into discrete, biologically interpretable peaks.

#### Launching Peak Calling

Via the **New Peak Calling Wizard** (4 steps):

1. **Details**: Name the peak calling run and add optional notes.
2. **Choose Alignment**: Select a completed alignment run as input.
3. **Choose Reactions**: Select which reactions to call peaks for.
4. **Peak Calling Settings**: Choose peak caller, IgG control, and advanced options.

#### Available Peak Callers

| Peak Caller | Mode | Best For | Default Threshold | Description |
|-------------|------|----------|-------------------|-------------|
| **MACS2** | Narrow | Sharp marks (H3K4me3, CTCF, H3K4me1) | q-value 0.01 | Model-based peak calling for punctate enrichment. |
| **MACS2** | Broad | Diffuse marks (methylation CUT&RUNs) | broad-cutoff 0.1 | Extended peak regions for broad enrichment. |
| **SICER2** | Broad | Diffuse marks (H3K27me3) | FDR 0.01 | Island-based peak calling for broad domains. |
| **SEACR** | Stringent | Most CUT&RUNs (lab default) | Top 1% AUC (0.01) | Signal extraction from sparse data, stringent mode. |
| **SEACR** | Relaxed | Broad exploration | Top 1% AUC (0.01) | SEACR with relaxed thresholds for broader discovery. |

**Lab recommendations:**

| Target Type | Recommended Peak Caller |
|-------------|------------------------|
| Most CUT&RUNs (general) | SEACR stringent |
| H3K4me1 | MACS2 narrow |
| ATAC-seq | MACS2 narrow |
| Methylation CUT&RUN | MACS2 broad |
| Peak summits (for heatmaps) | MACS2 narrow |

#### Fragment Size Filter

Cleave includes a **fragment size filter** (default ON) that keeps only fragments smaller than 120bp before peak calling. Sub-nucleosomal fragments are the biologically relevant CUT&RUN signal -- larger fragments are typically background noise.

This filter can be disabled in Advanced Settings if needed.

#### IgG Control

Selecting the correct IgG negative control is critical for peak calling quality:

- Each target reaction should be paired with an IgG control from the **same experimental condition**.
- Wild-type IgG for wild-type target reactions; drug-treated IgG for treated target reactions.
- SEACR can also run in **numeric threshold mode** (default 0.01, top 1% AUC) without an IgG control.

#### SEACR Preprocessing

SEACR peak calling in Cleave involves a preprocessing chain:
1. MACS2 generates a bedgraph from the BAM file.
2. `change.bdg.py` converts float values to integers (SEACR requirement).
3. SEACR v1.1 runs on the integer bedgraph.

This chain is handled automatically -- you just select "SEACR" as the peak caller.

#### Peak Calling Outputs

| Output | Description |
|--------|-------------|
| **Methods Text** | Auto-generated with exact tool versions and parameters. |
| **QC Report** | Peak statistics, FRiP scores, annotation plots. Downloadable as CSV. |
| **BED Files** | Genomic coordinates of called peaks (blacklist-subtracted). |
| **FRiP Score Files** | Fraction of Reads in Peaks metrics per reaction. |
| **HOMER Annotation Files** | Each peak annotated with nearest genomic feature. |
| **Annotation Statistics** | Summary of peak distribution across genomic features. |
| **Top Called Peaks** | Ranked list of most significant peaks. Downloadable as CSV. |
| **Pipeline Logs** | Detailed execution logs. |

---

### Stage 4: Visualization (IGV.js)

Cleave includes an embedded IGV.js genome browser accessible from both Alignment and Peak Calling tabs.

#### Using the Genome Browser

1. Navigate to an Alignment or Peak Calling run.
2. Click the **IGV** sub-tab.
3. Select the reference genome and reactions to display.
4. Tracks load automatically -- bigWig signal tracks for alignment, BED peak tracks for peak calling.

#### Features

- **Multi-track display**: Compare multiple samples side-by-side.
- **Chromosome navigation**: Jump to any genomic locus by chromosome or coordinates.
- **Zoom controls**: Zoom in to base-pair resolution or out to chromosome-wide view.
- **Full-screen mode**: Expand the browser to fill the screen.
- **Per-track settings**: Customize display range, color, and scale for each track.
- **Image export**: Save the current view as a PNG image.
- **Track labels**: Format `{AlignmentName}-{ShortName}` for easy identification.
- **Byte-range serving**: BigWig and BAM files are served with HTTP Range headers, so only the visible region is loaded (no need to download entire files).

---

## Lab Extension Features

These features extend beyond CUTANA Cloud's capabilities and are specific to the Ferguson Lab's workflow.

### DiffBind (Differential Peak Analysis)

DiffBind identifies genomic regions with statistically significant differences in binding/enrichment between experimental conditions (e.g., wild-type vs. mutant).

#### Requirements

- At least 2 conditions (e.g., "ctrl" and "mut") with biological replicates.
- Completed alignment with sorted BAM files.
- Completed peak calling with BED files.

#### Launching DiffBind

Via the **DiffBind Wizard** (5 steps):

1. **Details**: Name the analysis.
2. **Choose Alignment**: Select the alignment run.
3. **Choose Peak Calling**: Select the peak calling run.
4. **Sample Sheet**: Assign conditions (ctrl/mut), replicates, and factors to each reaction. Cleave builds the sample sheet automatically from your selections.
5. **Settings**: Choose analysis mode and parameters.

#### Analysis Modes

| Mode | Description |
|------|-------------|
| **DESeq2 (consensus)** | Uses consensus peakset derived from all samples. Standard approach. |
| **DESeq2 (custom peakset)** | Uses a user-supplied BED file as the peakset. |
| **edgeR (custom peakset)** | Uses edgeR with TMM normalization and a user-supplied peakset. |

#### DiffBind Outputs

- **Results table**: Genomic coordinates, fold change, p-value, FDR for each differentially bound region.
- **Volcano plot**: Log2 fold change vs. -log10(p-value) visualization.
- **MA plot**: Log2 fold change vs. mean concentration.
- **PCA plot**: Principal component analysis of sample binding profiles.
- **Correlation heatmap**: Sample-to-sample correlation based on binding affinity.
- **Normalized counts**: Per-region read counts normalized across samples.
- All plots downloadable as PNG. Results downloadable as TSV.

---

### Custom Heatmaps

Generate reference-point heatmaps using your own BED files -- go beyond the standard TSS/gene body heatmaps from alignment.

#### Use Cases

- Heatmaps centered on peaks from a specific reaction.
- Enrichment around A/B compartment boundaries.
- Signal at any set of user-defined genomic regions.

#### Launching Custom Heatmaps

1. Upload a BED file to the experiment (via the Files tab).
2. Launch the **Custom Heatmap Wizard**.
3. Select the alignment run (for bigWig files), reactions, and your BED file.
4. Configure: reference point (center, TSS, or TES), upstream/downstream window sizes.

#### Outputs

- Reference-point heatmap (PNG)
- Mean signal profile plot (PNG)
- computeMatrix output (downloadable .gz for further analysis)

---

### Pearson Correlation

Compute pairwise Pearson correlation coefficients across all selected reactions -- useful for assessing replicate concordance and identifying outliers.

#### How It Works

1. BigWig files are converted to a coverage matrix at 50bp resolution across all standard chromosomes.
2. Pairwise Pearson correlations are computed.
3. Results are displayed as a clustered heatmap.

#### Supported Genomes

- **mm10**: chr1-19 + chrX (with mm10 mask for problematic regions)
- **hg38/hg19**: chr1-22 + chrX
- **dm6**: chr2L, 2R, 3L, 3R, 4, X

#### Outputs

- Correlation heatmap (PNG)
- Correlation matrix (CSV)
- Coverage matrix (CSV)

---

### Roman Normalization

Sample-to-sample bigWig normalization using 99th-percentile quantile normalization. **Mouse (mm10) only.**

#### How It Works

1. All selected bigWig files are loaded at base-pair resolution.
2. Masked regions (158 problematic mm10 regions from `manual.mask.ultimate.bed`) are excluded.
3. The 99th percentile of coverage is computed for each sample.
4. All samples are normalized to the first sample listed (normalization factor = 1.0).
5. Normalized bigWig files are generated.

#### When to Use

- When comparing signal intensity across samples that may have different sequencing depths or enrichment efficiencies.
- Complements E. coli spike-in normalization (which uses an external standard rather than sample-to-sample comparison).

#### Outputs

- Normalized bigWig files (`.rnorm.bw`)
- Normalization factors CSV
- Pipeline log

---

## Auto-Pipeline Mode

Auto-pipeline chains multiple pipeline stages into a single one-click operation, eliminating the need to manually launch each step.

### Default Chain

**FastQC -> Trim -> Align -> Peak Call**

Each step automatically feeds its outputs into the next. If any step fails, the pipeline pauses and you can retry the failed step or cancel.

### How to Use

1. Navigate to an experiment with uploaded FASTQs and defined reactions.
2. Click **Auto-Pipeline** in the experiment toolbar.
3. Configure settings for each stage (or accept defaults).
4. Click **Start** -- the pipeline runs end-to-end.
5. Monitor progress via the real-time status indicators and notification bell.

### Auto-Pipeline Status

| Status | Meaning |
|--------|---------|
| **Pending FastQC** | Waiting for FastQC to complete on uploaded files. |
| **Running** | Pipeline is actively processing a stage. |
| **Complete** | All stages finished successfully. |
| **Error** | A stage failed -- review the error and retry or cancel. |
| **Cancelled** | User cancelled the pipeline. |

---

## QC Reports -- Interpretation Guide

### Alignment QC Metrics

| Metric | Suggested Range | Notes |
|--------|----------------|-------|
| **Total Reads** | 5-10M per sample (up to ~15M acceptable) | Expect loss of 1-2M reads post-alignment due to duplicates, blacklisted reads, and multi-aligned reads. |
| **Unique Alignment Rate** | 70-95% for specific targets | IgG negative control is **not expected to align well** -- low alignment rate (~29%) is normal for IgG. |
| **Duplication Rate** | <30% | High rates may indicate: low template diversity, over-amplification during PCR, over-sequencing, or >5% adapter dimer contamination. |
| **E. coli Alignment Rate** | <5% | High rates may indicate: incorrect spike-in reconstitution, low template diversity, or over-sequencing. Goal: ~1% (0.2-5%). |
| **Mitochondrial Read %** | Low | Elevated mitochondrial reads indicate sample quality issues. |

#### Causes of Poor Alignment Quality

- Poor assay yields / low unique templates
- High PCR duplicates
- Over-sequencing
- Incorrect E. coli spike-in reconstitution (too much added to stop buffer/samples)
- Untrimmed adapter sequences in reads longer than 50bp (use Cleave's trimming stage)

### SNAP-CUTANA K-MetStat Spike-in QC

Found on the Alignment QC Report. Displays a heatmap showing the percentage of barcode reads from the 16-member panel:

- **IgG antibody control**: Should show **<20% recovery** across each panel member (indicating no specificity -- expected behavior).
- **H3K4me3 antibody**: Should show **~100% specificity** for the H3K4me3 barcoded nucleosome and **<20% for all others**.
- **H3K27me3 antibody**: Should show **~100% specificity** for H3K27me3 and **<20% for all others**.
- **Deviations >20% for off-target** members suggest: poor-quality antibody, excessive spike-in amount, or assay issues.

### TSS and Gene Body Heatmaps

Generated for each reaction during alignment. Show enrichment patterns at known transcription sites:

- **H3K4me3** (active mark): Expect a **sharp, punctate peak** centered on the TSS and at the start of gene bodies.
- **H3K27me3** (repressive mark): Expect **broad enrichment** across gene bodies.
- **IgG control**: Should show **no enrichment pattern** (uniform low signal).

### Peak Calling QC Metrics

#### FRiP (Fraction of Reads in Peaks)

The key peak calling quality metric:
- Represents the proportion of uniquely aligned reads that fall within called peaks.
- **High-quality FRiP: >0.2** (indicates robust enrichment at peak regions).
- FRiP is calculated using BEDTools (reads in peaks) / SAMtools (total reads).
- Peaks are called using the IgG negative control as background.

#### Top Called Peaks

A ranked list of the most significant peaks with genomic coordinates (chromosome, start, end). Downloadable as CSV. Cross-reference these in the IGV browser.

#### Peak Annotation Plots

Each peak is categorized by its genomic location using HOMER annotation:

| Category | Description |
|----------|-------------|
| Promoter | Near transcription start sites |
| Exon | Within coding regions |
| Intron | Within non-coding gene regions |
| Intergenic | Between genes |
| 3' UTR | 3' untranslated region |
| 5' UTR | 5' untranslated region |
| TTS | Transcription termination site |
| ncRNA | Non-coding RNA |

The distribution of peaks across categories reveals biological relevance:
- **Active marks (H3K4me3)**: Expect enrichment at promoters and TSS.
- **Repressive marks (H3K27me3)**: Expect broader distribution including intergenic regions.
- **CTCF**: Expect enrichment at intergenic and intronic insulator elements.

#### Interpreting Peak Calling Results

- Peak calling quality depends on the quality of the input Unique BAM file.
- **More peaks does not mean better peak calling.** Trustworthiness is multifactorial:
  1. Quality of the input BAM (alignment QC metrics).
  2. Visual comparison of peak locations in IGV.
  3. Strength of FRiP scoring -- higher FRiP = more trustworthy data.
- Use IGV to verify that called peaks align with expected biology (e.g., transcription-related marks at promoters).

---

## Notifications & Real-Time Updates

Cleave pushes real-time updates to your browser via Server-Sent Events (SSE):

- **Job completion**: Notified when any analysis finishes (success or error).
- **Job status changes**: See pipeline progress without refreshing the page.
- **Auto-pipeline updates**: Track each stage of auto-pipeline execution.
- **Server import progress**: Monitor FTP/SFTP file transfers.

Access notifications via the **bell icon** in the navigation bar. All notifications are also available in the notification panel with mark-as-read functionality.

---

## File Management & Downloads

### File Browser

The **All Files** tab in each experiment provides a hierarchical tree view of all generated files, organized by analysis run. Browse, preview, and download individual files or select multiple for batch download.

### Download Methods

| Method | Description |
|--------|-------------|
| **Single file** | Click any file in the browser or files panel to download. |
| **Batch download** | Select multiple files via checkboxes, click **Download** to get a streaming ZIP. |
| **Signed URLs** | Download links use time-limited HMAC-signed tokens (5-minute expiry) -- no need to re-authenticate for each file. |

### Output File Types

| Extension | Type | Description |
|-----------|------|-------------|
| `.bam` | Binary | Aligned sequencing reads (various processing stages). |
| `.bai` | Binary | BAM index files (required for genome browser). |
| `.bw` | Binary | bigWig signal tracks (RPKM-normalized). |
| `.bed` | Text | Peak coordinates or genomic regions. |
| `.narrowPeak` | Text | MACS2 narrow peak calls with statistical values. |
| `.broadPeak` | Text | MACS2 broad peak calls with statistical values. |
| `.csv` | Text | QC metrics, annotation stats, correlation matrices. |
| `.tsv` | Text | DiffBind results with fold change and p-values. |
| `.png` | Image | Heatmaps, plots, annotation charts. |
| `.svg` | Image | Vector graphics for DiffBind plots. |
| `.html` | Web | FastQC quality reports. |
| `.log` | Text | Pipeline execution logs. |

---

## Methods Text

Every analysis run generates an auto-generated **methods text** that includes:

- Exact software tool names and versions
- All parameters used
- Processing steps in order
- Reference genome and annotation sources

This text is designed for **direct copy-paste into manuscript Methods sections**, ensuring reproducibility and accurate reporting. Find it in the **Info** sub-tab of any analysis run.

---

## Software Versions

| Tool | Purpose |
|------|---------|
| **Bowtie2** | Read alignment to reference genome |
| **SAMtools** | BAM processing, filtering, indexing, read counting |
| **BEDTools** | Interval operations, blacklist subtraction, FRiP calculation |
| **Picard** | Duplicate marking and removal, coordinate sorting |
| **deepTools** | bigWig generation (bamCoverage), heatmaps (computeMatrix, plotHeatmap) |
| **MACS2** | Peak calling (narrow + broad modes) |
| **SICER2** | Broad peak calling |
| **SEACR** v1.1 | CUT&RUN-optimized peak calling |
| **HOMER** | Peak annotation (annotatePeaks.pl) |
| **Trimmomatic** | Adapter and quality trimming |
| **kseq_test** | Fixed-length read trimming (42bp) |
| **FastQC** | Per-FASTQ quality assessment |
| **DiffBind** (R) | Differential binding analysis (DESeq2/edgeR) |
| **rtracklayer** (R) | bigWig reading for Pearson correlation and normalization |
| **seaborn** (Python) | Correlation heatmap generation |

---

## Key Terminology

| Term | Definition |
|------|------------|
| **Reaction** | A single CUT&RUN or CUT&Tag sample, identified by its FASTQ Prefix. |
| **FASTQ Prefix** | The shared portion of R1/R2 filenames that uniquely identifies a reaction. |
| **Unique BAM** | Final filtered BAM -- uniquely aligned reads after duplicate, multi-map, and exclusion list removal. |
| **bigWig** | Compact format for continuous genomic data, RPKM-normalized. Smoothed (100bp) for IGV, unsmoothed (20bp) for heatmaps. |
| **BED file** | Tab-delimited file defining genomic regions (chromosome, start, end). Used for peak coordinates. |
| **FRiP** | Fraction of Reads in Peaks -- ratio of reads in significant peaks to total reads. >0.2 is high quality. |
| **MACS2** | Peak caller for narrow/sharp enrichment (q-value 0.01 default) and broad mode (cutoff 0.1). |
| **SICER2** | Peak caller for broad/diffuse enrichment (FDR 0.01). |
| **SEACR** | Sparse Enrichment Analysis for CUT&RUN. Lab default for most CUT&RUNs. Stringent or relaxed mode. |
| **ENCODE DAC Exclusion List** | Curated genomic regions known to produce false-positive signal. Filtered during alignment. |
| **SNAP-CUTANA K-MetStat Panel** | 16 DNA-barcoded designer nucleosomes for antibody specificity QC. |
| **E. coli Spike-in** | Carry-over E. coli DNA for normalization; aligned separately to E. coli K12 MG1655 genome. |
| **Roman Normalization** | 99th-percentile quantile normalization of bigWig files. Mouse (mm10) only. |
| **DiffBind** | R/Bioconductor package for differential binding analysis between conditions. |
| **TSS** | Transcription Start Site -- used for enrichment heatmaps. |
| **TES** | Transcription End Site. |
| **RPKM** | Reads Per Kilobase per Million mapped reads -- normalization for bigWig files. |
| **IgG Control** | Negative control antibody used as background for peak calling; should show no specific enrichment. |
| **SAM/BAM** | Sequence Alignment/Map files; BAM is the compressed binary version. |
| **Fragment Size Filter** | Keeps only sub-nucleosomal fragments (<120bp) before peak calling. Default ON. |
| **tus** | Resumable upload protocol for reliable multi-GB file transfers. |
| **SSE** | Server-Sent Events -- real-time push notifications from server to browser. |

---

## Step-by-Step Tutorials

### Tutorial 1: Basic CUT&RUN Analysis (Upload through Peak Calling)

This walkthrough covers a typical CUT&RUN experiment with H3K4me3 target samples and an IgG control.

#### Step 1: Create a Project

1. Log in to Cleave at your lab's URL.
2. On the dashboard, click **New Project**.
3. Enter a name (e.g., "P51 H3K4me3 CUT&RUN") and optional description.
4. Click **Create**. You are now the project Admin.

#### Step 2: Invite Collaborators (Optional)

1. On the project detail page, click **Manage Members**.
2. Enter a lab member's email address.
3. Select their role (Contributor for most lab members).
4. Click **Invite**.

#### Step 3: Create an Experiment

1. From the project page, click **New Experiment**.
2. **Step 1 -- Details**: Enter a name (e.g., "ctrl vs. mut H3K4me3"), select "CUT&RUN" as assay type.
3. **Step 2 -- FASTQs**: Drag and drop your `.fastq.gz` files (both R1 and R2 for each sample). The upload bar shows progress. If your connection drops, uploads resume automatically.
4. **Step 3 -- Reactions**: Click **+ Add Reaction** for each sample:
   - Select the auto-detected FASTQ Prefix from the dropdown.
   - Enter a Short Name (e.g., "ctrl_H3K4me3_rep1").
   - Select Organism (e.g., "Mouse - mm10").
   - Set CUTANA Spike-in to "KMetStat" and target to "H3K4me3" (or "None" if not used).
   - Set E. coli Spike-in to "Yes" if applicable.
   - For IgG control reactions, set the spike-in target to "Unmodified".
5. Click **Create Experiment**.

#### Step 4: Review FastQC Reports

1. Navigate to the **FASTQs** tab.
2. Click the FastQC icon next to any file to view its quality report.
3. Check the **Adapter Content** module:
   - **Pass** (green): Adapters are minimal. You may skip trimming.
   - **Warn/Fail** (yellow/red): Adapter contamination detected. Trimming recommended.

#### Step 5: Trim FASTQs (If Needed)

1. Navigate to the experiment toolbar and click **New Trimming** (or use auto-pipeline).
2. Select the reactions to trim.
3. Accept default trimming parameters (TruSeq3 adapters, quality filtering, 42bp kseq).
4. Click **Submit**. Monitor progress via the notification bell.
5. When complete, trimmed FASTQs appear in the FASTQs tab with a "trimmed" label.

#### Step 6: Run Alignment

1. Click **New Alignment** in the experiment toolbar.
2. **Step 1**: Name the run (e.g., "alignment-v1").
3. **Step 2**: Select the reactions to align. If you trimmed, select the trimmed versions.
4. **Step 3**: Verify reference genome (mm10 for mouse). Review Advanced Settings:
   - Remove Duplicate Reads: ON (recommended).
   - Remove ENCODE DAC Exclusion List: ON (recommended).
   - Bin sizes: 20bp (unsmoothed), 100bp (smoothed) -- defaults are fine.
5. Click **Submit**. Alignment typically takes 30-90 minutes depending on read count.

#### Step 7: Review Alignment QC

1. When the alignment completes, navigate to the alignment run.
2. Open the **QC Report** sub-tab.
3. Check key metrics:
   - **Unique Alignment Rate**: >70% for targets, ~29% for IgG (expected).
   - **Duplication Rate**: <30%.
   - **E. coli Rate**: <5%.
4. Review **TSS Heatmaps**: H3K4me3 should show sharp enrichment at TSS; IgG should be flat.
5. Review **SNAP-CUTANA Spike-in**: On-target should be ~100%, off-target <20%.

#### Step 8: Call Peaks

1. Click **New Peak Calling** in the experiment toolbar.
2. **Step 1**: Name the run.
3. **Step 2**: Select the alignment run from Step 6.
4. **Step 3**: Select target reactions (not IgG -- it's used as control).
5. **Step 4**:
   - For H3K4me3: Select **MACS2 narrow** (q-value 0.01).
   - Alternatively, for general CUT&RUN: Select **SEACR stringent**.
   - Assign each target's IgG control via the dropdown.
   - Fragment filter: ON (default).
6. Click **Submit**. Peak calling typically takes 10-20 minutes.

#### Step 9: Review Peak Calling Results

1. Open the peak calling run.
2. **QC Report**: Check FRiP scores (>0.2 is good).
3. **Annotation Plots**: Verify peak distribution matches expected biology (promoters for H3K4me3).
4. **IGV**: Open the genome browser to visually inspect peaks against signal tracks.

#### Step 10: Download Results

1. Navigate to **All Files** tab.
2. Browse the file tree to find outputs (BAMs, bigWigs, BEDs, heatmaps).
3. Select files and click **Download** for a batch ZIP, or click individual files.
4. Copy the **Methods Text** from the Info sub-tab for your manuscript.

---

### Tutorial 2: One-Click Auto-Pipeline

For routine processing where default parameters are acceptable.

1. Create an experiment with uploaded FASTQs and defined reactions (Steps 1-3 from Tutorial 1).
2. Click **Auto-Pipeline** in the experiment toolbar.
3. Review the default settings for each stage (trimming, alignment, peak calling).
4. Click **Start**.
5. Cleave automatically runs: **FastQC -> Trim -> Align -> Peak Call**.
6. Monitor progress via the status indicator and notification bell.
7. When complete, all results are available in their respective tabs.

---

### Tutorial 3: DiffBind Differential Analysis

Compare binding between conditions (e.g., wild-type vs. mutant) across biological replicates.

#### Prerequisites

- A completed alignment run with sorted BAM files for all samples.
- A completed peak calling run with BED files for all samples.
- At least 2 conditions with at least 2 replicates each (e.g., 2 ctrl + 2 mut = 4 samples minimum).

#### Steps

1. Click **New DiffBind** in the experiment toolbar.
2. **Step 1**: Name the analysis.
3. **Step 2**: Select the alignment run.
4. **Step 3**: Select the peak calling run.
5. **Step 4 -- Sample Sheet**: For each reaction, assign:
   - **Condition**: "ctrl" or "mut" (or your experimental labels).
   - **Replicate**: Number each ctrl-mut pair uniquely (1, 2, 3...).
   - **Factor**: The histone mark or protein (e.g., "H3K4me3").
6. **Step 5**: Choose analysis mode:
   - **DESeq2 (consensus)**: Standard approach. Uses peaks found in multiple samples.
   - **DESeq2 (custom peakset)**: Upload a BED file with your own peak regions.
   - **edgeR (custom peakset)**: Alternative statistical method with TMM normalization.
7. Click **Submit**.
8. When complete, review:
   - **Results tab**: Table of differentially bound regions (sortable by FDR, fold change).
   - **Plots tab**: Volcano plot, MA plot, PCA, correlation heatmap.
   - **Files tab**: Download TSV results, normalized counts, and plot images.

---

### Tutorial 4: Custom Reference-Point Heatmap

Generate a heatmap centered on your own genomic regions of interest.

1. Navigate to the **All Files** tab and click **Upload BED** to upload your regions-of-interest BED file.
2. Click **New Custom Heatmap** in the experiment toolbar.
3. Select the alignment run (for bigWig signal files).
4. Select the reactions to include.
5. Select your uploaded BED file as the regions.
6. Configure:
   - **Reference point**: center, TSS, or TES.
   - **Upstream window**: Distance upstream of reference point (e.g., 3000bp).
   - **Downstream window**: Distance downstream (e.g., 3000bp).
7. Click **Submit**.
8. View the heatmap and profile plot in the results tab.

---

### Tutorial 5: Pearson Correlation Matrix

Assess replicate concordance and identify outlier samples.

1. Click **New Pearson Correlation** in the experiment toolbar.
2. Select the alignment run.
3. Select the reactions to correlate (typically all replicates of the same target).
4. Click **Submit**.
5. Review the correlation heatmap:
   - **Biological replicates** should show high correlation (>0.9).
   - **Different targets** should show lower correlation.
   - **Outlier samples** will cluster separately.
6. Download the correlation matrix CSV for further analysis.

---

### Tutorial 6: Roman Normalization (Mouse Only)

Normalize bigWig signal intensity across samples for fair comparison.

1. Click **New Normalization** in the experiment toolbar.
2. Select the alignment run.
3. Select the mouse (mm10) reactions to normalize.
4. **Important**: The first reaction listed becomes the reference (normalization factor = 1.0). All others are scaled relative to it.
5. Click **Submit**.
6. When complete:
   - Normalized bigWig files (`.rnorm.bw`) are available for download.
   - Normalization factors are shown in the results tab and downloadable as CSV.
   - Use normalized bigWigs for downstream visualization and comparison.

---

### Tutorial 7: Importing FASTQs from an FTP Server

For files generated by your sequencing core facility.

1. Navigate to the **FASTQs** tab and click **Import from Server**.
2. Enter connection details:
   - **Protocol**: FTP or SFTP
   - **Hostname**: e.g., `ftp.igm.ucsd.edu`
   - **Port**: 21 (FTP) or 22 (SFTP)
   - **Username** and **Password**
3. Optionally check **Save server** to store credentials for future imports (passwords are encrypted at rest).
4. Click **Connect**. Browse the remote directory tree.
5. Navigate to your FASTQ files and select them via checkboxes.
6. Click **Import**. Files transfer in the background.
7. Monitor progress via the notification bell or the import progress indicator.
8. When complete, files appear in the FASTQs tab and FastQC runs automatically.

---

## Dark Mode

Cleave supports full light/dark theme switching:

1. Click the **theme toggle** in the navigation bar (sun/moon icon).
2. Choose **Light**, **Dark**, or **System** (follows your OS preference).
3. Your preference persists across sessions.

---

## Account Settings

Access settings via the **gear icon** or **Settings** link in the navigation menu.

- **Profile**: Update your first name, last name, and email.
- **Password**: Change your password (invalidates all existing sessions for security).
- **Notifications**: Configure email notification preferences.

---

## Troubleshooting

### Upload Issues

| Problem | Solution |
|---------|----------|
| Upload stuck at 0% | Check your internet connection. tus uploads auto-resume on reconnect. |
| "File too large" error | Maximum upload size is configured per-instance (default 5GB per file). Contact your admin. |
| Upload disappeared | Check the FASTQs tab -- partial uploads are retained for 48 hours and can be resumed. |

### Alignment Issues

| Problem | Solution |
|---------|----------|
| Very low alignment rate (<50%) for targets | Check that you selected the correct reference genome. Verify FASTQ quality via FastQC. Consider trimming if adapters are present. |
| Low IgG alignment rate (~29%) | This is **expected and normal** for IgG negative controls. |
| High duplication rate (>30%) | May indicate low template diversity or over-sequencing. Consider reducing sequencing depth for future experiments. |
| Job stuck in "running" | Check the pipeline log (Info tab) for error details. You can terminate and retry the job. |

### Peak Calling Issues

| Problem | Solution |
|---------|----------|
| Zero peaks called | Check alignment QC -- input BAM quality may be poor. Try a different peak caller or adjust threshold. |
| Very low FRiP (<0.1) | May indicate weak enrichment. Verify antibody quality via spike-in QC. |
| Too many peaks (noisy) | Try a more stringent threshold or switch to SEACR stringent mode. |

### General Issues

| Problem | Solution |
|---------|----------|
| Page not loading | Clear browser cache and reload. Check that you're using a modern browser (Chrome, Firefox, Edge, Safari). |
| "401 Unauthorized" errors | Your session expired. Log out and log back in. Access tokens refresh automatically, but if you've been inactive for 7+ days, a fresh login is needed. |
| Can't access a project | Ask the project Admin to verify your membership and role. |

---

## Security

- **Passwords**: Hashed with Argon2 (industry-standard, memory-hard algorithm). Never stored in plain text.
- **Sessions**: JWT access tokens (30-min) stored in memory (not localStorage). Refresh tokens (7-day) in httpOnly cookies (inaccessible to JavaScript).
- **Rate limiting**: Login attempts limited to 5/min, registration to 3/min per IP address.
- **File downloads**: Time-limited HMAC-signed tokens (5-min expiry). No persistent download URLs.
- **Server import**: SSRF prevention blocks connections to private IPs, localhost, and cloud metadata endpoints. Saved passwords encrypted with Fernet (AES-128-CBC).
- **Path security**: All file operations validate paths stay within the project's storage directory. Directory traversal attacks are blocked.
