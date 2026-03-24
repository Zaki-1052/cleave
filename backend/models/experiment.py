# backend/models/experiment.py
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Experiment(Base):
    __tablename__ = "experiments"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    assay_type: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="new")
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    storage_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    project: Mapped["Project"] = relationship(back_populates="experiments")  # noqa: F821
    creator: Mapped["User"] = relationship()  # noqa: F821
    fastq_files: Mapped[list["FastqFile"]] = relationship(  # noqa: F821
        back_populates="experiment", cascade="all, delete-orphan"
    )
    reactions: Mapped[list["Reaction"]] = relationship(  # noqa: F821
        back_populates="experiment", cascade="all, delete-orphan"
    )
    analysis_jobs: Mapped[list["AnalysisJob"]] = relationship(  # noqa: F821
        back_populates="experiment", cascade="all, delete-orphan"
    )
