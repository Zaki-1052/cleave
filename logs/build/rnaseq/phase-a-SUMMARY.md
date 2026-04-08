# Phase A Summary — RNA-seq Infrastructure + fastp Trimming

> 4 sessions on 2026-04-07. Phase A is **complete**. All 9 done criteria checked off. 20 new tests (568 total).

---

## What Was Built

### Schema + Config Changes (A.1)
- Added `RNA-seq` as third assay type (`AssayType` enum + `AssayTypeValue` Literal, alongside `CUT&RUN` and `CUT&Tag`).
- 4 nullable columns on `reactions` table: `treatment`, `timepoint`, `genotype`, `replicate_number`. Backwards-compatible — CUT&RUN/CUT&Tag reactions ignore them.
- Updated `ReactionCreate`, `ReactionRead`, `ReactionUpdate` Pydantic schemas with new fields. CSV header mappings and template headers extended. `replicate_number` parsed as integer from CSV imports.
- 3 new config settings: `STAR_INDEX_DIR`, `SALMON_INDEX_DIR`, `GENCODE_GTF_DIR` (for Phase B).
- Alembic migration `be082d72cc1c` (4 nullable columns on reactions).
- Frontend: `Reaction` / payload types updated in `types.ts`, `'RNA-seq'` added to `ASSAY_TYPES` constant.
- Bug fixes: FastQC notification insert wrapped in try/except (matching auto-pipeline pattern); removed unused `Path` import in `test_local_import.py`.

### Conditional Sidebar + Analysis Dropdown (A.2)
- Split `ExperimentView.tsx` sidebar into `CUTANDRUN_TABS` (12 tabs) and `RNASEQ_TABS` (10 tabs), selected by `experiment.assayType`.
- RNA-seq sidebar: Description, FASTQs, Reactions, Trimming, Alignment, DE Analysis, QC Dashboard, Pathway, History, All Files. Hidden for RNA-seq: Peak Calling, DiffBind, Normalization, Heatmaps, Correlation.
- `NewAnalysisDropdown` accepts `assayType` prop — RNA-seq shows 5 disabled analysis items (Alignment STAR, featureCounts, DE Analysis, QC Dashboard, Pathway); CUT&RUN shows existing 6.
- Hidden auto-pipeline button, banner, and all CUT&RUN wizard modals for RNA-seq experiments.
- Split `ReactionsEditor` optional columns: `CUTANDRUN_OPTIONAL_COLUMNS` (12) and `RNASEQ_OPTIONAL_COLUMNS` (8: treatment, timepoint, genotype, replicateNumber + shared cell/sample fields). `ReactionFormModal` hides CUTANA spike-in sections for RNA-seq, shows RNA-seq fields in "More Fields".
- Placeholder routes in `App.tsx` for `de/:jid`, `rnaseq-qc/:jid`, `pathway/:jid`. `PlaceholderTab.tsx` shared component for future tab pages.
- Hidden Pipeline step (step 4) in `CreateExperimentWizard` for RNA-seq experiments.
- RNA-seq job type labels added to `JOB_TYPE_LABELS`.

### fastp Trimming Pipeline Stage (A.3)
- Created `backend/pipelines/rnaseq_trimming.py` — `RnaseqTrimmingStage(PipelineStage)` with fastp adapter + quality trimming for RNA-seq paired-end FASTQs (~390 lines).
- Frozen dataclass `_RnaseqTrimmingContext` + module-level `_process_pair()` worker function (same ThreadPoolExecutor concurrency pattern as CUT&RUN `trimming.py`).
- fastp command: `--detect_adapter_for_pe`, `--qualified_quality_phred 20`, `--length_required 25`, `--cut_front`, `--cut_tail`, `--cut_window_size 4`, `--cut_mean_quality 15`.
- fastp HTML/JSON reports collected via `_collect_fastp_reports()` helper, returned as `fastp_reports` key in result dict. Temp keys stripped before returning to worker.
- Registered `"rnaseq_trimming": RnaseqTrimmingStage()` in `backend/pipelines/__init__.py`.
- Worker routing updated: `job_type in ("trimming", "rnaseq_trimming")` routes to `create_trimmed_fastq_records` (reused without modification); fastp reports persisted via `persist_job_outputs`.
- 14 tests in `test_rnaseq_trimming_pipeline.py`: 5 validation, 3 mock run, 2 methods text, 4 concurrency.

### RNA-seq Trimming Tab + Tests (A.4-A.5)
- Made `TrimmingTab.tsx` assay-type aware: RNA-seq experiments filter by `rnaseq_trimming` job type, CUT&RUN by `trimming`.
- Added "Reports" sub-tab for RNA-seq trimming (between Info and Files) with fastp HTML report viewer.
- Created `FastpReportModal.tsx` — iframe-based HTML report viewer using job output signed URLs (mirrors `FastqcReportModal` pattern, adds `allow-scripts` sandbox for fastp's interactive charts).
- Created `FastpReportsPanel.tsx` — DataTable listing fastp HTML reports with "View Report" button.
- Extended `TrimmingFilesPanel.tsx` with optional `categories` prop (non-breaking). Added `RNASEQ_TRIMMING_FILE_CATEGORIES` constant (trimmed_fastq, fastp_html, fastp_json).
- Adapted `TrimmingInfoPanel` for RNA-seq: hides "Adapter File" (fastp auto-detects), shows Quality Phred and Min Length params.
- Updated `AnalysisQueuePage.tsx`: added `rnaseq_trimming` to `JOB_TYPE_OPTIONS` and `JOB_TYPE_TO_TAB`.
- 6 API tests: 1 experiment test (`test_create_rnaseq_experiment_success`), 5 reaction tests (create with RNA-seq fields, update, CSV import with integer `replicate_number`, bulk create, CUT&RUN backward compatibility). Test helpers: `_create_rnaseq_experiment()`, `_rnaseq_reaction_body()`.

---

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Assay type integration | Third `assay_type` value, not separate model | Reuses project/experiment/reaction model; sidebar and UI adapt based on assay type |
| RNA-seq reaction fields | 4 nullable columns on existing `reactions` table | Backwards-compatible; CUT&RUN reactions ignore them. No new table needed |
| Trimmer | fastp (not Trimmomatic) | Modern, faster, auto-detects adapters, no adapter FASTA needed. kseq 42bp fixed-length would destroy RNA-seq data |
| No kseq step | Omitted entirely | Fixed-length trimming is CUT&RUN-specific (sub-nucleosomal fragments); RNA-seq reads must retain variable lengths |
| fastp reports | Persisted as job outputs (`fastp_html`, `fastp_json`) | HTML reports need `allow-scripts` sandbox (interactive charts); JSON reports enable future programmatic QC parsing |
| Trimmed record creation | Reuse `create_trimmed_fastq_records` from CUT&RUN | Output dict shape is identical (prefix, r1_path, r2_path, r1_filename, r2_filename, sizes, ids) — no modification needed |
| Sidebar split | Two constant arrays selected by `assayType` | Clean separation; no runtime conditionals per tab. RNA-seq hides 5 CUT&RUN-specific tabs, adds 3 RNA-seq-specific tabs |
| RNA-seq analysis dropdown | All items disabled | Wizard components don't exist until Phase B/C. Items enabled as each phase lands |
| Shared TrimmingTab | Reused with assay-type conditional | Same route `trimming/:jid` serves both CUT&RUN and RNA-seq; avoids duplicating the tab component |
| fastp iframe sandbox | `allow-same-origin allow-scripts` | fastp HTML reports contain interactive JavaScript charts (unlike FastQC which is static HTML) |
| Config settings | Added now, used in Phase B | `STAR_INDEX_DIR`, `SALMON_INDEX_DIR`, `GENCODE_GTF_DIR` prepared for STAR+Salmon alignment stage |
| No new validators | Free-form text for treatment/timepoint/genotype | No known constraints on these fields; `replicate_number` validated as integer |

---

## API Status After Phase A

### Unchanged from Phase 12
No new API endpoints in Phase A. All changes are to existing endpoints (new reaction fields accepted/returned) and pipeline infrastructure (new job type dispatched by worker).

### New Job Type
- `rnaseq_trimming` — dispatched to `RnaseqTrimmingStage`, routed to existing `create_trimmed_fastq_records` post-pipeline hook, fastp reports persisted via `persist_job_outputs`.

### Reaction Endpoints Updated
- `POST /experiments/:id/reactions` — now accepts `treatment`, `timepoint`, `genotype`, `replicate_number` fields
- `POST /experiments/:id/reactions/bulk` — same new fields
- `POST /experiments/:id/reactions/import-csv` — CSV headers mapped for new fields, `replicate_number` parsed as integer
- `GET /experiments/:id/reactions/template` — template CSV includes new headers
- `PATCH /experiments/:id/reactions/:rid` — new fields updatable
- `GET /experiments/:id/reactions` — new fields returned in response

### Still Stub/Disabled (Phase B+)
- RNA-seq alignment (STAR + Salmon) — dropdown item disabled
- featureCounts — dropdown item disabled
- DE Analysis (DESeq2) — dropdown item disabled, placeholder route exists
- RNA-seq QC Dashboard (RSeQC + MultiQC) — dropdown item disabled, placeholder route exists
- Pathway Analysis (clusterProfiler) — dropdown item disabled, placeholder route exists

---

## Database Schema Changes (1 migration in Phase A)

5 total migrations (4 from Phases 1-2 + 1 from Phase A):

| Migration | Description |
|-----------|-------------|
| `bce0e9c5d2ee` | Initial schema (9 tables) |
| `fafd5c9dc468` | fastapi-users auth columns |
| `35ad430891c0` | Add `fastqc_report_path` to fastq_files |
| `87e85de24803` | Add `adapter_status` to fastq_files |
| ... | _(Phases 3-12 migrations omitted for brevity — see MASTER-SUMMARY.md)_ |
| **`be082d72cc1c`** | **Add `treatment`, `timepoint`, `genotype`, `replicate_number` to reactions** |

Total across all phases: 14 Alembic migrations.

---

## Test Coverage

| Test File | New in A | Total | Scope |
|-----------|----------|-------|-------|
| `test_rnaseq_trimming_pipeline.py` | **14** | 14 | Validation (5), mock run (3), methods text (2), concurrency (4) |
| `test_experiments.py` | **1** | 11 | RNA-seq experiment creation |
| `test_reactions.py` | **5** | 36 | RNA-seq fields: create, update, CSV import, bulk create, backward compat |
| **Phase A Total** | **20** | | |
| **All Phases Cumulative** | | **568** | |

All tests run inside Docker (`docker compose exec api pytest tests/`). `ruff check` + `ruff format --check`: clean. `npm run build`: clean.

---

## New Files Created in Phase A

### Backend Pipeline Modules
- `backend/pipelines/rnaseq_trimming.py` — fastp trimming pipeline stage (~390 lines)

### Backend Schema/Config
- `backend/migrations/versions/be082d72cc1c_add_rnaseq_reaction_fields.py` — 4 nullable columns on reactions

### Frontend Components
- `frontend/src/components/trimming/FastpReportModal.tsx` — iframe-based fastp HTML report viewer (~95 lines)
- `frontend/src/components/trimming/FastpReportsPanel.tsx` — DataTable of fastp HTML reports (~100 lines)
- `frontend/src/pages/experiment/PlaceholderTab.tsx` — shared placeholder for future RNA-seq tab pages

### Backend Tests
- `backend/tests/test_rnaseq_trimming_pipeline.py` — 14 tests (~240 lines)

### Files Significantly Modified
- `backend/schemas/common.py` — `AssayType` enum expanded
- `backend/schemas/experiment.py` — `AssayTypeValue` Literal expanded
- `backend/models/reaction.py` — 4 new columns
- `backend/schemas/reaction.py` — 3 schema classes updated
- `backend/services/reaction_service.py` — CSV header map + template + integer parsing
- `backend/config.py` — 3 new settings (STAR_INDEX_DIR, SALMON_INDEX_DIR, GENCODE_GTF_DIR)
- `backend/pipelines/__init__.py` — stage registration
- `backend/worker.py` — routing for `rnaseq_trimming` job type
- `backend/services/fastqc_service.py` — notification try/except fix
- `frontend/src/pages/ExperimentView.tsx` — split TABS, conditional sidebar + wizard modals
- `frontend/src/components/experiments/NewAnalysisDropdown.tsx` — assayType-aware menu
- `frontend/src/components/reactions/ReactionsEditor.tsx` — split optional columns
- `frontend/src/components/reactions/ReactionFormModal.tsx` — RNA-seq form fields + hidden CUT&RUN fields
- `frontend/src/components/experiments/CreateExperimentWizard.tsx` — Pipeline step hidden for RNA-seq
- `frontend/src/pages/experiment/TrimmingTab.tsx` — assay-type awareness (job filter, sub-tabs, info panel)
- `frontend/src/components/trimming/TrimmingFilesPanel.tsx` — optional `categories` prop
- `frontend/src/pages/AnalysisQueuePage.tsx` — `rnaseq_trimming` in type filter + navigation map
- `frontend/src/App.tsx` — 3 new placeholder routes
- `frontend/src/api/types.ts` — 3 interfaces updated
- `frontend/src/lib/constants.ts` — `ASSAY_TYPES` expanded, `RNASEQ_TRIMMING_FILE_CATEGORIES` added
- `backend/tests/test_experiments.py` — 1 new test
- `backend/tests/test_reactions.py` — 5 new tests + 2 helpers

---

## Known Issues / Tech Debt

### Resolved in Phase A
- ~~FastQC notification insert could throw and skip auto-pipeline hook~~ -> wrapped in try/except (matching convention)
- ~~Unused `Path` import in `test_local_import.py`~~ -> removed

### Still Open
- RNA-seq analysis dropdown items are all disabled — will be enabled as Phase B and C land
- Auto-pipeline button and banner hidden for RNA-seq (RNA-seq auto-pipeline is Phase B)
- fastp binary must be available on EC2 (`conda install -c bioconda fastp`)
- No validation on `treatment`/`timepoint`/`genotype` field values (free-form text)
- STAR/Salmon indices must be pre-built on EC2 before Phase B (each ~30GB, ~1hr to build)
- `sjdbOverhang` hardcoded at 101 in reference scripts — should be `read_length - 1`, configurable (Phase B)

---

## Dependencies Added in Phase A

| Package | Version | Purpose |
|---------|---------|---------|
| fastp | (system/conda) | RNA-seq adapter + quality trimming (called via subprocess) |

No new Python pip or npm packages. fastp is an external binary resolved via `shutil.which("fastp")`.

---

## Pipeline Stage Registry After Phase A

```python
_STAGES = {
    "trimming": TrimmingStage(),                    # CUT&RUN: Trimmomatic + kseq
    "rnaseq_trimming": RnaseqTrimmingStage(),       # RNA-seq: fastp (NEW)
    "alignment": AlignmentStage(),                  # CUT&RUN: Bowtie2 13-step
    "peak_calling": PeakCallingStage(),             # CUT&RUN: MACS2/SICER2/SEACR
    "diffbind": DiffBindStage(),                    # CUT&RUN: DiffBind R
    "custom_heatmap": CustomHeatmapStage(),         # deepTools heatmaps
    "pearson_correlation": PearsonCorrelationStage(),# R + Python correlation
    "roman_normalization": RomanNormalizationStage(),# Mouse-only normalization
}
```

---

## What's Next: Phase B (Core Pipeline)

STAR splice-aware alignment + Salmon pseudo-alignment quantification + BigWig generation as a single pipeline step. RNA-seq alignment QC report (STAR metrics + Salmon metrics). Alignment wizard UI (3 steps). IGV visualization of RNA-seq BAMs/BigWigs. Auto-pipeline chain for RNA-seq: FastQC -> fastp -> STAR+Salmon. See `docs/RNASEQ-PLAN.md` Phase B for full spec.

Key prerequisites:
- fastp trimming pipeline working (Phase A, complete)
- STAR + Salmon + samtools + bamCoverage (deepTools) available on EC2
- Pre-built STAR indices at `/data/cleave/genomes/star/{mm10,hg38}/`
- Pre-built Salmon indices at `/data/cleave/genomes/salmon/{mm10,hg38}/`
- GENCODE GTF files at `/data/cleave/genomes/gtf/`
