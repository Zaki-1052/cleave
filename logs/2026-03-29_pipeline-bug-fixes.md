# 2026-03-29 — Pipeline Bug Fixes (Phase 6 Lab Extensions)

## What was done

### DiffBind fixes
- **DiffBind R package install**: User needed `conda install -c bioconda bioconductor-diffbind` in `cleave-pipeline` env
- **No significant sites crash**: All 3 DiffBind R scripts (`diffbind_consensus.R`, `diffbind_peaklist.R`, `diffbind_peaklist_edger.R`) crashed with "Unable to plot -- no sites within threshold" when DESeq2 found no significant differential peaks. Fixed by wrapping all plot calls in a `safe_plot()` helper using `tryCatch` — plots that fail are skipped with a warning, while the results TSV and normalized counts are still saved. Partial plot files are cleaned up.
- **BiocParallel fork crash on macOS**: `dba.count()` failed with "Error processing one or more read files" due to forked parallel workers failing on macOS. Fixed with a platform-agnostic approach: `tryCatch` around `dba.count()` that retries with `SerialParam()` if parallel execution fails. Uses parallel on AWS, falls back to serial on macOS.

### Roman normalization fixes
- **Mismatched bin counts between samples**: `covg[, i] <- v` crashed with "replacement has X rows, data has Y rows" because different bigWig files had slightly different coverage extents at chromosome edges. Fixed by computing the intersection of bin names across all samples before building the coverage matrix. Also added empty-chromosome guard (`length(ychr) == 0`).
- **NA propagation in masking step**: `as.numeric()` on some bin names produced NAs, which propagated through the masking `remove` vector. Subsetting with `!NA` kept rows but filled them with NAs, crashing `quantile()`. Fixed with: (1) replace NAs in matrix with 0 after construction, (2) `remove[is.na(remove)] <- FALSE` before subsetting, (3) `na.rm = TRUE` on the quantile call.

### Pearson correlation fixes
- **Missing Python deps**: `pearson_heatmap.py` needed `pandas`, `seaborn`, `matplotlib`. Added to `backend/pyproject.toml` dependencies. User installed via conda for local dev.
- **Root cause identified — resolution mismatch**: Our bigWigs are 20bp resolution (from `bamCoverage --binSize 20`), but the R script (`pearson_matrix.R`) assumes dx=50 resolution. The lab's workflow feeds Roman-normalized bigWigs (`_rnorm.bw`) which are at 50bp resolution (from `rtracklayer::export.bw()` after import at dx=50). With 20bp bigWigs, the bin mapping is misaligned, producing near-zero correlations. Verified by running the lab's `pearson.py` on their `h3k4me3_rnorm_addison.csv` on the EC2 instance — correlations were 0.75-0.95 as expected. **Fix deferred to TODO** — need to refactor so Pearson uses Roman-normalized bigWigs.
- **Reverted earlier incorrect fixes**: Reverted intersection-based matrix building and Python-side filtering in `pearson_matrix.R` and `pearson_heatmap.py` — the R script is correct when given proper 50bp bigWigs.

### Other fixes
- **Peak calling blacklist default**: Changed from `encode_dac` to `both` (ENCODE DAC + Lab Custom) in `frontend/src/lib/constants.ts`.
- **History tab broken (422 error)**: `HistoryTab.tsx` requested `perPage=200` but the backend enforces `le=100`, returning a 422 that React Query silently swallowed. Changed to `perPage=100`.

## Decisions made
- DiffBind plots use `tryCatch` rather than checking significance threshold upfront — simpler and handles any plot-level error
- BiocParallel fallback: try parallel first, catch and retry serial — works on both macOS and AWS without platform detection
- Pearson correlation must use Roman-normalized bigWigs (50bp resolution), not raw alignment bigWigs (20bp) — matches lab workflow
- Roman normalization should be repositioned earlier in the pipeline (after alignment + peak calling, before Pearson/heatmaps)

## Open items
- Pearson correlation needs refactoring to use `_rnorm.bw` files (see TODO)
- Custom heatmaps may also need Roman-normalized bigWigs
- Roman normalization is mouse-only — need fallback for human samples using Pearson/heatmaps
- DiffBind "no significant sites" is a valid result for this dataset (PI confirmed wet lab worked, not differential results)

## Key file paths modified
- `backend/pipelines/scripts/diffbind_consensus.R`
- `backend/pipelines/scripts/diffbind_peaklist.R`
- `backend/pipelines/scripts/diffbind_peaklist_edger.R`
- `backend/pipelines/scripts/roman_normalization.R`
- `backend/pyproject.toml` (added pandas, matplotlib, seaborn)
- `frontend/src/lib/constants.ts` (blacklist default)
- `frontend/src/pages/experiment/HistoryTab.tsx` (perPage fix)
