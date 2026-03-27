# Phase 3 Bug-Fix & Polish Session

**Date**: 2026-03-27
**Scope**: Address 7 "Still Open" items from Phase 3 summary before Phase 4

---

## What Was Done

### Issue 1: `perPage` Alias Missing on `list_experiment_jobs` (S)
- Added `alias="perPage"` to `backend/routers/jobs.py:48`
- Added regression test confirming `perPage=1` returns only 1 item

### Issue 2: "Last Job" in ExperimentView Header (S)
- Wired `useJobs(experimentId, 1, 1)` to fetch latest job
- Displays formatted job type label ("Alignment", "Peak Calling", etc.) or "None"
- Frontend-only change, no backend modifications

### Issue 3: E. coli Normalization Factor in QC Report (S)
- Added `ecoli_normalization_factor` field to `AlignmentReactionMetrics` schema
- Pipeline computes `ecoli_reads / unique_reads` in both real and mock modes
- QC CSV includes new `Ecoli_Normalization_Factor` column
- QC report service parses with backward compatibility (`row.get()` with default)
- Frontend displays new column in QC report table with info panel description

### Issue 4: Notes "Manage" Link (M)
- Added `JobUpdate` schema and `PATCH /api/v1/jobs/{job_id}` endpoint
- `update_job_notes` service verifies admin/contributor permission
- Frontend inline editor: textarea with Save/Cancel, mutation hook invalidates cache
- 3 new tests: success, unauthorized, not-found

### Issue 5: Batch Download in Files Sub-tab (M)
- Added `POST /api/v1/jobs/{job_id}/files/batch-download` endpoint
- Accepts `output_ids`, resolves paths, streams zip via existing `_stream_zip()`
- Frontend: single file opens tab, multiple files trigger batch zip download

### Issue 6: SNAP-CUTANA K-MetStat Spike-in QC (L)
- Created `backend/pipelines/spike_in_barcodes.py` with all 32 barcode sequences
- `count_barcodes()` uses `zgrep -c` on R1+R2, sums A+B per PTM
- `normalize_counts()` computes % recovery relative to on-target PTM
- Pipeline step 14 runs barcode counting when `cutana_spike_in != "None"`
- Writes `spike_in_qc.csv` alongside alignment metrics
- Mock mode generates plausible stub data (on-target ~100%, off-target ~5%)
- QC report service parses spike-in CSV and includes in response
- Frontend renders colored heatmap table (green/yellow/red + blue on-target)
- Legend and pass criteria (<20% off-target per CUTANA docs)

### Issue 7: Analysis Queue Column Filters (M)
- Backend: added `job_type` and `search` query params to `GET /api/v1/jobs`
- Service: `ilike` search across job name, experiment name, project name
- Frontend: added "Executable" type dropdown, debounced server-side search
- Removed client-side filtering in favor of server-side

## Test Count: 216 (was 213, +3 new)

## Files Created
- `backend/pipelines/spike_in_barcodes.py`

## Files Modified
- `backend/routers/jobs.py` (perPage, PATCH, queue filters)
- `backend/routers/files.py` (batch download)
- `backend/schemas/qc_report.py` (ecoli factor, spike-in schemas)
- `backend/schemas/job.py` (JobUpdate)
- `backend/schemas/file.py` (JobBatchDownloadRequest)
- `backend/services/job_service.py` (update_job_notes, queue filters)
- `backend/services/qc_report_service.py` (ecoli factor, spike-in parsing)
- `backend/pipelines/alignment.py` (ecoli factor, spike-in step 14, mock)
- `frontend/src/pages/ExperimentView.tsx` (Last Job)
- `frontend/src/pages/AnalysisQueuePage.tsx` (filters)
- `frontend/src/api/types.ts` (ecoli factor, spike-in types)
- `frontend/src/api/jobs.ts` (updateNotes, batchDownload, queue filters)
- `frontend/src/hooks/useJobs.ts` (useUpdateJobNotes, queue params)
- `frontend/src/components/alignment/AlignmentQCReportPanel.tsx` (ecoli col, heatmap)
- `frontend/src/components/alignment/AlignmentInfoPanel.tsx` (notes editor)
- `frontend/src/components/alignment/AlignmentFilesPanel.tsx` (batch download)
- `backend/tests/test_jobs_api.py` (+3 tests)
- `backend/tests/test_alignment_pipeline.py` (updated for ecoli factor)
- `backend/tests/test_qc_report.py` (updated for ecoli factor)

## Still Deferred
- EC2 real-mode validation (deployment task)
- Email notifications (Phase 7.5, needs SES)

---

## Security Review & Fix Session (same day)

**Scope**: End-to-end security review of Phases 1-3, fix confirmed vulnerabilities.

### Review Process
- 3 parallel exploration agents examined: auth/permissions, input validation/injection, data exposure/crypto
- 5 targeted validation agents filtered false positives (JWT algorithm confusion, IDOR, command injection, XSS, FastQC)
- 1 confirmed HIGH-severity vulnerability; 10 other candidates validated as false positives

### Confirmed Vulnerability: Path Traversal via `short_name`
- `short_name` field on reactions accepted arbitrary strings (including `../`)
- Used directly in 20+ f-string file path constructions in `alignment.py`
- Contributor could write files outside intended job directory within STORAGE_ROOT

### Fix (defense in depth, 2 layers)
1. **Schema validation** (`schemas/reaction.py`): Added `_validate_safe_name()` with regex `^[A-Za-z0-9][A-Za-z0-9_\-\.]{0,99}$`. Applied to `short_name` and `fastq_prefix` on both `ReactionCreate` and `ReactionUpdate`. CSV import automatically protected.
2. **Pipeline validation** (`pipelines/alignment.py`): Same regex check in `validate()` as defense-in-depth against schema bypass.

### Files Modified
- `backend/schemas/reaction.py` (validators for short_name + fastq_prefix)
- `backend/pipelines/alignment.py` (defense-in-depth validation)
- `backend/tests/test_reactions.py` (+8 security tests)
- `backend/tests/test_alignment_pipeline.py` (+2 security tests)

### Test Count: 226 (was 216, +10 new security tests). All passing, ruff clean.

### Additional Hardening (from review recommendations)
1. **FastQC iframe sandbox** (`FastqcReportModal.tsx:164`): Added `sandbox="allow-same-origin"` to prevent script execution in the FastQC HTML report iframe. Defense-in-depth — the HTML is generated server-side by FastQC, but sandboxing blocks any theoretical JS injection.
2. **COOKIE_SECURE documentation** (`.env.example`): Added comment reminding to set `COOKIE_SECURE=true` in production (HTTPS required).
3. **Rate limit on /auth/refresh** (`routers/auth.py`): Added `@limiter.limit("10/minute")` — login had 5/min and register 3/min but refresh was unlimited.
