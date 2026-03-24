# backend/models/user.py
from datetime import datetime

from fastapi_users.db import SQLAlchemyBaseUserTable
from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class User(SQLAlchemyBaseUserTable[int], Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    first_name: Mapped[str | None] = mapped_column(String)
    last_name: Mapped[str | None] = mapped_column(String)
    email_notifications: Mapped[str] = mapped_column(String, default="always")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    projects_created: Mapped[list["Project"]] = relationship(  # noqa: F821
        back_populates="creator", foreign_keys="[Project.created_by]"
    )
    memberships: Mapped[list["ProjectMember"]] = relationship(  # noqa: F821
        back_populates="user", foreign_keys="[ProjectMember.user_id]"
    )
    notifications: Mapped[list["Notification"]] = relationship(  # noqa: F821
        back_populates="user"
    )
