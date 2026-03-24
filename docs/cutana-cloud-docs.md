# CUTANA™ Cloud: Official Documentation 

> Source: EpiCypher official platform documentation/FAQ. This document consolidates and organizes all documented platform behavior, requirements, pipeline details, QC interpretation guidance, and file specifications.

---

## Platform Overview

CUTANA™ Cloud is a specialized cloud platform for bioinformatic analysis of CUT&RUN and CUT&Tag data, designed specifically for wet lab scientists. It accelerates secondary analysis by streamlining alignment and peak calling of FASTQ files. Within hours, the platform generates aligned BAMs, bigWigs, and BED files, minimizing reliance on bioinformatics specialists and computing infrastructure. Post-processing, all files are available for download for further bioinformatic exploration.

---

## Data Hierarchy

```
Billing Account
└── Project (shared workspace with access controls)
    └── Experiment (analysis hub for a set of reactions)
        ├── FASTQ Files (paired-end sequencing data)
        ├── Reactions (sample metadata linked to FASTQs)
        ├── Alignment Run(s) (maps reads to reference genome)
        │   ├── QC Report
        │   ├── Unique BAMs, bigWigs, heatmaps
        │   └── IGV visualization
        └── Peak Calling Run(s) (identifies enriched regions)
            ├── QC Report (FRiP, annotation plots)
            ├── BED files, annotation files
            └── IGV visualization
```

---

## Projects

A Project is a shared workspace where authorized users manage data analysis in Experiments. Projects are created by linking a billing account and setting user preferences.

### Project Creation (3 Steps)

1. **Create Project**: Provide a name and description.
2. **Billing and Access**: Configure billing settings and assign access permissions (Copy, Delete, Download) to project members.
3. **Add Members**: Invite users by username or email address and define roles.

### Access Controls

During setup, the creator can assign **Copy**, **Delete**, and **Download** access to members:
- Copy and Download permissions can be granted or restricted for specific individuals (Contributors).
- Delete access can be limited to Admins or extended to all Contributors.

### Member Roles

| Role | Description |
|------|-------------|
| **Admin** | Full project control including member management, settings, and access configuration. |
| **Contributor** | Can work within experiments; Copy/Download/Delete permissions configurable per-user. |
| **Viewer** | Read-only access (implied from role list). |
| **Uploader** | Can upload data but likely restricted from analysis or configuration (implied from role list). |

---

## Experiments

An Experiment serves as a centralized hub within a Project for conducting CUT&RUN or CUT&Tag analyses. It allows users to upload paired-end FASTQ files, organize their desired analysis, store generated files, and explore results. Users can monitor alignment outcomes and access subsequent analysis files produced during the alignment process.

### Experiment Creation (3 Steps)

1. **Experimental Details**: Provide the experiment name, select assay type (CUT&RUN or CUT&Tag), and add any relevant description.
2. **FASTQ Upload**: Integrate FASTQ.gz files into the experiment.
3. **Reaction Sheet Creation**: Supply experimental specifics for FASTQ processing during data analysis.

---

## FASTQ File Requirements

### Sequencing Requirements

- **Paired-end sequencing only** — CUTANA Cloud currently only supports paired-end sequencing.
- **Recommended**: 2×50 bp sequencing for CUT&RUN libraries.
- Longer sequencing runs (e.g., 2×150 bp) can include adapter sequences that need to be trimmed prior to import.
- Deviations from 2×50 bp may be unavoidable due to core facility requirements or instrument settings.

### Why Paired-End?

Paired-end sequencing improves data fidelity over single-end sequencing by:
- Enabling high-quality alignment in repetitive DNA regions.
- Generating long contigs for de novo sequencing by bridging gaps in the consensus sequence.
- Reading the template in two directions (forward and reverse), corresponding to the i5 and i7 indices added during library preparation.
- Enhancing the fidelity of flow cell clustering and subsequent base calling.

### File Format Requirements

- Supported formats: `.fastq.gz` (gzipped) and `.fastq` (unzipped).
- Unzipped FASTQs will be **automatically gzipped** during upload to conserve storage.
- Two FASTQ files per reaction: R1 (forward read) and R2 (reverse read).
- R1 and R2 files must share the **same filename** except for the R1/R2 designation.
- R1 and R2 will be concatenated during the alignment process.

### Naming Requirements

- FASTQ file names **must start with an alphanumeric character** (A-Z, 0-9). Some renaming may be necessary depending on how/where files are generated.
- FASTQ names must preserve the **standard Illumina® suffix**: `…_L001_R1_001.fastq.gz` / `…_L001_R2_001.fastq.gz`.

---

## FASTQ Upload Methods

### 1. Local Upload

Two methods for uploading from desktop:
- **During initial Experiment setup**: Use the "Add Data/FASTQs" section with drag-and-drop or Browse file picker.
- **After Experiment creation**: Access the existing Experiment and add FASTQs via the "+ Add FASTQs" button.

### 2. BaseSpace Importer

For users storing FASTQ files on Illumina's BaseSpace server:
1. Click "BaseSpace Importer" in the Add Data section.
2. Redirects to Illumina BaseSpace login page.
3. Enter credentials and log in.
4. Return to CUTANA Cloud page.
5. Files are sorted by **Projects** (entire sequencing runs) and **Biosamples** (individual reactions).
6. Select checkboxes for desired files, click "authorize" and "import."
7. Files transfer in the background while you complete the Reaction sheet.

Eliminates the need to download and re-upload large amounts of data.

### 3. AWS Import

Requires two pieces of information:
- **Role ARN** (Amazon Resource Name): A unique global identifier for an AWS IAM role, which defines permissions for trusted entities to access resources using temporary credentials.
- **Bucket Name**: The name of the Amazon S3 bucket (top-level container) where FASTQ files are stored. Buckets are tied to an AWS region and require a unique name within that region.

### 4. From Server

1. Choose "From Server."
2. Enter the specific URL of the secured server where files are hosted.
3. Click "Import Data."
4. A green notification appears when files are successfully uploaded.

### 5. From Another Experiment

Copy FASTQs from an existing experiment on the platform (referenced in UI but not detailed in FAQ).

---

## Reactions (Sample Metadata)

On the platform, a **Reaction** is identified by its **FASTQ Prefix** — the portion of the FASTQ filename that is shared by only the forward and reverse read files (R1 & R2).

### Required Reaction Details

| Field | Description |
|-------|-------------|
| **FASTQ Prefix** | The shared portion of the FASTQ filename between R1 and R2. E.g., `22AA001_IgG_K562_500K_K-Met_S83_L001` |
| **Short Name** | A unique name for labeling figures in analysis outputs. Reactions with the same Organism must have unique Short Names. |
| **Organism** | Dropdown selection of organisms with available reference genomes: **Human**, **Mouse**, **Drosophila** (and yeast, per genome list). |
| **CUTANA Spike in** | Specify the SNAP-CUTANA™ Spike-in panel used or select "None". **Do not leave blank.** |
| **CUTANA Spike in Target** | Dropdown to identify the on-target spike-in for the reaction. |
| **E.coli Spike in** | If the reaction contains CUTANA™ E.coli Spike-in DNA, select "Yes" — sequences will also be aligned to the E. coli reference genome. |

### Optional Metadata Fields

Additional fields available via "Customize Columns" for record keeping and reaction identification: Cell Type, Cell Number, Sample Prep, Experimental Condition, Antibody Vendor, Antibody Cat No, Antibody Lot No, CUTANA Spike in 2, CUTANA Spike in Target 2.

---

## Supported Reference Genomes

| Organism | Genome Build(s) |
|----------|-----------------|
| **Human** | hg19, hg38, T2T-CHM13v2.0 |
| **Mouse** | mm10 |
| **Drosophila** | dm6 |
| **Yeast** | sacCer3 |
| **E. coli** | K12 MG1655 (for spike-in alignment) |

---

## Alignment Pipeline

### What Alignment Does

Alignment maps paired-end CUT&RUN or CUT&Tag sequencing files to a reference genome, revealing where sequences are enriched across the genome. It is the crucial step where individual sequencing reads (short DNA fragments) are mapped to their corresponding locations within a reference genome.

### The Process

1. **Indexing the Reference Genome**: The reference genome is processed and indexed to create a data structure allowing rapid searching and retrieval, significantly speeding up alignment.
2. **Read Mapping**: Each sequencing read is compared against the indexed reference genome. Algorithms find the best possible match, accounting for sequencing errors, genetic variations, and read lengths.
3. **Generating Alignment Files**: Output is SAM/BAM files containing read sequence, aligned position, mapping quality, and any mismatches or gaps. BAM files are compressed binary versions of SAM files.

### Pipeline Processing Steps

The CUTANA™ CUT&RUN/Tag Alignment Pipeline:
1. Aligns paired-end FASTQ files to the designated reference genome.
2. **Discards multi-aligned reads** — reads that map to more than one location.
3. **Removes duplicates** (default, optional) — reads with identical sequences aligning to a single location.
4. **Removes ENCODE DAC Exclusion List reads** (default, optional) — reads in regions known to produce false positives.
5. Optionally analyzes **CUTANA™ Spike-in Controls** and aligns to the **E. coli reference genome**.

Duplicate removal and Exclusion List filtering are both **optional** and can be turned off in Advanced Settings during the New Alignment workflow.

### Configurable Alignment Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Remove Duplicate Reads | On (checked) | Filters PCR/optical duplicates via Picard. |
| Remove ENCODE DAC Exclusion List regions | On (checked) | Filters reads in known false-positive regions. |
| BAM Coverage Bin Size | 20 bp | Bin size for unsmoothed bigWig (used for heatmaps). |
| Smoothed BAM Coverage Bin Size | 100 bp | Bin size for smoothed bigWig (used for IGV). |

### Concurrent Alignment

CUTANA Cloud supports **simultaneous processing of multiple alignments**. The number of concurrent alignments is tied to the budget allocated to the billing account. Users can upload numerous FASTQ files, construct their Reaction sheet, and align all data in a single streamlined operation.

### Alignment Outputs

Located within the "Alignments" tab of an Experiment:

| Output | Location | Description |
|--------|----------|-------------|
| **Run Methods** | Alignments > Info | Detailed bioinformatic methods with algorithms, parameters, and pipelines — ensures reproducibility. |
| **Alignment QC Report** | Alignments > QC Report | Central hub for evaluating experimental success (see QC section below). |
| **Unique BAM Files** | Alignments > Files | Final high-quality output — uniquely aligned reads after all filtering. Primary input for downstream peak calling. |
| **Unsmoothed bigWig Files** | Alignments > Files | RPKM-normalized, used for precise heatmap generation without artificial smoothing. |
| **Smoothed bigWig Files** | Alignments > Files | RPKM-normalized, smoothing enhances visual clarity for IGV exploration. |
| **TSS Heatmaps** | Alignments > Files | PNG heatmaps of enrichment around transcription start sites. |
| **Gene Body Heatmaps** | Alignments > Files | PNG heatmaps of enrichment across gene bodies. |
| **FastQC Files** | Alignments > Files | Regenerated per-FASTQ quality reports for reference. |
| **Raw/Filtered BAMs** | Alignments > Files | Intermediate BAM files from various processing stages. |
| **Supporting Logs** | Alignments > Files | Pipeline execution logs. |

---

## Alignment QC Report — Interpretation Guide

### Seq Stats and Alignment Metrics

| Metric | Suggested Range | Notes |
|--------|----------------|-------|
| **Total Reads** | 5–10M per sample (up to ~15M acceptable) | Expect loss of 1–2M reads post-alignment due to duplicates, blacklisted reads, and multi-aligned reads. |
| **Unique Alignment Rate** | 70–95% for specific PTMs | IgG negative control is **not expected to align well** — low rate is normal for IgG. Datasets below recommended range warrant investigation. |
| **Duplication Rate** | <30% | High rates may indicate: low template diversity, over-amplification during PCR, over-sequencing, or >5% Illumina adapter dimer in library/flow cell. |
| **E. coli Alignment Rate** | <5% | High rates may indicate: incorrect spike-in reconstitution (too much added to stop buffer/samples), low template diversity, or over-sequencing. |

### Causes of Poor Alignment Quality

- Poor assay yields / low unique templates
- High PCR duplicates
- Over-sequencing
- Incorrect E. coli spike-in reconstitution

### SNAP-CUTANA Spike-in Results

Found on the Alignment QC Report. Displays a **heatmap** illustrating the percentage of barcode reads from the panel:

- **IgG antibody control**: Should show **<20% recovery** across each of the 16 panel members (indicating no specificity).
- **H3K4me3 antibody control**: Should show **100% specificity** for the H3K4me3 barcoded nucleosome and **<20% for all other members**.
- **Deviations >20% for off-target** panel members may suggest: poor-quality antibody, excessive SNAP Spike-in amount, or assay-related issues.

### TSS and Gene Body Heatmaps

Generated for each reaction, showing unique reads aligned to known transcription sites. Provides enrichment pattern insight:
- **H3K4me3** (active transcription mark): Should appear as a **punctate peak** in Mean Signal (RPKM) centered on the TSS and at the beginning of the Gene body.

---

## Peak Calling Pipeline

### What Peak Calling Does

Peak calling determines regions of the genome where target signal is significantly enriched relative to background. This helps understand how a protein interacts with loci or other chromatin factors genome-wide.

### Available Peak Callers

| Peak Caller | Best For | Threshold | Description |
|-------------|----------|-----------|-------------|
| **MACS2** | Narrowly enriched targets (e.g., H3K4me3, CTCF) | q-value 0.05 | Recommended for sharp/punctate enrichment patterns. |
| **SICER2** | Broadly enriched targets (e.g., H3K27me3) | FDR 0.01 | Recommended for diffuse/broad enrichment patterns. |

Either tool can be used, but it helps to know a priori how the target is expected to enrich so an appropriate tool can be selected.

> Note: The FAQ also references **SEACR** in one passage ("MACS2/SICER/SEACR"), suggesting a third peak caller may be available or planned, though only MACS2 and SICER2 are described in detail.

### Peak Calling Requirements

1. The **Unique BAM file** must originate from a quality sequencing event (acceptable read depth, % unique reads, SNAP-CUTANA spike-in recovery, etc.).
2. It is **strongly recommended** to use an **IgG control reaction** as the peak calling control to determine background signal.

### IgG Control Selection

Selecting the correct IgG negative control is critical:
- **Wild type IgG** should be used with target reactions in those cells.
- **Drug-treated IgG** should be used as the control for target reactions in treated cells.
- Match the IgG control to the experimental condition of the target reactions.

### Peak Calling Outputs

| Output | Format | Description |
|--------|--------|-------------|
| **BED Files** | .bed | Genome location of each significant peak. Can be loaded into IGV for visual confirmation. |
| **Peak Text Files** | .txt | Location, count, and weighted strength (FRiP) of each called peak. |
| **FRiP Score Files** | — | Fraction of Reads in Peaks metrics. |
| **Peak Annotation Files** | — | HOMER annotation of each peak to nearest genomic feature. |
| **Peak Annotation Stats** | — | Summary statistics from HOMER annotation. |
| **Supporting Logs** | — | Pipeline execution logs. |

---

## Peak Calling QC Report — Interpretation Guide

Found under Peak Calling > QC Report. Contains:

### 1. Peak Calling Stats and Metrics

**FRiP (Fraction of Reads in Peaks)** is the crucial quality metric:
- Represents the ratio of unique reads associated with statistically significant peaks.
- Peaks identified using an IgG negative control as background.
- **High-quality FRiP: >0.2** (indicates robust enrichment at peak regions).

### 2. Top Called Peaks

A graph and downloadable `.csv` file providing precise genomic locations (chromosome, start, end coordinates) of significant peaks. These can be cross-referenced in IGV.

### 3. Peak Annotation Plots

Categorizes each peak by genomic location:
- Promoters
- Introns
- Exons
- UTRs (3'UTR, 5'UTR)
- Intergenic regions
- Transcription Start Sites (TSS)
- Transcription Termination Sites (TTS)
- ncRNA, miRNA, pseudo

Analyzing peak distribution across categories reveals the biological relevance of enrichment patterns.

### Interpreting Peak Calling Results

- Peak calling quality depends on the quality of the input Unique BAM file.
- The peak caller delivers statistically significant peaks according to preselected q-value, FDR, and significance thresholds.
- **More peaks ≠ better peak calling.** Trustworthiness is multifactorial:
  1. Quality of Unique BAM input.
  2. Visual comparison of peak locations and characteristics in IGV.
  3. Strength of FRiP scoring — **higher FRiP = more trustworthy data**.

### IGV Peak Visualization

In the Peak Calling > IGV tab:
- **Highlighted bars** beneath bigWig traces represent called peaks.
- Compare peak locations to genomic features based on target biology. E.g., a transcription-related target should show peaks near/adjacent to promoter regions.
- Useful to compare against H3K4me3 control (active transcription mark) for context.

---

## Alignment in CUT&RUN/CUT&Tag Context

After enzymatic cleavage and library preparation, alignment of sequencing reads enables researchers to:

1. **Identify Enriched Regions**: Pinpoint genomic regions where a high number of reads align, indicating where the target protein or histone modification was enriched on chromatin.
2. **Generate Peak Files**: Downstream peak calling uses aligned reads to call "peaks" — regions of significant enrichment corresponding to protein binding sites or histone modification locations.
3. **Integrate with Other Genomic Data**: Precisely aligned reads can be integrated with gene expression data, chromatin accessibility data, etc., for comprehensive understanding of gene regulation and chromatin dynamics.

---

## Key Terminology Reference

| Term                            | Definition                                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Reaction**                    | A single CUT&RUN or CUT&Tag sample, identified by its FASTQ Prefix.                                             |
| **FASTQ Prefix**                | The shared portion of R1/R2 filenames that uniquely identifies a reaction.                                      |
| **Unique BAM**                  | Final filtered BAM — uniquely aligned reads after duplicate, multi-map, and exclusion list removal.             |
| **bigWig**                      | Compact format for continuous genomic data, RPKM-normalized. Smoothed version for IGV, unsmoothed for heatmaps. |
| **BED file**                    | Tab-delimited file defining genomic regions (chromosome, start, end). Used for peak coordinates.                |
| **FRiP**                        | Fraction of Reads in Peaks — ratio of reads in significant peaks to total reads. >0.2 is high quality.          |
| **MACS2**                       | Peak caller for narrow/sharp enrichment. q-value threshold 0.05.                                                |
| **SICER2**                      | Peak caller for broad/diffuse enrichment. FDR threshold 0.01.                                                   |
| **ENCODE DAC Exclusion List**   | Curated list of genomic regions known to produce false-positive signal in sequencing experiments.               |
| **SNAP-CUTANA K-MetStat Panel** | 16 DNA-barcoded designer nucleosomes for antibody specificity QC.                                               |
| **E. coli Spike-in**            | Carry-over E. coli DNA used for normalization; aligned separately to E. coli K12 MG1655 genome.                 |
| **TSS**                         | Transcription Start Site — used for enrichment heatmaps.                                                        |
| **RPKM**                        | Reads Per Kilobase per Million mapped reads — normalization method for bigWig files.                            |
| **IgG Control**                 | Negative control antibody used as background for peak calling; should show no specific enrichment.              |
| **SAM/BAM**                     | Sequence Alignment/Map files; BAM is the compressed binary version.                                             |

## Original Email from EpiCypher

> CUT&RUN and CUT&Tag have become the gold standard for profiling protein–DNA interactions — but for many labs, data analysis is still the biggest bottleneck: in this vein we have developed CUTANA™ Cloud. This bioinformatics platform was built to give experimental scientists direct control over their data; without requiring command-line tools, custom scripts, or bioinformatics support. Researchers often find themselves waiting on bioinformatics assistance, troubleshooting fragmented pipelines, or struggling to confidently interpret QC and peak calling results.
>
> That's exactly why EpiCypher developed CUTANA™ Cloud — a validated analysis platform designed specifically for CUT&RUN and CUT&Tag workflows.
>
> With CUTANA Cloud, you can:
> - Upload FASTQs directly or import from BaseSpace™
> - Run alignment, QC, and peak calling using validated pipelines refined across 30,000+ CUT&RUN/Tag reactions
> - Visually explore peaks and enrichment using an integrated genome browser
> - Generate publication-ready outputs (BAMs, bigWigs, BED files, QC reports)
> - Move from sequencing data to biological insight in hours, not weeks
>
> Importantly, there's no subscription required; it's a simple pay-as-you-go model, making it easy to evaluate alongside your current workflow. You can explore the platform using validated reference datasets before uploading your own data.
>
> Promotional pricing starts at $25/credit, and each credit equates to one genome alignment of a CUT&RUN/Tag reaction sequenced to 20 million total reads (0.25 credits extra per 20 million reads thereafter). Peak calling is free of charge.
>
> If you are interested in CUTANA Cloud, sign up for a free account today and receive free analysis credits for 8 CUT&RUN/CUT&Tag reactions. We look forward to helping accelerate your epigenomic research!
