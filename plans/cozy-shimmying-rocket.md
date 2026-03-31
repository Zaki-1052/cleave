# Plan: Section 33 — Multi-Mark DiffBind Quantitative Integration

## Context

Previously, quantitative differential binding data existed only for H2AK119ub. Other marks (ATAC, H3K27ac, H3K27me3) used binary peak presence/absence from condition-specific intersect BED files. Now all 4 marks have DiffBind results (`peaks/diffbind/`) with quantitative fold-change, FDR, and summit positions.

This enables the first **quantitative multi-mark integration with methylation** — testing the BAP1 mechanistic cascade (K119ub gain → K27me3 gain → accessibility loss → K27ac loss → methylation change) using continuous fold-changes rather than binary categories.

The existing Figure 19h does a 4-mark O/E comparison but with binary peaks. This section upgrades to quantitative DiffBind statistics and adds multivariate modeling, cross-mark correlations, and convergence analysis.

## Files to Modify

### 1. `biomodal/downstream/scripts/viz_sections/_shared_config.R`
**Add ~6 lines** near existing file path definitions (after `H3K27AC_FILES`, line ~69):

```r
DIFFBIND_FILES <- list(
  atac   = "../../peaks/diffbind/ATAC_allATAC_diffbind_results_summit_appended_ap.txt",
  k27ac  = "../../peaks/diffbind/K27ac_diffbind_results_summit_appended_ap.txt",
  k27me3 = "../../peaks/diffbind/K27me3_diffbind_results_summit_appended_ap.txt",
  k119ub = "../../peaks/diffbind/K119ub_diffbind_results_summit_appended_ap.txt"
)
```

### 2. `biomodal/downstream/scripts/viz_sections/section_33_multi_mark_diffbind_integration.R` (NEW)
~800-1000 lines following established section patterns.

## DiffBind File Schema (confirmed)

All 4 files: `Summit_Chr | Summit_Start | Summit_End | Peak_Chr | Peak_Start | Peak_End | width | strand | Conc | Conc_mut | Conc_ctrl | Fold | p.value | FDR`

- `Fold` = log2 fold-change (positive = up in mutant)
- Summit coords are 400bp windows centered on summit

## Existing Data Dependencies

| File | Source | Key Columns |
|------|--------|-------------|
| `demethylation_ratio_all_genes.tsv` | Section 22 | gene, mc_diff, hmc_diff, mc_sig, hmc_sig, delta_ratio, chromatin_state |
| `dnmt3a_feature_matrix.tsv` | Section 24 | gene, hyper_dmr, baseline_mc, baseline_hmc (for extended model) |
| `mc_dmr`, `hmc_dmr` | _shared_config.R | Pre-loaded DMR data with mod_difference, significant columns |

## Reusable Patterns

| Pattern | Source | How Used |
|---------|--------|----------|
| DiffBind loading + validation | `scripts/structural_heatmap.R:125-142` | `load_diffbind_file()` with `stopifnot` column checks |
| ChIPseeker annotation → gene | `section_15:71-94` | `annotatePeak()` → aggregate by gene |
| `build_2x2_heatmap()` | `section_19:108-180` | Copy locally for O/E enrichment (not in shared config) |
| `extract_enriched_oe()` | `section_19:183-199` | Copy locally for O/E dot plot |
| Logistic regression + AUC | `section_24` | glm + pROC pattern |
| Gene aggregation | `section_15:58-69` | Nearest-to-TSS peak per gene (fold + fdr) |

## Section Structure

### Helper Functions (defined locally for self-containment)

- **`load_diffbind(filepath, mark_name)`** — Read TSV, validate columns, return data.frame. Pattern from `structural_heatmap.R:125-142`.
- **`diffbind_to_gene(diffbind_df, mark_prefix, txdb)`** — Summit GRanges → ChIPseeker `annotatePeak()` → per-gene nearest-to-TSS aggregation (fold, fdr, n_peaks). Pattern from `section_15:58-94`.
- **`build_2x2_heatmap()`** — Copy from `section_19:108-180`.
- **`extract_enriched_oe()`** — Copy from `section_19:183-199`.

### Step 1: Load & Annotate DiffBind (4 marks)

For each mark: load TSV → build summit GRanges → ChIPseeker annotate → aggregate per gene (nearest-to-TSS peak). Output: 4 data frames with `gene`, `{mark}_fold`, `{mark}_fdr`, `{mark}_n_peaks`.

### Step 2: Build Multi-Mark Gene Profile

Left-join all 4 mark gene tables onto `demethylation_ratio_all_genes.tsv`. Result: wide table with ~20K genes, columns for mc_diff, hmc_diff, delta_ratio + 4 mark folds/FDRs. Report gene coverage per mark.

### Figure 33a: Per-Mark Volcano Plots (2x2 grid)

- x = Fold (log2FC), y = -log10(FDR)
- Color: sig up (red), sig down (blue), NS (grey) at FDR < 0.05
- Annotate quadrant counts
- 14 x 10 inches

### Figure 33b: Cross-Mark Correlation Heatmap

- 7x7 Spearman matrix: atac_fold, k27ac_fold, k27me3_fold, k119ub_fold, mc_diff, hmc_diff, delta_ratio
- `pheatmap` with red-white-blue scale, values in cells, significance asterisks
- Key predictions: K119ub↔K27me3 positive, K27me3↔K27ac negative, ATAC↔K27ac positive, K119ub↔mc_diff positive
- 10 x 9 inches

### Figure 33c: Quantitative O/E Dot Plot (upgrade from 19h)

- For each mark: classify genes as Up/Down by DiffBind (Fold direction, FDR < 0.05)
- Cross with mC/hmC direction (significant DMRs)
- Build 2x2 tables via `build_2x2_heatmap()`, extract O/E via `extract_enriched_oe()`
- 4 marks x 2 perspectives (mC, hmC) = 8 points on dot plot
- Side-by-side comparison with 19h binary results if available
- 14 x 8 inches

### Figure 33d: Methylation vs Mark Fold Scatters (4x2 grid)

- Top row: mc_diff (y) vs each mark fold (x)
- Bottom row: hmc_diff (y) vs each mark fold (x)
- Spearman rho annotated, loess smooth, colored by dual significance
- 16 x 10 inches

### Figure 33e: Multivariate Logistic Regression Forest Plot

- Outcome: `hyper_dmr` (mc_sig & mc_diff > 0) from `dnmt3a_feature_matrix.tsv`
- Model: `hyper_dmr ~ atac_fold + k27ac_fold + k27me3_fold + k119ub_fold`
- Optional extended model adding baseline_mc, baseline_hmc if section 24 data available
- Forest plot: OR with 95% CI, horizontal dot-and-whisker
- Report AUC (pROC) and compare to section 24 K119ub-only AUC
- 10 x 8 inches

### Figure 33f: Convergence Analysis

Define per-gene concordance with BAP1 mechanism:
- ATAC concordant: fold < 0, FDR < 0.05
- K27ac concordant: fold < 0, FDR < 0.05
- K27me3 concordant: fold > 0, FDR < 0.05
- K119ub concordant: fold > 0, FDR < 0.05

Count concordant marks (0-4) per gene.

- **33f-i**: Stacked bars — concordance count distribution for hyper-DMR vs hypo-DMR vs all genes
- **33f-ii**: ggplot intersection bar chart — frequency of each mark combination among genes with 2+ concordant marks
- Export convergent gene list (3+ marks) for biological follow-up
- 12 x 10 inches

### Tables (exported to TABLES_DIR)

1. `diffbind_gene_level_all_marks.tsv` — full multi-mark gene profile
2. `diffbind_cross_mark_correlations.tsv` — 7x7 Spearman matrix
3. `diffbind_quantitative_oe_comparison.tsv` — O/E results
4. `diffbind_logistic_model_coefficients.tsv` — OR, CI, p-values
5. `diffbind_convergence_per_gene.tsv` — per-gene concordance scores
6. `diffbind_convergent_genes_3plus.tsv` — genes with 3+ concordant marks

### Console Summary

Per-mark stats (N peaks, N sig up/down, N genes), cross-mark highlights, model AUC, convergence counts.

## Implementation Order

1. Add `DIFFBIND_FILES` to `_shared_config.R`
2. Create `section_33_multi_mark_diffbind_integration.R`:
   - Boilerplate + input validation (stopifnot for all files)
   - Helper functions (load, annotate, build_2x2, extract_oe)
   - Steps 1-2 (load, merge)
   - Figures 33a → 33f sequentially
   - Table exports + summary

## Verification

```bash
cd biomodal/downstream
Rscript scripts/viz_sections/section_33_multi_mark_diffbind_integration.R
```

Check:
- All 6 figure sets created in `plots/visualizations/33_*/`
- All 6 tables in `plots/visualizations/tables/diffbind_*.tsv`
- Console output shows per-mark peak counts, gene coverage, correlation values, model AUC
- Cross-mark correlation heatmap shows expected pattern (K119ub↔K27me3 positive, etc.)
- O/E enrichment values are >= those from binary 19h analysis (sharper signal expected)

## Estimated Effort

- `_shared_config.R`: 6 lines
- `section_33`: ~800-1000 lines
- Runtime: ~5-8 minutes (ChIPseeker annotation dominates)
