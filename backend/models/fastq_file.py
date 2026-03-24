# backend/models/fastq_file.py
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class FastqFile(Base):
    __tablename__ = "fastq_files"

    id: Mapped[int] = mapped_column(primary_key=True)
    experiment_id: Mapped[int] = mapped_column(
        ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False
    )
    filename: Mapped[str] = mapped_column(String, nullable=False)
    prefix: Mapped[str] = mapped_column(String, nullable=False)
    read_direction: Mapped[str] = mapped_column(String, nullable=False)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    total_reads: Mapped[int | None] = mapped_column(BigInteger)
    file_path: Mapped[str] = mapped_column(String, nullable=False)
    is_trimmed: Mapped[bool] = mapped_column(Boolean, default=False)
    upload_source: Mapped[str | None] = mapped_column(String)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    experiment: Mapped["Experiment"] = relationship(  # noqa: F821
        back_populates="fastq_files"
    )
