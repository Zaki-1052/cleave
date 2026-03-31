# Plan: Phase 6.3 — Pearson Correlation Matrices

## Context

Phase 6.3 adds pairwise bigWig Pearson correlation for replicate concordance assessment. This is the third Phase 6 feature after DiffBind (6.1) and Custom Heatmaps (6.2), which established all the patterns we follow exactly.

The lab uses two scripts: `references/media_pearson_corr/peak_extractor.r` (R/rtracklayer: bigWig → coverage matrix at 50bp resolution with masking) and `references/media_pearson_corr/pearson.py` (Python/seaborn: coverage matrix → Pearson correlation heatmap). Per MANDATORY Reference Compliance, we preserve the exact algorithm and tool chain.

## Files to Create (14 new)

### Backend Pipeline Scripts
1. **`backend/pipelines/scripts/pearson_matrix.R`** — Parameterized port of `peak_extractor.r`
   - CLI: `Rscript pearson_matrix.R <sample_sheet.csv> <output_csv> <genome> [mask_bed] [restrict_bed]`
   - Core algorithm preserved verbatim: `import.bw()` → GRanges/findOverlaps at dx=50bp → coverage matrix → zero removal → masking → optional BED restriction → `write.csv()`
   - Genome param selects chromosome set: mm10→chr1-19+chrX, hg38/hg19→chr1-22+chrX, dm6→chr2L/R+chr3L/R+chr4+chrX, sacCer3→chrI-XVI
   - Masking uses existing `manual.mask.ultimate.bed` (158 entries, mouse only — same file as `references/media_pearson_corr/masked_regions.bed`)

2. **`backend/pipelines/scripts/pearson_heatmap.py`** — Parameterized port of `pearson.py`
   - CLI: `python3 pearson_heatmap.py <input_csv> <output_png> <output_svg> <correlation_csv>`
   - Exact lab params: `figsize=(15,15)`, `cmap="Blues"`, `annot=True`, `annot_kws={"size":25}`, `fmt='.2f'`
   - Adds SVG output (lab only outputs PNG — same pattern as Custom Heatmap adding SVG via second save call)
   - Saves correlation coefficient matrix as separate CSV for download

### Backend Pipeline Module
3. **`backend/pipelines/pearson_correlation.py`** — `PearsonCorrelationStage(PipelineStage)`
   - Follows `custom_heatmap.py` patterns exactly
   - `validate()`: require experiment_id, project_id, parent_job_id, alignment_job_id, reference_genome, ≥2 samples each with reaction_id/short_name/label/bigwig_path; check Rscript+python3 in PATH (non-mock)
   - `run()`: write sample_sheet.csv → run R script (timeout 4h) → run Python script (timeout 1h) → collect outputs
   - `mock_run()`: sleep(4), create stub PNG/SVG, stub coverage CSV (20 rows × N cols), stub correlation CSV (N×N, diagonal=1.0, replicates~0.95), stub sample sheet, stub log
   - Output categories: `pearson_heatmap` (PNG+SVG), `pearson_matrix` (coverage CSV), `pearson_correlation` (coefficients CSV), `pearson_sample_sheet`, `log`

### Backend Tests
4. **`backend/tests/test_pearson_correlation_pipeline.py`** — ~15 tests
   - Validation: valid params, missing fields, too few samples (<2), invalid genome, optional BED, missing sample fields
   - Mock run: output files exist, categories correct, PNG+SVG present, coverage CSV has sample columns, correlation CSV is N×N, file sizes positive
   - Methods text: contains "Pearson", "rtracklayer", "50 bp", "seaborn"; mm10 mentions masking; BED restriction mentioned when used

### Frontend Components (6 new files)
5. **`frontend/src/components/pearson-correlation/PearsonSelectSamplesStep.tsx`** — Fork of `SelectSamplesStep.tsx` without BED source section (BED is optional, goes in Settings step); checkbox table with editable labels and reordering

6. **`frontend/src/components/pearson-correlation/PearsonSettingsStep.tsx`** — Settings step: reference genome display (read-only from alignment), optional BED restriction (from peak calling outputs or upload), summary card

7. **`frontend/src/components/pearson-correlation/NewPearsonCorrelationWizard.tsx`** — 4-step wizard following `NewCustomHeatmapWizard.tsx` pattern
   - Step 1: Details (name 30-char, notes, About panel explaining correlation)
   - Step 2: Choose Alignment (radio table of completed alignment jobs)
   - Step 3: Select Samples (≥2 required, checkbox table with labels, reordering via PearsonSelectSamplesStep)
   - Step 4: Settings (genome display, optional BED restriction via PearsonSettingsStep)
   - Submit: creates job with `jobType: "pearson_correlation"`

8. **`frontend/src/components/pearson-correlation/PearsonCorrelationPlotsPanel.tsx`** — Following `CustomHeatmapPlotsPanel.tsx`: single heatmap image via signed URL, download buttons (PNG, SVG, Correlation CSV, Coverage CSV)

9. **`frontend/src/components/pearson-correlation/PearsonCorrelationFilesPanel.tsx`** — Following `CustomHeatmapFilesPanel.tsx`: category dropdown + checkbox table

10. **`frontend/src/pages/experiment/PearsonCorrelationTab.tsx`** — Following `CustomHeatmapTab.tsx`: job selector dropdown, 3 sub-tabs (Info, Plot, Files), inline info panel with Details/Methods/Notes cards

## Files to Modify (9 existing)

### Backend
11. **`backend/pipelines/__init__.py`** — Add `"pearson_correlation": PearsonCorrelationStage()` to `_STAGES`
12. **`backend/pipelines/methods_text.py`** — Add `pearson_correlation_methods(params)` function
13. **`backend/schemas/qc_report.py`** — Add `PearsonCorrelationPlotInfo` and `PearsonCorrelationReport` models
14. **`backend/services/qc_report_service.py`** — Add `get_pearson_correlation_report()`, `get_pearson_correlation_matrix_path()`, `get_pearson_coverage_matrix_path()`
15. **`backend/routers/jobs.py`** — Add 3 endpoints: `GET /jobs/{id}/pearson-report`, `GET /jobs/{id}/pearson-report/download-correlation`, `GET /jobs/{id}/pearson-report/download-coverage`

### Frontend
16. **`frontend/src/api/types.ts`** — Add `PearsonCorrelationReport`, `PearsonCorrelationPlotInfo` interfaces
17. **`frontend/src/api/jobs.ts`** — Add `getPearsonCorrelationReport()`, `downloadPearsonCorrelation()`, `downloadPearsonCoverage()`
18. **`frontend/src/hooks/useJobs.ts`** — Add `usePearsonCorrelationReport()` hook
19. **`frontend/src/lib/constants.ts`** — Add `PEARSON_CORRELATION_FILE_CATEGORIES`

### Frontend Integration
20. **`frontend/src/components/layout/NewAnalysisDropdown.tsx`** — Add `onPearsonCorrelationClick` prop + "Correlation" button
21. **`frontend/src/pages/experiment/ExperimentView.tsx`** — Add Correlation tab, wizard state, dropdown callback
22. **`frontend/src/App.tsx`** — Add `correlations/:jid` route

## Implementation Order

### Phase A — Backend Core (files 1-5, 11-12)
1. `pearson_matrix.R` (R script)
2. `pearson_heatmap.py` (Python script)
3. `methods_text.py` (add function)
4. `pearson_correlation.py` (pipeline stage)
5. `__init__.py` (register)

### Phase B — Backend API (files 13-15)
6. `schemas/qc_report.py` (models)
7. `services/qc_report_service.py` (service functions)
8. `routers/jobs.py` (endpoints)

### Phase C — Tests (file 4)
9. `test_pearson_correlation_pipeline.py`

### Phase D — Frontend API Layer (files 16-19)
10. `types.ts`, `jobs.ts`, `useJobs.ts`, `constants.ts`

### Phase E — Frontend Components (files 5-10)
11. `PearsonSelectSamplesStep.tsx`
12. `PearsonSettingsStep.tsx`
13. `NewPearsonCorrelationWizard.tsx`
14. `PearsonCorrelationPlotsPanel.tsx`
15. `PearsonCorrelationFilesPanel.tsx`
16. `PearsonCorrelationTab.tsx`

### Phase F — Frontend Integration (files 20-22)
17. `NewAnalysisDropdown.tsx`
18. `ExperimentView.tsx`
19. `App.tsx`

## Key Decisions

- **Two-script approach preserved**: R (rtracklayer) for matrix extraction + Python (seaborn) for heatmap, matching lab's tool chain per mandatory compliance
- **Masking**: Applied by default for mm10 only (using existing `manual.mask.ultimate.bed`). Other genomes: no mask available, skip masking (log a note)
- **BED restriction is optional**: User can optionally provide a BED file to restrict analysis to specific genomic regions (from peak calling outputs or upload). The lab's `covgfk` (restricted) was created but never written to output — the default output is `covgf` (masked, unrestricted)
- **Minimum 2 samples** (mathematically need ≥2 for correlation; verify message recommends 3+)
- **SVG added**: Lab only outputs PNG. We add SVG via second `plt.savefig()` call — same pattern as Custom Heatmap adding SVG
- **Correlation CSV saved**: Lab only prints to stdout. We save the N×N correlation coefficient matrix as downloadable CSV — more useful for users
- **3 sub-tabs** (Info/Plot/Files) matching CustomHeatmapTab pattern, not 5 like DiffBind (no Input or Results data tables needed — the heatmap IS the result)
- **Chromosome parameterization**: Lab hardcodes mouse chromosomes. We parameterize based on `reference_genome` from alignment job

## Verification

After implementation, verify end-to-end:
1. Run `docker compose exec api pytest tests/test_pearson_correlation_pipeline.py` — all tests pass
2. Run `docker compose exec api ruff check .` — no lint errors
3. Run `cd frontend && npx tsc --noEmit` — no type errors
4. Run `cd frontend && npm run lint` — no ESLint errors
5. In browser: create Pearson Correlation job via wizard → select alignment → select ≥4 reactions → submit → job completes in mock mode → Correlation tab shows heatmap + files
