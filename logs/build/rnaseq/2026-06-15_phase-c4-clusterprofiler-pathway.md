# Phase C.4 — clusterProfiler Pathway Analysis (GO + KEGG)

> 1 session on 2026-06-15. Phase C.4 is **complete**. 31 new tests (all passing). `ruff check` + `ruff format --check` + `npm run build`: clean.

---

## What Was Built

### R Script (`backend/pipelines/scripts/rnaseq_pathway.R`, ~250 lines)
- 7 positional args: gene_list_file, organism_code (mmu/hsa), org_db (org.Mm.eg.db/org.Hs.eg.db), results_dir, plots_dir, fdr_threshold, enable_gsea
- Libraries: clusterProfiler, ggplot2, jsonlite, DOSE, org.Mm.eg.db/org.Hs.eg.db (loaded dynamically)
- Strips Ensembl version suffixes before `bitr()` Ensembl→Entrez conversion; logs mapped/unmapped counts
- 3 separate `enrichGO()` calls for BP, MF, CC with `readable=TRUE`
- `enrichKEGG()` wrapped in `tryCatch()` (KEGG API can be unreachable — non-fatal)
- Optional GSEA via `gseGO()` on full ranked gene list (by log2FoldChange)
- `safe_plot()` pattern from DESeq2 R script — generates PNG dot plots only for non-empty results
- Outputs: `go_results.csv` (combined BP/MF/CC with ontology column), `kegg_results.csv`, `pathway_summary.json`, 4-5 dot plot PNGs
- Edge cases: zero Entrez conversions → writes empty results + exits cleanly; no significant terms → skips plot, CSV has header only

### Pipeline Stage (`backend/pipelines/rnaseq_pathway.py`, ~450 lines)
- `RnaseqPathwayStage(PipelineStage)` with `ORGANISM_MAP` (mm10→mmu, hg38→hsa only — other genomes lack org.db)
- `_filter_de_results()` helper reads DE results TSV, filters by padj < threshold and direction (upregulated/downregulated/both)
- `validate()`: experiment_id, project_id, de_job_id, reference_genome (ORGANISM_MAP), gene_list_source, fdr_threshold (0-1), de_results_path. Real mode: Rscript in PATH
- `run()`: filters DE results → writes gene list TSV → validates non-empty → runs R script via `run_cmd()` (timeout=7200) → scans/registers all outputs
- `mock_run()`: realistic mock data with real GO IDs (GO:0007399, GO:0048699...) and KEGG IDs (mmu04550, mmu04010...), stub PNGs, summary JSON
- 10 output file categories: go_results, kegg_results, pathway_summary, go_bp_plot, go_mf_plot, go_cc_plot, kegg_plot, gsea_plot, gene_list, master_log
- Registered as `"rnaseq_pathway": RnaseqPathwayStage()` in `__init__.py`

### Methods Text
- `rnaseq_pathway_methods()` in `methods_text.py`: mentions clusterProfiler (Yu et al., 2012), enrichGO(), enrichKEGG(), bitr() ID conversion, BH correction, genome annotation, FDR threshold, gene list direction, optional GSEA

### Schemas
- `PathwayPlotInfo(CamelModel)`: plot_type, output_id_png
- `PathwayReport(CamelModel)`: gene_list_source, fdr_threshold, total_input_genes, mapped_entrez_genes, unmapped_genes, go_bp_terms, go_mf_terms, go_cc_terms, kegg_pathways, gsea_enabled, gsea_terms, go_column_names, kegg_column_names, go_preview, kegg_preview, plot_outputs

### QC Report Service (5 functions)
- `_PATHWAY_PLOT_CATEGORIES` dict (go_bp → go_bp_plot, etc.)
- `_parse_pathway_csv()` — parse GO/KEGG TSV into column names + preview rows (first 50)
- `_find_pathway_plot_output_ids()` — match PNG outputs to plot types
- `get_pathway_report()` — assemble PathwayReport from summary JSON + CSVs + plot outputs
- `get_pathway_go_csv_path()` / `get_pathway_kegg_csv_path()` / `get_pathway_gene_list_path()` — resolve file paths for downloads

### API Endpoints (4 new)
- `GET /jobs/{jid}/pathway-report` → PathwayReport JSON
- `GET /jobs/{jid}/pathway-report/download-go` → GO results CSV
- `GET /jobs/{jid}/pathway-report/download-kegg` → KEGG results CSV
- `GET /jobs/{jid}/pathway-report/download-gene-list` → filtered gene list TSV
- Same error handling as DE: ValueError → 409, FileNotFoundError → 404, None → 404

### Frontend Wizard (`NewPathwayWizard.tsx`, ~270 lines)
- 3-step wizard: Details (name + notes + about card) → Choose DE Analysis (radio table of completed `rnaseq_de` jobs) → Settings (gene list source radio, FDR threshold, GSEA toggle, organism display, summary table)
- Resolves `de_results_path` from DE job outputs via `useJobOutputs`
- Submits `rnaseq_pathway` job with `parentJobId` set to selected DE job
- Navigates to `pathway/${job.id}` on success

### Frontend Tab + Panels
- `PathwayAnalysisTab.tsx`: job selector + 4 sub-tabs (Info, GO, KEGG, Files)
- `PathwayGOPanel.tsx`: summary cards (Total GO, BP, MF, CC), gene mapping info, 3 dot plot images via signed URLs, DataTable with ontology filter, GO CSV download
- `PathwayKEGGPanel.tsx`: KEGG count card, dot plot image, DataTable, KEGG CSV download
- `PathwayFilesPanel.tsx`: delegates to `AlignmentFilesPanel` with `RNASEQ_PATHWAY_FILE_CATEGORIES`
- Info sub-tab reuses `AlignmentInfoPanel` (same as featureCounts pattern)

### Integration Wiring
- `App.tsx`: replaced `PlaceholderTab` with `PathwayAnalysisTab` at `pathway/:jid` route; removed unused `PlaceholderTab` import
- `NewAnalysisDropdown.tsx`: added `onPathwayClick` prop, enabled "Pathway Analysis" menu item (was disabled)
- `ExperimentView.tsx`: added `showPathwayWizard` state, wired `onPathwayClick`, rendered `<NewPathwayWizard>`
- `AnalysisQueuePage.tsx`: added `rnaseq_pathway` to `JOB_TYPE_OPTIONS` and `JOB_TYPE_TO_TAB`
- `constants.ts`: added `RNASEQ_PATHWAY_FILE_CATEGORIES` (10 categories with descriptions), `PATHWAY_GENE_LIST_OPTIONS`
- `types.ts`: added `PathwayPlotInfo`, `PathwayReport` interfaces
- `jobs.ts`: added `getPathwayReport()`, `downloadPathwayGOResults()`, `downloadPathwayKEGGResults()`, `downloadPathwayGeneList()`
- `useJobs.ts`: added `usePathwayReport()` hook

---

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Supported organisms | mm10 and hg38 only | clusterProfiler requires org.*.eg.db annotation databases; only Mouse and Human have these |
| Gene ID conversion | Ensembl→Entrez via `bitr()` in R | clusterProfiler's enrichGO/enrichKEGG require Entrez IDs |
| Gene filtering | Python-side before R script | Fails fast with clear error if no significant genes; R script gets clean input |
| KEGG failure handling | `tryCatch()` non-fatal | KEGG API can be unreachable; GO results still valid |
| GSEA | Optional toggle, off by default | Uses full ranked list (different from ORA); adds computation time |
| GO results format | Combined CSV with ontology column | Single file for all three ontologies; frontend filters by column |
| Plot format | PNG only (no SVG) | clusterProfiler dot plots don't benefit from vector graphics; simpler output handling |
| Auto-pipeline | Manual only (not auto-queued) | Pathway analysis requires user to choose gene direction + FDR; can't be automated like DE |
| Parent job | DE job (not alignment) | Pathway takes DE results directly; no intermediate step needed |
| Wizard steps | 3 (not 4 like DE) | No condition assignment needed; just pick DE job + configure enrichment settings |

---

## Files Summary

### New (11 files)
| File | Lines (est.) | Description |
|------|-------------|-------------|
| `backend/pipelines/scripts/rnaseq_pathway.R` | ~250 | clusterProfiler GO/KEGG + optional GSEA R script |
| `backend/pipelines/rnaseq_pathway.py` | ~450 | Pipeline stage: validate, run, mock_run, gene filtering |
| `backend/tests/test_rnaseq_pathway_pipeline.py` | ~220 | 23 pipeline tests |
| `backend/tests/test_rnaseq_pathway_report.py` | ~210 | 8 report endpoint tests |
| `frontend/src/components/rnaseq-pathway/NewPathwayWizard.tsx` | ~270 | 3-step wizard |
| `frontend/src/components/rnaseq-pathway/PathwayGOPanel.tsx` | ~190 | GO plots + enrichment table |
| `frontend/src/components/rnaseq-pathway/PathwayKEGGPanel.tsx` | ~135 | KEGG plot + pathway table |
| `frontend/src/components/rnaseq-pathway/PathwayFilesPanel.tsx` | ~18 | Files panel (delegates to AlignmentFilesPanel) |
| `frontend/src/pages/experiment/PathwayAnalysisTab.tsx` | ~130 | Tab page with 4 sub-tabs |

### Modified (13 files)
| File | Change |
|------|--------|
| `backend/pipelines/__init__.py` | Import + register `RnaseqPathwayStage` |
| `backend/pipelines/methods_text.py` | Add `rnaseq_pathway_methods()` |
| `backend/schemas/qc_report.py` | Add `PathwayPlotInfo`, `PathwayReport` |
| `backend/services/qc_report_service.py` | Add 5 pathway report functions + `json` import + `_PATHWAY_PLOT_CATEGORIES` |
| `backend/routers/jobs.py` | Add 4 pathway endpoints + `PathwayReport` import + 4 service function imports |
| `frontend/src/api/types.ts` | Add `PathwayPlotInfo`, `PathwayReport` interfaces |
| `frontend/src/api/jobs.ts` | Add 4 pathway API functions + `PathwayReport` import |
| `frontend/src/hooks/useJobs.ts` | Add `usePathwayReport()` hook |
| `frontend/src/lib/constants.ts` | Add `RNASEQ_PATHWAY_FILE_CATEGORIES`, `PATHWAY_GENE_LIST_OPTIONS` |
| `frontend/src/App.tsx` | Replace `PlaceholderTab` with `PathwayAnalysisTab`, remove unused import |
| `frontend/src/components/experiments/NewAnalysisDropdown.tsx` | Add `onPathwayClick` prop, enable Pathway menu item |
| `frontend/src/pages/ExperimentView.tsx` | Add wizard state + handler + import + render `<NewPathwayWizard>` |
| `frontend/src/pages/AnalysisQueuePage.tsx` | Add `rnaseq_pathway` to type filter + tab mapping |

---

## Test Coverage

| Test File | New | Total | Scope |
|-----------|-----|-------|-------|
| `test_rnaseq_pathway_pipeline.py` | **23** | 23 | Validation (12), mock_run (6), methods text (3), filter helper (1), organism map (1) |
| `test_rnaseq_pathway_report.py` | **8** | 8 | Report success, 404, 409 (wrong type), 409 (not complete), unauthorized, GO download, KEGG download, summary counts |
| **Phase C.4 Total** | **31** | | |

All tests pass. `ruff check` + `ruff format --check`: clean. `npm run build`: clean.

---

## Pipeline Stage Registry After Phase C.4

```python
_STAGES = {
    "trimming": TrimmingStage(),                    # CUT&RUN: Trimmomatic + kseq
    "rnaseq_trimming": RnaseqTrimmingStage(),       # RNA-seq: fastp
    "rnaseq_alignment": RnaseqAlignmentStage(),     # RNA-seq: STAR + Salmon + BigWigs
    "rnaseq_de": RnaseqDEStage(),                   # RNA-seq: DESeq2
    "rnaseq_feature_counts": FeatureCountsStage(),  # RNA-seq: featureCounts
    "rnaseq_qc": RnaseqQCStage(),                   # RNA-seq: RSeQC + MultiQC
    "rnaseq_pathway": RnaseqPathwayStage(),         # RNA-seq: clusterProfiler (NEW)
    "alignment": AlignmentStage(),                  # CUT&RUN: Bowtie2 13-step
    "peak_calling": PeakCallingStage(),             # CUT&RUN: MACS2/SICER2/SEACR
    "diffbind": DiffBindStage(),                    # CUT&RUN: DiffBind R
    "custom_heatmap": CustomHeatmapStage(),         # deepTools heatmaps
    "pearson_correlation": PearsonCorrelationStage(),# R + Python correlation
    "roman_normalization": RomanNormalizationStage(),# Mouse-only normalization
}
```

---

## RNA-seq Pipeline Completion Status

| Phase | Status | Tests |
|-------|--------|-------|
| A — Infrastructure + fastp | Complete | 20 |
| B — STAR + Salmon + BigWigs + Auto-pipeline | Complete | 32 |
| C.1 — featureCounts | Complete | 13 |
| C.2 — DESeq2 DE (backend + frontend) | Complete | 30 |
| C.3 — RSeQC + MultiQC (backend + frontend) | Complete | 36 |
| **C.4 — clusterProfiler Pathway** | **Complete** | **31** |
| **Total RNA-seq tests** | | **162** |

**The RNA-seq pipeline is now fully implemented.** All 6 phases complete. All sidebar PlaceholderTabs replaced with real components. All analysis dropdown items enabled and wired.

---

## Dependencies Added

| Package | Version | Purpose |
|---------|---------|---------|
| clusterProfiler | (R/Bioconductor) | GO enrichment + KEGG pathway analysis (called via Rscript subprocess) |
| org.Mm.eg.db | (R/Bioconductor) | Mouse gene annotation database (Ensembl→Entrez mapping) |
| org.Hs.eg.db | (R/Bioconductor) | Human gene annotation database |
| DOSE | (R/Bioconductor) | Required by clusterProfiler for GSEA |

No new Python pip or npm packages. R packages called via `Rscript` subprocess.
