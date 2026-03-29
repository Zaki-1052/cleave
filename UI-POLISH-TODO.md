# Cleave UI Polish — Remaining Work

> Dashboard pages are functional but visually flat compared to the landing page (the gold standard).
> This plan bridges that gap in 3 focused passes targeting shared components for maximum cascade.
>
> **Constraints**: No backend/api/hooks/contexts/constants changes. CSS-only animations. `npm run typecheck` after each pass.

---

## Pass 1: Foundation Components + Global CSS (Highest Impact)

~9 shared files. Changes here cascade to every page automatically.

### 1a. Card — Shadow system + interactive variant

**File**: `frontend/src/components/layout/Card.tsx`

- [ ] Add CVA variants to Card
- [ ] `default` variant: add `shadow-sm dark:shadow-none` (all 52 usages get subtle elevation)
- [ ] `interactive` variant: `shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-primary/20 transition-all duration-200 dark:shadow-none dark:hover:border-primary/30`
- [ ] Keep existing `className` override pattern working

### 1b. Button — Gradient primary + success variant

**File**: `frontend/src/components/ui/Button.tsx`

- [ ] Change `default`/`primary` variant to: `bg-gradient-to-r from-primary to-accent-teal text-white shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-200`
- [ ] Add `success` variant: `bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-200`
- [ ] In `ExperimentView.tsx` line 108: change `className="bg-green-600 hover:bg-green-700"` to `variant="success"`

### 1c. StatusBadge — Dot glow + pulse for active states

**File**: `frontend/src/components/ui/StatusBadge.tsx`

- [ ] Add `animate-pulse` to dot span for `running` and `in_progress` statuses
- [ ] Add subtle glow shadow on dots: `shadow-[0_0_6px]` using matching status color

### 1d. DataTable — Header contrast + row hover

**File**: `frontend/src/components/ui/DataTable.tsx`

- [ ] Header: `bg-muted/50` → `bg-muted dark:bg-muted/80`
- [ ] Row hover: `hover:bg-muted/50` → `hover:bg-muted/80 dark:hover:bg-muted/50`
- [ ] Empty state: larger icon (`h-12 w-12 text-muted-foreground/40`), better spacing

### 1e. Dialog — Backdrop blur on overlay

**File**: `frontend/src/components/ui/dialog.tsx`

- [ ] Add `backdrop-blur-sm` to `DialogOverlay` classes
- [ ] Cascades to every Modal and WizardModal automatically

### 1f. Modal + WizardModal — Gradient header

**Files**: `frontend/src/components/ui/Modal.tsx`, `frontend/src/components/ui/WizardModal.tsx`

- [ ] Change header `bg-primary` → `bg-gradient-to-r from-primary to-accent-teal`

### 1g. Global CSS polish

**File**: `frontend/src/index.css`

- [ ] Smooth scroll: `html { scroll-behavior: smooth; }`
- [ ] Selection color: `::selection { background: hsl(198 65% 57% / 0.3); }`
- [ ] Custom scrollbar (thin, subtle):
  ```css
  * { scrollbar-width: thin; scrollbar-color: hsl(var(--muted-foreground) / 0.3) transparent; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: hsl(var(--muted-foreground) / 0.25); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: hsl(var(--muted-foreground) / 0.4); }
  ```

### Pass 1 Verify

- [ ] `npm run typecheck` passes
- [ ] Card shadows visible on all pages
- [ ] Gradient buttons render correctly
- [ ] Running/in_progress badges pulse
- [ ] Modals have backdrop blur + gradient header
- [ ] Custom scrollbars visible in Chrome/Safari

---

## Pass 2: Experiment View & Selectors (Navigation Polish)

### 2a. ExperimentView sidebar — Active tab left accent bar

**File**: `frontend/src/pages/ExperimentView.tsx` (lines 139-157)

- [ ] Active tab: add `border-l-2 border-primary bg-primary/5 dark:bg-primary/10`
- [ ] Inactive tab: add `border-l-2 border-transparent` (prevents layout shift)
- [ ] Add `hover:text-foreground` to inactive hover

### 2b. Job selector — Replace raw `<select>` with shadcn Select

**6 files** (each has an identical raw `<select>` for job selection):
- [ ] `frontend/src/pages/experiment/AlignmentTab.tsx`
- [ ] `frontend/src/pages/experiment/PeakCallingTab.tsx`
- [ ] `frontend/src/pages/experiment/DiffBindTab.tsx`
- [ ] `frontend/src/pages/experiment/CustomHeatmapTab.tsx`
- [ ] `frontend/src/pages/experiment/NormalizationTab.tsx`
- [ ] `frontend/src/pages/experiment/PearsonCorrelationTab.tsx`

Pattern:
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

Remove `handleJobChange` function from each (shadcn provides value directly).

### 2c. Sub-tab treatment — Background tint on active

Same 6 files as 2b. Update sub-tab button classes:
- [ ] Active: add `bg-primary/5 rounded-t-md`
- [ ] Inactive: add `rounded-t-md hover:bg-muted/50`

### 2d. AnalysisQueuePage filters — shadcn Select

**File**: `frontend/src/pages/AnalysisQueuePage.tsx`

- [ ] Replace 2 raw `<select>` filter elements (status, job type) with shadcn Select

### Pass 2 Verify

- [ ] `npm run typecheck` passes
- [ ] Sidebar active tab has left accent bar
- [ ] Job selectors are styled shadcn dropdowns
- [ ] Sub-tabs have background tint
- [ ] Queue page filters are shadcn Select

---

## Pass 3: Empty States, Settings, Cleanup

### 3a. Shared EmptyState component

**New file**: `frontend/src/components/ui/EmptyState.tsx`

- [ ] Create `EmptyState` component: dashed border container, large muted icon, `font-display` title, description
- [ ] Replace empty states in:
  - [ ] `HomePage.tsx` (no projects)
  - [ ] `AlignmentTab.tsx` (no runs)
  - [ ] `PeakCallingTab.tsx`
  - [ ] `DiffBindTab.tsx`
  - [ ] `CustomHeatmapTab.tsx`
  - [ ] `NormalizationTab.tsx`
  - [ ] `PearsonCorrelationTab.tsx`

### 3b. Settings page — Section cards

**File**: `frontend/src/pages/SettingsPage.tsx`

- [ ] Replace single Card with `max-w-2xl mx-auto` container + separate Card per section
- [ ] Remove `<Separator>` (card boundaries provide separation)

### 3c. HomePage project cards — Use interactive Card variant

**File**: `frontend/src/pages/HomePage.tsx`

- [ ] Change project cards to `<Card variant="interactive">` (from Pass 1a)
- [ ] Remove inline hover classes

### 3d. Cleanup

- [ ] Delete `App3.tsx` if it exists at repo root (leftover standalone landing page)

### Pass 3 Verify

- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds
- [ ] Empty states have dashed borders and large icons
- [ ] Settings page has sectioned cards
- [ ] Project cards use interactive variant hover

---

## Impact Summary

| Pass | Files | What Changes |
|------|-------|-------------|
| 1 | ~9 shared components + CSS | Shadows, gradients, blur, glow, scrollbars — global uplift |
| 2 | ~9 experiment/queue pages | Tab indicators, styled selectors, sub-tab polish |
| 3 | ~8 pages + 1 new component | Empty states, settings sections, project cards, cleanup |

**Total**: ~26 files, 1 new component. Each pass is independent and completable in one session.
