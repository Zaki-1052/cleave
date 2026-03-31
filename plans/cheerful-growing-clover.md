# Phase 6.4: Roman Normalization — Implementation Plan

## Context

Phase 6.4 adds Roman Normalization — a mouse-only, sample-to-sample 99th-percentile quantile normalization that produces normalized bigWig files (`*_rnorm.bw`). This is the final Phase 6 "Lab Extension" feature, porting `references/media_normalization/normalization.r` into the Cleave web platform. The primary use case is normalizing bigWig signal across biological replicates/conditions before visual comparison in IGV.

Key constraint: **Mouse only** (chr1-19, chrX). Must reject non-mm10 genomes at both frontend (wizard filters) and backend (validation error).

Follows patterns established in Phases 6.1–6.3 (DiffBind, Custom Heatmaps, Pearson Correlation).

---

## Reference Script Algorithm (MANDATORY compliance)

Source: `references/media_normalization/normalization.r` (172 lines, single dependency: `rtracklayer`)

1. **Import bigWigs** at 50bp resolution via `rtracklayer::import.bw()`
2. **Per-chromosome reorganization**: For each of chr1-19 + chrX, scale coordinates to 50bp bins (`(start-1)/dx + 1`), use `findOverlaps()` to map scores into contiguous bin vectors
3. **Build coverage matrix**: rows = genomic 50bp bins (named `chr.binIndex`), columns = samples
4. **Remove zero-coverage rows**: `rowSums(covg) == 0`
5. **Apply masking** from `manual.mask.ultimate.bed` (158 regions, already at `backend/pipelines/reference/masks/`): convert BED coords to `dx` units, loop mask entries to build boolean `remove` vector
6. **99th percentile**: `z <- apply(covgf, 2, function(x) quantile(x, .99))`
7. **Normalization factors**: `nf <- z / z[1]` (first sample = reference, NF=1.0)
8. **Export**: Re-import each original bigWig, `score <- round(score / nf[s], 2)`, export as `{name}_rnorm.bw`

**What we preserve verbatim**: Steps 1–8 algorithm, `dx=50`, chromosome list, `findOverlaps` approach, masking logic, `quantile(x, .99)`, division-based normalization, 2-decimal rounding, re-import-and-divide export strategy.

**What we parameterize** (no algorithm changes): sample list from CSV args instead of hardcoded, mask BED path as arg, output directory as arg, add normalization_factors.csv output for transparency.

---

## Files to Create (14 new files)

### Backend

| # | File | Purpose |
|---|------|---------|
| 1 | `backend/pipelines/scripts/roman_normalization.R` | Parameterized port of lab R script |
| 2 | `backend/pipelines/scripts/roman_normalization_plot.py` | Bar chart of normalization factors (matplotlib/seaborn) |
| 3 | `backend/pipelines/roman_normalization.py` | `RomanNormalizationStage(PipelineStage)` |
| 4 | `backend/tests/test_roman_normalization_pipeline.py` | ~19 tests |

### Frontend

| # | File | Purpose |
|---|------|---------|
| 5 | `frontend/src/components/normalization/NewNormalizationWizard.tsx` | 4-step wizard orchestrator |
| 6 | `frontend/src/components/normalization/NormalizationSelectSamplesStep.tsx` | Checkbox table + label edit + reorder |
| 7 | `frontend/src/components/normalization/NormalizationSettingsStep.tsx` | Genome/masking summary (read-only for mm10) |
| 8 | `frontend/src/components/normalization/NormalizationResultsPanel.tsx` | Factors table + bar chart image |
| 9 | `frontend/src/components/normalization/NormalizationFilesPanel.tsx` | Category dropdown + file table |
| 10 | `frontend/src/pages/experiment/NormalizationTab.tsx` | Tab with Info / Results / Files sub-tabs |

---

## Files to Modify (11 existing files)

### Backend

| # | File | Change |
|---|------|--------|
| 1 | `backend/pipelines/__init__.py` | Register `"roman_normalization": RomanNormalizationStage()` |
| 2 | `backend/pipelines/methods_text.py` | Add `roman_normalization_methods()` |
| 3 | `backend/schemas/qc_report.py` | Add `NormalizationFactorEntry`, `RomanNormalizationReport` |
| 4 | `backend/services/qc_report_service.py` | Add `get_roman_normalization_report()`, `get_roman_normalization_factors_path()` |
| 5 | `backend/routers/jobs.py` | Add 2 endpoints: GET report + GET download-factors |

### Frontend

| # | File | Change |
|---|------|--------|
| 6 | `frontend/src/api/types.ts` | Add `NormalizationFactorEntry`, `RomanNormalizationReport` interfaces |
| 7 | `frontend/src/api/jobs.ts` | Add `getRomanNormalizationReport()`, `downloadNormalizationFactors()` |
| 8 | `frontend/src/hooks/useJobs.ts` | Add `useRomanNormalizationReport()` hook |
| 9 | `frontend/src/lib/constants.ts` | Add `NORMALIZATION_FILE_CATEGORIES` |
| 10 | `frontend/src/components/experiments/NewAnalysisDropdown.tsx` | Add `onNormalizationClick` prop + "Normalization" button |
| 11 | `frontend/src/pages/ExperimentView.tsx` | Add Normalization tab + wizard state + dropdown callback |
| 12 | `frontend/src/App.tsx` | Add `normalization/:jid` route |

---

## Implementation Details

### 1. R Script — `roman_normalization.R`

```
Usage: Rscript roman_normalization.R <sample_sheet.csv> <output_dir> <mask_bed_path>
```

- **Args**: sample_sheet CSV (columns: `SampleName`, `BigWigPath`), output directory, mask BED path
- **Genome guard**: Hardcoded `chroms <- paste0("chr", c(1:19, "X"))` — this IS the mouse-only enforcement within the R script itself
- **Algorithm**: Verbatim from `normalization.r` lines 27–171, with paths parameterized
- **New output**: Writes `normalization_factors.csv` (SampleName, Percentile99, NormalizationFactor) after computing `nf` — not in reference, added for transparency/results display
- **Output bigWigs**: `{output_dir}/{SampleName}_rnorm.bw` per sample
- **Library**: `rtracklayer` only (matches reference)

### 2. Visualization Script — `roman_normalization_plot.py`

```
Usage: python3 roman_normalization_plot.py <factors_csv> <output_png> <output_svg>
```

- Reads `normalization_factors.csv`, generates horizontal bar chart
- Bars = normalization factors per sample, vertical dashed line at NF=1.0
- Reference sample (first, NF=1.0) visually distinct
- `matplotlib.use("Agg")` + `seaborn` (same deps as `pearson_heatmap.py`)
- PNG (dpi=150) + SVG output

### 3. Pipeline Module — `roman_normalization.py`

**`RomanNormalizationStage(PipelineStage)`** following `pearson_correlation.py` pattern:

**`validate(params)`**:
- Required: `experiment_id`, `project_id`, `parent_job_id`, `alignment_job_id`
- `reference_genome` MUST be `"mm10"` — reject with: `"Roman normalization is mouse-only (mm10). Got: '{genome}'."`
- `samples`: list, `len >= 2`, each with `reaction_id`, `short_name`, `label`, `bigwig_path`
- Non-mock: check `Rscript` and `python3` in PATH

**`run(job_id, params, working_dir, job_dir)`**:
- Create `results_dir`, `logs_dir`
- Write sample sheet CSV (SampleName=`short_name`, BigWigPath from params)
- Resolve mask BED: `_MASKS_DIR / "manual.mask.ultimate.bed"`
- Run R script via `run_cmd()`, timeout=14400 (4h — bigWig I/O is heavy)
- Run Python plot script via `run_cmd()`, timeout=3600 (1h)
- Register outputs (see Output Categories below)

**`mock_run()`**: Create stub files — small byte placeholders for `.bw`, realistic CSV for factors, stub PNG/SVG. Sleep 4s. Same output dict structure as real run.

### 4. Output Categories

| Category | Type | Per-Reaction? | Description |
|----------|------|:---:|-------------|
| `normalization_bigwig` | bw | **Yes** (`reaction_id` set) | Per-sample `_rnorm.bw` |
| `normalization_factors` | csv | No | 99th percentiles + normalization factors |
| `normalization_plot` | png, svg | No | Bar chart of NF values |
| `normalization_sample_sheet` | csv | No | Input sample sheet |
| `log` | txt | No | Pipeline logs |

**Note**: This is the first Phase 6.x pipeline with **per-reaction output tracking** — each `normalization_bigwig` output has `reaction_id` set from the corresponding sample.

### 5. Methods Text — `roman_normalization_methods(params)`

> "Sample-to-sample normalization was performed using 99th-percentile quantile normalization (Roman normalization). RPKM-normalized bigWig signal was extracted at 50 bp resolution across mouse autosomes (chr1–19) and chrX of the Mouse mm10 reference genome using rtracklayer (R). Genomic bins with zero coverage across all {N} samples were removed. Manually curated masked regions (158 entries) were excluded to eliminate loci with artificially extreme signal. The 99th percentile of signal intensity was computed for each sample from the filtered coverage matrix. Normalization factors were calculated by dividing each sample's 99th percentile by that of the reference sample ({first_label}). Original bigWig scores were divided by the corresponding normalization factor and rounded to two decimal places. Normalized bigWig files (*_rnorm.bw) were exported for downstream visualization."

### 6. Report Schema

```python
class NormalizationFactorEntry(CamelModel):
    sample_name: str
    percentile_99: float
    normalization_factor: float

class RomanNormalizationReport(CamelModel):
    sample_count: int
    sample_labels: list[str]
    reference_genome: str           # always "mm10"
    reference_sample: str           # first sample label
    normalization_factors: list[NormalizationFactorEntry]
    plot_output_id_png: int | None = None
    plot_output_id_svg: int | None = None
    factors_csv_output_id: int | None = None
```

### 7. API Endpoints

| Method | Path | Response |
|--------|------|----------|
| GET | `/jobs/{id}/normalization-report` | `RomanNormalizationReport` |
| GET | `/jobs/{id}/normalization-report/download-factors` | FileResponse (CSV) |

### 8. Frontend Wizard (4 steps)

**Step 1 — Details**: Name (30-char) + Notes + About card

**Step 2 — Choose Alignment**: Radio list of completed alignment jobs **filtered to `reference_genome === 'mm10'` only**. If none exist, show: "No completed mouse (mm10) alignments available. Roman normalization requires mouse data."

**Step 3 — Select Samples**: Checkbox table + inline label edit + up/down reorder. Auto-excludes IgG. Min 2 samples. **Key UI element**: Info banner — "The first sample becomes the normalization reference (NF = 1.0). Use arrows to reorder."

**Step 4 — Settings**: Read-only summary — Genome (mm10), Masking (Applied, 158 regions), Reference sample (first in list), all sample labels.

### 9. Frontend Results Tab (3 sub-tabs)

**Info**: Details card + Methods Text card (copy button) + Notes card (editable) — same as Pearson

**Results** (replaces "Plot"):
- Normalization factors DataTable: Sample Name, 99th Percentile, Normalization Factor. Reference sample row highlighted (NF=1.0)
- Bar chart image below (PNG via signed URL)
- Download buttons: PNG, SVG, Factors CSV

**Files**: Category dropdown from `NORMALIZATION_FILE_CATEGORIES`, checkbox-selectable file table — same pattern as Pearson

### 10. Frontend Integration

- `NewAnalysisDropdown`: add `onNormalizationClick` prop + "Normalization" button
- `ExperimentView`: add `{ label: 'Normalization', path: 'normalization/0' }` tab, `showNormalizationWizard` state, wire dropdown callback, render wizard
- `App.tsx`: `<Route path="normalization/:jid" element={<NormalizationTab />} />`
- `JOB_TYPE_LABELS`: `roman_normalization: 'Normalization'`

---

## Tests (~19)

### Validation (11)
1. Valid params (mm10, 4 samples) → no errors
2. Missing experiment_id
3. Missing project_id
4. Missing reference_genome
5. Non-mouse genome hg38 → error contains "mouse-only"
6. Non-mouse genome hg19 → same
7. Non-mouse genome dm6 → same
8. Empty samples list
9. Too few samples (1) → error
10. Missing sample fields (reaction_id only)
11. Exactly 2 samples → passes (minimum valid)

### Mock Run (6)
1. All output files exist on disk
2. Expected categories present: `normalization_bigwig`, `normalization_factors`, `normalization_plot`, `normalization_sample_sheet`, `log`
3. Per-reaction bigWigs: one `normalization_bigwig` per sample with correct `reaction_id`
4. Factors CSV has correct columns (SampleName, Percentile99, NormalizationFactor) and row count
5. All output file sizes > 0
6. Plot outputs include both PNG and SVG

### Methods Text (2)
1. Contains "99th percentile", "rtracklayer", "mm10", "50 bp", "masked"
2. Contains correct sample count in text

---

## Implementation Order

1. **R script** (`roman_normalization.R`) — core algorithm, reference compliance critical
2. **Python plot script** (`roman_normalization_plot.py`) — visualization
3. **Pipeline module** (`roman_normalization.py`) — validate/run/mock_run/methods
4. **Methods text** function in `methods_text.py`
5. **Registry** in `__init__.py`
6. **Tests** (`test_roman_normalization_pipeline.py`) — run and verify
7. **Schemas** in `qc_report.py`
8. **Service** functions in `qc_report_service.py`
9. **Router** endpoints in `jobs.py`
10. **Frontend types** (`types.ts`, `jobs.ts`, `useJobs.ts`, `constants.ts`)
11. **Wizard components** (3 files)
12. **Results components** (2 files)
13. **Tab page** (`NormalizationTab.tsx`)
14. **Integration** (dropdown, ExperimentView, App.tsx)
15. **Lint/format/typecheck** validation

---

## Verification

1. `ruff check backend/` + `ruff format --check backend/`
2. `cd frontend && npm run lint && npm run typecheck`
3. `docker compose exec api pytest tests/test_roman_normalization_pipeline.py -v` (19 tests pass)
4. Mock mode smoke test: create normalization job via wizard → Info/Results/Files sub-tabs render → factors table shows NF values → bar chart displays → per-reaction bigWig files downloadable
5. Wizard guard: confirm hg38 alignments are NOT shown in step 2
6. Backend guard: `POST` with `reference_genome: "hg38"` → validation error mentioning "mouse-only"

---

## Design Decisions

- **Normalization factors CSV**: Added beyond reference script for transparency — enables Results table display and manuscript documentation
- **Bar chart visualization**: Added via Python script (following `pearson_heatmap.py` pattern) since reference has commented-out scatterplots; a factors bar chart is more useful for end users
- **Per-reaction outputs**: `normalization_bigwig` outputs have `reaction_id` set — first Phase 6.x pipeline to do this. Enables per-sample file browsing and future IGV track loading
- **"Results" sub-tab instead of "Plot"**: Shows factors table + visualization together, more informative than plot-only
- **Sample naming**: Use `short_name` as `SampleName` in R script CSV (safe for filenames), `label` for display in factors table
- **Settings step minimal**: Genome locked to mm10, masking always applied — no user choices beyond sample selection/ordering
- **First sample = reference**: Matches lab script behavior (`nf = z/z[1]`). Wizard makes this explicit with reorder arrows and info banner
- **4-hour R timeout**: BigWig I/O for many samples over full mouse genome is memory/time intensive
