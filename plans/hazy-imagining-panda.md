# Step 3.4: Alignment Wizard UI — Implementation Plan

## Context

Step 3.3 (Alignment Pipeline Module) is complete. The backend has a fully working `AlignmentStage` pipeline with validate/run/mock_run, the worker dispatches alignment jobs, and 27 alignment tests pass. Now we need the frontend wizard that lets users configure and launch alignment jobs. This is a **frontend-only step** — no backend changes needed.

The wizard follows the 3-step pattern from CUTANA Cloud (cutana-cloud-ui.md §7) and reuses existing frontend patterns (WizardModal, useCreateJob, DataTable styling, constants).

---

## Implementation Order

### 1. Add Constants — `frontend/src/lib/constants.ts`

Add organism-to-genome mapping and genome display names:

```ts
export const REFERENCE_GENOMES: Record<string, { value: string; label: string }[]> = {
  Human: [
    { value: 'hg38', label: 'Human GRCh38/hg38' },
    { value: 'hg19', label: 'Human hg19' },
  ],
  Mouse: [{ value: 'mm10', label: 'Mouse mm10' }],
  Drosophila: [{ value: 'dm6', label: 'Drosophila dm6' }],
  Yeast: [{ value: 'sacCer3', label: 'Yeast sacCer3' }],
};

export const GENOME_DISPLAY_NAMES: Record<string, string> = {
  mm10: 'Mouse mm10',
  hg38: 'Human GRCh38/hg38',
  hg19: 'Human hg19',
  dm6: 'Drosophila dm6',
  sacCer3: 'Yeast sacCer3',
};
```

---

### 2. Create `AlignmentDetailsStep.tsx` (Step 1) — NEW

**Path**: `frontend/src/components/alignment/AlignmentDetailsStep.tsx`

Two side-by-side cards matching cutana-cloud-ui.md §7a:

- **Left card**: "ALIGNMENT NAME" input (30-char limit with counter), "NOTES" textarea
- **Right card**: Static "About" panel with three sections: "What is Alignment?", "What does the pipeline do?", "Outputs" (exact text from cutana-cloud-ui.md §7a)

**Props**: `name, setName, notes, setNotes` — pure presentational, no data fetching.

**Pattern reference**: `ExperimentDetailsStep.tsx` (character counter, label styling)

---

### 3. Create `ChooseReactionsStep.tsx` (Step 2) — NEW

**Path**: `frontend/src/components/alignment/ChooseReactionsStep.tsx`

Checkbox table of experiment's reactions with "Select All" header checkbox.

**Props**: `reactions: Reaction[], selectedIds: Set<number>, onToggle(id), onToggleAll()`

**Columns**: Checkbox, FASTQ Prefix, Short Name, Organism, Assay Type

**Implementation**:
- Simple HTML table styled to match DataTable (same Tailwind classes: `w-full text-left text-sm`, `border-b bg-primary/10` header, `hover:bg-gray-50` rows)
- Header checkbox: checked=all selected, indeterminate=some selected (via `ref.indeterminate`)
- Selected rows highlighted with `bg-primary/5`
- If no reactions exist, show warning message and disable proceeding

---

### 4. Create `AlignmentSettingsStep.tsx` (Step 3) — NEW

**Path**: `frontend/src/components/alignment/AlignmentSettingsStep.tsx`

Three sections:

**A. Reference Genome dropdown** (top):
- Single `<select>` for all reactions (backend takes one `reference_genome`)
- Options derived from selected reactions' organisms via `REFERENCE_GENOMES` constant
- If all reactions same organism, auto-select default genome (e.g., Mouse → mm10)
- If mixed organisms, show all genomes grouped by organism with `<optgroup>`

**B. Reactions table** (middle):
- Read-only table of selected reactions showing: Short Name, Organism, Reference Genome (display name)

**C. Advanced Settings** (collapsible):
- Toggle with chevron: `useState<boolean>(false)` for expand/collapse
- 2-column grid when expanded:
  - Remove Duplicate Reads: checkbox, default checked
  - Remove ENCODE DAC Exclusion List regions: checkbox, default checked
  - BAM Coverage Bin Size: number input, default 20
  - Smoothed BAM Coverage Bin Size: number input, default 100

**Props**: `selectedReactions, referenceGenome, setReferenceGenome, removeDuplicates, setRemoveDuplicates, removeDacExclusion, setRemoveDacExclusion, bamCoverageBinSize, setBamCoverageBinSize, smoothedBinSize, setSmoothedBinSize`

---

### 5. Create `NewAlignmentWizard.tsx` (Main Wizard) — NEW

**Path**: `frontend/src/components/alignment/NewAlignmentWizard.tsx`

**Props**: `isOpen, onClose, experiment: Experiment`

**State**: Step tracking + all form fields (name, notes, selectedReactionIds, referenceGenome, removeDuplicates, removeDacExclusion, bamCoverageBinSize, smoothedBinSize, submitError)

**Data fetching** (at wizard level):
- `useReactions(experiment.id)` — get all reactions
- `useFastqs(experiment.id, 1, 500)` — get all FASTQs for path resolution
- `useCreateJob()` — mutation for submission
- `useNavigate()` — redirect after success

**Critical: FASTQ path resolution** (helper function):
```ts
function resolveFastqPaths(reaction: Reaction, fastqs: FastqFile[]) {
  const matching = fastqs.filter(f => f.prefix === reaction.fastqPrefix);
  // Prefer trimmed FASTQs over raw
  const r1 = matching.find(f => f.isTrimmed && f.readDirection === 'R1')
           ?? matching.find(f => !f.isTrimmed && f.readDirection === 'R1');
  const r2 = matching.find(f => f.isTrimmed && f.readDirection === 'R2')
           ?? matching.find(f => !f.isTrimmed && f.readDirection === 'R2');
  return { r1_path: r1?.filePath ?? '', r2_path: r2?.filePath ?? '', total_reads: r1?.totalReads ?? null };
}
```

**Job params builder** (matches backend/pipelines/alignment.py validate expectations):
```ts
function buildAlignmentJobParams() {
  return {
    experiment_id: experiment.id,
    project_id: experiment.projectId,
    reference_genome: referenceGenome,
    remove_duplicates: removeDuplicates,
    remove_dac_exclusion: removeDacExclusion,
    bam_coverage_bin_size: bamCoverageBinSize,
    smoothed_bin_size: smoothedBinSize,
    reactions: selectedReactions.map(r => {
      const paths = resolveFastqPaths(r, allFastqs);
      return {
        reaction_id: r.id, short_name: r.shortName,
        r1_path: paths.r1_path, r2_path: paths.r2_path,
        total_reads: paths.total_reads,
        ecoli_spike_in: r.ecoliSpikeIn, cutana_spike_in: r.cutanaSpikeIn,
      };
    }),
  };
}
```

**Step navigation**:
- Step 0→1: Block if `!name.trim()`
- Step 1→2: Block if no reactions selected. Auto-set referenceGenome from organisms.
- Submit (Step 2): Validate genome selected + all reactions have file paths. Call `createJobMutation.mutateAsync()`. On success: close wizard, navigate to `/experiments/${experiment.id}/alignment/${job.id}`.

**Custom footer** (via `renderFooter`): Disable Next/Submit based on validation state. Show "Starting..." when mutation pending. Show error banner if submit fails.

**Reset on close**: Reset all state fields (pattern from CreateExperimentWizard.resetState).

**Uses**: WizardModal with `submitLabel="Start Alignment"`, `maxWidth="max-w-5xl"`

---

### 6. Create `NewAnalysisDropdown.tsx` — NEW

**Path**: `frontend/src/components/experiments/NewAnalysisDropdown.tsx`

**Props**: `onAlignmentClick: () => void`

Simple dropdown button:
- Renders pill button "New Analysis ▼" matching existing Button styling
- On click toggles dropdown with two items: "Alignment" (active), "Peak Calling" (disabled, Phase 4)
- Close on outside click (useRef + useEffect click-outside pattern)
- Dropdown positioned `absolute right-0 top-full mt-1 z-20`

---

### 7. Modify `ExperimentView.tsx` — EDIT

**Path**: `frontend/src/pages/ExperimentView.tsx`

Changes:
1. Import `NewAnalysisDropdown` and `NewAlignmentWizard`
2. Add state: `const [showAlignmentWizard, setShowAlignmentWizard] = useState(false)`
3. Replace `<Button>New Analysis ▼</Button>` (line 50) with `<NewAnalysisDropdown onAlignmentClick={() => setShowAlignmentWizard(true)} />`
4. Render `<NewAlignmentWizard isOpen={showAlignmentWizard} onClose={() => setShowAlignmentWizard(false)} experiment={experiment} />` before closing `</div>`

---

### 8. Modify `AlignmentTab.tsx` — EDIT

**Path**: `frontend/src/pages/experiment/AlignmentTab.tsx`

Replace stub with basic job display (sub-tabs Info/Input/QC/Files/IGV are Steps 3.5-3.6):

1. Read `:jid` from route params
2. Get `experiment` from outlet context
3. Fetch all alignment jobs: `useJobs(experiment.id)` → filter client-side to `jobType === 'alignment'`
4. If `jid === '0'`: show most recent alignment job, or "No alignments yet" message
5. If `jid` is a real ID: fetch via `useJob(Number(jid))`
6. Display: **Alignments dropdown** (top) to switch between runs, then a Card showing job name, StatusBadge, created/started/completed dates, duration, error message if any
7. Placeholder text for sub-tabs: "QC Report, Files, and IGV browser coming in the next step."

---

## Key Files Referenced

| File | Role |
|------|------|
| `frontend/src/components/experiments/CreateExperimentWizard.tsx` | Pattern: wizard state mgmt, WizardModal usage, custom footer, reset |
| `frontend/src/components/ui/WizardModal.tsx` | Reused: step display, navigation, footer |
| `frontend/src/pages/experiment/FastqsTab.tsx` (lines 55-94) | Pattern: buildTrimJobParams, FASTQ grouping by prefix, job creation |
| `frontend/src/hooks/useJobs.ts` | Reused: useCreateJob, useJob, useJobs |
| `frontend/src/hooks/useReactions.ts` | Reused: useReactions for fetching reactions |
| `frontend/src/hooks/useFastqs.ts` | Reused: useFastqs for FASTQ file path resolution |
| `frontend/src/api/types.ts` | Types: Reaction, FastqFile, AnalysisJob, Experiment |
| `frontend/src/lib/constants.ts` | Extended: REFERENCE_GENOMES, GENOME_DISPLAY_NAMES |
| `backend/pipelines/alignment.py` (validate, lines 302-350) | Reference: expected params structure |

---

## Edge Cases

- **No reactions**: Warning in Step 2, Next disabled
- **No FASTQs for a reaction**: Warning icon next to reaction, allow proceeding (backend mock mode handles it)
- **Mixed organisms**: Show all genomes in dropdown, informational warning
- **30-char name limit**: enforced via `maxLength` + counter
- **Concurrent submit**: "Start Alignment" disabled while `isPending`
- **Network error**: Red error banner in wizard footer

---

## Verification

Walk through the wizard → job created in DB with correct params → worker picks it up:

1. Open experiment with reactions + FASTQs
2. Click "New Analysis" → "Alignment"
3. Step 1: Enter name, add notes, click Next
4. Step 2: Select reactions, click Next
5. Step 3: Verify genome auto-selected, expand Advanced Settings, verify defaults
6. Click "Start Alignment"
7. Verify redirect to AlignmentTab showing the new job with "Queued" status
8. Verify job in DB: `docker compose exec api python -c "..."` or check /api/v1/experiments/:id/jobs
9. Verify worker picks it up and transitions to Running → Complete (mock mode)

Run existing tests to ensure no regressions:
```bash
docker compose exec api pytest tests/
cd frontend && npx tsc --noEmit
```
