# Plan: Section 34 — DMR x Chromatin Mark Interval Permutation

## Context

Sections 12, 14, and 19 of the biomodal visualization pipeline use Fisher's exact tests to assess DMR-chromatin mark overlap. Fisher's assumes independence, but genomic features cluster spatially (adjacent DMRs, Polycomb domains, co-regulated neighborhoods), making p-values anti-conservative. Section 34 validates these Fisher results using `regioneReloaded::crosswisePermTest()`, which generates an empirical null via circular chromosome-level permutation of genomic intervals.

**Target file:** `scripts/viz_sections/section_34_permutation_dmr_chromatin_marks.R`
**Validates:** sections 12a (ATAC), 14a/14b (K119ub), 19f (H3K27ac)
**Runtime:** ~20-30 min at 5,000 permutations, 8 cores

---

## Implementation Plan

### Block 0: Header + Source shared config
- Comment header with figure IDs (34a, 34b, 34c)
- `source("scripts/viz_sections/_shared_config.R")`

### Block 1: Load section-specific packages
```r
library(regioneR)
library(regioneReloaded)
library(BSgenome.Mmusculus.UCSC.mm10)
```
These are NOT in `_shared_config.R`. No fallback if missing.

### Block 2: Define permutation constants
- `PERM_NTIMES=5000`, `PERM_CORES=8`, `PERM_PER_CHR=TRUE`
- `PERM_RANFUN="randomizeRegions"`, `PERM_EVFUN="numOverlaps"`, `PERM_SEED=42`

### Block 3: Build genome object
- `BSgenome.Mmusculus.UCSC.mm10` → `getGenomeAndMask("mm10")$genome`
- Restrict to `standard_chrs <- paste0("chr", c(1:19, "X"))` — no chrY
- `stopifnot(length(genome) == 20)`

### Block 4: Build Alist (2 DMR direction sets)
- `hyper_gr <- dmr_to_granges(mc_dmr %>% filter(significant, mod_difference > 0))`
- `hypo_gr <- dmr_to_granges(mc_dmr %>% filter(significant, mod_difference < 0))`
- Restrict to standard_chrs, set seqlevels to match genome
- `stopifnot(length(hyper_gr) > 0, length(hypo_gr) > 0)`

### Block 5: Build Blist (8 chromatin mark peak sets)
- ATAC: `load_chip_peaks(ATAC_FILES$up/down)`
- K119ub: `load_chip_peaks(K119UB_FILES$ctrl/mut)` + locally-defined `derive_differential_peaks()` for gained/lost
- H3K27ac: `load_chip_peaks(H3K27AC_FILES$ctrl/mut)`
- Helper `restrict_to_standard(gr)` to filter+set seqlevels for all 8 sets
- `stopifnot(length(x) > 0)` for each entry

**`derive_differential_peaks()`** is NOT in `_shared_config.R` — defined locally in sections 14/15/16/19/27. Must define it locally here too:
```r
derive_differential_peaks <- function(ctrl_gr, mut_gr) {
  list(
    gained = mut_gr[countOverlaps(mut_gr, ctrl_gr) == 0],
    lost   = ctrl_gr[countOverlaps(ctrl_gr, mut_gr) == 0],
    shared = mut_gr[countOverlaps(mut_gr, ctrl_gr) > 0]
  )
}
```

### Block 6: RDS cache check + crosswisePermTest
- Cache path: `TABLES_DIR/permutation_34_dmr_marks.rds`
- If cache exists → `readRDS()`. Otherwise → run `crosswisePermTest()` + `makeCrosswiseMatrix(pvcut=1)` + save RDS
- Progress logging with estimated runtime

### Block 7: Extract per-cell permutation results
- Access `cw_34@multiOverlaps` — list of data.frames, one per Alist entry
- Each data.frame has 11 columns: `name`, `z_score`, `p_value`, `norm_zscore`, `adj_p_value`, `n_hits`, etc.
- Bind into tidy `perm_results` data.frame with `Alist_name` column added

### Block 8: Figure 34a — Crosswise z-score heatmap
- `plotCrosswiseMatrix(cw_34, matrix_type = "association")` → ggplot object
- Save via `save_multiformat_ggplot()` to `OUTPUT_DIR/34a_crosswise_dmr_x_marks/`
- **Fallback:** If `plotCrosswiseMatrix` returns non-ggplot (base plot/grob), use `save_multiformat_base()` with `quote()` wrapper

### Block 9: Recompute per-cell Fisher tests inline
Recompute the 4 original 2×2 Fisher tests (not read from disk — section 19f was never saved to TSV):

| Fisher test | Rows | Columns |
|-------------|------|---------|
| 12a | Hyper/Hypo DMRs | ATAC Up/Down overlap counts |
| 14a | Hyper/Hypo DMRs | K119ub Ctrl/Mut overlap counts |
| 14b | Hyper/Hypo DMRs | K119ub Gained/Lost overlap counts |
| 19f | Hyper/Hypo DMRs | H3K27ac Ctrl/Mut overlap counts |

Each uses `sum(countOverlaps(dmr_gr, mark_gr) > 0)` pattern.

### Block 10: Build 16-row comparison table
- Map each crosswise cell to its parent Fisher test (4 cells per Fisher)
- Columns: `dmr_set`, `mark_set`, `original_section`, `original_figure`, `fisher_or`, `fisher_p`, `perm_z`, `perm_p`, `perm_norm_z`, `concordance`
- Concordance classification:
  - **Confirmed:** Fisher p<0.05 AND perm p<0.05, same direction
  - **Weakened:** Fisher p<0.05 but perm p≥0.05
  - **Strengthened:** Fisher p≥0.05 but perm p<0.05
  - **Concordant NS:** Both p≥0.05
- Save as `TABLES_DIR/permutation_34_comparison.tsv`

### Block 11: Figure 34b — Fisher vs Permutation comparison
- Forest-style ggplot: x = z-score, y = 16 test IDs
- Convert Fisher p to z-equivalent: `qnorm(1 - p/2) * sign(log2(OR))`
- Two points per row (Fisher circle, Permutation triangle)
- Color by concordance category
- Dashed vertical line at z=0
- Save to `OUTPUT_DIR/34b_fisher_vs_permutation_comparison/`

### Block 12: Figure 34c — Local z-score curve
- Find strongest association from `perm_results` (max |z_score|)
- RDS cache: `TABLES_DIR/permutation_34_local_zscore.rds`
- `multiLocalZscore(A=strongest_Alist, Blist=Blist, window=50000, step=1000, ranFUN, evFUN, genome)`
- `makeLZMatrix()` → `plotSingleLZ(RS=strongest_b, smoothing=TRUE)`
- Save to `OUTPUT_DIR/34c_local_zscore_strongest/`

### Block 13: Console summary
- Print permutation parameters, concordance summary counts, strongest association

---

## Output Files

| File | Path | Format |
|------|------|--------|
| Crosswise heatmap | `OUTPUT_DIR/34a_crosswise_dmr_x_marks/` | PDF+SVG+JPG |
| Fisher-vs-perm comparison | `OUTPUT_DIR/34b_fisher_vs_permutation_comparison/` | PDF+SVG+JPG |
| Local z-score curve | `OUTPUT_DIR/34c_local_zscore_strongest/` | PDF+SVG+JPG |
| Permutation results cache | `TABLES_DIR/permutation_34_dmr_marks.rds` | RDS |
| Local z-score cache | `TABLES_DIR/permutation_34_local_zscore.rds` | RDS |
| Comparison table | `TABLES_DIR/permutation_34_comparison.tsv` | TSV |

---

## Critical Files to Reference During Implementation

- `_shared_config.R` — all pre-loaded data, helpers, paths
- `section_14_h2ak119ub_correlation.R` — `derive_differential_peaks()` definition, Fisher test pattern
- `section_19_h3k27ac_peak_analysis.R` — 19f Fisher test (not saved to disk, must recompute)
- `docs/regioneReloaded.Rmd` — API reference for `crosswisePermTest`, `multiLocalZscore`, S4 slot structure
- `docs/permutations.md` — ground-truth spec (section 3)

## Key Design Decisions

1. **Define `derive_differential_peaks()` locally** rather than adding to `_shared_config.R` — matches existing pattern (5 other sections define it locally)
2. **Recompute Fisher tests inline** rather than reading saved TSVs — section 19f never saved to disk, and inline recomputation ensures exact same GRanges objects are used for both Fisher and permutation
3. **RDS caching** for the expensive `crosswisePermTest` and `multiLocalZscore` calls — first section to do this, but specified in permutations.md
4. **No chrY** in genome object — consistent with dataset (mixed-sex samples, chrY coverage unreliable)

## Verification

1. **Quick test:** Set `PERM_NTIMES=100` → verify script runs end-to-end, produces all 3 figures + comparison TSV
2. **Check figure 34a:** 2×8 heatmap with blue/red z-scores, sensible clustering
3. **Check comparison TSV:** 16 rows, all concordance categories populated, Fisher ORs match section 12/14/19 outputs
4. **Full run:** Set `PERM_NTIMES=5000` → final results, verify RDS caching works on re-run
5. **Integration:** Confirm `run_all_sections.sh` auto-discovers section_34 (glob pattern `section_*.R`)
