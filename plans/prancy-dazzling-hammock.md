# Phase 6.1: DiffBind Differential Peak Analysis — Implementation Plan

## Context

Phases 1-5 are complete (296 tests passing). DiffBind is the lab's most-requested extension beyond CUTANA Cloud. It compares peaks between experimental conditions (ctrl vs. mut) using R, producing differential binding results, PCA plots, MA plots, volcano plots, and correlation heatmaps.

Three reference R scripts exist in `references/DPA/` with 3 documented bugs to fix (`cleave-spec-decisions.md` §4). The pipeline module must follow the exact DiffBind workflow from those scripts while fixing the bugs.

---

## Key Design Decisions

1. **Ship fixed R scripts as static files** under `backend/pipelines/scripts/` (same pattern as `SEACR_1.1.sh` under `pipelines/tools/`). Three scripts: `diffbind_consensus.R`, `diffbind_peaklist.R`, `diffbind_peaklist_edger.R`.

2. **Dependency chain**: DiffBind's `parent_job_id` → peak calling job → alignment job. The wizard selects a peak calling job, resolves BED files from it and BAM files from its parent alignment job. No schema changes needed.

3. **Dynamic column names**: `dba.report()` outputs `Conc_<condition1>`, `Conc_<condition2>` (NOT hardcoded). Backend parses TSV header, sends column names + rows as JSON. Frontend renders columns dynamically.

4. **Three analysis modes** via `analysis_method` param:
   - `deseq2_consensus` — consensus peakset, DESeq2 (default, from `diffbind.R`)
   - `deseq2_peaklist` — custom peakset, DESeq2 (from `diffbind_peaklist.R`)
   - `edger_peaklist` — custom peakset, edgeR + TMM (from `diffbind_peaklist_edgeR.R`)

5. **File categories**: `diffbind_results`, `normalized_counts`, `diffbind_plot_pca`, `diffbind_plot_ma`, `diffbind_plot_volcano`, `diffbind_plot_heatmap_group`, `diffbind_plot_heatmap_condition`, `diffbind_sample_sheet`, `log`

---

## Implementation Steps

### Step 1: Fixed R Scripts

Create `backend/pipelines/scripts/` with three corrected R scripts from `references/DPA/`.

**Bug fixes to apply to all three scripts:**
- **Bug 1**: Add missing `)` on `write.csv()` call
- **Bug 2**: Fix malformed `cat()`/`print()` — add comma before `results_dir`, fix parens
- **Bug 3**: Add `dev.off()` after each `png()` plot call, before each `svg()` call (5 plot blocks in consensus/peaklist, 3 in edgeR since heatmaps are commented out)

Files:
- `backend/pipelines/scripts/diffbind_consensus.R` — from `references/DPA/diffbind.R`
- `backend/pipelines/scripts/diffbind_peaklist.R` — from `references/DPA/diffbind_peaklist.R`
- `backend/pipelines/scripts/diffbind_peaklist_edger.R` — from `references/DPA/diffbind_peaklist_edgeR.R`

### Step 2: Pipeline Module — `backend/pipelines/diffbind.py`

New file: `DiffBindStage(PipelineStage)` class.

**`validate(params) -> list[str]`:**
- Required: `experiment_id`, `project_id`, `parent_job_id`, `alignment_job_id`, `analysis_method`, `samples`
- `analysis_method` in `{"deseq2_consensus", "deseq2_peaklist", "edger_peaklist"}`
- `samples` must have >= 4 entries, >= 2 distinct conditions, >= 2 replicates per condition
- Each sample: `reaction_id`, `short_name`, `condition` (alphanumeric+underscore), `replicate` (int), `bam_path`, `peak_path`, `peak_caller`
- If peaklist mode: `custom_peakset_path` required
- Real mode: verify `Rscript` in PATH

**`run(job_id, params, working_dir, job_dir) -> dict`:**
1. Create dirs: `job_dir/results/`, `job_dir/logs/`
2. Build experiment_name = `f"diffbind_job_{job_id}"`
3. Write `sample_sheet.csv` to `job_dir/` with DiffBind columns: `SampleID,Factor,Condition,Replicate,bamReads,Peaks,PeakCaller`. Resolve absolute paths for `bamReads` and `Peaks` via `Path(settings.STORAGE_ROOT) / sample["bam_path"]`.
4. Select R script from `_SCRIPTS_DIR / script_map[analysis_method]`
5. Build cmd: `["Rscript", script_path, experiment_name, sample_sheet_path]` (+ peakset arg for peaklist modes)
6. Execute via `run_cmd(cmd, log_path=..., timeout=14400, cwd=job_dir, master_log=...)`
7. Outputs land in `job_dir/{experiment_name}/`. Parse results TSV header for dynamic column names, write `results_columns.json`.
8. Register all outputs with standard output dict format and relative paths.

**`mock_run(job_id, params, working_dir, job_dir) -> dict`:**
- Sleep 5s
- Create stub files: results TSV with dynamic columns from actual condition values, 1x1 stub PNGs, empty SVGs, mock normalized_counts.csv
- Follow existing mock pattern from alignment/peak_calling

**`generate_methods_text(params) -> str`:**
- Delegates to `diffbind_methods()` in `methods_text.py`

### Step 3: Pipeline Registry — `backend/pipelines/__init__.py`

Add import and registration:
```python
from pipelines.diffbind import DiffBindStage
_STAGES["diffbind"] = DiffBindStage()
```

### Step 4: Methods Text — `backend/pipelines/methods_text.py`

Add `diffbind_methods(params)` function. Text includes: DiffBind version, statistical engine (DESeq2/edgeR), peakset type (consensus/custom), number of samples, condition names, contrast description.

### Step 5: QC Report Schemas — `backend/schemas/qc_report.py`

Add:
```python
class DiffBindPlotInfo(CamelModel):
    plot_type: str  # "pca", "ma", "volcano", "heatmap_group", "heatmap_condition"
    output_id_png: int | None = None
    output_id_svg: int | None = None

class DiffBindReport(CamelModel):
    analysis_method: str
    conditions: list[str]
    column_names: list[str]  # dynamic TSV header for frontend table rendering
    total_peaks: int
    significant_peaks_005: int  # FDR < 0.05
    significant_peaks_001: int  # FDR < 0.01
    results_preview: list[dict[str, str | float]]  # first 100 rows, keys = column names
    plot_outputs: list[DiffBindPlotInfo]
```

### Step 6: QC Report Service — `backend/services/qc_report_service.py`

Add two functions:

**`get_diffbind_report(db, job_id, user_id) -> DiffBindReport | None`:**
- Auth check via `_get_authorized_job()`, verify `job_type == "diffbind"` and `status == "complete"`
- Resolve results TSV via `_resolve_output_path(job, "diffbind_results", "tsv")`
- Parse TSV header for column names, read first 100 rows into `results_preview`
- Count total, significant (FDR<0.05), significant (FDR<0.01) peaks
- Find plot output IDs from job outputs by matching `diffbind_plot_*` categories
- Extract conditions from `job.params["samples"]`

**`get_diffbind_results_path(db, job_id, user_id) -> Path | None`:**
- For full results download

**`get_diffbind_counts_path(db, job_id, user_id) -> Path | None`:**
- For normalized counts download

### Step 7: Router Endpoints — `backend/routers/jobs.py`

Add three endpoints following existing QC report pattern:
```
GET  /jobs/{job_id}/diffbind-report          -> DiffBindReport JSON
GET  /jobs/{job_id}/diffbind-report/download-results  -> TSV file
GET  /jobs/{job_id}/diffbind-report/download-counts   -> CSV file
```

### Step 8: Tests — `backend/tests/test_diffbind_pipeline.py`

~20 tests following `test_peak_calling_pipeline.py` pattern:
- Validation: valid params, missing fields, too few conditions, too few replicates, invalid method, peaklist requires peakset, unsafe condition name
- Mock run: creates expected output files, dynamic column names match conditions, sample sheet CSV is valid
- Methods text: contains expected engine and condition references
- Sample sheet generation: correct DiffBind CSV format with absolute paths

### Step 9: Frontend Types & API

**`frontend/src/api/types.ts`** — Add `DiffBindPlotInfo`, `DiffBindReport` interfaces

**`frontend/src/api/jobs.ts`** — Add `getDiffBindReport()`, `downloadDiffBindResults()`, `downloadDiffBindCounts()`

**`frontend/src/hooks/useJobs.ts`** — Add `useDiffBindReport(jobId)` hook

**`frontend/src/lib/constants.ts`** — Add `DIFFBIND_ANALYSIS_METHODS`, `DIFFBIND_FILE_CATEGORIES` arrays

### Step 10: NewAnalysisDropdown Modification

**`frontend/src/components/experiments/NewAnalysisDropdown.tsx`:**
- Add `onDiffBindClick` prop
- Add "DiffBind" button in dropdown menu

### Step 11: DiffBind Wizard — 4 Steps

New directory: `frontend/src/components/diffbind/`

**`NewDiffBindWizard.tsx`** — Main wizard orchestrator (4 steps, follows `NewPeakCallingWizard` pattern):

**Step 1: Details** (`DiffBindDetailsStep.tsx`)
- Name (30-char limit), notes textarea
- About panel: "What is DiffBind?", "What Does the Pipeline Do?", "Outputs"

**Step 2: Choose Peak Calling** (`ChoosePeakCallingStep.tsx`)
- Radio table of completed peak calling jobs
- Columns: Name, Peak Caller, Genome, Reactions, Date

**Step 3: Assign Conditions** (`AssignConditionsStep.tsx`) — the core sample sheet builder
- Checkbox table of reactions from the selected peak calling job
- Per-reaction: Short Name (read-only), Condition (text input with autocomplete from entered values), Replicate (number, auto-incremented per condition)
- Validation: >= 4 selected, >= 2 conditions, >= 2 replicates per condition
- This is the most complex new component

**Step 4: Settings** (`DiffBindSettingsStep.tsx`)
- Analysis method radio: DESeq2 Consensus (default), DESeq2 Custom Peakset, edgeR Custom Peakset
- If custom peakset: dropdown to select a BED output from the peak calling job
- Sample sheet preview table
- "Start DiffBind" submit button

**Job params built by wizard:**
```json
{
  "experiment_id": 1,
  "project_id": 1,
  "parent_job_id": 20,
  "alignment_job_id": 10,
  "analysis_method": "deseq2_consensus",
  "samples": [
    {
      "reaction_id": 1, "short_name": "K4me3_ctrl1",
      "condition": "ctrl", "replicate": 1,
      "bam_path": "projects/1/5/jobs/10/bams/K4me3_ctrl1_final.bam",
      "peak_path": "projects/1/5/jobs/20/peaks/K4me3_ctrl1_peaks.narrowPeak",
      "peak_caller": "narrow"
    }
  ]
}
```

### Step 12: DiffBindTab — Results Page

**`frontend/src/pages/experiment/DiffBindTab.tsx`** — follows `PeakCallingTab.tsx` pattern:
- Job selector dropdown (filter `jobType === "diffbind"`)
- 5 sub-tabs: Info, Input, Results, Plots, Files

Sub-tab components in `frontend/src/components/diffbind/`:

**`DiffBindInfoPanel.tsx`** — Details card, Methods Text card (copy button), Notes card

**`DiffBindInputPanel.tsx`** — Sample sheet table: SampleID, Condition, Replicate, BAM, Peaks, PeakCaller

**`DiffBindResultsPanel.tsx`** — Dynamic column results table:
- Summary stats: total peaks, significant at FDR < 0.05, < 0.01
- DataTable with columns built from `report.columnNames` (handles dynamic `Conc_X` columns)
- Download buttons for full TSV and normalized counts CSV
- Color-code FDR column (green < 0.05, amber < 0.1, red >= 0.1)

**`DiffBindPlotsPanel.tsx`** — Plot viewer:
- Grid of plot cards (PCA, MA, Volcano, Heatmap Group, Heatmap Condition)
- Each renders PNG via signed URL (`getOutputSignedUrl`)
- SVG download link per plot
- Gracefully skip missing plots (edgeR mode has no heatmaps)
- About panel for each plot type

**`DiffBindFilesPanel.tsx`** — File browser with `DIFFBIND_FILE_CATEGORIES` dropdown

### Step 13: Routing & Tab Integration

**`frontend/src/App.tsx`** — Add route:
```tsx
<Route path="diffbind/:jid" element={<DiffBindTab />} />
```

**`frontend/src/pages/ExperimentView.tsx`:**
- Add to TABS: `{ label: 'DiffBind', path: 'diffbind/0' }`
- Add to JOB_TYPE_LABELS: `diffbind: 'DiffBind'`
- Add wizard state: `showDiffBindWizard`
- Pass `onDiffBindClick` to `NewAnalysisDropdown`
- Render `<NewDiffBindWizard>` conditionally

---

## File Summary

### New Backend Files (6)
- `backend/pipelines/scripts/diffbind_consensus.R`
- `backend/pipelines/scripts/diffbind_peaklist.R`
- `backend/pipelines/scripts/diffbind_peaklist_edger.R`
- `backend/pipelines/diffbind.py`
- `backend/tests/test_diffbind_pipeline.py`

### Modified Backend Files (4)
- `backend/pipelines/__init__.py` — register DiffBindStage
- `backend/pipelines/methods_text.py` — add `diffbind_methods()`
- `backend/schemas/qc_report.py` — add DiffBind schemas
- `backend/services/qc_report_service.py` — add report parsing functions
- `backend/routers/jobs.py` — add 3 endpoints

### New Frontend Files (11)
- `frontend/src/components/diffbind/NewDiffBindWizard.tsx`
- `frontend/src/components/diffbind/DiffBindDetailsStep.tsx`
- `frontend/src/components/diffbind/ChoosePeakCallingStep.tsx`
- `frontend/src/components/diffbind/AssignConditionsStep.tsx`
- `frontend/src/components/diffbind/DiffBindSettingsStep.tsx`
- `frontend/src/components/diffbind/DiffBindInfoPanel.tsx`
- `frontend/src/components/diffbind/DiffBindInputPanel.tsx`
- `frontend/src/components/diffbind/DiffBindResultsPanel.tsx`
- `frontend/src/components/diffbind/DiffBindPlotsPanel.tsx`
- `frontend/src/components/diffbind/DiffBindFilesPanel.tsx`
- `frontend/src/pages/experiment/DiffBindTab.tsx`

### Modified Frontend Files (6)
- `frontend/src/components/experiments/NewAnalysisDropdown.tsx` — add DiffBind option
- `frontend/src/pages/ExperimentView.tsx` — add tab, wizard state, dropdown callback
- `frontend/src/App.tsx` — add route
- `frontend/src/api/types.ts` — add DiffBind interfaces
- `frontend/src/api/jobs.ts` — add API functions
- `frontend/src/hooks/useJobs.ts` — add hook
- `frontend/src/lib/constants.ts` — add constants

---

## Implementation Order

1. **R Scripts** (Step 1) — fix bugs, create `pipelines/scripts/`
2. **Pipeline Module** (Steps 2-4) — `diffbind.py`, registry, methods text
3. **Pipeline Tests** (Step 8) — validate + mock_run tests
4. **Backend API** (Steps 5-7) — schemas, service, router endpoints
5. **Frontend Types & API** (Step 9) — types, API functions, hooks, constants
6. **Wizard** (Steps 10-11) — dropdown modification, 4-step wizard
7. **Results Tab** (Step 12) — DiffBindTab with 5 sub-tab panels
8. **Routing** (Step 13) — App.tsx route, ExperimentView integration

---

## Verification

1. Run `docker compose exec api pytest tests/test_diffbind_pipeline.py` — all tests pass
2. Run `docker compose exec api ruff check .` — clean
3. Run `cd frontend && npx tsc --noEmit` — clean
4. Manual test in mock mode:
   - Create experiment with 4+ reactions
   - Run alignment (mock) → complete
   - Run peak calling (mock) → complete
   - Open New Analysis → DiffBind → walk through 4-step wizard
   - Assign 2 ctrl + 2 mut conditions with replicate numbers
   - Start DiffBind → job completes (mock)
   - Navigate to DiffBind tab → verify all 5 sub-tabs render
   - Results tab shows dynamic columns (`Conc_ctrl`, `Conc_mut`)
   - Plots tab shows placeholder images
   - Files tab lists all DiffBind output categories
   - Download results TSV and normalized counts CSV
