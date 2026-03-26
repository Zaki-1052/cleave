# backend/routers/jobs.py
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from auth import current_active_user
from database import get_db
from models.user import User
from schemas.common import PaginatedResponse
from schemas.job import JobCreate, JobRead
from services.job_service import create_job, get_job, list_jobs_for_experiment

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
