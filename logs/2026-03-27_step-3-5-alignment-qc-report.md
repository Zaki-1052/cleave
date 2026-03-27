# 2026-03-27 — Step 3.5: Alignment QC Report

## What was done

- Added `GET /api/v1/jobs/:jid/qc-report` endpoint returning structured JSON (`AlignmentQCReport` schema)
- Added `GET /api/v1/jobs/:jid/qc-report/download` endpoint returning raw CSV file
- Created `qc_report_service.py` — reads alignment_metrics.csv from disk, parses into Pydantic models, auth via project membership join
- Added sub-tab navigation to `AlignmentTab` — Info, Input, QC Report, Files, IGV (state-based, not nested routes)
- Created `AlignmentQCReportPanel` component — metrics DataTable (9 columns), "About" info panel, CSV download button, conditional SNAP-CUTANA spike-in placeholder
- Added frontend plumbing: `AlignmentQCReport` + `AlignmentReactionMetrics` TypeScript types, `getQCReport`/`downloadQCCsv` API functions, `useQCReport` hook, `formatNumber` utility
- Moved existing job details into Info sub-tab, added methods text and notes display
- 6 new backend tests (success, download, 404, 409 not-complete, unauthorized, download-not-complete)

## Decisions made

- Sub-tabs are state-based (`useState`) within `AlignmentTab`, not nested routes — simpler since job ID is already in the URL
- QC data is read from the CSV file on disk (not stored in DB) — consistent with pipeline architecture where files are the source of truth
- SNAP-CUTANA spike-in section renders a conditional placeholder (checks `job.params.reactions` for spike-in flags) — actual heatmap generation deferred until pipeline produces spike-in data
- Default sub-tab is `info` (will be the most-viewed tab once fully built in 3.6)
- Number formatting uses `toLocaleString('en-US')` for comma-separated thousands, `.toFixed(2)` for percentages

## Open items

- Info sub-tab is interim (basic details card) — full layout with Details/Methods/Notes cards in Step 3.6
- Input sub-tab stub — Step 3.6
- Files sub-tab stub — Step 3.6
- IGV sub-tab stub — Phase 5
- SNAP-CUTANA spike-in heatmap rendering — requires pipeline to run barcode grep on FASTQs and produce count data

## Key file paths

- `backend/services/qc_report_service.py` — QC report service (created)
- `backend/routers/jobs.py` — Added 2 QC endpoints (modified)
- `backend/tests/test_qc_report.py` — 6 tests (created)
- `frontend/src/components/alignment/AlignmentQCReportPanel.tsx` — QC Report component (created)
- `frontend/src/pages/experiment/AlignmentTab.tsx` — Sub-tab navigation + integration (modified)
- `frontend/src/api/types.ts` — QC TypeScript types (modified)
- `frontend/src/api/jobs.ts` — QC API functions (modified)
- `frontend/src/hooks/useJobs.ts` — useQCReport hook (modified)
- `frontend/src/lib/utils.ts` — formatNumber utility (modified)

## Test results

- TypeScript: `npx tsc --noEmit` passes cleanly
- Python lint: `ruff check .` passes cleanly
- Backend: 202 passed, 0 failed (6 new + 196 existing, no regressions)
