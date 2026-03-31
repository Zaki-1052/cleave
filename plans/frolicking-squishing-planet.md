# Phase 2.1 — FASTQ Upload Backend

## Context

Phase 1 is complete (auth, project/experiment CRUD, notifications, settings, 46 tests passing). Phase 2.1 is the first data management step: building the backend upload endpoint so users can upload paired-end FASTQ files to experiments. This unblocks Phase 2.2 (upload UI), 2.3 (FastQC), and all downstream pipeline work.

The `fastq_files` DB table and `FastqFile` ORM model already exist. The router has 501 stubs. No migration needed — only service logic, validation, file I/O, and tests.

---

## Files to Create

### 1. `backend/services/fastq_service.py` — Core upload logic

**Helper: `validate_fastq_filename(filename) -> (prefix, read_direction)`**
- Must start with alphanumeric: `re.match(r'^[A-Za-z0-9]', filename)`
- Must end with `.fastq.gz`, `.fastq`, `.fq.gz`, or `.fq` (case-insensitive)
- Must contain `_R1` or `_R2` (followed by `_` or `.`): extract read direction
- Prefix = everything before the last `_R1` or `_R2` in the stem
- Pattern on stem: `re.match(r'^(.+)_R([12])(.*)$', stem)` — greedy `.+` matches the LAST `_R[12]`
- Raises `ValueError` with descriptive message on failure

**Helper: `_build_storage_path(project_id, experiment_id, filename) -> Path`**
- Returns `Path(settings.STORAGE_ROOT) / "projects" / str(project_id) / str(experiment_id) / "fastqs" / "raw" / filename`

**Helper: `_save_file_to_disk(upload_file, dest_path, auto_gzip) -> int`**
- Streams `UploadFile` to disk in 1MB chunks via `upload_file.read(1024 * 1024)`
- If `auto_gzip=True` (uncompressed `.fastq`/`.fq`): wrap output with `gzip.open()`, append `.gz` to dest filename
- Returns bytes written to disk
- Creates parent directories with `dest_path.parent.mkdir(parents=True, exist_ok=True)`

**Helper: `_update_storage_bytes_atomic(db, experiment_id, project_id, delta_bytes)`**
- Uses atomic SQL per todos.md known issue:
  ```python
  await db.execute(update(Experiment).where(Experiment.id == experiment_id)
      .values(storage_bytes=Experiment.storage_bytes + delta_bytes))
  await db.execute(update(Project).where(Project.id == project_id)
      .values(storage_bytes=Project.storage_bytes + delta_bytes))
  ```

**Main: `upload_fastqs(db, experiment_id, user_id, files) -> list[FastqFile] | None`**
1. Verify membership: `select(Experiment).join(ProjectMember)` where `experiment_id` matches, `user_id` matches, `role in ('admin', 'contributor')`. Return `None` if not found.
2. Get `project_id` from experiment.
3. Validate ALL filenames upfront (fail-fast). Collect errors. If any fail, raise `ValueError` listing all invalid files.
4. Check for duplicate filenames in DB for this experiment. Raise `ValueError` on duplicates.
5. For each file:
   - Determine if auto-gzip needed (`.fastq`/`.fq` extension)
   - Build dest path, stream to disk, get bytes written
   - If auto-gzipped, update filename to add `.gz` suffix
   - Create `FastqFile(experiment_id=..., filename=final_filename, prefix=prefix, read_direction=direction, file_size_bytes=bytes_written, file_path=str(relative_path), upload_source="local")`
   - `db.add(fastq_record)`
6. `_update_storage_bytes_atomic(db, experiment_id, project_id, total_bytes)`
7. `await db.commit()`
8. Return list of created FastqFile records

Error handling: If a file write fails mid-batch, delete already-written files from disk before re-raising.

**List: `list_fastqs(db, experiment_id, user_id, page, per_page) -> tuple[list[FastqFile], int] | None`**
- Join Experiment → ProjectMember to verify membership (any role)
- Return `None` if not authorized
- Return paginated list ordered by `uploaded_at desc`

**Delete: `delete_fastq(db, experiment_id, fastq_id, user_id) -> bool`**
- Verify admin/contributor role
- Delete file from disk, delete DB record
- Decrement storage_bytes atomically (negative delta)
- Return False if not found/unauthorized

### 2. `backend/tests/test_fastq_upload.py` — Test suite

Follow exact patterns from `test_experiments.py`:
- Inline helpers: `_register_and_get_headers()`, `_create_project()`, `_create_experiment()`
- Use `io.BytesIO` + `gzip.compress()` to create valid in-memory FASTQ content
- Multipart upload via httpx: `client.post(..., files=[("files", (filename, content, "application/octet-stream"))])`

Test cases (~12-15 tests):
| Test | Asserts |
|------|---------|
| `test_upload_single_fastq_gz` | 201, record in response, correct prefix/direction parsed |
| `test_upload_multiple_fastqs` | 201, 2 records, both with correct metadata |
| `test_upload_uncompressed_auto_gzip` | 201, stored filename ends `.gz`, file on disk is gzipped |
| `test_upload_invalid_extension` | 422, descriptive error |
| `test_upload_filename_no_alphanumeric_start` | 422, "must start with alphanumeric" |
| `test_upload_missing_read_direction` | 422, error about R1/R2 |
| `test_upload_duplicate_filename` | 409, duplicate error |
| `test_upload_nonmember` | 403 |
| `test_upload_viewer` | 403 |
| `test_upload_updates_storage_bytes` | experiment.storageBytes and project.storageBytes incremented |
| `test_list_fastqs` | 200, correct items and total |
| `test_list_fastqs_nonmember` | 404 |
| `test_delete_fastq` | 204, record gone, file gone |
| `test_delete_updates_storage` | storageBytes decremented |

---

## Files to Modify

### 3. `backend/schemas/fastq_file.py`
- Add `FastqFileUploadResponse(CamelModel)`: `uploaded: list[FastqFileRead]`, `total_bytes: int`, `file_count: int`
- Existing `FastqFileRead` is already complete — no changes needed

### 4. `backend/routers/fastq_files.py`
Replace both 501 stubs + add delete endpoint:

```python
@router.post("/experiments/{experiment_id}/fastqs/upload",
    response_model=FastqFileUploadResponse, status_code=201)
async def upload_fastq_endpoint(
    experiment_id: int,
    files: list[UploadFile] = File(...),
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    # Call service, handle None->403, ValueError->422

@router.get("/experiments/{experiment_id}/fastqs",
    response_model=PaginatedResponse[FastqFileRead])
async def list_fastqs_endpoint(
    experiment_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100, alias="perPage"),
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    # Call service, handle None->404

@router.delete("/experiments/{experiment_id}/fastqs/{fastq_id}",
    status_code=204)
async def delete_fastq_endpoint(
    experiment_id: int, fastq_id: int,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    # Call service, handle False->404
```

### 5. `backend/tests/conftest.py`
Add autouse fixture to override `settings.STORAGE_ROOT` with `tmp_path` for test isolation:
```python
@pytest.fixture(autouse=True)
async def override_storage_root(tmp_path):
    from config import settings
    original = settings.STORAGE_ROOT
    settings.STORAGE_ROOT = str(tmp_path / "cleave_test_storage")
    yield
    settings.STORAGE_ROOT = original
```

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Multiple files per request | Yes, `list[UploadFile]` | Users upload R1+R2 pairs; reduces round trips |
| R1/R2 pairing enforced at upload? | No | Users may upload across sessions; enforce at alignment launch (Phase 3.4) |
| Permission check approach | Service-layer join (not `require_project_role`) | Route has `experiment_id` not `project_id`; follows `experiment_service` pattern |
| Auto-gzip method | Python `gzip` module | No subprocess needed; streaming chunks keeps memory low |
| File write strategy | Stream 1MB chunks to disk | FASTQ files are multi-GB; can't load into memory |
| Storage bytes update | Atomic SQL `SET storage_bytes = storage_bytes + :delta` | Per todos.md, avoids race conditions |
| `file_path` stored as | Relative to STORAGE_ROOT | Portable if STORAGE_ROOT changes; e.g., `projects/1/2/fastqs/raw/file.fastq.gz` |

---

## Patterns to Reuse (Do NOT Reinvent)

| Pattern | Source File | Usage |
|---------|------------|-------|
| CamelModel base schema | `schemas/common.py:15` | All new schemas extend this |
| `from_attributes=True` ConfigDict | `schemas/fastq_file.py:10` | Already on FastqFileRead |
| Service membership check via join | `services/experiment_service.py:15-23` | Same join pattern for upload auth |
| PaginatedResponse wrapper | `schemas/common.py:56` | List endpoint response |
| Router Depends pattern | `routers/experiments.py:34-37` | `current_active_user`, `get_db` |
| Test helpers inline | `tests/test_experiments.py:5-24` | `_register_and_get_headers`, `_create_project` |
| HTTPException status codes | `routers/experiments.py` | 201, 204, 403, 404, 422 |

---

## What This Does NOT Include (Deferred)

- Frontend upload UI (Phase 2.2)
- FastQC auto-run after upload (Phase 2.3)
- `total_reads` population (Phase 2.3 — FastQC extracts this)
- R1/R2 pairing validation (Phase 3.4 — alignment launch)
- Path traversal security on file browser (Phase 2.9)
- tus resumable uploads (deferred per `cleave-spec-decisions.md` §1)

---

## Verification

1. **Lint**: `ruff check backend/ && ruff format backend/`
2. **Tests**: `pytest backend/tests/test_fastq_upload.py -v`
3. **All tests still pass**: `pytest backend/tests/ -v` (46 existing + ~14 new)
4. **Manual curl test**:
   ```bash
   # Register + login to get token
   TOKEN=$(curl -s -X POST localhost:8000/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"testpass123"}' | jq -r .accessToken)

   # Create project + experiment (get IDs)

   # Upload test FASTQs
   curl -X POST "localhost:8000/api/v1/experiments/{id}/fastqs/upload" \
     -H "Authorization: Bearer $TOKEN" \
     -F "files=@test_data/test_R1.fastq.gz" \
     -F "files=@test_data/test_R2.fastq.gz"

   # Verify: 201 response with 2 records, files on disk at STORAGE_ROOT, storage_bytes updated
   ```
5. **Check storage_bytes**: `GET /api/v1/experiments/{id}` → `storageBytes` > 0
