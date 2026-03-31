# Plan: Script Provenance for data/ Directory

## Context

The `data/` directory contains 160 plots and 140 TSVs organized by figure (1-5 + supplemental), but `data/INDEX.md` doesn't link each file to the script that created it. The goal is to:
1. Add a `Script` column to every table in INDEX.md
2. Copy the 39 figure-generating scripts + 1 shared utility into `data/scripts/` (organized by figure)
3. Write `data/REFACTOR_PROMPT.md` for a future session to re-path the copied scripts to source from `data/`

No scripts are modified — this is purely mechanistic documentation, copying, and prompt writing.

---

## Step 1: Create `data/scripts/` directory structure

```
data/scripts/
├── _shared/                                    # multi_format_output.R
├── figure_1_tads_boundaries_compartments/      # 6 scripts
├── figure_2_loop_rewiring/                     # 9 scripts
├── figure_3_epigenetic_integration/            # 5 scripts
├── figure_4_abc_analysis/                      # 8 scripts
├── figure_5_model_functional/                  # 4 scripts
└── supplemental/                               # 6 scripts
```

## Step 2: Copy scripts (39 files + 1 shared)

### `_shared/`
- `scripts/utils/multi_format_output.R`

### `figure_1_tads_boundaries_compartments/`
| Source | Panels |
|--------|--------|
| `scripts/tad_volcano_plot.R` | 1B |
| `tads/scripts/tad_visualizations.R` | 1C, 1E, 3F, 5A |
| `scripts/compartment_volcano_plot.R` | 1D |
| `scripts/compartment_genome_percentage.R` | 1D |
| `tads/scripts/tad_chip_classification.R` | 1F, 3B |
| `tads/scripts/boundary_loop_crossref.R` | 1F, 3C |

### `figure_2_loop_rewiring/`
| Source | Panels |
|--------|--------|
| `scripts/edgeR.R` | 2A |
| `scripts/visualizations.R` | 2A |
| `scripts/loop_distance_analysis.R` | 2B, 2H, 5A |
| `scripts/apa_analysis.R` | 2C |
| `scripts/loop_distance_k27me3_filtered.R` | 2E |
| `scripts/loop_distance_mark_filtered.R` | 2E, 2I |
| `peaks/scripts/annotate_loops_extended.R` → rename to `annotate_loops_extended_peaks.R` | 2F, 2G |
| `scripts/annotate_loops_extended.R` | 2F, 2G |
| `scripts/deg_loop_anchor_violin.R` | 2H, 5B |

### `figure_3_epigenetic_integration/`
| Source | Panels |
|--------|--------|
| `scripts/h2ak119ub_loop_integration.R` | 3A |
| `scripts/preprocess_k119ub_anchor_signal.R` | 3A |
| `scripts/diff_chip_polycomb_enrichment.R` | 3C |
| `scripts/loop_compartment_crossref.R` | 3C |
| `tads/scripts/timepoint_comparison.R` | 3D |

### `figure_4_abc_analysis/`
| Source | Panels |
|--------|--------|
| `abc/scripts/step12_activity_contact_scatter.R` | 4A |
| `abc/scripts/step12b_promoter_distal_scatter.R` | 4A |
| `scripts/concordance_pie_chart.R` | 4B |
| `abc/scripts/step13_discordant_gene_analysis.R` | 4B |
| `abc/scripts/step13b_go_enrichment.R` | 4B |
| `abc/scripts/step13c_k119ub_concordance.R` | 4B |
| `abc/scripts/step10_k119ub_abc_correlation.R` | 4C, 4F |
| `abc/scripts/step11_enhancer_subset_analysis.R` | 4D, 4E, 4F |

### `figure_5_model_functional/`
| Source | Panels |
|--------|--------|
| `tads/scripts/deg_tad_violin.R` | 5B |
| `abc/scripts/step9b_paired_anchor_analysis.R` | 5A, 4E |
| `scripts/network_analysis.R` | 5C |
| `scripts/structural_heatmap.R` | 5D |

### `supplemental/`
| Source | Analysis |
|--------|----------|
| `scripts/shared_anchor_analysis.R` | Shared Anchors |
| `scripts/polycomb_shared_anchor_analysis.R` | Shared Anchors (polycomb) |
| `scripts/shared_anchor_boundary_analysis.R` | Shared Boundaries |
| `scripts/ctcf_stripe_crossref.R` | CTCF Stripes |
| `scripts/apa_shared_anchors.R` | APA Shared |
| `abc/scripts/step11b_homer_motif_visualization.R` | HOMER Motifs |

**Multi-figure scripts**: Copied once to their primary figure. Secondary figures reference via cross-directory path in INDEX.md (e.g., 3F → `data/scripts/figure_1_.../tad_visualizations.R`).

**Disambiguation**: `peaks/scripts/annotate_loops_extended.R` renamed to `annotate_loops_extended_peaks.R` to distinguish from `scripts/annotate_loops_extended.R`.

## Step 3: Update `data/INDEX.md`

Add a `Script` column to all Data and Plot tables. The column contains the **original repo-relative path** (not the `data/scripts/` copy path), since the original is authoritative.

### Panel-to-Script mapping for populating the column:

| Panel | Script(s) |
|-------|-----------|
| 1B | `scripts/tad_volcano_plot.R` |
| 1C | `tads/scripts/tad_visualizations.R` |
| 1D (volcano) | `scripts/compartment_volcano_plot.R` |
| 1D (pct) | `scripts/compartment_genome_percentage.R` |
| 1E | `tads/scripts/tad_visualizations.R` |
| 1F (permutation) | `tads/scripts/boundary_loop_crossref.R` |
| 1F (ChIP) | `tads/scripts/tad_chip_classification.R` |
| 2A | `scripts/edgeR.R`, `scripts/visualizations.R` |
| 2B | `scripts/loop_distance_analysis.R` |
| 2C | `scripts/apa_analysis.R` |
| 2E | `scripts/loop_distance_k27me3_filtered.R`, `scripts/loop_distance_mark_filtered.R` |
| 2F | `peaks/scripts/annotate_loops_extended.R` |
| 2G | `peaks/scripts/annotate_loops_extended.R` |
| 2H (heatmap) | `scripts/loop_distance_analysis.R` |
| 2H (violin) | `scripts/deg_loop_anchor_violin.R` |
| 2I | `scripts/loop_distance_mark_filtered.R` |
| 3A | `scripts/h2ak119ub_loop_integration.R` |
| 3B | `tads/scripts/tad_chip_classification.R` |
| 3C (boundary perm) | `tads/scripts/boundary_loop_crossref.R` |
| 3C (ChIP enrichment) | `scripts/diff_chip_polycomb_enrichment.R` |
| 3C (compartment) | `scripts/loop_compartment_crossref.R` |
| 3D | `tads/scripts/timepoint_comparison.R` |
| 3F | `tads/scripts/tad_visualizations.R` |
| 4A | `abc/scripts/step12_activity_contact_scatter.R`, `abc/scripts/step12b_promoter_distal_scatter.R` |
| 4B (pie) | `scripts/concordance_pie_chart.R` |
| 4B (discordant) | `abc/scripts/step13_discordant_gene_analysis.R` |
| 4B (GO) | `abc/scripts/step13b_go_enrichment.R` |
| 4B (K119ub) | `abc/scripts/step13c_k119ub_concordance.R` |
| 4C | `abc/scripts/step10_k119ub_abc_correlation.R` |
| 4D | `abc/scripts/step11_enhancer_subset_analysis.R` |
| 4E | `abc/scripts/step11_enhancer_subset_analysis.R`, `abc/scripts/step9b_paired_anchor_analysis.R` |
| 4F | `abc/scripts/step10_k119ub_abc_correlation.R`, `abc/scripts/step11_enhancer_subset_analysis.R` |
| 5A (boundaries) | `tads/scripts/tad_visualizations.R` |
| 5A (loops) | `scripts/loop_distance_analysis.R` |
| 5A (ABC) | `abc/scripts/step9b_paired_anchor_analysis.R` |
| 5B (TAD) | `tads/scripts/deg_tad_violin.R` |
| 5B (loop) | `scripts/deg_loop_anchor_violin.R` |
| 5C | `scripts/network_analysis.R` |
| 5D | `scripts/structural_heatmap.R` |
| Supp: Shared Anchors | `scripts/shared_anchor_analysis.R`, `scripts/polycomb_shared_anchor_analysis.R` |
| Supp: Shared Boundaries | `scripts/shared_anchor_boundary_analysis.R` |
| Supp: CTCF Stripes | `scripts/ctcf_stripe_crossref.R` |
| Supp: APA Shared | `scripts/apa_shared_anchors.R` |
| Supp: HOMER | `abc/scripts/step11b_homer_motif_visualization.R` |
| Supp: Paired Anchors | `abc/scripts/step9b_paired_anchor_analysis.R` |
| Supp: Loop Rewriting | `scripts/loop_distance_analysis.R` |
| Supp: Loop-Compartment | `scripts/loop_compartment_crossref.R` |
| Supp: Timepoint | `tads/scripts/timepoint_comparison.R` |

Also update the directory structure diagram and file count at the top of INDEX.md to reflect the new `scripts/` subdirectory.

## Step 4: Write `data/REFACTOR_PROMPT.md`

A markdown file that tells a future Claude Code session how to update the copied scripts in `data/scripts/` so they read/write from `data/` paths. Structure:

1. **Context**: Explain what the copied scripts are and why they need re-pathing
2. **Rules**: Only modify `data/scripts/` copies, never originals
3. **Shared utility update**: All `source("scripts/utils/multi_format_output.R")` → `source("data/scripts/_shared/multi_format_output.R")`
4. **Per-script path mapping table**: For each of the 39 scripts, list:
   - Every `source()` call to update
   - Every `read.*()` / `readRDS()` input path → `data/tsvs/{figure}/` or `data/upstream/`
   - Every `write.*()` / `pdf()` / `ggsave()` / `save_multiformat_ggplot()` output path → `data/plots/{figure}/`
5. **Cross-reference checklist**: Per-script verification items
6. **TSV-to-script mapping**: Exhaustive table mapping every file in `data/tsvs/` and `data/plots/` to the line/variable in its generating script

## Verification

After implementation:
- `ls -R data/scripts/` shows 40 files across 7 directories
- Every Data and Plot table in INDEX.md has a Script column
- `data/REFACTOR_PROMPT.md` exists with per-script path mappings
- No original scripts modified

## Critical files to modify
- `data/INDEX.md` — add Script columns to all tables
- `data/REFACTOR_PROMPT.md` — new file (prompt for future re-pathing session)
- `data/scripts/**` — new directory with 40 copied scripts
