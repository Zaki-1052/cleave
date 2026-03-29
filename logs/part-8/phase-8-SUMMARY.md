# Phase 8 Summary — UI Overhaul & Dark Mode

> 12 sessions on 2026-03-29. Phase 8 is a comprehensive frontend-only UI improvement initiative. **No backend changes, no new tests, no API changes.** All work is visual polish, component upgrades, and dark mode. ~150+ frontend files modified across 7 passes + supplementary sessions.

---

## What Was Built

### Pass 1: Foundation Infrastructure
Two sessions established the design system underpinning all subsequent work:

**shadcn/ui Integration**:
- Installed 10 shadcn/ui Radix-based primitives: `dialog`, `dropdown-menu`, `tabs`, `tooltip`, `select`, `sonner`, `separator`, `badge`, `collapsible`, `scroll-area`
- Created `cn()` utility (`clsx` + `tailwind-merge`) in `lib/cn.ts` — separate from frozen `utils.ts`
- Added `components.json` shadcn config ("new-york" style, `rsc: false`)

**Typography**:
- Google Fonts: Source Serif 4 (display/headings), Source Sans 3 (body), Source Code Pro (monospace)
- Tailwind font families: `font-display`, `font-body`, `font-mono`

**Tailwind Theme**:
- CSS variable theming in `index.css` (light + dark mode HSL tokens)
- `darkMode: ['class']` enabled
- Semantic color tokens merged with existing `primary`/`status-*`/`accent-*` palette: `background`, `foreground`, `card`, `popover`, `secondary`, `muted`, `destructive`, `border`, `input`, `ring`
- `tailwindcss-animate` plugin + accordion keyframes
- Primary color changed from static hex `#4AAED9` to `hsl(var(--primary))` (identical visual, enables theming)

**Global CSS**:
- Smooth scroll, primary-tinted `::selection`, custom scrollbars via CSS variables
- Off-white background (`#F8F9FA` via `--background`)
- Dark mode gradient variant for `--gradient-bg`

**Dependencies Added** (npm):
- `clsx`, `tailwind-merge`, `tailwindcss-animate`, `class-variance-authority`, `lucide-react`
- Radix UI primitives (pulled in by shadcn components)
- `next-themes` (for dark mode)

### Pass 2: Core UI Components
Rewrote all shared primitives for consistency and accessibility:

- **Button** (`Button.tsx`): Rewritten with CVA (class-variance-authority). Added `loading`, `asChild`, `size` props. `React.forwardRef` for Radix composition. Variant aliases (`primary` → `default`, `outlined` → `outline`) for zero call-site changes across 40 imports. Gradient primary (`from-primary to-accent-teal`), `success` variant (emerald-to-teal). Hover scale `1.02`, active scale `0.98`.
- **Modal** (`Modal.tsx`): Thin wrapper around shadcn Dialog. Gets focus trap, Escape dismiss, entrance/exit animations from Radix. Gradient header (`from-primary to-accent-teal`).
- **WizardModal** (`WizardModal.tsx`): Upgraded to Dialog base. Completed steps show lucide `Check` icon. Free focus trap + keyboard handling + animations.
- **Card** (`Card.tsx`): `bg-white shadow-sm` → `border border-border bg-card`. CVA variants: `default` (shadow) and `interactive` (hover lift + border tint). Semantic tokens for dark mode.
- **DataTable** (`DataTable.tsx`): Unicode `▲`/`▼` → lucide `ChevronUp`/`ChevronDown`/`ChevronsUpDown`. `emptyMessage` prop with `Inbox` icon empty state. `bg-muted/50` header, `tabular-nums`, `select-none` headers.
- **StatusBadge** (`StatusBadge.tsx`): Subtle background tints per status (e.g., `bg-green-50 text-green-700` for complete). Pill shape. `animate-pulse` on running statuses with cyan glow.
- **JobErrorDetails** (`JobErrorDetails.tsx`): Manual expand/collapse → shadcn `Collapsible`. Unicode arrows → lucide `ChevronRight` with rotation transition. `AlertCircle` error icon, `Copy` icon on buttons.
- **JobActions** (`JobActions.tsx`): Inline `<button>` → new `Button` component. `variant="destructive"` for terminate, `variant="outline"` for retry. `loading` prop.
- **Toaster**: Mounted `<Toaster />` from sonner in `main.tsx` for global toast notifications.

**Zero breaking changes**: All 142 import sites across 8 components required 0 call-site modifications.

### Pass 2b: Selectors & Navigation Polish
- **ExperimentView sidebar**: Active tab gets left accent bar (`border-l-2 border-primary`) + `bg-primary/5` tint. All 11 sidebar tabs get lucide icons.
- **Sub-tab treatment**: All 6 experiment tab pages — active sub-tabs get `bg-primary/5 rounded-t-md`.
- **Job selectors**: Replaced native `<select>` with shadcn `<Select>` (Radix) in all 6 experiment tab pages + AnalysisQueuePage filters. `'__all'` sentinel for Radix empty-string workaround.

### Pass 3: Layout & Navigation
- **Navbar** (`Navbar.tsx`): User dropdown → shadcn `DropdownMenu`. Bell SVG → lucide `Bell`. Unicode `▼` → lucide `ChevronDown`. "Cleave" wordmark gets `font-display`. `shadow-sm` → `border-b border-border`. Fixed `h-14` height. Bigger text (`text-[15px] font-semibold`). CleaveIcon SVG added.
- **Breadcrumbs** (`Breadcrumbs.tsx`): HTML entity `>` → lucide `ChevronRight`. Light mode contrast fix (`bg-primary/10`).
- **NewAnalysisDropdown**: 110-line hand-built dropdown → ~65-line shadcn `DropdownMenu`. 6 items each get lucide icons (Dna, Mountain, ArrowLeftRight, Grid3x3, ScatterChart, Scale).
- **ExperimentView**: `font-display` on experiment name. "Run Full Pipeline" raw button → `Button` component. Spinner → `Loader2`.

### Pass 4: Page-Level Polish
- **Auth Pages** (Login, Register, ForgotPassword, ResetPassword): Cleave wordmark branding with CleaveIcon above card. `font-display` headings. `border-white/50` card border for gradient contrast. `drop-shadow` on text for readability. `Button loading` prop replacing disabled/ternary patterns.
- **HomePage**: `font-display` heading. `FolderPlus` empty state. Project card hover lift. `font-mono` on storage sizes. Clock icon "Coming soon" placeholder.
- **ProjectDetailPage**: `font-display` headings. `UserPlus` icon on "Manage Members". Avatar `ring-2 ring-white shadow-sm`.
- **AnalysisQueuePage**: `font-display` heading. lucide Search icon. `font-mono` on dates/durations. lucide pagination icons replacing HTML entities.
- **SettingsPage**: Split into separate Cards per section (Account Information + Email Preferences). shadcn `Select` replacing native dropdown. `max-w-2xl mx-auto` container.

### Pass 5: Feature Components (Systematic Sweep)
Touched **49 feature component files** across all domains with a consistent pattern:

**Icons**: Deleted all remaining inline SVG icon functions and Unicode symbols. Every icon is now a lucide-react import. Zero inline SVGs remain in `components/`.

**Typography**:
- `font-display` on all section headings, card titles, and table column headers using the `uppercase tracking-wide` pattern
- `font-mono` on all numeric data: file sizes, read counts, FRiP scores, percentages, normalization factors, genomic coordinates, Run IDs, methods text blocks, FASTQ prefixes

**Spinners**: All `animate-spin border-*` spinners → lucide `Loader2` (later consolidated into Spinner component in Pass 6).

**Domains covered**: Reactions (4 files), FASTQs (3), Alignment (7), Peak Calling (8), DiffBind (7), Custom Heatmaps (4), Pearson Correlation (4), Normalization (5), IGV (1), AllFiles (1), Auth (1), AutoPipeline (1), Notifications (1), Members (1), BED source (1).

### Pass 5b: Critique Fixes
Post-review audit found and fixed remaining gaps:

- **Cascading primitives**: Added `font-display` to `DetailRow.tsx` label and `Input.tsx` label — cascades to 20+ usage sites each
- **Last Unicode entities**: Replaced `&#10003;` and `&#10007;` in `AutoPipelineBanner.tsx` with lucide `Check`/`X`
- **font-mono on methods text**: Added to AlignmentInfoPanel, PeakCallingInfoPanel, DiffBindInfoPanel
- **font-display sweep**: 115 instances across 35 files — every remaining `uppercase tracking-wide` pattern now has `font-display`

### Pass 6: Motion & Micro-Interactions
- **Spinner component** (`Spinner.tsx`): Reusable component (sm/md/lg sizes). Replaced 43 inline `<Loader2 className="animate-spin">` instances across 35 files.
- **Transition upgrades**: `transition-colors` → `transition-all duration-150` on sidebar tabs and all 6 experiment sub-tab rows. AllFilesTab chevrons use single icon with `rotate-90` transition.
- **Toast notifications**: Added `toast.success()`/`toast.error()` from Sonner to 25 files: project creation, member management, settings save, job actions (terminate/retry), all 6 wizards (job queued), all 6 info panels (notes save), FASTQ/reaction operations.
- **ESLint cleanup**: Removed unused `buttonVariants`/`badgeVariants` exports. Extracted `useBigWigOutputs` hook to its own file.

### Pass 7: Dark Mode
Full dark mode across ~110 TSX files:

- **ThemeToggle** (`ThemeToggle.tsx`): Sun/Moon toggle using `next-themes` `useTheme()`. Added to Navbar.
- **ThemeProvider**: Wraps app tree in `main.tsx` (`attribute="class"`, `defaultTheme="system"`, `storageKey="cleave-theme"`).
- **Semantic mapping applied everywhere**:

| From | To |
|------|----|
| `text-gray-400/500/600` | `text-muted-foreground` |
| `text-gray-700/800/900` | `text-foreground` |
| `bg-white` | `bg-card` |
| `bg-gray-50/100` | `bg-muted` |
| `border-gray-100/200/300` | `border-border` |
| `hover:bg-gray-50/100` | `hover:bg-muted` |
| `divide-gray-*` | `divide-border` |

- **Colored tint banners** (~20 files): All `bg-red-50`, `bg-amber-50`, `bg-blue-50`, `bg-green-50` → added `dark:bg-*-950 dark:text-*-300` variants.
- **StatusBadge**: All 7 status tints get `dark:` variants.
- **Intentionally preserved**: `bg-gray-900` in log viewers (dark code blocks), chart colors (hex), status colors (`text-status-*`).
- **Gradient background**: Already worked — `GradientBackground.tsx` uses `var(--gradient-bg)` which has light/dark variants.

### Landing Page & Routing
- **LandingPage** (`LandingPage.tsx`): Integrated from standalone `App3.tsx`. Public route at `/`.
- **Routing change**: `/` → LandingPage (public), `/dashboard` → HomePage (authenticated). Updated Navbar logo link, Breadcrumbs "Home", Login/Register redirects.
- **CleaveIcon** (`CleaveIcon.tsx`): Shared DNA helix SVG component. White backbones + gold (#F2C94C) cleave slash. Used by both LandingPage nav and Navbar.
- **Landing page nav polish**: Bigger text (`text-[15px] font-medium`), "Launch Dashboard" button with glow shadow.

### EmptyState Component
- **EmptyState** (`EmptyState.tsx`): Reusable dashed-border container with large muted icon, `font-display` title, optional description and action slot.
- Applied to all 6 experiment tabs (Alignment, PeakCalling, DiffBind, CustomHeatmap, Normalization, PearsonCorrelation) with matching sidebar tab icons.
- Applied to HomePage empty project state.

---

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Component library | shadcn/ui (Radix primitives) | Unstyled, composable, no runtime CSS-in-JS. Tailwind-native. |
| Class merging | `cn()` in `lib/cn.ts` | Separate from frozen `utils.ts`. `clsx` + `tailwind-merge`. |
| Button backward compat | CVA variant aliases | `primary` → `default`, `outlined` → `outline`. Zero call-site changes. |
| Dark mode strategy | CSS variables + `darkMode: ['class']` + `next-themes` | System/light/dark with persistent preference via localStorage. |
| Font strategy | Google Fonts (Source Serif/Sans/Code) | Three-tier: serif display, sans body, mono data. |
| Icon library | lucide-react | Tree-shakeable, consistent style, TypeScript-native. |
| Toast library | sonner | Already installed via shadcn. Simple API (`toast.success()`). |
| Modal/Dialog base | shadcn Dialog (Radix) | Free focus trap, Escape dismiss, animations. Modal/WizardModal wrap it. |
| Dropdown base | shadcn DropdownMenu (Radix) | Keyboard nav, animations. Replaced 2 hand-built dropdowns. |
| Select base | shadcn Select (Radix) | Replaced native `<select>` in job selectors + settings. |
| Spinner consolidation | `Spinner.tsx` component | Replaced 43 inline Loader2 instances. sm/md/lg sizes. |
| EmptyState pattern | Shared `EmptyState.tsx` | Dashed border + icon + title. Applied to 7 empty states. |
| Landing page routing | `/` public, `/dashboard` auth | LandingPage is marketing; dashboard requires login. |
| CleaveIcon design | White DNA + gold cleave slash | Contrast on any background. Gold = warmest accent, draws eye to cut. |

---

## Files Created

### New Components (5)
- `frontend/src/components/ui/Spinner.tsx` — Reusable spinner (sm/md/lg)
- `frontend/src/components/ui/EmptyState.tsx` — Shared empty state pattern
- `frontend/src/components/ui/ThemeToggle.tsx` — Sun/Moon dark mode toggle
- `frontend/src/components/ui/CleaveIcon.tsx` — Shared DNA helix brand icon
- `frontend/src/components/ui/useBigWigOutputs.ts` — Extracted hook (ESLint fix)

### New shadcn Primitives (10)
- `frontend/src/components/ui/dialog.tsx`
- `frontend/src/components/ui/dropdown-menu.tsx`
- `frontend/src/components/ui/tabs.tsx`
- `frontend/src/components/ui/tooltip.tsx`
- `frontend/src/components/ui/select.tsx`
- `frontend/src/components/ui/sonner.tsx`
- `frontend/src/components/ui/separator.tsx`
- `frontend/src/components/ui/badge.tsx`
- `frontend/src/components/ui/collapsible.tsx`
- `frontend/src/components/ui/scroll-area.tsx`

### New Infrastructure (2)
- `frontend/src/lib/cn.ts` — Class merging utility
- `frontend/components.json` — shadcn/ui configuration

### New Pages (1)
- `frontend/src/pages/LandingPage.tsx` — Public landing page

---

## Files Significantly Modified

### UI Primitives (Rewritten)
- `frontend/src/components/ui/Button.tsx` — CVA rewrite, forwardRef, loading/asChild/size props
- `frontend/src/components/ui/Modal.tsx` — Rewritten as shadcn Dialog wrapper
- `frontend/src/components/ui/WizardModal.tsx` — Upgraded to Dialog base
- `frontend/src/components/layout/Card.tsx` — CVA variants, semantic tokens
- `frontend/src/components/ui/DataTable.tsx` — lucide icons, empty state, muted header
- `frontend/src/components/ui/StatusBadge.tsx` — Tinted badges, pulse animation, dark variants
- `frontend/src/components/ui/JobErrorDetails.tsx` — shadcn Collapsible, lucide icons
- `frontend/src/components/ui/JobActions.tsx` — Uses new Button variants
- `frontend/src/components/ui/DetailRow.tsx` — font-display label (cascading)
- `frontend/src/components/ui/Input.tsx` — font-display label (cascading)
- `frontend/src/components/ui/StorageGauge.tsx` — font-display + font-mono

### Layout
- `frontend/src/components/layout/Navbar.tsx` — shadcn DropdownMenu, CleaveIcon, fixed height, dark mode
- `frontend/src/components/layout/Breadcrumbs.tsx` — lucide ChevronRight, contrast fix, dark mode
- `frontend/src/components/experiments/NewAnalysisDropdown.tsx` — shadcn DropdownMenu with icons

### Pages (All)
- `frontend/src/pages/LoginPage.tsx` — Branding, CleaveIcon, redirect to `/dashboard`
- `frontend/src/pages/RegisterPage.tsx` — Same pattern
- `frontend/src/pages/ForgotPasswordPage.tsx` — Same + Button loading
- `frontend/src/pages/ResetPasswordPage.tsx` — Same + Button asChild
- `frontend/src/pages/HomePage.tsx` — EmptyState, interactive cards, font-display/mono
- `frontend/src/pages/ProjectDetailPage.tsx` — Icons, avatars, font-display
- `frontend/src/pages/AnalysisQueuePage.tsx` — lucide pagination, shadcn Select filters
- `frontend/src/pages/SettingsPage.tsx` — Split cards, shadcn Select
- `frontend/src/pages/ExperimentView.tsx` — Tab icons, sidebar polish, font-display

### All Experiment Sub-Tabs (~55 files)
Every feature component file across all domains was touched for: lucide icon replacement, font-display on headings, font-mono on numeric data, spinner replacement, dark mode semantic tokens, toast notifications.

### Infrastructure
- `frontend/tailwind.config.js` — Semantic colors, fonts, dark mode, animate plugin
- `frontend/src/index.css` — CSS variable theming, scrollbars, selection highlight
- `frontend/src/main.tsx` — Toaster, ThemeProvider
- `frontend/src/App.tsx` — Landing page route, dashboard route change
- `frontend/package.json` — 5+ new dependencies

---

## Verification

All passes verified with:
- `npm run typecheck` — 0 errors
- `npm run lint` (ESLint) — 0 errors, 0 warnings (cleaned up in Pass 6)
- `npm run build` — successful production build
- No backend files modified
- No frozen files modified (`utils.ts`, `constants.ts`, `api/`, `hooks/`, `contexts/`)
- Zero remaining inline SVGs in `components/`
- Zero remaining border-spinner patterns
- Zero remaining Unicode arrow/symbol characters
- Zero remaining `border-gray-*` in TSX
- Only 2 intentional `text-gray-*` remaining (dark code blocks)

---

## Dependencies Added

| Package | Purpose |
|---------|---------|
| `clsx` | Conditional class composition |
| `tailwind-merge` | Tailwind class deduplication |
| `class-variance-authority` | Component variant management (Button, Card) |
| `tailwindcss-animate` | Tailwind animation utilities for shadcn |
| `lucide-react` | Icon library (replaced all inline SVGs) |
| `next-themes` | Dark mode theme management |
| Radix UI primitives | Dialog, DropdownMenu, Select, Tabs, Tooltip, Collapsible, ScrollArea, Separator (via shadcn) |

---

## What Changed for Consumers

**Button**: Same API. `variant="primary"` still works (alias). New: `loading`, `asChild`, `size` props, `success` variant.

**Modal**: Same `ModalProps` interface (`isOpen`, `onClose`, `title`, `children`, `className`). Now has focus trap + animations.

**WizardModal**: Same interface. Now has focus trap + animations. Completed steps show checkmark icon.

**Card**: Same API. New optional `variant` prop (`"default"` | `"interactive"`). Default unchanged.

**DataTable**: Same API. New optional `emptyMessage` prop.

**Routing**: `/` is now the landing page (public). Dashboard moved to `/dashboard`. All internal nav links updated.

**Dark mode**: Automatic. Respects system preference. Toggle in Navbar. Components use CSS variable tokens.

---

## Known Issues / Open Items

- `App3.tsx` at repo root can be deleted (superseded by `frontend/src/pages/LandingPage.tsx`)
- NotificationPanel left with custom click-outside handler (doesn't fit DropdownMenu pattern due to mark-all-read + click-to-navigate behavior)
- Chart colors (ANNOTATION_COLORS hex, TRACK_COLORS rgb) and status colors remain static hex — not themed
- No backend changes in Phase 8 — all pipeline, API, test, and database code unchanged
