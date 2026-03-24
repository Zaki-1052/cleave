# backend/schemas/common.py
from enum import StrEnum
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


def to_camel(string: str) -> str:
    parts = string.split("_")
    return parts[0] + "".join(word.capitalize() for word in parts[1:])


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


class ExperimentStatus(StrEnum):
    NEW = "new"
    IN_PROGRESS = "in_progress"
    COMPLETE = "complete"
    ERROR = "error"
    TERMINATED = "terminated"


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETE = "complete"
    ERROR = "error"
    TERMINATED = "terminated"


class ProjectRole(StrEnum):
    ADMIN = "admin"
    CONTRIBUTOR = "contributor"
    VIEWER = "viewer"


class AssayType(StrEnum):
    CUT_AND_RUN = "CUT&RUN"
    CUT_AND_TAG = "CUT&Tag"


class Organism(StrEnum):
    HUMAN = "Human"
    MOUSE = "Mouse"
    DROSOPHILA = "Drosophila"
    YEAST = "Yeast"


class PaginatedResponse(CamelModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    per_page: int


class ErrorResponse(CamelModel):
    error: str
    detail: str | None = None
    field_errors: dict[str, str] | None = None
