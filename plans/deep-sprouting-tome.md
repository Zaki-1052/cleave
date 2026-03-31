# Cleave UI Polish — Remaining Work Plan

## Context

All 7 passes from `docs/ui-improvement.md` are complete (Foundation → Core Components → Layout/Nav → Pages → Features → Motion → Dark Mode), plus a landing page and navbar polish pass. The landing page is the visual "gold standard" — it uses glassmorphic cards, gradient buttons with glow shadows, hover scale transforms, backdrop blur, scroll-triggered reveals, mouse-parallax blobs, noise overlay, custom scrollbars, and selection color. The dashboard pages are **functional but visually flat** in comparison: no shadows, no gradients, no glow effects, basic hover states, raw `<select>` elements, and minimal empty states.

This plan bridges that gap with 3 focused passes targeting shared components (maximum cascade) and high-traffic pages.

**Constraint reminder**: No backend, api/, hooks/, contexts/, lib/constants.ts, lib/utils.ts changes. CSS-only animations. Every workflow must keep working. `npm run typecheck` after each pass.

---

## Pass 1: Foundation Components + Global CSS (Highest Impact)

Modifying ~9 shared files that cascade polish across the entire app.

### 1a. `Card.tsx` — Shadow system + interactive variant

**File**: `frontend/src/components/layout/Card.tsx`

- Add CVA variants: `default` gets `shadow-sm dark:shadow-none` (all 52 usages get subtle elevation for free)
- Add `interactive` variant: `shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-primary/20 transition-all duration-200 dark:shadow-none dark:hover:border-primary/30`
- Keep existing `className` override pattern working

### 1b. `Button.tsx` — Gradient primary + success variant

**File**: `frontend/src/components/ui/Button.tsx`

- Change `default`/`primary` variant: `bg-primary text-white hover:bg-primary/90` → `bg-gradient-to-r from-primary to-accent-teal text-white shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-200`
- Add `success` variant: `bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-200`
- Then in `ExperimentView.tsx` line 108: change `className="bg-green-600 hover:bg-green-700"` → `variant="success"` (removes hardcoded color)

### 1c. `StatusBadge.tsx` — Dot glow + pulse for active states

**File**: `frontend/src/components/ui/StatusBadge.tsx`

- Add `animate-pulse` to dot span for `running` and `in_progress` statuses
- Add subtle glow shadow on dots: `shadow-[0_0_6px]` using the matching status color (via inline style or a mapping)
- Other statuses unchanged

### 1d. `DataTable.tsx` — Header contrast + row hover

**File**: `frontend/src/components/ui/DataTable.tsx`

- Header: `bg-muted/50` → `bg-muted dark:bg-muted/80` for better contrast
- Row hover: `hover:bg-muted/50` → `hover:bg-muted/80 dark:hover:bg-muted/50` for visible feedback
- Empty state: larger icon (`h-12 w-12 text-muted-foreground/40`), better spacing (`gap-3`)

### 1e. `dialog.tsx` — Backdrop blur on overlay

**File**: `frontend/src/components/ui/dialog.tsx`

- Add `backdrop-blur-sm` to `DialogOverlay` classes
- This cascades to every Modal and WizardModal in the app

### 1f. `Modal.tsx` + `WizardModal.tsx` — Gradient header

**Files**: `frontend/src/components/ui/Modal.tsx`, `frontend/src/components/ui/WizardModal.tsx`

- Change header from `bg-primary` → `bg-gradient-to-r from-primary to-accent-teal`
- `accent-teal` (#2BBCC4) is already in tailwind.config.js

### 1g. `index.css` — Global CSS polish

**File**: `frontend/src/index.css`

Add to `@layer base`:
- **Smooth scroll**: `html { scroll-behavior: smooth; }`
- **Selection color**: `::selection { background: hsl(198 65% 57% / 0.3); }`
- **Custom scrollbar** (thin, subtle):
  ```
  * { scrollbar-width: thin; scrollbar-color: hsl(var(--muted-foreground) / 0.3) transparent; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: hsl(var(--muted-foreground) / 0.25); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: hsl(var(--muted-foreground) / 0.4); }
  ```

**Verify**: `npm run typecheck`. Visual check: card shadows, gradient buttons, pulsing running badges, backdrop blur on modals, gradient modal headers, custom scrollbars.

---

## Pass 2: Experiment View & Selectors (Navigation Polish)

### 2a. ExperimentView sidebar — Active tab left accent bar

**File**: `frontend/src/pages/ExperimentView.tsx` (lines 139-157)

Change tab styling:
- Active: add `border-l-2 border-primary bg-primary/5 dark:bg-primary/10`
- Inactive: add `border-l-2 border-transparent` (prevents layout shift)
- Add `hover:text-foreground` to inactive hover state

### 2b. Job selector — Replace raw `<select>` with shadcn Select (6 files)

**Files**:
- `frontend/src/pages/experiment/AlignmentTab.tsx`
- `frontend/src/pages/experiment/PeakCallingTab.tsx`
- `frontend/src/pages/experiment/DiffBindTab.tsx`
- `frontend/src/pages/experiment/CustomHeatmapTab.tsx`
- `frontend/src/pages/experiment/NormalizationTab.tsx`
- `frontend/src/pages/experiment/PearsonCorrelationTab.tsx`

Each file has a raw `<select>` for choosing which job to view. Replace with:
```tsx
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

<Select value={String(activeJobId ?? '')} onValueChange={(val) => navigate(...)}>
  <SelectTrigger className="w-[220px]">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {jobs.map((j) => (
      <SelectItem key={j.id} value={String(j.id)}>{j.name}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

Remove the `handleJobChange` function from each (shadcn Select provides value directly via `onValueChange`).

### 2c. Sub-tab treatment — Background tint on active

Same 6 experiment tab files. Update sub-tab button active classes:
- Active: add `bg-primary/5 rounded-t-md` alongside existing `border-b-2 border-primary text-primary`
- Inactive: add `rounded-t-md hover:bg-muted/50` for hover feedback

### 2d. AnalysisQueuePage filters — shadcn Select

**File**: `frontend/src/pages/AnalysisQueuePage.tsx`

Replace the 2 raw `<select>` filter elements (status filter, job type filter) with shadcn Select components. Same pattern as 2b.

**Verify**: `npm run typecheck`. Visual check: sidebar left accent bar, styled job selectors, sub-tab tints, queue page filters.

---

## Pass 3: Empty States, Settings, Cleanup

### 3a. Shared `EmptyState` component

**New file**: `frontend/src/components/ui/EmptyState.tsx`

```tsx
interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
}
```

Renders a dashed-border container with large muted icon, `font-display` title, and description text. Replaces ad-hoc empty states in:
- `HomePage.tsx` (no projects)
- 6 experiment tab files (no alignment/peak/diffbind/heatmap/correlation/normalization runs)

### 3b. Settings page — Section cards

**File**: `frontend/src/pages/SettingsPage.tsx`

Replace single Card layout with:
- `max-w-2xl mx-auto` container
- Separate Card per section (Account Info, Email Preferences)
- Action buttons outside cards
- Remove `<Separator>` between sections (card boundaries provide visual separation)

### 3c. HomePage project cards — Use interactive Card variant

**File**: `frontend/src/pages/HomePage.tsx` (line 51)

Change `<Card className="cursor-pointer border border-transparent transition-all duration-150 hover:-translate-y-0.5 hover:border-accent-gold hover:shadow-md">` to `<Card variant="interactive" className="cursor-pointer">` (cleaner, uses the shared variant from Pass 1a).

### 3d. Cleanup — Delete `App3.tsx` if it exists

Check if `App3.tsx` exists at repo root or frontend root. If so, delete it (leftover standalone landing page noted in logs). If already deleted, skip.

**Verify**: `npm run typecheck`, `npm run build`. Visual check all empty states, settings page sections, project card hover.

---

## Summary

| Pass | Files | Impact |
|------|-------|--------|
| 1 | ~9 shared components + CSS | Global visual uplift: shadows, gradients, blur, glow, scrollbars |
| 2 | ~9 experiment/queue pages | Navigation polish on highest-traffic views |
| 3 | ~8 pages + 1 new component | Empty states, settings, project cards, cleanup |

**Total**: ~26 files modified, 1 new component. Every change cascades or targets high-visibility areas. No backend changes, no data flow changes, no animation libraries.
