# Pass 7: Dark Mode Implementation Plan

## Context

Passes 1-6 of the Cleave UI improvement are complete. The infrastructure for dark mode is **90% ready**: CSS variables are defined for both `:root` (light) and `.dark` (dark) in `index.css`, `darkMode: ['class']` is configured in Tailwind, shadcn components use semantic tokens, and `next-themes` is already installed (but unused). The gradient background already uses `var(--gradient-bg)` which has a dark variant defined.

The remaining work is: (1) wire up theme switching, (2) systematically replace ~900 hardcoded color classes across ~110 files with semantic tokens or `dark:` variants, and (3) handle special cases (charts, IGV, status badges).

**Approach**: Work in 5 sub-steps (7a-7e per the spec), prioritizing high-impact shared primitives first so changes cascade to all consumers.

---

## Step 7a: Theme Infrastructure

**Goal**: Wire `next-themes` ThemeProvider, create theme toggle, persist to localStorage, respect system preference.

### Files to create:
- **`frontend/src/components/ui/ThemeToggle.tsx`** — Sun/Moon icon button using `next-themes` `useTheme()`. Cycles between light/dark. Uses lucide `Sun` and `Moon` icons. Small button styled to sit in the Navbar between the notification bell and user dropdown.

### Files to modify:
- **`frontend/src/main.tsx`** — Wrap the app tree with `<ThemeProvider attribute="class" defaultTheme="system" storageKey="cleave-theme">` from `next-themes`. Place it inside `<StrictMode>` but outside `<BrowserRouter>`. The `attribute="class"` setting makes it add/remove `.dark` on `<html>`, which matches our `darkMode: ['class']` Tailwind config.
  - IMPORTANT: Do NOT modify `contexts/` — `next-themes` provides its own context and `useTheme` hook. We're adding a provider in main.tsx (not a context file).

- **`frontend/src/components/layout/Navbar.tsx`** — Add `<ThemeToggle />` between the notification bell and user dropdown in the right-side flex container.

- **`frontend/index.html`** — Add `<script>` in `<head>` for flash prevention: next-themes handles this automatically via its `ThemeProvider`, but we may need to add `class="dark"` default handling or a tiny inline script to avoid FOUC (flash of unstyled content). next-themes v0.4+ handles this internally.

### Verification:
- Toggle button appears in Navbar
- Clicking toggles `.dark` class on `<html>`
- Gradient background changes between light and dark variants
- Preference persists across page refresh
- System preference respected on first visit
- `npm run typecheck` passes

---

## Step 7b: Theme Toggle Button

This is merged into 7a above — the ThemeToggle component is created as part of the infrastructure step.

---

## Step 7c: Gradient Background in Dark Mode

**Already handled** — `GradientBackground.tsx` uses `var(--gradient-bg)` and `index.css` already defines a dark gradient:
```css
.dark {
  --gradient-bg: linear-gradient(180deg, #1a2332 0%, #1c2d3a 25%, #1a2a2e 50%, #1e2a24 75%, #1f2520 100%);
}
```

This works automatically once the `.dark` class is toggled. No changes needed to `GradientBackground.tsx`.

**Auth pages** (Login, Register, ForgotPassword, ResetPassword) all use `GradientBackground` directly, so they'll get the dark gradient automatically. The `text-white` headings on auth pages work in both modes since both gradients are dark enough / light enough for white text to remain legible. Will verify during testing.

---

## Step 7d: Component-Level Dark Mode

This is the bulk of the work. Strategy: **start with shared primitives** (changes cascade to all consumers), then **layout components**, then **page-level files**, then **feature components**.

### Batch 1: UI Primitives (~8 files)

These are imported across the entire app. Fixing them first maximizes cascade.

| File | Changes |
|------|---------|
| `components/ui/Input.tsx` | `text-gray-500` → `text-muted-foreground` on label; `border-gray-300` → `border-input` on input; `text-red-500` → `text-destructive` on error |
| `components/ui/StatusBadge.tsx` | Add `dark:` variants to all STATUS_TINTS: e.g. `bg-blue-50 text-blue-700` → `bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300` for each status |
| `components/ui/WizardModal.tsx` | `bg-gray-200 text-gray-500` on step indicators → `bg-muted text-muted-foreground`; `bg-gray-300` step separator → `bg-border`; `text-gray-500 hover:text-gray-700` cancel → `text-muted-foreground hover:text-foreground` |
| `components/ui/DataTable.tsx` | Check for any remaining hardcoded grays in pagination or cells; `bg-muted/50` header is already semantic |
| `components/ui/Modal.tsx` | Verify `[&>button]:text-white` works (it's on primary bg, should be fine); close button uses `text-primary-foreground` semantics |
| `components/ui/DetailRow.tsx` | Check border color — should use `border-border` |
| `components/ui/StorageGauge.tsx` | Check background track color |
| `components/ui/JobActions.tsx` | Verify button usage is semantic |
| `components/ui/JobErrorDetails.tsx` | Check any remaining hardcoded grays in log viewer |

### Batch 2: Layout Components (~4 files)

| File | Changes |
|------|---------|
| `components/layout/Navbar.tsx` | `bg-white` → `bg-card` (or `bg-background`); `text-gray-600` → `text-muted-foreground`; `text-gray-700` → `text-foreground`; `text-gray-500` → `text-muted-foreground` |
| `components/layout/NotificationPanel.tsx` | `bg-white` → `bg-card`; `border-gray-200` → `border-border`; `text-gray-900` → `text-card-foreground`; `text-gray-600` → `text-muted-foreground`; `text-gray-400` → `text-muted-foreground`; `hover:bg-gray-50` → `hover:bg-muted`; `divide-gray-100` → `divide-border`; `bg-gray-50` → `bg-muted` |
| `components/layout/Breadcrumbs.tsx` | Check — uses `text-primary-dark` and `bg-primary/20`, may need dark variant for `text-primary-dark` since it's a hardcoded hex |
| `components/layout/Card.tsx` | Already uses `bg-card border-border` — no changes needed |

### Batch 3: Auth Pages (~4 files)

| File | Changes |
|------|---------|
| `pages/LoginPage.tsx` | `text-gray-800` → `text-foreground`; `text-gray-500` → `text-muted-foreground`; card border `border-white/50` → `border-white/50 dark:border-white/10` |
| `pages/RegisterPage.tsx` | Same pattern as LoginPage |
| `pages/ForgotPasswordPage.tsx` | Same pattern |
| `pages/ResetPasswordPage.tsx` | Same pattern |

### Batch 4: Main Pages (~5 files)

| File | Changes |
|------|---------|
| `pages/HomePage.tsx` | `text-gray-800` → `text-foreground`; `text-gray-500` → `text-muted-foreground`; `text-gray-600` → `text-muted-foreground` |
| `pages/ProjectDetailPage.tsx` | Same gray → semantic pattern; check member avatar circles |
| `pages/ExperimentView.tsx` | **HIGH PRIORITY**: `bg-white` active tab → `bg-card`; `text-gray-600` inactive → `text-muted-foreground`; `hover:bg-white/50` → `hover:bg-card/50`; `text-gray-800` heading → `text-foreground`; `text-gray-500` metadata → `text-muted-foreground` |
| `pages/AnalysisQueuePage.tsx` | Gray text → semantic tokens; check filter bar and pagination |
| `pages/SettingsPage.tsx` | Gray text → semantic tokens |

### Batch 5: Experiment Sub-Tab Pages (~11 files)

All files in `pages/experiment/`:
- `DescriptionTab.tsx`, `FastqsTab.tsx`, `ReactionsTab.tsx`, `AlignmentTab.tsx`, `PeakCallingTab.tsx`, `DiffBindTab.tsx`, `CustomHeatmapTab.tsx`, `PearsonCorrelationTab.tsx`, `NormalizationTab.tsx`, `HistoryTab.tsx`, `AllFilesTab.tsx`

**Pattern**: Replace `text-gray-*` → `text-muted-foreground` or `text-foreground`; `bg-gray-50/100` → `bg-muted`; `border-gray-*` → `border-border`; `bg-white` → `bg-card`; `hover:bg-gray-50` → `hover:bg-muted`

**AllFilesTab.tsx**: Needs special attention — has folder tree with `bg-white`, `text-gray-*`, `border-gray-*` throughout.

### Batch 6: Feature Components (~55 files)

Systematic sweep across all feature component directories. Same pattern as batch 5.

**Alignment** (`components/alignment/` — 8 files):
- `AlignmentQCReportPanel.tsx` — heaviest file (~30 gray occurrences). Replace all `text-gray-*`, `bg-gray-*`, `border-gray-*` with semantic equivalents. Info panel toggle, metric labels, table cells.
- Remaining 7 files — same pattern

**Peak Calling** (`components/peak-calling/` — 7 files):
- `PeakAnnotationChart.tsx` — **SPECIAL CASE**: Recharts tooltip `bg-white border-gray-300 text-gray-800` → `bg-card border-border text-card-foreground`. Annotation colors (hex) are bright enough for both modes — leave them. Recharts axis text needs `fill` prop awareness — may need to pass current theme color to `<XAxis tick={{ fill }}>`
- `PeakCallingQCReportPanel.tsx` — similar to alignment QC panel
- `PeakCallingSettingsStep.tsx` — heaviest settings file (~28 border-gray occurrences)

**DiffBind** (`components/diffbind/` — 8 files):
- Same gray → semantic pattern

**Remaining domains** (heatmaps, correlation, normalization, FASTQs, IGV, reactions, experiments, projects):
- Same systematic replacement

**IGVPanel.tsx** — **SPECIAL CASE**:
- Toolbar buttons: `border-gray-200 bg-gray-50 text-gray-700` → `border-border bg-muted text-foreground`
- Placeholder: `border-gray-300 text-gray-400` → `border-border text-muted-foreground`
- IGV.js itself renders its own DOM. It has limited dark mode support. We may need to check if `igv.createBrowser()` accepts a `palette` or `theme` option. If not, the IGV browser area will render in its default light theme regardless — this is acceptable since IGV is an embedded third-party widget.

### Approach for the ~646 `text-gray-*` replacements:

Rather than individually editing 646 instances, use a **semantic mapping strategy**:

| Hardcoded Class | Semantic Replacement | Usage |
|----------------|---------------------|-------|
| `text-gray-400` | `text-muted-foreground` | Timestamps, placeholders, subtle hints |
| `text-gray-500` | `text-muted-foreground` | Secondary labels, descriptions |
| `text-gray-600` | `text-muted-foreground` | Body text in secondary contexts |
| `text-gray-700` | `text-foreground` | Primary body text, nav links |
| `text-gray-800` | `text-foreground` | Headings, strong text |
| `text-gray-900` | `text-foreground` | Strongest text (rare) |
| `bg-white` | `bg-card` or `bg-background` | Card backgrounds, panels |
| `bg-gray-50` | `bg-muted` | Alternating rows, subtle backgrounds |
| `bg-gray-100` | `bg-muted` | Input backgrounds, section fills |
| `bg-gray-200` | `bg-muted` or specific dark variants | Step indicators, dividers |
| `border-gray-100` | `border-border` | Subtle dividers |
| `border-gray-200` | `border-border` | Standard borders |
| `border-gray-300` | `border-border` | Input borders, stronger dividers |
| `hover:bg-gray-50` | `hover:bg-muted` | Hover states |
| `hover:bg-gray-100` | `hover:bg-muted` | Stronger hover states |
| `divide-gray-100` | `divide-border` | List dividers |
| `divide-gray-200` | `divide-border` | Standard dividers |

This mapping preserves the visual hierarchy (lighter grays = more subtle) while making everything theme-aware. The semantic tokens have appropriate light/dark values already defined in `index.css`.

**IMPORTANT**: Some `text-gray-*` instances are intentionally different shades for visual hierarchy. When two adjacent elements use `text-gray-500` and `text-gray-800`, both map to different semantic tokens (`text-muted-foreground` vs `text-foreground`) to preserve that hierarchy.

---

## Step 7e: Dark Mode Testing

After all changes, verify:

### Visual Verification (both modes):
- [ ] Auth pages (login, register, forgot-password, reset-password) — gradient, card, text legible
- [ ] Home page — project cards, filter sidebar, empty state
- [ ] Project detail — member avatars, experiments table, storage gauge
- [ ] Experiment view — sidebar tabs (active/inactive), all 11 sub-tabs
- [ ] Alignment QC report — metrics table, spike-in heatmap colors, info panel
- [ ] Peak calling QC — FRiP table, annotation bar chart, top peaks
- [ ] DiffBind results — dynamic columns, plots
- [ ] IGV browser — toolbar buttons, track display
- [ ] All Files tab — folder tree, file table
- [ ] Analysis Queue — filters, pagination, status badges
- [ ] Settings page — form inputs, sections
- [ ] Notifications panel — read/unread states
- [ ] Modals and wizards — all step indicators, form inputs
- [ ] Toast notifications — success/error styles
- [ ] Status badges — all 5 states visible against dark background

### Color Contrast Checks:
- [ ] `text-muted-foreground` readable on `bg-background` and `bg-card` in dark mode
- [ ] Status badge tints (blue-50, green-50, red-50, etc.) have adequate contrast in dark mode
- [ ] Primary color (#4AAED9) works on dark backgrounds
- [ ] Recharts tooltip readable in dark mode
- [ ] FRiP color coding visible in dark mode

### Technical Verification:
- [ ] `npm run typecheck` — zero errors
- [ ] `npm run lint` — zero new errors
- [ ] `npm run build` — successful production build
- [ ] Browser console — no new errors
- [ ] Theme toggle persists across refresh
- [ ] System preference detection works on first visit
- [ ] No FOUC (flash of wrong theme) on page load

---

## Execution Order

1. **7a** — ThemeToggle component + ThemeProvider wiring + Navbar integration (~3 files)
2. **7d Batch 1** — UI primitives (~8 files) — cascades to entire app
3. **7d Batch 2** — Layout components (~4 files) — fixes navbar, notifications
4. **7d Batch 3** — Auth pages (~4 files) — quick wins
5. **7d Batch 4** — Main pages (~5 files) — high-visibility fixes
6. **7d Batch 5** — Experiment sub-tab pages (~11 files) — systematic
7. **7d Batch 6** — Feature components (~55 files) — largest batch, systematic
8. **7e** — Testing and fixes

**After each batch**: run `npm run typecheck`, verify in browser.

---

## Critical Files (Most Modified)

| File | Estimated Changes | Priority |
|------|------------------|----------|
| `main.tsx` | +ThemeProvider wrapper | Step 7a |
| `Navbar.tsx` | +ThemeToggle, bg-white→bg-card, grays→semantic | Step 7a+Batch 2 |
| `ExperimentView.tsx` | Sidebar active/inactive states, all grays | Batch 4 |
| `NotificationPanel.tsx` | bg-white, all grays, dividers | Batch 2 |
| `AlignmentQCReportPanel.tsx` | ~30 gray replacements | Batch 6 |
| `PeakCallingSettingsStep.tsx` | ~28 border-gray replacements | Batch 6 |
| `PeakAnnotationChart.tsx` | Recharts tooltip, axis colors | Batch 6 |
| `StatusBadge.tsx` | All status tint dark variants | Batch 1 |
| `WizardModal.tsx` | Step indicators, separators | Batch 1 |
| `Input.tsx` | Label, border, error colors | Batch 1 |
| `AllFilesTab.tsx` | Folder tree, file table colors | Batch 5 |
| `IGVPanel.tsx` | Toolbar buttons, placeholder | Batch 6 |

---

## Constraints Reminder

- DO NOT modify `backend/`, `frontend/src/api/`, `frontend/src/hooks/`, `frontend/src/contexts/`, `frontend/src/lib/constants.ts`, `frontend/src/lib/utils.ts`
- DO NOT add animation libraries
- DO NOT change router configuration in `App.tsx`
- DO NOT change Tailwind color names (`primary`, `status-*`, `accent-*`)
- `next-themes` is already installed — use it, don't roll a custom solution
- Preserve all existing user workflows identically
- `npm run typecheck` must pass after every batch
