# backend/routers/fastq_files.py
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from auth import current_active_user
from database import get_db
from models.user import User
from schemas.common import PaginatedResponse
from schemas.fastq_file import FastqFileRead, FastqFileUploadResponse
from services.fastq_service import (
    delete_fastq,
    list_fastqs,
    upload_fastqs,
)

router = APIRouter()


@router.post(
    "/experiments/{experiment_id}/fastqs/upload",
    response_model=FastqFileUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_fastq_endpoint(
    experiment_id: int,
    files: list[UploadFile] = File(...),
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await upload_fastqs(db, experiment_id, current_user.id, files)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this project or insufficient permissions",
        )

    total_bytes = sum(r.file_size_bytes or 0 for r in result)
    return FastqFileUploadResponse(
        uploaded=result,
        total_bytes=total_bytes,
        file_count=len(result),
    )


@router.get(
    "/experiments/{experiment_id}/fastqs",
    response_model=PaginatedResponse[FastqFileRead],
)
async def list_fastqs_endpoint(
    experiment_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100, alias="perPage"),
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await list_fastqs(db, experiment_id, current_user.id, page, per_page)
    if result is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    items, total = result
    return PaginatedResponse(items=items, total=total, page=page, per_page=per_page)


@router.delete(
    "/experiments/{experiment_id}/fastqs/{fastq_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_fastq_endpoint(
    experiment_id: int,
    fastq_id: int,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await delete_fastq(db, experiment_id, fastq_id, current_user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="FASTQ file not found")
