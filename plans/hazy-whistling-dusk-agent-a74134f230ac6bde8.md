# Pass 1 Implementation Plan: Foundation Components + Global CSS

## Overview

Pass 1 targets ~9 shared files whose changes cascade to every page in the Cleave platform. The implementation order is: infrastructure (CSS) first, then leaf components (Dialog, DataTable, StatusBadge), then high-usage components (Card, Button), then composites (Modal, WizardModal), and finally the single consumer fix (ExperimentView).

---

## Step 1: Global CSS polish (1g)

**File**: `frontend/src/index.css`

**Why first**: Pure CSS additions. Zero risk. No component dependencies. Sets the visual baseline for everything else.

**Exact changes**: After the closing `}` of the `@layer base` block (after line 92), append:

```css
/* ── Pass 1g: Global polish ─────────────────────────────── */
html {
  scroll-behavior: smooth;
}

::selection {
  background: hsl(198 65% 57% / 0.3);
}

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

**Notes**:
- The `::selection` color uses the raw primary HSL value (`198 65% 57%`) at 30% opacity -- this matches the `--primary` CSS variable.
- The `scrollbar-color` and `::-webkit-scrollbar-thumb` use `var(--muted-foreground)` so they adapt to dark mode automatically.
- The existing `* { @apply border-border; }` rule inside `@layer base` (line 82-84) already targets `*`. The new `* { scrollbar-width... }` is outside `@layer base`, so it won't conflict -- Tailwind layers and unlayered CSS coexist fine. However, to keep it clean, the scrollbar rules should go outside `@layer base` to avoid specificity issues with Tailwind's layer ordering.

---

## Step 2: Dialog -- Backdrop blur (1e)

**File**: `frontend/src/components/ui/dialog.tsx`

**Why second**: Single class addition. Cascades to Modal and WizardModal automatically. Must be done before Modal/WizardModal changes so we can verify the full stack.

**Exact change** at line 22: In the `DialogOverlay` className string, add `backdrop-blur-sm` after `bg-black/80`.

Current (line 22):
```
"fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in ..."
```

Change to:
```
"fixed inset-0 z-50 bg-black/80 backdrop-blur-sm  data-[state=open]:animate-in ..."
```

**Impact**: Every dialog, modal, and wizard modal in the app will now have a subtle blur behind the overlay. No prop changes needed anywhere.

---

## Step 3: DataTable -- Header contrast + row hover (1d)

**File**: `frontend/src/components/ui/DataTable.tsx`

**Why third**: Pure class string replacements. No structural or prop changes.

**Change A** -- Header row (line 50):

Current:
```tsx
<tr key={headerGroup.id} className="border-b bg-muted/50">
```

Change to:
```tsx
<tr key={headerGroup.id} className="border-b bg-muted dark:bg-muted/80">
```

**Change B** -- Data row hover (line 78):

Current:
```tsx
<tr key={row.id} className="border-b hover:bg-muted/50">
```

Change to:
```tsx
<tr key={row.id} className="border-b hover:bg-muted/80 dark:hover:bg-muted/50">
```

**Change C** -- Empty state icon (line 38):

Current:
```tsx
<Inbox className="mb-2 h-10 w-10" />
```

Change to:
```tsx
<Inbox className="mb-3 h-12 w-12 text-muted-foreground/40" />
```

Also adjust the `py-12` wrapper (line 37) -- no change needed, the py-12 is fine. The `mb-2` changes to `mb-3` for slightly better spacing with the larger icon.

---

## Step 4: StatusBadge -- Dot glow + pulse (1c)

**File**: `frontend/src/components/ui/StatusBadge.tsx`

**Why fourth**: Moderate complexity. Requires conditional logic for active states and glow shadows.

**Design decision**: The glow shadow color must match the dot color. The dot uses Tailwind classes like `bg-status-in-progress`. Tailwind's `shadow-[0_0_6px]` can take arbitrary color, but we cannot reference a Tailwind class inside an arbitrary shadow value. The cleanest approach is a `DOT_GLOW` lookup map that maps statuses to inline shadow style strings using the same hex values from `tailwind.config.js`.

The active statuses that get pulse + glow are: `running` and `in_progress`. Both map to `bg-status-in-progress` which is `#00BCD4`.

**Exact changes**:

Add a new constant after `STATUS_TINTS` (after line 17):

```tsx
const ACTIVE_STATUSES = new Set(['running', 'in_progress']);

const DOT_GLOW: Record<string, string> = {
  new: '0 0 6px #3F51B5',
  queued: '0 0 6px #3F51B5',
  in_progress: '0 0 6px #00BCD4',
  running: '0 0 6px #00BCD4',
  complete: '0 0 6px #4CAF50',
  error: '0 0 6px #B71C1C',
  terminated: '0 0 6px #9E9E9E',
};
```

Then modify the dot `<span>` (line 26) from:

```tsx
<span className={cn('inline-block h-2 w-2 rounded-full', dotColor)} />
```

To:

```tsx
<span
  className={cn(
    'inline-block h-2 w-2 rounded-full',
    dotColor,
    ACTIVE_STATUSES.has(status) && 'animate-pulse',
  )}
  style={DOT_GLOW[status] ? { boxShadow: DOT_GLOW[status] } : undefined}
/>
```

**Why inline style for glow**: Tailwind arbitrary shadow values like `shadow-[0_0_6px_#00BCD4]` work but would need to be dynamic per-status, which means they cannot be in a className lookup (Tailwind needs to see them at build time). Using an inline `style` for `boxShadow` is the cleanest approach that avoids Tailwind safelist complexity.

**Dark mode consideration**: The glow shadow colors are fixed hex values. In dark mode, these glow colors will actually be more visible against the dark background, which is desirable -- they create a subtle luminous effect. No separate dark mode treatment needed.

**Alternative considered**: We could add all glow classes to the Tailwind safelist, but that's more config churn for a minor visual detail. Inline style is simpler.

---

## Step 5: Card -- Shadow system + interactive variant (1a)

**File**: `frontend/src/components/layout/Card.tsx`

**Why fifth**: This is the highest-impact change (52 files). We do it after the simpler changes so those are already validated.

**Exact replacement** -- complete file rewrite:

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

**Backward compatibility analysis**:

1. **`variant` prop is optional** with `defaultVariants` set to `'default'`. All 52 existing usages pass no `variant` prop, so they all get the `default` variant automatically.

2. **`className` prop still works** via `cn(cardVariants({ variant }), className)`. The `cn()` function (which uses `twMerge`) ensures that consumer-provided classes override CVA classes when there's a conflict. For example, `<Card className="border border-transparent">` in HomePage.tsx will correctly override the base `border border-border` from CVA.

3. **The `children` and `className` props remain identical in type**. The only addition is the optional `variant` prop.

4. **Specific concern -- HomePage project cards** (line 51): These currently pass `className="cursor-pointer border border-transparent transition-all duration-150 hover:-translate-y-0.5 hover:border-accent-gold hover:shadow-md"`. With the `default` variant now adding `shadow-sm dark:shadow-none`, these cards will get `shadow-sm` in addition to their hover `hover:shadow-md`. That's fine -- `shadow-sm` gives them a subtle resting elevation, and on hover it jumps to `shadow-md`. The `transition-all` from the className handles the transition. (Note: Pass 3c will later convert these to `variant="interactive"`, but for now the default variant works correctly.)

5. **Auth pages** (Login, Register, ForgotPassword, ResetPassword): These pass `className="w-full max-w-md border border-white/50 dark:border-white/10"`. The `twMerge` in `cn()` will let `border-white/50` override `border-border` from CVA. The `shadow-sm` will be added, which gives auth cards a slight elevation -- this is desirable.

---

## Step 6: Button -- Gradient primary + success variant (1b)

**File**: `frontend/src/components/ui/Button.tsx`

**Why sixth**: Modifies the most visually impactful element. Every primary button in the app changes appearance.

**Change A** -- Base CVA string (line 9): Replace `transition-colors` with `transition-all`.

Current:
```
'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none ...'
```

Change to:
```
'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 focus-visible:outline-none ...'
```

**Why**: `transition-colors` only transitions color properties. We need `transition-all` to support `scale` transforms and `shadow` transitions on the gradient buttons. Adding `duration-200` to the base ensures consistent timing across all variants.

**Change B** -- Update `default` and `primary` variants (lines 13-14):

Current:
```tsx
default: 'bg-primary text-white hover:bg-primary/90',
primary: 'bg-primary text-white hover:bg-primary/90',
```

Change to:
```tsx
default: 'bg-gradient-to-r from-primary to-accent-teal text-white shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98]',
primary: 'bg-gradient-to-r from-primary to-accent-teal text-white shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98]',
```

Note: `transition-all duration-200` is now in the base string, so it doesn't need to be repeated in each variant.

**Change C** -- Add `success` variant after `destructive` (after line 18):

```tsx
success: 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98]',
```

**Change D** -- Update the `ButtonProps` interface. No change needed. The `variant` type is automatically derived from `VariantProps<typeof buttonVariants>`, which will include `'success'` once it's added to the CVA config.

**Dark mode consideration**: The gradient uses `from-primary to-accent-teal`. In dark mode, `--primary` resolves to the same `198 65.3% 57.1%` value, and `accent-teal` is a fixed `#2BBCC4`. The gradient will look good in both modes. The `shadow-sm`/`shadow-md` will be subtle in dark mode (Tailwind shadows are naturally muted on dark backgrounds).

**Risk assessment**: Every primary/default button in the app will now have the gradient treatment. This is intentional -- it matches the landing page's established design language. Non-primary buttons (secondary, outline, ghost, etc.) are unaffected.

---

## Step 7: Modal -- Gradient header (1f, part 1)

**File**: `frontend/src/components/ui/Modal.tsx`

**Exact change** at line 30:

Current:
```tsx
<DialogHeader className="flex shrink-0 flex-row items-center justify-between border-b bg-primary px-6 py-4">
```

Change to:
```tsx
<DialogHeader className="flex shrink-0 flex-row items-center justify-between border-b bg-gradient-to-r from-primary to-accent-teal px-6 py-4">
```

Simple string replacement: `bg-primary` becomes `bg-gradient-to-r from-primary to-accent-teal`.

---

## Step 8: WizardModal -- Gradient header (1f, part 2)

**File**: `frontend/src/components/ui/WizardModal.tsx`

**Exact change** at line 64:

Current:
```tsx
<div className="flex shrink-0 items-center justify-between border-b bg-primary px-6 py-4">
```

Change to:
```tsx
<div className="flex shrink-0 items-center justify-between border-b bg-gradient-to-r from-primary to-accent-teal px-6 py-4">
```

Same string replacement as Modal.

---

## Step 9: ExperimentView -- Use success variant (1b consumer)

**File**: `frontend/src/pages/ExperimentView.tsx`

**Exact change** at lines 107-109:

Current:
```tsx
<Button
  onClick={() => setShowAutoPipelineModal(true)}
  className="bg-green-600 hover:bg-green-700"
>
```

Change to:
```tsx
<Button
  onClick={() => setShowAutoPipelineModal(true)}
  variant="success"
>
```

Remove the `className` prop entirely. The `success` variant from Step 6 provides the correct green gradient styling.

---

## Step 10: Verification

Run:
```bash
cd frontend && npm run typecheck
```

Expected: Clean pass. The only type-level changes are:
1. Card: Added optional `variant` prop (backward compatible).
2. Button: Added `success` to variant union (backward compatible).
3. StatusBadge: Added `style` prop to span (HTML-native, always valid).

**Visual verification checklist**:
- [ ] Open any page -- Cards should have subtle `shadow-sm` elevation (light mode only).
- [ ] Click any primary Button -- should show blue-to-teal gradient with scale animation.
- [ ] Navigate to ExperimentView -- "Run Full Pipeline" button should show green gradient (success variant).
- [ ] View a running/in-progress experiment -- status badge dot should pulse and glow cyan.
- [ ] Open any modal -- overlay should have backdrop blur; header should show gradient.
- [ ] Scroll a long page -- scrollbar should be thin (6px) with subtle thumb.
- [ ] Select text -- should highlight in semi-transparent primary blue.
- [ ] Toggle dark mode -- verify all changes look correct (shadows suppressed, glow visible, scrollbar adapts).

---

## File Change Summary

| Order | File | Type of Change |
|-------|------|---------------|
| 1 | `frontend/src/index.css` | Append CSS rules |
| 2 | `frontend/src/components/ui/dialog.tsx` | Add one class to overlay |
| 3 | `frontend/src/components/ui/DataTable.tsx` | Update 3 class strings |
| 4 | `frontend/src/components/ui/StatusBadge.tsx` | Add glow map + conditional pulse |
| 5 | `frontend/src/components/layout/Card.tsx` | Rewrite with CVA variants |
| 6 | `frontend/src/components/ui/Button.tsx` | Update base + 2 variants + add 1 variant |
| 7 | `frontend/src/components/ui/Modal.tsx` | Replace `bg-primary` with gradient |
| 8 | `frontend/src/components/ui/WizardModal.tsx` | Replace `bg-primary` with gradient |
| 9 | `frontend/src/pages/ExperimentView.tsx` | Replace className with variant="success" |

**Total**: 9 files changed, 0 new files.

---

## Potential Risks and Mitigations

1. **Card shadow on auth pages**: Auth page Cards use `border-white/50` className override. Adding `shadow-sm` via the default variant is fine -- it adds subtle elevation that actually helps auth cards stand out against the gradient background. If undesirable, the consumer can add `shadow-none` via className.

2. **Button gradient on small/icon buttons**: The `hover:scale-[1.02]` on icon-sized buttons (h-10 w-10) will be barely perceptible, which is fine. The gradient will flow through even small buttons since it uses `from-primary to-accent-teal` which are close in hue.

3. **StatusBadge inline style**: Using `style={{ boxShadow }}` is non-standard for this codebase (which heavily uses Tailwind classes). However, it's the pragmatic choice for dynamic color values. The alternative (safelist or CSS custom properties) adds unnecessary complexity.

4. **`transition-all` on Button base**: This changes ALL button variants to transition all properties. For variants like `ghost` or `link` that only change color, this is slightly broader than needed but harmless -- `transition-all` is a superset of `transition-colors`.

5. **DataTable dark mode**: The change from `bg-muted/50` to `bg-muted dark:bg-muted/80` for headers means the header background is more opaque in both modes. This improves contrast and readability.
