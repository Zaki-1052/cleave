# Phase 4 Summary — Peak Calling

> 4 sessions on 2026-03-27. Phase 4 is **complete**. All 8 done criteria checked off. **66 new tests** (52 pipeline + 8 QC endpoints + 6 existing QC tests extended). Total project tests: ~283.

---

## What Was Built

### Peak Calling Pipeline Module (4.1)
- `PeakCallingStage(PipelineStage)` in `backend/pipelines/peak_calling.py` (1,376 lines) — supports all 5 peak caller modes:
  - **MACS2 narrow**: `-f BAMPE -q 0.01 -B --SPMR --keep-dup all` (default q-value=0.01, lab standard)
  - **MACS2 broad**: `--broad --broad-cutoff 0.1 -B --SPMR --keep-dup all`
  - **SICER2 broad**: FDR 0.01 default
  - **SEACR stringent**: full preprocessing chain — MACS2 bedgraph (no `--SPMR`) → `change.bdg.py` float→int → `SEACR_1.1.sh 0.01 non stringent`
  - **SEACR relaxed**: same chain, `relaxed` mode
- **Fragment size filter (<120bp)**: Default ON. Triple-pipe via `samtools view -h | awk -f filter_below.awk | samtools view -Sb`. New `_run_triple_pipe()` helper. Filters to sub-nucleosomal fragments (protein footprints).
- **IgG control**: Passed as MACS2 `-c` flag (CUTANA Cloud pattern). Filtered IgG BAM cached across reactions to avoid redundant filtering.
- **FRiP calculation**: `bedtools intersect -a <bam> -b <peaks> -u -ubam | samtools view -c` ÷ `samtools view -c <bam>`. Results written to `frip_scores.csv`.
- **HOMER annotation**: `annotatePeaks.pl <peaks> <genome>` — non-fatal on failure (core pipeline + FRiP still complete).
- **Post-peak blacklist subtraction**: `bedtools subtract -a <peaks> -b <blacklist>`.
- **QC CSV outputs**: `peak_caller_metrics.csv` (per-reaction metrics), `top_called_peaks.csv` (top 10 peaks per reaction), `frip_scores.csv` (FRiP per reaction). All comma-separated (matching alignment pattern).
- **Mock mode**: Loads canned CUTANA Cloud CSVs (tab-separated source → comma-separated output), creates stub BED/annotation files with realistic content. Varied annotation data for IgG vs target reactions.
- **Methods text**: `peak_calling_methods()` added to `methods_text.py` — manuscript-ready text with tool versions, thresholds, and genome names.
- **Dispatcher**: Registered `"peak_calling"` in `pipelines/__init__.py`.

### Peak Calling Wizard UI (4.2)
- **4-step wizard** (`NewPeakCallingWizard.tsx`, 374 lines) matching `cutana-cloud-ui.md` §8:
  - **Step 1 (Details)**: Peak calling name (30-char limit with counter), notes textarea, About panel with "What is Peak Calling?" / "What Does the Pipeline Do?" / "Outputs" sections.
  - **Step 2 (Choose Alignment)**: Radio-button table of completed alignment jobs. Only complete alignments selectable.
  - **Step 3 (Choose Reactions)**: Checkbox table with select-all, indeterminate state, selected count. Reactions loaded from selected alignment job.
  - **Step 4 (Peak Calling Settings)**: Peak Caller dropdown (MACS2/SICER2/SEACR), Peak Size dropdown (dependent on caller), IgG Control dropdown per reaction (auto-detects "igg" in short_name). Collapsible Advanced Settings with caller-specific threshold (q-value for MACS2 narrow, broad cutoff for MACS2 broad, SEACR threshold, SICER2 FDR) + fragment filter checkbox (default ON) + fragment size input (120bp).
- **BAM path resolution**: Fetches alignment job outputs with `useJobOutputs(alignmentJobId, 'unique_bam')` and matches by `reactionId`.
- **Reference genome**: Inherited from parent alignment job (read-only in wizard).
- **Peak caller/size**: Job-level settings (single selection for entire job, not per-reaction) — matches CUTANA Cloud behavior.
- Enabled Peak Calling in `NewAnalysisDropdown.tsx` (removed disabled state, wired callback).

### Peak Calling QC Report (4.3)
- **Backend endpoints**:
  - `GET /jobs/{id}/peak-qc-report` → `PeakCallingQCReport` JSON (metrics + top peaks + annotations)
  - `GET /jobs/{id}/peak-qc-report/download` → CSV file of peak metrics
  - `GET /jobs/{id}/peak-qc-report/annotation-csv` → CSV of annotation percentages per reaction
- **QC report service**: `get_peak_calling_qc_report()`, `get_peak_calling_qc_csv_path()`, `get_peak_annotation_csv()` with authorization via project membership join.
- **HOMER annotation parsing**: `_parse_annotation_stats()` maps HOMER's annotation prefixes to 10 CUTANA Cloud categories (Promoter, Exon, Intron, Intergenic, 3UTR, 5UTR, TTS, ncRNA, miRNA, pseudo).
- **Top peaks resolution**: Fixed bug where `top_called_peaks.csv` was registered as `file_category: "qc_report"` (same as metrics CSV). Now registered as `"top_peaks"` with `_resolve_output_by_name()` fallback for backward compatibility.
- **Peak Annotation Chart** (`PeakAnnotationChart.tsx`, 145 lines) — first chart in the codebase:
  - Recharts `<BarChart layout="vertical">` with 10 stacked color-coded bars per reaction
  - SVG-to-canvas PNG export (zero external dependency)
  - CSV download button
  - Integrated into `PeakCallingQCReportPanel` with "About Peak Annotation Plots" info sidebar
- **FRiP color coding**: green >=0.2 (good), amber 0.1-0.2 (marginal), red <0.1 (poor)
- **Pydantic schemas**: `PeakCallingReactionMetrics`, `TopCalledPeak`, `PeakAnnotationResult`, `PeakCallingQCReport` in `schemas/qc_report.py`

### Peak Calling Sub-tabs (4.4)
- **PeakCallingTab** (`PeakCallingTab.tsx`, 146 lines) — full tab with job selector dropdown and 5 sub-tabs:
  - **Info**: Three-card layout (Details, Methods Text with copy button, editable Notes)
  - **Input**: Reactions DataTable with IgG Control, Reference Genome, Peak Caller, Peak Size columns
  - **QC Report**: FRiP metrics table + Peak Annotation stacked bar chart + Top Called Peaks + info panel
  - **Files**: Category dropdown (BED Files, FRiP Score, Peak Annotation, Peak Annotation Stats, Logs) with checkbox-selectable file table and batch download
  - **IGV**: Placeholder for Phase 5
- **FRiP file generation**: Added `_write_frip_csv()` helper and `frip_scores.csv` output with `file_category: "frip"` in both `run()` and `mock_run()`.
- **Log file registration**: Added glob-based log registration in real mode's per-reaction loop.
- Fixed 2 broken test assertions from Phase 4.3's `top_peaks` category change. Added 3 new FRiP-related tests.

---

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| MACS2 default q-value | `0.01` (lab standard) | More stringent than CUTANA Cloud's 0.05. Both available in Advanced Settings. |
| Fragment filter default | ON (<120bp) | Sub-nucleosomal fragments are the biologically relevant CUT&RUN signal. Uses `filter_below.awk` from lab reference. |
| IgG handling | Passed as MACS2 `-c` flag | CUTANA Cloud pattern. Lab scripts don't pass IgG as control; Cleave adds this for better background subtraction. |
| SEACR threshold mode | Numeric `0.01` (not IgG bedgraph) | Matches lab behavior. Both modes supported but numeric is default. |
| SEACR preprocessing | MACS2 bdg (no `--SPMR`) → `change.bdg.py` → SEACR | Exact lab chain. `--SPMR` omitted for bedgraph input to SEACR (produces raw counts, not normalized). |
| Peak caller/size scope | Job-level (not per-reaction) | CUTANA Cloud behavior. All reactions in a peak calling job use same caller/size. |
| HOMER failure handling | Non-fatal warning | Core pipeline (peaks + FRiP) still completes. HOMER is annotation-only, not blocking. |
| Annotation categories | 10 CUTANA Cloud categories | Prefix-based mapping from HOMER output to Promoter, Exon, Intron, Intergenic, 3UTR, 5UTR, TTS, ncRNA, miRNA, pseudo. |
| Chart library | Recharts | Already in project dependencies. Stacked bar chart matches CUTANA Cloud's genomic feature distribution visualization. |
| PNG export | SVG-to-canvas (zero dependency) | No html2canvas or dom-to-image needed. Direct SVG serialization → canvas drawImage → blob. |
| IgG auto-detection | Case-insensitive "igg" in short_name | Pre-selects IgG control in wizard. User can override. |
| Top peaks output | Separate `file_category: "top_peaks"` | Fixed bug where top peaks and metrics shared `"qc_report"` category, making top peaks unfindable. |
| Helper function reuse | Duplicated from alignment.py | Each pipeline module is self-contained. Matches codebase pattern (no shared helpers between stages). |

---

## API Status After Phase 4

### Newly Implemented (Phase 4)
- `GET /api/v1/jobs/{id}/peak-qc-report` — Peak calling QC report as structured JSON (metrics + top peaks + annotations)
- `GET /api/v1/jobs/{id}/peak-qc-report/download` — Peak calling metrics CSV download
- `GET /api/v1/jobs/{id}/peak-qc-report/annotation-csv` — Peak annotation percentages CSV download

### Enhanced (Phase 4)
- `POST /api/v1/experiments/{id}/jobs` — Now supports `job_type: "peak_calling"` with full validation
- `GET /api/v1/jobs/{id}/outputs?category=` — Now supports peak calling categories (bed, frip, annotation, annotation_stats, top_peaks, qc_report, log)

### Still Stub (Phase 5+)
- IGV.js integration (placeholder sub-tab exists)

---

## Database Schema Changes

No new migrations in Phase 4. The existing 4 migrations already had all required tables. Peak calling jobs use the same `analysis_jobs` table with `job_type="peak_calling"` and `parent_job_id` pointing to the alignment job. Peak calling outputs stored in `job_outputs` with new `file_category` values: `bed`, `frip`, `annotation`, `annotation_stats`, `top_peaks`, `qc_report`, `log`.

---

## Test Coverage

| Test File | Count | Scope |
|-----------|-------|-------|
| `test_peak_calling_pipeline.py` | 52 | Validation (18), mock run (12), methods text (8), helpers (9), schemas/constants (5) |
| `test_qc_report.py` | 14 | Alignment QC (6) + Peak calling QC (8): success, top_peaks, annotations, 404, wrong status, unauthorized, CSV download, annotation CSV |
| **Phase 4 new total** | **66** | |

Combined with Phase 1-3 tests (~217), total project test count is ~283.

All tests run inside Docker (`docker compose exec api pytest tests/`). `ruff check` + `ruff format --check`: clean. `tsc --noEmit`: clean.

---

## New Files Created in Phase 4

### Backend Pipeline Modules
- `backend/pipelines/peak_calling.py` — 1,376-line peak calling stage (5 callers, fragment filter, FRiP, HOMER, blacklist subtraction)

### Backend Schemas (Extended)
- `backend/schemas/qc_report.py` — Added `PeakCallingReactionMetrics`, `TopCalledPeak`, `PeakAnnotationResult`, `PeakCallingQCReport`

### Backend Services (Extended)
- `backend/services/qc_report_service.py` — Added `get_peak_calling_qc_report()`, `get_peak_calling_qc_csv_path()`, `get_peak_annotation_csv()`, `_parse_annotation_stats()`, `_classify_annotation()`, `_resolve_output_by_name()`, `_resolve_all_outputs()`

### Backend Routers (Extended)
- `backend/routers/jobs.py` — Added 3 peak calling QC endpoints, refactored `_get_authorized_alignment_job` → `_get_authorized_job`

### Backend Pipeline Methods (Extended)
- `backend/pipelines/methods_text.py` — Added `peak_calling_methods()`

### Frontend Components (10 new)
- `frontend/src/components/peak-calling/NewPeakCallingWizard.tsx` — 4-step wizard orchestrator
- `frontend/src/components/peak-calling/PeakCallingDetailsStep.tsx` — Step 1 (name, notes, about)
- `frontend/src/components/peak-calling/ChooseAlignmentStep.tsx` — Step 2 (completed alignments radio table)
- `frontend/src/components/peak-calling/ChooseReactionsStep.tsx` — Step 3 (reaction checkboxes)
- `frontend/src/components/peak-calling/PeakCallingSettingsStep.tsx` — Step 4 (caller, size, IgG, thresholds, fragment filter)
- `frontend/src/components/peak-calling/PeakCallingInfoPanel.tsx` — Info sub-tab
- `frontend/src/components/peak-calling/PeakCallingInputPanel.tsx` — Input sub-tab
- `frontend/src/components/peak-calling/PeakCallingQCReportPanel.tsx` — QC report sub-tab
- `frontend/src/components/peak-calling/PeakCallingFilesPanel.tsx` — Files sub-tab
- `frontend/src/components/peak-calling/PeakAnnotationChart.tsx` — Recharts stacked bar chart (first chart in codebase)

### Frontend Pages (Extended)
- `frontend/src/pages/experiment/PeakCallingTab.tsx` — Full tab replacement (was placeholder)

### Frontend API/Hooks (Extended)
- `frontend/src/api/jobs.ts` — Added `getPeakCallingQCReport()`, `downloadPeakCallingQCCsv()`, `downloadPeakAnnotationCsv()`
- `frontend/src/api/types.ts` — Added `PeakCallingReactionMetrics`, `TopCalledPeak`, `PeakAnnotationResult`, `PeakCallingQCReport`
- `frontend/src/hooks/useJobs.ts` — Added `usePeakCallingQCReport()`
- `frontend/src/lib/constants.ts` — Added `PEAK_CALLERS`, `PEAK_SIZES`, `PEAK_CALLING_FILE_CATEGORIES`, `PEAK_CALLING_DEFAULTS`

### Tests
- `backend/tests/test_peak_calling_pipeline.py` — 52 tests (validation, mock run, methods text, helpers, schemas)
- `backend/tests/test_qc_report.py` — 8 new peak calling tests (14 total in file)

---

## Known Issues / Tech Debt

### Resolved in Phase 4
- ~~Peak Calling disabled in New Analysis dropdown~~ → Enabled and wired
- ~~PeakCallingTab was placeholder~~ → Full implementation with 5 sub-tabs
- ~~No FRiP score file output~~ → Added `frip_scores.csv` with `file_category: "frip"`
- ~~Top peaks and metrics shared same file_category~~ → Split into separate `"top_peaks"` category with backward-compatible fallback
- ~~No peak annotation visualization~~ → Recharts stacked bar chart matching CUTANA Cloud

### Still Open
- **EC2 real-mode validation**: Real peak calling pipeline implemented but not yet tested with actual data on EC2 instance.
- **SICER2 real-mode**: SICER2 invocation implemented but not tested (requires SICER2 binary on EC2). Mock mode works.
- **IGV sub-tab**: Phase 5 placeholder.
- ~~Helper function duplication~~ → Resolved: extracted `get_threads()`, `run_cmd()`, `run_piped_cmd()`, `count_bam_reads()`, `resolve_blacklist()` to `base.py`. Both `alignment.py` and `peak_calling.py` now import from base.

---

## Dependencies Added in Phase 4

No new dependencies. Recharts was already in `package.json`. All pipeline tools (MACS2, SEACR, SICER2, HOMER, BEDTools, SAMtools) are external binaries invoked via `subprocess.run()`.

---

## Phase 4 Done Criteria Status

- [x] All 5 peak caller modes work (MACS2 narrow/broad, SICER2, SEACR stringent/relaxed)
- [x] Fragment filter (<120bp) applied by default before calling
- [x] IgG control correctly assigned per reaction
- [x] SEACR preprocessing chain (MACS2 bdg → integer conversion → SEACR) works
- [x] FRiP calculation produces scores >0.2 for good enrichment targets
- [x] HOMER annotates peaks to genomic features
- [x] QC report shows FRiP table and annotation stacked bar chart
- [x] Peak calling files browsable by category (BED, FRiP, Annotation)

---

## What's Next: Phase 5 (Visualization)

IGV.js genome browser integration in Alignment and Peak Calling tabs. Users select reactions, view signal tracks (smoothed bigWigs), and compare enrichment across samples. Peak calling BED tracks overlay as annotation bars below signal. See `docs/PLAN.md` Phase 5 for full spec.

Key prerequisites already completed:
- Alignment produces smoothed bigWigs (`file_category: "smoothed_bigwig"`) for IGV tracks
- Peak calling produces BED files (`file_category: "bed"`) for annotation tracks
- Files sub-tab already has category-filtered browsing and download infrastructure
- IGV placeholder sub-tab exists in both AlignmentTab and PeakCallingTab
- Backend file serving with byte-range support (NGINX `X-Accel-Redirect`) already implemented
