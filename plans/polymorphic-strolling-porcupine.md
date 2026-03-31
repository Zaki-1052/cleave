# Plan: Write `downstream/permutations.md` — Permutation Testing Reference Document

## Context

The biomodal methylation visualization pipeline (33 section scripts) uses ~40 Fisher's exact tests and ~10 O/E enrichment ratios, all assuming independent observations. Genomic features cluster spatially (adjacent DMRs, Polycomb domains, co-regulated gene neighborhoods), which can inflate Fisher p-values. The user's grad mentor recommends adding permutation tests using `regioneReloaded` (Bioconductor) to preempt reviewer criticism. The deliverable is a comprehensive reference document (`downstream/permutations.md`) that a future session can implement from.

## Deliverable

**Single file:** `downstream/permutations.md` — ground-truth specification for 4 new section scripts (section_34 through section_37) implementing permutation tests.

## Document Structure

### 1. Motivation & Scope
- Why Fisher's exact test is insufficient when observations are spatially clustered
- Two methodologies needed:
  - **regioneReloaded** (`crosswisePermTest`) for interval-level overlap tests (Tier 1)
  - **Chromosome-stratified label shuffle** for gene-level 2x2 O/E tables (Tier 2)
- Reference to local vignette: `downstream/docs/regioneReloaded.Rmd`

### 2. Package Installation & Genome Setup
- `BiocManager::install("regioneReloaded")` (pulls regioneR as dependency)
- mm10 genome construction: `getGenomeAndMask("mm10")$genome`, filtered to chr1-19 + chrX
- Shared parameters: ntimes=5000, per.chromosome=TRUE, ranFUN="randomizeRegions", mc.cores=8

### 3. Section 34 — DMR x Chromatin Mark Interval Permutation
**Validates:** sections 12a, 14a, 14b, 19f (all DMR-interval x peak-overlap Fisher tests)

- **Alist (2 sets):** mC Hyper DMRs, mC Hypo DMRs (via `dmr_to_granges()` on filtered `mc_dmr`)
- **Blist (8 sets):** ATAC up/down (`ATAC_FILES`), K119ub ctrl/mut (`K119UB_FILES`), K119ub gained/lost (via `derive_differential_peaks()` from section 14 pattern), H3K27ac ctrl/mut (`H3K27AC_FILES`)
- One `crosswisePermTest()` call → 2×8 association matrix
- **Figures:** 34a crosswise z-score heatmap, 34b Fisher-vs-permutation comparison table, 34c local z-score curve for strongest association
- **Key code pattern** (from vignette):
  ```r
  cw <- crosswisePermTest(Alist, Blist, genome=genome,
    ranFUN="randomizeRegions", per.chromosome=TRUE, ntimes=5000, mc.cores=8)
  cw <- makeCrosswiseMatrix(cw, pvcut=1)
  plotCrosswiseMatrix(cw, matrix_type="association")
  ```

### 4. Section 35 — ATAC x Chromatin Features + Loop Anchor Permutation
**Validates:** sections 13b, 13c, 13d, 27a, 27b, 27e, 31a

- **Sub-analysis 35A:** ATAC up/down (Alist) x 6 ChIP marks from `CHIP_PEAK_FILES` (Blist) → 2×6 matrix
- **Sub-analysis 35B:** ATAC up/down (Alist) x 7 chromatin state region sets (Blist, constructed from classified genomic regions) → 2×7 matrix
- **Sub-analysis 35C:** Gained/Lost/Shared loop anchors (Alist, from `LOOP_FILES$late`) x ATAC up/down + MeCP2 up/down + mC Hyper/Hypo DMRs (Blist) → 3×6 matrix
- **Figures:** 35a-c crosswise heatmaps, 35d comparison table, 35e local z-score for strongest loop association

### 5. Section 36 — Domain-Level Permutation (Compartments + Polycomb)
**Validates:** sections 29, 30

- **Sub-analysis 36A:** DMR direction sets (Alist: 4 sets — mC hyper/hypo, hmC hypo/hyper) x compartment domain GRanges (Blist: A compartment, B compartment, B→A shift, A→B shift bins from `COMPARTMENT_FILE`) → 4×4 matrix
- **Sub-analysis 36B:** Same DMR Alist x Polycomb domain GRanges (Blist: H3K27me3 peaks, Bivalent peaks, Repressed Promoter regions) → 4×3 matrix
- **Figures:** 36a-b crosswise heatmaps, 36c local z-score, 36d comparison table

### 6. Section 37 — Gene-Level Label-Shuffle Permutation (Tier 2)
**Validates:** sections 12e, 15a/b/c, 19g, 20d, 27c, 29 Step 3, 31b, 33c

- regioneReloaded does NOT apply here (it's for genomic intervals, not gene labels)
- **Method:** Chromosome-stratified label shuffle (10,000 iterations)
  - For each 2×2 table: shuffle one axis's labels within chromosomes, recompute Fisher OR
  - Produces null distribution of log2(OR), empirical p-value, z-score
  - Chromosome info from `mc_dmr$chr` / `hmc_dmr$chr`
- **Helper function:** `permute_gene_2x2(gene_df, ntimes, stat_fun)` — reusable across all ~15 gene-level tests
- **15 tests total** covering all Tier 2 O/E analyses (enumerated in mapping table)
- **Figures:** 37a forest plot of all z-scores, 37b null distribution histograms (top 4 effects), 37c comparison table, 37d observed OR vs permutation z-score scatter

### 7. Complete Mapping Table
Every Fisher test in sections 12-33 → which permutation section/cell validates it, with tier classification. ~25 rows for Tier 1+2.

### 8. Interpretation Guide
- z-score thresholds: |z| > 1.96 = p < 0.05, |z| > 2.58 = p < 0.01
- Concordance categories: Confirmed / Weakened / Strengthened
- Normalized z-scores (regioneReloaded) enable cross-test comparison
- Expected outcome: most strong effects (OR > 2) will be confirmed; marginal effects may weaken

### 9. Runtime & SLURM
- Sections 34-36: ~1-2 hours total (regioneReloaded, 5000 perms, 8 cores)
- Section 37: ~15-25 min (label shuffle is fast)
- SLURM template for HPC execution
- Each section caches results as RDS; re-runs skip if cache exists

### 10. Implementation Checklist
Numbered steps for the implementing session.

## Critical Files to Reference

| File | What to extract |
|------|----------------|
| `_shared_config.R` (lines 44-86) | All file path registries: MECP2_FILES, ATAC_FILES, K119UB_FILES, H3K27AC_FILES, DIFFBIND_FILES, LOOP_FILES, CHIP_PEAK_FILES, OUTPUT_DIR |
| `_shared_config.R` (lines 253-366) | GRanges helpers: `dmr_to_granges()`, `load_chip_peaks()`, `compute_chip_overlaps()`, `classify_chromatin_state()` |
| `section_14_h2ak119ub_correlation.R` (lines 29-45) | `derive_differential_peaks()` — pattern for constructing gained/lost peak GRanges from condition-specific BEDs |
| `section_15_hmc_chromatin_correlations.R` | `build_2x2_heatmap()` — the gene-level O/E pattern that section 37 mirrors |
| `section_29_ab_compartment_methylation_mapping.R` (lines 30-116) | HOMER compartment loading, A/B classification from PC1, shift identification |
| `section_27_methylation_hic_loop_anchor_integration.R` | Loop anchor GRanges construction, GREAT regulatory domain approach |
| `downstream/docs/regioneReloaded.Rmd` | Local copy of vignette — reference for `crosswisePermTest`, `makeCrosswiseMatrix`, `plotCrosswiseMatrix`, `multiLocalZscore`, `plotSinglePT` API patterns |

## Implementation Notes

- New sections follow existing conventions: source `_shared_config.R`, use `save_multiformat_ggplot()`, output to `plots/visualizations/{N}_{name}/`
- `run_all_sections.sh` auto-discovers via glob `section_*.R` — no changes needed
- Each section is self-contained (sources shared config, loads its own data)
- regioneR/regioneReloaded loaded per-section (same pattern as ChIPseeker in sections 12-19)
- The `randomizeRegions` ranFUN (circular permutation within chromosomes) is preferred over `resampleRegions` because it preserves interval sizes exactly

## Verification

After writing `permutations.md`:
1. Confirm all 25 Fisher tests from Tier 1+2 appear in the mapping table
2. Confirm all file paths reference actual `_shared_config.R` variables (not hardcoded paths)
3. Confirm regioneReloaded API usage matches the local vignette at `downstream/docs/regioneReloaded.Rmd`
4. Confirm section numbering (34-37) doesn't conflict with existing sections (highest is 33)
5. Read through to verify a fresh session could implement each section from just this doc + codebase
