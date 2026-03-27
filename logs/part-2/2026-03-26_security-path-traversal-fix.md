# 2026-03-26 — Security Fix: Path Traversal via FASTQ Filename

## What was done

Fixed a critical path traversal vulnerability where crafted FASTQ filenames (e.g., `A/../../../../tmp/evil_R1_001.fastq.gz`) could write files to arbitrary locations on disk. Applied defense-in-depth with two layers:

**Layer 1 — Input validation:**
- Added `/`, `\`, `..` rejection to `validate_fastq_filename()` in `fastq_service.py`
- Blocks the attack at the earliest point in both multipart and tus upload flows

**Layer 2 — Output validation:**
- Added `resolve() + startswith(storage_root + "/")` containment checks after path construction in:
  - `fastq_service.py` `upload_fastqs()` (multipart uploads)
  - `tus_upload.py` completion handler (both normal and gzip branches)

**Consistency fix:**
- Fixed `startswith(str(storage_root))` → `startswith(str(storage_root) + "/")` in `fastq_files.py` lines 140 and 184 (FastQC report serving), matching the correct pattern already used in `files.py` and `file_service.py`

## Decisions made

- Used substring check `".." in filename` (broad) rather than `".." in filename.split("/")` — no legitimate FASTQ filename contains `..`
- Both defense layers are independent: if one is bypassed (e.g., future code change removes input check), the other still catches traversal
- Raises `ValueError` in service layer (caught by router as 422) and `HTTPException(400)` in tus router (consistent with existing patterns in each file)

## Open items

- None — all 151 tests pass, ruff clean

## Key file paths

- `backend/services/fastq_service.py` — `validate_fastq_filename()` + `upload_fastqs()`
- `backend/routers/tus_upload.py` — `on_fastq_upload_complete()` handler
- `backend/routers/fastq_files.py` — FastQC report serving endpoints
