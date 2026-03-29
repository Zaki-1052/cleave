# UI-POLISH-TODO Pass 3: Empty States, Settings, Cleanup

**Date**: 2026-03-29

## What was done

- **EmptyState component** (`EmptyState.tsx`): Created shared reusable component with dashed border container, large muted icon (`h-12 w-12 text-muted-foreground/40`), `font-display` title, optional description and action slot. Dark-mode compatible via `border-border` token.
- **6 experiment tabs**: Replaced ad-hoc inline empty states with `<EmptyState>` in AlignmentTab (Dna icon), PeakCallingTab (Mountain), DiffBindTab (ArrowLeftRight), CustomHeatmapTab (Grid3x3), NormalizationTab (Scale), PearsonCorrelationTab (ScatterChart). Icons match sidebar tab icons for visual consistency.
- **HomePage**: Replaced inline empty state with `<EmptyState icon={FolderPlus}>`. Switched project cards from inline hover classes (`hover:border-accent-gold`) to `<Card variant="interactive">` (uses `border-primary/20` hover — consistent brand color).
- **SettingsPage**: Split single Card into separate Cards per section (Account Information + Email Preferences). Removed Separator import/usage. Added `max-w-2xl mx-auto` container. Moved page title outside Cards and promoted to `text-xl font-bold`. Action buttons and feedback messages sit outside Cards at bottom.
- **App3.tsx cleanup**: File does not exist at repo root — no action needed.

## Decisions made

- EmptyState uses dashed border as its own container (no Card wrapper needed). Consumer tabs still wrap in `<Card>` for consistency with other tab content panels.
- HomePage empty state has no Card wrapper — the dashed EmptyState border provides visual definition directly on the page grid.
- SettingsPage `<form>` wraps the entire `max-w-2xl` container to preserve single-submit behavior.
- Section heading renamed from "Email" to "Email Preferences" for clarity when it's its own card.

## Verification

- `npm run typecheck` — zero errors
- `npm run build` — successful production build (3.14s)

## Key file paths

- `frontend/src/components/ui/EmptyState.tsx` (new)
- `frontend/src/pages/HomePage.tsx`
- `frontend/src/pages/SettingsPage.tsx`
- `frontend/src/pages/experiment/AlignmentTab.tsx`
- `frontend/src/pages/experiment/PeakCallingTab.tsx`
- `frontend/src/pages/experiment/DiffBindTab.tsx`
- `frontend/src/pages/experiment/CustomHeatmapTab.tsx`
- `frontend/src/pages/experiment/NormalizationTab.tsx`
- `frontend/src/pages/experiment/PearsonCorrelationTab.tsx`
