# UI Pass 5 Critique Fixes

**Date**: 2026-03-29
**Scope**: Post-review fixes for all issues found by critique agents auditing the Pass 5 commits

## Context

Three critique agents reviewed the 4 Pass 5 commits against `docs/ui-improvement.md`. They found missed spec requirements across 3 categories: remaining Unicode HTML entities, missing `font-mono` on data values, and missing `font-display` on ~126 instances of the heading/label pattern. All issues fixed in 2 commits.

## What Was Done

### Commit 1 (`a5c5c86`) — Groups 1-3: Primitives + Critical + font-mono (13 files)

**Cascading Primitives (3 files):**
- **`DetailRow.tsx`** — Added `font-display` to label span. Cascades to ~20+ usage sites across all info panels.
- **`Input.tsx`** — Added `font-display` to label element. Cascades to all form inputs app-wide.
- **`StorageGauge.tsx`** — Added `font-display` to label, `font-mono` to formatBytes output and percentage.

**Critical Fixes (5 files):**
- **`AutoPipelineBanner.tsx`** — Replaced `&#10003;` and `&#10007;` HTML entities with lucide `Check` and `X` icons. These were the last remaining Unicode symbols in `src/`.
- **`AlignmentInfoPanel.tsx`**, **`PeakCallingInfoPanel.tsx`**, **`DiffBindInfoPanel.tsx`** — Added `font-mono` to methods text blocks (spec 5b explicitly required this).
- **`ReactionFormModal.tsx`** — Added `font-mono` to FASTQ prefix `<select>` element (spec 5e).

**font-mono on Numeric Data (5 files):**
- **`PeakCallingQCReportPanel.tsx`** — `font-mono` on `significanceThreshold` cell + `font-display` on "Reference Genome", "QC Report" labels and all 9 table `<th>` headers.
- **`DescriptionTab.tsx`** — `font-mono` on Experiment ID + `font-display` on 2 `<h3>` headings.
- **`CustomHeatmapTab.tsx`**, **`PearsonCorrelationTab.tsx`**, **`NormalizationTab.tsx`** — `font-mono` on Run IDs and sample counts in DetailRow values.

### Commit 2 (`b17d355`) — Group 4: font-display Sweep (35 files, 115 instances)

Comprehensive sweep adding `font-display` to every remaining `uppercase tracking-wide` pattern:

- **Page headings**: HistoryTab, SettingsPage (3 instances), HomePage
- **Tab job selector labels**: AlignmentTab, PeakCallingTab, DiffBindTab, CustomHeatmapTab, NormalizationTab, PearsonCorrelationTab (6 labels)
- **QC panels**: AlignmentQCReportPanel "Reference Genome" label, NormalizationResultsPanel table headers (3 `<th>`)
- **Component labels**: IGVPanel genome selector, ReactionsEditor optional columns, FileUploadZone file count, CsvUploadZone section label, ChooseBigWigSourceStep (2 headings, also added missing `tracking-wide`)
- **Tab-level "Details" h4s**: CustomHeatmapTab, PearsonCorrelationTab, NormalizationTab (also added missing `tracking-wide`)
- **Wizard Details Steps** (3 files, 7 each): AlignmentDetailsStep, PeakCallingDetailsStep, DiffBindDetailsStep
- **Wizard Settings Steps** (3 files): AlignmentSettingsStep (7), PeakCallingSettingsStep (15), DiffBindSettingsStep (5)
- **Other Wizard/Modal Steps**: ExperimentDetailsStep (3), CreateProjectModal (1), ManageMembersModal (1), TrimConfigModal (7)
- **Wizard Table Headers**: SelectReactionsModal (3), DiffBindInputPanel (4), ChoosePeakCallingStep (5), ChooseAlignmentStep (4), ChooseReactionsStep alignment (4) + peak-calling (1), AssignConditionsStep (3), PeakCallingInputPanel (5)
- **Layout**: Breadcrumbs (2 elements)

## Decisions Made

- **Primitives get `font-display`**: Both `DetailRow.tsx` and `Input.tsx` labels use the same visual pattern as section headings. Adding `font-display` to these primitives cascades the serif font to all usage sites, ensuring consistency without 30+ manual edits.
- **Table `<th>` headers included**: Though the spec says "section headings", table column headers use the identical `uppercase tracking-wide` pattern and appear alongside elements that already have `font-display`. Inconsistency within the same card would look wrong.
- **ChooseBigWigSourceStep and tab-level "Details" h4s**: These were missing `tracking-wide` in addition to `font-display`. Both classes added to match the standard pattern.
- **Breadcrumbs included**: The breadcrumb labels use the same `uppercase tracking-wide` pattern. Adding `font-display` gives them the scientific-publication feel.

## Verification

- `npm run typecheck` — clean (0 errors)
- `npm run lint` — clean (0 errors, 3 pre-existing warnings)
- `npm run build` — successful
- `grep uppercase+tracking-wide without font-display` — **zero results** (complete coverage)
- `grep &#10003;/&#10007;/&#8635;` — **zero results** (no HTML entities remaining)
- `grep border-t-transparent` — zero results in components (only in shadcn scroll-area primitive)
- No frozen files modified (api/, hooks/, contexts/, constants.ts, utils.ts, backend/)
