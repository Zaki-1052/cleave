# Plan: UI-POLISH-TODO Pass 3 — Empty States, Settings, Cleanup

## Context

Passes 1-2 of UI-POLISH-TODO.md are complete (foundation components + experiment view selectors). Additionally, passes 3-7 of the *separate* ui-improvement.md skill (layout, page polish, feature components, motion, dark mode) are also done. Despite all that work, the 3 items in UI-POLISH-TODO Pass 3 remain unfinished:

1. **No shared EmptyState component** — every empty state is ad-hoc inline JSX
2. **HomePage project cards** still use inline hover classes instead of `Card variant="interactive"`
3. **SettingsPage** still uses a single Card with Separator — needs separate Cards per section
4. **App3.tsx cleanup** — file doesn't exist (already gone), no action needed

## Changes

### 3a. Create shared `EmptyState` component

**New file**: `frontend/src/components/ui/EmptyState.tsx`

```tsx
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border py-12 text-center">
      <Icon className="mb-3 h-12 w-12 text-muted-foreground/40" />
      <h3 className="font-display text-sm font-semibold text-muted-foreground">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground/70">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
```

Design rationale:
- **Dashed border** (per TODO spec) — visually distinct from regular Cards, signals "nothing here yet"
- **h-12 w-12 icon at 40% opacity** — matches DataTable empty state pattern from Pass 1
- **font-display on title** — matches headings throughout the app
- **Optional `action` slot** — allows passing a button (e.g. "Create Project") without coupling
- No Card wrapper — the dashed border IS the container. Consumer pages can wrap in Card if needed.

### Replace empty states in 7 files

Each file gets the same pattern: replace the inline empty state JSX with `<EmptyState>`.

| File | Icon | Title | Description |
|------|------|-------|-------------|
| `HomePage.tsx` | `FolderPlus` | "No projects yet" | "Create one to get started." |
| `AlignmentTab.tsx` | `Dna` | "No alignment runs yet" | "Click \"New Analysis\" above to create an alignment run." |
| `PeakCallingTab.tsx` | `Mountain` | "No peak calling runs yet" | "Click \"New Analysis\" above to create a peak calling run." |
| `DiffBindTab.tsx` | `ArrowLeftRight` | "No DiffBind runs yet" | "Click \"New Analysis\" above to create a DiffBind differential analysis." |
| `CustomHeatmapTab.tsx` | `Grid3x3` | "No custom heatmap runs yet" | "Click \"New Analysis\" above to create a custom reference-point heatmap." |
| `NormalizationTab.tsx` | `Scale` | "No normalization runs yet" | "Click \"New Analysis\" above to create a Roman normalization." |
| `PearsonCorrelationTab.tsx` | `ScatterChart` | "No correlation runs yet" | "Click \"New Analysis\" above to create a Pearson correlation matrix." |

Icons match the sidebar tab icons from Pass 3 (layout/navigation) for visual consistency.

**For experiment tabs**: Replace the `<Card>` wrapper + inner `<div>` with just `<Card><EmptyState ... /></Card>` to keep the Card container consistent with the rest of the tab content.

**For HomePage**: Replace the `<Card>` wrapper + inner `<div>` with `<EmptyState icon={FolderPlus} title="No projects yet" description="Create one to get started." />` (no Card wrapper needed since EmptyState has its own dashed border).

### 3b. SettingsPage — Separate Cards per section

**File**: `frontend/src/pages/SettingsPage.tsx`

Current structure:
```
<Card>
  <h2>Account Settings</h2>
  <div>Account Information section</div>
  <Separator />
  <div>Email section</div>
  {feedback messages}
  <div>action buttons</div>
</Card>
```

New structure:
```
<div className="mx-auto max-w-2xl space-y-6">
  <h2 className="font-display text-xl font-bold text-foreground">Account Settings</h2>

  <Card>
    <h3>Account Information</h3>
    ...fields...
  </Card>

  <Card>
    <h3>Email Preferences</h3>
    ...fields...
  </Card>

  {feedback messages}
  <div>action buttons</div>
</div>
```

Key changes:
- Remove Separator import and usage
- Remove outer Card wrapper
- Wrap each section in its own Card
- Move page title outside Cards
- `max-w-2xl mx-auto` constrains width for readability
- `space-y-6` provides consistent gap
- Keep action buttons outside Cards at bottom (they apply to the whole form)
- The `<form>` wraps the entire `max-w-2xl` container to keep submission behavior intact

### 3c. HomePage project cards — Use `Card variant="interactive"`

**File**: `frontend/src/pages/HomePage.tsx` (line 51)

Current:
```tsx
<Card className="cursor-pointer border border-transparent transition-all duration-150 hover:-translate-y-0.5 hover:border-accent-gold hover:shadow-md">
```

Replace with:
```tsx
<Card variant="interactive" className="cursor-pointer">
```

The `interactive` variant already provides `hover:shadow-md hover:-translate-y-0.5 hover:border-primary/20 transition-all duration-200` — this is the same hover behavior but with `primary/20` border tint instead of `accent-gold`. This is a deliberate improvement: consistent brand color hover across the app.

### 3d. Cleanup — App3.tsx

File does not exist at repo root. No action needed.

## Files to modify

| File | Action |
|------|--------|
| `frontend/src/components/ui/EmptyState.tsx` | **CREATE** — shared empty state component |
| `frontend/src/pages/HomePage.tsx` | Replace empty state + use `Card variant="interactive"` |
| `frontend/src/pages/SettingsPage.tsx` | Split into separate Cards per section |
| `frontend/src/pages/experiment/AlignmentTab.tsx` | Replace empty state |
| `frontend/src/pages/experiment/PeakCallingTab.tsx` | Replace empty state |
| `frontend/src/pages/experiment/DiffBindTab.tsx` | Replace empty state |
| `frontend/src/pages/experiment/CustomHeatmapTab.tsx` | Replace empty state |
| `frontend/src/pages/experiment/NormalizationTab.tsx` | Replace empty state |
| `frontend/src/pages/experiment/PearsonCorrelationTab.tsx` | Replace empty state |

## Execution order

1. Create `EmptyState.tsx`
2. Update all 6 experiment tabs (independent — can be done in parallel)
3. Update `HomePage.tsx` (empty state + interactive Card)
4. Update `SettingsPage.tsx` (section Cards)
5. Run `npm run typecheck`
6. Run `npm run build`
7. Write session log to `logs/part-8/`

## Verification

- `npm run typecheck` — zero errors
- `npm run build` — successful production build
- Empty states show dashed borders and large muted icons in all 7 locations
- Settings page has separate Cards per section, no Separator
- Project cards use interactive variant hover (border-primary/20 on hover, not accent-gold)
- Dark mode: dashed borders use `border-border` which auto-adapts
