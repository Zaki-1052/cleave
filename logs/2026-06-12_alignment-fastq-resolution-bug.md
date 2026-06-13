# 2026-06-12 — Alignment FASTQ Path Resolution Bug

## Problem

Alignment jobs used FASTQ paths baked into job params at submission time. When the user trimmed FASTQs (creating new files with different prefixes), then deleted the raw originals, alignment still referenced the stale raw paths. Retrying the job copied the same stale params.

## What Was Done

1. **First attempt (committed `70201ca`, `db5b4f5`)**: Added `resolve_fastq_paths()` in `pipelines/base.py` to derive trimmed filenames from raw filenames on disk. Both `alignment.py` and `rnaseq_alignment.py` updated to call it. **This approach failed** — the raw and trimmed FASTQs had completely different prefixes (e.g., `index_35` vs `index_29`), so filename-based derivation could never match.

2. **Second attempt (uncommitted)**: Moved resolution to the worker layer. Added `_resolve_alignment_fastqs()` in `worker.py` that queries the DB at execution time:
   - Fetches current `FastqFile` records for the experiment (prefers `is_trimmed=True`)
   - Fetches `Reaction` records to get each reaction's current `fastq_prefix`
   - Patches `r1_path`/`r2_path` in job params before dispatching to the pipeline
   - Simplified `resolve_fastq_paths()` in `base.py` back to a simple path joiner

## Decisions Made

- **DB-level resolution over filesystem-based**: FASTQ prefixes can change between raw and trimmed files (different sequencing runs, re-uploads). Only the DB knows which prefix maps to which reaction.
- **Worker-level hook over pipeline-level**: The worker has async DB access; pipeline stages run in threads without DB sessions. Same pattern as the auto-pipeline's `_queue_alignment()`.
- **Mutate params in-place**: The worker patches `job_params["reactions"]` before passing to the pipeline. No schema changes needed.

## Open Items

- Second fix (`worker.py` changes) is uncommitted — needs commit, push, and deploy
- `ctrl2` reaction has no trimmed FASTQ at all (trimming may have failed for that sample) — will still error
- Orphaned R2-only trimmed file on disk (`260430_index_14_..._R2_001_trimmed.fastq.gz`) — no matching R1

## Key File Paths

- `backend/worker.py` — added `_resolve_alignment_fastqs()`, wired into `poll_and_run()`
- `backend/pipelines/base.py` — simplified `resolve_fastq_paths()` to plain path joiner
- `backend/pipelines/alignment.py` — uses `resolve_fastq_paths` (unchanged from first attempt)
- `backend/pipelines/rnaseq_alignment.py` — uses `resolve_fastq_paths` (unchanged from first attempt)
