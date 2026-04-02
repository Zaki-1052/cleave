# backend/schemas/project.py
from datetime import datetime
from typing import Literal

from pydantic import ConfigDict

from schemas.common import CamelModel

RoleType = Literal["admin", "contributor", "viewer"]


class ProjectCreate(CamelModel):
    name: str
    description: str | None = None


class ProjectRead(CamelModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    created_by: int | None = None
    storage_bytes: int = 0
    is_reference: bool = False
    is_training: bool = False
    status: str = "new"
    created_at: datetime
    updated_at: datetime


class ProjectUpdate(CamelModel):
    name: str | None = None
    description: str | None = None


class MemberCreate(CamelModel):
    email: str
    role: RoleType = "contributor"


class UserBrief(CamelModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    first_name: str | None = None
    last_name: str | None = None


class MemberRead(CamelModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    project_id: int
    role: str
    can_download: bool = True
    can_delete: bool = False
    created_at: datetime
    user: UserBrief


class MemberUpdate(CamelModel):
    role: RoleType
