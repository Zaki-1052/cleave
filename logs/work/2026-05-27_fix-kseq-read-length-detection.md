# Fix kseq_test Read Length Detection

> 1 session on 2026-05-27. 3 new tests (551+ total). `ruff check` + `ruff format --check` + `tsc --noEmit` all clean.

---

## Problem

The trimming pipeline's kseq_test step hardcoded `42` as the read length argument. kseq_test only trims reads whose length **exactly matches** the argument, so for longer sequencing runs (e.g., 150bp), it matched almost nothing and re-compressed entire files unchanged — 100% CPU for 30+ minutes per file with no actual trimming.

Root cause: the lab's original sequencing was 2x42bp (`fastq_sequence_length: 42` in all CUTRUNTools config files). kseq_test's second argument is the **input read length**, not the desired output length. It trims 6bp off the 3' end of reads matching that length. After Trimmomatic variable-length trimming, almost no reads are exactly 42bp when the sequencing was 150bp.

Discovered during a real auto-pipeline run on EC2 (job 59, 4 pairs, ~45-57M reads each). All 4 kseq_test processes pegged at 100% CPU for 12+ minutes producing output files nearly identical in size to inputs.

## What Was Done

### Fix: Auto-detect read length from FastQC

FastQC already runs on every uploaded FASTQ and its `fastqc_data.txt` contains `Sequence length\t<value>`. The fix threads this value from FastQC parsing to the trimming pipeline.

**Backend changes (6 files modified, 1 new):**
- `backend/pipelines/fastqc.py` — Added `sequence_length` to `FastqcResult`; parses `Sequence length` line with range handling (`"35-101"` -> max -> 101)
- `backend/models/fastq_file.py` — Added `sequence_length: Mapped[int | None]` column
- `backend/migrations/versions/e1a4d2f93b71_add_sequence_length_to_fastq_files.py` — New Alembic migration (nullable Integer, chains from `be082d72cc1c`)
- `backend/services/fastqc_service.py` — Stores `sequence_length` in DB during FastQC update
- `backend/schemas/fastq_file.py` — Exposes `sequence_length` in `FastqFileRead` API response
- `backend/services/auto_pipeline_service.py` — `_queue_trimming()` auto-detects kseq_length from R1 `sequence_length` values (max of non-null); falls back to default 42 if NULL

**Frontend changes (3 files):**
- `frontend/src/api/types.ts` — Added `sequenceLength` to `FastqFile` interface
- `frontend/src/components/fastqs/TrimConfigModal.tsx` — Accepts `defaultKseqLength` prop, pre-populates from detected read length
- `frontend/src/pages/experiment/FastqsTab.tsx` — Computes `detectedReadLength` from raw FASTQs and passes to TrimConfigModal

**Tests (1 file, 3 new tests + 1 assertion):**
- `backend/tests/test_fastqc.py` — Scalar length, range length, missing length, existing minimal test now asserts `sequence_length is None`

### Deployment

Deployed to EC2 (`git pull`, `pip install -e .`, `alembic upgrade head`, frontend rebuild + scp, service restart). User terminated stuck jobs via UI and created fresh experiment to re-run with fix.

## Decisions Made

- **Injection point**: `_queue_trimming()` in auto_pipeline_service, not the worker or pipeline itself. The pipeline already reads `kseq_length` from params with fallback to DEFAULTS. Only the service that builds auto-pipeline params needed updating.
- **Range handling**: FastQC `Sequence length` can be a range like `"35-101"`. Take `max()` — kseq_test only processes reads at the original sequencing length (the longest reads).
- **No changes to TrimmingStage**: The pipeline's `run()` and `_process_pair()` are untouched. `kseq_length` flows through the existing param mechanism.
- **Backwards compatible**: Existing FASTQs have `sequence_length = NULL` -> pipeline uses DEFAULTS[kseq_length] = 42. Identical behavior for the lab's original 42bp data.

## Key File Paths

- `backend/pipelines/fastqc.py` — FastQC parser (sequence_length added)
- `backend/services/auto_pipeline_service.py` — Auto-detect logic in `_queue_trimming()`
- `backend/pipelines/trimming.py` — Unchanged; consumes `kseq_length` param as before
- `backend/pipelines/tools/kseq_test.c` — Unchanged; C source for reference
- `backend/migrations/versions/e1a4d2f93b71_add_sequence_length_to_fastq_files.py` — New migration

## Open Items

- Existing FASTQs uploaded before this fix have `sequence_length = NULL`. Re-uploading or re-running FastQC will populate the field. A backfill script could parse existing `fastqc_data.txt` files on disk if needed.
- kseq_test itself is still slow for large files (single-threaded gzprintf). A future optimization could replace it with a faster tool or skip it when Trimmomatic already handled adapter removal.

---

## Bonus: DescriptionTab Inline Editing

Added inline editing for experiment name and description on the Description tab. Previously read-only with no UI to rename experiments.

**Single file:** `frontend/src/pages/experiment/DescriptionTab.tsx`
- Name: new DetailRow with hover pencil icon -> inline input, Enter/blur saves, Escape cancels, max 100 chars
- Description: pencil icon in card header -> textarea with Save/Cancel buttons; empty placeholder is clickable
- Gated behind `isReadOnly` (reference projects show no edit affordances)
- Uses existing `useUpdateExperiment()` mutation hook -- TanStack Query invalidation auto-refreshes the header name in ExperimentView
- Toast feedback via sonner on success/error
