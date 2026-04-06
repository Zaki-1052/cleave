# backend/routers/local_import.py
"""Local filesystem import — browse instance directories and import FASTQ files."""

import asyncio
from pathlib import PurePosixPath

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import current_active_user
from database import get_db
from models.fastq_file import FastqFile
from models.user import User
from schemas.local_import import (
    LocalBrowseRequest,
    LocalImportRequest,
    LocalImportStartedResponse,
)
from schemas.server_import import ServerBrowseResponse, ServerImportProgress
from services import local_import_service
from services.fastq_service import validate_fastq_filename
from services.permission_helpers import get_experiment_with_permission
from services.server_import_service import (
    generate_import_id,
    has_active_import,
)
from services.server_import_service import (
    get_import_progress as _get_progress,
)

router = APIRouter()


@router.post(
    "/experiments/{experiment_id}/local-import/browse",
    response_model=ServerBrowseResponse,
)
async def browse_local_directory(
    experiment_id: int,
    body: LocalBrowseRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Browse a directory on the server's local filesystem."""
    experiment = await get_experiment_with_permission(
        db, experiment_id, user.id, ["admin", "contributor"]
    )
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")

    try:
        return await local_import_service.browse_local(body.path)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.post(
    "/experiments/{experiment_id}/local-import/start",
    response_model=LocalImportStartedResponse,
    status_code=202,
)
async def start_local_import(
    experiment_id: int,
    body: LocalImportRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Start importing FASTQ files from the server's local filesystem."""
    experiment = await get_experiment_with_permission(
        db, experiment_id, user.id, ["admin", "contributor"]
    )
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")

    # Enforce one import at a time per user (shared with server import)
    if has_active_import(user.id):
        raise HTTPException(
            status_code=409,
            detail="You already have an import in progress",
        )

    # Validate all source paths exist
    for fp in body.file_paths:
        try:
            local_import_service.validate_local_path(fp, must_be_dir=False)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))

    # Validate all filenames
    errors: list[str] = []
    filenames: list[str] = []
    for fp in body.file_paths:
        filename = PurePosixPath(fp).name
        filenames.append(filename)
        try:
            validate_fastq_filename(filename)
        except ValueError as exc:
            errors.append(str(exc))

    if errors:
        raise HTTPException(status_code=422, detail="; ".join(errors))

    # Check for duplicates within batch
    if len(filenames) != len(set(filenames)):
        raise HTTPException(status_code=422, detail="Duplicate filenames in import request")

    # Check for duplicates already in experiment
    existing_result = await db.execute(
        select(FastqFile.filename).where(
            FastqFile.experiment_id == experiment_id,
            FastqFile.filename.in_(filenames),
        )
    )
    existing_names = set(existing_result.scalars().all())

    # Also check .gz variants for uncompressed names
    gz_variants = [f + ".gz" for f in filenames if not f.lower().endswith(".gz")]
    if gz_variants:
        gz_result = await db.execute(
            select(FastqFile.filename).where(
                FastqFile.experiment_id == experiment_id,
                FastqFile.filename.in_(gz_variants),
            )
        )
        existing_names.update(gz_result.scalars().all())

    if existing_names:
        raise HTTPException(
            status_code=422,
            detail=f"Files already exist in this experiment: {', '.join(sorted(existing_names))}",
        )

    import_id = generate_import_id()

    asyncio.create_task(
        local_import_service.start_local_import(
            import_id=import_id,
            file_paths=body.file_paths,
            use_symlink=body.use_symlink,
            experiment_id=experiment_id,
            project_id=experiment.project_id,
            user_id=user.id,
        )
    )

    return LocalImportStartedResponse(
        import_id=import_id,
        file_count=len(body.file_paths),
        message="Local import started",
    )


@router.get(
    "/experiments/{experiment_id}/local-import/{import_id}/progress",
    response_model=ServerImportProgress | None,
)
async def get_local_import_progress(
    experiment_id: int,
    import_id: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get progress for a local import operation."""
    # Permission check
    experiment = await get_experiment_with_permission(
        db, experiment_id, user.id, ["admin", "contributor", "viewer"]
    )
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")

    progress = _get_progress(import_id)
    if progress is None:
        raise HTTPException(status_code=404, detail="Import not found or expired")

    return progress
