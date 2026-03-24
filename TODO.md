**Language > Specialist**: Full-Stack + Bioinformatics > Senior Systems Architect
**Includes**: FastAPI, React, PostgreSQL, Bowtie2, SAMtools, BEDTools, deepTools, MACS2, SICER2, SEACR, HOMER, Trimmomatic, DiffBind, IGV.js
**Requirements**: MAXIMUM verbosity — this is a pre-build audit, not code

---

## The Project in Plain Language

Cleave is a self-hosted web app that replaces two things simultaneously: (1) EpiCypher's paid CUTANA Cloud service, and (2) the Ferguson Lab's manual SSH-into-an-EC2-and-run-scripts workflow. A researcher uploads paired-end FASTQ files through a browser, fills in sample metadata, clicks "Run Alignment," and walks away. An hour or two later, they come back to QC reports, bigWig tracks in an embedded genome browser, and downloadable peak files — no command line, no waiting on a bioinformatician.

Under the hood, a React frontend talks to a FastAPI backend, which writes job rows into a PostgreSQL `analysis_jobs` table. A standalone Python worker process polls that table, picks up queued jobs, and shells out to the actual bioinformatics tools (Bowtie2, MACS2, deepTools, etc.) via `subprocess.run()`. Results are written to disk in a structured directory tree, metadata about output files is stored in the DB, and the frontend polls or receives SSE pushes to update the UI in real time.

The architecture is intentionally simple: one EC2 instance, one worker process (one job at a time), local disk storage, NGINX in front. The worker's dispatch function is the abstraction boundary — today it calls `subprocess.run()`, tomorrow it could submit to AWS Batch or Slurm without changing the web layer. But we aren't building that tomorrow-layer yet.

---

## Systematic Walk-Through: What Needs to Exist Before We Write Code

I'm going to walk stage by stage through the pipeline and identify every external dependency — files, binaries, reference data — that must be physically present on the instance (or in the repo) for that stage to work. This is the "Claude can't make this up" audit.

### 1. Reference Genome Indices (Critical, Large, Cannot Be in Repo)

Bowtie2 doesn't align against a raw FASTA — it needs a pre-built index (`.bt2` files). These are 3–8 GB *per genome*. The architecture doc lists support for mm10, hg38, hg19, T2T-CHM13v2.0, dm6, and sacCer3.

**What you need to source:**
- Pre-built Bowtie2 indices for each genome. Illumina's iGenomes project hosts these, or you can download the FASTA from UCSC/NCBI and run `bowtie2-build`. The lab instance already has mm10 at `~/cutruntools/assemblies/` — you should confirm whether it has hg38 too.
- **E. coli K12 MG1655 index** for spike-in alignment. The genome is freely available from NCBI (RefSeq accession `GCF_000005845.2`). You need to either download a pre-built Bowtie2 index or build one.

**My recommendation:** Write an `instance-setup.sh` script that downloads and builds all indices into a known location (e.g., `/data/cleave/genomes/`). This runs once during deployment, not during normal operation. The backend config file stores the path to each genome's index prefix. Don't try to ship these in the repo — they're too large and they're freely available.

**Outstanding question:** Does the lab instance already have Bowtie2 indices for hg38, dm6, sacCer3, and E. coli, or only mm10? If they're already built, you can just `scp` them to the new instance instead of rebuilding (saves hours).

### 2. Chromosome Sizes Files

deepTools `bamCoverage` and `computeMatrix` need chromosome sizes files (a two-column TSV: `chr_name\tlength`). The lab has `~/cutruntools/assemblies/chrom.mm10`.

**What you need:** One `.chrom.sizes` file per supported genome. These are tiny (~1 KB each) and can ship in the repo under `backend/pipelines/reference/`. You can generate them from the FASTA with `samtools faidx genome.fa && cut -f1,2 genome.fa.fai > chrom.sizes`, or download them from UCSC (`fetchChromSizes`).

**My recommendation:** Include them in the repo. They're small, stable, and version-controllable.

### 3. ENCODE DAC Exclusion List (Blacklist) BED Files

The alignment pipeline optionally filters reads in known false-positive regions. These are curated BED files from the Boyle Lab's Blacklist project.

**What you need:** BED files for each genome build. Available at [https://github.com/Boyle-Lab/Blacklist](https://github.com/Boyle-Lab/Blacklist). The relevant files are things like `mm10-blacklist.v2.bed.gz`, `hg38-blacklist.v2.bed.gz`, etc.

**My recommendation:** Download these and include them in the repo under `backend/pipelines/reference/blacklists/`. They're small (~50 KB each) and versioned upstream. Pin to a specific release so you have reproducibility.

**Outstanding question:** Which blacklist version does the lab currently use? The Boyle Lab has v1 and v2. CUTANA Cloud's docs say "ENCODE DAC Exclusion List" which typically means the v2 set, but confirm with Cole or check the lab's `subtract_blacklist.sh` script.

### 4. Gene Annotation Files for Heatmaps

deepTools `computeMatrix` in reference-point mode (TSS heatmaps) and scale-regions mode (gene body heatmaps) needs a BED or GTF file defining gene coordinates.

**What you need:** For each supported genome, a gene annotation file. Typically a BED12 file of RefSeq or GENCODE genes. UCSC Table Browser can export these. deepTools can also use GTF directly.

**Where to get them:** UCSC Table Browser → select assembly (mm10, hg38, etc.) → track "NCBI RefSeq" → table "refGene" → output format "BED" → get output. Alternatively, GENCODE GTFs from [gencodegenes.org](https://www.gencodegenes.org/).

**My recommendation:** Ship these in the repo alongside chromosome sizes. They're moderate-sized (~10–50 MB) but stable per genome build. If they're too large for the repo, add them to the `instance-setup.sh` download script.

**Outstanding question:** What annotation source does the lab currently use for their heatmaps? The `heatmapjai.sh` script's `computeMatrix` call references a BED file — you need to know which one to ensure consistency with the lab's existing results.

### 5. SNAP-CUTANA K-MetStat Panel Barcode Sequences

This is the trickiest data dependency. CUTANA Cloud automatically aligns reads against the 16 barcoded designer nucleosomes in EpiCypher's SNAP-CUTANA K-MetStat Panel and generates a QC heatmap showing per-PTM recovery.

**The problem:** These barcode sequences are *proprietary to EpiCypher*. They're published in the SNAP-CUTANA user guide (which you probably received with your kit), but they are not on GenBank or in a public repository.

**What you need:** A FASTA file containing the 16 barcode sequences, with headers identifying which PTM each corresponds to. You'd then build a small Bowtie2 index from this FASTA and align a subset of reads to it.

**Outstanding questions:**
- Do you have a copy of the SNAP-CUTANA user guide with the barcode sequences? Or does the lab have a FASTA file they already use?
- Your test experiment on CUTANA Cloud had "CUTANA Spike in: None" for all reactions — so this feature wasn't exercised. Will your PI actually use this? If not, it can be deferred.
- If you do implement it: the alignment to spike-in barcodes is separate from the main genome alignment. You'd run Bowtie2 against the barcode index, count reads per barcode, normalize, and generate the heatmap. The algorithm is straightforward; the data (sequences) is the bottleneck.

**My recommendation:** Ask your PI whether spike-in QC is a priority. If yes, get the barcode FASTA from the lab's CUTANA materials. If not, stub this out in the UI (show "No spike-in data" on the QC report) and implement later.

### 6. E. coli Spike-in Normalization

Separate from the SNAP-CUTANA panel — this uses carry-over E. coli DNA from the pA-MNase production process as a normalization control. The approach is: align all reads to both the target genome and the E. coli genome, calculate the ratio of E. coli reads to total reads, and use that ratio as a scalar normalization factor.

**What you need:**
- E. coli K12 MG1655 Bowtie2 index (covered in §1 above).
- The normalization math: `scale_factor = 1 / (ecoli_reads / total_reads)`, then apply via `deepTools bamCoverage --scaleFactor`. This is well-documented in the CUT&RUN literature (Skene & Henikoff 2017) and isn't something Claude needs to invent.

**The algorithm is public and published.** You don't need to fetch anything proprietary — just the E. coli genome (freely available from NCBI) and the normalization formula (published in the original CUT&RUN paper).

**My recommendation:** Include E. coli genome download in `instance-setup.sh`. The normalization logic goes in `backend/pipelines/normalization.py` and is straightforward arithmetic on samtools flagstat counts.

### 7. Trimmomatic + kseq_test Binaries and Adapter Files

**Trimmomatic:** A Java JAR. Installable via conda (`conda install -c bioconda trimmomatic`) or downloadable from [usadellab.org](http://www.usadellab.org/cms/?page=trimmomatic). It bundles standard adapter files.

**Adapter files:** You've already secured copies of `Truseq3.PE.fa`, `Truseq3.SE.fa`, `NexteraPE-PE.fa`, `TruSeqAdapters.fa` from the lab instance (noted in the architecture doc). These should ship in the repo at `backend/pipelines/adapters/`.

**kseq_test:** This is a C binary from the CUTRUNTools package. It's a simple FASTQ length trimmer.

**Outstanding questions:**
- Can you compile `kseq_test` from the CUTRUNTools source? The source is at [https://github.com/fl-yu/CUTRUNTools](https://github.com/fl-yu/CUTRUNTools) — you'd need to build the C code, which requires `zlib` headers.
- Alternatively, can you just `scp` the compiled binary from the lab instance? If the new instance is the same architecture (x86_64 Ubuntu), this is simpler.
- **Is kseq_test even necessary?** Its purpose is to force all reads to exactly 42 bp. Trimmomatic already handles quality/adapter trimming. The fixed-length step is a CUTRUNTools-specific convention that may or may not be important for your results. This is worth asking Cole about — if the lab gets good results without the fixed-length step, you could simplify the pipeline.

**My recommendation:** Ship adapter files in the repo. Install Trimmomatic via conda. For kseq_test, try to copy the binary first; if that doesn't work, compile from source. But flag the "is this step necessary?" question to Cole.

### 8. SEACR

SEACR (Sparse Enrichment Analysis for CUT&RUN) is a bash script that depends on R and bedtools. It's available from [https://github.com/FredHutch/SEACR](https://github.com/FredHutch/SEACR).

**What you need:** The `SEACR_1.3.sh` script (or whichever version the lab uses) and its R dependency. SEACR takes a target bedgraph and a control bedgraph (or numeric threshold) and outputs peak BED files.

**Outstanding questions:**
- What version of SEACR does the lab use? Their `integrated.step2.sh` calls SEACR but the version isn't documented.
- SEACR requires bedgraph input, not BAM. The pipeline needs to convert BAMs to bedgraphs (via `bedtools genomecov -bg`) before calling SEACR. Is this conversion already part of the lab's `integrated.step2.sh`? Almost certainly yes, but you should confirm the exact command.
- SEACR's R dependency: does it need a specific R package, or just base R? (Answer: it uses base R, no special packages.)

**My recommendation:** Clone the SEACR repo into `backend/pipelines/tools/SEACR/` or install via conda. Pin the version.

### 9. HOMER Installation

HOMER is both a set of Perl scripts and a set of genome-specific annotation databases. Installing HOMER with `conda install homer` gives you the scripts, but you then need to install per-genome data packages:

```bash
perl configureHomer.pl -install mm10
perl configureHomer.pl -install hg38
# etc.
```

Each genome data package is ~200 MB–1 GB and includes gene annotations, promoter definitions, etc. that HOMER uses for `annotatePeaks.pl`.

**My recommendation:** Include HOMER genome data installation in `instance-setup.sh`. This is a one-time setup step.

### 10. DiffBind and R Environment

DiffBind is an R/Bioconductor package with heavy dependencies (DESeq2, edgeR, GenomicRanges, etc.). The lab uses a dedicated conda environment for it.

**Outstanding questions:**
- Do you have a copy of the lab's `diffbind.R` and `diffbind_peaklist.R` scripts? The architecture doc references them but their actual code isn't included in the documentation.
- What's the exact R invocation? The doc shows `Rscript diffbind.R <experiment_name> <samplesheet.csv>` — but the internal logic (how it uses DiffBind's API, what contrasts it runs, what outputs it generates) matters for building the wrapper.
- The known bug (missing header row) — your pipeline will fix this, but you need to know the *correct* column names to insert. The doc says `seqnames | start | end | width | strand | Conc | Conc_mut | Conc_ctrl | Fold | p.value | FDR` — but are "Conc_mut" and "Conc_ctrl" always those exact strings, or do they change based on the condition names in the sample sheet?

**My recommendation:** Get copies of both R scripts from the lab instance before starting Phase 6. DiffBind is a Phase 6 feature, so this isn't blocking, but collect the scripts early.

### 11. Roman Normalization R Script

Same question — the doc references `normalization.r` and `input_normalization.r` at `/media/rs_256/normalization/master_files/`, but we don't have the actual code.

**Outstanding question:** What does Roman normalization actually compute? The doc says "all are normalized to the first sample listed for the same histone modification" — this sounds like a simple read-depth scaling, but the exact method matters. Get the script.

### 12. Pearson Correlation Scripts

The doc references `peak_extractor.r` and `pearson.py` at `/media/rs_256/pearson_corr/`. Again, we don't have the code.

**Outstanding question:** What R/Python libraries do these use? `peak_extractor.r` likely uses GenomicRanges or rtracklayer to read bigWigs and extract values at peak regions. `pearson.py` likely uses numpy/scipy for correlation and seaborn/matplotlib for the heatmap.

**My recommendation:** For correlation matrices, we might not even need the lab's exact scripts — computing pairwise Pearson correlation from bigWig signal at peak regions is a well-defined operation. But getting the scripts lets us match the lab's exact methodology.

---

## Architecture Build-Out: How This Actually Gets Assembled

### Phase 1 is a standard web app — no bioinformatics dependencies

Phase 1 (Foundation) is React + FastAPI + PostgreSQL + JWT auth + project/experiment CRUD. This requires *zero* bioinformatics tools. You can build and test the entire web shell locally in Docker Compose with `PIPELINE_MODE=mock`. This is where we start.

The key decisions here are the ones that affect everything downstream:

**Directory structure for the monorepo:**
```
cleave/
├── backend/
│   ├── main.py                  # FastAPI app entry
│   ├── config.py                # Settings (env vars, paths)
│   ├── models/                  # SQLAlchemy ORM models
│   ├── schemas/                 # Pydantic request/response schemas
│   ├── routers/                 # API route modules
│   ├── services/                # Business logic layer
│   ├── pipelines/               # Pipeline stage modules
│   │   ├── adapters/            # Trimmomatic adapter FASTAs
│   │   └── reference/           # Chrom sizes, blacklists
│   ├── worker.py                # Job queue worker
│   ├── migrations/              # Alembic
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── components/          # Shared UI components
│   │   ├── pages/               # Route-level components
│   │   ├── hooks/               # Custom hooks (useSSE, etc.)
│   │   ├── api/                 # API client functions
│   │   └── lib/                 # Utilities
│   └── vite.config.ts
├── docker-compose.yml
├── instance-setup.sh            # One-time EC2 provisioning
├── nginx/                       # NGINX config
└── CLAUDE.md
```

### The mock/real pipeline boundary is important to get right early

The `PIPELINE_MODE=mock` concept in the architecture doc is critical. During local development, pipeline modules return canned results after a 2-second sleep. This means:

1. You need representative mock output files (a tiny BAM, a tiny bigWig, a sample QC JSON) to develop the frontend against.
2. The mock output structure must exactly match what the real pipeline produces — same filenames, same directory layout, same QC data schema.
3. **This means you need to define the QC data schema before writing either the pipeline or the frontend.** I'd suggest defining a `QCReport` Pydantic model for alignment QC and peak calling QC early on, then having both the mock pipeline and the real pipeline produce data conforming to that schema.

**Outstanding question:** Can you export the QC data from your actual CUTANA Cloud test run? If you can download the CSV files from the QC reports, those become your ground-truth mock data.

### The tus upload implementation needs a decision

The architecture doc says "tus protocol" for chunked resumable uploads. There are two Python approaches:

1. **tusd** — a standalone Go binary that handles the tus protocol, stores files to disk, and sends webhook notifications to your backend when uploads complete. You'd run it as a separate process alongside FastAPI.
2. **Python-native** — implement tus endpoints directly in FastAPI using a library like `tus-py` or roll your own (the tus protocol is well-specified).

**My recommendation:** Use **tusd** as a standalone process. It's battle-tested for exactly this use case (multi-GB file uploads), handles the tricky parts (chunking, resumption, cleanup of abandoned uploads), and sends a simple POST hook to your FastAPI backend when a file is done. Your FastAPI backend never touches raw upload bytes — it just receives "file X is done, it's at path Y" and proceeds to register it in the DB and kick off FastQC. This is simpler and more robust than implementing tus in Python.

**Outstanding question:** Are you comfortable running a Go binary (tusd) on the instance? It's a single static binary, no Go runtime needed. Alternative: just use regular multipart upload with a large `client_max_body_size` in NGINX and accept that uploads aren't resumable. For a lab with decent internet, this might be fine for files under 1–2 GB.

### SSE implementation detail

The architecture doc says SSE for real-time updates. FastAPI supports SSE via `StreamingResponse` with `text/event-stream` content type. The pattern is:

1. Worker updates `analysis_jobs.status` in PostgreSQL.
2. Worker issues `NOTIFY job_status_update, '{job_id}'` on the PG channel.
3. FastAPI's SSE endpoint uses `asyncpg` to `LISTEN job_status_update`.
4. When a notification arrives, SSE pushes it to the connected client.
5. The frontend's TanStack Query cache invalidates the relevant query key.

**Outstanding question:** Have you used PostgreSQL `LISTEN/NOTIFY` before? An alternative that's simpler but slightly less real-time: the SSE endpoint polls the DB every 2 seconds. For a lab tool with 8–10 users, polling is perfectly fine. `LISTEN/NOTIFY` is more elegant but adds asyncpg complexity.

---

## Files and Data You Need to Collect Before We Start Coding

Here's the concrete checklist of things to gather:

### Must-have for Phase 1 (can start without bioinformatics data)
Nothing external needed — it's all React/FastAPI/PostgreSQL.

### Must-have for Phase 2 (Data Management)
- [ ] **Adapter FASTA files** — already secured per the architecture doc. Confirm they're in your local filesystem somewhere.
- [ ] **kseq_test binary** — either copy from lab instance or compile from CUTRUNTools source.
- [ ] **Sample FASTQ files for testing** — a small subset (e.g., downsample your test experiment to 100K reads per file) so we can test upload, FastQC, and trimming without waiting an hour.

### Must-have for Phase 3 (Core Pipeline)
- [ ] **Bowtie2 indices** for mm10 and hg38 at minimum. Download or copy from lab instance.
- [ ] **E. coli K12 MG1655 Bowtie2 index.** Download from NCBI + build, or find pre-built.
- [ ] **Chromosome sizes files** for mm10, hg38, E. coli. (I'll include these in the repo.)
- [ ] **ENCODE DAC Exclusion List BED files** for mm10 and hg38. (I'll include these in the repo.)
- [ ] **Gene annotation BED/GTF files** for TSS and gene body heatmaps (mm10, hg38). Source: UCSC or GENCODE.
- [ ] **SNAP-CUTANA barcode FASTA** — if spike-in QC is a priority. Otherwise defer.

### Must-have for Phase 4 (Peak Calling)
- [ ] **SEACR script** — download from GitHub, pin version.
- [ ] **HOMER genome installations** — `configureHomer.pl -install mm10`, etc.

### Must-have for Phase 6 (Lab Extensions)
- [ ] **diffbind.R** and **diffbind_peaklist.R** scripts from the lab instance.
- [ ] **normalization.r** and **input_normalization.r** from the lab instance.
- [ ] **peak_extractor.r** and **pearson.py** from the lab instance.
- [ ] **heatmapjai.sh** from the lab instance (to understand custom heatmap params).

---

## Additional Architecture Questions and Implications

### How does the IgG control flow actually work?

The peak calling wizard lets users assign an IgG control to each target reaction. But there's a subtlety: the IgG BAM is used as the `-c` (control) argument to MACS2/SEACR. This means:

1. The IgG reaction must be aligned in the *same alignment run* as the target reactions (or at least produce a BAM in the same reference genome).
2. The peak calling wizard's "IgG Control FASTQ Prefix" dropdown should only show reactions from the selected alignment run that are plausibly IgG controls.

**Question for you:** How does the lab determine which reaction is the IgG? By the short name containing "IgG"? By a metadata field? In CUTANA Cloud, it seems to be done manually via the dropdown. I think we should add a `is_control` boolean to the `reactions` table, or an `antibody_type` field with values like `IgG`, `target`, etc. This makes it easy to auto-populate the IgG dropdown.

### How does the pipeline handle the IgG reaction in peak calling?

Looking at the CUTANA Cloud QC screenshots, the IgG reaction *is included* in peak calling output (it appears in the peak annotation bar chart). But peak calling on IgG against itself doesn't make biological sense — it's used as the control for *other* reactions. What does CUTANA Cloud actually do with the IgG reaction in peak calling? Does it:
- (a) Call peaks on IgG using itself as control (meaningless but included for completeness)?
- (b) Skip peak calling on IgG but include it in the QC report for comparison?
- (c) Something else?

This affects the peak calling pipeline module design. We need to know whether to run MACS2 on the IgG reaction or not.

### How are multi-lane FASTQs handled?

The lab pipeline spec mentions concatenating multi-lane FASTQs with `cat`. The architecture doc doesn't address this. If a sample was sequenced across 4 lanes, you get 8 files (4 × R1 + 4 × R2) instead of 2. The FASTQ prefix alone won't be enough to identify which files belong together.

**Question:** Has the lab ever uploaded multi-lane FASTQs to CUTANA Cloud? If so, did they concatenate first, or does CUTANA Cloud handle it? My guess: they concatenate before upload. For the clone, I'd add a "Merge Lanes" utility in the FASTQs tab that detects multi-lane files and concatenates them server-side.

### What happens when alignment fails?

The architecture doc has status values (`queued`, `running`, `complete`, `error`, `terminated`) but doesn't describe error recovery. If Bowtie2 segfaults halfway through:
- Do we save partial output?
- Can the user retry from where it left off, or does it restart from scratch?
- How do we report *which* reaction failed if 5 reactions are being aligned?

**My recommendation:** Pipeline stages should process reactions sequentially within a job. If reaction 3 of 5 fails, reactions 1–2 are complete and their outputs are saved. The job status is `error` with an `error_message` indicating which reaction failed. The user can fix the issue and re-run a new job with only the failed reactions.

### Frontend routing: experiment tabs vs. sub-routes

The architecture doc lists routes like `/experiments/:id/alignment/:jid` but the CUTANA Cloud UI uses a left sidebar with tab navigation. These can be reconciled: each tab *is* a route, and clicking a tab navigates the URL while the sidebar visually updates. This means:

- Deep-linking works (you can share a URL to a specific QC report).
- Browser back/forward works naturally.
- The tab state is URL-driven, not React state.

Use React Router's nested routes with an `<Outlet>` in the experiment layout component.

### The "New Analysis" dropdown pattern

CUTANA Cloud's "NEW ANALYSIS" button has a dropdown with "Alignment" and "Peak Calling". As we add more analysis types (DiffBind, custom heatmaps, correlation), this dropdown grows. The wizard pattern (multi-step modal) should be abstracted early — a generic `WizardModal` component that takes a list of step components and handles navigation, validation, and submission.

### Storage monitoring

The architecture doc mentions a nightly cron job for retention policies but doesn't describe storage monitoring on the frontend. CUTANA Cloud shows "PROJECT SIZE: 53.2 GB" on the project detail page. We should track:
- Per-experiment storage (sum of all file sizes).
- Per-project storage (sum of experiments).
- Instance-level storage (disk usage of `/data/cleave/`).

Add a `storage_bytes` column to `experiments` and `projects` tables, updated by a periodic task or after each job completion.

---

## Summary of Outstanding Questions for You

Grouped by priority:

### Before starting Phase 1 (ask now)
1. **Can you export QC data (CSVs) from your CUTANA Cloud test run?** This becomes our mock data and ground-truth schema.
2. **Tusd (standalone Go binary) vs. Python-native tus vs. plain multipart upload** — which approach for file uploads?
3. **PG LISTEN/NOTIFY vs. simple polling** for SSE updates — how comfortable are you with asyncpg?

### Before starting Phase 3 (ask soon)
4. **Does the lab instance have pre-built Bowtie2 indices for hg38, E. coli, dm6, sacCer3?** If yes, scp them. If no, we build from scratch.
5. **What gene annotation BED file does the lab use for heatmaps?** RefSeq? GENCODE? Which version?
6. **What ENCODE blacklist version does the lab use?** v1 or v2?
7. **Is the kseq_test fixed-length trim step actually necessary?** Ask Cole. If not, we simplify the trimming pipeline.
8. **Is SNAP-CUTANA spike-in QC a priority?** If yes, you need the barcode FASTA. If no, defer.

### Before starting Phase 6 (collect scripts)
9. **Get copies of:** `diffbind.R`, `diffbind_peaklist.R`, `normalization.r`, `input_normalization.r`, `peak_extractor.r`, `pearson.py`, and `heatmapjai.sh` from the lab instance.
10. **DiffBind output columns** — do "Conc_mut" and "Conc_ctrl" always use those exact strings, or are they dynamic based on the condition names?

### Architecture clarifications
11. **IgG control handling in peak calling** — does the pipeline run peak calling on IgG itself, or just use it as the `-c` control for targets?
12. **Multi-lane FASTQ strategy** — concatenate before upload, or handle in-app?
13. **Do you want the domain setup (Cloudflare + coleferguson.com) done now, or truly at the end?** DNS propagation takes time, and it's nice to have HTTPS working early.

---

**History**: Complete pre-build audit of the Cleave project. Reviewed all 6 documentation files (CUTANA Cloud docs, lab pipeline spec, CUTANA Cloud info, architecture plan, UI reference, CLAUDE.md). Identified all external data dependencies (reference genomes, blacklists, gene annotations, spike-in sequences, adapter files, tool binaries), catalogued outstanding questions grouped by implementation phase, and analyzed architectural implications (IgG control flow, multi-lane FASTQs, error recovery, SSE implementation, tus upload strategy, mock pipeline data schema).

**Source Tree**:
- 💾 cutana-cloud-docs.md (platform documentation)
- 💾 cf-lab-pipeline-spec.md (lab pipeline specification)
- 💾 cutana-cloud-info.md (platform details + todos)
- 💾 cutana-architecture-plan.md (architecture plan)
- 💾 cutana-cloud-ui.md (UI reference)
- 💾 CLAUDE.md (project conventions)

**Next Task**: Answer the 13 outstanding questions above, then scaffold the monorepo structure (Phase 1 foundation: FastAPI project, React Vite project, Docker Compose, Alembic migrations, initial DB schema).