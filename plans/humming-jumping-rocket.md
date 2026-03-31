# Step 3.6: Alignment Info, Input, Files Sub-tabs

## Context

Step 3.5 implemented the QC Report sub-tab and spike-in placeholder. The current `AlignmentTab.tsx` has:
- **Info**: Interim single-card layout with basic job details, methods text, and notes all crammed together
- **Input**: Stub placeholder
- **Files**: Stub placeholder
- **IGV**: Stub (deferred to Phase 5 — untouched)

This step replaces Info with a spec-compliant three-card layout (`cutana-cloud-ui.md` §6f-i), fills Input with a reactions parameter table (§6f-ii), and fills Files with a category-filtered file browser (§6f-iv).

---

## Implementation Plan

### 1. Backend: Add `launcher` to JobRead schema

The Info sub-tab needs "Created By" with the launcher's name. The `AnalysisJob` model already has a `launcher` relationship to `User` (line 34 of `models/analysis_job.py`), but `JobRead` doesn't expose it.

**Follow the exact `Experiment.creator` pattern:**

- **`backend/schemas/job.py`**: Import `UserBrief` from `schemas.project`, add `launcher: UserBrief | None = None` field to `JobRead`
- **`backend/services/job_service.py`**: Add `selectinload(AnalysisJob.launcher)` to `get_job()` (alongside existing `selectinload(AnalysisJob.outputs)`)

No new migration needed — just exposing an existing relationship.

### 2. Backend: Add `GET /jobs/{job_id}/outputs` endpoint

The Files sub-tab needs job output files filtered by category. Rather than bloating `JobRead` with outputs on every list response, add a dedicated endpoint.

- **`backend/schemas/job.py`**: Add `JobOutputRead` schema (id, jobId, reactionId, fileCategory, filename, filePath, fileType, fileSizeBytes, createdAt)
- **`backend/services/job_service.py`**: Add `get_job_outputs(db, job_id, user_id, category=None)` — queries `JobOutput` with permission check via Experiment→ProjectMember join, optional `file_category` filter
- **`backend/routers/jobs.py`**: Add `GET /jobs/{job_id}/outputs?category=unique_bam` returning `list[JobOutputRead]`
- Reuse same auth pattern as existing `get_job_endpoint`

### 3. Backend: Tests for new endpoint

- **`backend/tests/test_jobs_api.py`**: Add tests:
  - `test_get_job_includes_launcher` — verify job detail response includes `launcher.email`, `launcher.firstName`
  - `test_list_job_outputs_200` — create job + persist outputs via `persist_job_outputs`, verify list returns them
  - `test_list_job_outputs_category_filter` — verify `?category=unique_bam` filters correctly
  - `test_list_job_outputs_unauthorized_404` — non-member gets 404

### 4. Frontend: Update types and API layer

- **`frontend/src/api/types.ts`**:
  - Add `launcher: MemberUser | null` to `AnalysisJob` interface
  - Add `JobOutput` interface: `{ id, jobId, reactionId, fileCategory, filename, filePath, fileType, fileSizeBytes, createdAt }`

- **`frontend/src/api/jobs.ts`**:
  - Add `getJobOutputs(jobId: number, category?: string): Promise<JobOutput[]>`

- **`frontend/src/hooks/useJobs.ts`**:
  - Add `useJobOutputs(jobId: number | null, category?: string)` hook with queryKey `['job-outputs', jobId, category]`

### 5. Frontend: Extract shared `DetailRow` component

The `DescriptionTab.tsx` defines a local `DetailRow` component (lines 12-17) that is the exact pattern needed for the Info Details card.

- **Create `frontend/src/components/ui/DetailRow.tsx`** — extract the component
- **Update `frontend/src/pages/experiment/DescriptionTab.tsx`** — import from shared location instead of defining locally

### 6. Frontend: Add file category constants

- **`frontend/src/lib/constants.ts`**: Add `ALIGNMENT_FILE_CATEGORIES` array:

| `value` | `label` | `description` |
|---------|---------|---------------|
| `unique_bam` | Unique BAM | BAM file filtered for multi-mappers, duplicates, and DAC Exclusion List regions |
| `bigwig` | bigWig | RPKM-normalized signal tracks (unsmoothed, binsize 20) for heatmaps |
| `smoothed_bigwig` | smoothed bigWig | Smoothed RPKM-normalized signal tracks (binsize 100) for IGV |
| `tss_heatmap` | TSS Heatmaps | Enrichment heatmaps around transcription start sites |
| `genebody_heatmap` | Gene Body Heatmaps | Enrichment heatmaps across scaled gene bodies |
| `log` | Logs | Bowtie2 alignment logs and Picard metrics |

Note: FastQC is excluded — those reports live on `fastq_files` records, not `job_outputs`.

### 7. Frontend: `AlignmentInfoPanel` component

**New file: `frontend/src/components/alignment/AlignmentInfoPanel.tsx`**
- Props: `{ job: AnalysisJob }`
- Layout: Three side-by-side cards (`flex gap-4`) matching §6f-i

**Card 1 — Details (`flex-[2]`)**:
- Uses shared `DetailRow` component
- Rows: RUN ID (`job.id`), CREATED BY (`getDisplayName(job.launcher)` or "Unknown"), CREATED DATE (`formatDate(job.createdAt)`), STATUS (`<StatusBadge>`)

**Card 2 — Run Methods (`flex-[3]`)**:
- Header "Run Methods"
- Body: `job.methodsText` in `whitespace-pre-wrap text-sm text-gray-600`
- If null: placeholder "Methods text will be available when the alignment completes."

**Card 3 — Notes (`flex-[2]`)**:
- Header "Notes" with "Manage" text link (no-op for now — editing is not in scope)
- Body: `job.notes` or "No notes" placeholder

**Error banner**: If `job.errorMessage`, render red-50 box below the three cards (same pattern as current implementation).

### 8. Frontend: `AlignmentInputPanel` component

**New file: `frontend/src/components/alignment/AlignmentInputPanel.tsx`**
- Props: `{ job: AnalysisJob; experimentId: number }`

**Data strategy** — cross-reference `job.params.reactions` with experiment reactions:
1. Use existing `useReactions(experimentId)` hook to fetch all experiment reactions
2. Build lookup `Map<number, Reaction>` by reaction ID
3. For each entry in `job.params.reactions`, look up `organism` and `assayType` from the map
4. `reference_genome` comes from `job.params.reference_genome` (job-level, same for all rows)

**DataTable columns**: Short Name, Assay Type, Organism, Reference Genome (`GENOME_DISPLAY_NAMES`), CUTANA Spike in, E.coli Spike in (Yes/No)

Handle missing reactions gracefully — if a reaction was deleted after job creation, show "N/A" for organism/assayType.

### 9. Frontend: `AlignmentFilesPanel` component

**New file: `frontend/src/components/alignment/AlignmentFilesPanel.tsx`**
- Props: `{ jobId: number; experimentId: number }`

**Layout** (matching §6f-iv):
1. **Top row**: Category `<select>` dropdown (default "unique_bam") + description text that updates with category selection
2. **Toolbar**: Download button (enabled when checkboxes selected)
3. **DataTable**: Checkbox column, Filename, Type (`fileType`), Size (`formatBytes`)

**State**: `selectedCategory` (useState), `selectedFileIds` (Set)

**Data flow**: `useJobOutputs(jobId, selectedCategory)` fetches from `GET /jobs/{job_id}/outputs?category=...`

**Download**: Use existing `GET /jobs/{job_id}/files/{file_id}/download` endpoint (already implemented in `routers/files.py` line 240). Single-file download via `window.location.href`.

### 10. Wire into `AlignmentTab.tsx`

**File: `frontend/src/pages/experiment/AlignmentTab.tsx`**

- Import the three new panel components
- **Replace lines 114-200** (current monolithic Info card) with: `<AlignmentInfoPanel job={job} />`
- **Replace lines 214-218** (Input stub) with: `<AlignmentInputPanel job={job} experimentId={experiment.id} />`
- **Replace lines 220-224** (Files stub) with conditional:
  - `job.status === 'complete'` → `<AlignmentFilesPanel jobId={job.id} experimentId={experiment.id} />`
  - Otherwise → placeholder message "Files will be available when the alignment completes."
- IGV stub (lines 226-230) remains unchanged
- Remove unused imports that were only needed by the old inline Info card

---

## Files Modified/Created

| File | Action |
|------|--------|
| `backend/schemas/job.py` | Add `launcher` to `JobRead`, add `JobOutputRead` class |
| `backend/services/job_service.py` | Add `selectinload(launcher)`, add `get_job_outputs()` |
| `backend/routers/jobs.py` | Add `GET /jobs/{job_id}/outputs` endpoint |
| `backend/tests/test_jobs_api.py` | Add 4 tests for launcher + outputs endpoint |
| `frontend/src/api/types.ts` | Add `launcher` to `AnalysisJob`, add `JobOutput` interface |
| `frontend/src/api/jobs.ts` | Add `getJobOutputs()` function |
| `frontend/src/hooks/useJobs.ts` | Add `useJobOutputs()` hook |
| `frontend/src/lib/constants.ts` | Add `ALIGNMENT_FILE_CATEGORIES` |
| `frontend/src/components/ui/DetailRow.tsx` | **Create** — extracted from DescriptionTab |
| `frontend/src/pages/experiment/DescriptionTab.tsx` | Import `DetailRow` from shared location |
| `frontend/src/components/alignment/AlignmentInfoPanel.tsx` | **Create** — three-card Info layout |
| `frontend/src/components/alignment/AlignmentInputPanel.tsx` | **Create** — reactions input table |
| `frontend/src/components/alignment/AlignmentFilesPanel.tsx` | **Create** — category-filtered file browser |
| `frontend/src/pages/experiment/AlignmentTab.tsx` | Wire in new panels, remove old inline code |

---

## Verification

1. **Backend**: `docker compose exec api pytest tests/test_jobs_api.py -v` — all tests pass including 4 new ones
2. **Lint**: `docker compose exec api ruff check .` passes
3. **TypeScript**: `cd frontend && npx tsc --noEmit` passes
4. **Manual**:
   - Info sub-tab: three-card layout, "Created By" shows user name, methods text renders, notes show
   - Input sub-tab: reactions table with all 6 columns, reference genome display name
   - Files sub-tab: dropdown changes file list, checkbox selection, download works
   - QC Report sub-tab: still works (no regression)
   - Non-complete jobs: Files/QC show placeholder messages

---

## Implementation Order

1. Backend schema + service + router + tests (steps 1-3)
2. Frontend types + API + hooks (step 4)
3. Shared DetailRow extraction (step 5)
4. Constants (step 6)
5. Three panel components in parallel (steps 7-9)
6. Wire into AlignmentTab (step 10)
7. Run all verification checks
