# backend/schemas/experiment.py
from datetime import datetime

from pydantic import ConfigDict, Field

from schemas.common import CamelModel


class ExperimentCreate(CamelModel):
    name: str = Field(..., max_length=100)
    assay_type: str
    description: str | None = None


class ExperimentRead(CamelModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    name: str
    assay_type: str
    description: str | None = None
    status: str = "new"
    created_by: int | None = None
    storage_bytes: int = 0
    created_at: datetime
    updated_at: datetime


class ExperimentUpdate(CamelModel):
    name: str | None = Field(None, max_length=100)
    description: str | None = None
    assay_type: str | None = None
