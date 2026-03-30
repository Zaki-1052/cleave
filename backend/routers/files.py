# backend/routers/files.py
import asyncio
import mimetypes
import queue as queue_mod
import re
from datetime import datetime
from pathlib import Path
from typing import AsyncIterator

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import current_active_user
from config import settings
from database import get_db
from models.analysis_job import AnalysisJob
from models.experiment import Experiment
from models.job_output import JobOutput
from models.project import Project, ProjectMember
from models.user import User
from schemas.file import (
    BatchDownloadRequest,
    DownloadTokenRequest,
    DownloadTokenResponse,
    FileTreeResponse,
    IGVTokenRequest,
    IGVTokenResponse,
    JobBatchDownloadRequest,
)
from services.download_token_service import create_download_token, verify_download_token
from services.file_service import (
    build_experiment_file_tree,
    get_xaccel_path,
    is_compressed_file,
    validate_experiment_path,
)
from services.permission_helpers import check_experiment_membership, is_reference_experiment

router = APIRouter()

ZIP_CHUNK_SIZE = 64 * 1024  # 64 KB


def _file_download_response(abs_path: Path) -> FileResponse | Response:
    """Return either a direct FileResponse or an X-Accel-Redirect response."""
    media_type, _ = mimetypes.guess_type(str(abs_path))
    if media_type is None:
        media_type = "application/octet-stream"

    if settings.NGINX_FILE_SERVING:
        xaccel_path = get_xaccel_path(
            abs_path, settings.STORAGE_ROOT, settings.NGINX_INTERNAL_PREFIX
        )
        return Response(
            content="",
            media_type=media_type,
            headers={
                "X-Accel-Redirect": xaccel_path,
                "Content-Disposition": f'attachment; filename="{abs_path.name}"',
            },
        )
    return FileResponse(abs_path, media_type=media_type, filename=abs_path.name)


def _sanitize_filename(name: str) -> str:
    """Replace non-alphanumeric characters (except dots, hyphens, underscores) with underscores."""
    return re.sub(r"[^\w.\-]", "_", name)


def _file_chunks(abs_path: Path):
    """Yield file contents in chunks for streaming zip."""
    with open(abs_path, "rb") as f:
        while chunk := f.read(ZIP_CHUNK_SIZE):
            yield chunk


async def _stream_zip(
    files: list[tuple[str, Path]],
) -> AsyncIterator[bytes]:
    """Stream a zip archive, reading each source file in chunks.

    Uses stream-zip for true streaming — never holds the full archive in memory.
    Synchronous generator runs in a thread to avoid blocking the event loop.
    """
    from stream_zip import NO_COMPRESSION_64, ZIP_64, stream_zip

    def _generate():
        member_files = []
        for archive_name, abs_path in files:
            method = NO_COMPRESSION_64 if is_compressed_file(abs_path.name) else ZIP_64
            stat = abs_path.stat()
            modified_at = datetime.fromtimestamp(stat.st_mtime)
            member_files.append((archive_name, modified_at, 0o644, method, _file_chunks(abs_path)))
        yield from stream_zip(member_files)

    chunk_queue: queue_mod.Queue[bytes | None] = queue_mod.Queue(maxsize=32)
    loop = asyncio.get_running_loop()

    def _run_generator():
        for chunk in _generate():
            chunk_queue.put(chunk)
        chunk_queue.put(None)

    writer_future = loop.run_in_executor(None, _run_generator)

    while True:
        chunk = await loop.run_in_executor(None, chunk_queue.get)
        if chunk is None:
            break
        yield chunk

    await writer_future


@router.get(
    "/experiments/{experiment_id}/files",
    response_model=FileTreeResponse,
)
async def list_experiment_files(
    experiment_id: int,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the full file tree for an experiment by scanning disk."""
    experiment = await check_experiment_membership(db, experiment_id, current_user.id)
    if experiment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found or not authorized",
        )

    root, total_files, total_size = build_experiment_file_tree(
        settings.STORAGE_ROOT, experiment.project_id, experiment_id
    )
    return FileTreeResponse(root=root, total_files=total_files, total_size=total_size)


@router.get("/experiments/{experiment_id}/files/download")
async def download_experiment_file(
    experiment_id: int,
    path: str = Query(..., description="Relative path within experiment directory"),
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Download a single file from an experiment directory."""
    experiment = await check_experiment_membership(db, experiment_id, current_user.id)
    if experiment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found or not authorized",
        )

    try:
        abs_path = validate_experiment_path(
            settings.STORAGE_ROOT, experiment.project_id, experiment_id, path
        )
    except ValueError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if not abs_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    return _file_download_response(abs_path)


@router.post("/experiments/{experiment_id}/files/batch-download")
async def batch_download_files(
    experiment_id: int,
    body: BatchDownloadRequest,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a zip archive of selected files and stream it back."""
    experiment = await check_experiment_membership(db, experiment_id, current_user.id)
    if experiment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found or not authorized",
        )

    if not body.paths:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file paths provided",
        )

    if len(body.paths) > settings.BATCH_DOWNLOAD_MAX_FILES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Too many files (max {settings.BATCH_DOWNLOAD_MAX_FILES})",
        )

    valid_files: list[tuple[str, Path]] = []
    skipped: list[str] = []
    total_size = 0

    for rel_path in body.paths:
        try:
            abs_path = validate_experiment_path(
                settings.STORAGE_ROOT, experiment.project_id, experiment_id, rel_path
            )
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: {rel_path}",
            )

        if not abs_path.is_file():
            skipped.append(rel_path)
            continue

        total_size += abs_path.stat().st_size
        valid_files.append((rel_path, abs_path))

    if not valid_files:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="None of the requested files exist",
        )

    if total_size > settings.BATCH_DOWNLOAD_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Total file size exceeds maximum for batch download",
        )

    zip_filename = _sanitize_filename(f"{experiment.name}_files.zip")
    headers: dict[str, str] = {
        "Content-Disposition": f'attachment; filename="{zip_filename}"',
    }
    if skipped:
        headers["X-Batch-Skipped"] = ", ".join(skipped)

    return StreamingResponse(
        _stream_zip(valid_files),
        media_type="application/zip",
        headers=headers,
    )


@router.get("/jobs/{job_id}/files/{file_id}/download")
async def download_job_file(
    job_id: int,
    file_id: int,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Download a specific output file from an analysis job."""
    result = await db.execute(
        select(JobOutput)
        .join(AnalysisJob, AnalysisJob.id == JobOutput.job_id)
        .join(Experiment, Experiment.id == AnalysisJob.experiment_id)
        .join(Project, Project.id == Experiment.project_id)
        .outerjoin(
            ProjectMember,
            and_(
                ProjectMember.project_id == Experiment.project_id,
                ProjectMember.user_id == current_user.id,
            ),
        )
        .where(
            JobOutput.id == file_id,
            JobOutput.job_id == job_id,
            or_(ProjectMember.user_id.isnot(None), Project.is_reference.is_(True)),
        )
    )
    output = result.scalar_one_or_none()
    if output is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    abs_path = (Path(settings.STORAGE_ROOT) / output.file_path).resolve()
    storage_root = Path(settings.STORAGE_ROOT).resolve()
    if not str(abs_path).startswith(str(storage_root) + "/"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if not abs_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk")

    return _file_download_response(abs_path)


@router.post("/jobs/{job_id}/files/batch-download")
async def batch_download_job_files(
    job_id: int,
    body: JobBatchDownloadRequest,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a zip archive of selected job output files and stream it back."""
    if not body.output_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No output IDs provided",
        )

    if len(body.output_ids) > settings.BATCH_DOWNLOAD_MAX_FILES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Too many files (max {settings.BATCH_DOWNLOAD_MAX_FILES})",
        )

    # Verify user access and fetch outputs in one query
    result = await db.execute(
        select(JobOutput)
        .join(AnalysisJob, AnalysisJob.id == JobOutput.job_id)
        .join(Experiment, Experiment.id == AnalysisJob.experiment_id)
        .join(Project, Project.id == Experiment.project_id)
        .outerjoin(
            ProjectMember,
            and_(
                ProjectMember.project_id == Experiment.project_id,
                ProjectMember.user_id == current_user.id,
            ),
        )
        .where(
            JobOutput.job_id == job_id,
            JobOutput.id.in_(body.output_ids),
            or_(ProjectMember.user_id.isnot(None), Project.is_reference.is_(True)),
        )
    )
    outputs = list(result.scalars().all())
    if not outputs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No accessible files found",
        )

    storage_root = Path(settings.STORAGE_ROOT).resolve()
    valid_files: list[tuple[str, Path]] = []
    total_size = 0

    for output in outputs:
        abs_path = (Path(settings.STORAGE_ROOT) / output.file_path).resolve()
        if not str(abs_path).startswith(str(storage_root) + "/"):
            continue
        if not abs_path.is_file():
            continue
        total_size += abs_path.stat().st_size
        valid_files.append((output.filename, abs_path))

    if not valid_files:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="None of the requested files exist on disk",
        )

    if total_size > settings.BATCH_DOWNLOAD_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Total file size exceeds maximum for batch download",
        )

    zip_filename = _sanitize_filename(f"job_{job_id}_files.zip")
    return StreamingResponse(
        _stream_zip(valid_files),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{zip_filename}"'},
    )


@router.post("/files/download-token", response_model=DownloadTokenResponse)
async def create_download_token_endpoint(
    body: DownloadTokenRequest,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a short-lived signed token for browser-native file downloads."""
    experiment = await check_experiment_membership(db, body.experiment_id, current_user.id)
    if experiment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found or not authorized",
        )

    if body.path and body.paths:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either 'path' (single) or 'paths' (batch), not both",
        )

    if body.path:
        try:
            abs_path = validate_experiment_path(
                settings.STORAGE_ROOT, experiment.project_id, body.experiment_id, body.path
            )
        except ValueError:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        if not abs_path.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

        payload = {
            "type": "single",
            "exp_id": body.experiment_id,
            "proj_id": experiment.project_id,
            "path": body.path,
        }
    elif body.paths:
        payload = {
            "type": "batch",
            "exp_id": body.experiment_id,
            "proj_id": experiment.project_id,
            "paths": body.paths,
        }
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide 'path' or 'paths'",
        )

    token = create_download_token(
        payload, settings.SECRET_KEY, settings.DOWNLOAD_TOKEN_EXPIRY_SECONDS
    )
    return DownloadTokenResponse(url=f"/api/v1/files/signed-download?token={token}")


@router.get("/files/signed-download")
async def signed_download(
    token: str = Query(...),
    display: str = Query("attachment", pattern="^(attachment|inline)$"),
):
    """Download or view a file using a signed token. No JWT auth required."""
    payload = verify_download_token(token, settings.SECRET_KEY)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired download token",
        )

    download_type = payload.get("type")
    experiment_id = payload.get("exp_id")
    project_id = payload.get("proj_id")

    if download_type == "single":
        rel_path = payload.get("path")
        if not rel_path or not experiment_id or not project_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")

        try:
            abs_path = validate_experiment_path(
                settings.STORAGE_ROOT, project_id, experiment_id, rel_path
            )
        except ValueError:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        if not abs_path.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

        if display == "inline":
            media_type, _ = mimetypes.guess_type(str(abs_path))
            return FileResponse(abs_path, media_type=media_type or "text/html")

        return _file_download_response(abs_path)

    elif download_type == "batch":
        paths = payload.get("paths", [])
        if not paths or not experiment_id or not project_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token")

        valid_files: list[tuple[str, Path]] = []
        skipped: list[str] = []
        for rel_path in paths:
            try:
                abs_path = validate_experiment_path(
                    settings.STORAGE_ROOT, project_id, experiment_id, rel_path
                )
            except ValueError:
                continue
            if not abs_path.is_file():
                skipped.append(rel_path)
                continue
            valid_files.append((rel_path, abs_path))

        if not valid_files:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="None of the requested files exist",
            )

        zip_filename = f"batch_download_{experiment_id}.zip"
        dl_headers: dict[str, str] = {
            "Content-Disposition": f'attachment; filename="{zip_filename}"',
        }
        if skipped:
            dl_headers["X-Batch-Skipped"] = ", ".join(skipped)

        return StreamingResponse(
            _stream_zip(valid_files),
            media_type="application/zip",
            headers=dl_headers,
        )

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid token type")


# ---------------------------------------------------------------------------
# IGV.js file serving (Range-aware, token-authenticated)
# ---------------------------------------------------------------------------

_RANGE_RE = re.compile(r"bytes=(\d+)-(\d*)")
_IGV_RANGE_CHUNK = 256 * 1024  # 256 KB read chunks for streaming


def _range_file_response(abs_path: Path, range_header: str | None) -> Response:
    """Serve a file with optional HTTP Range support (RFC 7233).

    In production, NGINX handles Range natively via X-Accel-Redirect.
    This implementation is for dev mode only.
    """
    file_size = abs_path.stat().st_size
    media_type, _ = mimetypes.guess_type(str(abs_path))
    if media_type is None:
        media_type = "application/octet-stream"

    base_headers = {
        "Accept-Ranges": "bytes",
        "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
    }

    def _full_file_stream():
        """Stream full file content in chunks."""
        with open(abs_path, "rb") as f:
            while chunk := f.read(_IGV_RANGE_CHUNK):
                yield chunk

    if range_header is None:
        return StreamingResponse(
            _full_file_stream(),
            media_type=media_type,
            headers={**base_headers, "Content-Length": str(file_size)},
        )

    match = _RANGE_RE.match(range_header)
    if not match:
        # Malformed Range header — serve full file via streaming
        # (FileResponse would parse the invalid Range header and return 400)
        return StreamingResponse(
            _full_file_stream(),
            media_type=media_type,
            headers={**base_headers, "Content-Length": str(file_size)},
        )

    start = int(match.group(1))
    end_str = match.group(2)
    end = int(end_str) if end_str else file_size - 1

    # Validate range bounds
    if start >= file_size or start > end:
        return Response(
            content="",
            status_code=416,
            headers={
                "Content-Range": f"bytes */{file_size}",
                **base_headers,
            },
        )

    # Clamp end to file size
    if end >= file_size:
        end = file_size - 1

    content_length = end - start + 1

    def _read_range():
        with open(abs_path, "rb") as f:
            f.seek(start)
            remaining = content_length
            while remaining > 0:
                chunk_size = min(_IGV_RANGE_CHUNK, remaining)
                data = f.read(chunk_size)
                if not data:
                    break
                remaining -= len(data)
                yield data

    return StreamingResponse(
        _read_range(),
        status_code=206,
        media_type=media_type,
        headers={
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(content_length),
            **base_headers,
        },
    )


@router.post("/files/igv-tokens", response_model=IGVTokenResponse)
async def create_igv_tokens(
    body: IGVTokenRequest,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate signed tokens for IGV.js to load track files via Range requests."""
    if not body.output_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No output IDs provided",
        )

    # Verify user has access and fetch all requested outputs in one query
    result = await db.execute(
        select(JobOutput)
        .join(AnalysisJob, AnalysisJob.id == JobOutput.job_id)
        .join(Experiment, Experiment.id == AnalysisJob.experiment_id)
        .join(Project, Project.id == Experiment.project_id)
        .outerjoin(
            ProjectMember,
            and_(
                ProjectMember.project_id == Experiment.project_id,
                ProjectMember.user_id == current_user.id,
            ),
        )
        .where(
            JobOutput.id.in_(body.output_ids),
            or_(ProjectMember.user_id.isnot(None), Project.is_reference.is_(True)),
        )
    )
    outputs = list(result.scalars().all())

    if not outputs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No accessible outputs found",
        )

    tokens: dict[int, str] = {}
    for output in outputs:
        payload = {
            "type": "igv",
            "job_id": output.job_id,
            "output_id": output.id,
        }
        token = create_download_token(
            payload, settings.SECRET_KEY, settings.IGV_TOKEN_EXPIRY_SECONDS
        )
        tokens[output.id] = f"/api/v1/files/igv-serve?token={token}"

    return IGVTokenResponse(tokens=tokens)


@router.get("/files/igv-serve")
async def igv_serve_file(
    request: Request,
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Serve a file for IGV.js with Range header support. Token-authenticated (no JWT)."""
    payload = verify_download_token(token, settings.SECRET_KEY)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    if payload.get("type") != "igv":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid token type",
        )

    output_id = payload.get("output_id")
    if output_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid token payload",
        )

    result = await db.execute(select(JobOutput).where(JobOutput.id == output_id))
    output = result.scalar_one_or_none()
    if output is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )

    abs_path = (Path(settings.STORAGE_ROOT) / output.file_path).resolve()
    storage_root = Path(settings.STORAGE_ROOT).resolve()
    if not str(abs_path).startswith(str(storage_root) + "/"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    if not abs_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found on disk",
        )

    if settings.NGINX_FILE_SERVING:
        xaccel_path = get_xaccel_path(
            abs_path, settings.STORAGE_ROOT, settings.NGINX_INTERNAL_PREFIX
        )
        return Response(
            content="",
            headers={
                "X-Accel-Redirect": xaccel_path,
                "Accept-Ranges": "bytes",
                "Access-Control-Expose-Headers": ("Content-Range, Content-Length, Accept-Ranges"),
            },
        )

    range_header = request.headers.get("range")
    return _range_file_response(abs_path, range_header)


# ---------------------------------------------------------------------------
# BED file upload (for custom heatmaps and other reference-point features)
# ---------------------------------------------------------------------------

_MAX_BED_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB


@router.post("/experiments/{experiment_id}/upload-bed")
async def upload_bed_file(
    experiment_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload a BED file for use as reference points in custom heatmaps.

    Validates format (tab-delimited, >= 3 columns), saves to experiment
    uploads directory, and returns the relative storage path.
    """
    experiment = await check_experiment_membership(db, experiment_id, current_user.id)
    if experiment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found or not authorized",
        )

    if await is_reference_experiment(db, experiment_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot upload to a reference project",
        )

    filename = file.filename or "upload.bed"
    if not filename.lower().endswith(".bed"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must have a .bed extension",
        )

    content = await file.read()
    if len(content) > _MAX_BED_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"BED file too large (max {_MAX_BED_SIZE_BYTES // (1024 * 1024)} MB)",
        )

    # Basic BED format validation: tab-delimited, >= 3 columns, non-empty
    lines = content.decode("utf-8", errors="replace").splitlines()
    data_lines = [ln for ln in lines if ln.strip() and not ln.startswith("#")]
    if not data_lines:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="BED file is empty (no data lines)",
        )

    for i, line in enumerate(data_lines[:5]):
        cols = line.split("\t")
        if len(cols) < 3:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Line {i + 1}: expected >= 3 tab-separated columns, got {len(cols)}",
            )

    safe_name = _sanitize_filename(filename)
    rel_dir = f"projects/{experiment.project_id}/{experiment_id}/uploads/bed"
    abs_dir = Path(settings.STORAGE_ROOT) / rel_dir
    abs_dir.mkdir(parents=True, exist_ok=True)

    abs_path = abs_dir / safe_name
    abs_path.write_bytes(content)

    rel_path = f"{rel_dir}/{safe_name}"
    return {
        "path": rel_path,
        "filename": safe_name,
        "line_count": len(data_lines),
    }
