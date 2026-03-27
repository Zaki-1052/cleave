# backend/routers/tus_upload.py
"""tus v1.0.0 resumable upload endpoints via tuspyserver for FASTQ files."""

import os
import shutil
from pathlib import Path
from typing import Callable

from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from tuspyserver import create_tus_router

from auth import current_active_user
from config import settings
from database import get_db
from models.user import User
from services.fastq_service import validate_fastq_filename
from services.job_output_service import update_storage_bytes
from services.permission_helpers import get_experiment_with_permission


def _dynamic_files_dir() -> Callable[[dict], dict]:
    """Return staging dir dynamically so tests with overridden STORAGE_ROOT work."""

    async def handler(_metadata: dict) -> dict:
        staging = str(Path(settings.STORAGE_ROOT) / "uploads")
        os.makedirs(staging, exist_ok=True)
        return {"files_dir": staging}

    return handler


def validate_fastq_upload(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(current_active_user),
) -> Callable[[dict, dict], None]:
    """Pre-create hook: validate metadata, permissions, and filename before upload."""

    async def handler(metadata: dict, upload_info: dict) -> None:
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

        max_bytes = settings.UPLOAD_MAX_SIZE_MB * 1024 * 1024
        if upload_info.get("size") and upload_info["size"] > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Upload exceeds maximum size ({settings.UPLOAD_MAX_SIZE_MB} MB)",
            )

    return handler


def on_fastq_upload_complete(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(current_active_user),
) -> Callable[[str, dict], None]:
    """Completion hook: move file to experiment dir, create DB record, trigger FastQC."""

    async def handler(file_path: str, metadata: dict) -> None:
        from models.fastq_file import FastqFile
        from services.fastqc_service import run_fastqc_for_files

        filename = metadata.get("filename", "")
        experiment_id = int(metadata.get("experiment_id", "0"))

        experiment = await get_experiment_with_permission(
            db, experiment_id, current_user.id, ["admin", "contributor"]
        )
        if experiment is None:
            return

        project_id = experiment.project_id
        prefix, direction = validate_fastq_filename(filename)

        rel_storage_path = f"projects/{project_id}/{experiment_id}/fastqs/raw/{filename}"
        dest_path = Path(settings.STORAGE_ROOT) / rel_storage_path

        # Defense-in-depth: verify resolved path is within storage root
        storage_root_resolved = Path(settings.STORAGE_ROOT).resolve()
        if not str(dest_path.resolve()).startswith(str(storage_root_resolved) + "/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Path traversal detected in filename",
            )

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

            # Defense-in-depth: verify gzip dest is also within storage root
            if not str(gz_dest.resolve()).startswith(str(storage_root_resolved) + "/"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Path traversal detected in filename",
                )

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
            with open(file_path, "rb") as src:
                while chunk := src.read(read_size):
                    await loop.run_in_executor(None, chunk_queue.put, chunk)
            await loop.run_in_executor(None, chunk_queue.put, None)
            await writer_future

            file_size = gz_dest.stat().st_size
            filename = gz_filename
        else:
            shutil.move(file_path, str(dest_path))
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

        await update_storage_bytes(db, experiment_id, project_id, file_size)

        # Clean up tuspyserver staging files (data file + .info sidecar)
        staging_data = Path(file_path)
        staging_info = Path(f"{file_path}.info")
        staging_data.unlink(missing_ok=True)
        staging_info.unlink(missing_ok=True)

        try:
            await run_fastqc_for_files(
                [{"fastq_id": record.id, "file_path": rel_storage_path, "filename": filename}],
                project_id,
                experiment_id,
            )
        except Exception:
            pass  # FastQC failure should not fail the upload

    return handler


router = create_tus_router(
    prefix="tus",
    files_dir=str(Path(settings.STORAGE_ROOT) / "uploads"),
    max_size=settings.UPLOAD_MAX_SIZE_MB * 1024 * 1024,
    auth=current_active_user,
    days_to_keep=5,
    pre_create_dep=validate_fastq_upload,
    upload_complete_dep=on_fastq_upload_complete,
    file_dep=_dynamic_files_dir,
)
