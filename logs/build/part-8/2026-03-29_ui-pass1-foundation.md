# UI Improvement Pass 1: Foundation

**Date**: 2026-03-29
**Scope**: Infrastructure only — shadcn/ui, fonts, Tailwind theme, CSS variable theming

## What Was Done

### Modified (4 files)
- **`frontend/index.html`** — Added Google Fonts preconnect + link tags for Source Serif 4 (600, 700), Source Sans 3 (400, 500, 600), Source Code Pro (400, 500)
- **`frontend/src/index.css`** — Added shadcn CSS variable theming (light + dark mode), set `font-body` on body, off-white background (`#F8F9FA` via `--background`), preserved `--gradient-bg` variable, added dark mode gradient variant
- **`frontend/tailwind.config.js`** — Added `darkMode: ['class']`, font families (`display`/`body`/`mono`), shadcn semantic color tokens (`background`, `foreground`, `card`, `popover`, `secondary`, `muted`, `destructive`, `border`, `input`, `ring`, `chart`) merged alongside existing `primary`/`status-*`/`accent-*` colors, `borderRadius` variables, accordion keyframes, `tailwindcss-animate` plugin
- **`frontend/package.json`** — 5 new direct dependencies (clsx, tailwind-merge, tailwindcss-animate, class-variance-authority, lucide-react) + Radix UI primitives pulled in by shadcn components

### Created (12 files)
- **`frontend/src/lib/cn.ts`** — `cn()` class merging utility (clsx + tailwind-merge), kept separate from frozen `utils.ts`
- **`frontend/components.json`** — shadcn/ui config: "new-york" style, `rsc: false`, aliases `utils` to `@/lib/cn`
- **10 shadcn components** in `frontend/src/components/ui/`: `dialog.tsx`, `dropdown-menu.tsx`, `tabs.tsx`, `tooltip.tsx`, `select.tsx`, `sonner.tsx`, `separator.tsx`, `badge.tsx`, `collapsible.tsx`, `scroll-area.tsx`

## Decisions Made

- **`cn()` in separate file**: `utils.ts` is frozen per UI improvement constraints. Created `cn.ts` and configured `components.json` aliases so shadcn-generated components import from `@/lib/cn`
- **Primary color via CSS variable**: Changed `primary.DEFAULT` from static `#4AAED9` to `hsl(var(--primary))` with `--primary: 198 65.3% 57.1%` (exact HSL equivalent). All existing `bg-primary`/`text-primary` render identically. `primary.dark` kept as static hex.
- **Status colors stay static**: `status-*` colors remain hex values — they're semantic, not theming tokens
- **ESM import for tailwindcss-animate**: Used `import tailwindcssAnimate from 'tailwindcss-animate'` instead of `require()` since config is ESM
- **Button excluded from shadcn install**: Deferred to Pass 2 to avoid case-insensitive filesystem collision with existing `Button.tsx` and breaking 38+ import sites
- **sonner.tsx fix**: shadcn generated it with circular self-import and `next-themes` dependency. Replaced with direct `sonner` package import, removed theme detection (will be added in Pass 7 with dark mode toggle)

## Issues Encountered

- **shadcn created files in literal `@/` directory**: The `npx shadcn@latest add` command created files at `frontend/@/components/ui/` instead of resolving the `@` alias to `src/`. Moved files manually and cleaned up the erroneous directory.
- **sonner.tsx circular import + next-themes**: shadcn's sonner template assumes Next.js. Fixed by importing directly from `sonner` package.

## Open Items

- Pass 2 (Core UI Components) is next — replace Button, Modal with shadcn equivalents, upgrade DataTable/WizardModal/StatusBadge, mount Toaster
- Dark mode toggle UI deferred to Pass 7 (CSS variables are ready now)
- `font-display` and `font-mono` classes available but not yet applied to any existing components (Passes 4-5)

## Key File Paths

- `frontend/src/lib/cn.ts` — new utility
- `frontend/components.json` — shadcn config
- `frontend/src/components/ui/{dialog,dropdown-menu,tabs,tooltip,select,sonner,separator,badge,collapsible,scroll-area}.tsx` — new shadcn components
- `frontend/tailwind.config.js` — merged theme
- `frontend/src/index.css` — CSS variable theming

## Verification

- `npm run typecheck` — clean (0 errors)
- `npm run lint` — clean (0 errors, 2 pre-existing warnings)
- `npm run build` — successful
- No frozen files modified (`utils.ts`, `constants.ts`, `api/`, `hooks/`, `contexts/`, `pages/`)
