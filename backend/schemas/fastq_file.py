# backend/schemas/fastq_file.py
from datetime import datetime

from pydantic import ConfigDict

from schemas.common import CamelModel


class FastqFileRead(CamelModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    experiment_id: int
    filename: str
    prefix: str
    read_direction: str
    file_size_bytes: int | None = None
    total_reads: int | None = None
    file_path: str
    is_trimmed: bool = False
    upload_source: str | None = None
    uploaded_at: datetime


class FastqFileUploadResponse(CamelModel):
    uploaded: list[FastqFileRead]
    total_bytes: int
    file_count: int
