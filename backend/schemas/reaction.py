# backend/schemas/reaction.py
from pydantic import ConfigDict

from schemas.common import CamelModel


class ReactionCreate(CamelModel):
    fastq_prefix: str
    short_name: str
    organism: str
    assay_type: str
    cutana_spike_in: str = "None"
    cutana_spike_in_target: str | None = None
    ecoli_spike_in: bool = False
    cell_type: str | None = None
    cell_number: str | None = None
    sample_prep: str | None = None
    experimental_condition: str | None = None
    antibody_vendor: str | None = None
    antibody_cat_no: str | None = None
    antibody_lot_no: str | None = None
    cutana_spike_in_2: str | None = None
    cutana_spike_in_target_2: str | None = None


class ReactionRead(CamelModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    experiment_id: int
    fastq_prefix: str
    short_name: str
    organism: str
    assay_type: str
    cutana_spike_in: str = "None"
    cutana_spike_in_target: str | None = None
    ecoli_spike_in: bool = False
    cell_type: str | None = None
    cell_number: str | None = None
    sample_prep: str | None = None
    experimental_condition: str | None = None
    antibody_vendor: str | None = None
    antibody_cat_no: str | None = None
    antibody_lot_no: str | None = None
    cutana_spike_in_2: str | None = None
    cutana_spike_in_target_2: str | None = None


class ReactionBulkCreate(CamelModel):
    reactions: list[ReactionCreate]
