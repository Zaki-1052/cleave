# Phase 5.1 — IGV.js Integration Plan

## Context

Phases 1-4 are complete (auth, CRUD, FASTQ upload, alignment, peak calling). Both `AlignmentTab.tsx` and `PeakCallingTab.tsx` have IGV sub-tab placeholders. This plan adds an embedded IGV.js genome browser so users can select reactions, view smoothed bigWig signal tracks, and (for peak calling) overlay BED peak tracks — matching the CUTANA Cloud UI spec (`cutana-cloud-ui.md` §6f-v).

**Key technical challenge**: IGV.js makes its own HTTP requests (not through Axios), requiring Range header support for bigWig files and token-based auth that can be passed as URL query parameters.

---

## Files to Create

| File | Purpose |
|------|---------|
| `frontend/src/components/igv/IGVPanel.tsx` | Core reusable IGV.js browser panel (used in both tabs) |
| `frontend/src/components/igv/SelectReactionsModal.tsx` | Modal with checkbox table for picking reactions to visualize |
| `frontend/src/hooks/useIGVTracks.ts` | TanStack Query hook for fetching signed IGV file URLs |
| `frontend/src/types/igv.d.ts` | TypeScript type declarations for the `igv` npm package |

## Files to Modify

| File | Change |
|------|--------|
| `frontend/package.json` | Add `igv` npm dependency |
| `frontend/src/api/files.ts` | Add `getIGVTokens()` API function |
| `frontend/src/pages/experiment/AlignmentTab.tsx` | Replace IGV placeholder with `<IGVPanel mode="alignment">` |
| `frontend/src/pages/experiment/PeakCallingTab.tsx` | Replace IGV placeholder with `<IGVPanel mode="peak_calling">` |
| `backend/routers/files.py` | Add `GET /files/igv-serve` (Range-aware) and `POST /files/igv-tokens` endpoints |
| `backend/schemas/file.py` | Add `IGVTokenRequest` and `IGVTokenResponse` schemas |
| `backend/config.py` | Add `IGV_TOKEN_EXPIRY_SECONDS` setting |
| `backend/tests/test_files.py` | Add tests for Range header parsing, IGV token endpoints |

---

## Step 1: Backend — Range-Aware IGV File Serving

### 1a. Config (`backend/config.py`)
Add `IGV_TOKEN_EXPIRY_SECONDS: int = 3600` (60 min, longer than the 5-min download tokens since IGV sessions are interactive).

### 1b. Schemas (`backend/schemas/file.py`)
Add two schemas following the existing `CamelModel` pattern:
- `IGVTokenRequest(CamelModel)`: `job_id: int`, `output_ids: list[int]`
- `IGVTokenResponse(CamelModel)`: `tokens: dict[int, str]` (maps output_id → signed URL)

### 1c. Batch Token Endpoint (`backend/routers/files.py`)
`POST /api/v1/files/igv-tokens` — JWT-authenticated endpoint that:
1. Accepts `IGVTokenRequest` body
2. Verifies the user is a project member via existing join pattern (JobOutput → AnalysisJob → Experiment → ProjectMember)
3. Generates one HMAC signed token per output ID with payload `{"type": "igv", "job_id": N, "output_id": N}`
4. Uses `IGV_TOKEN_EXPIRY_SECONDS` (60 min) for expiry
5. Returns `IGVTokenResponse` with `tokens` mapping each output_id to `/api/v1/files/igv-serve?token=...`

Reuses existing `create_download_token()` from `services/download_token_service.py`.

### 1d. Range-Aware Serve Endpoint (`backend/routers/files.py`)
`GET /api/v1/files/igv-serve` — **No JWT required** (token-authenticated):
1. Verify HMAC token via `verify_download_token()`
2. Resolve file path: look up `job_outputs` by `output_id` from token payload, resolve absolute path
3. Path traversal guard (same pattern as `download_job_file`)
4. If `NGINX_FILE_SERVING=True`: return `X-Accel-Redirect` response (NGINX handles Range natively)
5. If dev mode: parse `Range` header and serve bytes via helper `_range_file_response()`:

**Range header handling (RFC 7233 compliant):**
- **No Range header**: Return full file as `200 OK` with `Accept-Ranges: bytes` and `Content-Length`
- **Valid Range** (`bytes=start-end`): Return `206 Partial Content` with `Content-Range: bytes start-end/total`, `Accept-Ranges: bytes`, `Content-Length: end-start+1`, via `StreamingResponse` that seeks to `start` and reads only the requested range
- **Range start > file size**: Return `416 Range Not Satisfiable` with `Content-Range: bytes */total` header per RFC 7233
- **Range start > end**: Return `416 Range Not Satisfiable`
- **Malformed Range header** (not parseable): Ignore and return full file as `200 OK`
- **Open-ended Range** (`bytes=start-`): Serve from `start` to end of file

Also add `Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges` for cross-origin compatibility.

Helper function `_range_file_response(abs_path: Path, range_header: str | None)` encapsulates the Range parsing and response building.

---

## Step 2: Frontend — Install igv.js + Types

### 2a. Install package
```bash
cd frontend && npm install igv
```

### 2b. Type declarations (`frontend/src/types/igv.d.ts`)
Declare the subset of the `igv` module API actually used:
- `igv.createBrowser(container, options): Promise<Browser>`
- `igv.removeBrowser(browser): void`
- `Browser.toSVG(): string`
- `BrowserOptions`: genome, tracks, showControls
- `TrackConfig`: name, url, type, format, color, height, displayMode, autoscaleGroup, indexURL

---

## Step 3: Frontend — API + Hook Layer

### 3a. API function (`frontend/src/api/files.ts`)
Add `getIGVTokens(jobId: number, outputIds: number[]): Promise<Record<number, string>>`:
- POST to `/files/igv-tokens` with `{ jobId, outputIds }`
- Returns the `tokens` mapping

### 3b. Hook (`frontend/src/hooks/useIGVTracks.ts`)
`useIGVTracks(jobId: number | null, outputIds: number[])`:
- Uses `useQuery` with `queryKey: ['igv-tokens', jobId, ...outputIds.sort()]`
- `enabled: jobId !== null && outputIds.length > 0` (lazy loading — no fetch until reactions selected)
- `refetchInterval: 50 * 60 * 1000` (50 min) — actively refetches tokens on a timer regardless of user activity, giving a 10-min buffer before the 60-min expiry. This prevents silent track failures during long browsing sessions where no React re-renders trigger.
- `staleTime: 45 * 60 * 1000` (45 min) — also set to avoid unnecessary refetches on component re-renders within the first 45 minutes
- Returns `{ data: Record<number, string> | undefined, isLoading, refetch }`

**Token refresh → browser recreation**: When `useIGVTracks` returns new token data (detected via a `useEffect` comparing previous vs current token values), the IGV browser must be destroyed and recreated with the new signed URLs. This is handled in the `IGVPanel` effect that manages the browser lifecycle.

---

## Step 4: Frontend — SelectReactionsModal

`frontend/src/components/igv/SelectReactionsModal.tsx`

Follows the `ChooseReactionsStep.tsx` checkbox pattern inside the existing `Modal` component:
- Props: `isOpen`, `onClose`, `reactions: Reaction[]`, `selectedIds: Set<number>`, `onApply(ids: Set<number>)`
- Checkbox table columns: Short Name, Organism, Assay Type
- Select-all header checkbox with indeterminate state
- Selected count display: `{count} of {total} selected`
- "Apply" and "Cancel" buttons

Reactions list is pre-filtered by the parent `IGVPanel` to only include reactions that have output files (cross-reference `useJobOutputs` reactionIds with `useReactions` data).

---

## Step 5: Frontend — IGVPanel Component

`frontend/src/components/igv/IGVPanel.tsx` — the core component.

### Props
```typescript
interface IGVPanelProps {
  job: JobRead;
  experimentId: number;
  mode: 'alignment' | 'peak_calling';
}
```

### Data Fetching
- `useReactions(experimentId)` — reaction metadata for display names
- **Alignment mode**: `useJobOutputs(job.id, 'smoothed_bigwig')` — bigWig files
- **Peak calling mode**:
  - `useJobOutputs(job.parentJobId, 'smoothed_bigwig')` — bigWig from parent alignment
  - `useJobOutputs(job.id, 'bed')` — BED peak files from this job
- Filter reactions to those with available output files (inner-join on `reactionId`)

### State
- `selectedReactionIds: Set<number>` — which reactions are selected
- `isModalOpen: boolean` — reaction picker visibility
- `containerRef: useRef<HTMLDivElement>` — IGV mount point
- `browserRef: useRef<Browser | null>` — IGV browser instance

### IGV.js Lifecycle
- **Dynamic import**: `const igv = await import('igv')` inside the effect — keeps the ~1.5MB library out of the main bundle, only loaded when user visits the IGV tab
- **Create**: When signed URLs are available and containerRef is ready, call `igv.createBrowser(container, { genome, tracks })`
- **Update**: On selection change OR token refresh, call `igv.removeBrowser()` then recreate with new tracks
- **Cleanup**: On unmount, call `igv.removeBrowser()` in the effect cleanup

### Track Configuration
**Signal tracks (alignment bigWigs)**:
```typescript
{
  name: `${job.name}-${reaction.shortName}`,
  url: signedUrl,
  type: 'wig',
  format: 'bigwig',
  height: 100,
  autoscaleGroup: 'signal',
  color: TRACK_COLORS[index % TRACK_COLORS.length],
}
```

**Peak tracks (peak calling BED files)** — appended after signal tracks. **Format determined dynamically from job params and file extension**:

```typescript
// Derive format from peak caller + peak size in job.params
function getPeakTrackFormat(job: JobRead, output: JobOutput): string {
  const peakCaller = job.params.peak_caller as string;
  const peakSize = job.params.peak_size as string;
  // MACS2 narrow → narrowPeak, MACS2 broad → broadPeak, SEACR/SICER2 → bed
  if (peakCaller === 'MACS2') {
    return peakSize === 'narrow' ? 'narrowPeak' : 'broadPeak';
  }
  // SEACR and SICER2 produce plain BED files
  return 'bed';
}

// Track config:
{
  name: `${job.name}-${reaction.shortName} Peaks`,
  url: signedUrl,
  type: 'annotation',
  format: getPeakTrackFormat(job, output),
  displayMode: 'EXPANDED',
  height: 40,
  color: 'rgb(150, 0, 0)',
}
```

Track label format: `{JobName}-{ShortName}` per CUTANA Cloud spec.

### Toolbar (top controls)
- **Reference Genome dropdown**: Read-only, shows `GENOME_DISPLAY_NAMES[job.params.reference_genome]`
- **"+ Select Reactions" button**: Opens `SelectReactionsModal`. Blue badge with count when reactions are selected
- **Refresh button**: Destroys and recreates browser with same config (also calls `refetch()` on `useIGVTracks` to get fresh tokens)
- **Full Screen button**: Uses `containerRef.current.requestFullscreen()`
- **Save Image button**: Calls `browserRef.current.toSVG()`, serializes SVG → canvas → PNG blob → triggers download via `URL.createObjectURL()`. Same SVG-to-canvas pipeline used in `PeakAnnotationChart.tsx`. Also offer raw SVG download option for researchers who prefer vector format for publications.

### Placeholder State
When no reactions selected: show "Please select Reference Genome and Reactions to render IGV..." inside a Card (matches CUTANA Cloud initial state).

---

## Step 6: Wire Into Tabs

### AlignmentTab.tsx (line 143-147)
Replace:
```tsx
{job && activeSubTab === 'igv' && (
  <Card><p>IGV genome browser coming in Phase 5.</p></Card>
)}
```
With:
```tsx
{job && activeSubTab === 'igv' && (
  job.status === 'complete' ? (
    <IGVPanel job={job} experimentId={experiment.id} mode="alignment" />
  ) : (
    <Card><p>IGV browser will be available when the alignment completes.</p></Card>
  )
)}
```

### PeakCallingTab.tsx (line 139-143)
Same pattern with `mode="peak_calling"`.

---

## Step 7: Backend Tests (`backend/tests/test_files.py`)

Add the following test cases to the existing `test_files.py`:

### Range header parsing tests
- **No Range header → 200** with full file content and `Accept-Ranges: bytes`
- **Valid Range `bytes=0-1023` → 206** with correct `Content-Range: bytes 0-1023/{total}` and 1024 bytes returned
- **Open-ended Range `bytes=100-` → 206** from offset 100 to end of file
- **Range start beyond file size → 416** `Range Not Satisfiable` with `Content-Range: bytes */{total}`
- **Range start > end → 416** `Range Not Satisfiable`
- **Malformed Range header → 200** fallback serving full file

### IGV token endpoint tests
- **Valid request → 200** returns tokens dict with entries for each output ID
- **Unauthorized user → 404** (non-member, matching existing permission pattern)
- **Invalid output IDs → 404** (output IDs not belonging to the specified job)
- **Expired token → 401** on `GET /files/igv-serve`
- **Valid token + valid Range → 206** end-to-end test

---

## Data Flow Summary

1. User navigates to Alignment/Peak Calling > IGV sub-tab
2. `IGVPanel` fetches job outputs (`smoothed_bigwig` / `bed`) and reactions
3. Cross-references to show available reactions in the picker
4. User clicks "+ Select Reactions", picks reactions, clicks "Apply"
5. `useIGVTracks` hook fires `POST /api/v1/files/igv-tokens` with output IDs
6. Backend generates HMAC tokens (60-min TTL), returns signed URLs
7. Frontend builds IGV track configs with signed URLs
8. `igv.createBrowser()` renders the genome browser
9. IGV.js makes Range requests to `GET /api/v1/files/igv-serve?token=...`
10. Backend verifies token, serves byte ranges → 206 Partial Content
11. Every 50 minutes, `refetchInterval` triggers token refresh → browser recreated with new URLs

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth for IGV requests | HMAC signed tokens in query params (60-min) | IGV.js can't use Authorization headers; tokens keep auth out of requiring changes to IGV.js internals |
| Range support in dev | Custom StreamingResponse with 206/416 | FastAPI's FileResponse doesn't support Range; NGINX handles it in prod |
| IGV bundle loading | Dynamic `import('igv')` | ~1.5MB library only loads when user visits IGV tab |
| Browser lifecycle | Remove + recreate on track changes or token refresh | IGV.js lacks a clean "replace all tracks" API; recreating is simpler and reliable |
| Reusable component | Single `IGVPanel` with `mode` prop | Both tabs need identical UI; mode determines which file categories to fetch |
| Token batch endpoint | Single POST for all output IDs | Avoids N API calls; one round-trip for all tracks |
| Token refresh | `refetchInterval: 50min` (active timer) | Prevents silent failures during long browsing sessions — researchers often explore IGV for 60+ minutes without triggering React re-renders |
| Peak track format | Dynamic from `job.params.peak_caller` + `peak_size` | MACS2 narrow → narrowPeak, MACS2 broad → broadPeak, SEACR/SICER2 → bed |
| Save Image | SVG-to-canvas-to-PNG (same as PeakAnnotationChart) | Zero external dependency; also offer raw SVG for publication-quality vectors |
| Range 416 handling | Return `416 Range Not Satisfiable` per RFC 7233 | IGV.js handles 416 gracefully; returning 200 with garbage or 500 would break it |

---

## Verification

1. `ruff check backend/ && ruff format --check backend/` — clean
2. `cd frontend && npx tsc --noEmit` — clean
3. `cd frontend && npm run lint` — clean
4. `docker compose exec api pytest tests/test_files.py -k "igv or range"` — new tests pass
5. Manual test: Navigate to Alignment > IGV > Select reactions > Verify browser renders with tracks
6. Manual test: Navigate to Peak Calling > IGV > Verify both signal and peak tracks render
7. Manual test: Peak calling with MACS2 broad → verify broadPeak format loads correctly
8. Test Range requests: `curl -H "Range: bytes=0-1023" "/api/v1/files/igv-serve?token=..." -v` → 206 with Content-Range header
9. Test 416: `curl -H "Range: bytes=999999999-" "/api/v1/files/igv-serve?token=..." -v` → 416
10. Test token expiry: Generate token, wait >60min, verify 401 response
11. Test Save Image: Click Save Image → PNG downloads correctly
12. Test full screen and refresh buttons
