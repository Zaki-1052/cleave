# 2026-03-27 — Step 3.6: Alignment Info, Input, Files Sub-tabs

## What was done

- Redesigned Info sub-tab from monolithic single-card to spec-compliant three-card layout (Details, Run Methods, Notes) matching `cutana-cloud-ui.md` §6f-i
- Added `launcher: UserBrief` to `JobRead` schema so Info can show "Created By" user name (follows exact Experiment/creator pattern)
- Added `GET /api/v1/jobs/:jid/outputs?category=` endpoint returning `list[JobOutputRead]` for category-filtered file browsing
- Created `AlignmentInfoPanel` component — Details card (Run ID, Created By, Date, Status), Run Methods card (with copy button), Notes card
- Created `AlignmentInputPanel` component — Reactions DataTable (6 columns: Short Name, Assay Type, Organism, Reference Genome, CUTANA Spike in, E.coli Spike in) cross-referencing job params with experiment reactions
- Created `AlignmentFilesPanel` component — category dropdown (6 file types), description text, checkbox-selectable files table with download
- Extracted shared `DetailRow` component from `DescriptionTab` into `components/ui/DetailRow.tsx`
- Added `ALIGNMENT_FILE_CATEGORIES` constant with labels and descriptions for all 6 file categories
- Added `JobOutput` TypeScript type, `getJobOutputs()` API function, `useJobOutputs()` hook
- 4 new backend tests (launcher in response, output list, category filter, unauthorized access)

## Decisions made

- "Created By" resolved by adding `selectinload(AnalysisJob.launcher)` to `get_job()` — same pattern as `Experiment.creator`
- Organism/Assay Type for Input tab resolved by cross-referencing `job.params.reactions` with experiment reactions via `useReactions` hook (avoids backend changes)
- Job outputs endpoint does explicit permission check via `get_job()` before querying outputs (prevents empty-list-for-unauthorized bug)
- FastQC excluded from alignment file categories — those reports live on `fastq_files` records, not `job_outputs`
- Files sub-tab only shown for completed jobs; others get placeholder message

## Open items

- IGV sub-tab remains Phase 5 stub
- Notes "Manage" link is a no-op (editing not in scope for this step)
- Batch download in Files sub-tab opens multiple tabs (one per file) — could be improved with zip download later

## Key file paths

- `backend/schemas/job.py` — Added `launcher` to `JobRead`, added `JobOutputRead` (modified)
- `backend/services/job_service.py` — Added `selectinload(launcher)`, added `get_job_outputs()` (modified)
- `backend/routers/jobs.py` — Added `GET /jobs/{job_id}/outputs` endpoint (modified)
- `backend/tests/test_jobs_api.py` — 4 new tests (modified)
- `backend/tests/conftest.py` — Added `db_session` fixture (modified)
- `frontend/src/components/alignment/AlignmentInfoPanel.tsx` — Info three-card layout (created)
- `frontend/src/components/alignment/AlignmentInputPanel.tsx` — Input reactions table (created)
- `frontend/src/components/alignment/AlignmentFilesPanel.tsx` — Files category browser (created)
- `frontend/src/components/ui/DetailRow.tsx` — Shared component (created)
- `frontend/src/pages/experiment/AlignmentTab.tsx` — Wired in new panels (modified)
- `frontend/src/pages/experiment/DescriptionTab.tsx` — Import shared DetailRow (modified)
- `frontend/src/api/types.ts` — Added `launcher` to AnalysisJob, added `JobOutput` (modified)
- `frontend/src/api/jobs.ts` — Added `getJobOutputs()` (modified)
- `frontend/src/hooks/useJobs.ts` — Added `useJobOutputs()` (modified)
- `frontend/src/lib/constants.ts` — Added `ALIGNMENT_FILE_CATEGORIES` (modified)

## Test results

- TypeScript: `npx tsc --noEmit` passes cleanly
- Python lint: `ruff check .` passes cleanly
- Backend: 206 passed, 0 failed (4 new + 202 existing, no regressions)
