# Pass 1: Foundation Components + Global CSS

## Context

Cleave has completed a 7-pass UI improvement (shadcn/ui, fonts, icons, dark mode, motion). This pass targets **shared foundation components** for maximum cascade — changes to these ~9 files propagate to every page automatically.

The UI-POLISH-TODO.md defines 3 focused passes to bridge the gap between the dashboard pages (functional but flat) and the landing page (the gold standard). This plan covers Pass 1 only.

**Constraints**: No backend/api/hooks/contexts/constants changes. CSS-only animations. `npm run typecheck` after each step.

---

## Files Modified (9 total, in dependency order)

1. `frontend/src/index.css` — Global CSS polish
2. `frontend/src/components/ui/dialog.tsx` — Backdrop blur
3. `frontend/src/components/ui/DataTable.tsx` — Header contrast + row hover + empty state
4. `frontend/src/components/ui/StatusBadge.tsx` — Dot glow + pulse
5. `frontend/src/components/layout/Card.tsx` — Shadow system + interactive variant
6. `frontend/src/components/ui/Button.tsx` — Gradient primary + success variant
7. `frontend/src/components/ui/Modal.tsx` — Gradient header
8. `frontend/src/components/ui/WizardModal.tsx` — Gradient header
9. `frontend/src/pages/ExperimentView.tsx` — Use success variant (consumer)

---

## Step 1: Global CSS Polish (`index.css`)

**Append after the closing `}` of `@layer base` (after line 92):**

```css
/* Global polish */
html {
  scroll-behavior: smooth;
}

::selection {
  background: hsl(198 65% 57% / 0.3);
}

/* Thin custom scrollbars */
* {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--muted-foreground) / 0.3) transparent;
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground) / 0.25);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground) / 0.4);
}
```

**Rationale**: All additive. Uses CSS variables so scrollbar adapts to dark mode. Selection color matches `--primary` at 30% opacity.

---

## Step 2: Dialog Backdrop Blur (`dialog.tsx`)

**Line 22 — Add `backdrop-blur-sm` to the overlay class string:**

```
OLD: "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in ..."
NEW: "fixed inset-0 z-50 bg-black/80 backdrop-blur-sm  data-[state=open]:animate-in ..."
```

**Impact**: Cascades to every Modal, WizardModal, and Dialog consumer automatically.

---

## Step 3: DataTable Polish (`DataTable.tsx`)

Three targeted class string changes:

**3a. Header row (line 50):**
```
OLD: className="border-b bg-muted/50"
NEW: className="border-b bg-muted dark:bg-muted/80"
```

**3b. Data row (line 78):**
```
OLD: className="border-b hover:bg-muted/50"
NEW: className="border-b hover:bg-muted/80 dark:hover:bg-muted/50"
```

**3c. Empty state icon (line 38):**
```
OLD: <Inbox className="mb-2 h-10 w-10" />
NEW: <Inbox className="mb-3 h-12 w-12 text-muted-foreground/40" />
```

---

## Step 4: StatusBadge Glow + Pulse (`StatusBadge.tsx`)

Add active state detection and glow effect:

**Add after `STATUS_TINTS` (after line 17):**
```tsx
const ACTIVE_STATUSES = new Set(['running', 'in_progress']);

const DOT_GLOW: Record<string, string> = {
  running: '0 0 6px #00BCD4',
  in_progress: '0 0 6px #00BCD4',
};
```

**Modify the dot span (line 26):**
```tsx
OLD:
<span className={cn('inline-block h-2 w-2 rounded-full', dotColor)} />

NEW:
<span
  className={cn(
    'inline-block h-2 w-2 rounded-full',
    dotColor,
    ACTIVE_STATUSES.has(status) && 'animate-pulse',
  )}
  style={DOT_GLOW[status] ? { boxShadow: DOT_GLOW[status] } : undefined}
/>
```

**Rationale**:
- `animate-pulse` for running/in_progress only (not completed/error/etc.)
- Inline `style` for glow because Tailwind arbitrary shadow values can't be dynamically composed from a runtime lookup
- `#00BCD4` matches `status.in-progress` from `tailwind.config.js`

---

## Step 5: Card Shadow System + Interactive Variant (`Card.tsx`)

**Full rewrite** — add CVA with two variants. All 52 existing usages get subtle elevation automatically (default variant).

```tsx
// frontend/src/components/layout/Card.tsx
import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const cardVariants = cva(
  'rounded-lg border border-border bg-card p-6',
  {
    variants: {
      variant: {
        default: 'shadow-sm dark:shadow-none',
        interactive:
          'shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-primary/20 transition-all duration-200 dark:shadow-none dark:hover:border-primary/30',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

interface CardProps extends VariantProps<typeof cardVariants> {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className, variant }: CardProps) {
  return (
    <div className={cn(cardVariants({ variant }), className)}>
      {children}
    </div>
  );
}
```

**Key decisions**:
- `variant` prop is optional → defaults to `'default'` → all 52 existing usages get `shadow-sm` with zero changes
- `cn(cardVariants({ variant }), className)` ensures consumer `className` overrides win via tailwind-merge
- `CardProps` extends `VariantProps<typeof cardVariants>` so `variant` is properly typed
- Existing `children` and `className` props preserved exactly

**Note for Pass 3**: `HomePage.tsx` project cards will switch to `<Card variant="interactive">` and remove their inline hover classes. That's a Pass 3 item — not done here.

---

## Step 6: Button Gradient Primary + Success Variant (`Button.tsx`)

Three changes to the CVA definition:

**6a. Base string (line 9) — change `transition-colors` to `transition-all duration-200`:**
```
OLD: '...transition-colors focus-visible:outline-none...'
NEW: '...transition-all duration-200 focus-visible:outline-none...'
```

**6b. `default` and `primary` variants (lines 13-14) — gradient + scale:**
```
OLD:
default: 'bg-primary text-white hover:bg-primary/90',
primary: 'bg-primary text-white hover:bg-primary/90',

NEW:
default:
  'bg-gradient-to-r from-primary to-accent-teal text-white shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98]',
primary:
  'bg-gradient-to-r from-primary to-accent-teal text-white shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98]',
```

**6c. Add `success` variant after `link` (after line 20):**
```tsx
success:
  'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98]',
```

**Impact**: All primary buttons across the app get the gradient + micro-interaction. The gradient flows from the existing `primary` (#4AAED9) to `accent-teal` (#2BBCC4) — a subtle but noticeable transition. `accent-teal` is already defined in `tailwind.config.js` and used on the landing page/navbar.

---

## Step 7: Modal Gradient Header (`Modal.tsx`)

**Line 30 — replace `bg-primary` with gradient:**
```
OLD: className="flex shrink-0 flex-row items-center justify-between border-b bg-primary px-6 py-4"
NEW: className="flex shrink-0 flex-row items-center justify-between border-b bg-gradient-to-r from-primary to-accent-teal px-6 py-4"
```

---

## Step 8: WizardModal Gradient Header (`WizardModal.tsx`)

**Line 64 — replace `bg-primary` with gradient:**
```
OLD: className="flex shrink-0 items-center justify-between border-b bg-primary px-6 py-4"
NEW: className="flex shrink-0 items-center justify-between border-b bg-gradient-to-r from-primary to-accent-teal px-6 py-4"
```

---

## Step 9: ExperimentView Success Button Consumer (`ExperimentView.tsx`)

**Lines 106-111 — use the new `success` variant:**
```tsx
OLD:
<Button
  onClick={() => setShowAutoPipelineModal(true)}
  className="bg-green-600 hover:bg-green-700"
>
  Run Full Pipeline
</Button>

NEW:
<Button
  variant="success"
  onClick={() => setShowAutoPipelineModal(true)}
>
  Run Full Pipeline
</Button>
```

---

## Verification

After all 9 steps:
- [ ] `npm run typecheck` passes
- [ ] Card shadows visible on all pages (subtle elevation in light mode)
- [ ] Gradient buttons render correctly (primary blue → teal gradient)
- [ ] Success button on ExperimentView renders emerald → teal gradient
- [ ] Running/in_progress badges pulse with glow
- [ ] Modals have backdrop blur + gradient header
- [ ] Custom scrollbars visible in Chrome/Safari
- [ ] Selection highlight is primary-tinted
- [ ] Dark mode: shadows suppressed, badge glow still visible, scrollbar adapts
- [ ] `npm run build` succeeds
