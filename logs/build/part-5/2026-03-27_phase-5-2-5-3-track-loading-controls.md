# 2026-03-27 — Phase 5.2 & 5.3: Track Loading + IGV Controls

## What Was Done

Phase 5.2 and 5.3 were ~90% complete from Phase 5.1. The remaining work was cleanup and explicit configuration.

### IGVPanel.tsx changes
- **Removed duplicate Save Image button** — IGV.js renders its own via `showSVGButton: true` default; removed custom `downloadBlob()` helper and `handleSaveImage()` function
- **Added `autoscale: true`** to signal track configs — ensures Y-axis scale labels render on each track
- **Added `showNavigation: true`** to `igv.createBrowser()` — explicit documentation of built-in controls (chromosome dropdown, locus input, zoom slider, toggle buttons)
- **Fixed `allReactions` referential instability** — `reactionsData?.items ?? []` created new array every render during loading; wrapped in `useMemo` to stabilize
- **Fixed TS2339 on `createBrowser`/`removeBrowser`** — dynamic `import('igv')` returns module namespace, not default export; changed to `const { default: igv } = await import('igv')`
- **Added `type="button"`** to 3 toolbar buttons
- **Added `aria-label`** to checkboxes in SelectReactionsModal

### Decisions Made
- Use IGV.js built-in controls for all 5.3 requirements (chromosome dropdown, locus input, zoom, toggles) rather than building custom React controls
- Custom toolbar retains only Cleave-specific controls: Reference Genome label, Select Reactions, Refresh, Full Screen

### Key File Paths
- `frontend/src/components/igv/IGVPanel.tsx`
- `frontend/src/components/igv/SelectReactionsModal.tsx`
