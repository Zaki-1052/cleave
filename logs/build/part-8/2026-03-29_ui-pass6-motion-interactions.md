# UI Pass 6: Motion and Micro-Interactions

**Date**: 2026-03-29

## What was done

### 6d. Spinner Component (Step 1-2)
- Created `frontend/src/components/ui/Spinner.tsx` — reusable spinner with sm/md/lg sizes and className override
- Replaced 43 inline `<Loader2 className="... animate-spin ..." />` instances across 35 files
- Only `Button.tsx` (internal loading state) and `Spinner.tsx` itself still reference Loader2

### 6c. Transition Upgrades (Step 3)
- Upgraded `transition-colors` → `transition-all duration-150` on ExperimentView sidebar tabs
- Same upgrade on 6 experiment sub-tab button rows (Alignment, PeakCalling, DiffBind, CustomHeatmap, PearsonCorrelation, Normalization)
- AllFilesTab folder chevrons: replaced ChevronDown/ChevronRight swap with single ChevronRight using `transition-transform duration-150 rotate-90`

### 6e. Toast Notifications (Step 4)
Added `toast.success()`/`toast.error()` from Sonner to 25 files:
- **Projects**: CreateProjectModal (created), ManageMembersModal (invited/role updated/removed)
- **Settings**: SettingsPage (saved)
- **Jobs**: JobActions (terminated/re-queued), all 6 wizard files (job queued)
- **Notes**: All 6 info panels (saved/failed)
- **Data**: FastqsTab (trimming queued/file deleted), ReactionsEditor (reaction deleted)

### 6a-6b. Dropdown/Modal Animations
Verified already working from Pass 2-3 (shadcn Dialog + DropdownMenu have built-in animations via tailwindcss-animate)

### ESLint Warning Fixes
- Removed unused `buttonVariants` export from Button.tsx
- Removed unused `badgeVariants` export from badge.tsx
- Extracted `useBigWigOutputs` hook from ChooseBigWigSourceStep.tsx to its own file

## Verification
- `npm run typecheck`: 0 errors
- `npm run lint`: 0 errors, 0 warnings
- `npm run build`: success
- 47 files changed, +219 -130 lines

## Key file paths
- NEW: `frontend/src/components/ui/Spinner.tsx`
- NEW: `frontend/src/components/ui/useBigWigOutputs.ts`
- Modified: 45 existing files (spinner replacements + transitions + toasts + lint fixes)
