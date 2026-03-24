# backend/routers/projects.py
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from auth import current_active_user
from database import get_db
from dependencies import require_project_role
from models.user import User
from schemas.common import PaginatedResponse
from schemas.project import (
    MemberCreate,
    MemberRead,
    MemberUpdate,
    ProjectCreate,
    ProjectRead,
    ProjectUpdate,
)
from services.project_service import (
    add_member,
    create_project,
    delete_project,
    get_project,
    list_members,
    list_projects_for_user,
    remove_member,
    update_member_role,
    update_project,
)

router = APIRouter()


@router.get("", response_model=PaginatedResponse[ProjectRead])
async def list_projects(
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    items, total = await list_projects_for_user(db, current_user.id, page, per_page)
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
    current_user: User = Depends(current_active_user),
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
    member = await add_member(db, project_id, body.email, body.role, current_user.id)
    if member is None:
        raise HTTPException(status_code=404, detail="User not found")
    return member


@router.patch("/{project_id}/members/{user_id}", response_model=MemberRead)
async def update_member_endpoint(
    project_id: int,
    user_id: int,
    body: MemberUpdate,
    _: User = Depends(require_project_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    member = await update_member_role(db, project_id, user_id, body.role)
    if member is None:
        raise HTTPException(status_code=404, detail="Member not found")
    return member


@router.delete("/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member_endpoint(
    project_id: int,
    user_id: int,
    _: User = Depends(require_project_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    await remove_member(db, project_id, user_id)
