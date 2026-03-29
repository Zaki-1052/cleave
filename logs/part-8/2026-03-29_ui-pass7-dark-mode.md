# UI Pass 7: Dark Mode

**Date**: 2026-03-29

## What was done

Implemented full dark mode support across the entire Cleave frontend using `next-themes` (already installed) + shadcn CSS variable theming + Tailwind `darkMode: ['class']`.

### Step 7a: Theme Infrastructure (3 files)
- Created `components/ui/ThemeToggle.tsx` — Sun/Moon toggle using `next-themes` `useTheme()`
- Wrapped app tree in `<ThemeProvider attribute="class" defaultTheme="system" storageKey="cleave-theme">` in `main.tsx`
- Added ThemeToggle to Navbar between notification bell and user dropdown

### Step 7c: Gradient Background
- No changes needed — `GradientBackground.tsx` already uses `var(--gradient-bg)` which has light/dark variants in `index.css`

### Step 7d: Component-Level Dark Mode (~110 files)

**Batch 1 — UI Primitives (9 files)**:
- `Input.tsx`: label, border, error colors → semantic tokens
- `StatusBadge.tsx`: all 7 status tints → added `dark:` variants (e.g., `bg-blue-50 dark:bg-blue-950`)
- `WizardModal.tsx`: step indicators, separators, cancel button → semantic
- `DataTable.tsx`: header, row hover, pagination text → semantic
- `DetailRow.tsx`: border, label, value text → semantic
- `StorageGauge.tsx`: label, track bg, value text → semantic
- `JobErrorDetails.tsx`: all red-tinted elements → `dark:` variants
- `ChooseBigWigSourceStep.tsx`: all grays + green/amber tints → semantic + `dark:`

**Batch 2 — Layout (3 files)**:
- `Navbar.tsx`: `bg-white` → `bg-card`, all nav text → semantic
- `NotificationPanel.tsx`: `bg-white` → `bg-card`, all borders/text/dividers → semantic
- `Breadcrumbs.tsx`: chevron + terminal segment → semantic

**Batch 3 — Auth Pages (4 files)**: Login, Register, ForgotPassword, ResetPassword
- `text-gray-800` → `text-foreground`, `text-gray-500` → `text-muted-foreground`
- Card borders: added `dark:border-white/10`

**Batch 4 — Main Pages (6 files)**: Home, ProjectDetail, ExperimentView, AnalysisQueue, Settings, ErrorBoundary
- ExperimentView sidebar: `bg-white` active → `bg-card`, `hover:bg-white/50` → `hover:bg-card/50`
- All gray text/borders → semantic tokens

**Batch 5 — Experiment Sub-Tabs (11 files)**: All tabs from Description through AllFiles
- Systematic `text-gray-*` → semantic, `bg-white` → `bg-card`, `border-gray-*` → `border-border`

**Batch 6 — Feature Components (~55 files)**:
- Alignment (8 files), Peak Calling (10 files), IGV (2 files)
- DiffBind (10 files), Heatmaps (4 files), Correlation (5 files), Normalization (5 files)
- FASTQs (3 files), Reactions (3 files), Experiments (4 files), Projects (2 files)
- PeakAnnotationChart: Recharts tooltip → `bg-card border-border text-foreground`

**Colored tint banners (20 files)**:
- All `bg-red-50`, `bg-amber-50`, `bg-blue-50`, `bg-green-50`, `bg-yellow-50` banners → added `dark:bg-*-950 dark:text-*-300` variants
- Progress bars: `bg-gray-200` → `bg-muted`
- Step separators: `bg-gray-300` → `bg-border`
- Disabled buttons: `disabled:text-gray-300` → `disabled:opacity-40`
- Em-dash placeholders: `text-gray-300` → `text-muted-foreground/50`

## Semantic mapping applied

| From | To |
|------|----|
| `text-gray-400/500/600` | `text-muted-foreground` |
| `text-gray-700/800/900` | `text-foreground` |
| `bg-white` | `bg-card` |
| `bg-gray-50/100` | `bg-muted` |
| `border-gray-100/200/300` | `border-border` |
| `hover:bg-gray-50/100` | `hover:bg-muted` |
| `divide-gray-*` | `divide-border` |

## Intentionally preserved

- `bg-gray-900` + `text-gray-200` in log viewers (dark code blocks)
- `hover:text-gray-200` in FastQC modal close button (on colored header)
- Chart colors (ANNOTATION_COLORS hex, TRACK_COLORS rgb)
- Status colors (`text-status-*`, `bg-status-*`)

## Verification

- `npm run typecheck`: 0 errors
- `npx eslint src/`: 0 errors, 0 warnings
- `npm run build`: successful (4.51s)
- Remaining `text-gray-*` in TSX: 2 instances (both intentional — dark code blocks)
- Remaining `bg-gray-*` in TSX: 3 instances (all intentional — code blocks, StatusBadge dot fallback)
- Remaining `border-gray-*` in TSX: 0 instances

## Files created
- `frontend/src/components/ui/ThemeToggle.tsx`

## Files modified
- ~110 TSX files across all component directories
- `frontend/src/main.tsx` (ThemeProvider wrapper)
