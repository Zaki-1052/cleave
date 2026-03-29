# Cleave — Active TODOs

## 1. Refactor: Roman Normalization as Core Pipeline Step

### Problem

The lab's workflow runs Roman normalization **before** Pearson correlation and custom heatmaps. The normalized bigWigs (`_rnorm.bw`) are at 50bp resolution and are the standard input for all downstream visualization steps. Currently in Cleave, Roman normalization is a standalone Phase 6 "lab extension" that users launch independently, and other steps (Pearson correlation, custom heatmaps) use raw alignment bigWigs (20bp resolution from `bamCoverage --binSize 20`).

This causes a critical bug in Pearson correlation: the `peak_extractor.r` script assumes `dx=50` resolution bigWigs. When fed 20bp bigWigs, the bin mapping is misaligned and produces near-zero correlations (~0.01-0.35) instead of the expected 0.75-0.95. Verified by running the lab's actual `pearson.py` on their Roman-normalized matrix on the EC2 instance — correlations were correct (0.75-0.95).

### Solution

1. **Reposition Roman normalization** in the pipeline flow: Alignment → Peak Calling → **Roman Normalization** → Pearson Correlation / Custom Heatmaps
2. **Wire Pearson correlation** to use `_rnorm.bw` files from a normalization job, not raw bigWigs from alignment
3. **Wire custom heatmaps** to prefer `_rnorm.bw` files when available
4. **Update the UI** so that the Pearson correlation and custom heatmap wizards select from normalization job outputs (or fall back to raw bigWigs with a warning)
5. **Fix the Pearson heatmap description** — remove the ">0.9 for replicates" claim (unverified) and the "-1 (inverse correlation)" framing (misleading for non-negative genomic signal data)

### Caveats

- Roman normalization is **mouse-only** (hardcoded chr1-19 + chrX). For human samples, either extend Roman normalization to support chr1-22 + chrX, or use a fallback approach (e.g., `deepTools multiBigwigSummary` at a fixed bin size, or adjust `dx` in the R script to match the raw bigWig bin size)
- The `pearson_matrix.R` script itself is correct — the bug is purely an input resolution mismatch. No changes needed to the R script if it receives 50bp bigWigs

---

## 2. Auto-Pipeline Mode (FastQC-Gated)

### Feature

Add an "auto mode" that, when enabled, detects that certain FastQC quality metrics are met after upload and automatically runs the entire pipeline end-to-end without manual intervention: FastQC → Trimming (if adapters detected) → Alignment → Peak Calling → Roman Normalization → Pearson Correlation.

### Behavior

1. User uploads FASTQs and defines reactions as normal
2. FastQC runs automatically (already implemented)
3. If FastQC metrics pass predefined thresholds (e.g., per-base quality scores, adapter content levels, total reads), auto mode kicks in:
   - If adapters detected above threshold → queue trimming, then alignment
   - If no adapters → queue alignment directly
   - After alignment completes → queue peak calling with default settings (MACS2 narrow, q=0.01, IgG control auto-assigned)
   - After peak calling completes → queue Roman normalization (mouse only)
   - After normalization completes → queue Pearson correlation
4. Each step uses sensible defaults from `PEAK_CALLING_DEFAULTS` and alignment Advanced Settings defaults
5. User sees the full pipeline progress via SSE status updates on the experiment view
6. User can cancel auto mode at any point — completed steps are kept, remaining steps are not queued

### FastQC Gating Criteria (to determine)

- Minimum per-base quality score threshold
- Maximum adapter contamination percentage
- Minimum total read count
- Other metrics TBD — check CUTANA Cloud docs for their QC pass/fail criteria

### Implementation Notes

- Could be a checkbox in the experiment creation wizard: "Auto-run pipeline when FastQC passes"
- Or a button on the experiment view: "Run Full Pipeline"
- Job chaining already exists via `parent_job_id` — extend to support multi-step auto-queuing
- Need to handle failures gracefully: if alignment fails, don't queue peak calling
