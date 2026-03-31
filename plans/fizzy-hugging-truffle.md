# Plan: Concurrent Reaction Processing in Alignment Pipeline

## Context

The alignment pipeline currently processes reactions sequentially in a `for rxn in reactions:` loop. On the production EC2 (m5.8xlarge: 32 vCPUs, 128GB RAM), this wastes resources — each reaction's Bowtie2→SAMtools→Picard→deepTools chain is fully independent. Processing 5 reactions sequentially when they could run concurrently means ~5x longer wall-clock time.

**Goal**: Use `ThreadPoolExecutor` to run reactions concurrently within an alignment job, with configurable concurrency and thread-per-reaction allocation.

## Files to Modify

| File | Change |
|------|--------|
| `backend/config.py` | Add `MAX_CONCURRENT_REACTIONS` setting |
| `backend/pipelines/alignment.py` | Refactor reaction loop → concurrent dispatch |
| `backend/tests/test_alignment_concurrency.py` | New test file for concurrency-specific tests |

**No changes to**: `base.py`, `worker.py`, other pipeline stages, or existing tests.

## Implementation Steps

### Step 1: Add config setting (`config.py`)

Add `MAX_CONCURRENT_REACTIONS: int = 8` to the Settings class. Default 8 for m5.8xlarge (32 vCPUs ÷ 4 threads/reaction). Setting to `1` gives identical sequential behavior (regression escape hatch).

### Step 2: Extract per-reaction work into `_process_reaction()` (`alignment.py`)

Create a frozen dataclass `_AlignmentContext` to bundle all shared immutable state (tool paths, genome config, directory paths, settings). This is passed to each thread safely.

```python
@dataclass(frozen=True)
class _AlignmentContext:
    bowtie2: str
    samtools: str
    bedtools: str | None
    picard: str
    bam_coverage: str | None
    compute_matrix: str | None
    plot_heatmap: str | None
    genome: str
    bt2_index: str
    ecoli_bt2_index: str
    blacklist_bed: Path | None
    annotation_bed: Path | None
    eff_genome_size: int
    threads: int              # per-reaction thread count
    remove_dups: bool
    remove_dac: bool
    bin_size: int
    smoothed_bin_size: int
    bams_dir: Path
    bigwigs_dir: Path
    heatmaps_dir: Path
    logs_dir: Path
    job_dir: Path
    rel_job: str
    cancelled: Callable[[], bool] | None
    job_id: int
```

Extract the loop body (lines 397-867) into:

```python
def _process_reaction(rxn: dict, ctx: _AlignmentContext, reaction_log: Path) -> dict:
    """Process a single reaction. Thread-safe — no shared mutable state."""
    # Returns {"metrics": dict, "spike_in_entry": dict|None, "outputs": list[dict]}
```

Key changes inside `_process_reaction`:
- **Master log**: Each thread writes to its own `reaction_log` file (e.g., `logs/IgG_pipeline.log`). No shared log = no contention.
- **Thread count**: `ctx.threads` replaces the global `threads` in Bowtie2 `-p`, samtools `-@`, etc.
- **Results**: Returns a dict instead of appending to shared lists.
- **`_run`/`_run_piped` closures**: Defined inside, capturing `reaction_log` and `ctx.cancelled`.
- **`_add_output` closure**: Appends to a local `outputs` list, not the shared one.
- The raw `subprocess.run` calls (Bowtie2 stdout→file, SAM→BAM stdout→file) also use `reaction_log` for their `append_to_master_log` calls.

### Step 3: Replace `for` loop with `ThreadPoolExecutor` dispatch (`alignment.py`)

In `run()`, after the setup code (lines 313-395), replace the loop with:

1. **Compute concurrency**: `concurrent = min(MAX_CONCURRENT_REACTIONS, len(reactions))`
2. **Compute threads/reaction**: `max(2, total_threads // concurrent)` — ensures Bowtie2 never gets <2 threads
3. **Create per-reaction log paths**: `logs_dir / f"{short_name}_pipeline.log"`
4. **Build `_AlignmentContext`** with computed `threads`
5. **Submit futures**: `executor.submit(_process_reaction, rxn, ctx, log_path)` for each reaction
6. **Collect results via `as_completed`**:
   - On `TerminatedError`: `executor.shutdown(wait=False, cancel_futures=True)` then re-raise
   - On other exceptions: capture `(short_name, error)`, continue processing remaining reactions
7. **Merge per-reaction logs** into the master log (main thread, sequential, in original reaction order)
8. **Aggregate results** in original reaction order → `all_metrics`, `spike_in_data`, `outputs`
9. **Handle partial failures**: If all fail → raise `PipelineError`. If some fail → log warning, continue with successes.

### Step 4: Parallelize `mock_run()` too (`alignment.py`)

Same pattern: extract per-reaction mock work into `_mock_process_reaction()`, dispatch via `ThreadPoolExecutor`. Change `time.sleep(5)` to `time.sleep(1)` per reaction to avoid artificially long mock runs.

### Step 5: New tests (`test_alignment_concurrency.py`)

| Test | What it verifies |
|------|-----------------|
| `test_sequential_equivalence` | `MAX_CONCURRENT_REACTIONS=1` produces identical output to current behavior |
| `test_concurrent_mock_correct_results` | N reactions concurrently → all outputs present, QC CSV has N rows |
| `test_thread_count_calculation` | `max(2, total // concurrent)` formula edge cases |
| `test_per_reaction_log_isolation` | Each reaction's log file exists with only its own entries |
| `test_partial_failure_handling` | One bad reaction doesn't kill others; error reported |
| `test_cancellation_propagation` | `TerminatedError` propagates, remaining futures cancelled |
| `test_output_ordering_deterministic` | Outputs follow original reaction order, not completion order |

## Thread-Safety Analysis

| Concern | Solution |
|---------|----------|
| `all_metrics`, `outputs` lists | Eliminated — each thread returns its own; main thread aggregates |
| `master_log` file | Eliminated — per-reaction log files, merged sequentially after all threads complete |
| `run_cmd`/`run_piped_cmd` | Unchanged — each thread passes its own `reaction_log` as `master_log` param |
| `cancelled()` callback | Already thread-safe (sync DB read with own engine) |
| File path collisions | None — files namespaced by `short_name` (validated unique) |
| structlog | Thread-safe by design |

## Regression Safety

- `MAX_CONCURRENT_REACTIONS=1` → `ThreadPoolExecutor(max_workers=1)` = sequential behavior
- Output structure from `run()` is identical: same dict shape, same keys
- All 27 existing alignment tests pass unchanged (they test validation, mock_run shape, methods text, helpers)
- All 8 worker tests pass unchanged (worker calls pipeline identically)

## Verification

1. `docker compose exec api pytest tests/test_alignment_pipeline.py -v` — existing tests pass
2. `docker compose exec api pytest tests/test_alignment_concurrency.py -v` — new concurrency tests pass
3. `docker compose exec api pytest tests/test_worker.py -v` — worker tests pass
4. `docker compose exec api ruff check .` — no lint issues
5. Manual test: run a real alignment job with the local worker and verify all reactions complete, logs are clean, and QC CSV has all rows
