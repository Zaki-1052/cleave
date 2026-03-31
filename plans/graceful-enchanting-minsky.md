# Phase 2.3: FastQC Integration — Implementation Plan

## Context

Phase 2.2 (FASTQ upload frontend) is complete. Users can upload paired-end FASTQs via drag-and-drop, and the `FastqsTab` shows a table with placeholder FASTQC and Total Reads columns. Phase 2.3 auto-runs FastQC after each upload so that `total_reads` is populated and HTML reports are available for viewing.

FastQC is different from alignment/peak-calling: it's fast (~2-3 min/file real, instant in mock) and runs **inline** after upload — NOT through the worker job queue. It uses FastAPI's `BackgroundTasks` so the upload response returns immediately while FastQC processes in the background.

---

## Step 1: DB Migration — Add `fastqc_report_path` Column

**File**: `backend/models/fastq_file.py` (MODIFY)

Add to `FastqFile`:
```python
fastqc_report_path: Mapped[str | None] = mapped_column(String)
```

Then generate + apply migration:
```bash
alembic revision --autogenerate -m "add_fastqc_report_path"
alembic upgrade head
```

**Rationale**: A nullable column is simpler and more queryable than convention-based path derivation or using `job_outputs` (which is for worker jobs). The frontend checks `fastqcReportPath !== null` to know if the report is ready.

---

## Step 2: Update Pydantic Schema

**File**: `backend/schemas/fastq_file.py` (MODIFY)

Add to `FastqFileRead`:
```python
fastqc_report_path: str | None = None
```

`CamelModel` auto-serializes this as `fastqcReportPath` in JSON.

---

## Step 3: Create `pipelines/fastqc.py`

**File**: `backend/pipelines/fastqc.py` (CREATE)

A standalone module (not routed through the worker dispatcher) with:

- **`FastqcResult` dataclass**: `total_reads: int | None`, `report_html_path: str` (relative), `adapter_status: str | None`, `module_summaries: dict[str, str]`
- **`parse_fastqc_data(txt_path: Path) -> FastqcResult`**: Parse a FastQC TXT file (tab-delimited). Extract `Total Sequences` from `>>Basic Statistics` section. Extract module pass/fail/warn statuses (especially `Adapter Content` for Phase 2.8).
- **`run_for_file(fastq_path: Path, output_dir: Path) -> FastqcResult`** (real mode): Run `fastqc --outdir={output_dir} --threads 1 --extract {fastq_path}` via `subprocess.run()`. Parse the resulting `{stem}_fastqc/fastqc_data.txt`. Return result with path to `{stem}_fastqc.html`.
- **`mock_run_for_file(fastq_path: Path, output_dir: Path) -> FastqcResult`** (mock mode): Copy a sample HTML report from `cutana/fastqc/` (pick first available, e.g., the IgG R1 file) to `{output_dir}/{stem}_fastqc.html`. Parse the corresponding sample TXT for `Total Sequences`. Return result.

**FastQC TXT format** (from `cutana/fastqc/*.stats-fastqc.txt`):
```
##FastQC	0.12.1
>>Basic Statistics	pass
#Measure	Value
Filename	...
Total Sequences	9519486    ← this is total_reads
...
>>END_MODULE
>>Adapter Content	pass     ← parse status for Phase 2.8
```

**Storage convention**:
```
{STORAGE_ROOT}/projects/{pid}/{eid}/fastqc/{stem}_fastqc.html
```
Where `{stem}` = filename without `.fastq.gz`/`.fastq` extension.

**Mock sample dir**: Derived from project root: `Path(__file__).resolve().parents[2] / "cutana" / "fastqc"`. No config variable needed — dev-only.

---

## Step 4: Create `services/fastqc_service.py`

**File**: `backend/services/fastqc_service.py` (CREATE)

Orchestration layer called as a background task after upload.

**Key function**: `run_fastqc_for_files(fastqc_inputs, project_id, experiment_id)`

- `fastqc_inputs` is a list of dicts: `{"fastq_id": int, "file_path": str, "filename": str}` — plain values extracted from SQLAlchemy objects before the request session closes.
- Creates its own DB session via `async_session_factory()` from `database.py` (the request session is closed by the time this runs).
- Iterates per-file with isolated `try/except`:
  1. Resolve absolute FASTQ path from `settings.STORAGE_ROOT / file_path`
  2. Build output dir: `{STORAGE_ROOT}/projects/{pid}/{eid}/fastqc/`
  3. Call `mock_run_for_file()` or `run_for_file()` based on `settings.PIPELINE_MODE`
  4. On success: `UPDATE fastq_files SET total_reads=..., fastqc_report_path=... WHERE id=...`
  5. Update `storage_bytes` atomically (reuse `_update_storage_bytes_atomic` pattern from `fastq_service.py`)
  6. On error: log with `structlog`, leave fields as `None`, continue to next file

**Critical**: One failed FastQC must NOT block others. Each file gets its own try/except and its own commit.

---

## Step 5: Wire FastQC into Upload Endpoint

**File**: `backend/routers/fastq_files.py` (MODIFY)

Add `BackgroundTasks` parameter to `upload_fastq_endpoint`. After building the response, extract scalar values from the result and add the background task:

```python
from fastapi import BackgroundTasks
from models.experiment import Experiment
from services.fastqc_service import run_fastqc_for_files

# Inside upload_fastq_endpoint, after result is returned from upload_fastqs:
experiment = await db.get(Experiment, experiment_id)
fastqc_inputs = [
    {"fastq_id": r.id, "file_path": r.file_path, "filename": r.filename}
    for r in result
]
background_tasks.add_task(
    run_fastqc_for_files,
    fastqc_inputs=fastqc_inputs,
    project_id=experiment.project_id,
    experiment_id=experiment_id,
)
```

**Why extract scalars**: By the time the background task runs, the request's DB session is closed. SQLAlchemy model instances can't be accessed. Plain dicts avoid this.

---

## Step 6: Add FastQC Report Download Endpoint

**File**: `backend/routers/fastq_files.py` (MODIFY)

New endpoint: `GET /experiments/{experiment_id}/fastqs/{fastq_id}/fastqc`

- Check project membership (any role: admin/contributor/viewer)
- Look up `FastqFile` by ID, verify `experiment_id` matches, verify `fastqc_report_path` is non-null
- Resolve absolute path, validate it's within `STORAGE_ROOT` (path traversal guard per `todos.md` security note)
- Return `FileResponse(abs_path, media_type="text/html")`

FastQC reports are ~900KB — small enough for direct `FileResponse` (no need for `X-Accel-Redirect`).

---

## Step 7: Clean Up FastQC Report on FASTQ Deletion

**File**: `backend/services/fastq_service.py` (MODIFY) — `delete_fastq()` function

After deleting the FASTQ file from disk, also delete the FastQC report:

```python
if fastq.fastqc_report_path:
    fastqc_abs = Path(settings.STORAGE_ROOT) / fastq.fastqc_report_path
    if fastqc_abs.exists():
        file_size += fastqc_abs.stat().st_size
        fastqc_abs.unlink()
```

Include the report size in the `storage_bytes` delta.

---

## Step 8: Frontend — Update Type + API

**File**: `frontend/src/api/types.ts` (MODIFY)

Add to `FastqFile`:
```typescript
fastqcReportPath: string | null;
```

**File**: `frontend/src/api/fastqs.ts` (MODIFY)

Add helper:
```typescript
export function getFastqcReportUrl(experimentId: number, fastqId: number): string {
  return `/api/v1/experiments/${experimentId}/fastqs/${fastqId}/fastqc`;
}
```

---

## Step 9: Frontend — Update FastqsTab FASTQC Column + Polling

**File**: `frontend/src/pages/experiment/FastqsTab.tsx` (MODIFY)

Replace the `fastqc` column placeholder with:
- If `fastqcReportPath` is null and `totalReads` is null → show animated `...` (FastQC pending)
- If `fastqcReportPath` is non-null → show clickable document icon that opens report URL in a new tab
- The Phase 2.4 modal viewer will replace the new-tab link later

**File**: `frontend/src/hooks/useFastqs.ts` (MODIFY)

Add `refetchInterval` to `useFastqs` query — poll every 5s while any file has `totalReads === null`. Stops automatically once all files have been processed:

```typescript
refetchInterval: (query) => {
  const items = query.state.data?.items;
  if (items?.some((f) => f.totalReads === null)) return 5000;
  return false;
},
```

---

## Step 10: Tests

**File**: `backend/tests/test_fastqc.py` (CREATE)

1. `test_parse_fastqc_data` — Parse sample TXT from `cutana/fastqc/`, verify `total_reads == 9519486`, `adapter_status == "pass"`
2. `test_mock_run_creates_report` — Call `mock_run_for_file()` with a temp path, verify HTML created at expected location
3. `test_mock_run_returns_total_reads` — Verify mock returns non-None `total_reads`

**File**: `backend/tests/test_fastq_upload.py` (MODIFY or existing test file)

4. `test_upload_triggers_fastqc` — Upload via API, poll `GET /fastqs` until `totalReads` is populated, verify `fastqcReportPath` is also set
5. `test_fastqc_report_endpoint_200` — After FastQC completes, `GET /fastqs/{id}/fastqc` returns 200 with `text/html`
6. `test_fastqc_report_404_before_ready` — Before FastQC, endpoint returns 404
7. `test_delete_cleans_fastqc_report` — Delete FASTQ, verify report HTML is gone from disk

---

## Files Modified/Created

| File | Action |
|------|--------|
| `backend/models/fastq_file.py` | MODIFY — add `fastqc_report_path` column |
| `backend/migrations/versions/xxx_add_fastqc_report_path.py` | CREATE — Alembic migration |
| `backend/schemas/fastq_file.py` | MODIFY — add field to `FastqFileRead` |
| `backend/pipelines/fastqc.py` | CREATE — FastQC pipeline module |
| `backend/services/fastqc_service.py` | CREATE — background orchestration |
| `backend/services/fastq_service.py` | MODIFY — FastQC cleanup on delete |
| `backend/routers/fastq_files.py` | MODIFY — BackgroundTasks + report endpoint |
| `backend/tests/test_fastqc.py` | CREATE — unit + integration tests |
| `frontend/src/api/types.ts` | MODIFY — add `fastqcReportPath` |
| `frontend/src/api/fastqs.ts` | MODIFY — add `getFastqcReportUrl` |
| `frontend/src/hooks/useFastqs.ts` | MODIFY — add refetchInterval polling |
| `frontend/src/pages/experiment/FastqsTab.tsx` | MODIFY — clickable FASTQC icon |

---

## Verification

1. `ruff check backend/` and `npx tsc --noEmit` pass
2. `alembic upgrade head` applies migration cleanly
3. `pytest backend/tests/test_fastqc.py` passes
4. Manual: Upload test FASTQs → table shows `...` → after ~5s Total Reads and FASTQC icon appear → click icon opens report in new tab
5. Manual: Delete a FASTQ → FastQC report also removed from disk
6. `pytest backend/tests/` — all existing + new tests pass
