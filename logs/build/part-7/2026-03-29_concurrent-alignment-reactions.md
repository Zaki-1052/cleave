# 2026-03-29 — Concurrent Reaction Processing in Alignment Pipeline

## What was done

- **Fixed missing `psycopg2-binary` dependency** — worker's `_sync_check_terminated()` needs a sync DB engine, which requires psycopg2. Added to `pyproject.toml`.
- **Added `MAX_CONCURRENT_REACTIONS` config setting** (default 8) to `config.py`.
- **Refactored alignment pipeline** from sequential `for rxn in reactions:` loop to `ThreadPoolExecutor`-based concurrent dispatch:
  - Created `_AlignmentContext` frozen dataclass for shared immutable state across threads.
  - Extracted loop body into standalone `_process_reaction()` function — each thread gets its own reaction, log file, and returns its own results (no shared mutable state).
  - Per-reaction log files merged into master log after all threads complete (zero contention).
  - Thread allocation: `max(2, total_threads // concurrent_count)` per reaction.
  - Partial failure handling: surviving reactions continue; all-fail raises `PipelineError`.
  - `TerminatedError` cancels remaining futures immediately via `executor.shutdown(cancel_futures=True)`.
- **Parallelized `mock_run()` too** — same `ThreadPoolExecutor` pattern for test consistency.
- **Created 7 new concurrency tests** in `test_alignment_concurrency.py`.
- **All 48 tests pass** (29 existing alignment + 7 new concurrency + 8 worker + 4 output service).

## Decisions made

- Per-reaction log files (not a shared lock) for thread-safe logging — simpler, zero contention.
- `MAX_CONCURRENT_REACTIONS=1` gives identical sequential behavior as regression escape hatch.
- No changes to `base.py`, `worker.py`, or other pipeline stages — concurrency is contained in `alignment.py`.
- Production target: m5.8xlarge (32 vCPUs, 128GB RAM) → 8 concurrent reactions × 4 threads each.

## Open items

- Manual validation with real alignment job on local worker (bioinformatics tools required).
- Consider applying same pattern to peak calling pipeline if reaction-level parallelism is desired there.

## Key file paths

- `backend/config.py` — added `MAX_CONCURRENT_REACTIONS`
- `backend/pyproject.toml` — added `psycopg2-binary`
- `backend/pipelines/alignment.py` — full refactor (sequential → concurrent)
- `backend/tests/test_alignment_concurrency.py` — new test file (7 tests)
