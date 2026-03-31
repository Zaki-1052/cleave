# Pass 3: Layout and Navigation — Implementation Plan

## Context

Passes 1-2 established the shadcn/ui foundation (CSS variables, fonts, `cn()` utility) and upgraded core UI primitives (Button, Modal→Dialog, WizardModal, DataTable, Card, StatusBadge, JobErrorDetails, JobActions, Toaster). Pass 3 targets the **layout chrome** — the navbar, breadcrumbs, analysis dropdown, and experiment sidebar tabs — replacing hand-built dropdowns with shadcn DropdownMenu (Radix-based) and adding lucide icons for scannability. This dramatically improves accessibility (ARIA, keyboard navigation) and visual consistency.

**4 files modified. 0 new files. 0 interfaces changed. 0 router changes.**

---

## Prerequisite: Button `forwardRef` Fix

**File:** `frontend/src/components/ui/Button.tsx`

The Button component (from Pass 2) does NOT use `React.forwardRef`. This is required for Radix's `asChild` composition pattern — when `DropdownMenuTrigger asChild` wraps `<Button>`, Radix needs to forward a ref to measure trigger position and manage focus. Without `forwardRef`, the ref is silently dropped in React 18.

**Change:** Convert `Button` from a plain function component to `React.forwardRef<HTMLButtonElement, ButtonProps>` and pass `ref` to the `Comp` element. Add `Button.displayName = 'Button'`. This is fully backward-compatible — zero call-site changes needed.

---

## Step 1: Breadcrumbs.tsx (smallest change, smoke test)

**File:** `frontend/src/components/layout/Breadcrumbs.tsx` (42 lines)
**Used by:** `App.tsx` only

### Changes
1. **Add import:** `import { ChevronRight } from 'lucide-react'`
2. **Line 26:** Replace `<span className="text-gray-400">&gt;</span>` with `<ChevronRight className="h-3 w-3 text-gray-400" />`

That's it. One import, one element swap. Verifies lucide icon rendering works in the layout chrome.

---

## Step 2: NewAnalysisDropdown.tsx (DropdownMenu pattern test)

**File:** `frontend/src/components/experiments/NewAnalysisDropdown.tsx` (110 lines → ~55 lines)
**Used by:** `ExperimentView.tsx` only

### Changes

**A. Remove all manual state management:**
- Delete `isOpen` state, `containerRef` ref, entire click-outside `useEffect`
- Remove `import { useEffect, useRef, useState } from 'react'` entirely (no hooks needed)

**B. Replace with shadcn DropdownMenu:**
- `DropdownMenuTrigger asChild` wraps `<Button>` (requires the forwardRef fix above)
- Button text becomes `"New Analysis"` + `<ChevronDown>` icon (replaces Unicode `▼`)
- 6 `DropdownMenuItem` entries, each with a lucide icon and `onSelect` callback:

| Item | Icon | Callback prop |
|------|------|---------------|
| Alignment | `Dna` | `onAlignmentClick` |
| Peak Calling | `Mountain` | `onPeakCallingClick` |
| DiffBind | `ArrowLeftRight` | `onDiffBindClick` |
| Custom Heatmap | `Grid3x3` | `onCustomHeatmapClick` |
| Correlation | `ScatterChart` | `onPearsonCorrelationClick` |
| Normalization | `Scale` | `onNormalizationClick` |

- `align="end"` on `DropdownMenuContent` preserves right-alignment
- Radix auto-closes menu after `onSelect` — no manual `setIsOpen(false)` needed
- `NewAnalysisDropdownProps` interface unchanged

**New imports:**
```tsx
import { Button } from '@/components/ui/Button';
import { ChevronDown, Dna, Mountain, ArrowLeftRight, Grid3x3, ScatterChart, Scale } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
```

---

## Step 3: Navbar.tsx (DropdownMenu + NotificationPanel coordination)

**File:** `frontend/src/components/layout/Navbar.tsx` (119 lines → ~95 lines)
**Used by:** `App.tsx` only

### Changes

**A. Remove manual user menu state (lines 13-14, 16-25, 32-35):**
- Delete `userMenuOpen` state, `userMenuRef` ref, click-outside `useEffect`, `toggleUserMenu()` function
- Simplify imports: `import { useState } from 'react'` (drop `useEffect`, `useRef`)

**B. Replace user dropdown (lines 85-113) with DropdownMenu:**
```tsx
<DropdownMenu onOpenChange={(open) => { if (open) setNotifOpen(false); }}>
  <DropdownMenuTrigger asChild>
    <button className="inline-flex items-center gap-1 text-sm text-gray-700 hover:text-primary">
      {user.firstName ?? user.email}
      <ChevronDown className="h-3.5 w-3.5" />
    </button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end" className="w-48">
    <DropdownMenuItem asChild>
      <Link to="/settings"><Settings className="h-4 w-4" /> Settings</Link>
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem onSelect={() => logout()}>
      <LogOut className="h-4 w-4" /> Sign Out
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

Key details:
- `onOpenChange` on root DropdownMenu: when user menu opens, close notification panel (`setNotifOpen(false)`). This replaces the old `toggleUserMenu` which manually closed the notif panel.
- Settings item uses `asChild` wrapping `<Link>` to preserve React Router navigation
- Sign Out uses `onSelect` (Radix's activation event) to call `logout()`
- Trigger uses a native `<button>` (not the Button component) — no forwardRef needed here since native elements accept refs natively

**C. Simplify `toggleNotifications`:**
Remove the `setUserMenuOpen(false)` call (state no longer exists). The DropdownMenu auto-closes on outside click, so clicking the notification bell naturally closes the user menu.

**D. Replace notification bell SVG with lucide icon:**
- Replace 3-line `<svg>` with `<Bell className="h-5 w-5" />`
- Red badge span stays exactly as-is

**E. Typography and border:**
- "Cleave" wordmark: add `font-display` → `className="font-display text-xl font-bold text-primary"`
- Nav element: replace `shadow-sm` with `border-b border-border` for the "scientific clarity" border-over-shadow approach

**F. New imports:**
```tsx
import { Bell, ChevronDown, Settings, LogOut } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
```

### NotificationPanel — NOT changed
The NotificationPanel has custom notification items, mark-all-read, click-to-navigate behavior. It is NOT a standard dropdown menu. Keep it exactly as-is. Its own click-outside handler correctly closes it when clicking the DropdownMenu trigger (since the trigger is outside the panel's ref).

---

## Step 4: ExperimentView.tsx (tab icons + polish)

**File:** `frontend/src/pages/ExperimentView.tsx` (198 lines → ~205 lines)
**Used by:** Router (page component)

### Changes

**A. Add icons to TABS array (lines 29-41):**

Remove `as const` assertion (incompatible with component references as values). Add explicit type and `icon` field:

```tsx
import type { LucideIcon } from 'lucide-react';

const TABS: { label: string; path: string; icon: LucideIcon }[] = [
  { label: 'Description', path: 'description', icon: FileText },
  { label: 'FASTQs', path: 'fastqs', icon: Dna },
  { label: 'Reactions', path: 'reactions', icon: FlaskConical },
  { label: 'Alignment', path: 'alignment/0', icon: AlignLeft },
  { label: 'Peak Calling', path: 'peaks/0', icon: Mountain },
  { label: 'DiffBind', path: 'diffbind/0', icon: ArrowLeftRight },
  { label: 'Heatmaps', path: 'heatmaps/0', icon: Grid3x3 },
  { label: 'Correlation', path: 'correlations/0', icon: ScatterChart },
  { label: 'Normalization', path: 'normalization/0', icon: Scale },
  { label: 'History', path: 'history', icon: History },
  { label: 'All Files', path: 'files', icon: FolderTree },
];
```

**B. Render icons in sidebar tab links (lines 130-142):**

Add `flex items-center gap-2` to Link className, render `<tab.icon className="h-4 w-4" />` before label text. The icon inherits the active/inactive text color from the parent className.

**C. Apply `font-display` to experiment name (line 83):**
`text-xl font-bold text-gray-800` → `font-display text-xl font-bold text-gray-800`

**D. Replace "Run Full Pipeline" raw button (lines 96-101) with Button component:**
Use `<Button onClick={...} className="bg-green-600 hover:bg-green-700">Run Full Pipeline</Button>` — gets focus ring, disabled states, and consistent sizing from Button while keeping the green branding via className override.

**E. Replace inline loading spinner (line 66) with Loader2:**
`<div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />` → `<Loader2 className="h-8 w-8 animate-spin text-primary" />`

**F. New imports:**
```tsx
import { FileText, Dna, FlaskConical, AlignLeft, Mountain, ArrowLeftRight, Grid3x3, ScatterChart, Scale, History, FolderTree, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
```

### What does NOT change
- Router mechanism (Link + Outlet)
- All 6 wizard modal states + components
- AutoPipelineBanner/AutoPipelineModal
- JOB_TYPE_LABELS record
- Active tab detection logic (`pathname.includes`)
- Sidebar/main layout structure

---

## Implementation Sequence

1. **Button.tsx forwardRef fix** — prerequisite, ~5 min
2. **Breadcrumbs.tsx** — 1 icon swap, ~2 min, smoke test
3. **NewAnalysisDropdown.tsx** — DropdownMenu pattern, ~10 min
4. **Navbar.tsx** — DropdownMenu + NotificationPanel coordination, ~15 min
5. **ExperimentView.tsx** — Tab icons + polish, ~10 min
6. **Run `npm run typecheck && npm run lint && npm run build`** — verify

---

## Verification Checklist

- [ ] `npm run typecheck` — zero errors
- [ ] `npm run lint` — zero new errors
- [ ] `npm run build` — successful
- [ ] Navbar user dropdown: opens/closes on click, keyboard nav (arrow keys, Escape, Enter), Settings navigates to `/settings`, Sign Out calls logout
- [ ] Navbar notification bell: toggles NotificationPanel, opening user menu closes notification panel
- [ ] Navbar "Cleave" wordmark renders in serif display font
- [ ] Navbar bottom border visible (no shadow)
- [ ] Breadcrumbs: ChevronRight icon between segments on all pages
- [ ] NewAnalysisDropdown: 6 items with icons, selecting opens correct wizard, menu auto-closes
- [ ] ExperimentView: all 11 tabs show icons, clicking each navigates correctly
- [ ] ExperimentView: experiment name in display font
- [ ] ExperimentView: "Run Full Pipeline" uses Button component
- [ ] ExperimentView: loading state uses Loader2 spinner
- [ ] No frozen files modified (api/, hooks/, contexts/, constants.ts, utils.ts, backend/)

---

## Critical File Paths

- `frontend/src/components/ui/Button.tsx` — forwardRef fix (prerequisite)
- `frontend/src/components/layout/Breadcrumbs.tsx` — icon separator
- `frontend/src/components/experiments/NewAnalysisDropdown.tsx` — DropdownMenu conversion
- `frontend/src/components/layout/Navbar.tsx` — DropdownMenu + bell icon + typography
- `frontend/src/pages/ExperimentView.tsx` — tab icons + polish
- `frontend/src/components/ui/dropdown-menu.tsx` — shadcn component (read-only, already installed)
