# backend/routers/reactions.py
from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.get("/experiments/{experiment_id}/reactions")
async def list_reactions(experiment_id: int):
    raise HTTPException(status_code=501, detail="Not yet implemented")


@router.post("/experiments/{experiment_id}/reactions")
async def create_reaction(experiment_id: int):
    raise HTTPException(status_code=501, detail="Not yet implemented")
