# backend/dependencies.py
from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import current_active_user
from database import get_db
from models.project import ProjectMember
from models.user import User


def require_project_role(roles: list[str]):
    async def _check(
        project_id: int,
        current_user: User = Depends(current_active_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        result = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == current_user.id,
            )
        )
        member = result.scalar_one_or_none()
        if member is None or member.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient project permissions",
            )
        return current_user

    return _check
