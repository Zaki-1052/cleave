# backend/routers/admin.py
"""Admin-only endpoints for system maintenance and storage info."""

import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status

from auth import current_active_user
from config import settings
from models.user import User
from services.cleanup_service import run_full_cleanup

router = APIRouter()


@router.post("/cleanup")
async def trigger_cleanup(
    current_user: User = Depends(current_active_user),
):
    """Manually trigger storage cleanup. Superuser only."""
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superuser access required",
        )
    return await run_full_cleanup()


@router.get("/storage-info")
async def get_storage_info(
    current_user: User = Depends(current_active_user),
):
    """Get global storage quota and disk usage info."""
    storage_root = Path(settings.STORAGE_ROOT)
    disk_info = {"total": 0, "used": 0, "free": 0}
    if storage_root.exists():
        usage = shutil.disk_usage(str(storage_root))
        disk_info = {"total": usage.total, "used": usage.used, "free": usage.free}

    return {
        "quotaBytes": settings.STORAGE_QUOTA_BYTES,
        "disk": disk_info,
    }
