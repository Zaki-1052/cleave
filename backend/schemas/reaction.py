# backend/schemas/reaction.py
from pydantic import ConfigDict, field_validator

from schemas.common import AssayType, CamelModel, Organism


def _validate_organism(v: str) -> str:
    valid = {e.value for e in Organism}
    if v not in valid:
        raise ValueError(f"Organism must be one of: {', '.join(sorted(valid))}")
    return v


def _validate_assay_type(v: str) -> str:
    valid = {e.value for e in AssayType}
    if v not in valid:
        raise ValueError(f"Assay type must be one of: {', '.join(sorted(valid))}")
    return v


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

    @field_validator("organism")
    @classmethod
    def check_organism(cls, v: str) -> str:
        return _validate_organism(v)

    @field_validator("assay_type")
    @classmethod
    def check_assay_type(cls, v: str) -> str:
        return _validate_assay_type(v)


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


class ReactionUpdate(CamelModel):
    fastq_prefix: str | None = None
    short_name: str | None = None
    organism: str | None = None
    assay_type: str | None = None
    cutana_spike_in: str | None = None
    cutana_spike_in_target: str | None = None
    ecoli_spike_in: bool | None = None
    cell_type: str | None = None
    cell_number: str | None = None
    sample_prep: str | None = None
    experimental_condition: str | None = None
    antibody_vendor: str | None = None
    antibody_cat_no: str | None = None
    antibody_lot_no: str | None = None
    cutana_spike_in_2: str | None = None
    cutana_spike_in_target_2: str | None = None

    @field_validator("organism")
    @classmethod
    def check_organism(cls, v: str | None) -> str | None:
        if v is not None:
            return _validate_organism(v)
        return v

    @field_validator("assay_type")
    @classmethod
    def check_assay_type(cls, v: str | None) -> str | None:
        if v is not None:
            return _validate_assay_type(v)
        return v


class ReactionBulkCreate(CamelModel):
    reactions: list[ReactionCreate]


class PrefixInfo(CamelModel):
    prefix: str
    has_r1: bool
    has_r2: bool


class CsvImportResponse(CamelModel):
    created: int
    reactions: list[ReactionRead]
    warnings: list[str]
