# backend/services/project_service.py
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.project import Project, ProjectMember
from models.user import User
from schemas.project import ProjectCreate, ProjectUpdate


async def create_project(
    db: AsyncSession, data: ProjectCreate, creator_id: int
) -> Project:
    project = Project(name=data.name, description=data.description, created_by=creator_id)
    db.add(project)
    await db.flush()
    member = ProjectMember(
        project_id=project.id, user_id=creator_id, role="admin", invited_by=creator_id
    )
    db.add(member)
    await db.commit()
    await db.refresh(project)
    return project


async def list_projects_for_user(
    db: AsyncSession, user_id: int, page: int, per_page: int
) -> tuple[list[Project], int]:
    base = (
        select(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == user_id)
    )
    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar_one()
    result = await db.execute(
        base.order_by(Project.updated_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    return list(result.scalars().all()), total


async def get_project(
    db: AsyncSession, project_id: int, user_id: int
) -> Project | None:
    result = await db.execute(
        select(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(Project.id == project_id, ProjectMember.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def update_project(
    db: AsyncSession, project_id: int, data: ProjectUpdate
) -> Project | None:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project is None:
        return None
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(project, field, value)
    await db.commit()
    await db.refresh(project)
    return project


async def delete_project(db: AsyncSession, project_id: int) -> None:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if project:
        await db.delete(project)
        await db.commit()


async def list_members(db: AsyncSession, project_id: int) -> list[ProjectMember]:
    result = await db.execute(
        select(ProjectMember).where(ProjectMember.project_id == project_id)
    )
    return list(result.scalars().all())


async def add_member(
    db: AsyncSession,
    project_id: int,
    email: str,
    role: str,
    invited_by_id: int,
) -> ProjectMember | None:
    user_result = await db.execute(select(User).where(User.email == email))
    user = user_result.scalar_one_or_none()
    if user is None:
        return None
    member = ProjectMember(
        project_id=project_id,
        user_id=user.id,
        role=role,
        invited_by=invited_by_id,
    )
    db.add(member)
    await db.commit()
    await db.refresh(member)
    return member


async def update_member_role(
    db: AsyncSession, project_id: int, user_id: int, role: str
) -> ProjectMember | None:
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        return None
    member.role = role
    await db.commit()
    await db.refresh(member)
    return member


async def remove_member(db: AsyncSession, project_id: int, user_id: int) -> None:
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if member:
        await db.delete(member)
        await db.commit()
