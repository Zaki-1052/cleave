# backend/routers/jobs.py

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import current_active_user
from config import settings
from database import get_db
from models.analysis_job import AnalysisJob
from models.experiment import Experiment
from models.job_output import JobOutput
from models.project import Project, ProjectMember
from models.user import User
from schemas.common import PaginatedResponse
from schemas.job import JobCreate, JobLogTailRead, JobOutputRead, JobQueueRead, JobRead, JobUpdate
from schemas.qc_report import (
    AlignmentQCReport,
    CustomHeatmapReport,
    DiffBindReport,
    PeakCallingQCReport,
    PearsonCorrelationReport,
    RnaseqAlignmentQCReport,
    RnaseqDEReport,
    RomanNormalizationReport,
)
from services.download_token_service import create_download_token
from services.job_service import (
    create_job,
    get_job,
    get_job_log_tail,
    get_job_outputs,
    list_all_jobs_for_user,
    list_jobs_for_experiment,
    retry_job,
    terminate_job,
    update_job_notes,
)
from services.qc_report_service import (
    get_alignment_qc_report,
    get_custom_heatmap_matrix_path,
    get_custom_heatmap_report,
    get_diffbind_counts_path,
    get_diffbind_report,
    get_diffbind_results_path,
    get_peak_annotation_csv,
    get_peak_calling_qc_csv_path,
    get_peak_calling_qc_report,
    get_pearson_correlation_matrix_path,
    get_pearson_correlation_report,
    get_pearson_coverage_matrix_path,
    get_qc_csv_path,
    get_rnaseq_alignment_qc_report,
    get_rnaseq_de_counts_path,
    get_rnaseq_de_report,
    get_rnaseq_de_results_path,
    get_rnaseq_qc_csv_path,
    get_roman_normalization_factors_path,
    get_roman_normalization_report,
    get_top_peaks_csv_path,
)

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
    per_page: int = Query(25, ge=1, le=100, alias="perPage"),
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
    job_type: str | None = Query(None, alias="jobType"),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    jobs, total = await list_all_jobs_for_user(
        db, user.id, page, per_page, status, job_type, search
    )
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


@router.patch("/jobs/{job_id}", response_model=JobRead)
async def update_job_endpoint(
    job_id: int,
    body: JobUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    job = await update_job_notes(db, job_id, user.id, body.notes)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found or insufficient permissions",
        )
    return job


@router.post("/jobs/{job_id}/terminate", response_model=JobRead)
async def terminate_job_endpoint(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await terminate_job(db, job_id, user.id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found or insufficient permissions",
        )
    if result == "conflict":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Job is not in a terminable state (must be queued or running)",
        )
    return result


@router.post(
    "/jobs/{job_id}/retry",
    response_model=JobRead,
    status_code=status.HTTP_201_CREATED,
)
async def retry_job_endpoint(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await retry_job(db, job_id, user.id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found or insufficient permissions",
        )
    if result == "conflict":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Job is not in a retryable state (must be error or terminated)",
        )
    return result


@router.get("/jobs/{job_id}/log-tail", response_model=JobLogTailRead)
async def get_job_log_tail_endpoint(
    job_id: int,
    lines: int = Query(50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await get_job_log_tail(db, job_id, user.id, lines)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found or insufficient permissions",
        )
    return result


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


@router.get("/jobs/{job_id}/outputs/{output_id}/signed-url")
async def get_output_signed_url(
    job_id: int,
    output_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    """Generate a short-lived signed URL for a job output file (inline display)."""
    result = await db.execute(
        select(JobOutput, Experiment.project_id)
        .join(AnalysisJob, AnalysisJob.id == JobOutput.job_id)
        .join(Experiment, Experiment.id == AnalysisJob.experiment_id)
        .join(Project, Project.id == Experiment.project_id)
        .outerjoin(
            ProjectMember,
            and_(
                ProjectMember.project_id == Experiment.project_id,
                ProjectMember.user_id == user.id,
            ),
        )
        .where(
            JobOutput.id == output_id,
            JobOutput.job_id == job_id,
            or_(ProjectMember.user_id.isnot(None), Project.is_reference.is_(True)),
        )
    )
    row = result.first()
    if row is None:
        raise HTTPException(status_code=404, detail="Output not found")

    output, project_id = row
    experiment_id = (
        await db.execute(select(AnalysisJob.experiment_id).where(AnalysisJob.id == job_id))
    ).scalar_one()

    # file_path is relative to STORAGE_ROOT, e.g. "projects/1/2/jobs/3/heatmaps/foo.png"
    # download token needs path relative to experiment dir, e.g. "jobs/3/heatmaps/foo.png"
    experiment_prefix = f"projects/{project_id}/{experiment_id}/"
    if output.file_path.startswith(experiment_prefix):
        rel_path = output.file_path[len(experiment_prefix) :]
    else:
        raise HTTPException(status_code=500, detail="Unexpected file path format")

    token = create_download_token(
        {
            "type": "single",
            "exp_id": experiment_id,
            "proj_id": project_id,
            "path": rel_path,
        },
        settings.SECRET_KEY,
        settings.DOWNLOAD_TOKEN_EXPIRY_SECONDS,
    )
    return {
        "url": f"/api/v1/files/signed-download?token={token}",
        "filename": output.filename,
    }


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


@router.get("/jobs/{job_id}/peak-qc-report", response_model=PeakCallingQCReport)
async def get_peak_qc_report(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    try:
        report = await get_peak_calling_qc_report(db, job_id, user.id)
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


@router.get("/jobs/{job_id}/peak-qc-report/download")
async def download_peak_qc_csv(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    try:
        csv_path = await get_peak_calling_qc_csv_path(db, job_id, user.id)
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
        filename="peak_caller_metrics.csv",
    )


@router.get("/jobs/{job_id}/peak-qc-report/top-peaks-csv")
async def download_top_peaks_csv(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    try:
        csv_path = await get_top_peaks_csv_path(db, job_id, user.id)
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
        filename="top_called_peaks.csv",
    )


@router.get("/jobs/{job_id}/peak-qc-report/annotation-csv")
async def download_peak_annotation_csv(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    try:
        csv_content = await get_peak_annotation_csv(db, job_id, user.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    from fastapi.responses import Response

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=peak_annotation.csv"},
    )


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


# ---------------------------------------------------------------------------
# RNA-seq Alignment QC Report endpoints
# ---------------------------------------------------------------------------


@router.get("/jobs/{job_id}/rnaseq-qc-report", response_model=RnaseqAlignmentQCReport)
async def get_rnaseq_qc_report(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    try:
        report = await get_rnaseq_alignment_qc_report(db, job_id, user.id)
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


@router.get("/jobs/{job_id}/rnaseq-qc-report/download")
async def download_rnaseq_qc_csv(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    try:
        csv_path = await get_rnaseq_qc_csv_path(db, job_id, user.id)
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
        filename="rnaseq_alignment_metrics.csv",
    )


# ---------------------------------------------------------------------------
# DiffBind report endpoints
# ---------------------------------------------------------------------------


@router.get("/jobs/{job_id}/diffbind-report", response_model=DiffBindReport)
async def get_diffbind_report_endpoint(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    try:
        report = await get_diffbind_report(db, job_id, user.id)
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


@router.get("/jobs/{job_id}/diffbind-report/download-results")
async def download_diffbind_results(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    try:
        tsv_path = await get_diffbind_results_path(db, job_id, user.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if tsv_path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )
    return FileResponse(
        tsv_path,
        media_type="text/tab-separated-values",
        filename="diffbind_results.txt",
    )


@router.get("/jobs/{job_id}/diffbind-report/download-counts")
async def download_diffbind_counts(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    try:
        csv_path = await get_diffbind_counts_path(db, job_id, user.id)
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
        filename="normalized_counts.csv",
    )


# ---------------------------------------------------------------------------
# RNA-seq DE report endpoints
# ---------------------------------------------------------------------------


@router.get("/jobs/{job_id}/rnaseq-de-report", response_model=RnaseqDEReport)
async def get_rnaseq_de_report_endpoint(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    try:
        report = await get_rnaseq_de_report(db, job_id, user.id)
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


@router.get("/jobs/{job_id}/rnaseq-de-report/download-results")
async def download_rnaseq_de_results(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    try:
        tsv_path = await get_rnaseq_de_results_path(db, job_id, user.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if tsv_path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )
    return FileResponse(
        tsv_path,
        media_type="text/tab-separated-values",
        filename="de_results.tsv",
    )


@router.get("/jobs/{job_id}/rnaseq-de-report/download-counts")
async def download_rnaseq_de_counts(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    try:
        csv_path = await get_rnaseq_de_counts_path(db, job_id, user.id)
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
        filename="normalized_counts.csv",
    )


# ---------------------------------------------------------------------------
# Custom Heatmap report endpoints
# ---------------------------------------------------------------------------


@router.get("/jobs/{job_id}/heatmap-report", response_model=CustomHeatmapReport)
async def get_heatmap_report_endpoint(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    try:
        report = await get_custom_heatmap_report(db, job_id, user.id)
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


@router.get("/jobs/{job_id}/heatmap-report/download-matrix")
async def download_heatmap_matrix(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    try:
        gz_path = await get_custom_heatmap_matrix_path(db, job_id, user.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if gz_path is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )
    return FileResponse(
        gz_path,
        media_type="application/gzip",
        filename="heatmap_matrix.gz",
    )


# ---------------------------------------------------------------------------
# Pearson Correlation endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/jobs/{job_id}/pearson-report",
    response_model=PearsonCorrelationReport,
)
async def get_pearson_report_endpoint(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    try:
        report = await get_pearson_correlation_report(db, job_id, user.id)
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


@router.get("/jobs/{job_id}/pearson-report/download-correlation")
async def download_pearson_correlation(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    try:
        csv_path = await get_pearson_correlation_matrix_path(db, job_id, user.id)
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
        filename="pearson_correlation.csv",
    )


@router.get("/jobs/{job_id}/pearson-report/download-coverage")
async def download_pearson_coverage(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    try:
        csv_path = await get_pearson_coverage_matrix_path(db, job_id, user.id)
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
        filename="pearson_coverage_matrix.csv",
    )


# ---------------------------------------------------------------------------
# Roman Normalization
# ---------------------------------------------------------------------------


@router.get(
    "/jobs/{job_id}/normalization-report",
    response_model=RomanNormalizationReport,
)
async def get_normalization_report_endpoint(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    try:
        report = await get_roman_normalization_report(db, job_id, user.id)
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


@router.get("/jobs/{job_id}/normalization-report/download-factors")
async def download_normalization_factors(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    try:
        csv_path = await get_roman_normalization_factors_path(db, job_id, user.id)
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
        filename="normalization_factors.csv",
    )
