# Plan: Auto-Pipeline Option in Experiment Creation Wizard

## Context

Currently auto-pipeline can only be triggered via the "Run Full Pipeline" button on ExperimentView — a separate action after experiment creation. The user wants the ability to opt into auto-pipeline during the experiment creation wizard itself, so the full chain (FastQC → conditional trim → alignment → peak calling → extensions) kicks off automatically when the wizard closes.

The existing backend `start_auto_pipeline()` already handles both cases: FastQC done (immediate evaluation) and FastQC still running (waits for callback). So no new API endpoints are needed — the wizard just needs to call the existing `POST /experiments/{id}/auto-pipeline` endpoint after completion.

A race condition bug in `on_fastqc_complete` (missing "all files done" guard) will also be fixed.

---

## Changes

### 1. Extract `AutoPipelineConfigPanel` (new file)

**Create:** `frontend/src/components/experiments/AutoPipelineConfigPanel.tsx`

Extract the pipeline configuration UI from `AutoPipelineModal.tsx` (lines 95-223) into a reusable component. This includes:
- Reference genome selector (auto-detected from reactions)
- Peak caller selector (5 options)
- Optional analysis step checkboxes (normalization, diffbind, heatmap, pearson)
- Pipeline summary card (8-step list with included/excluded indicators)

Props: `reactions`, all config state + setters (genome, peakCaller, peakSize, include* flags).

Derives `isMouse` internally from `referenceGenome === 'mm10'` for conditional normalization display.

### 2. Refactor `AutoPipelineModal` to use extracted panel

**Modify:** `frontend/src/components/experiments/AutoPipelineModal.tsx`

Replace inline config JSX with `<AutoPipelineConfigPanel>`. Modal retains: state hooks, `detectedGenome` useMemo, `handleStart`, Modal wrapper, footer buttons, error state. Pure refactor — no behavior change.

### 3. Create `AutoPipelineStep` wizard step component (new file)

**Create:** `frontend/src/components/experiments/AutoPipelineStep.tsx`

Content for wizard Step 4 ("Pipeline"):
- **Toggle at top**: "Run Full Pipeline when done" (controls `enabled` prop)
- **When OFF**: Brief info text explaining auto-pipeline can be started later from ExperimentView
- **When ON**: Renders `<AutoPipelineConfigPanel>` with all config state passed through
- Uses `useReactions(experimentId)` to get reactions for genome auto-detection and count display
- `useEffect`: when `enabled` transitions to `true` and `referenceGenome` is empty, auto-detect genome from reactions

### 4. Add Step 4 to `CreateExperimentWizard`

**Modify:** `frontend/src/components/experiments/CreateExperimentWizard.tsx`

**New state** (after line 29):
- `autoPipelineEnabled` (bool, default false)
- `referenceGenome`, `peakCaller`, `peakSize` (strings)
- `includeNormalization`, `includeDiffbind`, `includeHeatmap`, `includePearson` (bools, default true)
- `pipelineSubmitting` (bool)

**Reset all** in `resetState()`.

**Extend `steps` array** with 4th step:
```
{ label: 'Pipeline', content: <AutoPipelineStep ...props /> }
```

**Update `handleNext`**: Add `currentStep === 2 → setCurrentStep(3)` case.

**New `handleFinish` function**:
1. If `autoPipelineEnabled` and `createdExperiment`:
   - Call `startAutoPipeline(experimentId, config)`
   - On failure: `toast.error(...)` but still proceed (experiment is already created)
2. Call `onCreated(createdExperiment)` and `resetState()`

**Updated footer logic** (`renderFooter`):
- Last step + auto-pipeline enabled: "Create & Run Pipeline" button (disabled if no genome selected or submitting)
- Last step + not enabled: existing "Save" / "Update Experiment" buttons unchanged
- Not last step: existing "Next" button unchanged

### 5. Fix `on_fastqc_complete` race condition

**Modify:** `backend/services/auto_pipeline_service.py` (lines 71-88)

Add guard before calling `_evaluate_fastqc_and_queue`:
```python
all_have_fastqc = raw_fastqs and all(f.total_reads is not None for f in raw_fastqs)
if not all_have_fastqc:
    logger.info("auto_pipeline.fastqc_not_all_done", experiment_id=..., total=..., done=...)
    return
```

This matches the existing guard in `start_auto_pipeline()` (line 64) and prevents premature evaluation when files are still processing. Safe because the callback fires again when each subsequent file completes.

---

## Files Changed

| File | Action |
|------|--------|
| `frontend/src/components/experiments/AutoPipelineConfigPanel.tsx` | Create |
| `frontend/src/components/experiments/AutoPipelineStep.tsx` | Create |
| `frontend/src/components/experiments/AutoPipelineModal.tsx` | Modify (use extracted panel) |
| `frontend/src/components/experiments/CreateExperimentWizard.tsx` | Modify (add step 4 + finish logic) |
| `backend/services/auto_pipeline_service.py` | Modify (fix race condition) |

**No changes to:** API endpoints, schemas, models, migrations, or other backend files.

---

## Verification

1. **Standalone auto-pipeline still works**: Navigate to an existing experiment with reactions → "Run Full Pipeline" → verify AutoPipelineModal opens with same config UI and starts pipeline correctly
2. **Wizard without auto-pipeline**: Create experiment via wizard, leave "Run Full Pipeline" toggle OFF on step 4 → verify existing behavior unchanged (wizard closes, navigate to experiment, "Run Full Pipeline" button visible)
3. **Wizard with auto-pipeline**: Create experiment, upload FASTQs, create reactions, toggle ON, configure, click "Create & Run Pipeline" → verify:
   - Wizard closes
   - Navigate to experiment page
   - AutoPipelineBanner shows with status (pending_fastqc or running)
   - Pipeline proceeds through steps
4. **Race condition fix**: Upload multiple FASTQs, start auto-pipeline while FastQC still running → verify pipeline waits until ALL files have FastQC results before evaluating adapters
5. **Error resilience**: If `startAutoPipeline` API call fails, verify toast error appears but wizard still closes and experiment exists
6. **Build**: `npm run build` passes (no TS errors)
7. **Backend lint**: `ruff check backend/` and `ruff format --check backend/` pass
8. **Tests**: `docker compose exec api pytest tests/test_cleanup_service.py tests/test_worker.py -x` (verify no regressions from auto_pipeline_service change)
