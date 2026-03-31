# Plan: Resolve Remaining TODO Paths in `data/scripts/`

## Context

The initial path refactor updated 38 scripts to use `data/` paths, marking unavailable files as `# TODO: not in data/`. This follow-up resolves those TODOs now that we've confirmed almost everything exists in the repo under different paths.

**Decision rule (from user):**
- **Copy to `data/`:** Singular, reviewer-important files (RNA-seq, diff results, gene summaries, annotated loops)
- **Repo-relative path:** Bulky directories/large files not useful in Excel (BED files, RDS, BEDPE, large HOMER outputs)
- **Keep as TODO:** Only HPC-only files (.hic, pipeline RDS intermediates)

---

## Part A: Copy to `data/` (11 files, ~18 MB total)

### A1. Early RNA-seq → `data/upstream/rna_seq/`
```
tads/young_timepoint_rna-seq-Bap1Math1paired_ctrl_mut_Results.xlsx (3.8M)
→ data/upstream/rna_seq/young_rnaseq_results.xlsx
```
**Update scripts:** `deg_tad_violin.R` (line 65), `network_analysis.R` (line 66), `shared_anchor_analysis.R` (line 70)

### A2. Early characterized loops → `data/upstream/loop_calls/`
```
outputs/250831-early_outputs/merged_loops/characterized_loops.tsv (84K)
→ data/upstream/loop_calls/early_characterized_loops.tsv
```
**Update scripts:** `boundary_loop_crossref.R` (line 77), `loop_distance_analysis.R` (line 41), `loop_distance_k27me3_filtered.R` (line 50), `shared_anchor_analysis.R` (line 69)

### A3. TADCompare filtered/annotated → `data/tsvs/figure_1_.../`
```
tads/results/late/final/tadcompare_final_filtered.tsv (2.9M)
→ data/tsvs/figure_1_tads_boundaries_compartments/1B_late_tadcompare_filtered.tsv

tads/results/early/final/tadcompare_final_filtered.tsv (3.0M)
→ data/tsvs/figure_1_tads_boundaries_compartments/1B_early_tadcompare_filtered.tsv

tads/results/late/final/tadcompare_final_annotated.tsv (3.1M)
→ data/tsvs/figure_1_tads_boundaries_compartments/1B_late_tadcompare_annotated.tsv
```
**Update scripts:** `tad_visualizations.R` (line 98), `timepoint_comparison.R` (lines 27-28), `shared_anchor_boundary_analysis.R` (line 65)

### A4. HOMER TAD differential input → `data/upstream/homer/`
```
mkdir -p data/upstream/homer
tads/tad-pc-analysis/inputs/late/diffTAD/Bap1.diff.tad.txt (878K)
→ data/upstream/homer/Bap1.diff.tad.txt
```
**Update scripts:** `tad_volcano_plot.R` (line 68)

### A5. Polycomb shared loops → `data/tsvs/supplemental/`
```
output/shared_anchor_analysis/late/polycomb_specific/tables/polycomb_shared_loops.tsv (170K)
→ data/tsvs/supplemental/polycomb_shared_loops.tsv
```
**Update scripts:** `h2ak119ub_loop_integration.R` (line 65), `diff_chip_polycomb_enrichment.R` (line 65)

### A6. Shared anchors → `data/tsvs/supplemental/`
```
output/shared_anchor_analysis/late/tables/shared_anchors.tsv (8.4K)
→ data/tsvs/supplemental/shared_anchors.tsv
```
**Update scripts:** `h2ak119ub_loop_integration.R` (line 63), `shared_anchor_boundary_analysis.R` (line ~62)

### A7. Gene-level summary → `data/tsvs/figure_5_.../`
```
abc/results/gene_level_summary.tsv (3.5M)
→ data/tsvs/figure_5_model_functional/5B_gene_level_summary.tsv
```
**Update scripts:** `step11_enhancer_subset_analysis.R` (line 38), `step13_discordant_gene_analysis.R` (line 23)

### A8. GO term selection → `data/upstream/`
```
peaks/Go_term_selction.xlsx (210K)
→ data/upstream/Go_term_selction.xlsx
```
**Update scripts:** `network_analysis.R` (line 92)

---

## Part B: Repo-Relative Paths (no copy, update path + remove TODO)

Change `# TODO: not in data/` → `# Note: repo-relative path, not bundled in data/`

### B1. ChIP Peak BEDs — 6 scripts, ~68 path lines
All verified to exist at `peaks/beds/`, `peaks/new/`, `peaks/intersect/`, `peaks/CTCF.bed`, `peaks/ctcf_motifs_mm10.bed`.

| Script | Lines | Action |
|--------|-------|--------|
| `tad_chip_classification.R` | 65-80 | Remove TODO on 14 lines |
| `annotate_loops_extended.R` | 66-94 | Remove TODO on 20 lines |
| `annotate_loops_extended_peaks.R` | 75-111 | Remove TODO on 22 lines; fix `peaks-v1/` → `peaks/old/peaks-v1/` |
| `loop_distance_k27me3_filtered.R` | 56-61 | Remove TODO on 4 lines |
| `h2ak119ub_loop_integration.R` | 70-73 | Remove TODO on 4 lines |
| `diff_chip_polycomb_enrichment.R` | 70-73 | Remove TODO on 4 lines |

**Special:** `peaks/peaks-v1/` doesn't exist — the actual path is `peaks/old/peaks-v1/`. Update in `annotate_loops_extended.R` and `annotate_loops_extended_peaks.R`.

### B2. DiffBind in `structural_heatmap.R` — 4 lines
Already exist at `data/upstream/diffbind/`. Change paths from `peaks/diffbind/...` → `data/upstream/diffbind/...` and remove TODO.

### B3. Merged loop results — ~6 scripts
Large files (13M TSV, 5M RDS, 12M BEDPE). Point to actual locations:

| File | Actual Path | Scripts |
|------|-------------|---------|
| Late merged_all_results.tsv (13M) | `outputs/250402-late_outputs/merged_loops/merged_all_results.tsv` | `h2ak119ub_loop_integration.R`, `diff_chip_polycomb_enrichment.R`, `visualizations.R` |
| Late non_redundant_loops.rds (5M) | `outputs/250402-late_outputs/merged_loops/non_redundant_loops.rds` | `visualizations.R`, `apa_analysis.R` |
| Late nonredundant.bedpe (12M) | `outputs/250402-late_outputs/bedpe_final/merged_all_loops_nonredundant.bedpe` | `step9b_paired_anchor_analysis.R`, `step11_enhancer_subset_analysis.R` |
| Late characterized_loops.tsv | `outputs/250402-late_outputs/merged_loops/characterized_loops.tsv` | `visualizations.R`, `step11_enhancer_subset_analysis.R` |

### B4. HOMER large inputs — 3 scripts
```
tads/tad-pc-analysis/inputs/late/diffPC/diffcompartments.txt (32M) — too large for data/
tads/tad-pc-analysis/inputs/late/diffPC/regions.Up_mut_vs_ctrl.regions.txt
tads/tad-pc-analysis/inputs/late/diffPC/regions.Down_mut_vs_ctrl.regions.txt
```
**Update scripts:** `compartment_volcano_plot.R` (line 81), `loop_compartment_crossref.R` (lines 25-28)

### B5. Reference and ABC files
| File | Actual Path | Scripts |
|------|-------------|---------|
| mm10_tss.bed (1.8M) | `abc/reference/mm10_tss.bed` | `step9b_paired_anchor_analysis.R`, `step11_enhancer_subset_analysis.R` |
| abc characterized_loops.tsv (1.4M) | `abc/characterized_loops.tsv` | `step11_enhancer_subset_analysis.R` |

### B6. Loop annotation extended
```
peaks/loop_annotation_extended/early/extended_characterized_loops.tsv (57K)
peaks/loop_annotation_extended/late/extended_characterized_loops.tsv
```
**Update scripts:** `loop_distance_mark_filtered.R` (line 95), `ctcf_stripe_crossref.R` (lines 51, 59)

### B7. Stripes data
```
stripes/outputs/late/ — exists
stripes/outputs/early/ — exists
```
**Update scripts:** `ctcf_stripe_crossref.R` (lines 52, 60)

### B8. HOMER motif results
```
abc/results/enhancer_subset_analysis/homer_results/ — exists (directory)
```
**Update scripts:** `step11b_homer_motif_visualization.R` (line 21)

### B9. Early shared anchor outputs
All exist at `output/shared_anchor_analysis/early/tables/`:
```
shared_anchors.tsv, shared_anchor_loops.tsv, etc.
```
**Update scripts:** `shared_anchor_boundary_analysis.R` (lines 73-76)

### B10. Visualizations.R pipeline inputs
Point to actual locations under `outputs/250402-late_outputs/`:
```
outputs/250402-late_outputs/merged_loops/characterized_loops.tsv
outputs/250402-late_outputs/merged_loops/merged_all_results.tsv
```
**Update script:** `visualizations.R` (lines 101, 123, 134, 287, 327)

### B11. tad_visualizations.R intermediate outputs
The script writes intermediate plots to `tads/results/visualizations/{timepoint}/` — these are non-data intermediate outputs. Keep the paths but update TODO → Note.
Lines: 99, 127, 985, 1013, 1267

### B12. loop_distance_analysis.R legacy output dirs
Lines 47-48: `output/loops_visualization_extended/{early,late}` — intermediate output dirs. Keep as repo-relative, remove TODO.

---

## Part C: Keep as TODO (HPC-only, ~13 lines total)

| What | Scripts |
|------|---------|
| Pipeline RDS intermediates (outputs/res_*kb/*.rds) | `edgeR.R` (5 lines) |
| .hic files / HPC config | `apa_analysis.R` (1 line), `apa_shared_anchors.R` (1 line) |
| edgeR output base/comparison/logs dirs | `edgeR.R` (3 lines) |

These require the full HPC pipeline and cannot be resolved locally.

---

## Execution Order

1. **Part A copies** — `cp` 11 files into data/ (bash)
2. **Part A script updates** — Update paths in ~15 scripts to point to new data/ locations
3. **Part B1** — Remove TODO from ChIP peak paths in 6 scripts, fix peaks-v1 path
4. **Part B2** — Fix DiffBind paths in structural_heatmap.R
5. **Part B3-B12** — Update all remaining repo-relative paths (~10 scripts)
6. **Update INDEX.md and TODO doc** — Add new data/ files, trim TODO doc to Part C only
7. **Verify** — grep for remaining TODOs, confirm only Part C items remain

## Verification
```bash
# Should show ONLY edgeR.R and apa lines (~9 lines)
grep -r '# TODO: not in data/' data/scripts/ --include="*.R" | grep -v '# Note:'
```
