# backend/routers/experiments.py
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from dependencies import get_current_user
from models.user import User
from schemas.common import PaginatedResponse
from schemas.experiment import ExperimentCreate, ExperimentRead, ExperimentUpdate
from services.experiment_service import (
    create_experiment,
    delete_experiment,
    get_experiment,
    list_experiments,
    update_experiment,
)

router = APIRouter()


@router.get("", response_model=PaginatedResponse[ExperimentRead])
async def list_experiments_endpoint(
    project_id: int | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    items, total = await list_experiments(db, current_user.id, project_id, page, per_page)
    return PaginatedResponse(items=items, total=total, page=page, per_page=per_page)


@router.post("", response_model=ExperimentRead, status_code=status.HTTP_201_CREATED)
async def create_experiment_endpoint(
    body: ExperimentCreate,
    project_id: int = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await create_experiment(db, project_id, body, current_user.id)


@router.get("/{experiment_id}", response_model=ExperimentRead)
async def get_experiment_endpoint(
    experiment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    experiment = await get_experiment(db, experiment_id, current_user.id)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return experiment


@router.patch("/{experiment_id}", response_model=ExperimentRead)
async def update_experiment_endpoint(
    experiment_id: int,
    body: ExperimentUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    experiment = await update_experiment(db, experiment_id, body)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return experiment


@router.delete("/{experiment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_experiment_endpoint(
    experiment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await delete_experiment(db, experiment_id)
