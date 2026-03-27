# backend/routers/files.py
import asyncio
import mimetypes
import queue as queue_mod
import re
from datetime import datetime
from pathlib import Path
from typing import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import current_active_user
from config import settings
from database import get_db
from models.analysis_job import AnalysisJob
from models.experiment import Experiment
from models.job_output import JobOutput
from models.project import ProjectMember
from models.user import User
from schemas.file import (
    BatchDownloadRequest,
    DownloadTokenRequest,
    DownloadTokenResponse,
    FileTreeResponse,
    JobBatchDownloadRequest,
)
from services.download_token_service import create_download_token, verify_download_token
from services.file_service import (
    build_experiment_file_tree,
    get_xaccel_path,
    is_compressed_file,
    validate_experiment_path,
)
from services.permission_helpers import check_experiment_membership

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
        .join(ProjectMember, ProjectMember.project_id == Experiment.project_id)
        .where(
            JobOutput.id == file_id,
            JobOutput.job_id == job_id,
            ProjectMember.user_id == current_user.id,
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
        .join(ProjectMember, ProjectMember.project_id == Experiment.project_id)
        .where(
            JobOutput.job_id == job_id,
            JobOutput.id.in_(body.output_ids),
            ProjectMember.user_id == current_user.id,
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
):
    """Download a file using a signed token. No JWT auth required."""
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
