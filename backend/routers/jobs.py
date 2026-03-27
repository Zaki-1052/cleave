# backend/routers/jobs.py
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from auth import current_active_user
from database import get_db
from models.user import User
from schemas.common import PaginatedResponse
from schemas.job import JobCreate, JobOutputRead, JobQueueRead, JobRead
from schemas.qc_report import AlignmentQCReport
from services.job_service import (
    create_job,
    get_job,
    get_job_outputs,
    list_all_jobs_for_user,
    list_jobs_for_experiment,
)
from services.qc_report_service import get_alignment_qc_report, get_qc_csv_path

router = APIRouter()


@router.post(
    "/experiments/{experiment_id}/jobs",
    response_model=JobRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_job_endpoint(
    experiment_id: int,
    body: JobCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    job = await create_job(db, experiment_id, user.id, body)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Experiment not found or insufficient permissions",
        )
    return job


@router.get("/experiments/{experiment_id}/jobs", response_model=PaginatedResponse[JobRead])
async def list_experiment_jobs(
    experiment_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await list_jobs_for_experiment(db, experiment_id, user.id, page, per_page)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Experiment not found or insufficient permissions",
        )
    jobs, total = result
    return {"items": jobs, "total": total, "page": page, "per_page": per_page}


@router.get("/jobs", response_model=PaginatedResponse[JobQueueRead])
async def list_all_jobs(
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100, alias="perPage"),
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    jobs, total = await list_all_jobs_for_user(db, user.id, page, per_page, status)
    items = [JobQueueRead.from_job(j) for j in jobs]
    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.get("/jobs/{job_id}", response_model=JobRead)
async def get_job_endpoint(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    job = await get_job(db, job_id, user.id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )
    return job


@router.get("/jobs/{job_id}/outputs", response_model=list[JobOutputRead])
async def list_job_outputs(
    job_id: int,
    category: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    outputs = await get_job_outputs(db, job_id, user.id, category)
    if outputs is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )
    return outputs


@router.get("/jobs/{job_id}/qc-report", response_model=AlignmentQCReport)
async def get_qc_report(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    try:
        report = await get_alignment_qc_report(db, job_id, user.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )
    return report


@router.get("/jobs/{job_id}/qc-report/download")
async def download_qc_csv(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    try:
        csv_path = await get_qc_csv_path(db, job_id, user.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if csv_path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )
    return FileResponse(
        csv_path,
        media_type="text/csv",
        filename="alignment_metrics.csv",
    )
