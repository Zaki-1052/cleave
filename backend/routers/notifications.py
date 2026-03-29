# backend/routers/notifications.py
from fastapi import APIRouter, Depends, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from auth import current_active_user
from database import get_db
from models.user import User
from schemas.notification import NotificationRead
from services import notification_service
from services.sse_service import sse_event_generator

router = APIRouter()


@router.get("/stream")
async def notification_stream(
    current_user: User = Depends(current_active_user),
):
    """SSE endpoint — streams notification and job status events to the current user."""
    return StreamingResponse(
        sse_event_generator(current_user.id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("", response_model=list[NotificationRead])
async def list_notifications(
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await notification_service.list_notifications(db, current_user.id)


@router.patch("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_notifications_read(
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await notification_service.mark_all_read(db, current_user.id)


@router.patch("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    await notification_service.mark_read(db, notification_id, current_user.id)
