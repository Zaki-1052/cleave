# UI Polish Pass 2: Experiment View & Selectors (Navigation Polish)

**Date**: 2026-03-29

## What was done

- **ExperimentView sidebar (2a)**: Active tab now has a left accent bar (`border-l-2 border-primary`) with subtle `bg-primary/5` tint (dark: `bg-primary/10`). Inactive tabs get `border-l-2 border-transparent` to prevent layout shift and `hover:text-foreground` for better hover feedback.
- **Sub-tab treatment (2c)**: All 6 experiment tab pages — active sub-tabs get `bg-primary/5 rounded-t-md`, inactive get `rounded-t-md hover:bg-muted/50`.
- **Job selectors (2b)**: Replaced native `<select>` with shadcn `<Select>` (Radix) in all 6 experiment tab pages. Removed `handleJobChange` functions, changed `<label htmlFor>` to `<span>`, converted values to `String()` for Radix compatibility. Trigger width: `w-[220px]`.
- **AnalysisQueuePage filters (2d)**: Replaced 2 native `<select>` filter elements (job type, status) with shadcn `<Select>`. Used `'__all'` sentinel value to work around Radix's empty-string restriction.

## Decisions made

- Used `'__all'` sentinel mapped back to `''` in `onValueChange` for AnalysisQueuePage filters, since Radix Select rejects empty string as `SelectItem` value
- Changed `<label htmlFor>` to `<span>` on job selector labels — Radix Select manages its own ARIA internally, so `htmlFor` would point at nothing
- Preserved explicit `(j: AnalysisJob)` type annotations in CustomHeatmapTab, NormalizationTab, PearsonCorrelationTab `.map()` callbacks
- Queue filter triggers set to `w-[160px]` (fits "Peak Calling" and "All Statuses")

## Open items

- Pass 3 (EmptyState component, Settings sections, HomePage interactive cards, cleanup) from UI-POLISH-TODO.md not started

## Key file paths

- `frontend/src/pages/ExperimentView.tsx`
- `frontend/src/pages/experiment/AlignmentTab.tsx`
- `frontend/src/pages/experiment/PeakCallingTab.tsx`
- `frontend/src/pages/experiment/DiffBindTab.tsx`
- `frontend/src/pages/experiment/CustomHeatmapTab.tsx`
- `frontend/src/pages/experiment/NormalizationTab.tsx`
- `frontend/src/pages/experiment/PearsonCorrelationTab.tsx`
- `frontend/src/pages/AnalysisQueuePage.tsx`
