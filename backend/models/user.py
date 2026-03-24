# backend/models/user.py
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    first_name: Mapped[str | None] = mapped_column(String)
    last_name: Mapped[str | None] = mapped_column(String)
    email_notifications: Mapped[str] = mapped_column(String, default="always")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    projects_created: Mapped[list["Project"]] = relationship(  # noqa: F821
        back_populates="creator"
    )
    memberships: Mapped[list["ProjectMember"]] = relationship(  # noqa: F821
        back_populates="user"
    )
    notifications: Mapped[list["Notification"]] = relationship(  # noqa: F821
        back_populates="user"
    )
