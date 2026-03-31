# Phase 4.2: Peak Calling Wizard UI — Implementation Plan

## Context

Phase 4.1 built the peak calling pipeline backend (`backend/pipelines/peak_calling.py`, ~800 lines) with support for all 5 peak caller modes (MACS2 narrow/broad, SICER2, SEACR stringent/relaxed), fragment size filtering, IgG control, FRiP calculation, HOMER annotation, and mock mode. The pipeline is registered in the dispatcher and has 49 tests passing. QC report schemas (`PeakCallingQCReport`, `PeakCallingReactionMetrics`, `TopCalledPeak`) are defined. The `PeakCallingTab` is currently a placeholder.

This plan implements the **4-step Peak Calling Wizard UI** and the **Peak Calling Tab with sub-tabs** (Info, Input, QC Report, Files, IGV), following the exact patterns established by the alignment wizard and alignment tab.

## Files to Create (9 new)

```
frontend/src/components/peak-calling/
├── NewPeakCallingWizard.tsx      # 4-step wizard orchestrator
├── PeakCallingDetailsStep.tsx    # Step 1: name + notes + About panel
├── ChooseAlignmentStep.tsx       # Step 2: select completed alignment
├── ChooseReactionsStep.tsx       # Step 3: select reactions from alignment
├── PeakCallingSettingsStep.tsx   # Step 4: IgG, peak caller, advanced settings
├── PeakCallingInfoPanel.tsx      # Info sub-tab (details, methods, notes)
├── PeakCallingInputPanel.tsx     # Input sub-tab (reactions table)
├── PeakCallingQCReportPanel.tsx  # QC Report sub-tab (FRiP table + annotation chart)
└── PeakCallingFilesPanel.tsx     # Files sub-tab (BED, FRiP, annotation)
```

## Files to Modify (5 existing)

```
frontend/src/components/experiments/NewAnalysisDropdown.tsx  # Enable peak calling button
frontend/src/pages/ExperimentView.tsx                        # Wire wizard + state
frontend/src/pages/experiment/PeakCallingTab.tsx             # Replace placeholder
frontend/src/lib/constants.ts                                # Add peak calling constants
backend/routers/jobs.py                                      # Add peak calling QC endpoint
backend/services/qc_report_service.py                        # Add peak calling QC parser
frontend/src/api/jobs.ts                                     # Add peak calling QC API call
frontend/src/hooks/useJobs.ts                                # Add usePeakCallingQCReport hook
frontend/src/api/types.ts                                    # Add PeakCallingQCReport type
```

## Implementation Steps

### Step 1: Add Constants (`frontend/src/lib/constants.ts`)

Add peak calling-specific constants following the existing pattern:

```ts
export const PEAK_CALLERS = [
  { value: 'MACS2', label: 'MACS2' },
  { value: 'SICER2', label: 'SICER2' },
  { value: 'SEACR', label: 'SEACR' },
] as const;

// Peak size options depend on the selected peak caller
export const PEAK_SIZES: Record<string, { value: string; label: string }[]> = {
  MACS2: [
    { value: 'narrow', label: 'Narrow' },
    { value: 'broad', label: 'Broad' },
  ],
  SICER2: [
    { value: 'broad', label: 'Broad' },
  ],
  SEACR: [
    { value: 'stringent', label: 'Stringent' },
    { value: 'relaxed', label: 'Relaxed' },
  ],
};

export const PEAK_CALLING_FILE_CATEGORIES = [
  {
    value: 'bed',
    label: 'BED Files',
    description: 'Peak coordinate files in BED format...',
  },
  {
    value: 'frip',
    label: 'FRiP Score',
    description: 'Fraction of Reads in Peaks metrics...',
  },
  {
    value: 'annotation',
    label: 'Peak Annotation',
    description: 'HOMER peak annotation output files...',
  },
  {
    value: 'annotation_stats',
    label: 'Peak Annotation Stats',
    description: 'Summary statistics from HOMER annotation.',
  },
  {
    value: 'log',
    label: 'Logs',
    description: 'Peak calling pipeline execution logs.',
  },
] as const;

// Default thresholds matching backend/pipelines/peak_calling.py
export const PEAK_CALLING_DEFAULTS = {
  q_value: 0.01,           // MACS2 narrow (lab standard, NOT CUTANA's 0.05)
  broad_cutoff: 0.1,       // MACS2 broad
  seacr_threshold: 0.01,   // SEACR
  sicer2_fdr: 0.01,        // SICER2
  fragment_filter: true,    // default ON per cleave-spec-decisions.md §2.3
  fragment_size: 120,
} as const;
```

### Step 2: Add TypeScript Types (`frontend/src/api/types.ts`)

Add `PeakCallingQCReport` and related types matching the backend schemas in `backend/schemas/qc_report.py`:

```ts
export interface PeakCallingReactionMetrics {
  shortName: string;
  controlShortName: string;
  referenceGenome: string;
  peakCaller: string;
  peakSize: string;
  significanceThreshold: number;
  uniquelyAlignedReadPairs: number;
  calledPeaks: number;
  readsInPeaks: number;
  frip: number;
}

export interface TopCalledPeak {
  shortName: string;
  controlShortName: string;
  referenceGenome: string;
  peakCaller: string;
  peakSize: string;
  significanceThreshold: number;
  topPeaks: string[];
}

export interface PeakCallingQCReport {
  referenceGenome: string;
  peakCaller: string;
  peakSize: string;
  metrics: PeakCallingReactionMetrics[];
  topPeaks: TopCalledPeak[] | null;
}
```

### Step 3: Backend — Peak Calling QC Report Endpoint

**`backend/routers/jobs.py`**: Add a new endpoint for peak calling QC:

```python
@router.get("/jobs/{job_id}/peak-qc-report", response_model=PeakCallingQCReport)
async def get_peak_calling_qc_report(job_id, db, user):
    # Same pattern as get_alignment_qc_report but for peak_calling jobs
```

**`backend/services/qc_report_service.py`**: Add `get_peak_calling_qc_report()` function that:
- Authorizes the user (same `_get_authorized_alignment_job` pattern, renamed to generic `_get_authorized_job`)
- Validates `job_type == "peak_calling"` and `status == "complete"`
- Parses `peak_caller_metrics.csv` into `PeakCallingReactionMetrics` list
- Parses `top_called_peaks.csv` into `TopCalledPeak` list
- Returns `PeakCallingQCReport`

Also add a download endpoint for the peak calling QC CSV.

### Step 4: Frontend API + Hooks

**`frontend/src/api/jobs.ts`**: Add:
```ts
export async function getPeakCallingQCReport(jobId: number): Promise<PeakCallingQCReport>
export async function downloadPeakCallingQCCsv(jobId: number): Promise<void>
```

**`frontend/src/hooks/useJobs.ts`**: Add:
```ts
export function usePeakCallingQCReport(jobId: number | null)
```

### Step 5: Enable Peak Calling in Dropdown (`NewAnalysisDropdown.tsx`)

- Add `onPeakCallingClick` to the interface props
- Remove `disabled` attribute from the Peak Calling button
- Remove `title="Coming in Phase 4"` tooltip
- Wire click handler: `onClick={() => { setIsOpen(false); onPeakCallingClick(); }}`
- Apply same hover style as Alignment button: `hover:bg-primary/10`

### Step 6: Wire Wizard in ExperimentView (`ExperimentView.tsx`)

- Add `showPeakCallingWizard` state
- Import and render `NewPeakCallingWizard` (same pattern as `NewAlignmentWizard`)
- Pass `onPeakCallingClick={() => setShowPeakCallingWizard(true)}` to `NewAnalysisDropdown`

### Step 7: Build the 4-Step Wizard

#### `NewPeakCallingWizard.tsx` — Orchestrator

Follow the exact `NewAlignmentWizard` pattern. Key differences:
- **4 steps** (not 3): Details → Choose Alignment → Choose Reactions → Settings
- State includes: `name`, `notes`, `selectedAlignmentJobId`, `selectedReactionIds`, `peakCaller`, `peakSize`, `iggControlMap` (Map<reactionId, iggReactionId>), `referenceGenome` (inherited from alignment), plus advanced settings (`qValue`, `broadCutoff`, `seacrThreshold`, `fragmentFilter`, `fragmentSize`)
- Data fetching: `useJobs(experiment.id, 1, 100)` filtered to `jobType === 'alignment'` and `status === 'complete'` for step 2
- On submit: builds params matching `backend/pipelines/peak_calling.py` validate() expectations, sets `parentJobId` to the selected alignment job

**Params structure** (must match backend validation):
```ts
{
  experiment_id: number,
  project_id: number,
  parent_job_id: number,        // selected alignment job ID
  reference_genome: string,     // inherited from alignment
  peak_caller: string,          // 'MACS2' | 'SICER2' | 'SEACR'
  peak_size: string,            // 'narrow'|'broad'|'stringent'|'relaxed'
  q_value?: number,             // MACS2 narrow only
  broad_cutoff?: number,        // MACS2 broad only
  seacr_threshold?: number,     // SEACR only
  sicer2_fdr?: number,          // SICER2 only
  fragment_filter: boolean,
  fragment_size: number,
  reactions: [
    {
      reaction_id: number,
      short_name: string,
      bam_path: string,           // from alignment job outputs (unique_bam)
      igg_bam_path: string|null,  // IgG control BAM path
      igg_short_name: string|null // IgG control short name
    }
  ]
}
```

**BAM path resolution**: Fetch alignment job outputs (`useJobOutputs(alignmentJobId, 'unique_bam')`), match each reaction to its BAM file by `reactionId` on the output records.

#### `PeakCallingDetailsStep.tsx` — Step 1

Mirror `AlignmentDetailsStep.tsx` exactly, but with:
- Title: "Peak Calling Details"
- Name field: "Peak Calling Name" (30-char limit)
- About panel text from `cutana-cloud-ui.md` §8a:
  - **What is Peak Calling?** — "Peak calling pinpoints genomic regions..."
  - **What does the pipeline do?** — "The CUTANA CUT&RUN/Tag Peak Calling Pipeline calls peaks..."
  - **Outputs** — "QC report (peak stats, FRiP, annotation plots)..."

#### `ChooseAlignmentStep.tsx` — Step 2

New component (no alignment equivalent). Shows a table of completed alignment jobs for selection:
- Radio button selection (single alignment, not multi-select)
- Columns: Name, Reference Genome (from params), Status, Created Date, Reactions count
- Filter to `status === 'complete'` only
- Empty state: "No completed alignment runs available. Run an alignment first."
- On selection: store `selectedAlignmentJobId`, auto-extract `referenceGenome` from alignment params

#### `ChooseReactionsStep.tsx` — Step 3

Reuse the existing `ChooseReactionsStep` pattern from alignment, but:
- Only show reactions that were included in the selected alignment job (read from `alignmentJob.params.reactions`)
- Same checkbox table with select-all, indeterminate state
- Columns: FASTQ Prefix, Short Name, Organism, Assay Type

#### `PeakCallingSettingsStep.tsx` — Step 4

The most complex step. Contains:

**Reactions table** (top section):
- Columns: Short Name, IgG Control (dropdown), Reference Genome (read-only, inherited), Peak Caller (dropdown), Peak Size (dropdown)
- **IgG Control dropdown**: Lists all reactions marked as IgG (detect by `shortName` containing "IgG" case-insensitive, or let user select any reaction). "None" option available. All target reactions default to the IgG reaction if one exists.
- **Peak Caller dropdown**: MACS2 / SICER2 / SEACR. Applies to ALL reactions (single selection for the whole job, matching CUTANA Cloud behavior and backend validation). When changed, auto-update Peak Size to first valid option.
- **Peak Size dropdown**: Options change based on Peak Caller (narrow/broad for MACS2, broad for SICER2, stringent/relaxed for SEACR). Single selection for whole job.
- **Reference Genome**: Read-only, inherited from selected alignment. Display using `GENOME_DISPLAY_NAMES`.

**Advanced Settings** (collapsible, same pattern as `AlignmentSettingsStep`):
- **Q-Value Threshold** (number input, default 0.01) — shown for MACS2 narrow
- **Broad Cutoff** (number input, default 0.1) — shown for MACS2 broad
- **SEACR Threshold** (number input, default 0.01) — shown for SEACR
- **SICER2 FDR** (number input, default 0.01) — shown for SICER2
- **Fragment Size Filter** (checkbox, default ON) — "Filter fragments below 120bp (sub-nucleosomal)"
- **Fragment Size** (number input, default 120) — shown only when filter is ON

Conditionally show only the threshold field relevant to the selected peak caller.

**Submit button**: "Start Peak Calling"

### Step 8: Replace PeakCallingTab Placeholder

Replace `frontend/src/pages/experiment/PeakCallingTab.tsx` with a full implementation mirroring `AlignmentTab.tsx`:

- Job selector dropdown (filter jobs to `jobType === 'peak_calling'`)
- Sub-tab navigation: Info, Input, QC Report, Files, IGV
- Route: `/experiments/:id/peaks/:jid` (already configured in App.tsx)
- Same empty state pattern: "No peak calling runs yet"
- Same loading/conditional rendering patterns

### Step 9: Build Sub-Tab Panels

#### `PeakCallingInfoPanel.tsx`
Mirror `AlignmentInfoPanel.tsx`:
- Three-column layout: Details (Run ID, Created By, Date, Status) | Run Methods (auto-generated text) | Notes (editable)
- Reuse `DetailRow`, `StatusBadge`, `Card` components
- Copy methods text button

#### `PeakCallingInputPanel.tsx`
Mirror `AlignmentInputPanel.tsx`:
- Table columns from `cutana-cloud-ui.md` §6g-ii: FASTQ Prefix, IgG Control FASTQ Prefix, Reference Genome, Peak Caller, Peak Size
- Data from `job.params.reactions` and `job.params`

#### `PeakCallingQCReportPanel.tsx`
From `cutana-cloud-ui.md` §6g-iii:
- **Peak Calling Stats table**: Short Name, Control, Peak Caller, Peak Size, Threshold, Called Peaks, Reads in Peaks, FRiP
- **FRiP color coding**: green (≥0.2), yellow (0.1-0.2), red (<0.1)
- **Top Called Peaks section**: expandable table per reaction showing top 10 peaks
- **About panel** on right side explaining FRiP and peak annotation
- Download CSV button
- Uses `usePeakCallingQCReport(jobId)` hook

**Peak Annotation Plots**: Deferred to a follow-up step (requires Recharts stacked bar chart from annotation_stats files). Add a placeholder noting "Peak annotation charts coming soon" — the QC metrics table is the priority.

#### `PeakCallingFilesPanel.tsx`
Mirror `AlignmentFilesPanel.tsx`:
- Category dropdown using `PEAK_CALLING_FILE_CATEGORIES`
- File table with checkboxes, download button
- Reuse `useJobOutputs(jobId, category)` hook and batch download logic

### Step 10: Tests

Add to `backend/tests/test_peak_calling_pipeline.py` (or new file):
- Test the peak calling QC report endpoint returns correct schema
- Test the QC CSV download endpoint
- Test authorization (user must be project member)

Frontend: Manual browser testing of the full wizard flow → job creation → result display.

## Verification Plan

1. **Wizard flow**: Click "New Analysis" → "Peak Calling" → walk through all 4 steps → verify job created in DB with correct params (`parent_job_id` set, `peak_caller`/`peak_size`/`reactions` populated)
2. **Worker pickup**: Verify worker picks up the queued peak_calling job, runs mock pipeline, sets status to complete
3. **Peak Calling tab**: After job completes, verify all sub-tabs render:
   - Info: shows run details, methods text, editable notes
   - Input: shows reactions table with IgG control, peak caller, peak size
   - QC Report: shows FRiP metrics table with correct data from mock CSV
   - Files: shows file categories with downloadable files
4. **Run tests**: `docker compose exec api pytest tests/ -x` — all tests pass (275 existing + new)
5. **Lint**: `docker compose exec api ruff check .` and `cd frontend && npx tsc --noEmit` pass

## Key Patterns to Follow

- **Alignment wizard is the reference implementation** — mirror its component structure, state management, validation, and job submission exactly
- **WizardModal** reusable component with `renderFooter` for custom navigation
- **Peak caller/peak size coupling**: Peak size options must dynamically update when peak caller changes
- **IgG auto-detection**: Default IgG assignment based on reaction short_name containing "IgG" (case-insensitive)
- **BAM path resolution**: Must fetch alignment job outputs to get per-reaction BAM file paths
- **Reference genome inheritance**: Peak calling inherits genome from the parent alignment job, not user-selected
- **`parent_job_id`**: Critical — links peak calling to its source alignment in the DB
- **CamelModel convention**: All backend schemas use snake_case, frontend uses camelCase (handled by `CamelModel` base class)
