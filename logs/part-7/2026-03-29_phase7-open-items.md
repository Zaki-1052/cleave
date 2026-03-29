# 2026-03-29 — Phase 7 Open Items: Auto-Pipeline Retry, SSE Events, Pearson Resolution

## What Was Done

### 1. Auto-Pipeline Retry After Error
- **New endpoint**: `POST /experiments/{id}/auto-pipeline/retry` — retries the failed step with `auto_pipeline=True` so the chain resumes
- **New service function**: `retry_auto_pipeline()` in `auto_pipeline_service.py` — finds failed job, creates new job with same params + auto_pipeline flag, resets experiment status to "running"
- **Fix**: `job_service.retry_job()` now copies `auto_pipeline` flag to retried jobs and resets experiment status when retrying auto-pipeline jobs (previously broke the chain)
- **Frontend**: Retry button on AutoPipelineBanner when pipeline is in error state, wired to new API
- **4 new tests**: retry creates job with flag, resets status, 409 on non-error, preserves flag via manual retry

### 2. SSE Auto-Pipeline Status Events
- **New SSE event**: `auto_pipeline_status` — emitted when `experiment.auto_pipeline_status` changes (eliminates race condition between job completion and experiment status update)
- **New SSE query helper**: `_query_auto_pipeline_experiments()` — tracks active auto-pipeline experiments per connection
- **Frontend `useSSE.ts`**: handles `auto_pipeline_status` event, invalidates `['experiments', experimentId]` and `['experiments']`
- **Fix**: terminal `job_status` events now also invalidate specific experiment query key
- **Fix**: `ExperimentView.tsx` `onCancelled` callback was a no-op — now properly invalidates experiment query

### 3. Pearson Correlation Resolution Fix
- **Parameterized `dx`** in `pearson_matrix.R` — accepts optional 6th arg for resolution (default 50, use 20 for alignment bigWigs)
- **Backend**: `pearson_correlation.py` validates `bigwig_resolution` (20 or 50) and passes to R script
- **Frontend**: Pearson wizard includes `bigwig_resolution` in job params based on bigWig source
- **Auto-pipeline**: `_queue_pearson()` passes correct resolution based on bigWig source
- **Methods text**: reflects actual resolution instead of hardcoded "50 bp"
- **Fix**: Updated inaccurate `ChooseBigWigSourceStep` warning text (was referencing `multiBigwigSummary` which was never implemented)
- **4 new tests**: resolution 20/50 accepted, 30 rejected, methods text reflects resolution

### 4. Bug Fix: auto_pipeline_service import
- Fixed `from database import get_async_session_factory` → `from database import async_session_factory` (pre-existing bug — function didn't exist, was masked by lazy imports)

## Decisions Made
- **No multiBigwigSummary**: Parameterizing `dx` in the R script is KISS and preserves the lab's reference algorithm. Adding deepTools would create two code paths.
- **New SSE event type vs. piggybacking**: Chose dedicated `auto_pipeline_status` event to eliminate race conditions between job completion and experiment status updates.
- **Retry creates new job**: Follows existing pattern from `job_service.retry_job()` — creates a new queued job rather than re-queuing the failed one.

## Key File Paths

### Backend Modified
- `backend/services/auto_pipeline_service.py` — `retry_auto_pipeline()`, fixed import, resolution param
- `backend/services/job_service.py` — `retry_job()` now copies `auto_pipeline` flag
- `backend/services/sse_service.py` — `auto_pipeline_status` event, `_query_auto_pipeline_experiments()`
- `backend/routers/experiments.py` — retry endpoint
- `backend/pipelines/pearson_correlation.py` — `bigwig_resolution` validation + R script arg
- `backend/pipelines/scripts/pearson_matrix.R` — parameterized `dx`
- `backend/pipelines/methods_text.py` — dynamic resolution in text

### Frontend Modified
- `frontend/src/api/autoPipeline.ts` — `retryAutoPipeline()`
- `frontend/src/components/experiments/AutoPipelineBanner.tsx` — Retry button + `onRetried` prop
- `frontend/src/components/ui/ChooseBigWigSourceStep.tsx` — corrected warning text
- `frontend/src/components/pearson-correlation/NewPearsonCorrelationWizard.tsx` — `bigwig_resolution` param
- `frontend/src/hooks/useSSE.ts` — `auto_pipeline_status` handler + experiment invalidation
- `frontend/src/pages/ExperimentView.tsx` — `queryClient` + `onCancelled`/`onRetried` callbacks

### Tests Modified
- `backend/tests/test_jobs_api.py` — 4 new tests (auto-pipeline retry + flag preservation)
- `backend/tests/test_pearson_correlation_pipeline.py` — 4 new tests (resolution validation + methods)

## Test Results
- 61 tests passing (53 existing + 8 new)
- `ruff check .` + `ruff format --check .`: clean
- `tsc --noEmit`: clean
