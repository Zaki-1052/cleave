# Plan: Section 36 — Domain-Level Permutation (Compartments + Polycomb)

## Context

Sections 29 (A/B compartment enrichment) and 30 (Polycomb target enrichment) use Fisher's exact tests to assess DMR enrichment in genomic domains. These Fisher tests assume independence of observations, which is violated because compartment domains span megabases and Polycomb regions cluster. Section 36 validates these Fisher results using `regioneReloaded::crosswisePermTest()` genomic interval permutation, which preserves interval size, count, and chromosome assignment — giving an honest p-value that accounts for spatial non-independence.

**File to create:** `biomodal/downstream/scripts/viz_sections/section_36_permutation_domains.R`
**Template to follow:** `section_35_permutation_atac_loops.R` (640 lines, identical architecture)

## Implementation

### Structure (mirrors section 35 exactly)

1. **Header comment block** — purpose, sub-analyses 36A/36B, figures 36a-d, invocation
2. **Setup** — source `_shared_config.R`, load `regioneR`, `regioneReloaded`, `BSgenome.Mmusculus.UCSC.mm10` (no ChIPseeker needed)
3. **Config** — `SECTION_DIR`, permutation params, `CACHE_PATH`, compartment file/thresholds
4. **Genome object** — `getGenomeAndMask("mm10")`, filter to `chr1-19,X`
5. **Load region sets** — DMR GRanges (Alist), compartment GRanges (Blist 36A), Polycomb peaks (Blist 36B)
6. **Assemble Alist/Blist** — two sub-analyses
7. **Permutation tests** — with RDS caching
8. **Figure 36a** — crosswise heatmap (4x4)
9. **Figure 36b** — crosswise heatmap (4x2)
10. **Figure 36c** — local z-score (mC Hyper x A Compartment)
11. **Extract perm results + inline Fisher tests** — `extract_perm_results()` + `run_fisher_overlap()`
12. **Concordance classification** — Confirmed/Weakened/Strengthened/Concordant NS
13. **Figure 36d** — Fisher vs permutation dot-plot
14. **Export tables** — TSV + RDS
15. **Summary printout**

### Key Implementation Details

#### Region Sets

**Alist (shared by 36A and 36B) — 4 DMR direction sets:**
```r
mc_hyper_gr  <- dmr_to_granges(mc_dmr  %>% filter(significant, mod_difference > 0))
mc_hypo_gr   <- dmr_to_granges(mc_dmr  %>% filter(significant, mod_difference < 0))
hmc_hypo_gr  <- dmr_to_granges(hmc_dmr %>% filter(significant, mod_difference < 0))
hmc_hyper_gr <- dmr_to_granges(hmc_dmr %>% filter(significant, mod_difference > 0))
```

**Blist 36A — 4 compartment sets** (load HOMER data using section 29 pattern):
- A Compartment: bins where `mean_ctrl_pc1 > 0`
- B Compartment: bins where `mean_ctrl_pc1 < 0`
- B->A Shift: bins where `adj_pvalue < 0.05 & difference > 0.30`
- A->B Shift: bins where `adj_pvalue < 0.05 & difference < -0.30`

HOMER loading replicates section_29 lines 71-123: `read.table(COMPARTMENT_FILE, ...)`, grep for PC1/Difference/adj_pvalue columns, compute mean_ctrl_pc1, construct GRanges, filter to standard_chrs.

**Blist 36B — 2 Polycomb peak sets:**
- `load_chip_peaks(CHIP_PEAK_FILES$h3k27me3, "H3K27me3")`
- `load_chip_peaks(CHIP_PEAK_FILES$bivalent, "Bivalent")`

#### Compartment Shift Handling

B->A and A->B shift bins may be empty or very small. If either has 0 regions after filtering, exclude it from Blist_36a rather than stopping. Warn if < 50 bins.

#### Inline Fisher Tests (for comparison table 36d)

Follow section 35's pattern: for each Alist pair (contrast), compute overlap-based 2x2 Fisher against each Blist element. The 4 Alist elements form 2 natural contrasts:
- **mC contrast:** mC Hyper vs mC Hypo (for each compartment/Polycomb region)
- **hmC contrast:** hmC Hypo vs hmC Hyper

For each contrast pair (A1, A2) and each Blist target B:
```r
ov_a1 <- sum(countOverlaps(A1, B) > 0)
no_a1 <- length(A1) - ov_a1
ov_a2 <- sum(countOverlaps(A2, B) > 0)
no_a2 <- length(A2) - ov_a2
fisher.test(matrix(c(ov_a1, no_a1, ov_a2, no_a2), nrow = 2))
```
This gives one Fisher row per (RS1, RS2) pair in the crosswise matrix (all 16 for 36A, all 8 for 36B).

#### Local Z-Score (Figure 36c)

Spec says: "mC Hyper x A compartment at +/- 50kb, expected broad not focal."
```r
multiLocalZscore(A = mc_hyper_gr, Blist = Blist_36a,
                 ranFUN = "randomizeRegions", evFUN = "numOverlaps",
                 genome = genome, window = 50000, step = 1000,
                 mc.cores = 8, ntimes = 5000)
```
Then `plotSingleLZ(mlz_36, RS = "A Compartment", smoothing = TRUE)`.

#### Concordance + Original Section Mapping

```r
# 36A tests -> original_section "29"
# 36B tests -> original_section "30"
```

### Files to Read/Reuse

| File | What to reuse |
|------|---------------|
| `scripts/viz_sections/_shared_config.R` | `mc_dmr`, `hmc_dmr`, `dmr_to_granges()`, `load_chip_peaks()`, `CHIP_PEAK_FILES`, `theme_biomodal()`, `save_multiformat_ggplot()`, `OUTPUT_DIR`, `TABLES_DIR` |
| `scripts/viz_sections/section_35_permutation_atac_loops.R` | Full structural template: setup→config→genome→regions→Alist/Blist→cached crosswisePermTest→heatmaps→extract_perm_results()→inline Fisher→concordance→dot plot→export→summary |
| `scripts/viz_sections/section_29_ab_compartment_methylation_mapping.R` | HOMER compartment file loading (lines 71-123): column grep patterns, mean_ctrl_pc1, A/B classification, shift thresholds |

### Output Structure

```
plots/visualizations/36_permutation_domains/
  36a_crosswise_dmr_x_compartment/    (PDF+SVG+JPG)
  36b_crosswise_dmr_x_polycomb/       (PDF+SVG+JPG)
  36c_local_zscore_compartment/       (PDF+SVG+JPG)
  36d_fisher_vs_permutation_table/    (PDF+SVG+JPG)

plots/visualizations/tables/
  permutation_36_domains.rds          (cached crosswise objects)
  permutation_36_comparison.tsv       (test_id, sub_analysis, original_section, RS1, RS2, fisher_or, fisher_p, perm_zscore, perm_pvalue, concordance)
```

## Verification

1. **Syntax check:** `Rscript -e "parse('scripts/viz_sections/section_36_permutation_domains.R')"`
2. **Quick test (local):** Set `PERM_NTIMES <- 100` temporarily, verify:
   - RDS cache created in `TABLES_DIR`
   - 4 figure subdirectories created with PDF/SVG/JPG
   - Comparison TSV has 24 rows (16 from 36A + 8 from 36B), correct column schema
   - All concordance categories assigned
3. **Full run (HPC):** `PERM_NTIMES <- 5000`, ~20-30 minutes on 8 cores
4. **Auto-discovery:** Verify `run_all_sections.sh` picks up the new file
5. **Cache test:** Re-run script, verify it loads from RDS and skips permutation
