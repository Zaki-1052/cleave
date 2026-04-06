# UI Improvement Pass 2: Core UI Components

**Date**: 2026-03-29
**Scope**: Shared UI primitives — Button, Modal, WizardModal, DataTable, Card, StatusBadge, JobErrorDetails, JobActions, Toast

## What Was Done

### Modified (9 files)

- **`frontend/src/components/ui/Button.tsx`** — Rewrote with `class-variance-authority` (cva). Added `loading`, `asChild`, `size` props. Variant aliases for backward compat: `primary` → `default`, `outlined` → `outline`. Switched from `rounded-full` (pill) to `rounded-md`. Added proper focus ring, disabled states. Exports `Button` + `buttonVariants`.

- **`frontend/src/components/ui/Modal.tsx`** — Rewrote as thin wrapper around shadcn Dialog. Same `ModalProps` interface (`isOpen`, `onClose`, `title`, `children`, `className`). Gets focus trap, Escape dismiss, entrance/exit animations, lucide X icon (replaces Unicode `✕`) for free from Radix. Preserved bg-primary header with white text. Close button styled white via `[&>button]:text-white`.

- **`frontend/src/components/ui/WizardModal.tsx`** — Upgraded to use shadcn Dialog as base layer. Removed manual overlay/backdrop. Gets focus trap + keyboard handling + animations from Radix. Completed steps now show lucide `Check` icon instead of step number. Dialog close button replaces Unicode `✕`. All interfaces preserved exactly.

- **`frontend/src/components/layout/Card.tsx`** — Replaced `bg-white shadow-sm` with `border border-border bg-card`. Uses `cn()` for proper className merging. Semantic tokens for dark mode readiness.

- **`frontend/src/components/ui/DataTable.tsx`** — Replaced Unicode `▲`/`▼` sort indicators with lucide `ChevronUp`/`ChevronDown`/`ChevronsUpDown` icons. Added `emptyMessage` prop with `Inbox` icon empty state. Added `select-none` on header cells, `tabular-nums` on table, `bg-muted/50` header row.

- **`frontend/src/components/ui/StatusBadge.tsx`** — Added subtle background tints per status (e.g., `bg-green-50 text-green-700` for complete). Pill shape with `rounded-md px-2 py-0.5`. Reduced dot to `h-2 w-2`.

- **`frontend/src/components/ui/JobErrorDetails.tsx`** — Replaced manual expand/collapse with shadcn `Collapsible`. Unicode `▸`/`▾` replaced with lucide `ChevronRight` with `rotate-90` transition. Error dot replaced with lucide `AlertCircle`. Copy buttons get lucide `Copy` icon.

- **`frontend/src/components/ui/JobActions.tsx`** — Replaced inline-styled `<button>` elements with the new `Button` component. Terminate uses `variant="destructive"`, Retry uses `variant="outline"`. Both use `loading` prop.

- **`frontend/src/main.tsx`** — Mounted `<Toaster />` from sonner for global toast notifications.

## Decisions Made

- **Button variants as aliases**: Kept `primary` and `outlined` as cva aliases mapping to `default` and `outline` respectively. Zero call-site changes across 40 import sites.
- **Modal `p-0 gap-0`**: DialogContent uses zero padding/gap so the bg-primary header goes edge-to-edge. Body section manages its own `p-6`.
- **WizardModal on Dialog**: Chose to switch to Dialog base (over polishing existing implementation) for free focus trap, keyboard handling, and animations.
- **Card border over shadow**: "Scientific Clarity" direction prefers borders for inline containers, shadows for floating elements.
- **DataTable header `bg-muted/50`**: Replaced `bg-primary/10` for a more muted, data-table-appropriate look.
- **StatusBadge tint map**: Hardcoded tints in component (not in constants.ts which is frozen).
- **Toaster in main.tsx**: Mounted as sibling of `<App />` inside providers so toasts work on all pages including auth.

## Import Site Impact

| Component | Import Sites | Changes Required |
|-----------|-------------|-----------------|
| Button | 40 | 0 (variant aliases) |
| Modal | 9 | 0 (same interface) |
| WizardModal | 7 | 0 (same interface) |
| Card | 51 | 0 (visual only) |
| DataTable | 16 | 0 (additive prop) |
| StatusBadge | 13 | 0 (visual only) |
| JobErrorDetails | 3 | 0 (same interface) |
| JobActions | 3 | 0 (same interface) |
| **Total** | **142** | **0** |

## Verification

- `npm run typecheck` — clean (0 errors)
- `npm run lint` — clean (0 errors, 3 warnings: 2 pre-existing + 1 new from buttonVariants export)
- `npm run build` — successful
- No frozen files modified (`utils.ts`, `constants.ts`, `api/`, `hooks/`, `contexts/`, `pages/`)
- No backend files modified

## Key File Paths

- `frontend/src/components/ui/Button.tsx` — cva-based button with variants
- `frontend/src/components/ui/Modal.tsx` — Dialog wrapper
- `frontend/src/components/ui/WizardModal.tsx` — Dialog-based wizard
- `frontend/src/components/layout/Card.tsx` — border + semantic tokens
- `frontend/src/components/ui/DataTable.tsx` — lucide icons + empty state
- `frontend/src/components/ui/StatusBadge.tsx` — tinted badges
- `frontend/src/components/ui/JobErrorDetails.tsx` — Collapsible + lucide
- `frontend/src/components/ui/JobActions.tsx` — uses new Button
- `frontend/src/main.tsx` — Toaster mounted
