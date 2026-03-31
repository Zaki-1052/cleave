# Plan: Step 3.5 — Alignment QC Report

## Context

Steps 3.1-3.4 are complete. The worker processes jobs, SSE pushes status updates, the alignment pipeline runs (mock and real mode), and the New Alignment wizard creates jobs. The `AlignmentTab` currently shows a job selector dropdown and a flat details card with a placeholder: "QC Report, Files, and IGV browser coming in the next step."

Step 3.5 adds: a backend QC report endpoint, sub-tab navigation in AlignmentTab, and the QC Report sub-tab with a metrics table, info panel, CSV download, and conditional spike-in placeholder.

## What Already Exists (Reuse, Don't Recreate)

- `backend/schemas/qc_report.py` — `AlignmentQCReport` + `AlignmentReactionMetrics` Pydantic schemas (complete, no changes needed)
- `backend/pipelines/alignment.py` — Mock mode writes `qc/alignment_metrics.csv` to `job_dir/qc/` and registers it as `JobOutput` with `file_category: "qc_report"`
- `backend/services/job_service.py:get_job()` — Auth pattern: `AnalysisJob → Experiment → ProjectMember` join filtered by `user_id`
- `backend/routers/files.py:_file_download_response()` — Handles direct FileResponse vs NGINX X-Accel-Redirect
- `frontend/src/components/ui/DataTable.tsx` — TanStack Table wrapper with sort + paginate
- `frontend/src/lib/utils.ts` — `formatBytes`, `formatDateTime`, `formatDuration` helpers
- `frontend/src/hooks/useJobs.ts` — `useJob`, `useJobs`, `useCreateJob` hooks
- `frontend/src/api/jobs.ts` — `getJob`, `listJobs`, `createJob` API functions

## Implementation Steps

### Step 1: Backend service — `backend/services/qc_report_service.py` (new file)

Create `get_alignment_qc_report(db, job_id, user_id) -> AlignmentQCReport | None`:

1. Query `AnalysisJob` with the same join pattern as `job_service.get_job()` (join through `Experiment` → `ProjectMember` for auth, filter by `user_id`)
2. Also `selectinload(AnalysisJob.outputs)` to access job outputs
3. Verify `job.job_type == "alignment"` and `job.status == "complete"` — return `None` if not
4. Find the `JobOutput` with `file_category == "qc_report"` from `job.outputs`
5. Build absolute path: `Path(settings.STORAGE_ROOT) / output.file_path`
6. Verify path exists and is within STORAGE_ROOT (path traversal guard)
7. Parse CSV with `csv.DictReader`, map to `AlignmentReactionMetrics` instances
8. Extract `reference_genome` from `job.params["reference_genome"]`
9. Return `AlignmentQCReport(reference_genome=genome, metrics=[...])`

Also create `get_qc_csv_path(db, job_id, user_id) -> Path | None` for the download endpoint:
- Same auth/validation as above, but returns the absolute file path instead of parsed data

### Step 2: Backend endpoints — modify `backend/routers/jobs.py`

Add two endpoints:

**`GET /api/v1/jobs/{job_id}/qc-report`** → `response_model=AlignmentQCReport`
- Calls `qc_report_service.get_alignment_qc_report(db, job_id, user.id)`
- 404 if job not found / unauthorized
- 409 if job not complete or not alignment type
- Returns structured JSON (CamelModel auto-serializes to camelCase)

**`GET /api/v1/jobs/{job_id}/qc-report/download`**
- Calls `qc_report_service.get_qc_csv_path(db, job_id, user.id)`
- Returns `_file_download_response(csv_path)` (reuse from `routers/files.py` — import it or extract to a shared utility)
- Actually, since this is a small CSV, just use `FileResponse` directly with `media_type="text/csv"` and `filename="alignment_metrics.csv"`

New imports: `FileResponse` from `fastapi.responses`, `AlignmentQCReport` from `schemas.qc_report`, service functions.

### Step 3: Frontend types — modify `frontend/src/api/types.ts`

Add:
```typescript
export interface AlignmentReactionMetrics {
  shortName: string;
  totalReadPairs: number;
  alignedReadPairs: number;
  uniquelyAlignedReadPairs: number;
  uniqueAlignmentRate: number;
  duplicationRate: number;
  chrmBandwidth: number;
  ecoliReadPairs: number;
  ecoliAlignmentRate: number;
}

export interface AlignmentQCReport {
  referenceGenome: string;
  metrics: AlignmentReactionMetrics[];
}
```

### Step 4: Utility — modify `frontend/src/lib/utils.ts`

Add:
```typescript
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}
```

### Step 5: API functions — modify `frontend/src/api/jobs.ts`

Add:
```typescript
export async function getQCReport(jobId: number): Promise<AlignmentQCReport> {
  const { data } = await client.get<AlignmentQCReport>(`/jobs/${jobId}/qc-report`);
  return data;
}

export async function downloadQCCsv(jobId: number): Promise<void> {
  const response = await client.get(`/jobs/${jobId}/qc-report/download`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'alignment_metrics.csv';
  a.click();
  URL.revokeObjectURL(url);
}
```

### Step 6: Hook — modify `frontend/src/hooks/useJobs.ts`

Add:
```typescript
export function useQCReport(jobId: number | null) {
  return useQuery({
    queryKey: ['qc-report', jobId],
    queryFn: () => jobsApi.getQCReport(jobId!),
    enabled: jobId !== null,
  });
}
```

### Step 7: QC Report component — `frontend/src/components/alignment/AlignmentQCReportPanel.tsx` (new file)

Two-column layout matching CUTANA Cloud §6f-iii:

**Left column (~70%)**: Reference genome label + metrics table
- Header row with "QC Report" label and reference genome display name (from `GENOME_DISPLAY_NAMES`)
- Toolbar: "Download Data as CSV" button (calls `downloadQCCsv`)
- DataTable with 9 columns:
  - Short Name (string)
  - Total Read Pairs (integer, comma-formatted via `formatNumber`)
  - Aligned Read Pairs (integer, comma-formatted)
  - Uniquely Aligned Read Pairs (integer, comma-formatted)
  - Unique Alignment Rate (%) (float, 2 decimal places)
  - Duplication Rate (%) (float, 2 decimal places)
  - chrM Bandwidth (%) (float, 2 decimal places)
  - E. coli Read Pairs (integer, comma-formatted)
  - E. coli Alignment Rate (%) (float, 2 decimal places)
- Use existing `DataTable` component with TanStack `ColumnDef[]`

**Right column (~30%)**: "About Seq Stats & Alignment Metrics" info panel
- Static Card with metric descriptions from CUTANA Cloud docs:
  - **Total Read Pairs**: Total sequencing reads/read pairs from paired-end data aligned to the selected reference genome.
  - **Aligned Read Pairs**: Reads that successfully mapped to the reference genome.
  - **Uniquely Aligned Read Pairs**: Reads mapped to exactly one genome location (multi-mappers excluded).
  - **Unique Alignment Rate**: % of reads that aligned uniquely. Targets: 70-95%. IgG controls: 20-40% (expected low due to E. coli spike-in).
  - **Duplication Rate**: % of reads that are PCR/optical duplicates. >30% suggests low library complexity.
  - **chrM Bandwidth**: % of reads mapping to mitochondrial genome.
  - **E. coli Read Pairs / Alignment Rate**: Reads aligned to E. coli genome for spike-in normalization.

**Below the table**: SNAP-CUTANA spike-in section
- Check `job.params.reactions` for any `cutana_spike_in !== "None"`
- If none: Show "No SNAP-CUTANA spike-in data available for this alignment."
- If present: Show placeholder "Spike-in QC heatmap will be available in a future update." (actual barcode grep pipeline not yet implemented)

Props: `{ jobId: number; job: AnalysisJob; }`

### Step 8: Refactor AlignmentTab — modify `frontend/src/pages/experiment/AlignmentTab.tsx`

Add sub-tab navigation infrastructure:

1. Define sub-tabs: `'info' | 'input' | 'qc-report' | 'files' | 'igv'`
2. Add `useState<SubTab>('info')` for active sub-tab
3. Render horizontal tab bar between the job selector and content (blue underline for active tab, matching CUTANA Cloud visual language)
4. Move existing details card to `info` tab content
5. When `activeSubTab === 'qc-report'` and `job.status === 'complete'`: render `<AlignmentQCReportPanel>`
6. Other tabs (`input`, `files`, `igv`): render Card with "Coming in Step 3.6" / "Coming in Phase 5" placeholder
7. Only show sub-tabs when a job is selected (not in empty state)

### Step 9: Backend tests — `backend/tests/test_qc_report.py` (new file)

Follow existing test patterns (`test_alignment_pipeline.py`, `test_jobs_api.py`):

1. **Setup**: Register user, create project, experiment, and alignment job via API
2. **Manually complete the job**: Direct DB update `status='complete'`, write mock CSV to `{STORAGE_ROOT}/projects/{pid}/{eid}/jobs/{jid}/qc/alignment_metrics.csv`, create `JobOutput` record with `file_category='qc_report'`
3. **Test cases**:
   - `test_get_qc_report_success` — GET qc-report → 200, verify JSON has `referenceGenome` + `metrics` array with correct field names and values
   - `test_get_qc_report_download` — GET qc-report/download → 200, verify CSV content
   - `test_get_qc_report_not_found` — Invalid job ID → 404
   - `test_get_qc_report_not_complete` — Job still "queued" → 409
   - `test_get_qc_report_unauthorized` — Different user (not project member) → 403/404

### Step 10: Validation

- `docker compose exec api ruff check .` — Python linting
- `docker compose exec api ruff format --check .` — Python formatting
- `cd frontend && npx tsc --noEmit` — TypeScript check
- `docker compose exec api pytest tests/test_qc_report.py -v` — New tests
- `docker compose exec api pytest tests/ -v` — Full test suite (no regressions)
- Manual: Create experiment, upload FASTQs, run alignment (mock), view QC Report tab → table renders with canned data from CUTANA CSV

## Files Modified/Created

| File | Action |
|------|--------|
| `backend/services/qc_report_service.py` | **Create** — QC report service |
| `backend/routers/jobs.py` | **Modify** — Add 2 endpoints |
| `backend/tests/test_qc_report.py` | **Create** — Backend tests |
| `frontend/src/api/types.ts` | **Modify** — Add QC types |
| `frontend/src/api/jobs.ts` | **Modify** — Add QC API functions |
| `frontend/src/hooks/useJobs.ts` | **Modify** — Add `useQCReport` hook |
| `frontend/src/lib/utils.ts` | **Modify** — Add `formatNumber` |
| `frontend/src/components/alignment/AlignmentQCReportPanel.tsx` | **Create** — QC Report component |
| `frontend/src/pages/experiment/AlignmentTab.tsx` | **Modify** — Add sub-tab navigation, integrate QC panel |

## Key Patterns to Follow

- **Backend auth**: Reuse `AnalysisJob → Experiment → ProjectMember` join pattern from `job_service.get_job()`
- **Backend file access**: Path traversal guard when resolving `STORAGE_ROOT + file_path`
- **Frontend data flow**: API function → TanStack Query hook → component
- **Frontend styling**: Tailwind classes matching existing Card, DataTable, Button patterns
- **CamelModel serialization**: Python snake_case → JSON camelCase handled by schema
