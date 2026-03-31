# Phase 6.2: Custom Reference-Point Heatmaps — Implementation Plan

## Context

Phase 6.1 (DiffBind) established the pattern for lab extension features. Phase 6.2 adds custom reference-point heatmaps using deepTools, porting the lab's `references/genomewide_plots/heatmaps.sh` into the web app. This fills the gap between the built-in TSS/Gene Body heatmaps (alignment pipeline) and the lab's flexible reference-point heatmaps (arbitrary BED files as reference points).

**Why**: The lab currently runs `heatmaps.sh` interactively on the EC2 instance, manually entering file paths. This is error-prone, not reproducible, and requires SSH access. The web app wizard automates this with proper sample selection, BED file management, and output tracking.

**Dependency chain**: Custom Heatmap → Alignment (for bigWig files). Optionally uses peak calling outputs (summit BED files) as reference points.

---

## Reference Script Compliance

**Source**: `references/genomewide_plots/heatmaps.sh` (77 lines)

The lab script issues exactly two deepTools commands:

```bash
# Line 74
computeMatrix reference-point --referencePoint center -R "${bedFile}" -S"${matrix_string}" -a 1500 -b 1500 -o "${directory}"matrix_"${modification}".gz

# Line 76
plotHeatmap -m matrix_"${modification}".gz --samplesLabel"${heatmap_string}" -out "${directory}${modification}".png
```

**Flags to match exactly (non-negotiable)**:
- `--referencePoint center` (NOT TSS — the custom heatmap script uses center)
- `-a 1500 -b 1500` as defaults
- `-R` single BED file, `-S` multiple bigWig files
- `--samplesLabel` with user-defined labels
- No `--skipZeros`, `--colorMap`, `--sortRegions`, `--zMin`/`--zMax` in the reference

**Additions over reference** (user-configurable, per PLAN.md §6.2):
- Flanking distance configurable (default 1500)
- Sort order option (default: deepTools default `descend`)
- Color map option (default: deepTools default)
- SVG output (reference only outputs PNG)

---

## Implementation Steps

### Step 1: Backend Pipeline Module

**File**: `backend/pipelines/custom_heatmap.py` (new)

`CustomHeatmapStage(PipelineStage)` following the DiffBind pattern exactly.

**`validate(params)`** checks:
- Required: `experiment_id`, `project_id`, `parent_job_id`, `alignment_job_id`
- `bed_path` non-empty string
- `samples` non-empty list, each with `reaction_id`, `short_name`, `label`, `bigwig_path`
- `flanking_upstream` and `flanking_downstream` positive ints in [100, 10000]
- `sort_order` one of: `descend`, `ascend`, `no`, `keep`
- `reference_point` one of: `center`, `TSS`, `TES`
- Real mode: `computeMatrix` and `plotHeatmap` in PATH

**`run()`** real mode:
1. Create `job_dir/results/` and `job_dir/logs/`
2. Resolve BED + bigWig absolute paths from `settings.STORAGE_ROOT`
3. Validate all input files exist on disk
4. Run `computeMatrix reference-point` matching the lab script flags exactly, with user overrides for flanking distance and reference point only
5. Run `plotHeatmap` for PNG with `--samplesLabel` from params. Add `--sortRegions`, `--colorMap`, `--zMin`/`--zMax` only if user explicitly set them (not null)
6. Run `plotHeatmap` again with `--plotFileFormat svg` for SVG output (using same matrix)
7. Register outputs: PNG, SVG, matrix.gz, BED copy, logs
8. 2-hour subprocess timeout (heatmaps with many regions can be slow)

**`mock_run()`**:
- Sleep 3s, create stub PNG (`_STUB_PNG` from DiffBind), stub SVG, stub gzip, stub BED copy, stub log
- Return outputs list matching real run categories

**`generate_methods_text()`** → delegates to `custom_heatmap_methods()` in methods_text.py

**Job params structure**:
```python
{
    "experiment_id": 1,
    "project_id": 1,
    "parent_job_id": 10,        # alignment job
    "alignment_job_id": 10,
    "bed_source": "peak_calling",  # or "upload"
    "bed_path": "projects/1/1/jobs/20/peaks/summits.bed",
    "bed_output_id": 42,        # null if uploaded
    "bed_label": "H3K4me3 summits",
    "samples": [
        {
            "reaction_id": 1,
            "short_name": "K4me3_ctrl1",
            "label": "h3k4me3_ctrl",
            "bigwig_path": "projects/1/1/jobs/10/bigwigs/ctrl1.bw"
        }
    ],
    "flanking_upstream": 1500,
    "flanking_downstream": 1500,
    "reference_point": "center",
    "sort_order": "descend",
    "color_map": null,
    "z_min": null,
    "z_max": null
}
```

**Output file categories**:
| Category | Files | Types |
|---|---|---|
| `custom_heatmap_plot` | Heatmap image | png, svg |
| `custom_heatmap_matrix` | deepTools matrix | gz |
| `custom_heatmap_bed` | Input BED copy | bed |
| `log` | Execution logs | txt |

### Step 2: Methods Text + Registration

**File**: `backend/pipelines/methods_text.py` — add `custom_heatmap_methods(params)`

Text template: "Custom reference-point heatmaps were generated using deepTools. Signal from RPKM-normalized bigWig files for {N} samples was computed around {reference_point} of regions in the user-provided BED file ({bed_label}) with a flanking window of {upstream} bp upstream and {downstream} bp downstream using computeMatrix reference-point. Heatmaps were visualized using plotHeatmap."

**File**: `backend/pipelines/__init__.py` — add `"custom_heatmap": CustomHeatmapStage()` to `_STAGES`

### Step 3: Backend API Layer

**File**: `backend/schemas/qc_report.py` — add:
```python
class CustomHeatmapPlotInfo(CamelModel):
    output_id_png: int | None = None
    output_id_svg: int | None = None

class CustomHeatmapReport(CamelModel):
    bed_label: str
    sample_count: int
    sample_labels: list[str]
    flanking_upstream: int
    flanking_downstream: int
    reference_point: str
    sort_order: str
    color_map: str | None
    plot_output: CustomHeatmapPlotInfo
    matrix_output_id: int | None = None
```

**File**: `backend/services/qc_report_service.py` — add:
- `get_custom_heatmap_report(db, job_id, user_id)` → `CustomHeatmapReport | None`
  - Authorize via `_get_authorized_job`
  - Verify `job_type == "custom_heatmap"` and `status == "complete"`
  - Resolve PNG/SVG output IDs from `custom_heatmap_plot` category
  - Resolve matrix output ID from `custom_heatmap_matrix` category
  - Populate from `job.params`
- `get_custom_heatmap_matrix_path(db, job_id, user_id)` → `Path | None`

**File**: `backend/routers/jobs.py` — add 2 endpoints:
- `GET /jobs/{job_id}/heatmap-report` → `CustomHeatmapReport`
- `GET /jobs/{job_id}/heatmap-report/download-matrix` → FileResponse (`.gz`)

### Step 4: BED File Upload Endpoint

**File**: `backend/routers/fastq_files.py` (or a separate endpoint in jobs router)

Add a simple multipart upload for BED files (NOT tus — BED files are KB-sized):

`POST /experiments/{experiment_id}/upload-bed`
- Accepts `UploadFile`
- Validates: `.bed` extension, < 50 MB, tab-delimited with >= 3 columns (chr, start, end)
- Saves to `{STORAGE_ROOT}/projects/{pid}/{eid}/uploads/bed/{filename}`
- Returns `{ path, filename, line_count }`
- Auth: contributor+ role via `check_experiment_membership`

### Step 5: Backend Tests

**File**: `backend/tests/test_custom_heatmap_pipeline.py` (new)

Following `test_diffbind_pipeline.py` pattern:

**Validation tests** (~10):
- Valid params (happy path)
- Missing required fields (experiment_id, bed_path, samples)
- Empty samples list
- Missing sample fields (reaction_id, short_name, label, bigwig_path)
- Flanking out of range (< 100, > 10000)
- Invalid sort_order
- Invalid reference_point
- Valid with optional color_map set

**Mock run tests** (~5):
- Creates all expected output files (PNG, SVG, matrix.gz, BED, log)
- Output categories match expected values
- Custom flanking preserved in output
- Sample labels preserved
- File size > 0 for all outputs

**Methods text tests** (~2):
- Default params includes "center", "1500"
- Custom params includes user-specified values

### Step 6: Frontend — Constants, Types, API, Hooks

**File**: `frontend/src/lib/constants.ts` — add:
- `CUSTOM_HEATMAP_FILE_CATEGORIES` (4 categories: plot, matrix, bed, log)
- `HEATMAP_SORT_ORDERS` (descend, ascend, no, keep)
- `HEATMAP_COLOR_MAPS` (default, RdYlBu_r, viridis, Reds, Blues, YlOrRd)
- `HEATMAP_REFERENCE_POINTS` (center, TSS, TES)

**File**: `frontend/src/api/types.ts` — add:
- `CustomHeatmapPlotInfo` interface
- `CustomHeatmapReport` interface

**File**: `frontend/src/api/jobs.ts` — add:
- `getCustomHeatmapReport(jobId)`
- `downloadHeatmapMatrix(jobId)`
- `uploadBedFile(experimentId, file)` (multipart POST)

**File**: `frontend/src/hooks/useJobs.ts` — add:
- `useCustomHeatmapReport(jobId)`

### Step 7: Frontend — Wizard (4 new components)

**Directory**: `frontend/src/components/custom-heatmap/`

**`NewCustomHeatmapWizard.tsx`** — 4-step wizard orchestrator:

**Step 1 (Details)**: Name (30-char limit), notes, About panel explaining custom reference-point heatmaps. Same layout as DiffBind step 1.

**Step 2 (Choose Alignment)**: Radio table of completed alignment jobs (name, date, status). Same pattern as DiffBind's "Choose Peak Calling" step. Selecting an alignment loads its bigWig outputs.

**Step 3 (Select Samples & BED)**: The most complex step.
- **BED source section** (top): Two radio options:
  - "From Peak Calling" → select a peak calling job → select a specific BED file output (filter for summit files)
  - "Upload BED File" → file input with .bed filter → calls `uploadBedFile()` endpoint
- **Sample selection section** (bottom): Checkbox table of reactions from the selected alignment job. Each selected reaction shows an editable "Label" field (pre-populated with `{shortName}`). Up/down arrows for sample ordering (controls the `-S` order in computeMatrix, matching the lab's interleave pattern but giving users full flexibility).

The wizard resolves bigWig paths from alignment job outputs (`bigwig` category) via `useJobOutputs`.

**Step 4 (Settings)**:
- Flanking upstream/downstream: number inputs (default 1500, range 100–10000)
- Reference point: dropdown (center/TSS/TES, default center)
- Sort order: dropdown (descend/ascend/no/keep, default descend)
- Color map: dropdown (default/RdYlBu_r/viridis/etc., default empty = deepTools default)
- Summary: selected BED label, sample count, sample order preview

### Step 8: Frontend — Results Tab (3 new components + tab)

**`CustomHeatmapTab.tsx`** — follows DiffBind tab pattern:
- Job selector dropdown (multiple heatmap runs per experiment)
- Sub-tabs: `info | plot | files`
- Status-gated: plot/files only render when `job.status === 'complete'`

**`CustomHeatmapInfoPanel.tsx`**:
- Details card (Run ID, Created By, Date, Status)
- Methods Text card (with copy button)
- Notes card (editable)
- Parameters card: BED label, sample count, flanking distances, reference point, sort order, color map

**`CustomHeatmapPlotsPanel.tsx`**:
- Single large heatmap image (PNG via signed URL)
- Download buttons: PNG, SVG, Matrix (.gz)
- Full-screen toggle

**`CustomHeatmapFilesPanel.tsx`**:
- Category dropdown from `CUSTOM_HEATMAP_FILE_CATEGORIES`
- Checkbox-selectable file table with download (same pattern as DiffBind files panel)

### Step 9: Frontend — Integration

**`frontend/src/App.tsx`**: Add route:
```tsx
<Route path="heatmaps/:jid" element={<CustomHeatmapTab />} />
```

**`frontend/src/pages/ExperimentView.tsx`**:
- Import `NewCustomHeatmapWizard`
- Add to `JOB_TYPE_LABELS`: `custom_heatmap: 'Custom Heatmap'`
- Add to `TABS`: `{ label: 'Heatmaps', path: 'heatmaps/0' }`
- Add `showCustomHeatmapWizard` state
- Pass `onCustomHeatmapClick` to `NewAnalysisDropdown`
- Render `<NewCustomHeatmapWizard>` conditionally

**`frontend/src/components/experiments/NewAnalysisDropdown.tsx`**:
- Add `onCustomHeatmapClick` prop
- Add "Custom Heatmap" button to dropdown

---

## Files Modified (existing)

| File | Change |
|---|---|
| `backend/pipelines/__init__.py` | Import + register `CustomHeatmapStage` |
| `backend/pipelines/methods_text.py` | Add `custom_heatmap_methods()` |
| `backend/schemas/qc_report.py` | Add `CustomHeatmapReport`, `CustomHeatmapPlotInfo` |
| `backend/services/qc_report_service.py` | Add `get_custom_heatmap_report()`, `get_custom_heatmap_matrix_path()` |
| `backend/routers/jobs.py` | Add 2 heatmap endpoints |
| `backend/routers/fastq_files.py` | Add BED upload endpoint |
| `frontend/src/App.tsx` | Add `heatmaps/:jid` route |
| `frontend/src/pages/ExperimentView.tsx` | Add tab, wizard state, dropdown handler |
| `frontend/src/components/experiments/NewAnalysisDropdown.tsx` | Add `onCustomHeatmapClick` prop + button |
| `frontend/src/api/types.ts` | Add `CustomHeatmapReport`, `CustomHeatmapPlotInfo` |
| `frontend/src/api/jobs.ts` | Add 3 API functions |
| `frontend/src/hooks/useJobs.ts` | Add `useCustomHeatmapReport` hook |
| `frontend/src/lib/constants.ts` | Add file categories, sort orders, color maps, reference points |

## Files Created (new)

| File | Purpose |
|---|---|
| `backend/pipelines/custom_heatmap.py` | Pipeline module |
| `backend/tests/test_custom_heatmap_pipeline.py` | ~17 tests |
| `frontend/src/components/custom-heatmap/NewCustomHeatmapWizard.tsx` | 4-step wizard orchestrator |
| `frontend/src/components/custom-heatmap/SelectSamplesStep.tsx` | BED source + sample picker (most complex) |
| `frontend/src/pages/experiment/CustomHeatmapTab.tsx` | Tab with sub-tabs |
| `frontend/src/components/custom-heatmap/CustomHeatmapPlotsPanel.tsx` | Heatmap image viewer |
| `frontend/src/components/custom-heatmap/CustomHeatmapFilesPanel.tsx` | File category browser |

---

## Verification Plan

1. **Backend tests**: `docker compose exec api pytest tests/test_custom_heatmap_pipeline.py -v`
2. **Lint/format**: `docker compose exec api ruff check .` + `docker compose exec api ruff format --check .`
3. **Type check**: `cd frontend && npx tsc --noEmit`
4. **Frontend lint**: `cd frontend && npm run lint`
5. **Smoke test (mock mode)**: Open wizard → fill all 4 steps → submit → job runs in mock → heatmap tab shows stub PNG → files panel shows all categories → download matrix works
