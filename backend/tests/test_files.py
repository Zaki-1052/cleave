# backend/tests/test_files.py
import gzip
import io
from pathlib import Path

import pytest
from httpx import AsyncClient

from config import settings
from services.file_service import (
    _get_file_type,
    build_experiment_file_tree,
    validate_experiment_path,
)

FASTQ_CONTENT = b"@SEQ_ID\nACGTACGT\n+\nIIIIIIII\n"


async def _register_and_get_headers(client: AsyncClient, email: str) -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "testpass123"},
    )
    assert resp.status_code == 201
    token = resp.json()["accessToken"]
    return {"Authorization": f"Bearer {token}"}


async def _create_project(client: AsyncClient, headers: dict, name: str = "Test Project") -> int:
    resp = await client.post(
        "/api/v1/projects",
        json={"name": name},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_experiment(client: AsyncClient, headers: dict, project_id: int) -> int:
    resp = await client.post(
        "/api/v1/experiments",
        params={"projectId": project_id},
        json={"name": "H3K4me3", "assayType": "CUT&RUN"},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _make_fastq_gz(content: bytes = FASTQ_CONTENT) -> io.BytesIO:
    buf = io.BytesIO(gzip.compress(content))
    buf.seek(0)
    return buf


async def _upload_fastqs(client: AsyncClient, headers: dict, experiment_id: int):
    """Upload a pair of test FASTQs and return the response."""
    r1 = _make_fastq_gz()
    r2 = _make_fastq_gz()
    resp = await client.post(
        f"/api/v1/experiments/{experiment_id}/fastqs/upload",
        headers=headers,
        files=[
            ("files", ("sample_L001_R1_001.fastq.gz", r1, "application/gzip")),
            ("files", ("sample_L001_R2_001.fastq.gz", r2, "application/gzip")),
        ],
    )
    assert resp.status_code == 201
    return resp.json()


# --- File Tree Endpoint Tests ---


@pytest.mark.anyio
async def test_list_files_empty_experiment(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    experiment_id = await _create_experiment(client, headers, project_id)

    resp = await client.get(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["totalFiles"] == 0
    assert data["totalSize"] == 0
    assert data["root"]["name"] == "Root"
    assert data["root"]["type"] == "folder"
    assert data["root"]["children"] == []


@pytest.mark.anyio
async def test_list_files_after_upload(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    experiment_id = await _create_experiment(client, headers, project_id)
    await _upload_fastqs(client, headers, experiment_id)

    resp = await client.get(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["totalFiles"] >= 2
    assert data["totalSize"] > 0

    root = data["root"]
    assert root["type"] == "folder"
    folder_names = [c["name"] for c in root["children"] if c["type"] == "folder"]
    assert "fastqs" in folder_names


@pytest.mark.anyio
async def test_list_files_nonmember(client: AsyncClient):
    headers_a = await _register_and_get_headers(client, "a@example.com")
    headers_b = await _register_and_get_headers(client, "b@example.com")
    project_id = await _create_project(client, headers_a)
    experiment_id = await _create_experiment(client, headers_a, project_id)

    resp = await client.get(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=headers_b,
    )
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_list_files_hidden_files_skipped(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    experiment_id = await _create_experiment(client, headers, project_id)

    exp_dir = Path(settings.STORAGE_ROOT) / "projects" / str(project_id) / str(experiment_id)
    exp_dir.mkdir(parents=True, exist_ok=True)
    (exp_dir / ".DS_Store").write_text("hidden")
    (exp_dir / "visible.txt").write_text("hello")

    resp = await client.get(
        f"/api/v1/experiments/{experiment_id}/files",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    names = [c["name"] for c in data["root"]["children"]]
    assert "visible.txt" in names
    assert ".DS_Store" not in names


# --- Download Endpoint Tests ---


@pytest.mark.anyio
async def test_download_file(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    experiment_id = await _create_experiment(client, headers, project_id)
    await _upload_fastqs(client, headers, experiment_id)

    resp = await client.get(
        f"/api/v1/experiments/{experiment_id}/files/download",
        params={"path": "fastqs/raw/sample_L001_R1_001.fastq.gz"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert len(resp.content) > 0


@pytest.mark.anyio
async def test_download_path_traversal_dotdot(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    experiment_id = await _create_experiment(client, headers, project_id)

    resp = await client.get(
        f"/api/v1/experiments/{experiment_id}/files/download",
        params={"path": "../../etc/passwd"},
        headers=headers,
    )
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_download_path_traversal_absolute(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    experiment_id = await _create_experiment(client, headers, project_id)

    resp = await client.get(
        f"/api/v1/experiments/{experiment_id}/files/download",
        params={"path": "/etc/passwd"},
        headers=headers,
    )
    assert resp.status_code == 403


@pytest.mark.anyio
async def test_download_nonexistent_file(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    experiment_id = await _create_experiment(client, headers, project_id)

    resp = await client.get(
        f"/api/v1/experiments/{experiment_id}/files/download",
        params={"path": "fastqs/raw/does_not_exist.fastq.gz"},
        headers=headers,
    )
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_download_nonmember(client: AsyncClient):
    headers_a = await _register_and_get_headers(client, "a@example.com")
    headers_b = await _register_and_get_headers(client, "b@example.com")
    project_id = await _create_project(client, headers_a)
    experiment_id = await _create_experiment(client, headers_a, project_id)
    await _upload_fastqs(client, headers_a, experiment_id)

    resp = await client.get(
        f"/api/v1/experiments/{experiment_id}/files/download",
        params={"path": "fastqs/raw/sample_L001_R1_001.fastq.gz"},
        headers=headers_b,
    )
    assert resp.status_code == 404


# --- Service Unit Tests ---


def test_file_type_detection():
    assert _get_file_type("sample.fastq.gz") == "fastq.gz"
    assert _get_file_type("sample.fq.gz") == "fastq.gz"
    assert _get_file_type("report.html") == "html"
    assert _get_file_type("data.csv") == "csv"
    assert _get_file_type("reads.bam") == "bam"
    assert _get_file_type("signal.bw") == "bw"
    assert _get_file_type("peaks.bed") == "bed"
    assert _get_file_type("archive.tar.gz") == "tar.gz"
    assert _get_file_type("noext") == "file"


def test_tree_sorts_folders_first(tmp_path):
    exp_dir = tmp_path / "projects" / "1" / "1"
    exp_dir.mkdir(parents=True)
    (exp_dir / "zebra.txt").write_text("z")
    (exp_dir / "alpha.txt").write_text("a")
    sub = exp_dir / "middle_dir"
    sub.mkdir()
    (sub / "inner.txt").write_text("i")

    root, total_files, _ = build_experiment_file_tree(str(tmp_path), 1, 1)

    assert root.children is not None
    names = [c.name for c in root.children]
    assert names[0] == "middle_dir"
    assert names[1] == "alpha.txt"
    assert names[2] == "zebra.txt"
    assert total_files == 3


def test_validate_path_rejects_dotdot(tmp_path):
    with pytest.raises(ValueError):
        validate_experiment_path(str(tmp_path), 1, 1, "../../../etc/passwd")


def test_validate_path_rejects_absolute(tmp_path):
    with pytest.raises(ValueError):
        validate_experiment_path(str(tmp_path), 1, 1, "/etc/passwd")


def test_validate_path_accepts_valid(tmp_path):
    exp_dir = tmp_path / "projects" / "1" / "1" / "fastqs" / "raw"
    exp_dir.mkdir(parents=True)
    test_file = exp_dir / "sample.fastq.gz"
    test_file.write_bytes(b"test")

    result = validate_experiment_path(str(tmp_path), 1, 1, "fastqs/raw/sample.fastq.gz")
    assert result == test_file.resolve()
