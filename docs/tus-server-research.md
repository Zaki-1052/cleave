# Tus Resumable Upload — Python Server Library Research

> **Date**: 2026-03-26
> **Purpose**: Evaluate Python tus server libraries for integrating resumable FASTQ uploads into Cleave's FastAPI backend.
> **Context**: Cleave needs chunked/resumable uploads for multi-GB FASTQ files over potentially unreliable connections. The frontend uses React (tus-js-client). The backend is FastAPI (ASGI, async, Python 3.11+).

---

## Table of Contents

1. [Tus Protocol v1.0.0 Specification Summary](#1-tus-protocol-v100-specification-summary)
2. [Python Server Libraries](#2-python-server-libraries)
   - [tuspyserver](#21-tuspyserver--recommended)
   - [fastapi-tusd](#22-fastapi-tusd)
   - [resumable-upload](#23-resumable-upload)
   - [FasTUS](#24-fastus)
   - [aiohttp-tus](#25-aiohttp-tus)
   - [django-tus / drf-tus](#26-django-tus--drf-tus)
3. [Alternative: Standalone tusd (Go Binary) + HTTP Hooks](#3-alternative-standalone-tusd-go-binary--http-hooks)
4. [Alternative: Hand-Rolled Implementation](#4-alternative-hand-rolled-implementation)
5. [Comparison Matrix](#5-comparison-matrix)
6. [Implementation Pitfalls](#6-implementation-pitfalls-what-a-naive-approach-misses)
7. [Recommendation for Cleave](#7-recommendation-for-cleave)
8. [tuspyserver Integration Example](#8-tuspyserver-integration-example-for-cleave)
9. [Sources](#9-sources)

---

## 1. Tus Protocol v1.0.0 Specification Summary

The tus protocol (https://tus.io/protocols/resumable-upload) defines an open protocol for resumable file uploads over HTTP. Version 1.0.0 has been stable since 2016.

### Core Protocol (Required)

All clients and servers MUST implement the core protocol:

| Method | Purpose | Key Headers |
|--------|---------|-------------|
| **HEAD** | Query upload status (current offset, length) | `Upload-Offset`, `Upload-Length`, `Cache-Control: no-store` |
| **PATCH** | Append data to an upload at a given offset | `Content-Type: application/offset+octet-stream`, `Upload-Offset` |
| **OPTIONS** | Discover server capabilities | `Tus-Version`, `Tus-Extension`, `Tus-Max-Size` |

**Required headers on every request/response** (except OPTIONS):
- `Tus-Resumable: 1.0.0` — Protocol version. Server responds `412 Precondition Failed` if unsupported.

**Core PATCH behavior**:
- `Upload-Offset` in the request MUST equal the server's current offset for that resource.
- Mismatch triggers `409 Conflict` — **no data is modified**. This is the critical concurrency-safety mechanism.
- Success returns `204 No Content` with updated `Upload-Offset`.
- Content-Type MUST be `application/offset+octet-stream` or the server returns `415`.

### Extensions (Optional but Important)

Extensions are advertised via the `Tus-Extension` response header on OPTIONS.

| Extension | Purpose | Priority for Cleave |
|-----------|---------|---------------------|
| **Creation** | `POST` to create a new upload, returns `Location` URL. Required for any practical use. | **Essential** |
| **Creation-With-Upload** | Include data in the initial `POST` (saves a round-trip). | Nice-to-have |
| **Creation-Defer-Length** | Create upload without knowing final size upfront. | Low (FASTQ sizes known) |
| **Expiration** | Server sets `Upload-Expires` header; expired uploads return 404/410. | **Essential** (cleanup) |
| **Checksum** | Client sends `Upload-Checksum` header per PATCH; server verifies integrity. Mismatch = `460 Checksum Mismatch`. | **Important** (data integrity for genomic data) |
| **Termination** | `DELETE` to cancel an upload and free resources. | **Important** |
| **Concatenation** | Split a file into parallel partial uploads, then concatenate server-side. | Low (overkill for our scale) |

### Error Codes

| Code | Meaning |
|------|---------|
| `400` | Unsupported checksum algorithm |
| `403` | Forbidden (or PATCH on a concatenated final upload) |
| `404` | Upload resource not found |
| `409` | Offset mismatch (concurrent write protection) |
| `410` | Upload expired or previously deleted |
| `412` | Unsupported protocol version |
| `413` | Upload exceeds `Tus-Max-Size` |
| `415` | Wrong Content-Type on PATCH |
| `460` | Checksum mismatch |

### Upload-Metadata Header

Base64-encoded key-value pairs sent on the creation POST. Example:
```
Upload-Metadata: filename d29ybGRfZG9taW5hdGlvbl9wbGFuLnBkZg==,filetype YXBwbGljYXRpb24vcGRm
```
Servers MUST carefully validate/sanitize metadata values to prevent header smuggling.

---

## 2. Python Server Libraries

### 2.1 tuspyserver — RECOMMENDED

| Field | Value |
|-------|-------|
| **PyPI** | https://pypi.org/project/tuspyserver/ |
| **GitHub** | https://github.com/edihasaj/tuspyserver |
| **Version** | 4.2.3 (November 2, 2025) |
| **Stars** | 34 |
| **License** | MIT |
| **Python** | >= 3.8 |
| **Dependencies** | `fastapi >= 0.110` only |
| **WSGI/ASGI** | **ASGI** (native FastAPI router) |
| **Maintenance** | Active (145 commits, 3 open issues as of March 2026) |

**Tus Extensions Supported**: Creation, Termination, Expiration. Checksum and Concatenation are NOT mentioned in documentation.

**Integration Approach**: Provides a `create_tus_router()` factory function that returns a FastAPI `APIRouter`. You `include_router()` it directly into your FastAPI app. This is the cleanest possible integration pattern — it participates in FastAPI's dependency injection, middleware, and exception handling natively.

**Hook System**:
- `on_upload_complete(file_path: str, metadata: dict)` — Simple callback when upload finishes
- `upload_complete_dep` — FastAPI dependency-injected version (can access DB, current user, etc.)
- `pre_create_hook(metadata: dict, upload_info: dict)` — Validate before creating upload; raise `HTTPException` to reject
- `pre_create_dep` — Dependency-injected version of pre-create
- `file_dep` — Dependency injection for file operations
- `auth` — Authentication dependency (e.g., `Depends(current_active_user)`)

**Key Features**:
- Resumable chunked uploads with configurable max size (default ~128 GB)
- Metadata storage for filename and filetype
- Automatic expiration and cleanup (configurable `days_to_keep`, default 5)
- `remove_expired_files()` method for scheduled cleanup
- Download endpoint (serves completed files)
- DELETE endpoint (terminate uploads)
- OPTIONS endpoint (protocol discovery)

**Strengths**:
- Purpose-built for FastAPI — not a framework-agnostic wrapper
- FastAPI dependency injection for auth, DB access, and hooks
- Single dependency (`fastapi`), lightweight
- Active maintenance
- CORS header exposure documented clearly
- Example project with frontend included

**Weaknesses**:
- No checksum verification (the `Upload-Checksum` extension is not implemented)
- No concatenation support
- No S3 storage backend (local filesystem only)
- Relatively small community (34 stars)
- No distributed locking — single-instance only (fine for Cleave)
- Metadata stored as local files (not DB-backed)

### 2.2 fastapi-tusd

| Field | Value |
|-------|-------|
| **PyPI** | https://pypi.org/project/fastapi-tusd/ |
| **GitHub** | https://github.com/liviaerxin/fastapi-tusd |
| **Version** | 0.100.2 (May 10, 2024) |
| **Stars** | 13 |
| **License** | MIT |
| **Python** | >= 3.7 |
| **Dependencies** | `fastapi`, `pydantic` |
| **WSGI/ASGI** | **ASGI** (FastAPI router) |
| **Maintenance** | Low activity (last update May 2024, 0 open issues) |

**Tus Extensions Supported**: Core protocol, Creation-With-Upload. Checksum (MD5), Expiration, Concatenation, and S3 storage listed as TODO/not implemented.

**Integration Approach**: Provides a `TusRouter` class that you instantiate with `store_dir` and `location` parameters, then `include_router()` into your FastAPI app.

```python
from fastapi_tusd import TusRouter
app.include_router(TusRouter(store_dir="./files", location="/files"), prefix="/files")
```

**Strengths**:
- Inspired by tusd's design patterns
- Claims S3 backend support (though marked incomplete)
- Listed on official tus.io implementations page

**Weaknesses**:
- Stale — no updates in almost 2 years (as of March 2026)
- Most advertised features (checksum, expiration, concatenation, S3) are NOT actually implemented
- No hook system for upload completion callbacks
- No authentication integration
- No dependency injection support
- Very small community (13 stars)
- Pre-1.0 version suggests incomplete implementation
- **Not recommended for production use**

### 2.3 resumable-upload

| Field | Value |
|-------|-------|
| **PyPI** | https://pypi.org/project/resumable-upload/ |
| **GitHub** | https://github.com/sts07142/resumable-upload |
| **Version** | 0.0.3 (February 28, 2026) |
| **Stars** | 5 |
| **License** | MIT |
| **Python** | 3.9 — 3.14 |
| **Dependencies** | **Zero** (stdlib only) |
| **WSGI/ASGI** | **WSGI** (`http.server.HTTPServer` based) |
| **Maintenance** | New project, actively developed |

**Tus Extensions Supported**: Core, Creation, Creation-With-Upload, Termination, Checksum (SHA1), Expiration. Concatenation NOT supported.

**Integration Approach**: Uses Python's built-in `http.server.HTTPServer` as its server foundation. Claims "web framework integration" with Flask, FastAPI, and Django in its docs, but the server example uses the stdlib HTTP server — meaning **it is fundamentally WSGI/synchronous**. Integrating with FastAPI would require either:
- Running it as a separate process alongside FastAPI
- Mounting it via `WSGIMiddleware` (adds overhead, loses async benefits)
- Porting its handler logic into FastAPI routes manually

**Storage Backend**: SQLiteStorage (SQLite metadata + filesystem for chunks). Thread-safety via per-upload locks and `fcntl.flock` for process-safety.

**Strengths**:
- Zero external dependencies — impressive engineering
- Both client AND server in one package
- SHA1 checksum verification built-in
- Automatic retry with exponential backoff (client side)
- Cross-session resume capability
- Comprehensive test suite
- Slowloris protection (request timeouts)
- Very recent development (Feb 2026)

**Weaknesses**:
- **WSGI-based — does not natively work with ASGI/FastAPI**
- Only 5 GitHub stars, brand new project (v0.0.3)
- Pre-production maturity
- SQLite storage backend has known scaling limitations under concurrent writes
- `fcntl.flock` is Unix-only (no Windows support, though irrelevant for EC2)
- No FastAPI dependency injection or middleware integration
- Would need significant adaptation work to use with FastAPI
- **Not suitable for direct FastAPI integration without major effort**

### 2.4 FasTUS

| Field | Value |
|-------|-------|
| **Source** | https://gitea.com/utdream/FasTUS |
| **Author** | Jordan Michaels (utdream) |
| **License** | Unlicense (public domain) |
| **WSGI/ASGI** | **ASGI** (built on FastAPI) |

**Not a library — it's a project template.** FasTUS is a complete FastAPI application implementing a tus server, not a reusable package. You would fork it and modify it.

**Tus Extensions Supported**: Core, Creation, Creation-With-Upload, Expiration, Checksum (multiple algorithms including SHA256, MD5), Termination, Concatenation.

**Notable Features**:
- SQLAlchemy ORM with SQLite (configurable)
- Server-side MIME type verification
- File organization by type
- Multiple checksum algorithms
- CORS + X-HTTP-Method-Override support
- Example Uppy and tus-js-client frontends included

**Strengths**:
- Most complete tus extension coverage of any Python implementation
- Production architecture (NGINX -> Gunicorn -> Uvicorn workers)
- Good reference implementation to study

**Weaknesses**:
- Not a pip-installable library — it's a template/fork project
- Hosted on Gitea, not GitHub/PyPI — less discoverable
- Single author, unknown maintenance commitment
- Would need to extract and adapt tus logic into Cleave's existing codebase

### 2.5 aiohttp-tus

| Field | Value |
|-------|-------|
| **PyPI** | https://pypi.org/project/aiohttp-tus/ |
| **GitHub** | https://github.com/pylotcode/aiohttp-tus |
| **Stars** | 17 |
| **License** | BSD-3-Clause |
| **Python** | >= 3.6 |
| **Dependencies** | `aiohttp >= 3.5` |
| **WSGI/ASGI** | **Async** but aiohttp-specific (NOT ASGI-compatible with FastAPI) |
| **Maintenance** | Last commit December 2022 — **effectively abandoned** |

**Not compatible with FastAPI.** This library is built specifically for the `aiohttp.web` framework, which has its own async server protocol (not ASGI). Using it with FastAPI would require running a separate aiohttp process, eliminating any integration benefits.

**Verdict**: Skip. Wrong framework, abandoned.

### 2.6 django-tus / drf-tus

**django-tus**:
- GitHub: https://github.com/alican/django-tus (57 stars)
- Last commit: February 2021 — **abandoned**
- Django 2.2-3.2 only (does not support Django 4+ or 5+)
- Incomplete tus extension coverage ("More Tus-Extensions" listed as TODO)

**drf-tus** (Django REST Framework):
- GitHub: https://github.com/dirkmoors/drf-tus (31 stars)
- Latest version: 2.0.3 (January 2026 — supports Django 6.x!)
- **Actively maintained**
- Extensions: Core, Creation, Expiration, Checksum, Termination
- Most complete Django tus implementation

**Verdict**: Not relevant to Cleave (we use FastAPI, not Django). Noted for completeness. drf-tus is the best Django option if anyone needs one.

---

## 3. Alternative: Standalone tusd (Go Binary) + HTTP Hooks

**tusd** is the official reference implementation of the tus protocol, written in Go. It is the most battle-tested, feature-complete tus server in existence.

| Feature | tusd |
|---------|------|
| **All tus extensions** | Yes (creation, expiration, checksum, termination, concatenation, creation-with-upload, creation-defer-length) |
| **Storage backends** | Local disk, AWS S3, Google Cloud Storage, Azure Blob |
| **Upload locking** | File-based (local) or memory-based (cloud). No distributed locking built-in. |
| **Network resilience** | Detects broken connections, cleans up gracefully |
| **Hook system** | pre-create, post-create, post-receive, pre-finish, post-finish, pre-terminate, post-terminate |
| **Hook delivery** | File scripts, HTTP POST, gRPC, Go plugins |

### Integration Pattern with FastAPI

```
Browser (tus-js-client)
    │
    ▼  PATCH/HEAD/POST /uploads/
┌────────┐
│ NGINX  │ ──── proxy ──── tusd binary (:1080)
│ :443   │                     │
│        │                HTTP hooks (POST)
│        │                     │
│        │                     ▼
│        │ ──── proxy ──── FastAPI (:8000)
│        │                     │
└────────┘               /api/v1/hooks/tus-*
                               │
                           Validate auth
                           Create DB records
                           Trigger post-processing
```

**How it works**:
1. tusd runs as a separate process (systemd unit) on the same instance
2. NGINX routes `/uploads/*` to tusd, `/api/*` to FastAPI
3. tusd is started with `--hooks-http http://localhost:8000/api/v1/hooks/tus` and `-behind-proxy`
4. On pre-create: tusd POSTs to FastAPI with upload metadata; FastAPI validates auth (via a token in metadata), checks permissions, and returns 200 (accept) or 400+ (reject)
5. On post-finish: tusd POSTs to FastAPI; FastAPI creates `fastq_files` DB records, triggers FastQC, etc.
6. tusd handles all the protocol complexity, locking, checksums, expiration

**Strengths**:
- Most robust, battle-tested tus server available
- Handles ALL protocol edge cases correctly
- S3 storage backend for future scaling
- Maintained by the tus protocol creators themselves
- Used in production by major companies (Vimeo, Transloadit)

**Weaknesses for Cleave**:
- **Additional process to manage** (systemd unit, deployment complexity)
- **Go binary dependency** — must install Go or download pre-built binary
- **Hook-based integration** is indirect — auth tokens must be passed via Upload-Metadata since tusd doesn't share FastAPI's auth middleware
- **More moving parts** for a small 8-10 user application
- NGINX config becomes more complex (two proxy targets)
- Debugging upload issues requires reading tusd logs separately from FastAPI logs

---

## 4. Alternative: Hand-Rolled Implementation

Build tus server logic directly into FastAPI routes without any library.

**Estimated effort**: 300-500 lines of Python for core + creation + expiration + termination. Add ~100 more for checksum support.

**What you'd need to implement**:
- `OPTIONS /uploads/` — Return `Tus-Version`, `Tus-Extension`, `Tus-Max-Size`
- `POST /uploads/` — Parse `Upload-Length`, `Upload-Metadata`, create resource, return `Location`
- `HEAD /uploads/{id}` — Return `Upload-Offset`, `Upload-Length`
- `PATCH /uploads/{id}` — Validate offset, append bytes, update offset, return new offset
- `DELETE /uploads/{id}` — Remove resource and files
- Metadata storage (DB table or JSON files alongside upload chunks)
- Expiration tracking and cleanup cron
- Proper header validation on every request
- CORS header exposure

**Strengths**:
- Full control over behavior
- No additional dependencies
- Direct FastAPI integration with native auth, DB, etc.
- Can store metadata directly in Postgres (no separate metadata files)

**Weaknesses**:
- Must handle all edge cases yourself (see Section 6)
- No community review or battle-testing
- Offset race conditions are easy to get wrong
- Missing features you didn't think to implement will cause tus-js-client errors
- Maintenance burden — protocol updates, client compatibility issues
- **Contradicts Cleave's CLAUDE.md principle: "Prefer dependencies over hand-rolled code"**

---

## 5. Comparison Matrix

| Feature | tuspyserver | fastapi-tusd | resumable-upload | FasTUS | tusd (Go) | Hand-Rolled |
|---------|:-----------:|:------------:|:----------------:|:------:|:---------:|:-----------:|
| **FastAPI native** | Yes | Yes | No (WSGI) | Yes (template) | No (separate process) | Yes |
| **ASGI/async** | Yes | Yes | No | Yes | N/A | Yes |
| **Creation** | Yes | Yes | Yes | Yes | Yes | Must build |
| **Creation-With-Upload** | ? | Yes | Yes | Yes | Yes | Must build |
| **Expiration** | Yes | No | Yes | Yes | Yes | Must build |
| **Checksum** | No | No | Yes (SHA1) | Yes (multi) | Yes | Must build |
| **Termination** | Yes | Partial | Yes | Yes | Yes | Must build |
| **Concatenation** | No | No | No | Yes | Yes | Must build |
| **Auth integration** | DI-based | None | None | Custom | HTTP hooks | Native |
| **Hook system** | Yes (DI) | None | None | Custom | Yes (HTTP/gRPC/file) | Native |
| **Storage backends** | Local FS | Local FS | SQLite + FS | SQLAlchemy | FS, S3, GCS, Azure | Custom |
| **Upload locking** | ? | ? | fcntl.flock | SQLAlchemy | File/Memory locks | Must build |
| **PyPI installable** | Yes | Yes | Yes | No | N/A | N/A |
| **Active maintenance** | Yes (Nov 2025) | No (May 2024) | Yes (Feb 2026) | ? | Yes | You |
| **Community size** | 34 stars | 13 stars | 5 stars | N/A | 10k+ stars | N/A |
| **Deployment complexity** | Low | Low | Medium | Medium | High | Low |

---

## 6. Implementation Pitfalls (What a Naive Approach Misses)

These are the gotchas that make a tus server harder than it looks. Any hand-rolled implementation or immature library will likely hit these:

### 6.1 Offset Validation Race Conditions

The core protocol's `409 Conflict` response is the **only** concurrency protection mechanism. If two PATCH requests arrive simultaneously for the same upload:

1. Both read the current offset (e.g., 1000)
2. Both send `Upload-Offset: 1000`
3. Without locking, both could write to byte 1000, corrupting the file

**Proper handling**: Acquire a per-upload lock before reading the current offset. Hold the lock for the entire duration of the PATCH (read offset -> validate -> write bytes -> update offset). The tusd documentation explicitly warns about this.

### 6.2 Upload Locking and Stale Locks

When a client disconnects mid-upload, the server may still hold the lock for that upload. The next resume attempt will be blocked indefinitely.

**Proper handling**: Implement lock timeout or lock interruption. tusd's approach: when a new request arrives for a locked resource, the lock holder is asked to release. The existing handler closes the request body, saves any received data, and releases the lock.

### 6.3 Abandoned Upload Cleanup

Uploads that are never completed consume disk space indefinitely.

**Proper handling**:
- Track upload creation time and last-modified time
- Run periodic cleanup (cron job or background task)
- Implement the Expiration extension to inform clients
- Return `410 Gone` for expired uploads (not just `404`)
- Clean up both the data file AND metadata

### 6.4 Checksum Verification

Without the Checksum extension, there is no way to detect data corruption during transfer (TCP checksums are insufficient for application-level integrity).

**Proper handling**: Support at least SHA1 (required by spec if checksum extension is implemented). On checksum mismatch (`460`), discard the chunk completely — do not update the offset. The client will retry the same chunk.

### 6.5 Partial Writes and Crash Recovery

If the server crashes mid-write (during a PATCH), the file on disk may be longer than the stored offset. On restart, the offset says "1000 bytes" but the file is 1500 bytes.

**Proper handling**: On resume (HEAD request), always verify the actual file size matches the stored offset. Truncate the file to the stored offset if they diverge.

### 6.6 Upload-Metadata Sanitization

Metadata values are Base64-encoded, but after decoding, they could contain:
- Path traversal characters (`../../../etc/passwd`)
- Null bytes
- HTTP header injection sequences

**Proper handling**: Decode metadata values, validate against allowed patterns (especially `filename`), and NEVER use raw metadata values in filesystem paths or HTTP headers without sanitization.

### 6.7 CORS Header Exposure

tus-js-client needs to read response headers (`Upload-Offset`, `Location`, `Tus-Resumable`, etc.) from JavaScript. By default, CORS only exposes "simple" headers.

**Proper handling**: Set `Access-Control-Expose-Headers` to include all tus headers:
```
Location, Upload-Offset, Tus-Resumable, Tus-Version, Tus-Extension, Tus-Max-Size, Upload-Expires, Upload-Length
```

### 6.8 Network Timeouts and Broken Connections

Servers often detect client disconnection much later than clients detect server disconnection. During this window, the server may continue holding locks and writing to the upload.

**Proper handling**: Set read/write timeouts on sockets. Monitor for broken pipes. Release locks promptly on connection errors.

### 6.9 X-HTTP-Method-Override

Some corporate proxies or firewalls strip PATCH and DELETE methods. The tus spec supports `X-HTTP-Method-Override: PATCH` on a POST request as a workaround.

**Proper handling**: Check for this header on POST requests and dispatch accordingly.

### 6.10 Content-Length vs. Transfer-Encoding

Clients may send PATCH requests with either `Content-Length` or `Transfer-Encoding: chunked`. The server must handle both correctly, especially for determining when the request body is fully received.

---

## 7. Recommendation for Cleave

### Primary: tuspyserver

**tuspyserver** is the clear best choice for Cleave's requirements:

1. **Native FastAPI integration** — It IS a FastAPI router. No adapters, no WSGI bridging, no separate processes.
2. **Dependency injection for auth** — Pass `auth=Depends(current_active_user)` to protect upload endpoints with the same auth as the rest of the API.
3. **Upload completion hooks with DI** — `upload_complete_dep` can access the database session, current user, and create `fastq_files` records on upload completion.
4. **Pre-create validation** — Validate file types, sizes, and experiment permissions before accepting an upload.
5. **Built-in expiration** — Configurable `days_to_keep` with `remove_expired_files()` for cleanup.
6. **Minimal dependency footprint** — Only requires `fastapi`.
7. **Matches the project's phase 2 needs exactly** — FASTQ upload with metadata, auth, and post-processing.

**Missing features and mitigations**:

| Missing | Mitigation |
|---------|-----------|
| Checksum verification | Accept the risk for Phase 2. FASTQ integrity can be verified post-upload via file size + md5sum comparison. Add checksum to tuspyserver via PR or monkey-patch later. |
| S3 storage | Not needed. Cleave uses local disk (`/data/cleave/`). S3 is a Phase 7+ consideration. |
| Concatenation | Not needed. FASTQ files are uploaded sequentially, not in parallel chunks. |
| Distributed locking | Not needed. Single EC2 instance, single worker. |

### Fallback: Hand-rolled (if tuspyserver proves inadequate)

If tuspyserver has a blocking bug or missing feature that can't be worked around, the fallback is to hand-roll the tus server directly in FastAPI routes. The protocol is well-specified and the core implementation is ~300-500 lines. However, this should be a last resort — per the project's coding standards, we prefer battle-tested dependencies over hand-rolled code.

### Not Recommended

- **fastapi-tusd**: Abandoned, incomplete, no hooks or auth support.
- **resumable-upload**: WSGI-based, doesn't integrate with FastAPI's async model.
- **tusd (Go)**: Overkill deployment complexity for 8-10 users. Correct choice for enterprise, wrong choice for a single-instance lab tool.
- **aiohttp-tus**: Wrong framework, abandoned.

---

## 8. tuspyserver Integration Example for Cleave

### Installation

```bash
pip install tuspyserver
# or in pyproject.toml:
# dependencies = [..., "tuspyserver>=4.2.3"]
```

### Backend Integration

```python
# backend/routers/uploads.py
from fastapi import Depends, HTTPException
from tuspyserver import create_tus_router
from backend.auth import current_active_user
from backend.database import get_db
from backend.models import User, FastqFile, Experiment
from backend.services.fastq_service import process_uploaded_fastq
from sqlalchemy.ext.asyncio import AsyncSession


# Pre-create hook: validate upload before accepting
def validate_fastq_upload(metadata: dict, upload_info: dict):
    """Reject uploads that don't meet FASTQ requirements."""
    filename = metadata.get("filename", "")

    # Must be .fastq.gz or .fastq
    if not filename.endswith((".fastq.gz", ".fastq", ".fq.gz", ".fq")):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {filename}. Only .fastq.gz files accepted."
        )

    # Must start with alphanumeric (Illumina convention)
    if filename and not filename[0].isalnum():
        raise HTTPException(
            status_code=400,
            detail="FASTQ filenames must start with an alphanumeric character."
        )

    # Enforce max upload size (5 GB default)
    max_size = 5 * 1024 * 1024 * 1024  # 5 GB
    if upload_info.get("size") and upload_info["size"] > max_size:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size: {max_size / (1024**3):.0f} GB"
        )


# Upload completion hook with dependency injection
def on_fastq_upload_complete(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(current_active_user),
):
    """Process completed FASTQ upload: create DB record, trigger FastQC."""
    async def handler(file_path: str, metadata: dict):
        experiment_id = int(metadata.get("experimentId", 0))

        # Verify user has access to this experiment
        experiment = await db.get(Experiment, experiment_id)
        if not experiment:
            raise HTTPException(status_code=404, detail="Experiment not found")

        # Create fastq_files record and move file to correct location
        await process_uploaded_fastq(
            db=db,
            experiment_id=experiment_id,
            file_path=file_path,
            filename=metadata.get("filename", ""),
            user_id=current_user.id,
        )

    return handler


# Create the tus router
tus_files_router = create_tus_router(
    prefix="uploads",
    files_dir="/data/cleave/uploads/staging",  # tus staging area
    max_size=128_849_018_880,                   # ~120 GB max
    auth=Depends(current_active_user),          # JWT auth on all endpoints
    days_to_keep=5,                             # auto-expire after 5 days
    pre_create_hook=validate_fastq_upload,
    upload_complete_dep=on_fastq_upload_complete,
)
```

### Mount in Main App

```python
# backend/main.py
from backend.routers.uploads import tus_files_router

app.include_router(tus_files_router, tags=["uploads"])
```

### CORS Configuration

```python
# backend/main.py — CORS must expose tus headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "Location",
        "Upload-Offset",
        "Tus-Resumable",
        "Tus-Version",
        "Tus-Extension",
        "Tus-Max-Size",
        "Upload-Expires",
        "Upload-Length",
    ],
)
```

### Frontend Integration (tus-js-client)

```typescript
// frontend/src/api/upload.ts
import * as tus from "tus-js-client";
import { getAccessToken } from "./client";

export function uploadFastq(
  file: File,
  experimentId: number,
  onProgress: (percent: number) => void,
  onSuccess: () => void,
  onError: (error: Error) => void,
): tus.Upload {
  const upload = new tus.Upload(file, {
    endpoint: "/api/v1/uploads/",
    retryDelays: [0, 1000, 3000, 5000, 10000],
    chunkSize: 50 * 1024 * 1024, // 50 MB chunks
    metadata: {
      filename: file.name,
      filetype: file.type || "application/octet-stream",
      experimentId: String(experimentId),
    },
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
    },
    onProgress: (bytesUploaded, bytesTotal) => {
      onProgress((bytesUploaded / bytesTotal) * 100);
    },
    onSuccess: () => {
      onSuccess();
    },
    onError: (error) => {
      onError(error);
    },
  });

  upload.start();
  return upload;
}
```

### Expiration Cleanup (Scheduled Task)

```python
# backend/worker.py or a scheduled task
from apscheduler.schedulers.asyncio import AsyncIOScheduler

# If using tuspyserver's built-in cleanup:
scheduler = AsyncIOScheduler()
scheduler.add_job(
    tus_files_router.remove_expired_files,
    trigger="cron",
    hour=2,  # Run at 2 AM daily
)
scheduler.start()
```

### NGINX Configuration (Production)

```nginx
# Upload endpoint — disable buffering for streaming
location /api/v1/uploads/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Critical for tus uploads
    client_max_body_size 0;           # No limit (tus handles sizing)
    proxy_request_buffering off;      # Stream directly to backend
    proxy_http_version 1.1;           # Required for chunked encoding
    proxy_read_timeout 600s;          # 10-min timeout for slow uploads
}
```

---

## 9. Sources

- [tus.io Protocol Specification v1.0.0](https://tus.io/protocols/resumable-upload)
- [tus.io Implementations Page](https://tus.io/implementations)
- [tus.io FAQ](https://tus.io/faq)
- [tuspyserver on PyPI](https://pypi.org/project/tuspyserver/)
- [tuspyserver on GitHub](https://github.com/edihasaj/tuspyserver)
- [fastapi-tusd on PyPI](https://pypi.org/project/fastapi-tusd/)
- [fastapi-tusd on GitHub](https://github.com/liviaerxin/fastapi-tusd)
- [resumable-upload on GitHub](https://github.com/sts07142/resumable-upload)
- [FasTUS on Gitea](https://gitea.com/utdream/FasTUS)
- [aiohttp-tus on GitHub](https://github.com/pylotcode/aiohttp-tus)
- [django-tus on GitHub](https://github.com/alican/django-tus)
- [drf-tus on GitHub](https://github.com/dirkmoors/drf-tus)
- [tusd Documentation — Upload Locks](https://tus.github.io/tusd/advanced-topics/locks/)
- [tusd Documentation — Hooks](https://tus.github.io/tusd/advanced-topics/hooks/)
- [tusd v2 Release Blog Post](https://tus.io/blog/2023/09/20/tusd-200)
- [Transloadit Community — Python tus with FastAPI](https://community.transloadit.com/t/python-server-tus-implementation-with-fastapi/16703)
- [tus-js-client on npm](https://www.npmjs.com/package/tus-js-client)
- [tus-node-server Race Condition Issue #150](https://github.com/tus/tus-node-server/issues/150)
