# backend/tests/test_tus_upload.py
import base64
import gzip
from urllib.parse import urlparse

import pytest
from httpx import AsyncClient

FASTQ_CONTENT = b"@SEQ_ID\nACGTACGT\n+\nIIIIIIII\n"

TUS_HEADERS = {"Tus-Resumable": "1.0.0"}


async def _register_and_get_headers(client: AsyncClient, email: str) -> dict:
    resp = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "testpass123"},
    )
    assert resp.status_code == 201
    token = resp.json()["accessToken"]
    return {"Authorization": f"Bearer {token}", **TUS_HEADERS}


async def _create_project(client: AsyncClient, headers: dict) -> int:
    resp = await client.post(
        "/api/v1/projects",
        json={"name": "Test Project"},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_experiment(client: AsyncClient, headers: dict, project_id: int) -> int:
    resp = await client.post(
        "/api/v1/experiments",
        params={"projectId": project_id},
        json={"name": "TestExp", "assayType": "CUT&RUN"},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _encode_metadata(**kwargs) -> str:
    """Encode key-value pairs as tus Upload-Metadata header."""
    parts = []
    for key, val in kwargs.items():
        encoded = base64.b64encode(str(val).encode()).decode()
        parts.append(f"{key} {encoded}")
    return ", ".join(parts)


def _extract_path(location: str) -> str:
    """Extract path from absolute or relative Location URL."""
    parsed = urlparse(location)
    return parsed.path if parsed.scheme else location


@pytest.mark.anyio
async def test_tus_options(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    resp = await client.options("/api/v1/tus/", headers=headers)
    assert resp.status_code == 204
    assert resp.headers["tus-resumable"] == "1.0.0"
    assert "creation" in resp.headers["tus-extension"]


@pytest.mark.anyio
async def test_tus_create_upload(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    experiment_id = await _create_experiment(client, headers, project_id)

    file_data = gzip.compress(FASTQ_CONTENT)
    metadata = _encode_metadata(
        experiment_id=experiment_id,
        filename="sample_L001_R1_001.fastq.gz",
        filetype="application/octet-stream",
    )

    resp = await client.post(
        "/api/v1/tus",
        headers={
            **headers,
            "Upload-Length": str(len(file_data)),
            "Upload-Metadata": metadata,
        },
    )
    assert resp.status_code == 201
    assert "location" in resp.headers


@pytest.mark.anyio
async def test_tus_full_upload_flow(client: AsyncClient):
    """Create, upload, and verify a file via tus protocol."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    experiment_id = await _create_experiment(client, headers, project_id)

    file_data = gzip.compress(FASTQ_CONTENT)
    metadata = _encode_metadata(
        experiment_id=experiment_id,
        filename="sample_L001_R1_001.fastq.gz",
        filetype="application/octet-stream",
    )

    # 1. Create upload
    create_resp = await client.post(
        "/api/v1/tus",
        headers={
            **headers,
            "Upload-Length": str(len(file_data)),
            "Upload-Metadata": metadata,
        },
    )
    assert create_resp.status_code == 201
    location = _extract_path(create_resp.headers["location"])

    # 2. Upload data via PATCH
    patch_resp = await client.patch(
        location,
        content=file_data,
        headers={
            **headers,
            "Upload-Offset": "0",
            "Content-Type": "application/offset+octet-stream",
            "Content-Length": str(len(file_data)),
        },
    )
    assert patch_resp.status_code == 204
    assert int(patch_resp.headers["upload-offset"]) == len(file_data)

    # 3. Verify file appears in experiment's FASTQ list
    list_resp = await client.get(
        f"/api/v1/experiments/{experiment_id}/fastqs",
        headers=headers,
    )
    assert list_resp.status_code == 200
    items = list_resp.json()["items"]
    assert len(items) == 1
    assert items[0]["filename"] == "sample_L001_R1_001.fastq.gz"
    assert items[0]["uploadSource"] == "tus"


@pytest.mark.anyio
async def test_tus_resume_upload(client: AsyncClient):
    """Upload in two chunks, using HEAD to verify offset between chunks."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    experiment_id = await _create_experiment(client, headers, project_id)

    file_data = gzip.compress(FASTQ_CONTENT * 100)
    half = len(file_data) // 2
    metadata = _encode_metadata(
        experiment_id=experiment_id,
        filename="sample_L001_R2_001.fastq.gz",
        filetype="application/octet-stream",
    )

    # Create
    create_resp = await client.post(
        "/api/v1/tus",
        headers={
            **headers,
            "Upload-Length": str(len(file_data)),
            "Upload-Metadata": metadata,
        },
    )
    location = _extract_path(create_resp.headers["location"])

    # Upload first half
    await client.patch(
        location,
        content=file_data[:half],
        headers={
            **headers,
            "Upload-Offset": "0",
            "Content-Type": "application/offset+octet-stream",
            "Content-Length": str(half),
        },
    )

    # Check offset via HEAD
    head_resp = await client.head(location, headers=headers)
    assert head_resp.status_code == 200
    assert int(head_resp.headers["upload-offset"]) == half

    # Upload second half
    patch_resp = await client.patch(
        location,
        content=file_data[half:],
        headers={
            **headers,
            "Upload-Offset": str(half),
            "Content-Type": "application/offset+octet-stream",
            "Content-Length": str(len(file_data) - half),
        },
    )
    assert patch_resp.status_code == 204
    assert int(patch_resp.headers["upload-offset"]) == len(file_data)


@pytest.mark.anyio
async def test_tus_invalid_filename_rejected(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    experiment_id = await _create_experiment(client, headers, project_id)

    metadata = _encode_metadata(
        experiment_id=experiment_id,
        filename="bad_file.txt",
        filetype="application/octet-stream",
    )

    resp = await client.post(
        "/api/v1/tus",
        headers={
            **headers,
            "Upload-Length": "100",
            "Upload-Metadata": metadata,
        },
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_tus_nonmember_rejected(client: AsyncClient):
    headers_a = await _register_and_get_headers(client, "a@example.com")
    headers_b = await _register_and_get_headers(client, "b@example.com")
    project_id = await _create_project(client, headers_a)
    experiment_id = await _create_experiment(client, headers_a, project_id)

    metadata = _encode_metadata(
        experiment_id=experiment_id,
        filename="sample_L001_R1_001.fastq.gz",
        filetype="application/octet-stream",
    )

    resp = await client.post(
        "/api/v1/tus",
        headers={
            **headers_b,
            "Upload-Length": "100",
            "Upload-Metadata": metadata,
        },
    )
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_tus_terminate_upload(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    experiment_id = await _create_experiment(client, headers, project_id)

    metadata = _encode_metadata(
        experiment_id=experiment_id,
        filename="sample_L001_R1_001.fastq.gz",
        filetype="application/octet-stream",
    )

    create_resp = await client.post(
        "/api/v1/tus",
        headers={
            **headers,
            "Upload-Length": "1000",
            "Upload-Metadata": metadata,
        },
    )
    location = _extract_path(create_resp.headers["location"])

    # Terminate the upload
    del_resp = await client.delete(location, headers=headers)
    assert del_resp.status_code == 204

    # Verify it's gone
    head_resp = await client.head(location, headers=headers)
    assert head_resp.status_code == 404
