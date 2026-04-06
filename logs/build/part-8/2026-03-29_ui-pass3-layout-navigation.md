# UI Improvement Pass 3: Layout and Navigation

**Date**: 2026-03-29
**Scope**: Navbar, Breadcrumbs, NewAnalysisDropdown, ExperimentView sidebar tabs

## What Was Done

### Modified (5 files)
- **`frontend/src/components/ui/Button.tsx`** — Added `React.forwardRef` + `displayName` for proper Radix `asChild` composition (prerequisite for DropdownMenuTrigger wrapping Button)
- **`frontend/src/components/layout/Breadcrumbs.tsx`** — Replaced HTML entity `>` separator with lucide `ChevronRight` icon
- **`frontend/src/components/experiments/NewAnalysisDropdown.tsx`** — Replaced 110-line hand-built dropdown (useState/useRef/click-outside) with ~65-line shadcn `DropdownMenu`. 6 items each get a lucide icon (Dna, Mountain, ArrowLeftRight, Grid3x3, ScatterChart, Scale). Free keyboard nav + animations from Radix.
- **`frontend/src/components/layout/Navbar.tsx`** — Replaced hand-built user dropdown with shadcn `DropdownMenu`. Bell SVG → lucide `Bell`. Unicode `▼` → lucide `ChevronDown`. "Cleave" wordmark gets `font-display`. `shadow-sm` → `border-b border-border`. `onOpenChange` coordinates with NotificationPanel.
- **`frontend/src/pages/ExperimentView.tsx`** — All 11 sidebar tabs get lucide icons. Experiment name heading uses `font-display`. "Run Full Pipeline" raw button → Button component. Loading spinner → `Loader2`.

## Decisions Made

- **NotificationPanel left as-is**: Custom notification items, mark-all-read, click-to-navigate behavior doesn't fit DropdownMenu. Its own click-outside handler works correctly alongside Radix portals.
- **No shadcn Tabs for ExperimentView**: Current Link + Outlet routing works well. Radix Tabs' controlled state would conflict with React Router URL-based navigation. Simply adding icons was the right call.
- **Button forwardRef**: Required for `DropdownMenuTrigger asChild` composition in React 18. Backward-compatible — zero call-site changes.
- **Native `<button>` for Navbar trigger**: No need for the Button component since the user menu trigger has custom styling distinct from action buttons.

## Open Items

- Pass 4 (Page-Level Polish) is next — HomePage, LoginPage, ProjectDetailPage, AnalysisQueuePage, SettingsPage
- NotificationPanel SVG icons could be replaced with lucide equivalents in Pass 5 (Feature Components)

## Verification

- `npm run typecheck` — clean (0 errors)
- `npm run lint` — clean (0 errors, 3 pre-existing warnings)
- `npm run build` — successful
- No frozen files modified (utils.ts, constants.ts, api/, hooks/, contexts/, pages/ routing, backend/)

## Key File Paths

- `frontend/src/components/ui/Button.tsx` — forwardRef addition
- `frontend/src/components/layout/Navbar.tsx` — DropdownMenu + lucide Bell + font-display
- `frontend/src/components/layout/Breadcrumbs.tsx` — ChevronRight separator
- `frontend/src/components/experiments/NewAnalysisDropdown.tsx` — DropdownMenu with icons
- `frontend/src/pages/ExperimentView.tsx` — tab icons + Button + font-display
