# backend/services/fastq_service.py
import gzip
import re
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models.experiment import Experiment
from models.fastq_file import FastqFile
from models.project import Project
from services.permission_helpers import get_experiment_with_permission

CHUNK_SIZE = 1024 * 1024  # 1 MB
VALID_EXTENSIONS = (".fastq.gz", ".fastq", ".fq.gz", ".fq")


def validate_fastq_filename(filename: str) -> tuple[str, str]:
    """Validate FASTQ filename and extract (prefix, read_direction).

    Rules:
    - Must start with alphanumeric character
    - Must end with .fastq.gz, .fastq, .fq.gz, or .fq
    - Must contain _R1 or _R2 to identify read direction
    """
    if not filename:
        raise ValueError("Filename cannot be empty")

    if not re.match(r"^[A-Za-z0-9]", filename):
        raise ValueError(f"Filename must start with an alphanumeric character: {filename}")

    lower = filename.lower()
    if not any(lower.endswith(ext) for ext in VALID_EXTENSIONS):
        raise ValueError(f"Filename must end with .fastq.gz, .fastq, .fq.gz, or .fq: {filename}")

    # Strip extension to get the stem
    stem = filename
    for ext in sorted(VALID_EXTENSIONS, key=len, reverse=True):
        if lower.endswith(ext):
            stem = filename[: len(filename) - len(ext)]
            break

    # Extract read direction — greedy .+ matches the LAST _R1 or _R2
    match = re.match(r"^(.+)_R([12])(.*)?$", stem)
    if not match:
        raise ValueError(f"Filename must contain _R1 or _R2 to identify read direction: {filename}")

    prefix = match.group(1)
    read_direction = f"R{match.group(2)}"
    return prefix, read_direction


def _build_storage_path(project_id: int, experiment_id: int, filename: str) -> Path:
    """Build the destination path for a FASTQ file on disk."""
    return (
        Path(settings.STORAGE_ROOT)
        / "projects"
        / str(project_id)
        / str(experiment_id)
        / "fastqs"
        / "raw"
        / filename
    )


def _relative_storage_path(project_id: int, experiment_id: int, filename: str) -> str:
    """Build the relative path (from STORAGE_ROOT) for DB storage."""
    return f"projects/{project_id}/{experiment_id}/fastqs/raw/{filename}"


async def _save_file_to_disk(
    upload_file: UploadFile, dest_path: Path, auto_gzip: bool = False
) -> tuple[Path, int]:
    """Stream an UploadFile to disk in chunks.

    If auto_gzip is True, compresses the output and appends .gz to the path.
    Returns (final_path, bytes_written).
    """
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    if auto_gzip:
        dest_path = dest_path.parent / (dest_path.name + ".gz")
        bytes_written = 0
        with gzip.open(dest_path, "wb") as f:
            while chunk := await upload_file.read(CHUNK_SIZE):
                f.write(chunk)
                bytes_written += len(chunk)
        # Return the actual compressed size on disk
        return dest_path, dest_path.stat().st_size
    else:
        bytes_written = 0
        with open(dest_path, "wb") as f:
            while chunk := await upload_file.read(CHUNK_SIZE):
                f.write(chunk)
                bytes_written += len(chunk)
        return dest_path, bytes_written


async def _update_storage_bytes_atomic(
    db: AsyncSession, experiment_id: int, project_id: int, delta_bytes: int
) -> None:
    """Atomically increment storage_bytes on both experiment and project."""
    await db.execute(
        update(Experiment)
        .where(Experiment.id == experiment_id)
        .values(storage_bytes=Experiment.storage_bytes + delta_bytes)
    )
    await db.execute(
        update(Project)
        .where(Project.id == project_id)
        .values(storage_bytes=Project.storage_bytes + delta_bytes)
    )


async def upload_fastqs(
    db: AsyncSession,
    experiment_id: int,
    user_id: int,
    files: list[UploadFile],
) -> list[FastqFile] | None:
    """Upload one or more FASTQ files to an experiment.

    Returns None if experiment not found or user lacks permission.
    Raises ValueError on validation failure.
    """
    experiment = await get_experiment_with_permission(
        db, experiment_id, user_id, ["admin", "contributor"]
    )
    if experiment is None:
        return None

    project_id = experiment.project_id

    # Validate all filenames upfront (fail-fast)
    errors = []
    parsed: list[tuple[str, str, str]] = []  # (filename, prefix, direction)
    for f in files:
        try:
            prefix, direction = validate_fastq_filename(f.filename or "")
            parsed.append((f.filename or "", prefix, direction))
        except ValueError as e:
            errors.append(str(e))

    if errors:
        raise ValueError("; ".join(errors))

    # Check for duplicate filenames within this upload batch
    filenames_in_batch = [p[0] for p in parsed]
    if len(filenames_in_batch) != len(set(filenames_in_batch)):
        raise ValueError("Duplicate filenames in upload batch")

    # Check for duplicate filenames already in the experiment
    existing_result = await db.execute(
        select(FastqFile.filename).where(
            FastqFile.experiment_id == experiment_id,
            FastqFile.filename.in_(filenames_in_batch),
        )
    )
    existing_names = set(existing_result.scalars().all())
    if existing_names:
        raise ValueError(
            f"Files already exist in this experiment: {', '.join(sorted(existing_names))}"
        )

    # Write files to disk and create DB records
    created_records: list[FastqFile] = []
    written_paths: list[Path] = []
    total_bytes = 0

    try:
        for upload_file, (filename, prefix, direction) in zip(files, parsed):
            # Determine if auto-gzip is needed
            lower = filename.lower()
            needs_gzip = lower.endswith(".fastq") or lower.endswith(".fq")

            dest_path = _build_storage_path(project_id, experiment_id, filename)
            final_path, bytes_written = await _save_file_to_disk(
                upload_file, dest_path, auto_gzip=needs_gzip
            )
            written_paths.append(final_path)
            total_bytes += bytes_written

            # If auto-gzipped, update the stored filename
            final_filename = final_path.name if needs_gzip else filename
            relative_path = _relative_storage_path(project_id, experiment_id, final_filename)

            record = FastqFile(
                experiment_id=experiment_id,
                filename=final_filename,
                prefix=prefix,
                read_direction=direction,
                file_size_bytes=bytes_written,
                file_path=relative_path,
                upload_source="local",
            )
            db.add(record)
            created_records.append(record)

    except Exception:
        # Clean up any files written before the failure
        for path in written_paths:
            if path.exists():
                path.unlink()
        raise

    await _update_storage_bytes_atomic(db, experiment_id, project_id, total_bytes)
    await db.commit()

    # Refresh records to get server-generated fields (id, uploaded_at)
    for record in created_records:
        await db.refresh(record)

    return created_records


async def list_fastqs(
    db: AsyncSession,
    experiment_id: int,
    user_id: int,
    page: int,
    per_page: int,
) -> tuple[list[FastqFile], int] | None:
    """List FASTQ files for an experiment. Returns None if not authorized."""
    # Verify membership (any role)
    experiment = await get_experiment_with_permission(
        db, experiment_id, user_id, ["admin", "contributor", "viewer"]
    )
    if experiment is None:
        return None

    base = select(FastqFile).where(FastqFile.experiment_id == experiment_id)

    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar_one()

    result = await db.execute(
        base.order_by(FastqFile.uploaded_at.desc()).offset((page - 1) * per_page).limit(per_page)
    )
    return list(result.scalars().all()), total


async def delete_fastq(
    db: AsyncSession,
    experiment_id: int,
    fastq_id: int,
    user_id: int,
) -> bool:
    """Delete a FASTQ file (DB record + disk file). Returns False if not found."""
    experiment = await get_experiment_with_permission(
        db, experiment_id, user_id, ["admin", "contributor"]
    )
    if experiment is None:
        return False

    result = await db.execute(
        select(FastqFile).where(
            FastqFile.id == fastq_id,
            FastqFile.experiment_id == experiment_id,
        )
    )
    fastq = result.scalar_one_or_none()
    if fastq is None:
        return False

    # Delete FASTQ file from disk
    abs_path = Path(settings.STORAGE_ROOT) / fastq.file_path
    if abs_path.exists():
        abs_path.unlink()

    file_size = fastq.file_size_bytes or 0

    # Delete associated FastQC report from disk
    if fastq.fastqc_report_path:
        fastqc_abs = Path(settings.STORAGE_ROOT) / fastq.fastqc_report_path
        if fastqc_abs.exists():
            file_size += fastqc_abs.stat().st_size
            fastqc_abs.unlink()

    await db.delete(fastq)
    if file_size > 0:
        await _update_storage_bytes_atomic(db, experiment_id, experiment.project_id, -file_size)
    await db.commit()

    return True
