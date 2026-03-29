# 2026-03-29 — Landing Page Integration & Navbar Polish

## What was done

### Landing Page Integration
- Copied `App3.tsx` (standalone landing page) into `frontend/src/pages/LandingPage.tsx`
- Updated `App.tsx` routing: `/` → LandingPage (public), `/dashboard` → HomePage (authenticated)
- Added "Launch Dashboard" button to landing page nav and hero CTA (react-router `Link`)
- Updated all internal navigation references from `/` to `/dashboard`:
  - `Navbar.tsx` — logo link, "Home" nav link, active state check
  - `Breadcrumbs.tsx` — "Home" breadcrumb link
  - `LoginPage.tsx` — post-login redirect
  - `RegisterPage.tsx` — post-register redirect

### Breadcrumb Light Mode Contrast Fix
- Root cause: `bg-primary/20` background too pale, `text-primary-dark` (#3A8EBF) insufficient contrast
- Fix: `bg-primary/10` in light mode (subtler bg improves contrast), explicit dark mode overrides
- Text colors: `text-gray-700` / `text-gray-400` for light mode, `text-foreground` / `text-muted-foreground` for dark

### Dashboard Navbar Polish
- Fixed height: `py-3` → `h-14` for consistent vertical alignment
- Nav links: `text-sm text-muted-foreground` → `text-[15px] font-semibold text-foreground/70`
- Notification bell: added `p-2 rounded-md` padding to match ThemeToggle sizing
- Bell wrapper: added `flex items-center` for vertical centering
- User dropdown: `text-sm` → `text-[15px] font-medium` with padding
- Added CleaveIcon SVG in gradient square before "Cleave" wordmark

### ThemeToggle Consistency
- Icons: `h-4.5 w-4.5` (non-standard) → `h-5 w-5` (matches bell icon)
- Padding: `p-1.5` → `p-2` (matches bell button)
- Colors: `text-muted-foreground hover:text-foreground` → `text-foreground/60 hover:text-primary`

### Landing Page Nav Polish
- Link text: `text-[13px] text-white/50` → `text-[15px] font-medium text-white/60`
- Cleave wordmark: `text-lg font-semibold` → `text-xl font-bold`
- Button: `px-4 py-1.5 text-xs` → `px-5 py-2 text-sm font-semibold` with glow shadow
- Extracted local `CleaveIcon` to shared component

### Shared CleaveIcon Component
- Created `frontend/src/components/ui/CleaveIcon.tsx` — DNA cleave SVG with brand colors
- Used by both LandingPage and Navbar

### CleaveIcon Redesign (post-session, by Zakir)
- **Problem**: Original icon used blue (#4AAED9) and seafoam (#5EC6A1) backbone strands — identical to the gradient background they sit on, making the helix invisible. Only the white cleave line had contrast.
- **Fix**: Inverted the visual hierarchy — DNA structure (backbones + rungs) is now **white** (high contrast on any bg), and the cleave slash is **gold (#F2C94C)** as the single color accent drawing the eye to the cut action.
- **Design changes**: White backbones at 0.92 opacity, 3 rung pairs (reduced from 4 — cleaner at 22px), gold diagonal slash + gold glow dots at cut endpoints.
- **Rationale**: Gold is the warmest accent in the Cleave palette, contrasts maximally against cool blue/seafoam gradient. The cut becomes the focal point, which is conceptually correct ("Cleave" = "to cut"). Hourglass silhouette reads clearly even at 22px nav size.

## Files created
- `frontend/src/pages/LandingPage.tsx`
- `frontend/src/components/ui/CleaveIcon.tsx`

## Files modified
- `frontend/src/App.tsx` — new route `/` for landing, dashboard at `/dashboard`
- `frontend/src/components/layout/Navbar.tsx` — CleaveIcon, bigger text, alignment fixes
- `frontend/src/components/layout/Breadcrumbs.tsx` — light mode contrast fix
- `frontend/src/components/ui/ThemeToggle.tsx` — consistent sizing
- `frontend/src/pages/LoginPage.tsx` — redirect to `/dashboard`
- `frontend/src/pages/RegisterPage.tsx` — redirect to `/dashboard`

## Decisions made
- Landing page is public (no auth), dashboard requires auth via ProtectedRoute
- CleaveIcon extracted as shared component rather than duplicated
- Navbar uses fixed `h-14` height instead of padding for reliable vertical alignment
- Light mode breadcrumbs use `bg-primary/10` (less opacity = better text contrast)

## Open items
- `App3.tsx` at repo root can be deleted (superseded by `frontend/src/pages/LandingPage.tsx`)
