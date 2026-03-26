# backend/routers/files.py
import mimetypes
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
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
from schemas.file import FileTreeResponse
from services.file_service import build_experiment_file_tree, validate_experiment_path

router = APIRouter()


async def _check_experiment_membership(
    db: AsyncSession, experiment_id: int, user_id: int
) -> Experiment | None:
    """Fetch experiment if user is a member of its project (any role)."""
    result = await db.execute(
        select(Experiment)
        .join(ProjectMember, ProjectMember.project_id == Experiment.project_id)
        .where(
            Experiment.id == experiment_id,
            ProjectMember.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


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
    experiment = await _check_experiment_membership(db, experiment_id, current_user.id)
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
    experiment = await _check_experiment_membership(db, experiment_id, current_user.id)
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

    media_type, _ = mimetypes.guess_type(str(abs_path))
    if media_type is None:
        media_type = "application/octet-stream"

    return FileResponse(abs_path, media_type=media_type, filename=abs_path.name)


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

    media_type, _ = mimetypes.guess_type(str(abs_path))
    if media_type is None:
        media_type = "application/octet-stream"

    return FileResponse(abs_path, media_type=media_type, filename=abs_path.name)
