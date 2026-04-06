# backend/services/server_import_service.py
"""Server-side FTP/SFTP import — browse remote directories and download FASTQ files."""

import asyncio
import ipaddress
import shutil
import socket
import time
import uuid
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
    VALID_EXTENSIONS,
    _build_storage_path,
    _relative_storage_path,
    validate_fastq_filename,
)
from services.job_output_service import update_storage_bytes
from services.notification_service import create_notification

logger = structlog.get_logger(__name__)

# In-memory progress tracker — keyed by import_id (UUID string)
_active_imports: dict[str, ServerImportProgress] = {}

# Track which user owns each import for SSE filtering
_import_owners: dict[str, int] = {}

# Cleanup timestamps for completed imports
_import_completion_times: dict[str, float] = {}

CLEANUP_DELAY_SECONDS = 300  # 5 minutes
CONNECTION_TIMEOUT = 15
LISTING_TIMEOUT = 30
DOWNLOAD_TIMEOUT = 14400  # 4 hours per file
CHUNK_SIZE = 1024 * 1024  # 1 MB

# SSRF blocklist — private and reserved IP ranges
_BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]


def _validate_host(host: str) -> None:
    """Block connections to private/reserved IPs to prevent SSRF."""
    blocked_hostnames = {"localhost", "metadata.internal", "metadata.google.internal"}
    if host.lower() in blocked_hostnames:
        raise ValueError(f"Connection to '{host}' is not allowed")

    try:
        resolved = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise ValueError(f"Cannot resolve hostname: {host}")

    for _, _, _, _, sockaddr in resolved:
        ip = ipaddress.ip_address(sockaddr[0])
        # Unwrap IPv6-mapped IPv4 (e.g. ::ffff:127.0.0.1 -> 127.0.0.1)
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        for network in _BLOCKED_NETWORKS:
            if ip in network:
                raise ValueError(f"Connection to private/reserved address is not allowed: {host}")


def _is_fastq_name(filename: str) -> bool:
    lower = filename.lower()
    return any(lower.endswith(ext) for ext in VALID_EXTENSIONS)


def _default_port(protocol: str) -> int:
    return 22 if protocol == "sftp" else 21


# ---------------------------------------------------------------------------
# Browse
# ---------------------------------------------------------------------------


async def browse_server(
    protocol: str,
    host: str,
    port: int | None,
    username: str,
    password: str,
    path: str,
) -> ServerBrowseResponse:
    """Connect to a remote server, list directory, disconnect."""
    _validate_host(host)
    effective_port = port or _default_port(protocol)

    if settings.PIPELINE_MODE == "mock":
        return _mock_browse(path)

    if protocol == "sftp":
        return await _browse_sftp(host, effective_port, username, password, path)
    return await _browse_ftp(host, effective_port, username, password, path)


async def _browse_ftp(
    host: str, port: int, username: str, password: str, path: str
) -> ServerBrowseResponse:
    import aioftp

    try:
        async with asyncio.timeout(CONNECTION_TIMEOUT):
            client = aioftp.Client()
            await client.connect(host, port)
            await client.login(username, password)
    except TimeoutError:
        raise ValueError(f"Connection timed out: {host}:{port}")
    except Exception as exc:
        raise ValueError(f"FTP connection failed: {exc}")

    try:
        async with asyncio.timeout(LISTING_TIMEOUT):
            entries: list[RemoteFileEntry] = []
            async for ftp_path, info in client.list(path):
                name = PurePosixPath(str(ftp_path)).name
                if name in (".", ".."):
                    continue
                is_dir = info.get("type") == "dir"
                size = int(info.get("size", 0)) if not is_dir else None
                full_path = f"{path.rstrip('/')}/{name}"
                entries.append(RemoteFileEntry(name=name, path=full_path, is_dir=is_dir, size=size))
    except TimeoutError:
        raise ValueError(f"Directory listing timed out for {path}")
    finally:
        await client.quit()

    entries.sort(key=lambda e: (not e.is_dir, e.name.lower()))
    return ServerBrowseResponse(current_path=path, entries=entries)


async def _browse_sftp(
    host: str, port: int, username: str, password: str, path: str
) -> ServerBrowseResponse:
    import asyncssh

    try:
        async with asyncio.timeout(CONNECTION_TIMEOUT):
            conn = await asyncssh.connect(
                host, port, username=username, password=password, known_hosts=None
            )
    except TimeoutError:
        raise ValueError(f"Connection timed out: {host}:{port}")
    except Exception as exc:
        raise ValueError(f"SFTP connection failed: {exc}")

    try:
        async with asyncio.timeout(LISTING_TIMEOUT):
            async with conn.start_sftp_client() as sftp:
                entries: list[RemoteFileEntry] = []
                for attrs in await sftp.readdir(path):
                    name = attrs.filename
                    if name in (".", ".."):
                        continue
                    is_dir = attrs.type == asyncssh.FILEXFER_TYPE_DIRECTORY
                    size = attrs.size if not is_dir else None
                    full_path = f"{path.rstrip('/')}/{name}"
                    entries.append(
                        RemoteFileEntry(name=name, path=full_path, is_dir=is_dir, size=size)
                    )
    except TimeoutError:
        raise ValueError(f"Directory listing timed out for {path}")
    finally:
        conn.close()

    entries.sort(key=lambda e: (not e.is_dir, e.name.lower()))
    return ServerBrowseResponse(current_path=path, entries=entries)


def _mock_browse(path: str) -> ServerBrowseResponse:
    """Return a canned directory listing for mock mode."""
    entries = [
        RemoteFileEntry(name="raw_data", path=f"{path.rstrip('/')}/raw_data", is_dir=True),
        RemoteFileEntry(
            name="Sample1_R1_001.fastq.gz",
            path=f"{path.rstrip('/')}/Sample1_R1_001.fastq.gz",
            is_dir=False,
            size=5_242_880,
        ),
        RemoteFileEntry(
            name="Sample1_R2_001.fastq.gz",
            path=f"{path.rstrip('/')}/Sample1_R2_001.fastq.gz",
            is_dir=False,
            size=5_242_880,
        ),
        RemoteFileEntry(
            name="Sample2_R1_001.fastq.gz",
            path=f"{path.rstrip('/')}/Sample2_R1_001.fastq.gz",
            is_dir=False,
            size=6_291_456,
        ),
        RemoteFileEntry(
            name="Sample2_R2_001.fastq.gz",
            path=f"{path.rstrip('/')}/Sample2_R2_001.fastq.gz",
            is_dir=False,
            size=6_291_456,
        ),
        RemoteFileEntry(
            name="readme.txt",
            path=f"{path.rstrip('/')}/readme.txt",
            is_dir=False,
            size=1024,
        ),
    ]
    return ServerBrowseResponse(current_path=path, entries=entries)


# ---------------------------------------------------------------------------
# Import (background task)
# ---------------------------------------------------------------------------


def generate_import_id() -> str:
    return str(uuid.uuid4())


def get_import_progress(import_id: str) -> ServerImportProgress | None:
    _cleanup_stale_imports()
    return _active_imports.get(import_id)


def get_active_imports_for_user(user_id: int) -> dict[str, ServerImportProgress]:
    """Return all active (non-stale) imports for a user, keyed by import_id."""
    _cleanup_stale_imports()
    return {
        iid: progress
        for iid, progress in _active_imports.items()
        if _import_owners.get(iid) == user_id
    }


def has_active_import(user_id: int) -> bool:
    """Check if user already has an import in progress."""
    for iid, progress in _active_imports.items():
        if _import_owners.get(iid) == user_id and progress.status in ("connecting", "downloading"):
            return True
    return False


def _cleanup_stale_imports() -> None:
    now = time.monotonic()
    stale = [
        iid for iid, ts in _import_completion_times.items() if now - ts > CLEANUP_DELAY_SECONDS
    ]
    for iid in stale:
        _active_imports.pop(iid, None)
        _import_owners.pop(iid, None)
        _import_completion_times.pop(iid, None)


async def start_import(
    import_id: str,
    protocol: str,
    host: str,
    port: int | None,
    username: str,
    password: str,
    file_paths: list[str],
    experiment_id: int,
    project_id: int,
    user_id: int,
) -> None:
    """Download FASTQ files from a remote server in the background.

    Launched via asyncio.create_task(). Creates its own DB session.
    """
    effective_port = port or _default_port(protocol)

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
        status="connecting",
        files=file_progresses,
        completed_count=0,
        total_count=len(file_paths),
    )
    _active_imports[import_id] = progress
    _import_owners[import_id] = user_id

    staging_dir = Path(settings.STORAGE_ROOT) / "uploads" / "server_import" / import_id
    staging_dir.mkdir(parents=True, exist_ok=True)

    try:
        progress.status = "downloading"

        for i, remote_path in enumerate(file_paths):
            fp = progress.files[i]
            filename = fp.filename

            try:
                fp.status = "downloading"

                if settings.PIPELINE_MODE == "mock":
                    await _mock_download(staging_dir / filename, fp)
                elif protocol == "sftp":
                    await _download_sftp(
                        host,
                        effective_port,
                        username,
                        password,
                        remote_path,
                        staging_dir / filename,
                        fp,
                    )
                else:
                    await _download_ftp(
                        host,
                        effective_port,
                        username,
                        password,
                        remote_path,
                        staging_dir / filename,
                        fp,
                    )

                # Move to final location and create DB record
                await _finalize_file(
                    staging_dir / filename,
                    filename,
                    experiment_id,
                    project_id,
                    user_id,
                )

                fp.status = "complete"
                progress.completed_count += 1

            except Exception as exc:
                logger.warning(
                    "server_import_file_error",
                    import_id=import_id,
                    filename=filename,
                    error=str(exc),
                )
                fp.status = "error"
                fp.error = str(exc)
                # Clean up partial file
                partial = staging_dir / filename
                if partial.exists():
                    partial.unlink()

        # Trigger FastQC for successfully imported files
        await _trigger_fastqc(experiment_id, project_id, user_id, progress)

        # Set final status
        if progress.completed_count == progress.total_count:
            progress.status = "complete"
        elif progress.completed_count > 0:
            progress.status = "complete"  # partial success
        else:
            progress.status = "error"
            progress.error = "All files failed to import"

        # Create notification
        await _create_completion_notification(progress, user_id, experiment_id)

    except Exception as exc:
        logger.error("server_import_fatal", import_id=import_id, error=str(exc))
        progress.status = "error"
        progress.error = str(exc)
    finally:
        # Clean up staging directory
        if staging_dir.exists():
            shutil.rmtree(staging_dir, ignore_errors=True)
        _import_completion_times[import_id] = time.monotonic()


async def _download_ftp(
    host: str,
    port: int,
    username: str,
    password: str,
    remote_path: str,
    local_path: Path,
    fp: ImportFileProgress,
) -> None:
    import aioftp

    local_path.parent.mkdir(parents=True, exist_ok=True)

    async with asyncio.timeout(DOWNLOAD_TIMEOUT):
        client = aioftp.Client()
        await client.connect(host, port)
        await client.login(username, password)
        try:
            stat = await client.stat(remote_path)
            fp.bytes_total = int(stat.get("size", 0)) or None

            async with client.download_stream(remote_path) as stream:
                with open(local_path, "wb") as f:
                    async for block in stream.iter_by_block(CHUNK_SIZE):
                        f.write(block)
                        fp.bytes_downloaded += len(block)
        finally:
            await client.quit()


async def _download_sftp(
    host: str,
    port: int,
    username: str,
    password: str,
    remote_path: str,
    local_path: Path,
    fp: ImportFileProgress,
) -> None:
    import asyncssh

    local_path.parent.mkdir(parents=True, exist_ok=True)

    async with asyncio.timeout(DOWNLOAD_TIMEOUT):
        async with asyncssh.connect(
            host, port, username=username, password=password, known_hosts=None
        ) as conn:
            async with conn.start_sftp_client() as sftp:
                attrs = await sftp.stat(remote_path)
                fp.bytes_total = attrs.size

                async with sftp.open(remote_path, "rb") as remote_f:
                    with open(local_path, "wb") as local_f:
                        while True:
                            chunk = await remote_f.read(CHUNK_SIZE)
                            if not chunk:
                                break
                            local_f.write(chunk)
                            fp.bytes_downloaded += len(chunk)


async def _mock_download(local_path: Path, fp: ImportFileProgress) -> None:
    """Simulate download by creating a small stub file."""
    local_path.parent.mkdir(parents=True, exist_ok=True)
    fp.bytes_total = 1024
    # Simulate progress over 1 second
    for step in range(4):
        await asyncio.sleep(0.25)
        fp.bytes_downloaded = (step + 1) * 256
    local_path.write_bytes(b"@mock_fastq\nACGT\n+\nIIII\n" * 64)
    fp.bytes_downloaded = fp.bytes_total


async def _finalize_file(
    staging_path: Path,
    filename: str,
    experiment_id: int,
    project_id: int,
    user_id: int,
    upload_source: str = "server",
    is_symlink: bool = False,
) -> None:
    """Move downloaded file to final location and create a FastqFile DB record."""
    # Validate filename
    prefix, direction = validate_fastq_filename(filename)

    # Check if auto-gzip needed
    lower = filename.lower()
    needs_gzip = lower.endswith(".fastq") or lower.endswith(".fq")
    final_filename = filename + ".gz" if needs_gzip else filename

    dest_path = _build_storage_path(project_id, experiment_id, final_filename)
    dest_path.parent.mkdir(parents=True, exist_ok=True)

    # Path traversal guard
    storage_root_resolved = Path(settings.STORAGE_ROOT).resolve()
    if not str(dest_path.resolve()).startswith(str(storage_root_resolved) + "/"):
        raise ValueError(f"Path traversal detected in filename: {filename}")

    if needs_gzip:
        import gzip as gzip_mod

        with open(staging_path, "rb") as f_in, gzip_mod.open(dest_path, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)
    else:
        shutil.move(str(staging_path), str(dest_path))

    file_size = dest_path.stat().st_size
    relative_path = _relative_storage_path(project_id, experiment_id, final_filename)

    # Symlinks don't consume Cleave's managed storage
    storage_delta = 0 if is_symlink else file_size

    # Create DB record with standalone session
    async with async_session_factory() as db:
        record = FastqFile(
            experiment_id=experiment_id,
            filename=final_filename,
            prefix=prefix,
            read_direction=direction,
            file_size_bytes=file_size,
            file_path=relative_path,
            upload_source=upload_source,
            is_symlink=is_symlink,
        )
        db.add(record)
        await update_storage_bytes(db, experiment_id, project_id, storage_delta)
        await db.commit()
        await db.refresh(record)

        source_label = "instance" if upload_source == "instance" else "server"
        await log_event_standalone(
            experiment_id=experiment_id,
            user_id=user_id,
            action="fastq_uploaded",
            resource_type="fastq",
            resource_id=record.id,
            detail=f"Imported {final_filename} from {source_label}",
        )


async def _trigger_fastqc(
    experiment_id: int,
    project_id: int,
    user_id: int,
    progress: ServerImportProgress,
    upload_source: str = "server",
) -> None:
    """Trigger FastQC for all successfully imported files."""
    from services.fastqc_service import FastqcInput, run_fastqc_for_files

    # Gather successfully imported files from DB
    async with async_session_factory() as db:
        from sqlalchemy import select

        completed_filenames = [f.filename for f in progress.files if f.status == "complete"]
        if not completed_filenames:
            return

        result = await db.execute(
            select(FastqFile).where(
                FastqFile.experiment_id == experiment_id,
                FastqFile.filename.in_(completed_filenames),
                FastqFile.upload_source == upload_source,
            )
        )
        records = list(result.scalars().all())

    if records:
        fastqc_inputs: list[FastqcInput] = [
            {"fastq_id": r.id, "file_path": r.file_path, "filename": r.filename} for r in records
        ]
        asyncio.create_task(run_fastqc_for_files(fastqc_inputs, project_id, experiment_id, user_id))


async def _create_completion_notification(
    progress: ServerImportProgress,
    user_id: int,
    experiment_id: int,
    source_label: str = "Server",
) -> None:
    """Create an in-app notification for import completion."""
    async with async_session_factory() as db:
        if progress.completed_count == progress.total_count:
            title = f"{source_label} import complete"
            message = f"Successfully imported {progress.completed_count} FASTQ file(s)"
        elif progress.completed_count > 0:
            failed = progress.total_count - progress.completed_count
            title = f"{source_label} import partially complete"
            message = (
                f"Imported {progress.completed_count} of {progress.total_count} files. "
                f"{failed} file(s) failed."
            )
        else:
            title = f"{source_label} import failed"
            message = f"All {progress.total_count} file(s) failed to import"

        await create_notification(
            db,
            user_id=user_id,
            type="server_import",
            title=title,
            message=message,
            link_target=f"/experiments/{experiment_id}/fastqs",
        )
