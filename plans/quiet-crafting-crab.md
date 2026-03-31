# Plan: Parallel Peak Calling Pipeline

## Context

The peak calling pipeline (`backend/pipelines/peak_calling.py`) processes reactions **sequentially** in a `for rxn in reactions:` loop (lines 889–1103). Both alignment and trimming pipelines already use `ThreadPoolExecutor` for concurrent per-reaction/per-pair processing. This is the last sequential pipeline. Parallelizing it follows the exact established pattern and will significantly speed up multi-reaction peak calling jobs.

## Approach: Match Trimming/Alignment Pattern Exactly

### Files to Modify
- `backend/pipelines/peak_calling.py` — primary changes
- `backend/tests/test_peak_calling_pipeline.py` — add 4 concurrency tests

### Step 1: Add Imports

Add to existing import block in `peak_calling.py`:
- `from concurrent.futures import ThreadPoolExecutor, as_completed`
- `from dataclasses import dataclass`
- `TerminatedError` and `get_threads` to the `pipelines.base` import (currently missing)

### Step 2: Define `_PeakCallingContext` Frozen Dataclass

Insert after `_call_sicer2()` (~line 720), before the `PeakCallingStage` class. Contains all immutable shared config:

- Pipeline params: `genome`, `genome_display`, `peak_caller`, `peak_size`, `q_value`, `broad_cutoff`, `fragment_filter`, `fragment_size`, `seacr_threshold`, `sicer2_window`, `sicer2_gap`, `sicer2_fdr`
- `blacklists: tuple[Path, ...]` (converted from list to tuple for immutability)
- `igg_filtered_cache: dict[str, Path]` (pre-computed before dispatch, read-only during parallel execution)
- Directory paths: `filtered_bams_dir`, `peaks_dir`, `annotation_dir`, `logs_dir`, `job_dir`
- `rel_job: str`, `threads: int`, `cancelled: Callable[[], bool] | None`

### Step 3: Define Module-Level `_process_reaction()` Function

Extracts the body of the current `for rxn in reactions:` loop (lines 889–1103) into a standalone, thread-safe function.

**Signature**: `def _process_reaction(rxn: dict, ctx: _PeakCallingContext, reaction_log: Path) -> dict`

**Returns**: `{"metrics": dict, "top_peaks": dict, "outputs": list[dict]}`

Key changes from current loop body:
- Local `_run`/`_run_piped` helpers write to per-reaction `reaction_log` (not shared `master_log`)
- IgG resolution simplified: just read from `ctx.igg_filtered_cache` (no lazy filtering)
- All shared config read from `ctx` fields
- `_add_output()` inner function stays (captures only thread-local state), builds local `outputs` list
- Cancellation checks via `ctx.cancelled` at 3 points: before fragment filter, before peak calling, before HOMER
- Returns results dict instead of appending to shared lists

### Step 4: Refactor `run()` for Parallel Dispatch

The `run()` method structure becomes:

1. **Extract params** — unchanged (lines 824–841)
2. **Create directories** — unchanged (lines 843–850)
3. **Master log header** — unchanged (lines 852–860)
4. **Resolve blacklists** — unchanged, but convert to `tuple()` at the end
5. **Pre-filter IgG BAMs** (NEW) — collect unique `igg_bam_path` values from reactions, filter each once with `_apply_fragment_filter`, build `igg_filtered_cache` dict. Uses `{igg_stem}_filtered.bam` naming (supports multiple distinct IgG controls). Cancellation check before each filter.
6. **Compute concurrency** (NEW):
   ```
   total_threads = get_threads()
   concurrent_count = min(settings.MAX_CONCURRENT_REACTIONS, len(reactions))
   threads_per_reaction = max(2, total_threads // concurrent_count)
   ```
7. **Create `_PeakCallingContext`** (NEW)
8. **Create per-reaction log files** (NEW): `{short_name}_pipeline.log` per reaction
9. **ThreadPoolExecutor dispatch** (NEW):
   - `executor.submit(_process_reaction, rxn, ctx, reaction_log)` per reaction
   - `as_completed()` collection with `TerminatedError` → `executor.shutdown(wait=False, cancel_futures=True)`
   - Individual errors collected in `errors` dict
10. **Merge per-reaction logs** into master log (in original order)
11. **Partial failure handling**: only raise if ALL reactions fail
12. **Aggregate results** in original reaction order (iterate `reactions`, look up `results[name]`)
13. **Write QC CSVs** — unchanged
14. **Consolidate tool logs** — skip `*_pipeline.log` files (already merged)
15. **Return** — unchanged

### Step 5: Refactor `mock_run()` for Parallel Dispatch

Transform the sequential `for i, rxn in enumerate(reactions):` loop:

1. Remove `time.sleep(5)` at top
2. Define nested `_mock_process_reaction(i, rxn)` — contains current loop body, adds `time.sleep(1)` per reaction, returns `{"metrics": dict, "top_peaks": dict, "outputs": list[dict]}`
3. Load canned data before dispatch (stays in `mock_run`, passed to nested fn via closure)
4. `ThreadPoolExecutor(max_workers=concurrent_count)` dispatch with index tracking
5. `as_completed()` collection into `indexed_results` dict
6. Aggregate in original order using index-based reconstruction
7. QC CSV writing — unchanged

### Step 6: Add 4 Concurrency Tests

Add to `backend/tests/test_peak_calling_pipeline.py` (not a separate file — follows the trimming pattern where concurrency tests are in the same file).

Helper: `_make_multi_reaction_params(tmp_path, n_reactions)` — creates N reactions with stub BAM files on disk.

Tests (matching trimming's 4-test pattern exactly):

1. **`test_mock_run_concurrent_correct_results`**: 5 reactions, `MAX_CONCURRENT_REACTIONS=4`. Assert `status == "complete"`, `len(qc_metrics) == 5`, all 5 short_names present.
2. **`test_mock_run_output_ordering_deterministic`**: 6 reactions, `MAX_CONCURRENT_REACTIONS=8`. Assert `qc_metrics` names are `["sample_0", ..., "sample_5"]` in order.
3. **`test_mock_run_concurrent_faster_than_sequential`**: 4 reactions, `MAX_CONCURRENT_REACTIONS=4`. Assert `elapsed < 3.0s` (4 reactions x `sleep(1)` concurrent should finish in ~1–2s).
4. **`test_mock_run_sequential_equivalence`**: 3 reactions, `MAX_CONCURRENT_REACTIONS=1`. Assert correct count, original ordering, all files exist on disk.

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Pre-filter IgG before dispatch | Eliminates shared mutable cache during parallel execution. Cleanest thread-safety approach. |
| `tuple[Path, ...]` for blacklists | Enforces immutability at type level in frozen dataclass |
| Per-reaction log files | Avoids concurrent writes to shared master_log. Merged post-execution in original order. |
| `{igg_stem}_filtered.bam` naming | Supports multiple distinct IgG controls (current code hardcodes `IgG_filtered.bam`) |
| No thread count for peak callers | MACS2/SICER2/SEACR lack thread flags. `concurrent_count` (not `threads_per_reaction`) is the primary parallelism lever. |
| Tests in same file | Matches trimming pattern; keeps all peak calling tests together |

### What Does NOT Change
- `validate()` — untouched
- `generate_methods_text()` — untouched
- All helper functions: `_call_macs2_narrow`, `_call_macs2_broad`, `_call_seacr`, `_call_sicer2`, `_apply_fragment_filter`, `_calculate_frip`, `_count_peaks`, `_extract_top_peaks`, CSV writers, canned data loaders
- No bioinformatics logic, tool flags, or parameter values change
- All 52 existing tests must continue to pass

### Thread-Safety Analysis

- **File I/O**: Each reaction writes to `{short_name}_*` prefixed files — no collisions
- **Subprocesses**: Inherently thread-safe (separate OS processes)
- **IgG cache**: Pre-computed, read-only during dispatch
- **SEACR temp files**: Include sample name in filenames; `cwd=peaks_dir` is safe since each reaction's MACS2 temp prefix is unique via `short_name`
- **`shutil.which()`**: Read-only, thread-safe

## Verification

1. Run the 52 existing peak calling tests: `docker compose exec api pytest tests/test_peak_calling_pipeline.py -v`
2. Run the 4 new concurrency tests: `docker compose exec api pytest tests/test_peak_calling_pipeline.py -k "concurrent or ordering or sequential" -v`
3. Run `ruff check` and `ruff format --check` on `backend/`
