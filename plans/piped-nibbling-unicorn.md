# Plan: Section 35 — ATAC x Chromatin Features + Loop Anchor Permutation

## Context

Section 35 is one of four new permutation testing sections (34-37) that validate existing Fisher's exact tests from the biomodal methylation visualization pipeline. Fisher's tests assume independence of genomic observations, which is violated by clustered DMRs, Polycomb domains, and co-regulated neighborhoods. Permutation tests address this by randomizing spatial relationships while preserving genomic structure.

Section 35 specifically validates Fisher tests from **sections 13b, 13c, 13d, 27a, 27b, 27e, and 31a** — covering ATAC-seq peak enrichment at chromatin marks, chromatin state distributions, and Hi-C loop anchor overlaps with epigenomic features.

**Other agents are concurrently writing sections 34, 36, and 37. This plan covers section 35 only.**

## Target File

`biomodal/downstream/scripts/viz_sections/section_35_permutation_atac_loops.R`

## Critical Files

| File | Role |
|------|------|
| `scripts/viz_sections/_shared_config.R` | Source for all helpers, paths, pre-loaded data |
| `scripts/utils/multi_format_output.R` | `save_multiformat_ggplot()` — sourced by _shared_config |
| `docs/permutations.md` lines 198-320 | Spec for section 35 |
| `docs/regioneReloaded.Rmd` | regioneReloaded API reference |

## Reusable Functions (from `_shared_config.R`)

- `load_chip_peaks(bed_path, mark_name)` → GRanges (lines 258-272)
- `dmr_to_granges(dmr_df)` → GRanges with mcols (lines 277-287)
- `compute_chip_overlaps(dmr_gr, chip_peaks)` → data.frame with 6 boolean cols (lines 293-303)
- `classify_chromatin_state(overlaps, distance_to_tss, tss_threshold)` → factor (lines 320-366)
- `theme_biomodal(base_size)` → ggplot2 theme (lines 237-248)
- `save_multiformat_ggplot(plot, base_path, width, height)` → PDF+SVG+JPG output

## Data Paths (from `_shared_config.R`)

- `ATAC_FILES$up/down` — differential ATAC BED files
- `CHIP_PEAK_FILES$ctcf/h3k27ac/h3k27me3/h3k4me1/h3k4me3/bivalent` — 6 ChIP marks
- `MECP2_FILES$up/down` — MeCP2 differential BED files
- `LOOP_FILES$late` — extended_characterized_loops.tsv (cols: `chr1/start1/end1/chr2/start2/end2/logFC/FDR/direction`)
- `mc_dmr` / `hmc_dmr` — pre-loaded DMR dataframes
- `CHROMATIN_STATE_ORDER` — 7-state vector
- `OUTPUT_DIR` / `TABLES_DIR` — output directories

## Implementation Steps

### Step 1: Script Header + Setup

Follow existing template pattern (section_33 style):
- Comment block with filename, description, figures produced
- `source("scripts/viz_sections/_shared_config.R")`
- Load additional packages: `regioneR`, `regioneReloaded`, `BSgenome.Mmusculus.UCSC.mm10`, `ChIPseeker`
- Define section output dir: `SECTION_DIR <- "35_permutation_atac_loops"`

### Step 2: Permutation Parameters + Genome Object

```r
PERM_NTIMES   <- 5000
PERM_CORES    <- 8
PERM_PER_CHR  <- TRUE
PERM_RANFUN   <- "randomizeRegions"
PERM_EVFUN    <- "numOverlaps"
PERM_SEED     <- 42
```

Genome construction:
```r
library(BSgenome.Mmusculus.UCSC.mm10)
genome_full <- getGenomeAndMask("mm10")$genome
standard_chrs <- paste0("chr", c(1:19, "X"))
genome <- genome_full[seqnames(genome_full) %in% standard_chrs]
```

### Step 3: RDS Cache Check

Check for `file.path(TABLES_DIR, "permutation_35_atac_loops.rds")`. If exists, load and skip to visualization. If not, run computations. Use pattern from spec (lines 670-681).

### Step 4: Sub-analysis 35A — ATAC Peaks x 6 ChIP Marks (validates 13b)

**Question:** Are differential ATAC peaks enriched at specific histone mark peaks?

Construct:
- `Alist_35a`: 2 sets — `load_chip_peaks(ATAC_FILES$up)`, `load_chip_peaks(ATAC_FILES$down)`
- `Blist_35a`: 6 sets — all 6 `CHIP_PEAK_FILES` entries loaded via `load_chip_peaks()`

Run `crosswisePermTest()` → 2 x 6 = 12 pairwise tests.
Then `makeCrosswiseMatrix(cw_35a, pvcut = 1)`.

### Step 5: Sub-analysis 35B — ATAC Peaks x 7 Chromatin States (validates 13c)

**Question:** Are ATAC-up vs ATAC-down peaks differentially distributed across chromatin states?

Construct 7 GRanges — one per chromatin state:
1. Get all DMR regions as GRanges: `all_dmr_gr <- dmr_to_granges(mc_dmr)`
2. Load ChIP peaks: `chip_peaks <- lapply(CHIP_PEAK_FILES, load_chip_peaks)`
3. Compute overlaps: `overlaps <- compute_chip_overlaps(all_dmr_gr, chip_peaks)`
4. Get distance_to_tss via `ChIPseeker::annotatePeak()` on `all_dmr_gr` with `TxDb.Mmusculus.UCSC.mm10.knownGene`
5. Classify: `states <- classify_chromatin_state(overlaps, distance_to_tss)`
6. Split: `Blist_35b <- split(all_dmr_gr, states)` — produces 7 named GRanges

Alist: same `Alist_35a` (ATAC Up/Down).

Run `crosswisePermTest()` → 2 x 7 = 14 pairwise tests.

### Step 6: Sub-analysis 35C — Loop Anchors x Chromatin Features (validates 13d, 27a/b/e, 31a)

**Question:** Do gained/lost loop anchors show enriched overlap with chromatin features?

Construct loop anchor GRanges:
1. Load loops: `read.table(LOOP_FILES$late, header=TRUE, sep="\t")`
2. Validate column names exist: `stopifnot(all(c("chr1","start1","end1","chr2","start2","end2","direction","FDR") %in% colnames(loops)))`
3. Build anchor1/anchor2 GRanges from `chr1/start1/end1` and `chr2/start2/end2`
4. Split by direction: `gained_mask <- loops$direction == "up_in_mutant"`, `lost_mask <- loops$direction == "down_in_mutant"`
5. Combine + reduce per direction: `gained_anchors <- reduce(c(anchor1[gained_mask], anchor2[gained_mask]))`

Construct Blist:
- ATAC Up, ATAC Down (from ATAC_FILES)
- MeCP2 Up, MeCP2 Down (from MECP2_FILES)
- mC Hyper DMRs, mC Hypo DMRs (from mc_dmr, filtered significant + direction)

Run `crosswisePermTest()` → 2 x 6 = 12 pairwise tests.

### Step 7: Save RDS Cache

Bundle all three crosswise results into a list:
```r
perm_35_results <- list(cw_35a = cw_35a, cw_35b = cw_35b, cw_35c = cw_35c)
saveRDS(perm_35_results, file.path(TABLES_DIR, "permutation_35_atac_loops.rds"))
```

### Step 8: Figure 35a — Crosswise Heatmap ATAC x ChIP (2x6)

```r
plotCrosswiseMatrix(cw_35a, matrix_type = "association")
```

Save via `save_multiformat_ggplot()` to `35_permutation_atac_loops/35a_crosswise_atac_x_chip/`.

### Step 9: Figure 35b — Crosswise Heatmap ATAC x Chromatin States (2x7)

```r
plotCrosswiseMatrix(cw_35b, matrix_type = "association")
```

Save to `35b_crosswise_atac_x_chromatin_state/`.

### Step 10: Figure 35c — Crosswise Heatmap Loops x Features (2x6)

```r
plotCrosswiseMatrix(cw_35c, matrix_type = "association")
```

Save to `35c_crosswise_loops_x_features/`.

### Step 11: Figure 35d — Fisher vs Permutation Comparison Table

Re-run the original Fisher tests inline (sections are independent):

**From 35A (section 13b pattern):** For each of 6 ChIP marks, build 2x2 (ATAC direction x overlap status), run fisher.test().

**From 35B (section 13c pattern):** For each of 7 states, build 2x2 (ATAC direction x state membership), compute O/E and Fisher.

**From 35C (sections 13d, 27, 31 patterns):**
- Loop direction x ATAC overlap at anchors (2 tests from 13d)
- Hypermethylated x gained/lost anchor overlap (from 27b)
- Loop direction x MeCP2 overlap (from 31a)

Extract permutation z-scores and p-values from `getMultiEvaluation()` on each crosswise object. Build comparison data.frame:

| test_id | description | original_section | fisher_or | fisher_p | perm_zscore | perm_p | concordance |

Concordance = "Confirmed" if both p < 0.05 same direction, "Weakened" if Fisher p < 0.05 but perm p >= 0.05, etc.

Render as ggplot table or formatted gtable. Save to `35d_fisher_vs_permutation_table/`.

### Step 12: Figure 35e — Local Z-Score for Strongest Loop Anchor Association

Identify strongest association from 35C (highest |z-score|). Run:
```r
mlz_35 <- multiLocalZscore(
  A = strongest_alist_element,
  Blist = Blist_35c,
  ranFUN = PERM_RANFUN,
  evFUN = PERM_EVFUN,
  genome = genome,
  window = 50000,  # +/- 50kb
  step = 1000
)
mlz_35 <- makeLZMatrix(mlz_35)
plotSingleLZ(mlz_35, RS = strongest_blist_name, smoothing = TRUE)
```

Save to `35e_local_zscore_loop/`.

### Step 13: TSV Export + Summary

Save comparison table: `write.table(..., file.path(TABLES_DIR, "permutation_35_comparison.tsv"))`

Print section summary with counts, concordance breakdown, and output locations.

## Output Structure

```
plots/visualizations/
  35_permutation_atac_loops/
    35a_crosswise_atac_x_chip/           # PDF + SVG + JPG
    35b_crosswise_atac_x_chromatin_state/
    35c_crosswise_loops_x_features/
    35d_fisher_vs_permutation_table/
    35e_local_zscore_loop/

plots/visualizations/tables/
  permutation_35_atac_loops.rds          # Cached crosswise results
  permutation_35_comparison.tsv          # Fisher vs perm comparison
```

## Key Design Decisions

1. **Three separate `crosswisePermTest()` calls** (not one mega-call) — keeps Alist/Blist semantically coherent and matches spec
2. **ChIPseeker loaded per-section** (not from _shared_config.R) — consistent with existing pattern (section_10 precedent)
3. **Fisher tests re-computed inline** — sections are independent; don't rely on outputs from other sections
4. **Loop direction uses `direction == "up_in_mutant"/"down_in_mutant"`** — confirmed from exploration of loop file structure
5. **Standard chromosomes only (chr1-19, chrX)** — excludes random/Un contigs, consistent with spec
6. **RDS cache pattern** — expensive permutation cached; visualization can re-run without recomputing

## Verification

1. **Syntax check:** `Rscript -e "parse('scripts/viz_sections/section_35_permutation_atac_loops.R')"`
2. **Quick test (local):** Set `PERM_NTIMES <- 100` temporarily, run full script from `downstream/` dir, verify 5 figure directories created + RDS + TSV saved
3. **Production run (HPC):** `PERM_NTIMES <- 5000`, 8 cores, ~30-45 min expected
4. **Output validation:** Check that all 3 crosswise matrices have expected dimensions (2x6, 2x7, 2x6), comparison table has correct number of rows, concordance labels populated
5. **Auto-discovery:** Verify `run_all_sections.sh` glob picks up the new file
