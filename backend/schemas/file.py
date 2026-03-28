# backend/schemas/file.py
from __future__ import annotations

from schemas.common import CamelModel


class FileNode(CamelModel):
    """A single file or folder in the experiment directory tree."""

    name: str
    path: str
    type: str
    size: int | None = None
    children: list[FileNode] | None = None


FileNode.model_rebuild()


class FileTreeResponse(CamelModel):
    """Root response for the experiment file tree endpoint."""

    root: FileNode
    total_files: int
    total_size: int


class BatchDownloadRequest(CamelModel):
    """Request body for batch file download."""

    paths: list[str]


class JobBatchDownloadRequest(CamelModel):
    """Request body for batch downloading job output files."""

    output_ids: list[int]


class DownloadTokenRequest(CamelModel):
    """Request body for generating a signed download token."""

    experiment_id: int
    path: str | None = None
    paths: list[str] | None = None


class DownloadTokenResponse(CamelModel):
    """Response containing the signed download URL."""

    url: str


class IGVTokenRequest(CamelModel):
    """Request body for generating signed IGV file serving tokens."""

    job_id: int
    output_ids: list[int]


class IGVTokenResponse(CamelModel):
    """Response containing signed URLs for IGV.js track loading."""

    tokens: dict[int, str]
