# Phase C.5 — Interactive Gene Expression Tables

> 1 session on 2026-06-15. Phase C.5 is **complete**. 0 new tests (all 30 DE tests passing). `ruff check` + `ruff format --check` + `npm run build`: clean.

---

## What Was Built

Enhanced `DEResultsPanel.tsx` with all C.5 spec features for the RNA-seq DE Analysis Results sub-tab.

### Gene Search
- Text input with Search icon filtering rows by `gene_name` or `gene_id` (case-insensitive substring match)
- Follows `AnalysisQueuePage` search input styling pattern

### Significance Filter
- shadcn Select dropdown: All genes / padj < 0.05 / padj < 0.01
- Filters preview rows client-side before passing to DataTable

### Direction Filter
- shadcn Select dropdown: All directions / Upregulated / Downregulated
- Direction filter requires padj < 0.05 (matching backend counting logic for up/downregulated stats)

### Filtered CSV Export
- Client-side Blob download generating CSV from filtered preview data
- "Export filtered (N)" button appears only when filters are active
- Proper CSV quoting for values containing commas/quotes/newlines

### Ensembl Gene Links
- `gene_name` column renders as clickable link with ExternalLink icon (lucide-react)
- Links to `ensembl.org/{species}/Gene/Summary?g={gene_id}`
- Species resolved from `organism` prop (mm10→Mus_musculus, hg38/hg19→Homo_sapiens) with gene ID prefix fallback
- Falls back to plain text when species cannot be determined

### Preview Indicator
- "Showing X of Y genes" text below filter toolbar
- Notes preview row limit and points users to full TSV download

### Backend Preview Increase
- `_parse_rnaseq_de_results_tsv` `max_rows` increased from 100 to 500
- DE results have 15K-25K genes; 100 rows made search nearly useless
- Summary stats (totalGenes, sig counts) already scanned ALL rows regardless
- DiffBind stays at 100 (peak results are typically hundreds, not tens of thousands)

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Preview row limit | 500 (was 100) | 100 rows = 96-99% miss rate for gene search. 500 rows ~200-400KB JSON |
| Filtering approach | Client-side on preview data | Full file only via download; no new backend endpoints needed |
| Filtered CSV download | Client-side Blob | Data already in browser memory; avoids new backend route/params |
| Gene links target | gene_name column linking via gene_id | Users scan gene names (Gapdh, Tp53); gene_id provides stable Ensembl URL |
| Direction + significance | Direction filter implies padj < 0.05 | Matches backend counting: upregulated = lfc > 0 AND padj < 0.05 |
| Organism resolution | Prop from job.params + gene ID prefix fallback | Handles null organism gracefully |

---

## Files Modified (3)

| File | Change |
|------|--------|
| `backend/services/qc_report_service.py` | `max_rows: 100` → `500` in `_parse_rnaseq_de_results_tsv` (1 line) |
| `frontend/src/components/rnaseq-de/DEResultsPanel.tsx` | Added search, filters, gene links, filtered download, preview indicator (~120 new lines, total ~305 lines) |
| `frontend/src/pages/experiment/DEAnalysisTab.tsx` | Pass `organism` prop to DEResultsPanel from `job.params.reference_genome` (~1 line) |

---

## C.6 Test Status

All C.6 tests already exist from prior phases (C.1–C.4). No new tests added. Verified all 30 DE-related tests pass with the `max_rows` change:
- `test_rnaseq_de_pipeline.py` — 22 passed
- `test_rnaseq_de_report.py` — 8 passed (includes significance counting verification)

---

## Phase C Done Criteria Status

- [x] featureCounts produces gene count matrix from STAR BAMs (C.1)
- [x] DESeq2 runs with Salmon (tximport) input (C.2)
- [x] DESeq2 runs with featureCounts input (C.2)
- [x] Volcano, MA, PCA plots generated (C.2)
- [x] Top genes heatmap generated (C.2)
- [x] Interactive gene table with search/filter/sort (C.5 — **this session**)
- [x] RSeQC metrics (read distribution, gene body coverage, strandedness) (C.3)
- [x] MultiQC aggregates all QC reports (C.3)
- [x] clusterProfiler GO enrichment + KEGG pathway analysis (C.4)
- [x] All visualization downloadable as PNG/SVG/CSV (C.2/C.4)
- [x] Methods text generated for all stages (A–C.4)
- [x] All new tests passing (C.1–C.4, 162 RNA-seq tests total)
- [x] `ruff check` + `ruff format --check` + `npm run build` clean

**Phase C is now fully complete. The RNA-seq pipeline implementation is finished.**
