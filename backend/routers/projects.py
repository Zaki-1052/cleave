# backend/routers/projects.py
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import current_active_user
from database import get_db
from dependencies import require_project_role
from models.project import ProjectMember
from models.user import User
from schemas.common import PaginatedResponse
from schemas.project import (
    MemberCreate,
    MemberRead,
    MemberUpdate,
    ProjectCreate,
    ProjectRead,
    ProjectUpdate,
    UserBrief,
)
from services.project_service import (
    AlreadyMemberError,
    add_member,
    create_project,
    delete_project,
    get_project,
    get_reference_projects,
    list_fellow_members,
    list_members,
    list_projects_for_user,
    remove_member,
    update_member_role,
    update_project,
)

router = APIRouter()


@router.get("/reference", response_model=list[ProjectRead])
async def list_reference_projects(
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """List all reference projects (visible to all authenticated users)."""
    return await get_reference_projects(db)


@router.get("/filter-members", response_model=list[UserBrief])
async def list_filter_members_endpoint(
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Return distinct users who share at least one project with the current user."""
    return await list_fellow_members(db, current_user.id)


@router.get("", response_model=PaginatedResponse[ProjectRead])
async def list_projects(
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100, alias="perPage"),
    statuses: list[str] | None = Query(None, alias="statuses"),
    member_ids: list[int] | None = Query(None, alias="memberIds"),
    created_after: datetime | None = Query(None, alias="createdAfter"),
    created_before: datetime | None = Query(None, alias="createdBefore"),
    search: str | None = Query(None),
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    items, total = await list_projects_for_user(
        db,
        current_user.id,
        page,
        per_page,
        statuses=statuses,
        member_ids=member_ids,
        created_after=created_after,
        created_before=created_before,
        search=search,
    )
    return PaginatedResponse(items=items, total=total, page=page, per_page=per_page)


@router.post("", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
async def create_project_endpoint(
    body: ProjectCreate,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await create_project(db, body, current_user.id)


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project_endpoint(
    project_id: int,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    project = await get_project(db, project_id, current_user.id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.patch("/{project_id}", response_model=ProjectRead)
async def update_project_endpoint(
    project_id: int,
    body: ProjectUpdate,
    _: User = Depends(require_project_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    project = await update_project(db, project_id, body)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_endpoint(
    project_id: int,
    _: User = Depends(require_project_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    await delete_project(db, project_id)


# --- Members ---


@router.get("/{project_id}/members", response_model=list[MemberRead])
async def list_members_endpoint(
    project_id: int,
    _: User = Depends(require_project_role(["admin", "contributor", "viewer"])),
    db: AsyncSession = Depends(get_db),
):
    return await list_members(db, project_id)


@router.post(
    "/{project_id}/members", response_model=MemberRead, status_code=status.HTTP_201_CREATED
)
async def add_member_endpoint(
    project_id: int,
    body: MemberCreate,
    current_user: User = Depends(require_project_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    try:
        member = await add_member(db, project_id, body.email, body.role, current_user)
    except AlreadyMemberError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a member of this project",
        )
    if member is None:
        raise HTTPException(status_code=404, detail="User not found")
    return member


@router.patch("/{project_id}/members/{user_id}", response_model=MemberRead)
async def update_member_endpoint(
    project_id: int,
    user_id: int,
    body: MemberUpdate,
    current_user: User = Depends(require_project_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    if body.role != "admin":
        admin_count = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user_id,
                ProjectMember.role == "admin",
            )
        )
        target_is_admin = admin_count.scalar_one_or_none() is not None
        if target_is_admin:
            all_admins = await db.execute(
                select(ProjectMember).where(
                    ProjectMember.project_id == project_id,
                    ProjectMember.role == "admin",
                )
            )
            if len(list(all_admins.scalars().all())) <= 1:
                raise HTTPException(status_code=400, detail="Cannot demote the last admin")

    member = await update_member_role(db, project_id, user_id, body.role)
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    return member


@router.delete("/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member_endpoint(
    project_id: int,
    user_id: int,
    current_user: User = Depends(require_project_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot remove yourself")

    target = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    target_member = target.scalar_one_or_none()
    if target_member is None:
        raise HTTPException(status_code=404, detail="Member not found")

    if target_member.role == "admin":
        all_admins = await db.execute(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.role == "admin",
            )
        )
        if len(list(all_admins.scalars().all())) <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last admin")

    await remove_member(db, project_id, user_id)
