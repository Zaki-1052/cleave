# backend/routers/notifications.py
from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.get("")
async def list_notifications():
    raise HTTPException(status_code=501, detail="Not yet implemented")


@router.patch("/{notification_id}/read")
async def mark_read(notification_id: int):
    raise HTTPException(status_code=501, detail="Not yet implemented")
