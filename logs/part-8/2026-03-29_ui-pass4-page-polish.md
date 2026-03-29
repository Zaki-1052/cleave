# UI Improvement Pass 4: Page-Level Polish

**Date**: 2026-03-29
**Scope**: Auth pages branding, HomePage, ProjectDetailPage, AnalysisQueuePage, SettingsPage

## What Was Done

### Modified (8 files)

- **`frontend/src/pages/LoginPage.tsx`** — Added Cleave wordmark branding (`font-display` serif heading + subtitle) above card, `border border-white/50` on card for gradient contrast, `font-display` on form heading, `flex-col` on centering container
- **`frontend/src/pages/RegisterPage.tsx`** — Same branding pattern as LoginPage
- **`frontend/src/pages/ForgotPasswordPage.tsx`** — Same branding pattern + Button `loading` prop replacing disabled/ternary text pattern
- **`frontend/src/pages/ResetPasswordPage.tsx`** — Same branding pattern + inline-styled success `<Link>` replaced with `<Button asChild>` for component consistency + Button `loading` prop
- **`frontend/src/pages/HomePage.tsx`** — "Not yet implemented" replaced with Clock icon + "Coming soon", `font-display` on heading, Loader2 spinner replacing border spinner, FolderPlus icon empty state, project card hover lift (`hover:-translate-y-0.5 hover:shadow-md transition-all`), `font-mono` on storage sizes
- **`frontend/src/pages/ProjectDetailPage.tsx`** — Loader2 spinner, `font-display` on project name + "Experiments" heading, member avatar `ring-2 ring-white shadow-sm`, UserPlus icon on "Manage Members" link
- **`frontend/src/pages/AnalysisQueuePage.tsx`** — `font-display` on heading, lucide Search replacing inline SVG, Loader2 spinner, `font-mono` on date/duration columns, lucide ChevronsLeft/ChevronLeft/ChevronRight/ChevronsRight replacing HTML entities (`&lsaquo;` etc.) in pagination
- **`frontend/src/pages/SettingsPage.tsx`** — `font-display` on heading, shadcn Separator between form sections, native `<select>` replaced with shadcn Select (SelectTrigger/SelectContent/SelectItem), Button `loading` prop on save button

## Decisions Made

- **Auth page layout**: Added `flex-col` to centering container so wordmark stacks above card (default flex is row)
- **Card border on auth pages**: `border-white/50` intentionally overrides Card's `border-border` via twMerge — gives card definition against the gradient background
- **ResetPasswordPage success link**: Replaced hand-built `rounded-full bg-primary` styled link with `<Button asChild><Link>` for component consistency
- **AnalysisQueuePage filter dropdowns**: Left as native `<select>` elements — they're functional server-side filters, not primary UI controls. Only the SettingsPage notification dropdown was upgraded to shadcn Select since it's a prominent form control.
- **Separator usage**: Added between Settings form sections only — other pages use their own spacing patterns that don't benefit from explicit dividers

## Verification

- `npm run typecheck` — clean (0 errors)
- `npm run lint` — clean (0 errors, 3 pre-existing warnings)
- `npm run build` — successful
- No frozen files modified (`utils.ts`, `constants.ts`, `api/`, `hooks/`, `contexts/`, `pages/` routing, backend/)

## Key File Paths

- `frontend/src/pages/LoginPage.tsx` — wordmark + card border + font-display
- `frontend/src/pages/RegisterPage.tsx` — same pattern
- `frontend/src/pages/ForgotPasswordPage.tsx` — same + Button loading
- `frontend/src/pages/ResetPasswordPage.tsx` — same + Button asChild + loading
- `frontend/src/pages/HomePage.tsx` — Clock placeholder + FolderPlus empty state + hover lift
- `frontend/src/pages/ProjectDetailPage.tsx` — UserPlus icon + avatar ring
- `frontend/src/pages/AnalysisQueuePage.tsx` — lucide pagination + Search + font-mono data
- `frontend/src/pages/SettingsPage.tsx` — shadcn Select + Separator
