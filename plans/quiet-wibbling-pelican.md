# Plan: Structural Heatmap Improvements

## Context

Grad mentor feedback on `scripts/structural_heatmap.R` (produces `output/structural_heatmap/`):
1. Enhancer annotation color scaling (blues) conflicts with negative logFC blues in heatmap body
2. Expand from top 50 to top 100 genes
3. Add modification-gene linkage: assign H2AK119ub, H3K27me3, H3K27ac, ATAC-seq peaks to genes and show their fold-changes as new heatmap columns

User clarifications:
- All 4 DiffBind results now in `peaks/diffbind/` (identical column format: Summit_Chr/Start/End, Peak_Chr/Start/End, Fold, FDR)
- Distal peak linkage: ABC TargetGene by default (`USE_ABC=TRUE`); optional loop anchor fallback (`USE_LOOP_FALLBACK=FALSE`)
- Modification FC columns added to **Heatmap A only** (combined structural score)
- Heatmap B: only color fix + top 100 expansion

## Files to Modify

- `scripts/structural_heatmap.R` — all changes in this single file

## Critical Input Files

| File | Purpose |
|------|---------|
| `output/network_analysis/late/tables/gene_structural_profile_all.tsv` | Gene structural profiles (existing) |
| `abc/results/gene_level_summary.tsv` | ABC gene-level summary (existing) |
| `peaks/diffbind/K119ub_diffbind_results_summit_appended_ap.txt` | H2AK119ub DiffBind (41K peaks, Fold is log2FC) |
| `peaks/diffbind/K27me3_diffbind_results_summit_appended_ap.txt` | H3K27me3 DiffBind (18K peaks) |
| `peaks/diffbind/K27ac_diffbind_results_summit_appended_ap.txt` | H3K27ac DiffBind (25K peaks) |
| `peaks/diffbind/ATAC_allATAC_diffbind_results_summit_appended_ap.txt` | ATAC-seq DiffBind (75K peaks) |
| `abc/results/delta_abc_all_pairs.tsv` | ABC enhancer-gene pairs (180K rows, cols: chr/start/end/TargetGene) |
| `abc/results/loops_with_gene_assignments.tsv` | Loop anchor gene assignments (cols 58/60: anchor1_gene/anchor2_gene) |

## Implementation Steps

### Step 1: Trivial changes

- **TOP_N**: `50` -> `100`
- **Enhancer annotation palette** (Heatmap B, line 245-246): Replace blues with purples:
  ```r
  c("1-5" = "#EFEDF5", "6-10" = "#BCBDDC", "11-15" = "#807DBA", ">15" = "#4A1486")
  ```
- Update filenames: `top50_*.tsv` -> `top100_*.tsv`
- Update titles: "Top 50" -> "Top 100"

### Step 2: New packages (Section 1)

Add to `suppressPackageStartupMessages`:
```r
library(GenomicRanges)
library(ChIPseeker)
library(TxDb.Mmusculus.UCSC.mm10.knownGene)
library(org.Mm.eg.db)
```
Pattern confirmed from `scripts/visualizations.R:362`.

### Step 3: New configuration (Section 2)

```r
# --- DiffBind files (per-peak fold-changes, all same column format) ---
DIFFBIND_FILES <- list(
  H2AK119ub = "peaks/diffbind/K119ub_diffbind_results_summit_appended_ap.txt",
  H3K27me3  = "peaks/diffbind/K27me3_diffbind_results_summit_appended_ap.txt",
  H3K27ac   = "peaks/diffbind/K27ac_diffbind_results_summit_appended_ap.txt",
  ATAC      = "peaks/diffbind/ATAC_allATAC_diffbind_results_summit_appended_ap.txt"
)

# Peak-to-gene linkage
ABC_PAIRS_FILE     <- "abc/results/delta_abc_all_pairs.tsv"
LOOP_ASSIGN_FILE   <- "abc/results/loops_with_gene_assignments.tsv"
USE_ABC            <- TRUE    # Use ABC enhancer->gene assignments for distal peaks
USE_LOOP_FALLBACK  <- FALSE   # If TRUE: ABC first, then loop anchors for uncovered peaks

TSS_REGION <- c(-2000, 2000)
TXDB       <- TxDb.Mmusculus.UCSC.mm10.knownGene
```

### Step 4: New Section — Modification FC Pipeline (5 functions)

Insert after existing Section 4 (logFC AxC), before Section 5 (build matrix).

#### `load_diffbind_file(mark_name, file_path) -> tibble`
- `stopifnot(file.exists(file_path))` — all 4 files now exist in `peaks/diffbind/`
- Read TSV, validate required columns (Summit_Chr/Start/End, Peak_Chr/Start/End, Fold, FDR)
- Return tibble with `mark` column added

#### `annotate_peaks_promoter_distal(peaks_df) -> tibble`
- Create GRanges from Summit_Chr/Start/End
- `annotatePeak(gr, tssRegion=TSS_REGION, TxDb=TXDB, annoDb="org.Mm.eg.db")`
- Add `is_promoter = grepl("Promoter", annotation)` and `chipseeker_gene = SYMBOL`
- Return peaks_df with new columns

#### `link_promoter_peaks_to_genes(peaks_df) -> tibble`
- Filter `is_promoter == TRUE`
- Set `assigned_gene = chipseeker_gene`

#### `link_distal_peaks_to_genes(peaks_df) -> tibble`
- Filter `is_promoter == FALSE`
- **ABC mode** (if `USE_ABC`):
  - Load `ABC_PAIRS_FILE` (`stopifnot(file.exists(...))`)
  - Create GRanges from ABC enhancers (chr/start/end) with TargetGene metadata
  - `findOverlaps(peak_gr, abc_gr)` using Peak_Chr/Start/End (full peak footprint)
  - Assign TargetGene from overlapping ABC enhancers
- **Loop fallback** (if `USE_LOOP_FALLBACK`):
  - Only for peaks not assigned by ABC
  - Load `LOOP_ASSIGN_FILE`
  - Create GRanges for anchor1 and anchor2
  - If peak overlaps anchor1 -> assign anchor2_gene (and vice versa)
  - Filter out "0" or NA gene values
- **Nearest-gene fallback** for still-unlinked peaks:
  - Use ChIPseeker's `chipseeker_gene` (nearest gene) for any distal peaks
    not assigned by ABC or loop anchors
  - Biologically correct for repressive marks like H3K27me3: Polycomb acts on
    the local gene, not via distal enhancer-TSS interactions in the ABC model
  - Previously H3K27me3 had only 40/100 coverage; this should improve it substantially
- Return with `assigned_gene` column

#### `aggregate_peak_fc_per_gene(peaks_with_genes) -> tibble`
- Remove NA assigned_gene rows
- Group by (mark, assigned_gene), keep row with max |Fold| (strongest effect)
- `pivot_wider(names_from=mark, values_from=Fold)` with `_FC` suffix
- Return wide table: gene + one column per available mark

#### `build_modification_fc_table() -> tibble`
Orchestrator:
1. Loop over DIFFBIND_FILES, call `load_diffbind_file()` for each — all 4 marks loaded
2. Combine into single dataframe
3. `annotate_peaks_promoter_distal()` on combined peaks (~160K total)
4. Split into promoter/distal subsets
5. `link_promoter_peaks_to_genes()` + `link_distal_peaks_to_genes()`
6. rbind both, `aggregate_peak_fc_per_gene()`
7. Print summary: genes assigned per mark

### Step 5: Modify render_heatmap()

- Add optional `gaps_col = NULL` parameter
- Pass `gaps_col` to pheatmap call (visually separates structural columns from modification columns)
- Add `na_col = "grey90"` to pheatmap call (marks with no data for a gene show as light gray)

### Step 6: Modify make_combined_score_heatmap()

- Accept `mod_fc` parameter (tibble from `build_modification_fc_table()`)
- Left-join `mod_fc` onto top100 genes by gene name
- Build column list: 4 structural columns + 4 modification FC columns
- Set `gaps_col = 4` to separate the two groups
- Adjust width: `width = 10 + 2 * n_mod_columns` (scale with number of modification marks)
- Update col_labels: `"H2AK119ub FC"`, `"H3K27me3 FC"`, `"H3K27ac FC"`, `"ATAC-seq FC"`

### Step 7: Modify main()

```r
main <- function() {
  # ... setup ...
  df <- load_data() %>% add_logfc_axc()
  mod_fc <- build_modification_fc_table()
  top_combined <- make_combined_score_heatmap(df, mod_fc)
  top_abc      <- make_abc_only_heatmap(df)
  write_summary(df, top_combined, top_abc, mod_fc)
}
```

### Step 8: Update write_summary()

- Accept `mod_fc` parameter
- Report: which marks were loaded, how many genes got assignments per mark, linkage mode used
- Update all "Top 50" -> "Top 100" references

## Key Design Decisions

1. **Fold is log2FC** — DiffBind Fold column is already log2 (Conc values are log2 RPM). Use directly, no transformation needed.
2. **Z-scoring** — The existing `build_zscore_matrix()` handles NAs with `na.rm=TRUE` and caps at +/-3 SD. New modification columns go through the same z-scoring.
3. **NA cells** — Genes without a peak for a given mark get NA. pheatmap renders these as grey90 (clearly distinguishable from the blue-white-red scale).
4. **Peak overlap for distal linkage** — Use full peak coordinates (Peak_Chr/Start/End) not summits, since the peak footprint is what overlaps enhancer regions.
5. **Multiple ABC TargetGenes per peak** — An enhancer can link to multiple genes in ABC. Each creates a separate (gene, Fold) pair. The aggregation step picks the strongest per gene.
6. **Nearest-gene fallback for repressive marks** — H3K27me3 peaks won't overlap ABC enhancers (ABC uses ATAC+H3K27ac). Distal peaks not linked by ABC fall back to ChIPseeker nearest-gene assignment, which is biologically correct for Polycomb marks acting locally.

## Verification

1. Run: `Rscript scripts/structural_heatmap.R`
2. Check `output/structural_heatmap/plots/combined_score_heatmap/` — should show 100 rows, 8 columns (4 structural + 4 modification FC), with a visible column gap between the two groups
3. Check `output/structural_heatmap/plots/abc_only_heatmap/` — should show 100 rows, purple (not blue) enhancer annotation
4. Check `output/structural_heatmap/tables/heatmap_summary.txt` — should report all 4 marks loaded, gene coverage per mark
5. Check the NA pattern: genes without a peak for a given mark should show grey90 cells in that column
