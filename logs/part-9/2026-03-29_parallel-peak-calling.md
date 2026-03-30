# 2026-03-29 — Parallel Peak Calling, Docs Update, Sidebar Reorder

## What was done

- **Parallelized peak calling pipeline** — converted sequential per-reaction loop to `ThreadPoolExecutor`, matching alignment/trimming pattern:
  - Added `_PeakCallingContext` frozen dataclass for thread-safe shared state
  - Extracted `_process_reaction()` as standalone module-level function
  - Pre-filter all unique IgG BAMs before dispatch (eliminates shared mutable cache)
  - Partial failure support (only fails if ALL reactions fail)
  - Termination shuts down executor immediately
  - `mock_run()` also parallelized with `sleep(1)` per reaction
- **Added 4 concurrency tests** to `test_peak_calling_pipeline.py`: correct results, deterministic ordering, faster-than-sequential, sequential equivalence
- **Reordered frontend sidebar** — moved Normalization above Heatmaps/Correlation to reflect expected pipeline execution order
- **Updated docs** with correct test counts (474+) and parallel processing features:
  - `docs/SPEC.md`: test table (27 files), pipeline sections, design decisions table
  - `README.md`: test counts, added "Parallel pipeline processing" to comparison table
  - `frontend/src/pages/LandingPage.tsx`: stats, comparison table, pipeline step descriptions

## Decisions made

- IgG BAMs pre-filtered before thread dispatch (not lazy-evaluated) for thread safety
- Used `{igg_stem}_filtered.bam` naming to support multiple distinct IgG controls
- Per-reaction log files merged into master log post-execution (avoids concurrent writes)
- `threads_per_reaction` included in context for pattern consistency, though peak callers lack thread flags
- All 3 CPU-bound pipelines (trimming, alignment, peak calling) now use identical ThreadPoolExecutor pattern

## Open items

- Worker must be restarted to pick up changes
- All pipelines now parallel — monitor m5.8xlarge (32 vCPU) under real load

## Key file paths

- `backend/pipelines/peak_calling.py` — parallel implementation
- `backend/tests/test_peak_calling_pipeline.py` — 56 tests (52 existing + 4 new)
- `frontend/src/pages/ExperimentView.tsx` — sidebar reorder
- `frontend/src/pages/LandingPage.tsx` — updated stats and comparison table
- `docs/SPEC.md` — updated test suite table, pipeline sections, design decisions
- `README.md` — updated test counts and comparison table
