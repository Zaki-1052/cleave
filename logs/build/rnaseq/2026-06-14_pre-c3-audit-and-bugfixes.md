# Pre-C.3 Audit & Bug Fixes

> 1 session on 2026-06-14. Audited all existing RNA-seq pipeline code (Phases A-C.2), fixed 9 issues across backend and frontend.

---

## Audit Summary

Multi-agent audit (8 agents) of all RNA-seq pipeline code against the CUT&RUN gold standard. Confirmed Phases A, B, C.1, and C.2 are fully complete. Phases C.3 (RSeQC+MultiQC) and C.4 (clusterProfiler pathway) are not started — frontend routes still use `PlaceholderTab`.

### Completion Status

| Phase | Status | Evidence |
|-------|--------|---------|
| A — Infrastructure + fastp | Complete | `rnaseq_trimming.py` (416 lines), migration, RNASEQ_TABS, 14 tests |
| B — STAR + Salmon + BigWigs | Complete | `rnaseq_alignment.py` (953 lines), QC endpoints, auto-pipeline chain, 32 tests |
| C.1 — featureCounts | Complete | `rnaseq_feature_counts.py` (345 lines), wizard+tab wired, 13 tests |
| C.2 — DESeq2 DE | Complete | `rnaseq_de.py` (571 lines), 2 R scripts, DE report endpoints, full frontend, 30 tests |
| C.3 — RSeQC + MultiQC | **Not started** | No `rnaseq_qc.py`, PlaceholderTab in App.tsx |
| C.4 — clusterProfiler Pathway | **Not started** | No `rnaseq_pathway.py`, no R script, PlaceholderTab |

### Overall Code Quality

The RNA-seq codebase is solid. The previous AI followed patterns well — assay-type-aware rendering, proper wizard/tab structure, auto-pipeline branching all work correctly. No lazy implementations or shortcuts found. All issues were either real bugs or minor consistency/style gaps.

---

## All Issues Fixed (9)

### 1. BAM/index mismatch when dedup enabled (`rnaseq_alignment.py:480`)

When `remove_duplicates=True`, the registered BAM (`sorted_bam`, pre-dedup) and the registered index (`dedup_bam.bai`) didn't match. The dedup BAM was never registered as an output.

**Fix**: Changed `_add_output(sorted_bam, ...)` to `_add_output(final_bam, ...)` — `final_bam` always points to the correct BAM (dedup or sorted depending on settings) and matches `bam_index`.

### 2. bamCoverage not validated — both pipelines (`alignment.py:838`, `rnaseq_alignment.py:551`)

Neither `alignment.py` nor `rnaseq_alignment.py` checked for `bamCoverage` in `validate()`. If deepTools were missing, bigWig generation would silently skip while the job reports success.

**Fix**: Added `"bamCoverage"` to the tool validation list in both pipelines.

### 3. Confusing double-error for unsupported genomes (`rnaseq_alignment.py:524-529`)

`validate()` checked `EFFECTIVE_GENOME_SIZES` (5 genomes) first, then `RNASEQ_GENOME_CONFIG` (2 genomes). Submitting hg19/dm6/sacCer3 produced a confusing two-step error. RNA-seq only supports mm10 and hg38.

**Fix**: Removed the `EFFECTIVE_GENOME_SIZES` check — now validates directly against `RNASEQ_GENOME_CONFIG` with a clear error message. Updated test assertion to match new wording.

### 4. Log file_category inconsistency (`rnaseq_de.py:399 vs :553`)

`run()` registered the master log as `"log"` but `mock_run()` used `"master_log"`. Frontend file category filtering would differ between mock and real mode.

**Fix**: `run()` now uses a lookup dict to assign `"master_log"` for the master log and `"log"` for the R script output log — consistent with `mock_run()`.

### 5. Dark mode missing on DEResultsPanel error state (`DEResultsPanel.tsx:105`)

`text-red-600` without `dark:text-red-400`.

**Fix**: Added `dark:text-red-400`.

### 6. Dark mode missing on DEPlotsPanel error state (`DEPlotsPanel.tsx:47`)

Same dark mode gap.

**Fix**: Added `dark:text-red-400`.

### 7. Textarea dark mode styling (`NewFeatureCountsWizard.tsx:183`)

Notes textarea had `border bg-background` without `border-border` or focus ring classes.

**Fix**: Added `border-border` and `focus:outline-none focus:ring-2 focus:ring-ring`.

### 8. featureCounts DE path shows Ensembl IDs instead of gene symbols (`rnaseq_deseq2_fc.R:134`)

The Salmon path maps gene IDs to symbols via tx2gene, but the featureCounts path had `gene_name = gene_id` — users would see `ENSMUSG00000057666` where they expect `Gapdh`.

**Fix**: Added `_generate_gene_mapping()` helper in `rnaseq_de.py` that extracts unique gene_id → gene_name pairs from the GENCODE GTF. The featureCounts path now generates this mapping and passes it as an optional 6th argument to the R script. The R script reads the mapping and merges gene names into results, falling back to gene_id if the mapping file is absent. Backward-compatible — the argument is optional.

### 9. `rnaseq_trimming_methods()` not in shared module (`methods_text.py`)

All other RNA-seq stages delegate methods text to the shared `methods_text.py` module, but trimming had it inline.

**Fix**: Added `rnaseq_trimming_methods()` to `methods_text.py`. Updated `rnaseq_trimming.py` to import and delegate to it. Identical text output — no behavior change.

---

## Verification

- `ruff check` + `ruff format --check`: clean (all modified files)
- `npm run build`: clean
- All 110 tests pass (12 RNA-seq alignment + 22 DE pipeline + 8 DE report + 14 trimming + 13 featureCounts + 12 auto-pipeline + 29 CUT&RUN alignment)
- 0 failures

---

## Files Modified (9)

| File | Change |
|------|--------|
| `backend/pipelines/rnaseq_alignment.py` | Fix dedup output registration; add bamCoverage to validate; simplify genome validation to RNASEQ_GENOME_CONFIG only |
| `backend/pipelines/alignment.py` | Add bamCoverage to validate |
| `backend/pipelines/rnaseq_de.py` | Fix log file_category consistency; add `_generate_gene_mapping()` helper; pass gene mapping to featureCounts R script |
| `backend/pipelines/scripts/rnaseq_deseq2_fc.R` | Accept optional gene_mapping.tsv argument; merge gene symbols into results |
| `backend/pipelines/methods_text.py` | Add `rnaseq_trimming_methods()` function |
| `backend/pipelines/rnaseq_trimming.py` | Import and delegate to shared `rnaseq_trimming_methods()` |
| `frontend/src/components/rnaseq-de/DEResultsPanel.tsx` | Add `dark:text-red-400` to error state |
| `frontend/src/components/rnaseq-de/DEPlotsPanel.tsx` | Add `dark:text-red-400` to error state |
| `frontend/src/components/rnaseq-feature-counts/NewFeatureCountsWizard.tsx` | Fix textarea border + focus ring for dark mode |
| `backend/tests/test_rnaseq_alignment_pipeline.py` | Update unsupported genome test assertion for new error message |

---

## What's Next: Phase C.3 (RSeQC + MultiQC)

See `docs/rna-seq-c3-plan.md` for full spec. Key work:
1. `backend/pipelines/rnaseq_qc.py` — RSeQC (5 modules per reaction) + MultiQC aggregation
2. Register `"rnaseq_qc"` in pipeline registry
3. Auto-pipeline: insert QC between alignment and DE
4. Schemas, QC report service, API endpoints
5. Frontend: wizard + tab (replace PlaceholderTab) + 3 sub-tabs (Overview/MultiQC iframe, Per-Sample metrics, Files)
6. Tests
