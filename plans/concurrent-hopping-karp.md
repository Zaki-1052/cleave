# Pass 2: Core UI Components — Implementation Plan

## Context

Pass 1 (Foundation) is complete: shadcn/ui initialized, Google Fonts loaded (Source family), Tailwind theme extended with `font-display`/`font-body`/`font-mono`, CSS variable theming for light+dark, 10 shadcn components installed. No page-level components were touched.

Pass 2 upgrades the shared UI primitives that appear on every page — Button, Modal, WizardModal, DataTable, Card, StatusBadge, JobErrorDetails, JobActions — and mounts the Toast system. The goal is to replace hand-built components with shadcn equivalents where superior, and polish the rest with lucide icons + consistent styling.

**Why**: The current primitives use Unicode characters for icons (`✕`, `▲`, `▼`, `▸`, `▾`), lack focus traps in modals, have no loading states on buttons, no empty states in tables, and no entrance animations. Upgrading these shared components propagates improvements to every page automatically.

---

## Implementation Steps

### Step 1: Button.tsx — Rewrite in-place with cva

**File**: `frontend/src/components/ui/Button.tsx` (40 import sites)

**Strategy**: Rewrite contents with shadcn-style cva implementation. Keep filename `Button.tsx` (PascalCase) so all 40 import paths remain valid. Do NOT run `npx shadcn add button` — the macOS case-insensitive filesystem treats `Button.tsx` and `button.tsx` as the same file.

**Variant mapping** (backward-compatible aliases):
| Existing usage | Count | Maps to cva variant |
|---|---|---|
| `variant="primary"` | ~5 sites | `primary` alias (same styles as `default`) |
| `variant="outlined"` | ~32 sites | `outlined` alias (same styles as `outline`) |
| `variant="secondary"` | ~1 site | `secondary` (same name) |
| no variant prop | ~2 sites | `default` (primary look) |

New variants available for future use: `destructive`, `ghost`, `link`.

**New features**:
- `loading?: boolean` — shows `<Loader2 className="animate-spin" />` and disables button
- `asChild?: boolean` — renders via Radix `<Slot>` for composition (e.g., `<Button asChild><Link>`)
- `size` — `default` (h-10 px-4 py-2), `sm` (h-9 px-3), `lg` (h-11 px-8), `icon` (h-10 w-10)
- `rounded-md` replaces `rounded-full` (pill → subtle radius per "Scientific Clarity" direction)
- Proper focus ring via `focus-visible:ring-2 focus-visible:ring-ring`
- `disabled:pointer-events-none disabled:opacity-50`

**Exports**: Named `Button` + `buttonVariants` (for external use).

**Dependencies**: `class-variance-authority` (installed), `@radix-ui/react-slot` (installed as dep of dialog), `lucide-react` (installed), `@/lib/cn`.

**Zero call-site changes required.**

---

### Step 2: Modal.tsx — Rewrite as shadcn Dialog wrapper

**File**: `frontend/src/components/ui/Modal.tsx` (9 import sites)

**Strategy**: Replace contents with a thin wrapper around shadcn `Dialog` that preserves the exact `ModalProps` interface: `{ isOpen, onClose, title, children, className? }`.

**Key design decisions**:
- `DialogContent` uses `p-0 gap-0 overflow-hidden` so the bg-primary header goes edge-to-edge
- Header: `<DialogHeader className="... bg-primary px-6 py-4">` with white title text
- Body: `<div className="overflow-y-auto p-6">{children}</div>`
- Close button: Dialog's built-in lucide `X` icon (replaces Unicode `✕`). Style with `[&>button]:text-white [&>button]:hover:opacity-100` on DialogContent so the X is visible on the primary header
- `DialogDescription` with `sr-only` for accessibility (screen readers)
- Focus trap, Escape dismiss, entrance/exit animations come free from Radix

**The `className` prop** currently used for width control (e.g., `className="max-w-4xl"`) merges onto `DialogContent` via `cn()`. Default: `max-w-2xl`.

**Zero call-site changes required.**

---

### Step 3: WizardModal.tsx — Upgrade to use Dialog base

**File**: `frontend/src/components/ui/WizardModal.tsx` (7 import sites)

**Strategy**: Replace the manual overlay/backdrop with shadcn `Dialog` as the outer shell. Keep all step-indicator logic, footer, and content area untouched.

**Changes**:
- Remove `if (!isOpen) return null;` guard (Dialog handles visibility)
- Remove manual `<div className="fixed inset-0 z-50">` and backdrop div
- Wrap in `<Dialog open={isOpen} onOpenChange={...}>` → `<DialogContent>`
- `DialogContent` className: `p-0 gap-0 h-[80vh] ${maxWidth} overflow-hidden`
- Remove the manual close `✕` button (Dialog's built-in X replaces it)
- Style Dialog close button white: `[&>button]:text-white [&>button]:hover:opacity-100`
- **Completed steps**: Replace number with `<Check className="h-4 w-4" />` from lucide inside the green circle
- Import `Check` from `lucide-react`
- Continue importing `Button` from `./Button` (already upgraded in Step 1)

**Preserved exactly**: `WizardStep`, `FooterRenderArgs`, `WizardModalProps` interfaces. The `renderFooter` callback pattern. The step indicator visual logic. The default footer with Cancel/Back/Next/Submit.

**Zero call-site changes required.**

---

### Step 4: Card.tsx — Add border, use semantic tokens

**File**: `frontend/src/components/layout/Card.tsx` (51 import sites)

**Strategy**: Minimal upgrade — add border, swap to semantic color tokens for dark mode readiness.

**Changes**:
- Current: `rounded-lg bg-white p-6 shadow-sm`
- New: `rounded-lg border border-border bg-card p-6`
- Import `cn` from `@/lib/cn` and merge with `className` prop
- Borders for inline containers (cards), shadows reserved for floating elements (modals, dropdowns) — per "Scientific Clarity" direction
- `bg-card` = white in light mode, dark surface in dark mode (via CSS variables from Pass 1)
- `border-border` = gray-200 in light, gray-700 in dark

**Zero call-site changes required.** Visual-only change.

---

### Step 5: DataTable.tsx — Lucide icons + empty state

**File**: `frontend/src/components/ui/DataTable.tsx` (16 import sites)

**Strategy**: Replace Unicode sort arrows with lucide icons, add empty state.

**Changes**:
- Import `ChevronUp`, `ChevronDown`, `ChevronsUpDown`, `Inbox` from `lucide-react`
- Sort indicators:
  - `▲` → `<ChevronUp className="ml-1 inline h-3.5 w-3.5" />`
  - `▼` → `<ChevronDown className="ml-1 inline h-3.5 w-3.5" />`
  - Unsorted sortable → `<ChevronsUpDown className="ml-1 inline h-3.5 w-3.5 text-muted-foreground" />`
- New optional prop: `emptyMessage?: string` (default `"No data"`)
- When `data.length === 0`: render centered empty state with `<Inbox className="mb-2 h-10 w-10" />` + message text
- Header cell: add `select-none` to prevent text selection on click-to-sort
- Table element: add `tabular-nums` for consistent number alignment

**Props change**: `DataTableProps<T>` gains optional `emptyMessage?: string`. Additive only.

---

### Step 6: StatusBadge.tsx — Background tint upgrade

**File**: `frontend/src/components/ui/StatusBadge.tsx` (13 import sites)

**Strategy**: Add a subtle colored background tint behind the status text+dot, making statuses scannable at a glance.

**Changes**:
- Add a `STATUS_TINTS` mapping: `{ new: 'bg-blue-50 text-blue-700', complete: 'bg-green-50 text-green-700', error: 'bg-red-50 text-red-700', ... }`
- Outer container: `inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium` + tint colors
- Reduce dot size: `h-2 w-2` (from `h-2.5 w-2.5`)
- Import `cn` from `@/lib/cn`
- Continue using `STATUS_COLORS` and `STATUS_LABELS` from `@/lib/constants` (frozen, not modified)

**Zero call-site changes required.** Visual-only.

---

### Step 7: JobErrorDetails.tsx — shadcn Collapsible + lucide icons

**File**: `frontend/src/components/ui/JobErrorDetails.tsx` (3 import sites)

**Strategy**: Replace manual expand/collapse with shadcn `Collapsible` and Unicode arrows with lucide icons.

**Changes**:
- Import `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` from `./collapsible`
- Import `ChevronRight`, `AlertCircle` from `lucide-react`
- Import `cn` from `@/lib/cn`
- Error message toggle: `<CollapsibleTrigger>` with `<ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />`
- Log toggle: same pattern with `Collapsible`
- Replace inline error dot with `<AlertCircle className="h-4 w-4 text-red-500 shrink-0" />`

**Default export and Props interface preserved exactly.**

---

### Step 8: JobActions.tsx — Use new Button component

**File**: `frontend/src/components/ui/JobActions.tsx` (3 import sites)

**Strategy**: Replace inline-styled `<button>` elements with the upgraded `<Button>` component.

**Changes**:
- Import `Button` from `./Button`
- Terminate: `<Button variant="destructive" size="sm" loading={terminateMutation.isPending} ...>`
- Retry: `<Button variant="outline" size="sm" loading={retryMutation.isPending} ...>`
- Remove inline `rounded-full border border-red-300 px-3 py-1 text-xs` styles

**Default export and Props interface preserved exactly.**

---

### Step 9: Mount Toaster in main.tsx

**File**: `frontend/src/main.tsx`

**Strategy**: Add `<Toaster />` from sonner as a sibling of `<App />` inside the providers.

**Changes**:
- Import `Toaster` from `@/components/ui/sonner`
- Add `<Toaster />` after `<App />` inside `<AuthProvider>`
- Pure addition — no existing code uses toasts yet
- Future passes (Pass 6) will add `toast.success()` / `toast.error()` calls to mutation callbacks

---

## Implementation Order + Verification Checkpoints

| Order | File | Action | Risk | Verify |
|-------|------|--------|------|--------|
| 1 | `ui/Button.tsx` | Rewrite with cva | Low | typecheck |
| 2 | `ui/Modal.tsx` | Rewrite as Dialog wrapper | Low | typecheck |
| 3 | `ui/WizardModal.tsx` | Upgrade to Dialog base | Low | typecheck |
| 4 | `layout/Card.tsx` | Add border + semantic tokens | Minimal | typecheck |
| 5 | `ui/DataTable.tsx` | Lucide icons + empty state | Low | typecheck |
| 6 | `ui/StatusBadge.tsx` | Background tint | Minimal | typecheck |
| 7 | `ui/JobErrorDetails.tsx` | Collapsible + lucide | Low | typecheck |
| 8 | `ui/JobActions.tsx` | Use new Button | Low | typecheck |
| 9 | `main.tsx` | Mount Toaster | None | typecheck |
| 10 | — | Final verification | — | typecheck + lint + build |

Run `npm run typecheck` after steps 1, 3, 6, 9, and 10. Run `npm run lint` and `npm run build` at step 10.

---

## Files Modified (9 total)

| File | Action |
|------|--------|
| `frontend/src/components/ui/Button.tsx` | Rewrite |
| `frontend/src/components/ui/Modal.tsx` | Rewrite |
| `frontend/src/components/ui/WizardModal.tsx` | Upgrade |
| `frontend/src/components/layout/Card.tsx` | Upgrade |
| `frontend/src/components/ui/DataTable.tsx` | Upgrade |
| `frontend/src/components/ui/StatusBadge.tsx` | Upgrade |
| `frontend/src/components/ui/JobErrorDetails.tsx` | Upgrade |
| `frontend/src/components/ui/JobActions.tsx` | Upgrade |
| `frontend/src/main.tsx` | Add Toaster |

## Files NOT Modified

- No backend files
- No API/hooks/contexts/constants/utils files
- No page-level components (those are Pass 3-5)
- No shadcn component files (dialog.tsx, badge.tsx, collapsible.tsx, sonner.tsx stay as-is)
- No call sites — all 142 import sites continue working unchanged

## Key Risks + Mitigations

1. **Button variant compatibility**: cva accepts `primary` and `outlined` as aliases → zero call-site changes
2. **Modal header on Dialog**: `p-0 gap-0` on DialogContent + per-section padding → header goes edge-to-edge
3. **Dialog close button color on primary header**: `[&>button]:text-white` override on DialogContent
4. **WizardModal height in Dialog**: Pass `h-[80vh]` in DialogContent className
5. **Card visual change (shadow→border)**: Subtle, acceptable — borders are more "Scientific Clarity"
