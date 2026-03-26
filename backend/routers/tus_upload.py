# backend/routers/tus_upload.py
"""tus v1.0.0 resumable upload protocol endpoints for FASTQ files."""

import json
import uuid
from base64 import b64decode
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from auth import current_active_user
from config import settings
from database import get_db
from models.user import User
from services.fastq_service import (
    _update_storage_bytes_atomic,
    validate_fastq_filename,
)
from services.permission_helpers import get_experiment_with_permission

router = APIRouter()

TUS_VERSION = "1.0.0"
TUS_EXTENSIONS = "creation,termination"
STAGING_DIR_NAME = "uploads"


def _staging_dir() -> Path:
    return Path(settings.STORAGE_ROOT) / STAGING_DIR_NAME


def _upload_data_path(upload_id: str) -> Path:
    return _staging_dir() / upload_id


def _upload_meta_path(upload_id: str) -> Path:
    return _staging_dir() / f"{upload_id}.json"


def _parse_tus_metadata(header: str) -> dict[str, str]:
    """Parse tus Upload-Metadata header into key-value dict."""
    metadata: dict[str, str] = {}
    if not header:
        return metadata
    for pair in header.split(","):
        pair = pair.strip()
        if " " in pair:
            key, val_b64 = pair.split(" ", 1)
            metadata[key] = b64decode(val_b64).decode()
        else:
            metadata[pair] = ""
    return metadata


def _tus_headers() -> dict[str, str]:
    return {
        "Tus-Resumable": TUS_VERSION,
        "Tus-Version": TUS_VERSION,
        "Tus-Extension": TUS_EXTENSIONS,
    }


@router.options("")
async def tus_options():
    """Return tus server capabilities."""
    return Response(
        status_code=204,
        headers={
            **_tus_headers(),
            "Tus-Max-Size": str(settings.UPLOAD_MAX_SIZE_MB * 1024 * 1024),
        },
    )


@router.post("", status_code=status.HTTP_201_CREATED)
async def tus_create(
    request: Request,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new tus upload resource."""
    upload_length = int(request.headers.get("Upload-Length", "0"))
    max_bytes = settings.UPLOAD_MAX_SIZE_MB * 1024 * 1024
    if upload_length > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Upload exceeds maximum size ({settings.UPLOAD_MAX_SIZE_MB} MB)",
        )

    metadata = _parse_tus_metadata(request.headers.get("Upload-Metadata", ""))
    experiment_id_str = metadata.get("experiment_id", "")
    filename = metadata.get("filename", "")

    if not experiment_id_str or not filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Upload-Metadata must include experiment_id and filename",
        )

    experiment_id = int(experiment_id_str)

    experiment = await get_experiment_with_permission(
        db, experiment_id, current_user.id, ["admin", "contributor"]
    )
    if experiment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found or not authorized",
        )

    try:
        validate_fastq_filename(filename)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    upload_id = str(uuid.uuid4())

    staging_dir = _staging_dir()
    staging_dir.mkdir(parents=True, exist_ok=True)

    _upload_data_path(upload_id).touch()

    meta = {
        "upload_id": upload_id,
        "experiment_id": experiment_id,
        "project_id": experiment.project_id,
        "filename": filename,
        "user_id": current_user.id,
        "upload_length": upload_length,
    }
    _upload_meta_path(upload_id).write_text(json.dumps(meta))

    location = f"/api/v1/tus/{upload_id}"
    return Response(
        status_code=201,
        headers={
            **_tus_headers(),
            "Location": location,
            "Upload-Offset": "0",
        },
    )


@router.head("/{upload_id}")
async def tus_head(
    upload_id: str,
    current_user: User = Depends(current_active_user),
):
    """Return current upload offset for resume."""
    data_path = _upload_data_path(upload_id)
    meta_path = _upload_meta_path(upload_id)

    if not data_path.exists() or not meta_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")

    meta = json.loads(meta_path.read_text())
    if meta["user_id"] != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")

    current_offset = data_path.stat().st_size
    return Response(
        status_code=200,
        headers={
            **_tus_headers(),
            "Upload-Offset": str(current_offset),
            "Upload-Length": str(meta["upload_length"]),
            "Cache-Control": "no-store",
        },
    )


@router.patch("/{upload_id}")
async def tus_patch(
    upload_id: str,
    request: Request,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Append bytes to an in-progress upload."""
    data_path = _upload_data_path(upload_id)
    meta_path = _upload_meta_path(upload_id)

    if not data_path.exists() or not meta_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")

    meta = json.loads(meta_path.read_text())
    if meta["user_id"] != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")

    content_type = request.headers.get("Content-Type", "")
    if content_type != "application/offset-octet-stream":
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Content-Type must be application/offset-octet-stream",
        )

    offset = int(request.headers.get("Upload-Offset", "0"))
    current_size = data_path.stat().st_size
    if offset != current_size:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Offset mismatch: expected {current_size}, got {offset}",
        )

    with open(data_path, "ab") as f:
        async for chunk in request.stream():
            f.write(chunk)

    new_offset = data_path.stat().st_size
    upload_length = meta["upload_length"]

    headers = {
        **_tus_headers(),
        "Upload-Offset": str(new_offset),
    }

    if new_offset >= upload_length:
        await _finalize_upload(meta, data_path, meta_path, db)

    return Response(status_code=204, headers=headers)


@router.delete("/{upload_id}")
async def tus_terminate(
    upload_id: str,
    current_user: User = Depends(current_active_user),
):
    """Cancel and clean up an in-progress upload."""
    data_path = _upload_data_path(upload_id)
    meta_path = _upload_meta_path(upload_id)

    if not data_path.exists() or not meta_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")

    meta = json.loads(meta_path.read_text())
    if meta["user_id"] != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")

    data_path.unlink(missing_ok=True)
    meta_path.unlink(missing_ok=True)

    return Response(status_code=204, headers=_tus_headers())


async def _finalize_upload(
    meta: dict,
    data_path: Path,
    meta_path: Path,
    db: AsyncSession,
) -> None:
    """Move completed upload to experiment directory, create DB record, trigger FastQC."""
    from models.fastq_file import FastqFile
    from services.fastqc_service import run_fastqc_for_files

    filename = meta["filename"]
    experiment_id = meta["experiment_id"]
    project_id = meta["project_id"]

    prefix, direction = validate_fastq_filename(filename)

    rel_storage_path = f"projects/{project_id}/{experiment_id}/fastqs/raw/{filename}"
    dest_path = Path(settings.STORAGE_ROOT) / rel_storage_path
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    lower = filename.lower()
    needs_gzip = lower.endswith(".fastq") or lower.endswith(".fq")

    if needs_gzip:
        import asyncio
        import gzip
        import queue as queue_mod

        gz_filename = filename + ".gz"
        rel_storage_path = f"projects/{project_id}/{experiment_id}/fastqs/raw/{gz_filename}"
        gz_dest = Path(settings.STORAGE_ROOT) / rel_storage_path
        gz_dest.parent.mkdir(parents=True, exist_ok=True)

        chunk_queue: queue_mod.Queue[bytes | None] = queue_mod.Queue(maxsize=8)

        def _gzip_writer():
            with gzip.open(gz_dest, "wb") as out:
                while True:
                    chunk = chunk_queue.get()
                    if chunk is None:
                        break
                    out.write(chunk)

        loop = asyncio.get_running_loop()
        writer_future = loop.run_in_executor(None, _gzip_writer)

        read_size = 1024 * 1024
        with open(data_path, "rb") as src:
            while chunk := src.read(read_size):
                await loop.run_in_executor(None, chunk_queue.put, chunk)
        await loop.run_in_executor(None, chunk_queue.put, None)
        await writer_future

        file_size = gz_dest.stat().st_size
        filename = gz_filename
    else:
        import shutil

        shutil.move(str(data_path), str(dest_path))
        file_size = dest_path.stat().st_size

    record = FastqFile(
        experiment_id=experiment_id,
        filename=filename,
        prefix=prefix,
        read_direction=direction,
        file_size_bytes=file_size,
        file_path=rel_storage_path,
        upload_source="tus",
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    await _update_storage_bytes_atomic(db, experiment_id, project_id, file_size)

    # Clean up staging files
    data_path.unlink(missing_ok=True)
    meta_path.unlink(missing_ok=True)

    # Trigger FastQC in background (inline since we're already in an async context)
    try:
        await run_fastqc_for_files(
            [{"fastq_id": record.id, "file_path": rel_storage_path, "filename": filename}],
            project_id,
            experiment_id,
        )
    except Exception:
        pass  # FastQC failure should not fail the upload
