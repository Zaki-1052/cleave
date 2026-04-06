# backend/services/local_import_service.py
"""Local filesystem import — browse instance directories and copy/symlink FASTQ files."""

import asyncio
import os
import shutil
import time
from pathlib import Path, PurePosixPath

import structlog

from config import settings
from database import async_session_factory
from models.fastq_file import FastqFile
from schemas.server_import import (
    ImportFileProgress,
    RemoteFileEntry,
    ServerBrowseResponse,
    ServerImportProgress,
)
from services.event_service import log_event_standalone
from services.fastq_service import (
    _build_storage_path,
    _relative_storage_path,
    validate_fastq_filename,
)
from services.job_output_service import update_storage_bytes
from services.server_import_service import (
    _active_imports,
    _create_completion_notification,
    _finalize_file,
    _import_completion_times,
    _import_owners,
    _trigger_fastqc,
)

logger = structlog.get_logger(__name__)

CHUNK_SIZE = 1024 * 1024  # 1 MB

# System directories that should never be browsed or imported from
_BLOCKED_PREFIXES = (
    "/proc",
    "/sys",
    "/dev",
    "/etc",
    "/var/run",
    "/boot",
    "/root",
)


def validate_local_path(path: str, must_be_dir: bool = True) -> Path:
    """Validate and resolve a local filesystem path.

    Enforces allowlist (LOCAL_IMPORT_DEFAULT_PATH), rejects STORAGE_ROOT and system dirs.
    """
    if not path or not path.startswith("/"):
        raise ValueError("Path must be an absolute path starting with /")

    resolved = Path(path).resolve()
    resolved_str = str(resolved)

    # Allowlist: must be within LOCAL_IMPORT_DEFAULT_PATH
    allowed_root = str(Path(settings.LOCAL_IMPORT_DEFAULT_PATH).resolve())
    if allowed_root != "/" and not (
        resolved_str == allowed_root or resolved_str.startswith(allowed_root + "/")
    ):
        raise ValueError(f"Path must be under {settings.LOCAL_IMPORT_DEFAULT_PATH}")

    # Reject paths inside Cleave's managed storage
    storage_root = Path(settings.STORAGE_ROOT).resolve()
    if resolved_str.startswith(str(storage_root)):
        raise ValueError("Cannot import from Cleave's managed storage directory")

    # Reject system directories (defense-in-depth)
    for prefix in _BLOCKED_PREFIXES:
        if resolved_str == prefix or resolved_str.startswith(prefix + "/"):
            raise ValueError(f"Cannot access system directory: {prefix}")

    if not resolved.exists():
        raise ValueError(f"Path does not exist: {path}")

    if must_be_dir and not resolved.is_dir():
        raise ValueError(f"Path is not a directory: {path}")

    if not must_be_dir and not resolved.is_file():
        raise ValueError(f"Path is not a file: {path}")

    return resolved


async def browse_local(path: str) -> ServerBrowseResponse:
    """List a local directory's contents."""
    if settings.PIPELINE_MODE == "mock":
        return _mock_browse(path)

    resolved = validate_local_path(path, must_be_dir=True)

    def _scan() -> list[RemoteFileEntry]:
        entries: list[RemoteFileEntry] = []
        try:
            with os.scandir(resolved) as it:
                for entry in it:
                    # Skip hidden files
                    if entry.name.startswith("."):
                        continue
                    # Skip unreadable entries
                    if not os.access(entry.path, os.R_OK):
                        continue
                    try:
                        is_dir = entry.is_dir(follow_symlinks=True)
                        size = entry.stat(follow_symlinks=True).st_size if not is_dir else None
                    except OSError:
                        continue
                    entries.append(
                        RemoteFileEntry(
                            name=entry.name,
                            path=str(Path(entry.path)),
                            is_dir=is_dir,
                            size=size,
                        )
                    )
        except PermissionError:
            raise ValueError(f"Permission denied: {path}")
        return entries

    entries = await asyncio.to_thread(_scan)
    # Sort: directories first, then alphabetical
    entries.sort(key=lambda e: (not e.is_dir, e.name.lower()))
    return ServerBrowseResponse(current_path=str(resolved), entries=entries)


def _mock_browse(path: str) -> ServerBrowseResponse:
    """Return a canned directory listing for mock mode."""
    return ServerBrowseResponse(
        current_path=path,
        entries=[
            RemoteFileEntry(name="fastq", path=f"{path}/fastq", is_dir=True, size=None),
            RemoteFileEntry(name="human_fastq", path=f"{path}/human_fastq", is_dir=True, size=None),
            RemoteFileEntry(
                name="sample1_R1_001.fastq.gz",
                path=f"{path}/sample1_R1_001.fastq.gz",
                is_dir=False,
                size=1024000,
            ),
            RemoteFileEntry(
                name="sample1_R2_001.fastq.gz",
                path=f"{path}/sample1_R2_001.fastq.gz",
                is_dir=False,
                size=1024000,
            ),
        ],
    )


async def start_local_import(
    import_id: str,
    file_paths: list[str],
    use_symlink: bool,
    experiment_id: int,
    project_id: int,
    user_id: int,
) -> None:
    """Copy or symlink FASTQ files from local paths into Cleave's managed storage.

    Launched via asyncio.create_task(). Creates its own DB sessions.
    """
    file_progresses = [
        ImportFileProgress(
            remote_path=fp,
            filename=PurePosixPath(fp).name,
            status="pending",
        )
        for fp in file_paths
    ]

    progress = ServerImportProgress(
        import_id=import_id,
        experiment_id=experiment_id,
        user_id=user_id,
        status="downloading",
        files=file_progresses,
        completed_count=0,
        total_count=len(file_paths),
    )
    _active_imports[import_id] = progress
    _import_owners[import_id] = user_id

    staging_dir = Path(settings.STORAGE_ROOT) / "uploads" / "local_import" / import_id
    staging_dir.mkdir(parents=True, exist_ok=True)

    try:
        for i, source_path_str in enumerate(file_paths):
            fp = progress.files[i]
            filename = fp.filename
            source_path = Path(source_path_str).resolve()

            try:
                fp.status = "downloading"

                if settings.PIPELINE_MODE == "mock":
                    await _mock_copy(staging_dir / filename, fp)
                    await _finalize_file(
                        staging_dir / filename,
                        filename,
                        experiment_id,
                        project_id,
                        user_id,
                        upload_source="instance",
                    )
                elif use_symlink:
                    await _create_symlink(
                        source_path,
                        filename,
                        experiment_id,
                        project_id,
                        user_id,
                        fp,
                    )
                else:
                    await _copy_with_progress(source_path, staging_dir / filename, fp)
                    await _finalize_file(
                        staging_dir / filename,
                        filename,
                        experiment_id,
                        project_id,
                        user_id,
                        upload_source="instance",
                    )

                fp.status = "complete"
                progress.completed_count += 1

            except Exception as exc:
                logger.warning(
                    "local_import_file_error",
                    import_id=import_id,
                    filename=filename,
                    error=str(exc),
                )
                fp.status = "error"
                fp.error = str(exc)
                # Clean up partial staging file
                partial = staging_dir / filename
                if partial.exists():
                    partial.unlink()

        # Trigger FastQC for successfully imported files
        await _trigger_fastqc(
            experiment_id, project_id, user_id, progress, upload_source="instance"
        )

        # Set final status
        if progress.completed_count == progress.total_count:
            progress.status = "complete"
        elif progress.completed_count > 0:
            progress.status = "complete"  # partial success
        else:
            progress.status = "error"
            progress.error = "All files failed to import"

        # Create notification
        await _create_completion_notification(
            progress, user_id, experiment_id, source_label="Instance"
        )

    except Exception as exc:
        logger.error("local_import_fatal", import_id=import_id, error=str(exc))
        progress.status = "error"
        progress.error = str(exc)
    finally:
        if staging_dir.exists():
            shutil.rmtree(staging_dir, ignore_errors=True)
        _import_completion_times[import_id] = time.monotonic()


async def _copy_with_progress(src: Path, dst: Path, fp: ImportFileProgress) -> None:
    """Copy a file with chunk-level progress updates."""
    fp.bytes_total = src.stat().st_size
    dst.parent.mkdir(parents=True, exist_ok=True)

    def _do_copy() -> None:
        with open(src, "rb") as f_in, open(dst, "wb") as f_out:
            while True:
                chunk = f_in.read(CHUNK_SIZE)
                if not chunk:
                    break
                f_out.write(chunk)
                fp.bytes_downloaded += len(chunk)

    await asyncio.to_thread(_do_copy)


async def _mock_copy(dest: Path, fp: ImportFileProgress) -> None:
    """Simulate a local copy by creating a small stub file."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    fp.bytes_total = 1024
    for step in range(4):
        await asyncio.sleep(0.1)
        fp.bytes_downloaded = (step + 1) * 256
    dest.write_bytes(b"@mock_fastq\nACGT\n+\nIIII\n" * 64)
    fp.bytes_downloaded = fp.bytes_total


async def _create_symlink(
    source_path: Path,
    filename: str,
    experiment_id: int,
    project_id: int,
    user_id: int,
    fp: ImportFileProgress,
) -> None:
    """Create a symlink to the source file in Cleave's managed storage.

    Falls back to copy+gzip if the source is an uncompressed FASTQ.
    """
    prefix, direction = validate_fastq_filename(filename)

    # Uncompressed FASTQs can't be symlinked (Cleave expects .gz) — fall back to copy
    lower = filename.lower()
    needs_gzip = lower.endswith(".fastq") or lower.endswith(".fq")
    if needs_gzip:
        logger.info(
            "local_import_symlink_fallback_gzip",
            filename=filename,
            reason="Uncompressed FASTQ requires gzip; falling back to copy",
        )
        # Use staging + _finalize_file which handles gzip
        import tempfile

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir) / filename
            fp.bytes_total = source_path.stat().st_size

            def _do_copy() -> None:
                shutil.copy2(str(source_path), str(tmp_path))
                fp.bytes_downloaded = fp.bytes_total

            await asyncio.to_thread(_do_copy)
            await _finalize_file(
                tmp_path,
                filename,
                experiment_id,
                project_id,
                user_id,
                upload_source="instance",
                is_symlink=False,
            )
        return

    # Create the symlink
    final_filename = filename
    dest_path = _build_storage_path(project_id, experiment_id, final_filename)
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    # Path traversal guard
    storage_root_resolved = Path(settings.STORAGE_ROOT).resolve()
    if not str(dest_path.resolve()).startswith(str(storage_root_resolved) + "/"):
        raise ValueError(f"Path traversal detected in filename: {filename}")

    fp.bytes_total = source_path.stat().st_size
    os.symlink(str(source_path), str(dest_path))
    fp.bytes_downloaded = fp.bytes_total

    file_size = source_path.stat().st_size
    relative_path = _relative_storage_path(project_id, experiment_id, final_filename)

    # Create DB record — symlink doesn't consume Cleave's storage
    async with async_session_factory() as db:
        record = FastqFile(
            experiment_id=experiment_id,
            filename=final_filename,
            prefix=prefix,
            read_direction=direction,
            file_size_bytes=file_size,
            file_path=relative_path,
            upload_source="instance",
            is_symlink=True,
        )
        db.add(record)
        await update_storage_bytes(db, experiment_id, project_id, 0)
        await db.commit()
        await db.refresh(record)

        await log_event_standalone(
            experiment_id=experiment_id,
            user_id=user_id,
            action="fastq_uploaded",
            resource_type="fastq",
            resource_id=record.id,
            detail=f"Symlinked {final_filename} from instance",
        )
