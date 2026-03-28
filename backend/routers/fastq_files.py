# backend/routers/fastq_files.py
from pathlib import Path

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import current_active_user
from config import settings
from database import get_db
from models.experiment import Experiment
from models.fastq_file import FastqFile
from models.user import User
from pipelines.fastqc import find_fastqc_data_txt, parse_fastqc_data
from schemas.common import PaginatedResponse
from schemas.fastq_file import (
    FastqcModuleSummary,
    FastqcSummaryResponse,
    FastqFileRead,
    FastqFileUploadResponse,
)
from services.download_token_service import create_download_token
from services.fastq_service import (
    delete_fastq,
    list_fastqs,
    upload_fastqs,
)
from services.fastqc_service import run_fastqc_for_files
from services.permission_helpers import check_experiment_membership

router = APIRouter()


@router.post(
    "/experiments/{experiment_id}/fastqs/upload",
    response_model=FastqFileUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_fastq_endpoint(
    experiment_id: int,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await upload_fastqs(db, experiment_id, current_user.id, files)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(e),
        )

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this project or insufficient permissions",
        )

    # Extract scalar values before session closes for background task
    experiment = await db.get(Experiment, experiment_id)
    if experiment is not None:
        fastqc_inputs = [
            {"fastq_id": r.id, "file_path": r.file_path, "filename": r.filename} for r in result
        ]
        background_tasks.add_task(
            run_fastqc_for_files,
            fastqc_inputs=fastqc_inputs,
            project_id=experiment.project_id,
            experiment_id=experiment_id,
            user_id=current_user.id,
            experiment_name=experiment.name,
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
    per_page: int = Query(25, ge=1, le=500, alias="perPage"),
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await list_fastqs(db, experiment_id, current_user.id, page, per_page)
    if result is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    items, total = result
    return PaginatedResponse(items=items, total=total, page=page, per_page=per_page)


@router.get("/experiments/{experiment_id}/fastqs/{fastq_id}/fastqc")
async def get_fastqc_report(
    experiment_id: int,
    fastq_id: int,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Serve the FastQC HTML report for a FASTQ file."""
    experiment = await check_experiment_membership(db, experiment_id, current_user.id)
    if experiment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found or not authorized",
        )

    result = await db.execute(
        select(FastqFile).where(
            FastqFile.id == fastq_id,
            FastqFile.experiment_id == experiment_id,
        )
    )
    fastq = result.scalar_one_or_none()
    if fastq is None:
        raise HTTPException(status_code=404, detail="FASTQ file not found")

    if not fastq.fastqc_report_path:
        raise HTTPException(status_code=404, detail="FastQC report not yet available")

    abs_path = (Path(settings.STORAGE_ROOT) / fastq.fastqc_report_path).resolve()

    # Path traversal guard
    storage_root = Path(settings.STORAGE_ROOT).resolve()
    if not str(abs_path).startswith(str(storage_root) + "/"):
        raise HTTPException(status_code=403, detail="Access denied")

    if not abs_path.exists():
        raise HTTPException(status_code=404, detail="FastQC report file not found on disk")

    return FileResponse(abs_path, media_type="text/html", filename=abs_path.name)


@router.get("/experiments/{experiment_id}/fastqs/{fastq_id}/fastqc-token")
async def get_fastqc_signed_url(
    experiment_id: int,
    fastq_id: int,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Return a short-lived signed URL for the FastQC HTML report (for iframe use)."""
    experiment = await check_experiment_membership(db, experiment_id, current_user.id)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found or not authorized")

    result = await db.execute(
        select(FastqFile).where(
            FastqFile.id == fastq_id,
            FastqFile.experiment_id == experiment_id,
        )
    )
    fastq = result.scalar_one_or_none()
    if fastq is None:
        raise HTTPException(status_code=404, detail="FASTQ file not found")
    if not fastq.fastqc_report_path:
        raise HTTPException(status_code=404, detail="FastQC report not yet available")

    # fastqc_report_path is relative to STORAGE_ROOT, e.g. "projects/2/3/fastqc/foo.html"
    # download token expects path relative to experiment dir, e.g. "fastqc/foo.html"
    experiment_prefix = f"projects/{experiment.project_id}/{experiment_id}/"
    if fastq.fastqc_report_path.startswith(experiment_prefix):
        rel_path = fastq.fastqc_report_path[len(experiment_prefix) :]
    else:
        raise HTTPException(status_code=500, detail="Unexpected report path format")

    token = create_download_token(
        {
            "type": "single",
            "exp_id": experiment_id,
            "proj_id": experiment.project_id,
            "path": rel_path,
        },
        settings.SECRET_KEY,
        settings.DOWNLOAD_TOKEN_EXPIRY_SECONDS,
    )
    return {"url": f"/api/v1/files/signed-download?token={token}"}


@router.get(
    "/experiments/{experiment_id}/fastqs/{fastq_id}/fastqc-summary",
    response_model=FastqcSummaryResponse,
)
async def get_fastqc_summary(
    experiment_id: int,
    fastq_id: int,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Return structured FastQC module summary data (pass/warn/fail per module)."""
    experiment = await check_experiment_membership(db, experiment_id, current_user.id)
    if experiment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found or not authorized",
        )

    result = await db.execute(
        select(FastqFile).where(
            FastqFile.id == fastq_id,
            FastqFile.experiment_id == experiment_id,
        )
    )
    fastq = result.scalar_one_or_none()
    if fastq is None:
        raise HTTPException(status_code=404, detail="FASTQ file not found")

    if not fastq.fastqc_report_path:
        raise HTTPException(status_code=404, detail="FastQC report not yet available")

    abs_html = (Path(settings.STORAGE_ROOT) / fastq.fastqc_report_path).resolve()

    # Path traversal guard
    storage_root = Path(settings.STORAGE_ROOT).resolve()
    if not str(abs_html).startswith(str(storage_root) + "/"):
        raise HTTPException(status_code=403, detail="Access denied")

    txt_path = find_fastqc_data_txt(abs_html)
    if txt_path is None:
        raise HTTPException(status_code=404, detail="FastQC data file not found")

    parsed = parse_fastqc_data(txt_path)

    return FastqcSummaryResponse(
        filename=fastq.filename,
        total_reads=parsed.total_reads,
        module_summaries=[
            FastqcModuleSummary(name=name, status=mod_status)
            for name, mod_status in parsed.module_summaries.items()
        ],
    )


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
