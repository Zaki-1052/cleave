# Phase 2.8: Trimming Pipeline Module — Implementation Plan

## Context

Phase 2.8 adds the **first worker-queue-based pipeline** in Cleave. Prior to this, FastQC ran inline as a background task after upload. Trimming introduces the full job lifecycle: user submits a job via API, worker picks it up, pipeline executes, outputs are persisted to DB and disk. This sets the architectural pattern for all subsequent pipelines (alignment, peak calling, etc.).

**Why now**: Users upload raw FASTQs that may contain adapter contamination. After FastQC runs, Cleave should detect adapters and offer one-click trimming. This is a feature CUTANA Cloud lacks entirely — it's one of Cleave's key differentiators.

**What it does**: Two-stage trim (Trimmomatic adapter/quality trim + kseq_test fixed-length trim to 42bp), matching the lab's `references/data_workdir/integrated.sh` lines 49-58 exactly.

---

## Implementation Steps

### Step 1: Persist adapter_status from FastQC

FastQC already parses `adapter_status` (pass/warn/fail) in `pipelines/fastqc.py:70-71` and logs it in `fastqc_service.py:95`, but it's discarded — never stored in DB or returned to frontend. Fix this.

**Files to modify:**

1. **`backend/models/fastq_file.py`** — Add column:
   ```python
   adapter_status: Mapped[str | None] = mapped_column(String)
   ```

2. **New Alembic migration** — `add_adapter_status` (revises `35ad430891c0`):
   ```python
   op.add_column('fastq_files', sa.Column('adapter_status', sa.String(), nullable=True))
   ```

3. **`backend/services/fastqc_service.py`** — Line 79-84 update values dict: add `adapter_status=result.adapter_status`

4. **`backend/schemas/fastq_file.py`** — Add `adapter_status: str | None = None` to `FastqFileRead`

5. **`frontend/src/api/types.ts`** — Add `adapterStatus: string | null` to `FastqFile` interface

---

### Step 2: Implement Jobs Router (currently 501 stubs)

This is the first use of the job queue, so the jobs API endpoints need real implementations. Minimum viable: create, get, and list-for-experiment.

**New file: `backend/services/job_service.py`**
- `create_job(db, experiment_id, user_id, job_create: JobCreate) -> AnalysisJob | None`
  - Verify user is admin/contributor on the experiment's project (reuse `_get_experiment_with_permission` pattern from `fastq_service.py:116-129`)
  - Create `AnalysisJob` record with `status="queued"`, `launched_by=user.id`
  - Return None if experiment not found or user lacks permission
- `get_job(db, job_id, user_id) -> AnalysisJob | None`
  - Join through experiment -> project_members to verify access
- `list_jobs_for_experiment(db, experiment_id, user_id, page, per_page) -> tuple[list[AnalysisJob], int] | None`

**Modify: `backend/routers/jobs.py`** — Replace all 3 stubs with real endpoints:
- `POST /experiments/{experiment_id}/jobs` — creates job, returns `JobRead` (201)
- `GET /jobs/{job_id}` — returns `JobRead`
- `GET /experiments/{experiment_id}/jobs` — returns `PaginatedResponse[JobRead]`

Auth via `current_active_user` dependency (same pattern as `fastq_files.py`).

**New frontend files:**
- `frontend/src/api/jobs.ts` — `createJob()`, `getJob()`, `listJobs()`
- `frontend/src/hooks/useJobs.ts` — `useCreateJob()` mutation, `useJob(jobId)` query with polling while status is `queued`/`running` (use `refetchInterval` pattern from `useFastqs.ts`)

---

### Step 3: Trimming Pipeline Module

**New file: `backend/pipelines/trimming.py`**

Class `TrimmingStage(PipelineStage)` implementing the full interface.

**`validate(params)`** — Check required keys:
- `experiment_id`, `project_id`
- `fastq_pairs` (list of `{prefix, r1_path, r2_path, r1_id, r2_id}`)
- Optional overrides with defaults: `adapter_file="Truseq3.PE.fa"`, `illuminaclip="2:15:4:4:true"`, `leading=20`, `trailing=20`, `slidingwindow="4:15"`, `minlen=25`, `kseq_length=42`

**`run(job_id, params, working_dir)`** — Two-stage subprocess chain per FASTQ pair:

Stage 1 (Trimmomatic):
```python
cmd = [
    "java", "-jar", trimmomatic_jar, "PE",
    "-threads", str(threads), "-phred33",
    r1_input, r2_input,
    r1_paired_out, r1_unpaired_out, r2_paired_out, r2_unpaired_out,
    f"ILLUMINACLIP:{adapter_path}:{illuminaclip}",
    f"LEADING:{leading}", f"TRAILING:{trailing}",
    f"SLIDINGWINDOW:{slidingwindow}", f"MINLEN:{minlen}",
]
subprocess.run(cmd, capture_output=True, text=True, check=True)
```

Stage 2 (kseq_test):
```python
subprocess.run([kseq_bin, r1_paired, str(kseq_length), r1_final], ...)
subprocess.run([kseq_bin, r2_paired, str(kseq_length), r2_final], ...)
```

Output paths: `{STORAGE_ROOT}/projects/{pid}/{eid}/fastqs/trimmed/{prefix}_R1_001_trimmed.fastq.gz`

Returns dict with `outputs` list containing file metadata for each trimmed FASTQ.

**`mock_run(job_id, params, working_dir)`** — Per `docs/todos.md` requirement, must create real stub files:
1. Sleep 2s (matching existing pattern)
2. For each input pair, **copy** the input FASTQs to the trimmed output paths (ensures downstream pipeline stages have real files to read)
3. Return same output dict shape as real mode

**`generate_methods_text(params)`** — Manuscript-ready text:
> "Adapter sequences were removed using Trimmomatic (PE mode, ILLUMINACLIP:Truseq3.PE.fa:2:15:4:4:true, LEADING:20, TRAILING:20, SLIDINGWINDOW:4:15, MINLEN:25). Reads were subsequently trimmed to a uniform length of 42bp using kseq_test (CUTRUNTools)."

**Modify: `backend/pipelines/__init__.py`** — Refactor dispatcher to use a stage registry:
```python
from pipelines.trimming import TrimmingStage

_STAGES: dict[str, PipelineStage] = {
    "trimming": TrimmingStage(),
}

def run(job_type: str, params: dict, working_dir: Path) -> dict:
    stage = _STAGES.get(job_type)
    if stage is None:
        if settings.PIPELINE_MODE == "mock":
            return _mock_run(job_type, params, working_dir)  # fallback for unregistered types
        raise PipelineError(f"Unknown pipeline: {job_type}")
    if settings.PIPELINE_MODE == "mock":
        return stage.mock_run(params.get("job_id", 0), params, working_dir)
    return stage.run(params.get("job_id", 0), params, working_dir)
```

This preserves backward compatibility while routing registered pipelines through their stage classes.

---

### Step 4: Worker Enhancement + Trimming Service

**Modify: `backend/worker.py`**

1. Inject `job_id` into params before calling pipeline:
   ```python
   run_params = {**job.params, "job_id": job.id}
   result = pipeline_run(job.job_type, run_params, working_dir)
   ```

2. After successful pipeline completion, dispatch post-processing by job type:
   ```python
   if job.job_type == "trimming" and result.get("outputs"):
       await create_trimmed_fastq_records(
           experiment_id=job.experiment_id,
           project_id=...,  # from job params
           job_id=job.id,
           trimmed_outputs=result["outputs"],
       )
   ```

3. Store `started_at` timestamp when job begins running.

4. Create notification for job launcher on completion/error.

**New file: `backend/services/trimming_service.py`**

`create_trimmed_fastq_records()` — Uses `async_session_factory()` (same pattern as `fastqc_service.py`):
- For each trimmed FASTQ pair, create new `FastqFile` records with:
  - `is_trimmed=True`
  - `file_path` pointing to `fastqs/trimmed/`
  - Correct `prefix`, `read_direction`, `file_size_bytes`
  - `upload_source="trimming"`
- Create `JobOutput` records linking each file to the job
- Atomically update `storage_bytes` on experiment and project
- Trigger FastQC on trimmed files (post-trim QC, same as post-upload)

---

### Step 5: Frontend — Adapter Detection Banner + Trim UI

**Modify: `frontend/src/pages/experiment/FastqsTab.tsx`**

Add adapter detection banner between the header and the DataTable. Derive state from existing `useFastqs()` data (no new endpoint needed):

```typescript
const rawFastqs = fastqs.filter(f => !f.isTrimmed);
const filesWithAdapters = rawFastqs.filter(
  f => f.adapterStatus === 'warn' || f.adapterStatus === 'fail'
);
const hasTrimmedFiles = fastqs.some(f => f.isTrimmed);
const showBanner = filesWithAdapters.length > 0 && !hasTrimmedFiles && !adapterDismissed;
```

Banner (amber warning style, matching existing error banner pattern):
- Text: "Adapters detected in {N} of {M} files — trimming recommended"
- Three buttons: **Trim** (primary, submits job with defaults), **Configure** (outlined, opens config modal), **Skip** (secondary, dismisses banner)

**Trim in-progress state**: After clicking Trim, replace the banner with a progress indicator: "Trimming in progress..." with spinner. Poll via `useJob()` hook. On completion, invalidate `['fastqs', experimentId]` query — new trimmed files appear automatically.

**New file: `frontend/src/components/fastqs/TrimConfigModal.tsx`**

Modal with form fields for all trimming parameters (adapter file dropdown, numeric inputs for quality thresholds, kseq length). Defaults pre-filled. On submit, calls `createJob` with configured params. Close modal and show progress banner.

**Trimmed file display** — Add badge to filename column:
```tsx
{row.isTrimmed && (
  <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
    trimmed
  </span>
)}
```

---

### Step 6: Tests

**`backend/tests/test_trimming_pipeline.py`** (unit):
- `test_validate_valid_params` — returns empty error list
- `test_validate_missing_required` — returns error messages
- `test_mock_run_creates_files` — verify stub files exist on disk at expected paths
- `test_mock_run_return_shape` — verify dict has `status`, `outputs` keys
- `test_generate_methods_text` — verify text includes all parameters

**`backend/tests/test_jobs_api.py`** (integration):
- `test_create_trimming_job_201` — submit job, verify status=queued
- `test_create_job_unauthorized_403` — non-member gets 403
- `test_get_job_200` — fetch job by ID
- `test_list_jobs_for_experiment_200` — paginated list
- `test_adapter_status_in_fastq_response` — upload FASTQs, verify `adapterStatus` field after FastQC

**`backend/tests/test_trimming_service.py`** (unit):
- `test_create_trimmed_records` — verify FastqFile with is_trimmed=True
- `test_storage_bytes_updated` — verify atomic update
- `test_job_outputs_created` — verify JobOutput records

---

## Key Files

| File | Action | Purpose |
|------|--------|---------|
| `backend/models/fastq_file.py` | Modify | Add `adapter_status` column |
| `backend/migrations/versions/...` | New | Add adapter_status migration |
| `backend/services/fastqc_service.py` | Modify | Persist adapter_status |
| `backend/schemas/fastq_file.py` | Modify | Add adapter_status to response |
| `backend/services/job_service.py` | New | Job CRUD service |
| `backend/routers/jobs.py` | Modify | Implement 3 endpoints |
| `backend/pipelines/trimming.py` | New | Core trimming pipeline |
| `backend/pipelines/__init__.py` | Modify | Stage registry dispatcher |
| `backend/services/trimming_service.py` | New | Persist trimmed file records |
| `backend/worker.py` | Modify | Job ID injection + post-processing |
| `frontend/src/api/types.ts` | Modify | Add adapterStatus to FastqFile |
| `frontend/src/api/jobs.ts` | New | Jobs API module |
| `frontend/src/hooks/useJobs.ts` | New | Job query/mutation hooks |
| `frontend/src/pages/experiment/FastqsTab.tsx` | Modify | Adapter banner + trim UI |
| `frontend/src/components/fastqs/TrimConfigModal.tsx` | New | Trim config modal |

## Reuse Existing

- `PipelineStage` base class from `pipelines/base.py`
- `PipelineError` exception from `pipelines/base.py`
- `_get_experiment_with_permission()` pattern from `fastq_service.py:116-129`
- `_update_storage_bytes_atomic()` pattern from `fastq_service.py:100-113`
- `async_session_factory()` for worker/background DB sessions from `database.py`
- `CamelModel` base for all new schemas from `schemas/common.py`
- `JobCreate`/`JobRead` schemas already at `schemas/job.py`
- `current_active_user` auth dependency from `auth.py`
- Adapter file `Truseq3.PE.fa` already at `backend/pipelines/adapters/`
- `Modal` component for trim config from `components/ui/Modal.tsx`
- DataTable, Button, Card components

## Verification

1. **Unit**: `docker compose exec api pytest tests/test_trimming_pipeline.py tests/test_jobs_api.py tests/test_trimming_service.py -v`
2. **Manual E2E**: Upload test FASTQs (`test_data/`) → FastQC runs → adapter banner appears → click Trim → job created (queued) → worker picks up → mock trimming runs → trimmed files appear in table with green badge → adapter banner disappears
3. **Lint**: `docker compose exec api ruff check .` + `cd frontend && npx tsc --noEmit`
