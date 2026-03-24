# Cleave -- Action Items

Things that need to be done by **you** (Zakir) before or during development. Grouped by when they block progress.

---

## Before Phase 1 (do now)

Nothing blocking from you. Phase 1 is pure web app (React + FastAPI + Postgres + auth + CRUD). No bioinformatics dependencies.

### Phase 1 scaffolding checklist (for Claude to handle)

These are infrastructure patterns to bake into the scaffold. Not things you need to do manually.

- [x] Create `.env.example` with full env var inventory
- [x] Standardized API error response: `ErrorResponse` in `schemas/common.py`
- [x] Pagination response envelope: `PaginatedResponse[T]` in `schemas/common.py`
- [x] CORS middleware in FastAPI (`main.py`)
- [x] Refresh token as httpOnly cookie with `SameSite=Lax` (`routers/auth.py`)
- [x] Axios client with interceptors (`api/client.ts`)
- [x] Python `logging` + `structlog` for structured JSON logging (`logging_config.py`)
- [ ] QC report Pydantic schemas — deferred to Phase 3 per scaffold-prompt.md
- [ ] Rate limiting setup — add `slowapi` to backend deps, apply to `/api/v1/auth/login` (5/min) and `/api/v1/auth/register` (3/min)
- [x] No password reset flow in Phase 1 -- fastapi-users includes `get_reset_password_router()` but it requires SES email transport. **Deferred to Phase 3**, not permanently skipped. Enable when SES is configured.

---

## Before Phase 2 (data management)

- [x] ~~Create test FASTQs~~ -- Done. `test_data/test_R1.fastq.gz` + `test_R2.fastq.gz` (100K reads from K4me3_ctrl1, ~5MB each)
- [x] ~~Compile kseq_test for Mac~~ -- Done. `references/cutruntools/kseq_test_mac` (arm64)

---

## Before Phase 3 (core pipeline)

### You need to export from CUTANA Cloud

- [x] ~~Alignment stats CSV~~ -- Done. `cutana/H3K4me3/Mouse mm10_alignment_metrics.csv`

### You need to download (for EC2 deployment, not local dev)

- [ ] **Bowtie2 indices** -- scp from lab instance (saves hours vs rebuilding):
  ```bash
  scp -i 210323.pem ubuntu@<ec2>:/home/ubuntu/cutruntools/assemblies/chrom.mm10/mm10*.bt2 /data/cleave/genomes/mm10/
  scp -i 210323.pem ubuntu@<ec2>:/home/ubuntu/cutruntools/assemblies/chrom.hg38/hg38*.bt2 /data/cleave/genomes/hg38/
  scp -i 210323.pem ubuntu@<ec2>:/home/ubuntu/cutruntools/assemblies/chrom.ecoli/ecoli*.bt2 /data/cleave/genomes/ecoli/
  ```

- [ ] **Gene annotation BEDs** for TSS/gene body heatmaps (mm10 + hg38). Two options:
  - UCSC Table Browser: assembly > track "NCBI RefSeq" > table "refGene" > output BED
  - GENCODE GTFs: gencodegenes.org (mm10 Release M25, hg38 Release 44)

- [ ] **HOMER genome data** (on EC2 instance):
  ```bash
  perl configureHomer.pl -install mm10
  perl configureHomer.pl -install hg38
  ```

### Phase 3 implementation tasks (for Claude)

- [ ] Set up Amazon SES for job completion email notifications
- [ ] Define QC report Pydantic schemas from exported CUTANA Cloud CSVs

### Consider supplementing

- [ ] **hg38 blacklist** -- The lab's `references/cutruntools/hg38.blacklist.bed` has only 38 entries (unusually small). Consider downloading Boyle Lab v2 (`hg38-blacklist.v2.bed.gz`, ~910 entries) from https://github.com/Boyle-Lab/Blacklist as a more comprehensive alternative.

---

## Before Phase 6 (lab extensions)

Nothing to collect -- all lab scripts are already in `references/`. But when you implement DiffBind, note:
- [ ] **Fix DiffBind R script bugs** before porting (3 bugs documented in `docs/cleave-spec-decisions.md` section 4)

---

## Already done (for reference)

These were listed as outstanding in the old questions doc but are now resolved:

- [x] Adapter FASTAs -- all 4 in `references/cutruntools/adapters/`
- [x] Blacklist BEDs -- mm10, hg38, hg19 in `references/cutruntools/`
- [x] Chromosome sizes -- mm10, hg38, hg19, ecoli in `references/cutruntools/assemblies/`
- [x] SEACR script -- v1.1 in `references/cutruntools/SEACR_1.1.sh`
- [x] kseq_test source -- `references/cutruntools/kseq_test.c` + build script
- [x] K-MetStat barcode sequences -- all 32 in `references/media_misc/k_metstat_script.sh`
- [x] DiffBind scripts -- `references/DPA/diffbind.R`, `diffbind_peaklist.R`, `diffbind_peaklist_edgeR.R`
- [x] Roman normalization -- `references/media_normalization/normalization.r`
- [x] Pearson correlation -- `references/media_pearson_corr/peak_extractor.r` + `pearson.py`
- [x] Heatmap script -- `references/genomewide_plots/heatmaps.sh`
- [x] Peak calling QC CSVs -- `cutana/H3K4me3/peak_caller_metrics.csv`, `top_called_peaks.csv`, etc.
- [x] Peak calling input config -- `cutana/H3K4me3/H3K4me3-peak-calling.csv`
- [x] Reactions metadata -- `cutana/H3K4me3/H3K4me3-reactions.csv`
- [x] FastQC reports -- `cutana/fastqc/` (10 HTML + 10 TXT)
- [x] Methods text -- `cutana/H3K4me3/methods.txt`
- [x] Conda env specs -- 27 YAML files in `references/conda_envs/`
