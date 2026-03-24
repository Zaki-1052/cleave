# backend/routers/fastq_files.py
from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.get("/experiments/{experiment_id}/fastqs")
async def list_fastqs(experiment_id: int):
    raise HTTPException(status_code=501, detail="Not yet implemented")


@router.post("/experiments/{experiment_id}/fastqs/upload")
async def upload_fastq(experiment_id: int):
    raise HTTPException(status_code=501, detail="Not yet implemented")
