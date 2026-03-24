## Core Workflow (Detailed)

### 1. Project & Experiment Creation

Users first create or navigate to a **Project** (organizational container), then create an **Experiment** within it via a 3-step wizard:
1. **Details**: Name the experiment (100 char limit) and select assay type (CUT&RUN or CUT&Tag).
2. **FASTQs**: Upload or import sequencing files.
3. **Reactions**: Define sample metadata (manually or via CSV upload).

### 2. Data Upload

- **Direct FASTQ upload** via browser drag-and-drop or file picker (Browse button).
- **Import from Illumina BaseSpace** via the BaseSpace Importer integration.
- **Import from Amazon Web Services** (S3 bucket).
- **Import from Server** — FTP/SFTP server support.
- **Import from Another Experiment** — Copy FASTQs already uploaded to the platform from a different experiment.
- Supported format: `.fastq.gz` (gzipped FASTQ files).
- Platform expects **paired-end** data (R1 and R2 files per sample).
- Files can be added to an existing experiment after initial creation via the "+ Add FASTQs" button.
- FastQC reports (version 0.12.1) are automatically generated for each uploaded FASTQ file and accessible via icon links in the FASTQs table.

### 3. Genome Alignment

Launched via the **New Alignment Wizard** (3 steps: Details → Choose Reactions → Alignment Settings):

- Aligns sequencing reads to a reference genome using **Bowtie2** (version 2.2.9).
- Reference genome: **Mouse mm10** observed; likely supports additional genomes (human hg38, etc.) via the Reference Genome dropdown.
- Post-alignment processing pipeline:
  - **SAMtools** (v1.13): Removal of multi-aligned reads.
  - **BEDTools** (v2.30.0): Removal of reads aligned to ENCODE DAC Exclusion List regions.
  - **Picard** (v2.27.1): Duplicate read filtering.
- Both filtering steps (duplicate removal, DAC exclusion) are **configurable** via checkboxes in Advanced Settings (both on by default).
- Signal track generation:
  - **Unsmoothed bigWigs**: RPKM-normalized via deepTools bamCoverage with configurable bin size (default 20bp). Used for heatmaps.
  - **Smoothed bigWigs**: RPKM-normalized with configurable bin size (default 100bp). Used for IGV visualization.
- Enrichment heatmaps: `computeMatrix` (deepTools) for TSS (reference-point mode) and gene bodies (scale-regions mode), visualized via `plotHeatmap`.
- Additional QC metrics: SNAP-CUTANA spike-in nucleosome analysis, E. coli spike-in read depth, mitochondrial read percentages.
- Email notification on completion (configurable: "Always" or potentially other options).
- Pipeline validated across 30,000+ CUT&RUN/CUT&Tag reactions (per EpiCypher marketing).
- **Cost**: Typically 5 credits per alignment (for ≤20M total reads). 0.25 credits extra per additional 20M reads.
- **Outputs**: Interactive QC report, unique BAMs, bigWigs (smoothed + unsmoothed), TSS heatmaps, gene body heatmaps, FastQC reports, raw/filtered BAMs, and supporting logs.

### 4. Peak Calling

Launched via the **New Peak Calling Wizard** (4 steps: Details → Choose Alignment → Choose Reactions → Peak Calling Settings):

- Requires a **completed alignment run** as input (selected in Step 2).
- Two peak calling algorithms available:
  - **MACS2** (version 2.2.9.1) — For **narrow/sharp** marks (e.g., H3K4me3, CTCF). Uses q-value threshold of 0.05 with automatically determined bin size.
  - **SICER2** — For **broad/diffuse** marks (e.g., H3K27me3). Uses FDR threshold of 0.01.
- Peak size mode: **Narrow** (for MACS2) or **Broad** (for SICER2), selectable per reaction.
- Requires an **IgG control** reaction as background input — the platform links each target reaction to its IgG control FASTQ prefix via a dropdown in Peak Calling Settings.
- **FRiP** (Fraction of Reads in Peaks) calculation: Reads in peaks (BEDTools v2.30.0) ÷ total reads (SAMtools v1.13).
- **Peak annotation**: HOMER (version 4.11.1) — annotates peaks with nearest genomic feature context (promoters, exons, introns, intergenic, 3'UTR, TTS, ncRNA, miRNA, pseudo).
- **Peak Annotation Plots**: Stacked horizontal bar chart showing per-reaction distribution of peaks across genomic features, downloadable as PNG or CSV.
- **Peak calling is free** (0 credit cost confirmed in Analysis Queue).
- **Outputs**: QC report (peak stats, FRiP, annotation plots), BED files, FRiP score files, HOMER peak annotation files, peak annotation stats, supporting logs.

### 5. Visualization & Export

- **Built-in genome browser** (IGV.js integration) accessible from both Alignment and Peak Calling tabs.
  - Requires user to select Reference Genome and Reactions before rendering.
  - Full Screen mode available.
  - Supports standard IGV.js features: chromosome selection, coordinate navigation, zoom, crosshairs, center line, track labels toggle, image export ("Save Image").
  - Multiple signal tracks displayed simultaneously for cross-sample comparison.
  - Per-track settings (gear icon) for customizing display.
  - Track labels format: `{AlignmentName}-{ShortName}`.
- **Publication-ready outputs** (all downloadable):
  - **BAM files** (multiple processing stages: final, unique, exclusion-list-filtered).
  - **BAI index files** (for each BAM).
  - **bigWig files** (RPKM-normalized signal tracks — both smoothed and unsmoothed).
  - **BED files** (peak coordinates).
  - **TSS Heatmaps** and **Gene Body Heatmaps** (enrichment visualizations).
  - **QC reports** (alignment stats, FRiP, peak distribution — downloadable as CSV).
  - **Methods reports** (auto-generated text with exact software versions, suitable for copy-paste into manuscripts).
  - **FastQC reports** (per-FASTQ quality assessment, viewable in-app or downloadable).
  - **HOMER annotation files and stats**.
  - **FRiP score files**.
  - **Peak Annotation Plots** (downloadable as PNG image or CSV data).
- All files browsable in a hierarchical tree in the "All Files" tab.
- Batch download via checkbox selection + Download button.

---

## Built-in Normalization & QC

### E. coli Spike-in DNA Normalization

- Reads aligned separately to E. coli K12 MG1655 reference genome.
- Normalization factor calculated from proportion of spike-in reads to total reads.
- Scalar factor applied via deepTools bamCoverage (or equivalent).
- Goal: E. coli spike-in reads should comprise ~1% (0.2–5%) of total sequencing reads.
- The E.coli Spike in field is tracked per-reaction in the Alignment Input metadata (observed as "Yes" for all reactions in the test experiment).
- E. coli spike-in read depth is included in the alignment QC report.

### SNAP-CUTANA K-MetStat Panel (Spike-in QC)

- Panel of 16 DNA-barcoded designer nucleosomes (15 distinct histone lysine methylation PTMs + unmodified control).
- Used with H3K4me3, H3K27me3, and IgG control antibodies.
- Assay success criteria: on-target enrichment with <20% off-target PTM recovery.
- Barcode sequences are published in the SNAP-CUTANA user guide.
- Generates QC heatmaps showing per-PTM recovery normalized to on-target signal.
- The CUTANA Spike in and CUTANA Spike in Target fields in the Reactions metadata are used to configure this. Values observed:
  - "None" — no spike-in used.
  - "KMetStat" — SNAP-CUTANA K-MetStat Panel used; must also specify target (e.g., "Unmodified" for IgG, "H3K4me3", "H3K27me3").
- SNAP-CUTANA spike-in nucleosome analysis is included in the alignment QC report.
- Dual spike-in support is available via "CUTANA Spike in 2" and "CUTANA Spike in Target 2" columns.

### Additional QC Metrics

- **Mitochondrial read percentages** — tracked in alignment QC as an indicator of sample quality.

---

## User & Project Management

### User Accounts

- Account creation uses an **email address** as the username/login identifier (observed: `zalibhai@ucsd.edu`).
- User profile includes editable First Name and Last Name fields.
- Job email notification preference: configurable (at minimum "Always"; likely also "Never" or "On Error").
- Free account signup includes **8 free analysis credits** (per marketing).

### Project System

- Projects are the top-level organizational unit.
- Each project contains one or more **Experiments**.
- Projects have:
  - A **name** (e.g., "Ferguson-Test-CnR").
  - A **total storage size** displayed on the Project Detail page (e.g., "53.2 GB").
  - A **status** (New, In Progress, Complete, Error, Terminated).
  - A **modified date**.
  - **Members** with roles (observed: "Admin", "Contributor").
  - An optional **description**.
- Members are displayed as circular **avatar badges** with initials (e.g., "CF" for Cole Ferguson, "ZA" for Zakir Alibhai).

### Member Management

- Users can be **invited to projects** via the Manage Members modal.
- Invitations use email address or user ID and assign an initial access role (default: "Contributor").
- Accepting an invitation triggers a notification (Project Invitation type) specifying the assigned role.
- **Observed roles**:
  - **Admin** — Full project control including managing members, settings, and all experiments. Role dropdown is editable by other admins. Cannot change own role (own role is grayed out/disabled in the management UI).
  - **Contributor** — Default role for new invitees. Likely can create experiments and run analyses but cannot manage members or project settings.

### Experiment Hierarchy

Projects → Experiments → Analysis Runs (Alignment, Peak Calling).

Each experiment has:
- A unique name (up to 100 characters).
- An assay type (CUT&RUN or CUT&Tag, set at creation).
- Associated FASTQ files, reaction metadata, and analysis results.
- Independent status tracking (New, In Progress, Complete, Error, Terminated).

Multiple experiments can exist within a single project, each at different stages of the analysis workflow.

### Gold Standard Data (Reference Project)

- A platform-provided, read-only reference project.
- Visually distinguished with a crown icon and filled star/pin.
- Contains pre-analyzed reference datasets that showcase the platform's capabilities and outputs.
- Allows users to explore alignment QC, peak calling results, and visualizations without uploading their own data.
- Last modified 09/02/2025 (a static reference dataset).

---

## Pricing Model

- Pay-as-you-go, no subscription.
- 1 credit = 1 genome alignment of a CUT&RUN/CUT&Tag reaction up to 20M total reads.
- 0.25 credits extra per additional 20M reads.
- Peak calling: **free** (0 credits, confirmed in Analysis Queue).

| Credits | Intro Price (through June 30, 2026) | Standard Price |
| ------- | ----------------------------------- | -------------- |
| 8–23    | $25/credit                          | $40/credit     |
| 24–95   | $25/credit                          | $35/credit     |
| 96–383  | $25/credit                          | $30/credit     |
| ≥384    | N/A                                 | $20/credit     |

### Storage

- First 300 GB free (~96 CUT&RUN/CUT&Tag reactions).
- $350/year per TB thereafter.

---

## Platform Details

- Results in as little as 90 minutes (alignment observed at 1h 45m; peak calling at 17m; total ~2 hours for this experiment).
- No coding required — fully GUI-driven.
- Currently available to **U.S. customers only**.
- Free account signup includes 8 free analysis credits.
- Sample/reference datasets available for exploration (Gold Standard Data project).
- Supported assay types: **CUT&RUN** and **CUT&Tag** (selected at experiment creation).

---

## Software Versions (Observed in Test Run)

| Tool | Version | Purpose |
|------|---------|---------|
| CUTANA CUT&RUN/Tag Alignment App | 1.0.5 | Alignment pipeline orchestration |
| CUTANA CUT&RUN/Tag Peak Calling App | 1.0.5 | Peak calling pipeline orchestration |
| Bowtie2 | 2.2.9 | Read alignment to reference genome |
| SAMtools | 1.13 | BAM processing, multi-read removal, read counting |
| BEDTools | 2.30.0 | DAC exclusion list filtering, reads-in-peaks counting |
| Picard | 2.27.1 | Duplicate read removal |
| deepTools | 3.5.1 | bigWig generation (`bamCoverage`), enrichment matrices (`computeMatrix`), heatmaps (`plotHeatmap`) |
| MACS2 | 2.2.9.1 | Peak calling (narrow peaks) |
| SICER2 | (version unknown) | Peak calling (broad peaks) |
| HOMER | 4.11.1 | Peak annotation |
| FastQC | 0.12.1 | Per-FASTQ quality assessment |

---

## Todos

### 1. Add FASTQ Trimming Support

CUTANA Cloud currently assumes pre-trimmed FASTQs as input — there's no built-in adapter trimming step. The clone needs to add trimming as a pipeline stage (likely between upload and alignment), using an existing trimming script from the lab's workflow. This fills a real gap: users with longer read lengths (e.g., 2×150 bp from core facilities) currently have to trim externally before uploading, which defeats the "no command line" value proposition.

**Approach**: Auto-detect adapter contamination from FastQC results post-upload, then present the user with a recommendation (e.g., "Adapters detected in 3/5 files — trimming recommended") with the option to accept, skip, or configure trim parameters. Default behavior: trim automatically if adapters detected, but user can override.

### 2. Fix FASTQ-in-Browser Memory Architecture

The original CUTANA Cloud app appears to load FASTQ file data into browser memory (possibly via WebGL or a similar client-side approach). This is architecturally unsound — FASTQ files are routinely hundreds of MB to multiple GB each, and you can't fit that into browser RAM. The clone should handle all FASTQ processing server-side and only send lightweight metadata, QC summaries, and rendered visualizations to the client. File operations (upload, import, linking to reactions) should use streaming/chunked approaches rather than in-memory loading.

### 3. Infrastructure & Deployment Architecture

Requisition a new, smaller AWS EC2 instance dedicated to the clone (separate from the lab's shared analysis instance). Tentative stack:

- **Reverse proxy**: NGINX
- **DNS/CDN**: Cloudflare (point domain via Cloudflare DNS)
- **Backend process management**: PM2 (Node.js) or direct process management — TBD based on backend framework choice
- **Pipeline execution**: Needs a job queue/batch system for running alignment, peak calling, etc. on the instance without blocking the web server. Options to evaluate: a simple task queue (Bull/BullMQ), direct shell execution with job tracking, or a lightweight workflow orchestrator.

**Open architecture decisions** (to be made collaboratively):

- Backend framework (Node/Express, FastAPI, etc.)
- How pipeline scripts are invoked from the web layer (child processes, job queue, containerized tasks)
- Database choice for metadata/job tracking (SQLite for simplicity vs. Postgres for robustness)
- File storage strategy (local disk on the instance vs. S3-backed)
- Auth system (roll our own vs. existing library)