# backend/services/project_service.py
import shutil
from datetime import datetime
from pathlib import Path

from sqlalchemy import and_, func, or_, select
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from config import settings
from models.project import Project, ProjectMember
from models.user import User
from schemas.project import ProjectCreate, ProjectUpdate
from services import notification_service


class AlreadyMemberError(Exception):
    pass


async def create_project(db: AsyncSession, data: ProjectCreate, creator_id: int) -> Project:
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
    db: AsyncSession,
    user_id: int,
    page: int,
    per_page: int,
    statuses: list[str] | None = None,
    member_ids: list[int] | None = None,
    created_after: datetime | None = None,
    created_before: datetime | None = None,
    search: str | None = None,
) -> tuple[list[Project], int]:
    base = (
        select(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == user_id)
    )

    if statuses:
        base = base.where(Project.status.in_(statuses))

    if member_ids:
        member_subq = select(ProjectMember.project_id).where(ProjectMember.user_id.in_(member_ids))
        base = base.where(Project.id.in_(member_subq))

    if created_after is not None:
        base = base.where(Project.created_at >= created_after)

    if created_before is not None:
        base = base.where(Project.created_at <= created_before)

    if search is not None:
        base = base.where(Project.name.ilike(f"%{search}%"))

    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar_one()
    result = await db.execute(
        base.order_by(Project.updated_at.desc()).offset((page - 1) * per_page).limit(per_page)
    )
    return list(result.scalars().all()), total


async def list_fellow_members(db: AsyncSession, user_id: int) -> list[User]:
    """Return distinct users who share at least one project with the given user."""
    my_projects = select(ProjectMember.project_id).where(ProjectMember.user_id == user_id)
    stmt = (
        select(User)
        .join(ProjectMember, ProjectMember.user_id == User.id)
        .where(ProjectMember.project_id.in_(my_projects))
        .distinct()
        .order_by(User.email)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def recompute_project_status(db: AsyncSession, project_id: int) -> None:
    """Derive project status from its experiments' statuses and persist it."""
    from models.experiment import Experiment

    result = await db.execute(select(Experiment.status).where(Experiment.project_id == project_id))
    statuses = [row[0] for row in result.all()]

    if not statuses:
        new_status = "new"
    elif any(s == "error" for s in statuses):
        new_status = "error"
    elif any(s == "in_progress" for s in statuses):
        new_status = "in_progress"
    elif all(s == "complete" for s in statuses):
        new_status = "complete"
    elif any(s == "terminated" for s in statuses):
        new_status = "terminated"
    else:
        new_status = "new"

    await db.execute(sa_update(Project).where(Project.id == project_id).values(status=new_status))


async def get_project(db: AsyncSession, project_id: int, user_id: int) -> Project | None:
    result = await db.execute(
        select(Project)
        .outerjoin(
            ProjectMember,
            and_(ProjectMember.project_id == Project.id, ProjectMember.user_id == user_id),
        )
        .where(
            Project.id == project_id,
            or_(ProjectMember.user_id.isnot(None), Project.is_reference.is_(True)),
        )
    )
    return result.scalar_one_or_none()


async def get_reference_projects(db: AsyncSession) -> list[Project]:
    result = await db.execute(
        select(Project).where(Project.is_reference.is_(True)).order_by(Project.name)
    )
    return list(result.scalars().all())


async def update_project(db: AsyncSession, project_id: int, data: ProjectUpdate) -> Project | None:
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
    if project and project.is_reference:
        return  # Reference projects cannot be deleted
    if project:
        await db.delete(project)
        await db.commit()

        # Clean up disk files after successful commit
        project_dir = Path(settings.STORAGE_ROOT) / "projects" / str(project_id)
        if project_dir.exists():
            shutil.rmtree(project_dir, ignore_errors=True)


async def list_members(db: AsyncSession, project_id: int) -> list[ProjectMember]:
    result = await db.execute(
        select(ProjectMember)
        .where(ProjectMember.project_id == project_id)
        .options(selectinload(ProjectMember.user))
    )
    return list(result.scalars().all())


async def add_member(
    db: AsyncSession,
    project_id: int,
    email: str,
    role: str,
    inviter: User,
) -> ProjectMember | None:
    user_result = await db.execute(select(User).where(User.email == email))
    user = user_result.scalar_one_or_none()
    if user is None:
        return None

    existing = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user.id,
        )
    )
    if existing.scalar_one_or_none() is not None:
        raise AlreadyMemberError()

    member = ProjectMember(
        project_id=project_id,
        user_id=user.id,
        role=role,
        invited_by=inviter.id,
    )
    db.add(member)
    await db.flush()

    project_result = await db.execute(select(Project.name).where(Project.id == project_id))
    project_name = project_result.scalar_one()

    inviter_name = (
        f"{inviter.first_name} {inviter.last_name}"
        if inviter.first_name and inviter.last_name
        else inviter.email
    )
    await notification_service.create_notification(
        db=db,
        user_id=user.id,
        type="project_invitation",
        title="Project Invitation",
        message=f'{inviter_name} has made you a {role.title()} in project "{project_name}".',
        link_target=f"/projects/{project_id}",
    )

    result = await db.execute(
        select(ProjectMember)
        .where(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id)
        .options(selectinload(ProjectMember.user))
    )
    return result.scalar_one_or_none()


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
    result = await db.execute(
        select(ProjectMember)
        .where(ProjectMember.project_id == project_id, ProjectMember.user_id == user_id)
        .options(selectinload(ProjectMember.user))
    )
    return result.scalar_one_or_none()


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
