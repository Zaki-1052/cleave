# Plan: Section 37 — Gene-Level Label-Shuffle Permutation Tests

## Context

Reviewer defense for Fisher's exact test / O/E enrichment results across sections 12-33. Gene-level 2×2 contingency tables assume independent observations, but genes on the same chromosome share regulatory context (TADs, replication timing, methylation domains). Section 37 validates ~15 Fisher tests by shuffling labels *within* chromosomes, generating an empirical null that respects genomic non-independence.

**File:** `biomodal/downstream/scripts/viz_sections/section_37_permutation_gene_level.R`
**Independent of sections 34-36** (those use regioneReloaded for interval permutation).

---

## Script Structure (7 Blocks)

### Block 0: Setup
- Source `_shared_config.R` (provides mc_dmr, hmc_dmr, all FILE paths, helpers)
- Load additional packages: `ChIPseeker`, `readxl`, `gridExtra`
- Define `SECTION_DIR = file.path(OUTPUT_DIR, "37_permutation_gene_level")`
- `PERM_NTIMES <- 10000`, `PERM_SEED <- 42`
- `stopifnot()` for ALL required input files (no fallbacks):
  - ATAC_FILES$up, $down
  - K119UB_FILES$ctrl, $mut
  - H3K27AC_FILES$ctrl, $mut
  - MECP2_FILES$annotated
  - DIFFBIND_FILES$atac, $k27ac, $k27me3, $k119ub
  - RNA-seq: `../../tads/adult_timepoint_rna-seq-BAP1_WT_KO_v2_Results.xlsx`
  - HOMER compartments: `../../tads/tad-pc-analysis/inputs/late/diffPC/diffcompartments.txt`
  - LOOP_FILES$late
  - Section 27 anchor gene exports: check `TABLES_DIR/anchor_gene_associations_great.tsv` — if section 27 produces a different filename, read section 27's export code to get exact name. Fallback approach: re-derive anchor-gene mapping inline using section 27's `build_gene_regulatory_domains()` + `associate_anchors_to_genes()` pattern if the table doesn't exist.

### Block 1: Core Function `permute_gene_2x2()`
- Directly from spec (permutations.md lines 435-473)
- Input: `gene_df` with columns `gene, chr, row_label, col_label`
- Shuffle `col_label` within chromosomes, compute Fisher OR per permutation
- Guard against Inf/0 OR: `log2(pmax(or, 1e-10))`
- Guard against zero-variance null: return `z_score = NA` with warning
- Returns list: `observed_or`, `observed_log2or`, `fisher_p`, `null_distribution`, `empirical_p`, `z_score`, `ci_95`

### Block 2: Reusable Data-Prep Helpers (6 functions)

**`prep_dmr_row(dmr_df, mod_type)`** → data.frame(gene, chr, row_label)
- Filter `significant == TRUE`
- Deduplicate by gene (keep first)
- `row_label`: "mC Up"/"mC Down" or "hmC Up"/"hmC Down" based on sign(mod_difference)

**`prep_binary_bed_col(up_path, down_path, up_label, down_label, txdb)`** → data.frame(gene, col_label)
- Load up/down BEDs as GRanges → ChIPseeker annotatePeak → aggregate per gene (count n_up, n_down)
- `col_label` = sign(n_up - n_down): up_label if positive, down_label if negative
- Used for: ATAC binary (37-01, 37-03)

**`prep_condition_col(ctrl_path, mut_path, gained_label, lost_label, txdb)`** → data.frame(gene, col_label)
- Load ctrl/mut BEDs → ChIPseeker annotatePeak each → count peaks per gene → net = n_mut - n_ctrl
- `col_label` = gained_label if net > 0, lost_label if net < 0
- Used for: K119ub (37-04), H3K27ac (37-05, 37-06)

**`prep_mecp2_col()`** → data.frame(gene, col_label)
- Load MECP2_FILES$annotated (already has SYMBOL, Fold, FDR, distanceToTSS)
- Aggregate nearest-to-TSS per gene: `group_by(SYMBOL) %>% slice_min(abs(distanceToTSS))`
- `col_label` = "MeCP2 Up" if Fold > 0, "MeCP2 Down" if < 0

**`prep_diffbind_col(diffbind_path, up_label, down_label, txdb)`** → data.frame(gene, col_label)
- Load DiffBind TSV → GRanges from Summit coords → ChIPseeker annotatePeak → aggregate nearest-to-TSS per gene
- Filter significant peaks (FDR < 0.05) → `col_label` = sign(Fold)
- Used for: 37-07a through 37-07d

**`prep_expression_col(rna_path)`** → data.frame(gene, col_label)
- `readxl::read_excel(rna_path)` → filter padj < 0.05 & |log2FoldChange| > 0.3
- `col_label` = "Expr Up" if log2FC > 0, "Expr Down" if < 0

### Block 3: Pre-Compute + Assemble All Test gene_dfs

Pre-compute shared column data (computed once, reused):
```
mc_row       <- prep_dmr_row(mc_dmr, "mc")     # for 37-01,05,07a-d,08
hmc_row      <- prep_dmr_row(hmc_dmr, "hmc")   # for 37-02,03,04,06
atac_col     <- prep_binary_bed_col(...)        # for 37-01,03
mecp2_col    <- prep_mecp2_col()                # for 37-02
k119ub_col   <- prep_condition_col(K119UB)      # for 37-04
h3k27ac_col  <- prep_condition_col(H3K27AC)     # for 37-05,06
db_atac_col  <- prep_diffbind_col(atac)         # for 37-07a
db_k27ac_col <- prep_diffbind_col(k27ac)        # for 37-07b
db_k27me3_col <- prep_diffbind_col(k27me3)      # for 37-07c
db_k119ub_col <- prep_diffbind_col(k119ub)      # for 37-07d
expr_col     <- prep_expression_col(RNA_SEQ)    # for 37-08
```

Assemble each test's gene_df via `inner_join(row_df, col_df, by="gene")`:
- chr comes from the row_df (DMR data has chr)
- Filter to complete cases, no NAs
- Log N genes and contingency table for each test

**Special tests (row labels are NOT from DMR data):**

- **37-09** (K119ub direction × Hyper/Not Hyper at loop anchors):
  - Load loop data from LOOP_FILES$late, build GREAT-style anchor-gene mapping (reuse section 27 pattern: `build_gene_regulatory_domains()` + `associate_anchors_to_genes()`)
  - Row = K119ub Gained/Lost at anchor genes (overlap anchor with K119ub diff peaks)
  - Col = Hyper / Not Hyper (from mc_dmr significant genes)
  - chr from anchor gene mapping

- **37-10** (Compartment shift × mC direction):
  - Load HOMER compartments using section 29 pattern (lines 70-143)
  - Gene → compartment shift assignment (B→A, A→B, Stable)
  - Split into **37-10a** (B→A vs Stable × mC Hyper/Hypo) and **37-10b** (A→B vs Stable × mC Hyper/Hypo) since permute_gene_2x2 requires 2×2 tables
  - chr from comp_genes data

- **37-11** (Loop Gained/Lost × MeCP2 Sig Up/Other):
  - Reuse anchor-gene mapping from 37-09 prep
  - Row = Loop Gained / Loop Lost (anchor gene's loop direction)
  - Col = MeCP2 Sig Up (FDR<0.05 & Fold>0) / Other
  - chr from anchor gene mapping

### Block 4: RDS Cache + Permutation Runner

```r
cache_path <- file.path(TABLES_DIR, "permutation_37_gene_level.rds")
if (file.exists(cache_path)) {
  all_results <- readRDS(cache_path)
} else {
  for each test:
    set.seed(PERM_SEED)
    result <- permute_gene_2x2(gene_df, ntimes = PERM_NTIMES)
    # attach metadata: test_id, source_section, description, n_genes, contingency_table
  saveRDS(all_results, cache_path)
}
```

### Block 5: Concordance Classification

Build summary_df from all results. Classify each:
- **Confirmed**: Fisher p < 0.05 AND perm p < 0.05, same direction sign
- **Weakened**: Fisher p < 0.05 but perm p >= 0.05
- **Strengthened**: Fisher p >= 0.05 but perm p < 0.05
- **Concordant NS**: both p >= 0.05

### Block 6: Figures

| Figure | Type | Details |
|--------|------|---------|
| **37a** | Forest plot | Y = test IDs (sorted by \|z\|), X = perm z-score, error bars = 95% CI from null, color = source section, stars for p<0.05, dashed at z=0 |
| **37b** | 2×2 histogram panel | Top 4 strongest effects. Grey histogram = null log2(OR), red vline = observed, shaded tail |
| **37c** | Comparison table | gridExtra::tableGrob or ggplot text table. Columns: ID, section, Fisher OR, Fisher p, perm z, empirical p, concordance. Also saved as TSV |
| **37d** | Scatter | X = observed log2(OR), Y = perm z-score. Color by concordance. geom_text_repel labels. geom_abline reference |

All saved via `save_multiformat_ggplot()` to SECTION_DIR subdirectories.

### Block 7: Exports + Summary

- `permutation_37_gene_level.rds` → TABLES_DIR (full results with null distributions)
- `permutation_37_summary.tsv` → TABLES_DIR (summary table)
- Console summary: counts per concordance category

---

## Key Files to Read/Modify

| File | Action |
|------|--------|
| `scripts/viz_sections/section_37_permutation_gene_level.R` | **CREATE** — the entire new script |
| `scripts/viz_sections/_shared_config.R` | READ — all data paths, helpers, pre-loaded data |
| `scripts/viz_sections/section_27_*.R` | READ — GREAT-style anchor-gene mapping pattern (lines 77-153), `derive_differential_peaks()` |
| `scripts/viz_sections/section_29_*.R` | READ — HOMER compartment loading pattern (lines 70-143) |
| `scripts/viz_sections/section_33_*.R` | READ — DiffBind gene-level annotation pattern |
| `scripts/viz_sections/section_15_*.R` | READ — MeCP2 gene aggregation, K119ub condition-specific pattern |
| `scripts/utils/multi_format_output.R` | READ — `save_multiformat_ggplot()` signature |

---

## Risks & Mitigations

1. **Anchor gene table from section 27 may not exist**: Inline the GREAT-style anchor-gene computation (copy from section 27: `build_gene_regulatory_domains()` + `associate_anchors_to_genes()`). This avoids cross-section dependency while keeping the code identical.

2. **Zero cells in Fisher tables**: Guard with `log2(pmax(or, 1e-10))`. Can happen in permuted tables too — same guard in the permutation loop.

3. **Test 37-10 has 3 row levels**: Split into 37-10a and 37-10b (each 2×2). Total test count becomes ~17.

4. **ChIPseeker annotatePeak is slow**: Called ~10 times (ATAC up, ATAC down, K119ub ctrl, K119ub mut, H3K27ac ctrl, H3K27ac mut, 4 DiffBind files). Pre-compute all in Block 3 before the permutation loop. ~2-3 min total.

5. **RNA-seq Excel gene names may not match DMR gene names**: Verify inner_join produces >50 genes. Log the match rate. Use `stopifnot(nrow(gene_df) > 20)` per test.

6. **Performance**: 10,000 permutations × ~17 tests. Each permutation: group_by + sample + table + fisher.test ≈ 0.01s. Total ≈ 28 minutes. Acceptable.

---

## Verification

1. **Run with reduced permutations**: `PERM_NTIMES <- 100` for quick validation of all data prep and figure generation
2. **Check each test's N**: Print contingency table — verify reasonable gene counts (>50 typically)
3. **Verify concordance**: Most Fisher tests had large ORs (>2) — expect majority "Confirmed"
4. **Visual check**: 37d scatter should show positive correlation between log2(OR) and z-score
5. **Cached vs fresh**: Delete RDS, re-run, verify identical results (set.seed guarantees this)
6. **Output files**: Verify 4 figure subdirectories in `37_permutation_gene_level/` + 2 files in `tables/`
