# 2026-03-27 — Add Heatmaps to Alignment QC Report

## What was done

- **Added signed URL endpoint for job outputs**: `GET /jobs/{job_id}/outputs/{output_id}/signed-url` generates HMAC-signed download URLs for any job output file. Validates project membership, returns URL + filename.
- **Added frontend API function**: `getOutputSignedUrl()` in `api/jobs.ts` for fetching signed URLs.
- **Added TSS and Gene Body heatmap sections** to `AlignmentQCReportPanel`:
  - `HeatmapSection` component fetches outputs by category (`tss_heatmap`, `genebody_heatmap`)
  - `HeatmapImage` component fetches signed URL per image, renders inline with `&display=inline`
  - Each image has a "Download PNG" button triggering browser download
  - Collapsible "About" info panel with CUTANA Cloud-matching descriptions
  - Grid layout (2-3 columns) for multiple reactions

## Decisions made

- Reused existing HMAC signed token infrastructure (consistent with FastQC and IGV patterns)
- Images rendered via signed URLs rather than blob URLs for consistency and security
- One signed URL request per image (acceptable — heatmaps are typically 1-5 per alignment)

## Key file paths

- `backend/routers/jobs.py` — new `signed-url` endpoint
- `frontend/src/api/jobs.ts` — `getOutputSignedUrl()`
- `frontend/src/components/alignment/AlignmentQCReportPanel.tsx` — `HeatmapSection`, `HeatmapImage`
