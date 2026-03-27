# 2026-03-27 — Step 3.4: Alignment Wizard UI

## What was done

- Built the New Alignment wizard (3-step flow: Details → Choose Reactions → Alignment Settings)
- Created `AlignmentDetailsStep` — name input (30-char limit with counter), notes textarea, About panel with pipeline description
- Created `ChooseReactionsStep` — checkbox table with select-all, indeterminate state, selected count
- Created `AlignmentSettingsStep` — reference genome dropdown (auto-selects from organism), reactions summary table, collapsible Advanced Settings (remove duplicates, remove DAC exclusion, bin sizes)
- Created `NewAlignmentWizard` — orchestrates steps, resolves FASTQ paths (prefers trimmed over raw), builds job params matching backend's expected structure, submits via `useCreateJob`, navigates to alignment tab on success
- Created `NewAnalysisDropdown` — replaces static "New Analysis" button with working dropdown (Alignment active, Peak Calling disabled for Phase 4), close-on-outside-click
- Updated `ExperimentView` — integrated dropdown and wizard
- Updated `AlignmentTab` — replaced stub with job display: alignments dropdown selector, job details card (ID, status, genome, timing, errors), placeholder for sub-tabs (3.5-3.6)
- Added `REFERENCE_GENOMES` and `GENOME_DISPLAY_NAMES` constants for organism-to-genome mapping

## Decisions made

- Single reference genome per alignment job (matches backend's `AlignmentStage.validate()` expectation), not per-reaction dropdowns
- FASTQ path resolution prefers trimmed FASTQs over raw when both exist for a prefix
- Auto-select default genome when all selected reactions share the same organism (e.g., all Mouse → mm10)
- AlignmentTab fetches all jobs and filters to `jobType === 'alignment'` client-side (adequate for expected volume)
- Default route `alignment/0` shows the most recent alignment job or "no alignments" prompt

## Open items

- Alignment sub-tabs (Info, Input, QC Report, Files, IGV) — Step 3.5-3.6
- "Last Job" display in ExperimentView header still shows static "None" — needs wiring to actual job data
- Peak Calling option disabled in dropdown — Phase 4

## Key file paths

- `frontend/src/components/alignment/NewAlignmentWizard.tsx` — main wizard (created)
- `frontend/src/components/alignment/AlignmentDetailsStep.tsx` — Step 1 (created)
- `frontend/src/components/alignment/ChooseReactionsStep.tsx` — Step 2 (created)
- `frontend/src/components/alignment/AlignmentSettingsStep.tsx` — Step 3 (created)
- `frontend/src/components/experiments/NewAnalysisDropdown.tsx` — dropdown (created)
- `frontend/src/pages/ExperimentView.tsx` — integrated dropdown + wizard (modified)
- `frontend/src/pages/experiment/AlignmentTab.tsx` — basic job display (modified)
- `frontend/src/lib/constants.ts` — genome constants (modified)

## Test results

- TypeScript: `npx tsc --noEmit` passes cleanly
- Backend: 196 passed, 0 failed (no regressions)
