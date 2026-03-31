# Phase 5.2 & 5.3: Track Loading + IGV Controls

## Context

Phase 5.1 (completed in `logs/part-5/2026-03-27_phase-5-1-igv-integration.md`) already built the core IGV.js integration — dynamic browser creation, HMAC token auth, Range header serving, track building for both alignment (bigWig) and peak calling (bigWig + BED), reaction selection modal, Save Image, and Full Screen. The backend has full RFC 7233 Range support with 10 tests.

**Key finding: 5.2 and 5.3 are ~90% complete from 5.1.** IGV.js v3.8.0 ships with built-in controls (chromosome dropdown, locus input, zoom slider, Toggle buttons for Track Labels/Crosshairs/Center Line, Save Image) that all default to enabled. The current `igv.createBrowser()` call passes only `{ genome, tracks }`, so all these defaults are already active.

The remaining work is: explicit configuration for safety, removing a duplicate Save Image button, ensuring autoscale Y-axis works, and verification.

## Changes

### 1. Update `igv.createBrowser()` options — `frontend/src/components/igv/IGVPanel.tsx`

Add explicit config to document intent and prevent regressions if IGV.js defaults change:

```typescript
const browser = await igv.createBrowser(containerRef.current, {
  genome,
  tracks,
  showNavigation: true,     // chromosome dropdown, locus input, zoom
  showRuler: true,          // coordinate ruler below ideogram
  showControls: true,       // per-track gear menus
});
```

These are already the defaults — this is purely for clarity/safety.

### 2. Add `autoscale: true` to signal track configs — `IGVPanel.tsx`

The current track config uses `autoscaleGroup: 'signal'` but does not explicitly set `autoscale: true`. Add it to guarantee Y-axis labels appear:

```typescript
tracks.push({
  name: label,
  url,
  type: 'wig',
  format: 'bigwig',
  height: 100,
  autoscale: true,              // ← ADD: ensures Y-axis scale labels render
  autoscaleGroup: 'signal',
  color: TRACK_COLORS[colorIdx % TRACK_COLORS.length],
});
```

### 3. Remove duplicate Save Image button from custom toolbar — `IGVPanel.tsx`

IGV.js already renders its own "Save Image" button in its navbar (via `showSVGButton: true` default). The custom toolbar currently has a second "Save Image" button that does SVG→PNG→download. This creates user confusion with two Save Image buttons.

**Remove:**
- The `downloadBlob()` helper function
- The `handleSaveImage()` function
- The Save Image `<button>` from the toolbar JSX

The custom toolbar retains only Cleave-specific controls that IGV.js doesn't provide: Reference Genome label, Select Reactions button, Refresh, Full Screen.

### 4. No backend changes needed

The backend already has full Range header support (`_range_file_response` in `routers/files.py`), HMAC token auth, and NGINX X-Accel-Redirect fallback. 10 tests cover token generation, auth, and all Range header edge cases.

### 5. No new components or hooks needed

All controls come from IGV.js built-in UI. No custom chromosome dropdown, zoom slider, or toggle buttons needed.

## Files to Modify

| File | Change |
|------|--------|
| `frontend/src/components/igv/IGVPanel.tsx` | Add explicit browser config, add `autoscale: true` to signal tracks, remove duplicate Save Image button + helpers |

That's it — **one file**.

## Verification

After the changes, manually verify in both Alignment and Peak Calling IGV sub-tabs:

| Feature | Action | Expected |
|---------|--------|----------|
| **Chromosome dropdown** | Click dropdown in IGV navbar | Lists all chromosomes for the genome |
| **Locus navigation** | Type a gene name (e.g., "Gapdh") in search input, Enter | View jumps to that gene |
| **Zoom slider** | Drag zoom slider, click +/- buttons | Smooth zoom in/out |
| **Track Labels toggle** | Click "Track Labels" in IGV navbar | Labels toggle on/off |
| **Crosshairs toggle** | Click "Crosshairs" in IGV navbar | Vertical line follows cursor |
| **Center Line toggle** | Click "Center Line" in IGV navbar | Fixed vertical center line |
| **Save Image** | Click IGV's built-in "Save Image" | PNG/SVG download |
| **Y-axis scale** | Load 3+ signal tracks | Y-axis max value visible on left of each track |
| **AutoscaleGroup** | Compare Y-axis across signal tracks | All share same scale range |
| **Peak tracks** | Open peak calling IGV | BED bars below signal tracks with correct format |
| **Per-track gear** | Click gear icon (⚙) on any track | Settings menu (color, scale, display mode) |
| **Range headers** | Check Network tab in DevTools | bigWig requests show 206 Partial Content |
| **Refresh** | Click Refresh in custom toolbar | Browser recreated with fresh tokens |
| **Full Screen** | Click Full Screen | Browser fills viewport |

### Phase 5 Done Criteria Check

- [x] IGV.js renders in both Alignment and Peak Calling tabs — done in 5.1
- [x] Reaction selector loads tracks on demand — done in 5.1
- [x] Signal tracks display RPKM-normalized coverage — data from pipeline; IGV displays it
- [x] Peak calling BED tracks shown as colored bars below signal — done in 5.1
- [x] Navigation, zoom, and image export work — IGV built-in defaults + this cleanup
- [x] Byte-range serving works for large bigWig/BAM files — done in 5.1 + 10 tests
