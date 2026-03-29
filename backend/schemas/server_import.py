# backend/schemas/server_import.py
from datetime import datetime
from typing import Literal

from pydantic import Field

from schemas.common import CamelModel

# --- Browse ---


class ServerConnectRequest(CamelModel):
    """Connect to an FTP/SFTP server and list a directory."""

    protocol: Literal["ftp", "sftp"]
    host: str = Field(min_length=1, max_length=255)
    port: int | None = None
    username: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1)
    path: str = "/"
    saved_server_id: int | None = None  # if connecting via saved server


class RemoteFileEntry(CamelModel):
    """A file or directory on the remote server."""

    name: str
    path: str
    is_dir: bool
    size: int | None = None


class ServerBrowseResponse(CamelModel):
    """Directory listing from a remote server."""

    current_path: str
    entries: list[RemoteFileEntry]


# --- Import ---


class ServerImportRequest(CamelModel):
    """Import specific FASTQ files from a remote server."""

    protocol: Literal["ftp", "sftp"]
    host: str = Field(min_length=1, max_length=255)
    port: int | None = None
    username: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1)
    file_paths: list[str] = Field(min_length=1)
    save_server: bool = False
    server_name: str | None = None  # required if save_server is True


class ServerImportStartedResponse(CamelModel):
    """Returned after starting a background import."""

    import_id: str
    file_count: int
    message: str


# --- Progress ---


class ImportFileProgress(CamelModel):
    """Progress for a single file in an import."""

    remote_path: str
    filename: str
    status: Literal["pending", "downloading", "complete", "error"]
    bytes_downloaded: int = 0
    bytes_total: int | None = None
    error: str | None = None


class ServerImportProgress(CamelModel):
    """Overall import progress."""

    import_id: str
    experiment_id: int
    user_id: int
    status: Literal["connecting", "downloading", "complete", "error"]
    files: list[ImportFileProgress]
    completed_count: int
    total_count: int
    error: str | None = None


# --- Saved Servers ---


class SavedServerCreate(CamelModel):
    """Create a new saved server connection."""

    name: str = Field(min_length=1, max_length=100)
    protocol: Literal["ftp", "sftp"]
    host: str = Field(min_length=1, max_length=255)
    port: int | None = None
    username: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1)
    default_path: str = "/"


class SavedServerUpdate(CamelModel):
    """Update a saved server — all fields optional."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    default_path: str | None = None
    username: str | None = Field(default=None, min_length=1, max_length=255)
    password: str | None = Field(default=None, min_length=1)


class SavedServerRead(CamelModel):
    """Saved server response — password is NEVER included."""

    id: int
    name: str
    protocol: str
    host: str
    port: int | None
    username: str
    default_path: str
    created_at: datetime
    updated_at: datetime
