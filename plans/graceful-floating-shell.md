# Phase 3 Bug-Fix & Polish Session

## Context

Phase 3 (Core Pipeline) is complete with 213 tests passing, but 9 "Still Open" items remain as bugs and tech debt. These must be addressed before Phase 4 (Peak Calling) to provide a solid foundation. Two items (EC2 validation, email notifications) are deferred — 7 items are actionable code changes.

---

## Implementation Order

| # | Issue | Effort | Files Modified |
|---|-------|--------|----------------|
| 1 | `perPage` alias missing on `list_experiment_jobs` | S | 1 backend |
| 2 | "Last Job" in ExperimentView header | S | 1 frontend |
| 3 | E. coli normalization factor in QC report | S | 5 backend + 2 frontend |
| 4 | Notes "Manage" link (backend + UI) | M | 3 backend + 3 frontend |
| 5 | Batch download in Files sub-tab | M | 2 backend + 2 frontend |
| 6 | SNAP-CUTANA K-MetStat spike-in QC | L | 4 backend + 2 frontend (1 new file) |
| 7 | Analysis Queue column filters | M | 2 backend + 3 frontend |

**Skipped**: EC2 real-mode validation (deployment task), Email notifications (deferred to Phase 7.5)

---

## 1. Fix `perPage` Alias on `list_experiment_jobs` (S)

**Problem**: `backend/routers/jobs.py:48` has `per_page: int = Query(25, ge=1, le=100)` without `alias="perPage"`. Frontend sends `perPage` — the param is silently ignored, pagination always defaults to 25.

**Fix**:
- `backend/routers/jobs.py:48` — add `alias="perPage"` to match all other paginated endpoints

**Tests**:
- `backend/tests/test_jobs_api.py` — add assertion in `test_list_jobs_for_experiment_200` sending `perPage=1` and verifying only 1 item returned

---

## 2. Wire "Last Job" in ExperimentView Header (S)

**Problem**: `frontend/src/pages/ExperimentView.tsx:48-49` shows hardcoded "None".

**Approach**: Frontend-only fix. Use existing `useJobs(experimentId, 1, 1)` to fetch the most recent job (backend orders by `created_at.desc()`). Display job name + type if exists, "None" otherwise.

**Files**:
- `frontend/src/pages/ExperimentView.tsx` — import `useJobs`, call with page=1 perPage=1, replace static "None" with dynamic content showing the latest job's `jobType` (formatted) or "None"

**No backend changes. No new tests** (presentational).

---

## 3. E. coli Normalization Factor in QC Report (S)

**Problem**: Pipeline calculates E. coli reads/rate but doesn't surface the normalization factor (scalar = ecoli_reads / uniquely_aligned_reads). Users need this value for spike-in normalized bigWig generation.

**Files & Changes**:

1. **`backend/schemas/qc_report.py`** — add `ecoli_normalization_factor: float` to `AlignmentReactionMetrics`

2. **`backend/pipelines/alignment.py`**:
   - Add `"Ecoli_Normalization_Factor"` to `_QC_CSV_HEADERS` (line 50)
   - In `_write_qc_csv` (line 217): add the new column to the row dict
   - In real `run()` QC metrics (line 786): compute `ecoli_normalization_factor = round(ecoli_reads / uniq_reads, 6) if uniq_reads > 0 else 0.0` and add to metrics dict
   - In `_load_canned_qc_data` (line 239): compute factor from existing ecoli/unique columns
   - In `mock_run` fallback metrics (line 887): add the field

3. **`backend/services/qc_report_service.py`** — in `_parse_qc_csv` (line 37): use `row.get("Ecoli_Normalization_Factor", "0")` for backward compatibility with old CSVs

4. **`frontend/src/api/types.ts`** — add `ecoliNormalizationFactor: number` to `AlignmentReactionMetrics`

5. **`frontend/src/components/alignment/AlignmentQCReportPanel.tsx`** — add column definition for the new field after `ecoliAlignmentRate`, formatted to 6 decimal places. Also add an info panel entry explaining the factor.

**Tests**:
- `test_alignment_pipeline.py` — update expected CSV headers and mock metrics assertions
- `test_qc_report.py` — update sample CSV data and schema validation

**Backward compat**: `_parse_qc_csv` uses `row.get()` with default so old CSVs without the column still parse.

---

## 4. Notes "Manage" Link — Backend PATCH + Inline Editor (M)

**Problem**: `AlignmentInfoPanel.tsx:72` "Manage" span has no onClick. No backend PATCH endpoint exists.

### Backend

1. **`backend/schemas/job.py`** — add `JobUpdate(CamelModel)` with `notes: str | None = None`

2. **`backend/services/job_service.py`** — add `update_job_notes()`:
   - Reuse `get_experiment_with_permission` to verify user is admin/contributor on the job's experiment
   - `UPDATE` only the `notes` field, commit, refresh, return updated job
   - Pattern: fetch job → verify experiment membership → update → return

3. **`backend/routers/jobs.py`** — add `PATCH /api/v1/jobs/{job_id}`:
   - Accept `JobUpdate` body
   - Call `update_job_notes`, return `JobRead`
   - 403 if unauthorized, 404 if not found

### Frontend

4. **`frontend/src/api/jobs.ts`** — add `updateJobNotes(jobId: number, notes: string | null)`

5. **`frontend/src/hooks/useJobs.ts`** — add `useUpdateJobNotes()` mutation, invalidates `['job', jobId]`

6. **`frontend/src/components/alignment/AlignmentInfoPanel.tsx`** — replace `<span>Manage</span>` with:
   - A `<button>` that toggles an editing state
   - In edit mode: show a `<textarea>` pre-filled with current notes + Save/Cancel buttons
   - On save: call the mutation, on success toggle back to display mode
   - Keep the component self-contained (no new modal needed)

**Tests**:
- `test_jobs_api.py` — add `test_update_job_notes_200`, `test_update_job_notes_403`, `test_update_job_notes_404`

---

## 5. Batch Download in Files Sub-tab (M)

**Problem**: `AlignmentFilesPanel.tsx:54-58` opens one browser tab per file. Streaming ZIP infrastructure exists from Phase 2 but only for experiment-level paths.

### Backend

1. **`backend/routers/files.py`** — add `POST /api/v1/jobs/{job_id}/files/batch-download`:
   - Accept body `{ "outputIds": [int] }`
   - Verify user access via ProjectMember join (same pattern as `download_job_file`)
   - Fetch `JobOutput` records for given IDs, confirm all belong to this job
   - Resolve each `file_path` to absolute, validate exists and within STORAGE_ROOT
   - Reuse existing `_stream_zip()` function to stream zip response
   - Respect `BATCH_DOWNLOAD_MAX_FILES` and `BATCH_DOWNLOAD_MAX_BYTES` limits

2. **`backend/schemas/file.py`** — add `JobBatchDownloadRequest(CamelModel)` with `output_ids: list[int]`

### Frontend

3. **`frontend/src/api/jobs.ts`** — add `batchDownloadJobFiles(jobId, outputIds)`:
   - POST with `responseType: 'blob'`
   - Create object URL → trigger download → revoke URL

4. **`frontend/src/components/alignment/AlignmentFilesPanel.tsx`** — replace `handleDownload`:
   - If 1 file selected: use existing single-file download (window.open)
   - If >1 files selected: call `batchDownloadJobFiles` with selected output IDs

**Tests**:
- `test_files.py` — add `test_batch_download_job_files_200`, `test_batch_download_job_files_unauthorized`

---

## 6. SNAP-CUTANA K-MetStat Spike-in QC (L)

**Problem**: Pipeline doesn't grep for 32 barcodes. UI has placeholder. Per CLAUDE.md, this was explicitly planned for Phase 3 and barcode sequences are available.

### A. Barcode Data Module (new file)

**`backend/pipelines/spike_in_barcodes.py`**:
- `K_METSTAT_BARCODES: dict[str, tuple[str, str]]` — 16 PTMs → (barcode_A, barcode_B), from `references/media_misc/k_metstat_script.sh` lines 76-138
- `PTM_NAMES: list[str]` — canonical order (Unmodified, H3K4me1, ..., H4K20me3)
- `count_barcodes(r1_path: Path, r2_path: Path) -> dict[str, int]` — for each barcode, run `subprocess.run(["zgrep", "-c", barcode, str(fq_path)])` on both R1 and R2 (zgrep handles .gz natively), sum A+B per PTM. Returns {ptm_name: total_count}.
- `normalize_counts(ptm_counts: dict[str, int], on_target_ptm: str | None) -> dict[str, float]` — if on_target specified and count > 0: `pct = count / on_target_count * 100` per PTM. For IgG (on_target=None): normalize to max count.
- **Uses `zgrep -c`** instead of unzipping — produces identical counts, avoids temp files. The reference script unzips first but the grep logic is identical.

### B. Pipeline Integration

**`backend/pipelines/alignment.py`**:
- After step 13 (E. coli), before "Collect QC metrics": add **Step 14: K-MetStat Spike-in Barcode Count**
- Only runs if `rxn.get("cutana_spike_in")` is not `None` and not `"None"`
- Calls `count_barcodes(r1_abs, r2_abs)` and `normalize_counts(counts, rxn.get("cutana_spike_in_target"))`
- Stores per-reaction results in a list `spike_in_results`
- After all reactions: write `spike_in_qc.csv` to `qc_dir/`
  - Columns: `Short_Name, On_Target_PTM, Total_Barcode_Reads, Unmodified, H3K4me1, ..., H4K20me3` (raw counts)
- Add to outputs with `file_category="spike_in_qc"`
- In `mock_run`: if any reaction has spike-in, generate plausible stub CSV (on-target ~85%, off-target 1-15%)

### C. QC Schema Extension

**`backend/schemas/qc_report.py`**:
- Add `SpikeInPTMResult(CamelModel)`: `ptm_name: str`, `raw_count: int`, `pct_recovery: float`
- Add `SpikeInReactionResult(CamelModel)`: `short_name: str`, `on_target_ptm: str | None`, `total_barcode_reads: int`, `ptm_results: list[SpikeInPTMResult]`
- Add `spike_in_results: list[SpikeInReactionResult] | None = None` to `AlignmentQCReport`

### D. QC Report Service

**`backend/services/qc_report_service.py`**:
- Add `_parse_spike_in_csv(csv_path: Path) -> list[SpikeInReactionResult]` — read CSV, compute percentages via `normalize_counts` logic
- In `get_alignment_qc_report`: look for `spike_in_qc.csv` in job outputs, if found parse and include in response

### E. Frontend Heatmap

**`frontend/src/api/types.ts`**: add `SpikeInPTMResult`, `SpikeInReactionResult`, add `spikeInResults` to `AlignmentQCReport`

**`frontend/src/components/alignment/AlignmentQCReportPanel.tsx`**: replace placeholder (lines 218-232) with:
- A styled HTML `<table>` with colored cells (not Recharts — matches CUTANA Cloud's simple colored table approach)
- Rows = reactions with spike-in, Columns = 16 PTMs
- Cell value = `pct_recovery` formatted to 1 decimal
- Cell background color: green (0-20% for off-target = pass), yellow (20-50%), red (>50%)
- On-target cell: blue/highlighted (should be ~100%)
- Below table: legend explaining pass criteria (<20% off-target per CUTANA docs)
- If `spikeInResults` is null/empty and `hasSpikeIn` is true: show "Processing..." or keep placeholder
- If `hasSpikeIn` is false: show "No SNAP-CUTANA spike-in data" (existing behavior)

**Tests**:
- New `backend/tests/test_spike_in.py`: test barcode counting logic (mock subprocess), test normalization, test CSV parsing
- Update `test_alignment_pipeline.py`: verify mock_run generates spike-in CSV when reactions include spike-in
- Update `test_qc_report.py`: test QC report with spike-in data present

---

## 7. Analysis Queue Column Filters (M)

**Problem**: Only global search + status dropdown. Spec §5 requires per-column filter icons.

**Approach**: Add server-side filters for the most useful columns. Full per-column filter UI (DataTable enhancement) is deferred to Phase 4+.

### Backend

1. **`backend/services/job_service.py`** — extend `list_all_jobs_for_user` signature:
   - Add `job_type: str | None = None`, `search: str | None = None`
   - `job_type`: exact match on `AnalysisJob.job_type`
   - `search`: `ilike` match on `AnalysisJob.name`, `Experiment.name`, or `Project.name`

2. **`backend/routers/jobs.py`** — add query params to `list_all_jobs`:
   - `job_type: str | None = Query(None, alias="jobType")`
   - `search: str | None = Query(None)`
   - Pass through to service

### Frontend

3. **`frontend/src/api/jobs.ts`** — update `listAllJobs` to accept `jobType?: string` and `search?: string`

4. **`frontend/src/hooks/useJobs.ts`** — update `useAllJobs` to accept and pass the new params, include in query key

5. **`frontend/src/pages/AnalysisQueuePage.tsx`**:
   - Add "Executable" dropdown filter next to existing Status dropdown (values: alignment, trimming, peak_calling)
   - Wire the search input to the `search` backend param (debounced, server-side) instead of client-side filtering
   - Pass `jobType` and `search` to `useAllJobs`

**Tests**:
- `test_jobs_api.py` — add `test_list_all_jobs_job_type_filter`, `test_list_all_jobs_search_filter`

---

## Cross-Cutting Concerns

### Backward Compatibility
- QC CSV format changes (issues 3, 6): `_parse_qc_csv` must use `row.get()` with defaults for new columns
- Old job outputs on disk will lack new CSV columns — the parser handles this gracefully

### No Database Migrations
- No new tables or columns needed. Issue 4 updates existing `notes` column. Issues 3/6 add data to CSV files on disk.

### Mock Mode
- Issues 3 and 6 modify `mock_run` — both generate correct stub data including new fields

### Validation After Each Issue
- `docker compose exec api ruff check .`
- `docker compose exec api ruff format --check .`
- `cd frontend && npx tsc --noEmit`
- `docker compose exec api pytest tests/`

---

## Files Summary

### Backend Modified
- `backend/routers/jobs.py` (issues 1, 4, 7)
- `backend/routers/files.py` (issue 5)
- `backend/schemas/qc_report.py` (issues 3, 6)
- `backend/schemas/job.py` (issue 4)
- `backend/schemas/file.py` (issue 5)
- `backend/services/job_service.py` (issues 4, 7)
- `backend/services/qc_report_service.py` (issues 3, 6)
- `backend/pipelines/alignment.py` (issues 3, 6)

### Backend New
- `backend/pipelines/spike_in_barcodes.py` (issue 6)
- `backend/tests/test_spike_in.py` (issue 6)

### Frontend Modified
- `frontend/src/pages/ExperimentView.tsx` (issue 2)
- `frontend/src/pages/AnalysisQueuePage.tsx` (issue 7)
- `frontend/src/api/types.ts` (issues 3, 6)
- `frontend/src/api/jobs.ts` (issues 4, 5, 7)
- `frontend/src/hooks/useJobs.ts` (issues 4, 7)
- `frontend/src/components/alignment/AlignmentQCReportPanel.tsx` (issues 3, 6)
- `frontend/src/components/alignment/AlignmentInfoPanel.tsx` (issue 4)
- `frontend/src/components/alignment/AlignmentFilesPanel.tsx` (issue 5)

### Tests Updated
- `backend/tests/test_jobs_api.py` (issues 1, 4, 7)
- `backend/tests/test_alignment_pipeline.py` (issues 3, 6)
- `backend/tests/test_qc_report.py` (issues 3, 6)
- `backend/tests/test_files.py` (issue 5)
