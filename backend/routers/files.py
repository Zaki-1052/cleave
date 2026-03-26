# backend/routers/files.py
import mimetypes
import re
import zipfile
from io import BytesIO
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
from schemas.file import BatchDownloadRequest, FileTreeResponse
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


async def _stream_zip(
    files: list[tuple[str, Path]],
) -> AsyncIterator[bytes]:
    """Build a zip archive in memory and stream it in chunks."""
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w") as zf:
        for archive_name, abs_path in files:
            compression = (
                zipfile.ZIP_STORED
                if is_compressed_file(abs_path.name)
                else zipfile.ZIP_DEFLATED
            )
            zf.write(abs_path, arcname=archive_name, compress_type=compression)

    buffer.seek(0)
    while True:
        chunk = buffer.read(ZIP_CHUNK_SIZE)
        if not chunk:
            break
        yield chunk


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
