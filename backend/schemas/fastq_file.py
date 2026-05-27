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
    sequence_length: int | None = None
    file_path: str
    fastqc_report_path: str | None = None
    is_trimmed: bool = False
    adapter_status: str | None = None
    upload_source: str | None = None
    uploaded_at: datetime


class FastqFileUploadResponse(CamelModel):
    uploaded: list[FastqFileRead]
    total_bytes: int
    file_count: int


class FastqcModuleSummary(CamelModel):
    name: str
    status: str


class FastqcSummaryResponse(CamelModel):
    filename: str
    total_reads: int | None = None
    module_summaries: list[FastqcModuleSummary]
