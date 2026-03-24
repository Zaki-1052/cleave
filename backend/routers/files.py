# backend/routers/files.py
from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.get("/jobs/{job_id}/files/{file_id}/download")
async def download_file(job_id: int, file_id: int):
    raise HTTPException(status_code=501, detail="Not yet implemented")


@router.get("/experiments/{experiment_id}/files")
async def list_experiment_files(experiment_id: int):
    raise HTTPException(status_code=501, detail="Not yet implemented")
