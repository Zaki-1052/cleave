# 2026-03-29 — Favicon Setup

## What was done
- Created `frontend/public/favicon.svg` using the existing `CleaveIcon.tsx` design (DNA double helix with gold enzymatic cleave slash)
- Added a rounded-rect gradient background (sky-blue → teal → gold, matching the app's gradient) so white strokes are visible in browser tabs
- Updated `frontend/index.html` to reference `/favicon.svg` instead of the default Vite logo (`/vite.svg`)
- Created the `frontend/public/` directory (did not previously exist)

## Decisions made
- Used SVG format for the favicon (scalable, no build step needed, supported by all modern browsers)
- Baked the app's gradient background into the favicon since the icon uses white strokes that would be invisible on light browser chrome

## Key file paths
- `frontend/public/favicon.svg` — new favicon
- `frontend/index.html` — updated icon link
- `frontend/src/components/ui/CleaveIcon.tsx` — source design (unchanged)
