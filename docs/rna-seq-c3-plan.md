# Phase C.3 — RSeQC + MultiQC RNA-seq QC Pipeline

## Context

Phases A-C.2 built the RNA-seq pipeline: fastp trimming, STAR+Salmon alignment, featureCounts, and DESeq2 DE analysis. Phase C.3 adds comprehensive QC via RSeQC (per-reaction RNA-seq metrics) and MultiQC (aggregated interactive HTML report). The QC Dashboard tab currently renders a `PlaceholderTab` — this plan replaces it with a real implementation.

**Why**: RNA-seq QC metrics (strandedness, read distribution, gene body coverage, fragment size, junction saturation) are essential for validating data quality before interpreting DE results. MultiQC aggregates all prior QC (fastp, STAR, Salmon, RSeQC, featureCounts) into one interactive report.

---

## Implementation Steps

### Step 1: Backend Config

**Modify**: `backend/config.py`
- Add `RSEQC_BED_DIR: str = "/data/cleave/genomes/rseqc"` setting

### Step 2: Methods Text

**Modify**: `backend/pipelines/methods_text.py`
- Add `rnaseq_qc_methods(params: dict) -> str` function
- Text references: RSeQC modules (infer_experiment, read_distribution, geneBody_coverage, inner_distance, junction_saturation), gene model BED12 source (GENCODE annotation version from `RNASEQ_ANNOTATION_VERSIONS`), MultiQC aggregation
- Follow pattern of existing `rnaseq_alignment_methods()` and `rnaseq_de_methods()`

### Step 3: Pipeline Stage

**Create**: `backend/pipelines/rnaseq_qc.py` (~500 lines)

Core structure:
- `RSEQC_BED_CONFIG` dict: `{"mm10": "mm10_gencode_vM10.bed12", "hg38": "hg38_gencode_v29.bed12"}`
- `_resolve_bed12(genome: str) -> Path` helper: resolves BED12 path from config + `settings.RSEQC_BED_DIR`
- `@dataclass(frozen=True) _RnaseqQCContext`: rseqc tool paths (infer_experiment.py, read_distribution.py, etc.), multiqc path, bed12_path, threads, job_dir, rel_job, cancelled callback
- `_process_rseqc_reaction(rxn, ctx, reaction_log) -> dict`: runs 5 RSeQC modules per BAM, returns metrics dict + outputs list
- `_parse_infer_experiment(stdout) -> dict`: parse strandedness fractions
- `_parse_read_distribution(stdout) -> dict`: parse feature distribution counts
- `_run_multiqc(ctx, staging_dir) -> Path`: run `multiqc <staging_dir> --outdir <out> --force`
- `_write_rseqc_metrics_csv(metrics_list, output_path)`: aggregate per-sample CSV
- `RnaseqQCStage(PipelineStage)`:
  - `validate()`: check alignment_job_id, reference_genome (in RSEQC_BED_CONFIG), reactions with bam_path; real mode checks RSeQC/multiqc on PATH + BED12 exists
  - `run()`: create dirs, build context, ThreadPoolExecutor per-reaction for RSeQC, create MultiQC staging dir with symlinks to prior job outputs (fastp JSONs, STAR logs, Salmon meta_info, featureCounts summary passed via params), run MultiQC, aggregate outputs
  - `mock_run()`: create stub RSeQC text files + mock MultiQC HTML + metrics CSV + `_STUB_PNG` plots
  - `generate_methods_text()`: delegate to `rnaseq_qc_methods()`

**Job params expected** (set by wizard or auto-pipeline):
```python
{
    "experiment_id": int,
    "project_id": int,
    "reference_genome": str,
    "alignment_job_id": int,
    "reactions": [{"reaction_id": int, "short_name": str, "bam_path": str}],
    # Optional paths for MultiQC symlinks:
    "fastp_report_paths": [str],      # fastp JSON paths from trimming job
    "star_log_paths": [str],          # STAR Log.final.out paths
    "salmon_meta_paths": [str],       # Salmon meta_info.json paths
    "featurecounts_summary_path": str | None,  # featureCounts .summary
}
```

**RSeQC commands per reaction** (run via `run_cmd()`):
1. `infer_experiment.py -r <BED12> -i <BAM>` → capture stdout → parse
2. `read_distribution.py -r <BED12> -i <BAM>` → capture stdout → parse
3. `geneBody_coverage.py -r <BED12> -i <BAM> -o <prefix>` → generates .txt + .r + .pdf
4. `inner_distance.py -r <BED12> -i <BAM> -o <prefix>` → generates .txt + .r + .pdf
5. `junction_saturation.py -r <BED12> -i <BAM> -o <prefix>` → generates .txt + .r + .pdf

**Output file categories**: `rseqc_infer_experiment`, `rseqc_read_distribution`, `rseqc_genebody_coverage`, `rseqc_inner_distance`, `rseqc_junction_saturation`, `multiqc_report`, `rseqc_metrics`, `master_log`

### Step 4: Pipeline Registration

**Modify**: `backend/pipelines/__init__.py`
- Import `RnaseqQCStage` from `rnaseq_qc`
- Add `"rnaseq_qc": RnaseqQCStage()` to `_STAGES` dict

### Step 5: Pydantic Schemas

**Modify**: `backend/schemas/qc_report.py`
- Add `RSeQCReactionMetrics(CamelModel)` with fields: short_name, fraction_sense, fraction_antisense, fraction_undetermined, inferred_strandedness, cds_exons_tags, five_utr_exons_tags, three_utr_exons_tags, intron_tags, intergenic_tags, coverage_skewness, inner_distance_mean, inner_distance_sd
- Add `RnaseqQCDashboardReport(CamelModel)` with: reference_genome, modules_run (list[str]), metrics (list[RSeQCReactionMetrics]), multiqc_output_id (int | None)

### Step 6: QC Report Service

**Modify**: `backend/services/qc_report_service.py`
- Add `_RSEQC_METRICS_COLUMNS` list
- Add `_parse_rseqc_metrics_csv(csv_path) -> list[RSeQCReactionMetrics]`
- Add `get_rnaseq_qc_dashboard_report(db, job_id, user_id) -> RnaseqQCDashboardReport | None`: auth check, type check (`rnaseq_qc`), status check, parse CSV, find multiqc_report output ID
- Add `get_rnaseq_qc_dashboard_csv_path(db, job_id, user_id) -> Path | None`: auth check, resolve rseqc_metrics CSV path

### Step 7: API Endpoints

**Modify**: `backend/routers/jobs.py`
- Add `GET /jobs/{job_id}/rnaseq-qc-dashboard-report` → `RnaseqQCDashboardReport`
- Add `GET /jobs/{job_id}/rnaseq-qc-dashboard-report/download` → FileResponse CSV
- Same error handling pattern: ValueError → 409, FileNotFoundError → 404, None → 404
- Add imports for new schemas and service functions

### Step 8: Auto-Pipeline Integration

**Modify**: `backend/services/auto_pipeline_service.py`

Change the `rnaseq_alignment` completion branch (line 184-199):

```python
elif job_type == "rnaseq_alignment":
    config["_rnaseq_alignment_job_id"] = job_id
    await db.execute(update(Experiment)...)
    await db.commit()
    # Queue QC before DE
    await _queue_rnaseq_qc(db, experiment_id, config, alignment_job_id=job_id)
```

Add new `rnaseq_qc` completion branch:
```python
elif job_type == "rnaseq_qc":
    if config.get("include_de", True):
        alignment_job_id = config.get("_rnaseq_alignment_job_id", 0)
        can_de = await _can_run_rnaseq_de(db, experiment_id)
        if can_de and alignment_job_id:
            await _queue_rnaseq_de(db, experiment_id, config, alignment_job_id=alignment_job_id)
            return
    await _mark_complete(db, experiment_id)
```

Add `_queue_rnaseq_qc()` helper: fetch alignment job outputs (sorted_bam, star_log, salmon_meta), optionally find trimming/featureCounts job outputs, build params, create auto job.

**Modify**: `backend/schemas/auto_pipeline.py`
- Add `include_qc: bool = True` to `AutoPipelineConfig`

### Step 9: Frontend Auto-Pipeline Updates

**Modify**: `frontend/src/components/experiments/AutoPipelineConfigPanel.tsx`
- Add `includeQc` / `setIncludeQc` props to `RnaseqConfigPanelProps`
- Add QC Dashboard toggle checkbox in Optional Analysis Steps section
- Add QC Dashboard step to `steps` array: `{ name: 'QC Dashboard (RSeQC+MultiQC)', included: includeQc, note: 'Read distribution, coverage, strandedness' }`

**Modify**: `frontend/src/components/experiments/AutoPipelineModal.tsx`
- Add `includeQc` state (default true)
- Pass to config: `include_qc: includeQc`
- Pass props to RnaseqConfigPanel

**Modify**: `frontend/src/components/experiments/AutoPipelineBanner.tsx`
- Add `rnaseq_qc` to `STEP_ORDER` dict (step 3, shift DE to 4)
- Add to `STEP_LABELS`: `rnaseq_qc: 'QC Dashboard'`
- Add to `stepDefs` for RNA-seq: `{ key: 'rnaseq_qc', always: false }`
- Add visibility check: `if (s.key === 'rnaseq_qc') return config.include_qc;`

**Modify**: `frontend/src/api/autoPipeline.ts` (if exists) or `frontend/src/api/types.ts`
- Add `includeQc?: boolean` to auto-pipeline config type

### Step 10: Frontend API Layer

**Modify**: `frontend/src/api/types.ts`
- Add `RSeQCReactionMetrics` interface (camelCase fields matching backend)
- Add `RnaseqQCDashboardReport` interface

**Modify**: `frontend/src/api/jobs.ts`
- Add `getRnaseqQCDashboardReport(jobId: number)` function
- Add `downloadRnaseqQCDashboardCsv(jobId: number)` function

**Modify**: `frontend/src/hooks/useJobs.ts`
- Add `useRnaseqQCDashboardReport(jobId: number | null)` hook
- Note: existing `useRnaseqQCReport` is for alignment QC — keep it separate

**Modify**: `frontend/src/lib/constants.ts`
- Add `RNASEQ_QC_FILE_CATEGORIES` constant (multiqc_report, rseqc_infer_experiment, rseqc_read_distribution, rseqc_genebody_coverage, rseqc_inner_distance, rseqc_junction_saturation, rseqc_metrics, master_log)

### Step 11: Frontend Wizard

**Create**: `frontend/src/components/rnaseq-qc/NewRnaseqQCWizard.tsx` (~200 lines)
- 2-step wizard following `NewFeatureCountsWizard.tsx` pattern
- Step 0: Details (name + notes + "About RSeQC + MultiQC" educational card)
- Step 1: Choose Alignment (radio table of completed `rnaseq_alignment` jobs, reuse `ChooseAlignmentStep` from rnaseq-de)
- On submit: resolve BAM paths from alignment outputs via `useJobOutputs`, resolve prior job output paths (fastp, STAR logs, featureCounts), create `rnaseq_qc` job with `parentJobId = selectedAlignmentJobId`

### Step 12: Frontend Tab + Panels

**Create**: `frontend/src/pages/experiment/RnaseqQCTab.tsx` (~130 lines)
- Follow `DEAnalysisTab.tsx` pattern exactly
- Job selector dropdown filtering `jobType === 'rnaseq_qc'`
- 3 sub-tabs: `overview | per-sample | files`
- Status-gated panels

**Create**: `frontend/src/components/rnaseq-qc/QCOverviewPanel.tsx` (~100 lines)
- Fetch `multiqcOutputId` from `useRnaseqQCDashboardReport(jobId)`
- Get signed URL via `getOutputSignedUrl(jobId, outputId)`
- Render MultiQC HTML in iframe with `sandbox="allow-same-origin allow-scripts"`
- Fullscreen toggle + download button (follow `FastpReportModal.tsx` pattern but inline)

**Create**: `frontend/src/components/rnaseq-qc/QCPerSamplePanel.tsx` (~160 lines)
- Fetch metrics from `useRnaseqQCDashboardReport(jobId)`
- DataTable with columns: Short Name, Strandedness, Sense %, Antisense %, CDS Reads, 5'UTR, 3'UTR, Intron, Intergenic, Coverage Skewness, Inner Distance Mean
- CSV download button via `downloadRnaseqQCDashboardCsv(jobId)`

**Create**: `frontend/src/components/rnaseq-qc/QCFilesPanel.tsx` (~80 lines)
- Reuse `AlignmentFilesPanel` pattern with `RNASEQ_QC_FILE_CATEGORIES`

### Step 13: Frontend Integration Wiring

**Modify**: `frontend/src/App.tsx`
- Import `RnaseqQCTab`
- Replace `<PlaceholderTab label="QC Dashboard" />` with `<RnaseqQCTab />` at `rnaseq-qc/:jid` route
- Keep `PlaceholderTab` import (still used by pathway route)

**Modify**: `frontend/src/pages/ExperimentView.tsx`
- Add `const [showRnaseqQCWizard, setShowRnaseqQCWizard] = useState(false);`
- Pass `onRnaseqQCClick={() => setShowRnaseqQCWizard(true)}` to `NewAnalysisDropdown`
- Render `<NewRnaseqQCWizard>` in the `isRnaseq` block alongside other wizards
- Import `NewRnaseqQCWizard`

**Modify**: `frontend/src/components/experiments/NewAnalysisDropdown.tsx`
- Add `onRnaseqQCClick?: () => void` to props interface
- Wire QC Dashboard menu item: `onSelect={onRnaseqQCClick}` + `disabled={!onRnaseqQCClick}`

**Modify**: `frontend/src/pages/AnalysisQueuePage.tsx`
- Add `{ value: 'rnaseq_qc', label: 'QC Dashboard' }` to `JOB_TYPE_OPTIONS`
- Add `rnaseq_qc: 'rnaseq-qc'` to `JOB_TYPE_TO_TAB`

### Step 14: Backend Tests

**Create**: `backend/tests/test_rnaseq_qc_pipeline.py` (~300 lines)
- Validation tests (~7): missing alignment_job_id, missing reference_genome, unsupported genome, empty reactions, missing bam_path, valid params
- Mock run tests (~3): creates expected outputs, correct file categories, multiple reactions
- Parser tests (~3): `_parse_infer_experiment()` with sample text, `_parse_read_distribution()` with sample text, metrics CSV roundtrip
- Methods text tests (~2): mentions RSeQC, mentions MultiQC

**Create**: `backend/tests/test_rnaseq_qc_report.py` (~200 lines)
- Report success: create user/project/experiment/job, complete with mock outputs, GET endpoint returns JSON
- CSV download: GET download endpoint returns CSV
- 404: non-existent job
- 409: wrong job type (test with alignment job)
- 409: incomplete job
- Unauthorized: non-member user

### Step 15: Validation

After all changes:
1. `docker compose exec api ruff check .` — clean
2. `docker compose exec api ruff format --check .` — clean
3. `cd frontend && npm run build` — clean
4. `docker compose exec api pytest tests/test_rnaseq_qc_pipeline.py tests/test_rnaseq_qc_report.py -v` — all pass
5. `docker compose exec api pytest tests/test_rnaseq_auto_pipeline.py -v` — all pass (no regressions)
6. Start dev server, create RNA-seq experiment, verify QC Dashboard tab renders, wizard opens, dropdown enabled

---

## Files Summary

### New Files (8)
| File | Lines | Description |
|------|-------|-------------|
| `backend/pipelines/rnaseq_qc.py` | ~500 | RSeQC + MultiQC pipeline stage |
| `backend/tests/test_rnaseq_qc_pipeline.py` | ~300 | Pipeline validation, mock_run, parser, methods tests |
| `backend/tests/test_rnaseq_qc_report.py` | ~200 | Report endpoint tests |
| `frontend/src/components/rnaseq-qc/NewRnaseqQCWizard.tsx` | ~200 | 2-step wizard |
| `frontend/src/pages/experiment/RnaseqQCTab.tsx` | ~130 | Tab with 3 sub-tabs |
| `frontend/src/components/rnaseq-qc/QCOverviewPanel.tsx` | ~100 | MultiQC iframe viewer |
| `frontend/src/components/rnaseq-qc/QCPerSamplePanel.tsx` | ~160 | RSeQC metrics table |
| `frontend/src/components/rnaseq-qc/QCFilesPanel.tsx` | ~80 | File download list |

### Modified Files (16)
| File | Change |
|------|--------|
| `backend/config.py` | Add `RSEQC_BED_DIR` |
| `backend/pipelines/methods_text.py` | Add `rnaseq_qc_methods()` |
| `backend/pipelines/__init__.py` | Register `RnaseqQCStage` |
| `backend/schemas/qc_report.py` | Add `RSeQCReactionMetrics`, `RnaseqQCDashboardReport` |
| `backend/schemas/auto_pipeline.py` | Add `include_qc: bool = True` |
| `backend/services/qc_report_service.py` | Add 3 functions + parser |
| `backend/routers/jobs.py` | Add 2 endpoints |
| `backend/services/auto_pipeline_service.py` | Insert QC between alignment and DE + add `_queue_rnaseq_qc()` |
| `frontend/src/api/types.ts` | Add `RSeQCReactionMetrics`, `RnaseqQCDashboardReport` |
| `frontend/src/api/jobs.ts` | Add 2 API functions |
| `frontend/src/hooks/useJobs.ts` | Add `useRnaseqQCDashboardReport` hook |
| `frontend/src/lib/constants.ts` | Add `RNASEQ_QC_FILE_CATEGORIES` |
| `frontend/src/App.tsx` | Replace PlaceholderTab with RnaseqQCTab for rnaseq-qc route |
| `frontend/src/pages/ExperimentView.tsx` | Add wizard state + dropdown wiring + render wizard |
| `frontend/src/components/experiments/NewAnalysisDropdown.tsx` | Add `onRnaseqQCClick` prop, enable QC Dashboard item |
| `frontend/src/pages/AnalysisQueuePage.tsx` | Add `rnaseq_qc` to type filter + tab mapping |

### Auto-Pipeline Frontend (3 additional modified files)
| File | Change |
|------|--------|
| `frontend/src/components/experiments/AutoPipelineConfigPanel.tsx` | Add QC toggle + step |
| `frontend/src/components/experiments/AutoPipelineModal.tsx` | Add `includeQc` state |
| `frontend/src/components/experiments/AutoPipelineBanner.tsx` | Add `rnaseq_qc` step definition |

---

## Auto-Pipeline Chain After C.3

```
FastQC -> fastp Trimming (always) -> STAR+Salmon+BigWigs ->
  RSeQC+MultiQC (if include_qc) ->
  [DE Analysis (if conditions detected)] -> Complete
```
