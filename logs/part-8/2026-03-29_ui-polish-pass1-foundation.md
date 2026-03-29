# UI Polish Pass 1: Foundation Components + Global CSS

**Date**: 2026-03-29

## What was done

- **Global CSS** (`index.css`): Added smooth scroll, primary-tinted `::selection` highlight, thin custom scrollbars using CSS variables (auto-adapts to dark mode)
- **Dialog** (`dialog.tsx`): Added `backdrop-blur-sm` to overlay — cascades to all Modal/WizardModal consumers
- **DataTable** (`DataTable.tsx`): Stronger header contrast (`bg-muted dark:bg-muted/80`), improved row hover (`hover:bg-muted/80 dark:hover:bg-muted/50`), larger empty state icon (`h-12 w-12 text-muted-foreground/40`)
- **StatusBadge** (`StatusBadge.tsx`): `animate-pulse` on dot for running/in_progress statuses, cyan glow shadow (`0 0 6px #00BCD4`) via inline style
- **Card** (`Card.tsx`): Rewrote with CVA — `default` variant adds `shadow-sm dark:shadow-none` (all 52 usages get elevation), `interactive` variant adds hover lift + border tint
- **Button** (`Button.tsx`): Primary/default changed to gradient (`from-primary to-accent-teal`) with `shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98]`. Added `success` variant (emerald-to-teal gradient). Base changed from `transition-colors` to `transition-all duration-200`
- **Modal + WizardModal**: Header `bg-primary` → `bg-gradient-to-r from-primary to-accent-teal`
- **ExperimentView**: "Run Full Pipeline" button switched from inline `bg-green-600` to `variant="success"`
- **LandingPage** (bonus fix): Fixed 4 pre-existing `tsc -b` strict-mode errors (undefined checks on IntersectionObserver entries and array destructuring)

## Decisions made

- Used inline `style` for StatusBadge glow because Tailwind arbitrary shadow values can't be dynamically composed from a runtime lookup map
- Card `variant` prop defaults to `'default'` — backward-compatible, no consumer changes needed
- `transition-all duration-200` applied to Button base string (broader than needed for ghost/link but harmless)

## Open items

- Pass 2 (Experiment View sidebar tabs, shadcn Select for job selectors, sub-tab treatment) not started
- Pass 3 (EmptyState component, Settings sections, HomePage interactive cards, cleanup) not started
- HomePage project cards should switch to `<Card variant="interactive">` in Pass 3

## Key file paths

- `frontend/src/index.css`
- `frontend/src/components/ui/dialog.tsx`
- `frontend/src/components/ui/DataTable.tsx`
- `frontend/src/components/ui/StatusBadge.tsx`
- `frontend/src/components/layout/Card.tsx`
- `frontend/src/components/ui/Button.tsx`
- `frontend/src/components/ui/Modal.tsx`
- `frontend/src/components/ui/WizardModal.tsx`
- `frontend/src/pages/ExperimentView.tsx`
- `frontend/src/pages/LandingPage.tsx`
