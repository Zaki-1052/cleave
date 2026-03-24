# backend/models/reaction.py
from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Reaction(Base):
    __tablename__ = "reactions"
    __table_args__ = (
        UniqueConstraint("experiment_id", "organism", "short_name", name="uq_reaction_org_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    experiment_id: Mapped[int] = mapped_column(
        ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False
    )
    fastq_prefix: Mapped[str] = mapped_column(String, nullable=False)
    short_name: Mapped[str] = mapped_column(String, nullable=False)
    organism: Mapped[str] = mapped_column(String, nullable=False)
    assay_type: Mapped[str] = mapped_column(String, nullable=False)
    cutana_spike_in: Mapped[str] = mapped_column(String, default="None")
    cutana_spike_in_target: Mapped[str | None] = mapped_column(String)
    ecoli_spike_in: Mapped[bool] = mapped_column(Boolean, default=False)
    cell_type: Mapped[str | None] = mapped_column(String)
    cell_number: Mapped[str | None] = mapped_column(String)
    sample_prep: Mapped[str | None] = mapped_column(String)
    experimental_condition: Mapped[str | None] = mapped_column(String)
    antibody_vendor: Mapped[str | None] = mapped_column(String)
    antibody_cat_no: Mapped[str | None] = mapped_column(String)
    antibody_lot_no: Mapped[str | None] = mapped_column(String)
    cutana_spike_in_2: Mapped[str | None] = mapped_column(String)
    cutana_spike_in_target_2: Mapped[str | None] = mapped_column(String)

    experiment: Mapped["Experiment"] = relationship(  # noqa: F821
        back_populates="reactions"
    )
    job_outputs: Mapped[list["JobOutput"]] = relationship(  # noqa: F821
        back_populates="reaction"
    )
