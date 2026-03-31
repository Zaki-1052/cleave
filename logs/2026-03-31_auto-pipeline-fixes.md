# Auto-Pipeline Fixes — 2026-03-31

## What was done

### 1. Skip trimming if already completed
- Modified `_evaluate_fastqc_and_queue()` in `auto_pipeline_service.py` to check for existing trimmed FASTQ records (`is_trimmed=True`) before evaluating adapter status
- If trimmed FASTQs exist, skips straight to alignment with log message `auto_pipeline.trimming_already_done`

### 2. Allow re-launching auto-pipeline after cancellation
- **Problem**: Cancelling auto-pipeline set status to `"cancelled"` (truthy), which hid the "Run Full Pipeline" button and showed a banner with no action buttons — user was stuck
- **Backend**: Added `dismiss_auto_pipeline()` service function + `POST /auto-pipeline/dismiss` endpoint that resets `auto_pipeline_status` to `null`
- **Frontend (option A)**: Added "Dismiss" button on the cancelled banner that calls the dismiss endpoint, clearing the banner
- **Frontend (option B)**: "Run Full Pipeline" button now also shows when status is `cancelled`, so the user can re-launch directly without dismissing first

## Files modified

- `backend/services/auto_pipeline_service.py` — trimming skip check + `dismiss_auto_pipeline()`
- `backend/routers/experiments.py` — `POST /{id}/auto-pipeline/dismiss` endpoint
- `frontend/src/api/autoPipeline.ts` — `dismissAutoPipeline()` API call
- `frontend/src/components/experiments/AutoPipelineBanner.tsx` — `onDismissed` prop, dismiss handler, "Dismiss" button
- `frontend/src/pages/ExperimentView.tsx` — button visibility for cancelled state, `onDismissed` prop passthrough

### 3. Fix alignment missing FASTQ paths
- **Problem**: `_queue_alignment()` built reaction params with only `reaction_id` and `short_name`, missing `r1_path`/`r2_path` required by `AlignmentStage.validate()`
- **Fix**: Added FASTQ path resolution — queries `FastqFile` records, groups by prefix, prefers trimmed over raw, populates `r1_path`/`r2_path`
- Audited all other `_queue_*` functions — only alignment was broken (it reads from `FastqFile`; all others correctly resolve from `JobOutput` records)

## Decisions made

- Trimming skip checks for trimmed FASTQ records (not completed trimming jobs) — more direct, checks the actual output rather than the process
- Both dismiss (option A) and direct re-launch (option B) supported — gives user two clear paths back after cancellation
- Alignment FASTQ resolution prefers trimmed files (`is_trimmed=True`) over raw, matching the frontend's manual alignment behavior
