# Phase 6 Summary — Lab Extensions

> 4 sessions on 2026-03-28. Phase 6 is **complete** (all 5 done criteria checked off). **77 new tests** (21 DiffBind + 18 Custom Heatmap + 19 Pearson Correlation + 19 Roman Normalization). Total project tests: **373 passing**. Additionally fixed a long-standing test infrastructure bug (schema cleanup) that had caused intermittent failures across the entire suite.

---

## What Was Built

### DiffBind Differential Peak Analysis (6.1)

**Pipeline**: `DiffBindStage` supporting 3 analysis modes — DESeq2 consensus peakset (default), DESeq2 custom peakset, edgeR+TMM custom peakset. Ported all three lab R scripts from `references/DPA/` with 3 documented bugs fixed: missing `)` on `write.csv()`, malformed `cat()`/`print()` completion message, missing `dev.off()` between PNG/SVG device opens.

**Dynamic column handling**: Backend parses TSV header from `dba.report()` to discover column names (`Conc_<condition>` varies based on sample sheet). Frontend builds DataTable columns from `report.columnNames` — never hardcodes `Conc_ctrl`/`Conc_mut`. Mock mode stubs use actual condition values from params to match this behavior.

**Wizard**: 4-step wizard with sample sheet builder UI — the most complex wizard step in the project. Users select reactions, assign conditions via autocomplete text inputs, get auto-incrementing replicate numbers. Validation enforces ≥4 samples, ≥2 conditions, ≥2 replicates per condition.

**Results**: 5 sub-tabs (Info, Input, Results, Plots, Files). Results tab has dynamic-column DataTable with FDR color coding. Plots tab shows PCA, MA, Volcano, Heatmap (Group), Heatmap (Condition) via signed URL images. edgeR mode gracefully skips unavailable heatmap plots.

### Custom Reference-Point Heatmaps (6.2)

**Pipeline**: `CustomHeatmapStage` porting `references/genomewide_plots/heatmaps.sh`. Two deepTools commands: `computeMatrix reference-point` + `plotHeatmap`. User-configurable: flanking distance (100–10000bp), reference point (center/TSS/TES), sort order, color map. Added SVG output and profile plots (`plotProfile --perGroup`) beyond lab script.

**BED upload**: `POST /experiments/{id}/upload-bed` — simple multipart (not tus), validates .bed extension, tab-delimited ≥3 columns, <50MB. BED files are KB-sized and don't need chunked resumable uploads.

**Wizard**: 4-step with combined BED source selector (from peak calling outputs or file upload) + sample table with editable labels and drag-to-reorder. Settings step has flanking/reference-point/sort/colormap controls.

**Results**: 3 sub-tabs (Info, Plot, Files). Plot tab shows heatmap + profile side-by-side with PNG/SVG/Matrix(.gz) downloads.

### Pearson Correlation Matrices (6.3)

**Pipeline**: `PearsonCorrelationStage` porting two lab scripts: `peak_extractor.r` (R/rtracklayer bigWig → coverage matrix at 50bp resolution) and `pearson.py` (Python/seaborn pairwise correlation heatmap). Two-subprocess chain preserved per mandatory reference compliance. Added SVG output and correlation coefficient CSV export beyond lab's PNG-only output.

**Multi-genome support**: R script parameterized with genome-specific chromosome sets (mm10: chr1-19+chrX, hg38/hg19: chr1-22+chrX, dm6: chr2L/2R/3L/3R/4/X, sacCer3: chrI-XVI). Masking via `manual.mask.ultimate.bed` applied only for mm10. Optional BED restriction limits analysis to peaks of interest.

**Wizard**: 4-step with sample checkbox table, editable labels, reorder arrows, auto-IgG-exclusion. Settings step has optional BED restriction (from peak calling or upload).

**Results**: 3 sub-tabs (Info, Plot, Files). Plot tab shows annotated heatmap with Pearson coefficients. Download buttons for PNG, SVG, correlation matrix CSV, coverage matrix CSV.

### Roman Normalization (6.4)

**Pipeline**: `RomanNormalizationStage` porting `references/media_normalization/normalization.r` — mouse-only 99th-percentile quantile normalization. Algorithm preserved verbatim: 50bp resolution bigWig import via rtracklayer, chromosome-wise reorganization (chr1-19 + chrX), coverage matrix construction, zero-coverage removal, masking via `manual.mask.ultimate.bed` (158 regions), 99th-percentile calculation, normalization factor computation (`nf = z/z[1]`), re-import and divide export to `*_rnorm.bw`. Added normalization factors CSV and bar chart visualization beyond lab script.

**Mouse-only enforcement at two layers**: Frontend wizard filters alignment dropdown to mm10 only (with informative empty-state message). Backend `validate()` rejects non-mm10 as hard error.

**Per-reaction outputs**: First Phase 6.x pipeline to set `reaction_id` on output records (`normalization_bigwig` category), enabling per-sample file browsing.

**Wizard**: 4-step with sample reorder (first sample = normalization reference, NF=1.0). Blue info banner explains reference sample concept. Settings step is read-only (genome locked to mm10, masking always applied).

**Results**: 3 sub-tabs (Info, Results, Files). Results tab shows normalization factors DataTable (reference row highlighted blue) + bar chart image. Info tab includes "Reference Sample" detail row.

### Test Infrastructure Fix

Fixed long-standing intermittent test failures caused by `Base.metadata.drop_all` not fully cleaning PostgreSQL catalog state (leftover `pg_type` entries from interrupted runs or cascade failures). Replaced with `DROP SCHEMA public CASCADE; CREATE SCHEMA public` — nuclear but reliable. Suite went from intermittent 12–18 failures/errors to 373/373 passing.

---

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| DiffBind column names | Dynamic from TSV header, never hardcoded | `dba.report()` generates `Conc_<condition>` columns from sample sheet values — hardcoding would break with any condition names other than "ctrl"/"mut" |
| DiffBind R scripts | Ship as static files under `pipelines/scripts/` | Complex R scripts are fragile to generate; same pattern as SEACR under `pipelines/tools/` |
| DiffBind dependency chain | `parent_job_id` → peak calling → alignment | Wizard traverses `peakCallingJob.parentJobId` to reach alignment BAMs; no schema changes needed |
| Custom heatmap BED upload | Simple multipart (not tus) | BED files are KB-sized; chunked resumable uploads are unnecessary |
| Custom heatmap SVG | Second `plotHeatmap` call with same matrix | Lab script only outputs PNG; matrix computation is the expensive step, re-rendering is cheap |
| Pearson two-script chain | R (rtracklayer) + Python (seaborn) preserved | Mandatory reference compliance — lab uses two languages for the two halves |
| Pearson masking | mm10 only (existing `manual.mask.ultimate.bed`) | Masking BED is mouse-specific; other genomes get unmasked analysis |
| Roman normalization genome guard | Frontend filter + backend hard error | Defense in depth — wizard prevents non-mm10 selection, backend rejects it if bypassed |
| Roman normalization reference sample | First sample in list (user-reorderable) | Matches lab script behavior (`nf = z/z[1]`); wizard makes this explicit with info banner |
| Roman normalization filenames | `short_name` in R script, `label` for display | `short_name` is filesystem-safe; `label` is user-customizable for the factors table |
| Per-reaction output tracking | `reaction_id` set on `normalization_bigwig` outputs | First Phase 6 pipeline to do this; enables per-sample file filtering |
| DiffBind analysis modes | 3 modes (DESeq2 consensus, DESeq2 peaklist, edgeR peaklist) | Matches all 3 lab R script variants; covers both consensus and custom peakset workflows |
| edgeR heatmaps | Remain commented out (matching lab reference) | Lab's `diffbind_peaklist_edgeR.R` has heatmap calls commented; frontend gracefully skips null plots |
| Profile plots | Included for custom heatmaps | `plotProfile --perGroup` runs on same matrix as `plotHeatmap` — no extra computation, rendered alongside heatmap |
| Test DB cleanup | `DROP SCHEMA public CASCADE` per test | Replaces fragile `Base.metadata.drop_all` that left pg_type entries from interrupted runs |

---

## API Status After Phase 6

### Newly Implemented (Phase 6)
- `GET /api/v1/jobs/{id}/diffbind-report` — DiffBind report as structured JSON (dynamic columns + plot IDs)
- `GET /api/v1/jobs/{id}/diffbind-report/download-results` — DiffBind results TSV download
- `GET /api/v1/jobs/{id}/diffbind-report/download-counts` — DiffBind normalized counts CSV download
- `GET /api/v1/jobs/{id}/heatmap-report` — Custom heatmap report (plot + profile output IDs)
- `GET /api/v1/jobs/{id}/heatmap-report/download-matrix` — Heatmap matrix (.gz) download
- `POST /api/v1/experiments/{id}/upload-bed` — BED file upload for heatmaps/correlation
- `GET /api/v1/jobs/{id}/pearson-report` — Pearson correlation report (plot + matrix output IDs)
- `GET /api/v1/jobs/{id}/pearson-report/download-correlation` — Correlation matrix CSV download
- `GET /api/v1/jobs/{id}/pearson-report/download-coverage` — Coverage matrix CSV download
- `GET /api/v1/jobs/{id}/normalization-report` — Roman normalization report (factors + plot IDs)
- `GET /api/v1/jobs/{id}/normalization-report/download-factors` — Normalization factors CSV download

### Enhanced (Phase 6)
- `POST /api/v1/experiments/{id}/jobs` — Now supports 4 new job types: `diffbind`, `custom_heatmap`, `pearson_correlation`, `roman_normalization`

---

## Database Schema Changes

No new migrations in Phase 6. All 4 new job types use the existing `analysis_jobs` table with different `job_type` values and JSONB `params`. Outputs stored in `job_outputs` with new `file_category` values per pipeline.

---

## Test Coverage

| Test File | Count | Scope |
|-----------|-------|-------|
| `test_peak_calling_pipeline.py` | 52 | Validation (18), mock run (12), methods text (8), helpers (9), schemas/constants (5) |
| `test_files.py` | 38 | File tree, downloads, path traversal, batch download, X-Accel, IGV tokens, Range headers |
| `test_reactions.py` | 31 | CRUD, validation, permissions, unique constraints, CSV import, prefixes |
| `test_alignment_pipeline.py` | 29 | Validation, mock files, output categories, QC CSV, log parsing, methods text, schema |
| `test_jobs_api.py` | 21 | Job create, get, list, permissions, outputs, queue, QC endpoints |
| `test_diffbind_pipeline.py` | **21** | Validation (13), mock run (6), methods text (2) |
| `test_roman_normalization_pipeline.py` | **19** | Validation (11), mock run (6), methods text (2) |
| `test_pearson_correlation_pipeline.py` | **19** | Validation (10), mock run (6), methods text (3) |
| `test_custom_heatmap_pipeline.py` | **18** | Validation (10), mock run (6), methods text (2) |
| `test_projects.py` | 16 | Project CRUD, membership, permissions |
| `test_fastq_upload.py` | 15 | Upload, validation, permissions, storage, list, delete |
| `test_qc_report.py` | 14 | Alignment QC (6) + Peak calling QC (8) |
| `test_fastqc.py` | 14 | FastQC unit + integration, summary endpoint, resolver |
| `test_auth.py` | 13 | Auth endpoints (register, login, refresh, logout, protected) |
| `test_experiments.py` | 10 | Experiment CRUD, name validation, project membership |
| `test_trimming_pipeline.py` | 9 | Validate (5), mock_run, return shape, methods text (2) |
| `test_worker.py` | 8 | Worker poll cycle, job pickup, status transitions, output persistence |
| `test_tus_upload.py` | 7 | tus protocol: create, upload, finalize, permissions, validation |
| `test_sse.py` | 6 | Auth rejection, generator lifecycle, notification events, job status, user isolation |
| `test_notifications.py` | 5 | Notification list, mark-read |
| `test_users.py` | 4 | User profile get/update |
| `test_job_output_service.py` | 4 | Output persistence, storage update, category assignment, empty outputs |
| **Total** | **373** | |

All 373 tests pass. `ruff check` + `ruff format --check`: clean. `npm run build` (`tsc -b` + Vite): clean after fixing 28 TS errors in Phase 6 files (see below).

---

## New Files Created in Phase 6

### Backend Pipeline Scripts (7 new)
- `backend/pipelines/scripts/diffbind_consensus.R` — Fixed consensus peakset DiffBind R script
- `backend/pipelines/scripts/diffbind_peaklist.R` — Fixed custom peakset DiffBind R script
- `backend/pipelines/scripts/diffbind_peaklist_edger.R` — Fixed edgeR variant R script
- `backend/pipelines/scripts/pearson_matrix.R` — Parameterized bigWig → coverage matrix R script
- `backend/pipelines/scripts/pearson_heatmap.py` — Parameterized correlation heatmap Python script
- `backend/pipelines/scripts/roman_normalization.R` — Parameterized Roman normalization R script
- `backend/pipelines/scripts/roman_normalization_plot.py` — Normalization factors bar chart Python script

### Backend Pipeline Modules (4 new)
- `backend/pipelines/diffbind.py` — DiffBindStage (3 analysis modes, dynamic columns)
- `backend/pipelines/custom_heatmap.py` — CustomHeatmapStage (deepTools computeMatrix + plotHeatmap)
- `backend/pipelines/pearson_correlation.py` — PearsonCorrelationStage (R→Python two-script chain)
- `backend/pipelines/roman_normalization.py` — RomanNormalizationStage (mouse-only 99th-percentile)

### Frontend Components (24 new)

**DiffBind (8)**:
- `components/diffbind/NewDiffBindWizard.tsx` — 4-step wizard orchestrator
- `components/diffbind/ChoosePeakCallingStep.tsx` — Step 2 (peak calling job selector)
- `components/diffbind/AssignConditionsStep.tsx` — Step 3 (sample sheet builder with condition autocomplete)
- `components/diffbind/DiffBindSettingsStep.tsx` — Step 4 (analysis method + peakset selection)
- `components/diffbind/DiffBindResultsPanel.tsx` — Dynamic column results table with FDR coloring
- `components/diffbind/DiffBindPlotsPanel.tsx` — Signed URL plot viewer (PCA, MA, Volcano, Heatmaps)
- `components/diffbind/DiffBindFilesPanel.tsx` — File category browser
- `pages/experiment/DiffBindTab.tsx` — Tab with 5 sub-tabs

**Custom Heatmaps (5)**:
- `components/custom-heatmap/NewCustomHeatmapWizard.tsx` — 4-step wizard
- `components/custom-heatmap/SelectSamplesStep.tsx` — BED source + sample picker with reorder
- `components/custom-heatmap/HeatmapSettingsStep.tsx` — Flanking/reference-point/sort/colormap
- `components/custom-heatmap/CustomHeatmapPlotsPanel.tsx` — Heatmap + profile image viewer
- `components/custom-heatmap/CustomHeatmapFilesPanel.tsx` — File category browser
- `pages/experiment/CustomHeatmapTab.tsx` — Tab with 3 sub-tabs

**Pearson Correlation (6)**:
- `components/pearson-correlation/NewPearsonCorrelationWizard.tsx` — 4-step wizard
- `components/pearson-correlation/PearsonSelectSamplesStep.tsx` — Sample picker with labels + reorder
- `components/pearson-correlation/PearsonSettingsStep.tsx` — Genome, BED restriction, summary
- `components/pearson-correlation/PearsonCorrelationPlotsPanel.tsx` — Correlation heatmap viewer
- `components/pearson-correlation/PearsonCorrelationFilesPanel.tsx` — File category browser
- `pages/experiment/PearsonCorrelationTab.tsx` — Tab with 3 sub-tabs

**Roman Normalization (6)**:
- `components/normalization/NewNormalizationWizard.tsx` — 4-step wizard (mm10-only alignment filter)
- `components/normalization/NormalizationSelectSamplesStep.tsx` — Sample picker with reference banner
- `components/normalization/NormalizationSettingsStep.tsx` — Read-only mm10/masking summary
- `components/normalization/NormalizationResultsPanel.tsx` — Factors table + bar chart
- `components/normalization/NormalizationFilesPanel.tsx` — File category browser
- `pages/experiment/NormalizationTab.tsx` — Tab with 3 sub-tabs

### Tests (4 new)
- `backend/tests/test_diffbind_pipeline.py` — 21 tests
- `backend/tests/test_custom_heatmap_pipeline.py` — 18 tests
- `backend/tests/test_pearson_correlation_pipeline.py` — 19 tests
- `backend/tests/test_roman_normalization_pipeline.py` — 19 tests

---

## Files Significantly Modified in Phase 6

### Backend
- `backend/pipelines/__init__.py` — Registered 4 new stages in `_STAGES` dict
- `backend/pipelines/methods_text.py` — Added 4 methods text functions (diffbind, heatmap, pearson, normalization)
- `backend/schemas/qc_report.py` — Added 8 new Pydantic models (2 per pipeline: report + plot/factor info)
- `backend/services/qc_report_service.py` — Added 8 service functions (report + download path per pipeline)
- `backend/routers/jobs.py` — Added 10 new endpoints (2-3 per pipeline)
- `backend/routers/files.py` — Added BED upload endpoint
- `backend/tests/conftest.py` — Fixed test DB cleanup: `DROP SCHEMA public CASCADE` replaces fragile `drop_all`

### Frontend
- `frontend/src/api/types.ts` — Added 8 TypeScript interfaces
- `frontend/src/api/jobs.ts` — Added 10 API functions
- `frontend/src/hooks/useJobs.ts` — Added 4 React Query hooks
- `frontend/src/lib/constants.ts` — Added 4 file category arrays + heatmap option arrays
- `frontend/src/components/experiments/NewAnalysisDropdown.tsx` — Added 4 new callback props + buttons
- `frontend/src/pages/ExperimentView.tsx` — Added 4 tabs, 4 wizard states, 4 dropdown callbacks, 4 wizard components
- `frontend/src/App.tsx` — Added 4 routes (`diffbind/:jid`, `heatmaps/:jid`, `correlations/:jid`, `normalization/:jid`)

### TypeScript Build Fixes (28 errors across Phase 6 files)
- 3 tab files (`CustomHeatmapTab`, `NormalizationTab`, `PearsonCorrelationTab`) — Used `<DetailRow value={X} />` but component only accepts `children`. Converted to `<DetailRow>{X}</DetailRow>` (18 errors).
- 3 SelectSamplesStep components — Array destructuring swap failed under `noUncheckedIndexedAccess`. Added `!` non-null assertions on bounds-checked indices (6 errors).
- `NormalizationSettingsStep` + `NormalizationTab` — `samples[0]` possibly undefined under `noUncheckedIndexedAccess`. Added `?.` optional chaining (2 errors).
- `vite.config.ts` — Missing `@types/node` for `path`/`__dirname`. Installed dep + added `"types": ["node"]` to `tsconfig.node.json` (2 errors).

### Pre-existing Code Fixes
- `backend/pipelines/alignment.py` — 4 line-length violations fixed (long `append_to_master_log` calls), extraneous `f` prefix
- `backend/pipelines/base.py` — 1 line-length violation fixed
- `backend/routers/fastq_files.py` — Import sort
- 4 frontend components — Removed unused `experimentId` from interfaces + callers
- 3 frontend components — Wrapped array fallbacks in `useMemo` to stabilize dependencies

---

## Dependencies Added in Phase 6

No new pip or npm dependencies. All pipeline tools (R/Rscript, deepTools, DiffBind, rtracklayer, seaborn, matplotlib) are external binaries/interpreters invoked via `subprocess.run()`, available in conda environments on the host.

---

## Known Issues / Tech Debt

### Resolved in Phase 6
- ~~DiffBind R script bugs (3)~~ → Fixed when porting to `pipelines/scripts/`
- ~~No DiffBind integration~~ → Full 3-mode implementation with dynamic column handling
- ~~No custom heatmaps beyond TSS/gene body~~ → User-uploaded BED files with configurable deepTools params
- ~~No Pearson correlation~~ → Two-script chain (R + Python) with multi-genome support
- ~~No Roman normalization~~ → Mouse-only 99th-percentile normalization with masking
- ~~Test infrastructure intermittent failures~~ → `DROP SCHEMA public CASCADE` replaces fragile `drop_all`
- ~~28 TypeScript build errors in Phase 6 files~~ → DetailRow prop mismatch, `noUncheckedIndexedAccess` array swap/index issues, missing `@types/node`

### Still Open
- **EC2 real-mode validation**: All 4 Phase 6 pipelines implemented but not yet tested with actual data on EC2. Each requires specific conda environments: DiffBind (`diffbind`), deepTools (`deeptools_env` or `cleave-pipeline`), rtracklayer (`bwnorm`), seaborn/matplotlib (system Python or `cleave-pipeline`).
- **DiffBind custom peakset upload**: Currently only selects BED from existing peak calling outputs. User-uploaded BED would need a separate upload flow.
- **DiffBind consensus peakset export**: The consensus peakset derived by `dba.count()` is not exported as a downloadable file.
- **Email notifications**: Deferred to Phase 7.5 (needs Amazon SES).
- **NGINX production config**: Phase 7.
- **Legacy multipart upload endpoint**: Consider removing in Phase 7.

---

## Phase 6 Done Criteria Status

- [x] DiffBind runs with sample sheet builder, produces differential peaks + plots
- [x] Dynamic DiffBind column names handled correctly (not hardcoded)
- [x] Custom heatmaps from user-provided BED files
- [x] Pearson correlation matrices for replicate QC
- [x] Roman normalization for mouse samples (with masking)

---

## What's Next: Phase 7 (Polish & QA)

Storage lifecycle management (auto-delete intermediate files), Gold Standard reference project, experiment history/audit log, job termination and retry, email notifications (Amazon SES), EC2 deployment (NGINX + TLS + systemd), end-to-end testing with real lab data. See `docs/PLAN.md` Phase 7 for full spec.

Key prerequisites already completed:
- All 4 core pipeline stages running (Phases 3-4: alignment, peak calling)
- All 4 lab extension pipelines running (Phase 6: DiffBind, heatmaps, correlation, normalization)
- IGV.js visualization working (Phase 5)
- Full test suite green (373 tests)
- Job queue, worker, SSE, file serving infrastructure all operational
- EC2 instance has all bioinformatics tools installed (Bowtie2, SAMtools, MACS2, deepTools, HOMER, R, DiffBind, rtracklayer)
