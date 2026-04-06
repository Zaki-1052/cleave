# 2026-03-27 — Phase 5.1: IGV.js Integration

## What Was Done

### Backend (3 files modified)
- **`config.py`**: Added `IGV_TOKEN_EXPIRY_SECONDS = 3600` (60-min TTL for interactive browsing sessions)
- **`schemas/file.py`**: Added `IGVTokenRequest` and `IGVTokenResponse` Pydantic schemas
- **`routers/files.py`**: Added two new endpoints:
  - `POST /api/v1/files/igv-tokens` — batch generates HMAC-signed URLs for IGV file access (JWT-authenticated, project membership verified)
  - `GET /api/v1/files/igv-serve` — serves files with RFC 7233 Range header support (token-authenticated, no JWT)
  - Range handling: 200 (full file), 206 (partial content), 416 (range not satisfiable), malformed → 200 fallback
  - Uses `StreamingResponse` (not `FileResponse`) to avoid Starlette's built-in Range handling conflicts
  - In NGINX mode: delegates to `X-Accel-Redirect` (NGINX handles Range natively)

### Frontend (4 new files, 4 modified)
- **`components/igv/IGVPanel.tsx`**: Core reusable IGV.js browser panel with dynamic `import('igv')`, toolbar (genome dropdown, Select Reactions + badge, Refresh, Save Image, Full Screen), track building for both alignment (bigWig) and peak calling (bigWig + BED) modes, token refresh → browser recreation
- **`components/igv/SelectReactionsModal.tsx`**: Checkbox reaction picker modal following ChooseReactionsStep pattern
- **`hooks/useIGVTracks.ts`**: TanStack Query hook with `refetchInterval: 50min` for active token refresh
- **`api/files.ts`**: Added `getIGVTokens()` API function
- **`pages/experiment/AlignmentTab.tsx`**: Replaced IGV placeholder with `<IGVPanel mode="alignment">`
- **`pages/experiment/PeakCallingTab.tsx`**: Replaced IGV placeholder with `<IGVPanel mode="peak_calling">`
- **`package.json`**: Added `igv` npm dependency (ships its own TypeScript types)

### Tests (10 new)
- **`test_files.py`**: 10 new tests — IGV token generation (3), token auth (2), Range header parsing (5: no range→200, valid→206, open-ended→206, beyond-file→416, malformed→200)

## Decisions Made
- HMAC signed tokens in query params (IGV.js can't use Authorization headers)
- Dynamic `import('igv')` to keep ~1.5MB out of main bundle
- `refetchInterval: 50min` (active timer) instead of passive `staleTime` for token refresh — prevents silent failures during long browsing sessions
- Peak track format derived dynamically from `job.params.peak_caller` + `peak_size` (narrowPeak/broadPeak/bed)
- Save Image: SVG-to-canvas-to-PNG pipeline (same as PeakAnnotationChart), SVG fallback
- `StreamingResponse` for all full-file serving in the Range helper (avoids Starlette `FileResponse` built-in Range conflicts)

## Key File Paths
- `backend/routers/files.py` — IGV endpoints + Range helper
- `frontend/src/components/igv/IGVPanel.tsx` — Core IGV component
- `frontend/src/components/igv/SelectReactionsModal.tsx` — Reaction picker
- `frontend/src/hooks/useIGVTracks.ts` — Token fetch hook
