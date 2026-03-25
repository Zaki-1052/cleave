# FASTQ Upload Endpoint Implementation Plan

## Current Test Infrastructure Understanding

### Test Setup (conftest.py)
- Uses `AsyncClient` with `ASGITransport` (in-memory HTTP testing)
- `TEST_DATABASE_URL` defaults to `postgresql+asyncpg://cleave:dev@localhost:5432/cleave_test`
- Each test: tables created fresh → test runs → tables dropped (autouse fixture)
- Rate limiting **disabled during tests** (`limiter.enabled = False`)
- Fixtures:
  - `setup_db()` — creates/drops all tables (autouse)
  - `client()` — AsyncClient with `get_db` overridden to use test session
  - `registered_user()` — creates a user via POST /auth/register, returns email, password, access_token
  - `auth_headers()` — returns `{"Authorization": "Bearer <token>"}` from registered_user

### Test Pattern (test_experiments.py)
```python
# 1. Register user(s) + get auth headers
headers = {"Authorization": f"Bearer {token}"}

# 2. Call endpoint with auth
resp = await client.post(
    "/api/v1/...",
    json={...},
    headers=headers,
)

# 3. Assert status + validate response
assert resp.status_code == 201
assert resp.json()["name"] == "..."
```

### Database Schema (Initial Migration bce0e9c5d2ee)
**fastq_files table:**
```sql
CREATE TABLE fastq_files (
  id INTEGER PRIMARY KEY,
  experiment_id INTEGER NOT NULL (FK experiments.id, CASCADE),
  filename VARCHAR NOT NULL,
  prefix VARCHAR NOT NULL,
  read_direction VARCHAR NOT NULL,  -- 'R1' or 'R2'
  file_size_bytes BIGINT,
  total_reads BIGINT,
  file_path VARCHAR NOT NULL,
  is_trimmed BOOLEAN NOT NULL,
  upload_source VARCHAR,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);
```

**No migration needed** — fastq_files table already exists in initial schema.

### Test Data
- `test_data/test_R1.fastq.gz` — 100K reads (~5MB)
- `test_data/test_R2.fastq.gz` — 100K reads (~5MB)

---

## FASTQ Upload Endpoint Design

### Endpoint: POST /api/v1/experiments/:id/fastqs/upload

**Purpose:** Upload FASTQ files (R1 and/or R2) for an experiment

**Auth:** JWT required, user must be project member (any role)

**Request:**
- Content-Type: `multipart/form-data`
- Field: `files` (multiple files)

**Response (201):**
```json
{
  "uploaded": [
    {
      "id": 1,
      "filename": "test_R1.fastq.gz",
      "prefix": "test",
      "readDirection": "R1",
      "fileSizeBytes": 5242880,
      "totalReads": null,
      "uploadedAt": "2026-03-25T12:34:56Z"
    },
    { ... }
  ]
}
```

**Error Handling (400):**
```json
{
  "error": "Invalid FASTQ filename",
  "detail": "Filename must start with alphanumeric character",
  "field_errors": null
}
```

---

## Implementation Checklist

### 1. Schema (READY — no migration needed)
- [x] fastq_files table exists in bce0e9c5d2ee

### 2. Service Layer (fastq_service.py)
Functions needed:
- `parse_fastq_filename(filename: str) → Tuple[str, str]` — extract prefix + R1/R2
  - Example: "test_R1.fastq.gz" → ("test", "R1")
  - Validation: must end with `.fastq.gz` or `.fastq`, can be `.fq.gz`
  - Filename must start with alphanumeric
  - Must contain exactly one `_R1` or `_R2` designation

- `store_fastq_file(experiment_id, prefix, read_direction, file_path, file_size_bytes) → FastqFile`
  - Create fastq_files record in DB
  - Update experiments.storage_bytes (atomic += file_size)
  - Return FastqFileResponse

- `get_fastq_files_for_experiment(experiment_id) → List[FastqFile]`
  - Paginated list of uploaded FASTQs

### 3. Router (routers/fastq.py)
Endpoint handler:
```python
@router.post("/experiments/{experiment_id}/fastqs/upload")
async def upload_fastqs(
    experiment_id: int,
    files: List[UploadFile],
    session: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
) → dict:
    # 1. Verify experiment exists + user is member
    # 2. For each file:
    #    a. Validate filename
    #    b. Save to disk: {STORAGE_ROOT}/projects/{project_id}/{exp_id}/fastqs/raw/{filename}
    #    c. Create DB record (prefix, R1/R2, size)
    # 3. Return list of created records
```

### 4. Validation Rules
- Filename starts with alphanumeric (A-Z, a-z, 0-9)
- Ends with `.fastq.gz`, `.fastq`, `.fq.gz`, or `.fq`
- Contains exactly one `_R1_` or `_R2_` substring (Illumina standard)
- File size > 0
- File size < MAX_UPLOAD_SIZE (from env, e.g., 5000 MB)
- Paired-end enforcement: if R1 uploaded, enforce R2 comes later (or warn in Phase 2)

### 5. Storage Path Calculation
```python
STORAGE_ROOT = settings.STORAGE_ROOT  # e.g., /data/cleave
experiment_dir = f"{STORAGE_ROOT}/projects/{project_id}/{experiment_id}"
fastq_dir = f"{experiment_dir}/fastqs/raw"
file_path = f"{fastq_dir}/{filename}"  # relative to STORAGE_ROOT in DB
```

### 6. Filesystem Handling
- Create directories with `os.makedirs(fastq_dir, exist_ok=True)` if not exists
- Write file: `async with aiofiles.open(file_path, 'wb') as f: await f.write(content)`
- Handle gzip: auto-detect if file is gzipped, handle both `.fastq.gz` and `.fastq`
- Get file size from `file.size` (from `UploadFile`)

### 7. Testing Strategy
**Test: test_upload_fastq_success**
- Register user, create project + experiment
- POST to `/api/v1/experiments/{id}/fastqs/upload` with test R1 + R2
- Assert 201, records created, files on disk, storage_bytes updated

**Test: test_upload_fastq_invalid_filename**
- Try filename without alphanumeric start ("_test.fastq.gz")
- Assert 400 with error message

**Test: test_upload_fastq_invalid_extension**
- Try ".txt", ".fq" (without .gz), etc.
- Assert 400

**Test: test_upload_fastq_missing_rX_designation**
- Try "test.fastq.gz" (no R1/R2)
- Assert 400

**Test: test_upload_fastq_nonmember**
- Try upload to experiment user is not member of
- Assert 403

**Test: test_upload_fastq_duplicate**
- Upload same R1 file twice
- Assert second succeeds (or update, TBD)

---

## Decision Points (for user approval)

1. **Duplicate R1/R2 handling**: What if user uploads the same R1 twice?
   - Option A: Reject with error (duplicate prefix + R1 already exists)
   - Option B: Allow (overwrite or version)
   - Recommendation: Reject (Phase 1 simplicity)

2. **Paired-end enforcement**: Should we require R1 + R2 before allowing pipeline?
   - Option A: Allow single-end uploads (not typical for CUT&RUN)
   - Option B: Warn/block if only one direction per prefix
   - Recommendation: Warn in Phase 2 (allow R1-only now, warn at alignment step)

3. **Auto-gzip**: Should we auto-gzip uncompressed FASTQs on upload?
   - Option A: Yes, transparent to user
   - Option B: No, reject uncompressed
   - Recommendation: Accept `.fastq` + `.fastq.gz`, but don't re-gzip (Phase 2 decision)

4. **Max file size**: What should MAX_UPLOAD_SIZE be?
   - Recommendation: 5000 MB (5GB) to start, configurable in .env

---

## Dependencies to Add

- `aiofiles` — async file I/O
- `python-multipart` — multipart form parsing (already in FastAPI)

---

## Files to Create/Modify

### Create (empty stubs first)
- `backend/routers/fastq.py` — upload endpoint
- `backend/services/fastq_service.py` — file handling logic
- `backend/tests/test_fastq.py` — endpoint tests

### Modify
- `backend/main.py` — mount fastq router
- `backend/schemas/fastq.py` — request/response schemas
- `pyproject.toml` — add aiofiles dependency
- `.env.example` — add MAX_UPLOAD_SIZE, STORAGE_ROOT

### Reference
- `backend/config.py` — settings (add STORAGE_ROOT, MAX_UPLOAD_SIZE)
- `backend/models/fastq_file.py` — already exists (no changes needed)

---

## Code Patterns to Follow (from existing tests)

1. **Auth dependency** → use `current_active_user` from fastapi-users
2. **Permission check** → call `project_service.verify_member(project_id, user_id)`
3. **DB operations** → inject `session: AsyncSession = Depends(get_db)`
4. **Error responses** → use `HTTPException` with standardized status codes
5. **Testing** → `async def test_xxx(client: AsyncClient)` with `await _register_and_get_headers()`
