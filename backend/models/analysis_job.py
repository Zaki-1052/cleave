# backend/models/analysis_job.py
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class AnalysisJob(Base):
    __tablename__ = "analysis_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    experiment_id: Mapped[int] = mapped_column(
        ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False
    )
    job_type: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String(30), nullable=False)
    notes: Mapped[str | None] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="queued")
    params: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    parent_job_id: Mapped[int | None] = mapped_column(ForeignKey("analysis_jobs.id"))
    launched_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(String)
    methods_text: Mapped[str | None] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    experiment: Mapped["Experiment"] = relationship(  # noqa: F821
        back_populates="analysis_jobs"
    )
    launcher: Mapped["User"] = relationship()  # noqa: F821
    parent_job: Mapped["AnalysisJob | None"] = relationship(remote_side=[id])
    outputs: Mapped[list["JobOutput"]] = relationship(  # noqa: F821
        back_populates="job", cascade="all, delete-orphan"
    )
