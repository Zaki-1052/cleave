# backend/routers/jobs.py
from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.get("/jobs")
async def list_all_jobs():
    raise HTTPException(status_code=501, detail="Not yet implemented")


@router.post("/experiments/{experiment_id}/jobs")
async def create_job(experiment_id: int):
    raise HTTPException(status_code=501, detail="Not yet implemented")


@router.get("/jobs/{job_id}")
async def get_job(job_id: int):
    raise HTTPException(status_code=501, detail="Not yet implemented")
