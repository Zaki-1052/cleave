# 2026-03-30 — Documentation Section Added to Website

## What was done

- Added a public `/docs` route with 17 documentation pages derived from `docs/cleave-user-guide.md`
- Built a dedicated `DocsLayout` with simplified navbar (no auth dependency) + collapsible sidebar mirroring the ExperimentView pattern
- Content stored as structured TypeScript data (2,506 lines) with shared renderer components (tables, callouts, step lists, code blocks)
- Added `BookOpen` icon link in the authenticated Navbar between notifications and theme toggle
- Added "Docs" link to the LandingPage fixed navbar alongside Pipeline/Features/Compare/Architecture
- Mobile responsive: hamburger menu opens sidebar as full-height overlay

## Files created (14)

- `frontend/src/lib/docs-navigation.ts` — Nav structure (5 groups, 17 items)
- `frontend/src/lib/docs-content.ts` — All page content as structured TS objects
- `frontend/src/components/docs/DocsLayout.tsx` — Layout with GradientBackground + sidebar + outlet
- `frontend/src/components/docs/DocsNavbar.tsx` — Simplified public navbar
- `frontend/src/components/docs/DocsSidebar.tsx` — Collapsible sidebar with active indicators
- `frontend/src/components/docs/DocsPageRenderer.tsx` — Content block dispatcher
- `frontend/src/components/docs/DocTable.tsx`, `DocCallout.tsx`, `DocStepList.tsx`, `DocCodeBlock.tsx`, `DocPrevNext.tsx`
- `frontend/src/pages/docs/DocsLandingPage.tsx` — Card grid landing page
- `frontend/src/pages/docs/DocsPage.tsx` — Generic slug-based page

## Files modified (3)

- `frontend/src/App.tsx` — Added `/docs` route group (public)
- `frontend/src/components/layout/Navbar.tsx` — Added BookOpen docs icon link
- `frontend/src/pages/LandingPage.tsx` — Added "Docs" nav link

## Decisions made

- Content as hardcoded TS data (no markdown parser dependency) — keeps bundle lean and content easily editable
- Public routes (no auth) — docs accessible without login, like the landing page
- Single generic `DocsPage` component with slug-based content lookup — avoids 17 separate page files
- No search feature — unnecessary for 8-10 lab users browsing 17 pages

## Open items

- None — feature is complete and builds cleanly
