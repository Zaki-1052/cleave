# backend/services/file_service.py
from pathlib import Path

from schemas.file import FileNode


def validate_experiment_path(
    storage_root: str,
    project_id: int,
    experiment_id: int,
    relative_path: str,
) -> Path:
    """Validate and resolve a relative path within an experiment directory.

    Returns the absolute path if valid.
    Raises ValueError if path traversal is detected.
    """
    if ".." in relative_path.split("/") or relative_path.startswith("/"):
        raise ValueError("Invalid path")

    experiment_dir = (
        Path(storage_root) / "projects" / str(project_id) / str(experiment_id)
    )
    abs_path = (experiment_dir / relative_path).resolve()
    experiment_dir_resolved = experiment_dir.resolve()

    is_within = str(abs_path).startswith(str(experiment_dir_resolved) + "/")
    if not is_within and abs_path != experiment_dir_resolved:
        raise ValueError("Path outside experiment directory")

    return abs_path


def _get_file_type(filename: str) -> str:
    """Determine file type string from filename for UI display."""
    lower = filename.lower()
    if lower.endswith((".fastq.gz", ".fq.gz")):
        return "fastq.gz"
    if lower.endswith(".gz"):
        stem = lower.removesuffix(".gz")
        ext = Path(stem).suffix
        return ext.lstrip(".") + ".gz" if ext else "gz"
    ext = Path(lower).suffix
    return ext.lstrip(".") if ext else "file"


def _scan_directory(dir_path: Path, relative_base: str) -> tuple[FileNode, int, int]:
    """Recursively scan a directory and build a FileNode tree."""
    children: list[FileNode] = []
    total_files = 0
    total_size = 0

    try:
        entries = sorted(
            dir_path.iterdir(),
            key=lambda e: (not e.is_dir(), e.name.lower()),
        )
    except PermissionError:
        entries = []

    for entry in entries:
        if entry.name.startswith("."):
            continue
        if entry.is_symlink():
            continue

        rel_path = f"{relative_base}/{entry.name}" if relative_base else entry.name

        if entry.is_dir():
            child_node, child_files, child_size = _scan_directory(entry, rel_path)
            children.append(child_node)
            total_files += child_files
            total_size += child_size
        elif entry.is_file():
            size = entry.stat().st_size
            children.append(
                FileNode(
                    name=entry.name,
                    path=rel_path,
                    type=_get_file_type(entry.name),
                    size=size,
                    children=None,
                )
            )
            total_files += 1
            total_size += size

    node = FileNode(
        name=dir_path.name if relative_base else "Root",
        path=relative_base,
        type="folder",
        size=None,
        children=children,
    )
    return node, total_files, total_size


COMPRESSED_EXTENSIONS = frozenset({".gz", ".bam", ".bw", ".bigwig", ".zip", ".bz2", ".xz", ".zst"})


def is_compressed_file(filename: str) -> bool:
    """Check if a file extension indicates it is already compressed."""
    lower = filename.lower()
    return any(lower.endswith(ext) for ext in COMPRESSED_EXTENSIONS)


def get_xaccel_path(abs_path: Path, storage_root: str, internal_prefix: str) -> str:
    """Convert an absolute file path to an NGINX X-Accel-Redirect internal URI.

    The NGINX config maps internal_prefix to {storage_root}/projects/.
    """
    projects_dir = (Path(storage_root) / "projects").resolve()
    relative = abs_path.relative_to(projects_dir)
    return f"{internal_prefix.rstrip('/')}/{relative}"


def build_experiment_file_tree(
    storage_root: str,
    project_id: int,
    experiment_id: int,
) -> tuple[FileNode, int, int]:
    """Scan the experiment directory on disk and build a nested FileNode tree.

    Returns (root_node, total_files, total_size).
    """
    experiment_dir = (
        Path(storage_root) / "projects" / str(project_id) / str(experiment_id)
    )

    if not experiment_dir.is_dir():
        empty_root = FileNode(
            name="Root", path="", type="folder", size=None, children=[]
        )
        return empty_root, 0, 0

    return _scan_directory(experiment_dir, "")
