# Pass 6: Motion and Micro-Interactions — Implementation Plan

## Context

Passes 1-5 (+ critique fixes) are complete. The app has proper typography, icons (lucide), shadcn components, and consistent design language. What's missing: a unified `Spinner` component (29+ inline `Loader2` instances), toast notifications for mutations (Sonner is mounted but unused), and transition polish on interactive elements that currently snap between states.

shadcn's Radix-based components (Dialog, DropdownMenu, Tooltip, Collapsible) already have entrance/exit animations via `tailwindcss-animate`. Modal and dropdown animations are **done** from Pass 2/3. This pass focuses on the remaining items.

---

## Steps

### Step 1: Create `Spinner` Component

**File**: `frontend/src/components/ui/Spinner.tsx` (NEW)

Create a small reusable spinner wrapping the repeated `<Loader2 className="... animate-spin" />` pattern:

```tsx
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

const sizes = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' } as const;

export function Spinner({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return <Loader2 className={cn(sizes[size], 'animate-spin text-primary', className)} />;
}
```

### Step 2: Replace All Inline Spinners with `<Spinner />`

**~20+ files** — replace every `<Loader2 className="h-8 w-8 animate-spin text-primary" />` (and h-6/h-4 variants) with `<Spinner size="lg" />` / `<Spinner />` / `<Spinner size="sm" />`.

Files to update (grouped by spinner size):

**`lg` (h-8 w-8) — page-level loading states:**
- `pages/HomePage.tsx`
- `pages/ProjectDetailPage.tsx`
- `pages/ExperimentView.tsx`
- `pages/AnalysisQueuePage.tsx`
- `pages/experiment/AlignmentTab.tsx`
- `pages/experiment/PeakCallingTab.tsx`
- `pages/experiment/DiffBindTab.tsx`
- `pages/experiment/CustomHeatmapTab.tsx`
- `pages/experiment/PearsonCorrelationTab.tsx`
- `pages/experiment/NormalizationTab.tsx`
- `pages/experiment/ReactionsTab.tsx`
- `pages/experiment/FastqsTab.tsx` (main loading)
- `pages/experiment/AllFilesTab.tsx`
- `components/auth/ProtectedRoute.tsx`

**`md` (h-6 w-6) — panel-level spinners:**
- `components/alignment/AlignmentQCReportPanel.tsx`
- `components/alignment/AlignmentFilesPanel.tsx`
- `components/peak-calling/PeakCallingQCReportPanel.tsx`
- `components/peak-calling/PeakCallingFilesPanel.tsx`
- `components/normalization/NormalizationResultsPanel.tsx`
- `components/diffbind/DiffBindResultsPanel.tsx`
- `components/diffbind/DiffBindPlotsPanel.tsx`
- `components/pearson-correlation/CorrelationPlotPanel.tsx`
- `components/custom-heatmap/HeatmapPlotPanel.tsx`

**`sm` (h-4 w-4 or h-3 w-3) — inline spinners:**
- `pages/experiment/FastqsTab.tsx` (trimming in-progress indicator)
- `components/experiments/AutoPipelineBanner.tsx`

**Note**: `Button.tsx` line 54 keeps its own internal `<Loader2>` — do NOT replace it (it's part of the Button API, not a standalone spinner).

**Approach**: For each file, replace the Loader2 spinner import/usage with `Spinner` import. Remove `Loader2` import if no longer needed. Preserve the surrounding container/flex layout — only swap the icon element.

### Step 3: Interactive Element Transitions

Add `transition-all duration-150` to elements that currently snap between states:

**3a. ExperimentView sidebar tabs** (`pages/ExperimentView.tsx` ~line 145)
- Current: `transition-colors` only
- Change to: `transition-all duration-150` (covers background, font-weight changes smoothly)

**3b. Experiment sub-tab buttons** (in AlignmentTab, PeakCallingTab, DiffBindTab, etc.)
- These are the Info/Input/QC/Files/IGV row of sub-tabs within each analysis tab
- Search for the sub-tab button pattern with `transition-colors` and upgrade to `transition-all duration-150`
- Files: `AlignmentTab.tsx`, `PeakCallingTab.tsx`, `DiffBindTab.tsx`, `CustomHeatmapTab.tsx`, `PearsonCorrelationTab.tsx`, `NormalizationTab.tsx`

**3c. Collapsible sections** — JobErrorDetails, AlignmentQCReportPanel info toggle
- The chevron icon rotation should use `transition-transform duration-150` (shadcn Collapsible may already handle this — verify)

**3d. AllFilesTab folder expand/collapse** (`pages/experiment/AllFilesTab.tsx`)
- The folder tree expand icons (ChevronRight/ChevronDown) should have `transition-transform duration-150` for rotation animation

### Step 4: Toast Notifications for Mutations

Import `toast` from `sonner` in each file and add calls at mutation trigger points. **DO NOT modify hooks** — add toasts at the component level.

**Priority 1 — High-impact actions (user needs confirmation):**

| File | Mutation | Toast |
|------|----------|-------|
| `CreateProjectModal.tsx` | createProject success | `toast.success("Project created")` |
| `ManageMembersModal.tsx` | addMember success | `toast.success("Member invited")` |
| `ManageMembersModal.tsx` | removeMember success | `toast.success("Member removed")` |
| `ManageMembersModal.tsx` | updateRole success | `toast.success("Role updated")` |
| `ManageMembersModal.tsx` | removeMember/updateRole error | `toast.error("Failed to update member")` |
| `SettingsPage.tsx` | save success | `toast.success("Settings saved")` — replace inline success message |
| `JobActions.tsx` | terminate success | `toast.success("Job terminated")` |
| `JobActions.tsx` | retry success | `toast.success("Job re-queued")` |
| `JobActions.tsx` | terminate/retry error | `toast.error("Action failed")` |
| `FastqsTab.tsx` | trim job created | `toast.success("Trimming job queued")` |
| `FastqsTab.tsx` | trim job error | `toast.error("Failed to start trimming")` |
| `FastqsTab.tsx` | delete FASTQ success | `toast.success("File deleted")` |
| `ReactionsEditor.tsx` | delete reaction success | `toast.success("Reaction deleted")` |

**Priority 2 — Lightweight confirmation (notes saves, etc.):**

| File | Mutation | Toast |
|------|----------|-------|
| `AlignmentInfoPanel.tsx` | updateNotes success | `toast.success("Notes saved")` |
| `PeakCallingInfoPanel.tsx` | updateNotes success | `toast.success("Notes saved")` |
| `DiffBindInfoPanel.tsx` | updateNotes success | `toast.success("Notes saved")` |
| `CustomHeatmapTab.tsx` | updateNotes success | `toast.success("Notes saved")` |
| `PearsonCorrelationTab.tsx` | updateNotes success | `toast.success("Notes saved")` |
| `NormalizationTab.tsx` | updateNotes success | `toast.success("Notes saved")` |
| All 6 info panels | updateNotes error | `toast.error("Failed to save notes")` |

**Priority 3 — Wizard job submissions (already have inline error, add success toast):**

| File | Mutation | Toast |
|------|----------|-------|
| `NewAlignmentWizard.tsx` | createJob success | `toast.success("Alignment job queued")` (before navigate) |
| `NewPeakCallingWizard.tsx` | createJob success | `toast.success("Peak calling job queued")` |
| `NewDiffBindWizard.tsx` | createJob success | `toast.success("DiffBind job queued")` |
| `NewCustomHeatmapWizard.tsx` | createJob success | `toast.success("Heatmap job queued")` |
| `NewPearsonCorrelationWizard.tsx` | createJob success | `toast.success("Correlation job queued")` |
| `NewNormalizationWizard.tsx` | createJob success | `toast.success("Normalization job queued")` |

**Keep inline errors for form validation** (wizard footers, delete confirmation modals). Toasts are for ephemeral server-level feedback. Don't duplicate — if a wizard already shows an error in the footer, a toast.error is optional but the success toast is valuable since the wizard closes/navigates away.

### Step 5: Verify Animations from Earlier Passes

Confirm these already work (no code changes needed, just verification):

- **6a (Dropdown animations)**: shadcn DropdownMenu in Navbar and NewAnalysisDropdown already has `animate-in`/`animate-out` with fade + zoom + slide from `dropdown-menu.tsx`
- **6b (Modal animations)**: shadcn Dialog in Modal.tsx already has fade-in + zoom-in + slide-in from `dialog.tsx`
- **WizardModal step transitions**: Currently no animation between steps (spec says "verify it feels smooth") — the content swap is instantaneous. Adding step transition animation would require wrapping step content in a transition container. **Defer if complex** — the fade-in on dialog open is sufficient for now.

---

## Critical Files Modified

| File | Change |
|------|--------|
| `components/ui/Spinner.tsx` | **NEW** — Reusable spinner |
| ~20 page/component files | Replace inline `Loader2` spinners with `<Spinner />` |
| ~6 tab page files | Upgrade `transition-colors` → `transition-all duration-150` |
| `pages/experiment/AllFilesTab.tsx` | Add transition-transform to folder chevrons |
| `components/projects/CreateProjectModal.tsx` | Add toast |
| `components/projects/ManageMembersModal.tsx` | Add toasts (3 mutations) |
| `pages/SettingsPage.tsx` | Replace inline success with toast |
| `components/ui/JobActions.tsx` | Add toasts (terminate + retry) |
| `pages/experiment/FastqsTab.tsx` | Add toasts (trim + delete) |
| `components/reactions/ReactionsEditor.tsx` | Add toast (delete) |
| 6 info panels | Add toasts (notes save) |
| 6 wizard files | Add success toasts (job queued) |

**Total: ~1 new file + ~35 modified files**

---

## Verification

1. `npm run typecheck` — zero errors
2. `npm run lint` — no new warnings
3. `npm run build` — successful production build
4. All spinners render consistently at correct sizes
5. Toast notifications appear and auto-dismiss on:
   - Project creation, member invite/remove/role change
   - Settings save, notes save
   - Job terminate, retry, queue
   - FASTQ delete, trim start
   - Reaction delete
6. Tab and sub-tab transitions feel smooth (not snapping)
7. Folder tree expand/collapse has smooth chevron rotation
8. All existing workflows unaffected (modals open/close, wizards complete, navigation works)
