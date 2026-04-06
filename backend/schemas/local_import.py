# backend/schemas/local_import.py
from pydantic import Field

from schemas.common import CamelModel


class LocalBrowseRequest(CamelModel):
    """Browse a directory on the server's local filesystem."""

    path: str = "/data"


class LocalImportRequest(CamelModel):
    """Import FASTQ files from local filesystem paths."""

    file_paths: list[str] = Field(min_length=1)
    use_symlink: bool = False


class LocalImportStartedResponse(CamelModel):
    """Returned after starting a background local import."""

    import_id: str
    file_count: int
    message: str
