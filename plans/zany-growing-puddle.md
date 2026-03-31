# Phase 4.4: Peak Calling Sub-tabs — Gap Closure

## Context

Phase 4.4 ("Build Info, Input, Files sub-tabs") was **already implemented in Phases 4.2 and 4.3**. All frontend components exist and work: `PeakCallingTab.tsx` (orchestrator with 5 sub-tabs), `PeakCallingInfoPanel.tsx` (details/methods/notes), `PeakCallingInputPanel.tsx` (reactions table), `PeakCallingFilesPanel.tsx` (category-filtered file browser), and `PeakCallingQCReportPanel.tsx` (FRiP metrics + annotation chart). All backend endpoints are in place.

However, two gaps remain that block the Phase 4 Done Criteria item **"Peak calling files browsable by category (BED, FRiP, Annotation)"**:

1. **The `frip` file category returns no files** — the frontend defines it, but the pipeline never produces files with `file_category: "frip"`
2. **Log files are not registered in real mode** — mock mode registers them, real mode doesn't
3. **Two existing tests are broken** — Phase 4.3 changed `top_peaks` from `"qc_report"` to `"top_peaks"` category but didn't update the assertions in `test_peak_calling_pipeline.py`

## Scope

**2 files modified, ~60 lines added. No frontend changes needed.**

- `backend/pipelines/peak_calling.py` — add FRiP CSV generation + log registration
- `backend/tests/test_peak_calling_pipeline.py` — fix broken assertions + add FRiP tests

---

## Steps

### Step 1: Add FRiP CSV helper to peak_calling.py

Add `_FRIP_CSV_HEADERS` constant and `_write_frip_csv()` function after the existing `_write_peak_qc_csv()` (around line 356).

**Headers**: `Short_Name, Control_Short_Name, Uniquely_Aligned_Read_Pairs, Reads_in_Peaks, FRiP`

Follow the exact same pattern as `_write_peak_qc_csv()` — uses `csv.DictWriter`, reads from `all_metrics` list, rounds FRiP to 4 decimal places.

### Step 2: Register FRiP CSV in `run()` (real mode)

After the `top_peaks` CSV block (~line 1124), add:
- Write `frip_scores.csv` to `qc_dir` via `_write_frip_csv(all_metrics, frip_csv)`
- Register as output with `file_category: "frip"`, `reaction_id: None` (job-level)

### Step 3: Register FRiP CSV in `mock_run()`

Same addition after the `top_peaks` block (~line 1310) in `mock_run()`.

### Step 4: Register log files in `run()` (real mode)

Inside the per-reaction loop in `run()`, after annotation_stats registration (~line 1090), add:
```python
for log_file in sorted(logs_dir.glob(f"{short_name}*.log")):
    _add_output(log_file, "log", "txt")
```

This matches mock mode behavior where logs are registered per-reaction.

### Step 5: Fix broken test assertions in test_peak_calling_pipeline.py

**`test_mock_run_output_categories` (line 268)**:
- Change expected set from `{"bed", "annotation", "annotation_stats", "log", "qc_report"}` to `{"bed", "annotation", "annotation_stats", "log", "qc_report", "top_peaks", "frip"}`

**`test_mock_run_reaction_ids_assigned` (lines 343-345)**:
- Change `len(job_level) == 2` to `len(job_level) == 3`
- Change `all(... == "qc_report")` assertion to check for `{"qc_report", "top_peaks", "frip"}` set

### Step 6: Add new FRiP tests

Add 3 tests:
1. **`test_write_frip_csv`** — unit test for the CSV writer function (correct headers, data, formatting)
2. **`test_mock_run_frip_csv_produced`** — verifies file exists on disk after mock_run
3. **`test_mock_run_frip_file_registered`** — verifies output has `file_category: "frip"`, `reaction_id: None`

---

## Verification

1. `docker compose exec api ruff check backend/pipelines/peak_calling.py` — lint clean
2. `docker compose exec api ruff format --check backend/pipelines/peak_calling.py` — format clean
3. `docker compose exec api pytest tests/test_peak_calling_pipeline.py -v` — all tests pass (49 existing + 3 new = 52, with 2 existing fixed)
4. `npx tsc --noEmit` in frontend — type check clean (no frontend changes, but verify)

## Critical Files

- `backend/pipelines/peak_calling.py` — FRiP CSV generation + log registration
- `backend/tests/test_peak_calling_pipeline.py` — test fixes + new tests
- `frontend/src/lib/constants.ts:124` — already defines `frip` category (no changes needed)
- `frontend/src/components/peak-calling/PeakCallingFilesPanel.tsx` — already handles all categories (no changes needed)
