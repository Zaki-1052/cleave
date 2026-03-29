# backend/routers/server_import.py
"""FTP/SFTP server import — browse remote directories and import FASTQ files."""

import asyncio
from pathlib import PurePosixPath

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import current_active_user
from database import get_db
from models.fastq_file import FastqFile
from models.user import User
from schemas.server_import import (
    SavedServerCreate,
    SavedServerRead,
    SavedServerUpdate,
    ServerBrowseResponse,
    ServerConnectRequest,
    ServerImportProgress,
    ServerImportRequest,
    ServerImportStartedResponse,
)
from services import server_credential_service, server_import_service
from services.fastq_service import validate_fastq_filename
from services.permission_helpers import get_experiment_with_permission

router = APIRouter()


# ---------------------------------------------------------------------------
# Import endpoints (experiment-scoped)
# ---------------------------------------------------------------------------


@router.post(
    "/experiments/{experiment_id}/server-import/browse",
    response_model=ServerBrowseResponse,
)
async def browse_remote_server(
    experiment_id: int,
    body: ServerConnectRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Connect to a remote FTP/SFTP server and list a directory."""
    experiment = await get_experiment_with_permission(
        db, experiment_id, user.id, ["admin", "contributor"]
    )
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")

    # If using a saved server, load credentials
    password = body.password
    host = body.host
    port = body.port
    username = body.username
    protocol = body.protocol

    if body.saved_server_id is not None:
        result = await server_credential_service.get_saved_server_with_password(
            db, user.id, body.saved_server_id
        )
        if result is None:
            raise HTTPException(status_code=404, detail="Saved server not found")
        server, decrypted_pw = result
        host = server.host
        port = server.port
        username = server.username
        password = decrypted_pw
        protocol = server.protocol

    try:
        response = await server_import_service.browse_server(
            protocol=protocol,
            host=host,
            port=port,
            username=username,
            password=password,
            path=body.path,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Update default_path on saved server if applicable
    if body.saved_server_id is not None:
        await server_credential_service.update_default_path(
            db, user.id, body.saved_server_id, body.path
        )

    return response


@router.post(
    "/experiments/{experiment_id}/server-import/start",
    response_model=ServerImportStartedResponse,
    status_code=202,
)
async def start_server_import(
    experiment_id: int,
    body: ServerImportRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Start importing FASTQ files from a remote server."""
    experiment = await get_experiment_with_permission(
        db, experiment_id, user.id, ["admin", "contributor"]
    )
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")

    # Enforce one import at a time per user
    if server_import_service.has_active_import(user.id):
        raise HTTPException(
            status_code=409,
            detail="You already have a server import in progress",
        )

    # Validate host
    try:
        server_import_service._validate_host(body.host)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Validate all filenames upfront
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

    # Save server if requested
    if body.save_server and body.server_name:
        try:
            await server_credential_service.create_saved_server(
                db,
                user.id,
                SavedServerCreate(
                    name=body.server_name,
                    protocol=body.protocol,
                    host=body.host,
                    port=body.port,
                    username=body.username,
                    password=body.password,
                ),
            )
        except Exception:
            pass  # non-fatal — import continues even if save fails

    import_id = server_import_service.generate_import_id()

    asyncio.create_task(
        server_import_service.start_import(
            import_id=import_id,
            protocol=body.protocol,
            host=body.host,
            port=body.port,
            username=body.username,
            password=body.password,
            file_paths=body.file_paths,
            experiment_id=experiment_id,
            project_id=experiment.project_id,
            user_id=user.id,
        )
    )

    return ServerImportStartedResponse(
        import_id=import_id,
        file_count=len(body.file_paths),
        message="Import started",
    )


@router.get(
    "/experiments/{experiment_id}/server-import/{import_id}/progress",
    response_model=ServerImportProgress | None,
)
async def get_import_progress(
    experiment_id: int,
    import_id: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Get progress of a server import."""
    experiment = await get_experiment_with_permission(
        db, experiment_id, user.id, ["admin", "contributor", "viewer"]
    )
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")

    progress = server_import_service.get_import_progress(import_id)
    if progress is None:
        raise HTTPException(status_code=404, detail="Import not found or expired")
    return progress


# ---------------------------------------------------------------------------
# Saved servers (user-scoped)
# ---------------------------------------------------------------------------


@router.get("/users/me/saved-servers", response_model=list[SavedServerRead])
async def list_saved_servers(
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    servers = await server_credential_service.list_saved_servers(db, user.id)
    return [
        SavedServerRead(
            id=s.id,
            name=s.name,
            protocol=s.protocol,
            host=s.host,
            port=s.port,
            username=s.username,
            default_path=s.default_path or "/",
            created_at=s.created_at,
            updated_at=s.updated_at,
        )
        for s in servers
    ]


@router.post("/users/me/saved-servers", response_model=SavedServerRead, status_code=201)
async def create_saved_server(
    body: SavedServerCreate,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        server = await server_credential_service.create_saved_server(db, user.id, body)
    except Exception as exc:
        if "uq_saved_servers_user_name" in str(exc):
            raise HTTPException(
                status_code=409,
                detail=f"A saved server named '{body.name}' already exists",
            )
        raise

    return SavedServerRead(
        id=server.id,
        name=server.name,
        protocol=server.protocol,
        host=server.host,
        port=server.port,
        username=server.username,
        default_path=server.default_path or "/",
        created_at=server.created_at,
        updated_at=server.updated_at,
    )


@router.patch("/users/me/saved-servers/{server_id}", response_model=SavedServerRead)
async def update_saved_server(
    server_id: int,
    body: SavedServerUpdate,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    server = await server_credential_service.update_saved_server(db, user.id, server_id, body)
    if server is None:
        raise HTTPException(status_code=404, detail="Saved server not found")
    return SavedServerRead(
        id=server.id,
        name=server.name,
        protocol=server.protocol,
        host=server.host,
        port=server.port,
        username=server.username,
        default_path=server.default_path or "/",
        created_at=server.created_at,
        updated_at=server.updated_at,
    )


@router.delete("/users/me/saved-servers/{server_id}", status_code=204)
async def delete_saved_server(
    server_id: int,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await server_credential_service.delete_saved_server(db, user.id, server_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Saved server not found")
