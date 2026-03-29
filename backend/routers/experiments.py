# backend/routers/experiments.py
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from auth import current_active_user
from database import get_db
from models.user import User
from schemas.auto_pipeline import AutoPipelineConfig
from schemas.common import PaginatedResponse
from schemas.experiment import ExperimentCreate, ExperimentRead, ExperimentUpdate
from schemas.experiment_event import ExperimentEventRead
from services.event_service import list_events
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
    project_id: int | None = Query(None, alias="projectId"),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100, alias="perPage"),
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    items, total = await list_experiments(db, current_user.id, project_id, page, per_page)
    return PaginatedResponse(items=items, total=total, page=page, per_page=per_page)


@router.post("", response_model=ExperimentRead, status_code=status.HTTP_201_CREATED)
async def create_experiment_endpoint(
    body: ExperimentCreate,
    project_id: int = Query(..., alias="projectId"),
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    experiment = await create_experiment(db, project_id, body, current_user.id)
    if experiment is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this project or insufficient permissions",
        )
    return experiment


@router.get("/{experiment_id}", response_model=ExperimentRead)
async def get_experiment_endpoint(
    experiment_id: int,
    current_user: User = Depends(current_active_user),
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
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    experiment = await update_experiment(db, experiment_id, body, current_user.id)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return experiment


@router.delete("/{experiment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_experiment_endpoint(
    experiment_id: int,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await delete_experiment(db, experiment_id, current_user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Experiment not found")


@router.get(
    "/{experiment_id}/history",
    response_model=PaginatedResponse[ExperimentEventRead],
)
async def list_experiment_history(
    experiment_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100, alias="perPage"),
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await list_events(db, experiment_id, current_user.id, page, per_page)
    if result is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    events, total = result
    return PaginatedResponse(items=events, total=total, page=page, per_page=per_page)


# --- Auto-Pipeline Endpoints ---


@router.post("/{experiment_id}/auto-pipeline", status_code=status.HTTP_202_ACCEPTED)
async def start_auto_pipeline_endpoint(
    experiment_id: int,
    body: AutoPipelineConfig,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Start auto-pipeline for an experiment."""
    from services import auto_pipeline_service

    exp = await get_experiment(db, experiment_id, current_user.id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")

    await auto_pipeline_service.start_auto_pipeline(
        db, experiment_id, current_user.id, body.model_dump()
    )
    return {"status": "started"}


@router.post("/{experiment_id}/auto-pipeline/cancel")
async def cancel_auto_pipeline_endpoint(
    experiment_id: int,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel auto-pipeline. Completed steps are preserved."""
    from services import auto_pipeline_service  # noqa: F811

    exp = await get_experiment(db, experiment_id, current_user.id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")

    await auto_pipeline_service.cancel_auto_pipeline(db, experiment_id)
    return {"status": "cancelled"}
