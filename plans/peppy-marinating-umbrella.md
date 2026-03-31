# Plan: Parallelize Trimming Pipeline

## Context

Trimming currently processes FASTQ pairs sequentially. Trimmomatic's `-threads` flag controls gzip I/O parallelism which plateaus around 4-8 threads. On a 16-core machine, running 4 pairs sequentially with 16 threads each is slower than 4 pairs concurrently with 4 threads each. kseq_test is fully single-threaded, so it benefits even more from cross-pair parallelism.

The alignment pipeline already implements this pattern via `ThreadPoolExecutor`. We'll follow that exact pattern for consistency.

## Files to Modify

- `backend/pipelines/trimming.py` — main implementation
- `backend/tests/test_trimming_pipeline.py` — new concurrency tests

## Reference Files (read-only)

- `backend/pipelines/alignment.py` — ThreadPoolExecutor pattern (lines 243-274 dataclass, 275-770 `_process_reaction`, 905-1020 executor dispatch)
- `backend/tests/test_alignment_concurrency.py` — test patterns to mirror
- `backend/config.py:40` — `MAX_CONCURRENT_REACTIONS = 8` (reuse, don't change)

## Implementation Steps

### 1. Add imports to `trimming.py`

```python
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
```

### 2. Add `_TrimmingContext` frozen dataclass

After `_resolve_trimmomatic_cmd()`, before `class TrimmingStage`. Holds all immutable shared state:
- Tool paths: `trimmomatic_cmd_prefix`, `kseq_bin`, `adapter_path`
- Trim params: `illuminaclip`, `leading`, `trailing`, `slidingwindow`, `minlen`, `kseq_length`
- `threads` — **per-pair** thread count (after division), not total
- Directories: `trimmed_intermediate`, `trimmed_final`, `log_dir`
- Metadata: `project_id`, `experiment_id`
- `cancelled` callback

### 3. Extract `_process_pair(pair, ctx)` standalone function

Module-level function (not a method). Contains the current per-pair loop body:
1. Validate input files exist
2. Check `ctx.cancelled` before Trimmomatic
3. Stage 1: Trimmomatic PE with `ctx.threads` (per-pair count)
4. Stage 2: kseq_test R1 + R2
5. Return single output dict

Thread safety: each pair writes to unique prefix-based filenames — no conflicts.

### 4. Rewrite `run()` to use ThreadPoolExecutor

- **Pre-loop setup unchanged** (param extraction, tool resolution, directory creation)
- **Compute concurrency**: `concurrent_count = min(settings.MAX_CONCURRENT_REACTIONS, len(fastq_pairs))`, `threads_per_pair = max(2, threads // concurrent_count)`
- **Build `_TrimmingContext`**
- **Dispatch via `ThreadPoolExecutor(max_workers=concurrent_count)`**
  - Submit all pairs, collect via `as_completed()`
  - On `TerminatedError`: `executor.shutdown(wait=False, cancel_futures=True)`, re-raise
  - On other exceptions: store in `errors` dict, continue
- **Aggregate outputs in original pair order** (index-keyed dict → sorted list)
- **Partial failure**: only raise `PipelineError` if ALL pairs failed (matches alignment behavior)
- **Cleanup**: `shutil.rmtree(trimmed_intermediate)` after executor block (guaranteed all done)
- **Return shape unchanged**

### 5. Parallelize `mock_run()` to match

- Move `time.sleep` into per-pair nested function (alignment does `sleep(1)` per reaction)
- Use same `ThreadPoolExecutor` dispatch pattern
- Preserve return shape

### 6. Add concurrency tests

Mirror `test_alignment_concurrency.py` structure. New tests in `test_trimming_pipeline.py`:

| Test | What it verifies |
|------|------------------|
| `test_mock_run_concurrent_correct_results` | N pairs with `MAX_CONCURRENT_REACTIONS=4` all appear in outputs |
| `test_mock_run_output_ordering_deterministic` | Outputs follow original pair order, not thread completion order |
| `test_mock_run_concurrent_faster_than_sequential` | 4 pairs with sleep(1) each complete in <3s (not 4s) |
| `test_mock_run_sequential_equivalence` | `MAX_CONCURRENT_REACTIONS=1` produces identical results |

Helper: `_make_multi_pair_params(tmp_path, n_pairs)` to create N stub FASTQ pairs.

## What Does NOT Change

- `validate()`, `generate_methods_text()`, `_resolve_trimmomatic_cmd()`, `_get_threads()`, `_get_param()`, `DEFAULTS`
- Return value shape from `run()` and `mock_run()`
- All 9 existing tests pass as-is

## Verification

1. Run trimming tests: `docker compose exec api pytest tests/test_trimming_pipeline.py -v`
2. Run full suite to check for regressions: `docker compose exec api pytest tests/ -x -q`
3. Manual test: submit a trimming job with 2+ pairs and verify worker log shows concurrent processing
