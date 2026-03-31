# Plan: Phase 7 Open Items — Pearson Resolution Fix, SSE Auto-Pipeline Events, Auto-Pipeline Retry

## Context

Three open items remain from the normalization-refactor-auto-pipeline session (Phase 7). They are independent features that close gaps in the auto-pipeline and Pearson correlation workflows. A parallel UI refactor (passes 1–4 complete) is in progress but does NOT touch any of the files we need to modify — all target components are safe.

---

## Item 1: Pearson Correlation Resolution Fix (was "multiBigwigSummary fallback")

### Problem
The R script (`pearson_matrix.R`) hardcodes `dx <- 50` (50bp bin resolution). This matches Roman-normalized bigWigs perfectly but produces incorrect correlations when fed 20bp alignment bigWigs — the `findOverlaps` step aliases multiple 20bp intervals into 50bp bins, keeping only the last score instead of averaging.

### Decision: Parameterize `dx`, NOT add multiBigwigSummary
- Adding deepTools `multiBigwigSummary` would create two code paths and bypass the lab's reference R algorithm — violates CLAUDE.md pipeline rules
- Parameterizing `dx` is KISS: one line changes the R script, the rest of the math is already relative to `dx`
- When `dx=20`, the binning math works correctly for alignment bigWigs

### Changes

**`backend/pipelines/scripts/pearson_matrix.R`** — Accept optional 6th arg for resolution
- Line 37: Replace `dx <- 50` with `dx <- if (length(args) >= 6 && nchar(args[6]) > 0) as.integer(args[6]) else 50`
- Backward-compatible (defaults to 50)

**`backend/pipelines/pearson_correlation.py`** — Pass resolution to R script
- Add `bigwig_resolution` to validation (accept 20 or 50, default 50)
- Append resolution as 6th arg to `Rscript pearson_matrix.R` command
- Usage line: `Rscript pearson_matrix.R <sheet> <out> <genome> <mask> <restrict> <resolution>`

**`frontend/src/components/pearson-correlation/NewPearsonCorrelationWizard.tsx`** — Include resolution in params
- In param construction (~line 190): add `bigwig_resolution: bigwigSource === 'alignment' ? 20 : 50`

**`frontend/src/components/ui/ChooseBigWigSourceStep.tsx`** — Fix inaccurate warning text
- Change "Pearson will use deepTools multiBigwigSummary to re-bin at 50bp" → "The Pearson pipeline will extract signal at native 20bp resolution."

**`backend/services/auto_pipeline_service.py`** `_queue_pearson()` — Pass resolution
- Add `params["bigwig_resolution"] = 50 if bw_category == "normalization_bigwig" else 20`

**`backend/pipelines/methods_text.py`** `pearson_correlation_methods()` — Reflect actual resolution
- Change hardcoded "50 bp" to use `params.get("bigwig_resolution", 50)`

**`backend/tests/test_pearson_correlation_pipeline.py`** — Add resolution tests
- Test `bigwig_resolution=20` passes validation
- Test `bigwig_resolution=30` fails validation
- Test methods text reflects resolution parameter

---

## Item 2: SSE Auto-Pipeline Status Events

### Problem
Two gaps:
1. **Race condition**: When the worker finishes the last auto-pipeline job and calls `_mark_complete()`, the experiment's `auto_pipeline_status` changes to "complete". But the SSE `job_status` event fires when the job itself transitions — the experiment status update hasn't committed yet. The frontend refetch gets stale data.
2. **`onCancelled` callback is a no-op**: `ExperimentView.tsx` passes an empty function to `AutoPipelineBanner`, so cancellation doesn't refresh the experiment.

### Changes

**`backend/services/sse_service.py`** — Add `auto_pipeline_status` event
- Track active auto-pipeline experiments per SSE connection (dict `{exp_id: status}`)
- Each poll cycle: query experiments where `auto_pipeline=True` and status is active (`pending_fastqc`, `running`, `error`) that the user has access to (join with `ProjectMember`)
- Emit `auto_pipeline_status` event when status changes: `{"experimentId": N, "status": "..."}`
- Also emit once when transitioning to terminal states (`complete`, `cancelled`) then stop tracking

**`frontend/src/hooks/useSSE.ts`** — Handle new event type
- Add handler after `job_status` block (line 78):
```typescript
if (event.event === 'auto_pipeline_status') {
  const data = JSON.parse(event.data);
  void queryClient.invalidateQueries({ queryKey: ['experiments', data.experimentId] });
  void queryClient.invalidateQueries({ queryKey: ['experiments'] });
}
```
- Note: hooks/ is "frozen" by UI refactor, but this is a purely additive 8-line block — no existing behavior changes

**`frontend/src/hooks/useSSE.ts`** — Also invalidate specific experiment on terminal job status
- In the existing `job_status` handler, add alongside `['experiments']`:
```typescript
void queryClient.invalidateQueries({ queryKey: ['experiments', data.experimentId] });
```

**`frontend/src/pages/ExperimentView.tsx`** — Fix `onCancelled` callback
- Add `const queryClient = useQueryClient()` (import from `@tanstack/react-query`)
- Change the empty `onCancelled` to: `() => void queryClient.invalidateQueries({ queryKey: ['experiments', experiment.id] })`
- Same pattern for the new `onRetried` callback from Item 3

**`backend/tests/test_sse.py`** — Add test for new event type
- Test that auto_pipeline_status event is emitted when experiment status changes

---

## Item 3: Auto-Pipeline Retry After Error

### Problem
When an auto-pipeline job fails:
- `on_job_error()` sets `experiment.auto_pipeline_status = "error"`
- The banner shows error state but has no "Retry" button
- Manual retry via `POST /jobs/{id}/retry` creates a new job WITHOUT `auto_pipeline=True`, so the worker doesn't continue the chain
- The only recourse is to cancel and re-run the entire pipeline from scratch

### Changes

**`backend/services/auto_pipeline_service.py`** — Add `retry_auto_pipeline()`
```python
async def retry_auto_pipeline(db, experiment_id, user_id) -> AnalysisJob | None:
```
- Find the most recent failed auto-pipeline job for this experiment
- Return `None` if experiment is not in error state
- Create a new `AnalysisJob` copying all fields from the failed job, with:
  - `auto_pipeline=True` (critical — ensures chain continues)
  - `retry_of_job_id=failed_job.id`
  - `launched_by=user_id`
- Reset `experiment.auto_pipeline_status` to `"running"`
- Commit and return the new job

**`backend/services/job_service.py`** `retry_job()` — Copy `auto_pipeline` flag
- Line 260: Add `auto_pipeline=job.auto_pipeline` to the new `AnalysisJob` constructor
- If `job.auto_pipeline`, also reset experiment's `auto_pipeline_status` to `"running"`
- This fixes manual retries of auto-pipeline jobs from the job detail page too

**`backend/routers/experiments.py`** — Add retry endpoint
```
POST /experiments/{experiment_id}/auto-pipeline/retry → 201 + JobRead
```
- Auth: `current_active_user` + experiment access check
- Call `auto_pipeline_service.retry_auto_pipeline()`
- 409 if no retryable job found (experiment not in error state)

**`frontend/src/api/autoPipeline.ts`** — Add `retryAutoPipeline()` function
```typescript
export async function retryAutoPipeline(experimentId: number): Promise<AnalysisJob>
```

**`frontend/src/components/experiments/AutoPipelineBanner.tsx`** — Add Retry button
- Add `onRetried: () => void` to props interface
- Add `isRetrying` state + `handleRetry` async function calling `retryAutoPipeline()`
- Show `<Button variant="outlined" onClick={handleRetry} loading={isRetrying}>Retry</Button>` when `isError`

**`frontend/src/pages/ExperimentView.tsx`** — Wire `onRetried` callback
- Same as `onCancelled`: invalidate `['experiments', experiment.id]`

**`backend/tests/test_jobs_api.py`** (or new file) — Tests
- `test_retry_auto_pipeline_creates_job_with_flag` — new job has `auto_pipeline=True`
- `test_retry_auto_pipeline_resets_status` — experiment goes from "error" to "running"
- `test_retry_auto_pipeline_409_when_not_error` — returns 409 for non-error experiments
- `test_retry_auto_pipeline_copies_params` — params are identical to failed job
- `test_retry_job_preserves_auto_pipeline_flag` — `job_service.retry_job()` copies flag

---

## Implementation Order

1. **Item 3** (Auto-Pipeline Retry) — highest user impact, unblocks stuck pipelines
2. **Item 2** (SSE Events) — fixes race conditions and stale UI, enables Item 3's Retry button to reflect status immediately
3. **Item 1** (Pearson Resolution) — lowest urgency since wizard already steers to rnorm bigWigs

## Verification

- Run targeted tests: `docker compose exec api pytest tests/test_jobs_api.py tests/test_sse.py tests/test_pearson_correlation_pipeline.py -v`
- Frontend: `npm run build` (typecheck) in `frontend/`
- Backend: `docker compose exec api ruff check . && docker compose exec api ruff format --check .`
- Manual: start auto-pipeline → kill a step → verify Retry button appears → click Retry → verify chain resumes

## Session Log

After implementation, append to `logs/part-7/phase-7-SUMMARY.md`:
- New APIs: `POST /experiments/{id}/auto-pipeline/retry`
- New SSE event: `auto_pipeline_status`
- Pearson `bigwig_resolution` parameter (20 or 50)
- Fix: `retry_job()` now copies `auto_pipeline` flag
