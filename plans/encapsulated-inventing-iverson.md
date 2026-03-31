# Plan: Modularize Permutation Scripts for HPC + Skip Logic

## Context

The four permutation test R scripts (sections 34-37) have hardcoded permutation counts and core counts, and are caught by the `run_all_sections.sh` glob (`section_*.R`), causing unnecessary re-runs of multi-hour computations. Changes needed:

1. New SLURM `.sb` script to run individual permutation sections on HPC
2. Skip logic so `run_all_sections.sh` doesn't re-execute completed permutation scripts
3. Parameterize hardcoded `PERM_NTIMES` and `PERM_CORES` values

## Files to Modify

| File | Changes |
|------|---------|
| `scripts/viz_sections/run_permutation.sb` | **NEW** — SLURM submission script |
| `scripts/viz_sections/section_34_permutation_dmr_chromatin_marks.R` | Skip logic, parameterize ntimes/cores, add output subfolder, fix hardcoded subtitle |
| `scripts/viz_sections/section_35_permutation_atac_loops.R` | Skip logic, parameterize ntimes/cores |
| `scripts/viz_sections/section_36_permutation_domains.R` | Skip logic, parameterize ntimes/cores |
| `scripts/viz_sections/section_37_permutation_gene_level.R` | Skip logic, parameterize ntimes, fix function default |

---

## Change 1: New `run_permutation.sb`

**Path:** `downstream/scripts/viz_sections/run_permutation.sb`

SLURM script that takes two args:
- `$1` = section number (34, 35, 36, or 37)
- `$2` = number of permutations (e.g., 5000)

Key design:
- 48hr wall time, 64 CPUs, 128GB RAM, shared partition, nodes=1, ntasks=1, account=csd940
- Maps section number to R script filename via `case` statement
- Sets `export FORCE_RERUN=1` before calling Rscript — this env var tells the R script to bypass both the early-exit skip AND internal RDS cache checks (so fresh recomputation happens with the new ntimes)
- Passes ntimes as first Rscript argument

Usage:
```bash
sbatch scripts/viz_sections/run_permutation.sb 34 5000
sbatch scripts/viz_sections/run_permutation.sb 35 5000
sbatch scripts/viz_sections/run_permutation.sb 36 5000
sbatch scripts/viz_sections/run_permutation.sb 37 10000
```

---

## Change 2: Early-Exit Skip Logic (all 4 R scripts)

Insert immediately after `source("scripts/viz_sections/_shared_config.R")` in each script. Pattern:

```r
# Skip if cached results exist (avoids re-run from run_all_sections.sh glob)
# FORCE_RERUN env var (set by run_permutation.sb) bypasses this check
.cache_check <- file.path(TABLES_DIR, "permutation_NN_XXXXX.rds")
if (file.exists(.cache_check) && Sys.getenv("FORCE_RERUN", unset = "") == "") {
  cat("Section NN: Cached RDS found — skipping. Use run_permutation.sb to re-run.\n")
  quit(save = "no", status = 0)
}
```

Cache files checked:
- Section 34: `permutation_34_dmr_marks.rds`
- Section 35: `permutation_35_atac_loops.rds`
- Section 36: `permutation_36_domains.rds`
- Section 37: `permutation_37_gene_level.rds`

Why RDS cache and not output folder: `dir.create()` runs early in each script, so a folder would exist even after a crash. The RDS is only saved after successful permutation completion.

---

## Change 3: Parameterize `PERM_NTIMES` from Command-Line Arg

Replace the hardcoded `PERM_NTIMES <- 5000` (or 10000 in s37) in each script's configuration block:

```r
args <- commandArgs(trailingOnly = TRUE)
PERM_NTIMES <- if (length(args) >= 1 && !is.na(as.numeric(args[1]))) as.numeric(args[1]) else 5000
```

Section 37 fallback stays at `10000` (its original default).

---

## Change 4: Parameterize `PERM_CORES` from SLURM Environment

Replace hardcoded `PERM_CORES <- 8` in sections 34-36:

```r
slurm_cpus <- Sys.getenv("SLURM_CPUS_PER_TASK", unset = "")
PERM_CORES <- if (slurm_cpus != "") as.integer(slurm_cpus) else 8L
```

Section 37 has no `PERM_CORES` (uses sequential for loop) — no change needed.

---

## Change 5: Internal RDS Cache Checks Must Also Respect FORCE_RERUN

**Critical detail:** Each script already has `if (file.exists(cache_path)) { load } else { compute }` blocks for the permutation results. When running via the SLURM script with a *different* ntimes, these would load stale cached results instead of recomputing.

Fix: Add `FORCE_RERUN` check to each internal cache block. Define once near the top:

```r
.force_rerun <- Sys.getenv("FORCE_RERUN", unset = "") != ""
```

Then modify each internal cache check from:
```r
if (file.exists(cache_path)) {
```
to:
```r
if (file.exists(cache_path) && !.force_rerun) {
```

Affected locations:
- **Section 34:** lines 158 (main cache) and 440 (local z-score cache) — 2 checks
- **Section 35:** line 218 — 1 check
- **Section 36:** line 238 — 1 check
- **Section 37:** line 764 — 1 check

---

## Change 6: Fix Hardcoded Values

### Section 34 — hardcoded subtitle (line 408)
```r
# BEFORE:
subtitle = "Section 34: DMR intervals x chromatin mark peaks (5,000 permutations)",
# AFTER:
subtitle = sprintf("Section 34: DMR intervals x chromatin mark peaks (%s permutations)",
                   format(PERM_NTIMES, big.mark = ",")),
```

### Section 34 — add output subfolder (after line 44)
Currently section 34 writes figures directly to `OUTPUT_DIR` (unlike 35-37 which have subfolders). Add:
```r
SECTION_OUTPUT <- file.path(OUTPUT_DIR, "34_permutation_dmr_chromatin_marks")
dir.create(SECTION_OUTPUT, recursive = TRUE, showWarnings = FALSE)
```
Then change 5 figure paths from `OUTPUT_DIR` to `SECTION_OUTPUT`:
- Line 217: `34a_crosswise_dmr_x_marks`
- Line 222: `34a_crosswise_dmr_x_marks` (base plot fallback)
- Line 418: `34b_fisher_vs_permutation_comparison`
- Line 465: `34c_local_zscore_strongest`
- Line 470: `34c_local_zscore_strongest` (base plot fallback)

### Section 37 — function default (line 122)
```r
# BEFORE:
permute_gene_2x2 <- function(gene_df, ntimes = 10000) {
# AFTER:
permute_gene_2x2 <- function(gene_df, ntimes = PERM_NTIMES) {
```

---

## Implementation Order

1. Create `run_permutation.sb` (standalone, no dependencies)
2. Modify section 34 (most changes)
3. Modify section 35
4. Modify section 36
5. Modify section 37

---

## Verification

After implementation:
1. **Syntax check:** `Rscript -e "parse('scripts/viz_sections/section_34_permutation_dmr_chromatin_marks.R')"` for each script
2. **Skip logic:** Run `Rscript scripts/viz_sections/section_34_permutation_dmr_chromatin_marks.R` — if no RDS cache exists, it should proceed normally (and fail on missing HPC data, which is expected locally). If RDS exists, it should print skip message and exit 0.
3. **FORCE_RERUN bypass:** `FORCE_RERUN=1 Rscript scripts/viz_sections/section_34_permutation_dmr_chromatin_marks.R 5000` should NOT skip even if cache exists.
4. **Arg parsing:** Confirm `commandArgs(trailingOnly = TRUE)` correctly reads ntimes.
5. **SLURM script:** `bash -n scripts/viz_sections/run_permutation.sb` for syntax validation. Verify `case` statement maps all 4 sections correctly.
