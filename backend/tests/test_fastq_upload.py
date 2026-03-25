# backend/tests/test_fastq_upload.py
import gzip
import io

from httpx import AsyncClient

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
    """Create a gzipped FASTQ file in memory."""
    buf = io.BytesIO(gzip.compress(content))
    buf.seek(0)
    return buf


def _make_fastq_plain(content: bytes = FASTQ_CONTENT) -> io.BytesIO:
    """Create an uncompressed FASTQ file in memory."""
    buf = io.BytesIO(content)
    buf.seek(0)
    return buf


# --- Upload Tests ---


async def test_upload_single_fastq_gz(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/fastqs/upload",
        files=[("files", ("sample_R1_001.fastq.gz", _make_fastq_gz(), "application/octet-stream"))],
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["fileCount"] == 1
    assert data["totalBytes"] > 0
    assert data["uploaded"][0]["filename"] == "sample_R1_001.fastq.gz"
    assert data["uploaded"][0]["prefix"] == "sample"
    assert data["uploaded"][0]["readDirection"] == "R1"
    assert data["uploaded"][0]["uploadSource"] == "local"


async def test_upload_multiple_fastqs(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/fastqs/upload",
        files=[
            ("files", ("sample_R1_001.fastq.gz", _make_fastq_gz(), "application/octet-stream")),
            ("files", ("sample_R2_001.fastq.gz", _make_fastq_gz(), "application/octet-stream")),
        ],
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["fileCount"] == 2
    filenames = {f["filename"] for f in data["uploaded"]}
    assert filenames == {"sample_R1_001.fastq.gz", "sample_R2_001.fastq.gz"}

    # Verify prefixes are the same
    prefixes = {f["prefix"] for f in data["uploaded"]}
    assert prefixes == {"sample"}

    # Verify read directions
    directions = {f["readDirection"] for f in data["uploaded"]}
    assert directions == {"R1", "R2"}


async def test_upload_uncompressed_auto_gzip(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/fastqs/upload",
        files=[("files", ("sample_R1_001.fastq", _make_fastq_plain(), "application/octet-stream"))],
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    # Filename should have .gz appended
    assert data["uploaded"][0]["filename"] == "sample_R1_001.fastq.gz"
    # File path should reflect gzipped name
    assert data["uploaded"][0]["filePath"].endswith(".fastq.gz")


async def test_upload_complex_illumina_name(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    filename = "230301_index_25_ctrl_1_old_PUM1_H3K4me3_trimmed_L001_R1_001.fastq.gz"
    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/fastqs/upload",
        files=[("files", (filename, _make_fastq_gz(), "application/octet-stream"))],
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["uploaded"][0]["prefix"] == "230301_index_25_ctrl_1_old_PUM1_H3K4me3_trimmed_L001"
    assert data["uploaded"][0]["readDirection"] == "R1"


# --- Validation Error Tests ---


async def test_upload_invalid_extension(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/fastqs/upload",
        files=[("files", ("sample_R1_001.txt", _make_fastq_gz(), "application/octet-stream"))],
        headers=headers,
    )
    assert resp.status_code == 422
    assert "fastq" in resp.json()["detail"].lower()


async def test_upload_filename_no_alphanumeric_start(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/fastqs/upload",
        files=[("files", ("_bad_R1_001.fastq.gz", _make_fastq_gz(), "application/octet-stream"))],
        headers=headers,
    )
    assert resp.status_code == 422
    assert "alphanumeric" in resp.json()["detail"].lower()


async def test_upload_missing_read_direction(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/fastqs/upload",
        files=[("files", ("sample_001.fastq.gz", _make_fastq_gz(), "application/octet-stream"))],
        headers=headers,
    )
    assert resp.status_code == 422
    assert "r1" in resp.json()["detail"].lower() or "R1" in resp.json()["detail"]


async def test_upload_duplicate_filename(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    # First upload succeeds
    await client.post(
        f"/api/v1/experiments/{exp_id}/fastqs/upload",
        files=[("files", ("sample_R1_001.fastq.gz", _make_fastq_gz(), "application/octet-stream"))],
        headers=headers,
    )

    # Second upload with same filename fails
    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/fastqs/upload",
        files=[("files", ("sample_R1_001.fastq.gz", _make_fastq_gz(), "application/octet-stream"))],
        headers=headers,
    )
    assert resp.status_code == 422
    assert "already exist" in resp.json()["detail"].lower()


# --- Permission Tests ---


async def test_upload_nonmember(client: AsyncClient):
    headers_owner = await _register_and_get_headers(client, "owner@example.com")
    headers_other = await _register_and_get_headers(client, "other@example.com")
    project_id = await _create_project(client, headers_owner)
    exp_id = await _create_experiment(client, headers_owner, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/fastqs/upload",
        files=[("files", ("sample_R1_001.fastq.gz", _make_fastq_gz(), "application/octet-stream"))],
        headers=headers_other,
    )
    assert resp.status_code == 403


async def test_upload_viewer(client: AsyncClient):
    headers_owner = await _register_and_get_headers(client, "owner@example.com")
    headers_viewer = await _register_and_get_headers(client, "viewer@example.com")
    project_id = await _create_project(client, headers_owner)
    exp_id = await _create_experiment(client, headers_owner, project_id)

    # Add viewer
    await client.post(
        f"/api/v1/projects/{project_id}/members",
        json={"email": "viewer@example.com", "role": "viewer"},
        headers=headers_owner,
    )

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/fastqs/upload",
        files=[("files", ("sample_R1_001.fastq.gz", _make_fastq_gz(), "application/octet-stream"))],
        headers=headers_viewer,
    )
    assert resp.status_code == 403


# --- Storage Bytes Tests ---


async def test_upload_updates_storage_bytes(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/fastqs/upload",
        files=[("files", ("sample_R1_001.fastq.gz", _make_fastq_gz(), "application/octet-stream"))],
        headers=headers,
    )
    assert resp.status_code == 201
    uploaded_bytes = resp.json()["totalBytes"]
    assert uploaded_bytes > 0

    # Check experiment storage_bytes
    exp_resp = await client.get(f"/api/v1/experiments/{exp_id}", headers=headers)
    assert exp_resp.json()["storageBytes"] == uploaded_bytes

    # Check project storage_bytes
    proj_resp = await client.get(f"/api/v1/projects/{project_id}", headers=headers)
    assert proj_resp.json()["storageBytes"] == uploaded_bytes


# --- List Tests ---


async def test_list_fastqs(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    # Upload two files
    await client.post(
        f"/api/v1/experiments/{exp_id}/fastqs/upload",
        files=[
            ("files", ("sample_R1_001.fastq.gz", _make_fastq_gz(), "application/octet-stream")),
            ("files", ("sample_R2_001.fastq.gz", _make_fastq_gz(), "application/octet-stream")),
        ],
        headers=headers,
    )

    resp = await client.get(
        f"/api/v1/experiments/{exp_id}/fastqs",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2


async def test_list_fastqs_nonmember(client: AsyncClient):
    headers_owner = await _register_and_get_headers(client, "owner@example.com")
    headers_other = await _register_and_get_headers(client, "other@example.com")
    project_id = await _create_project(client, headers_owner)
    exp_id = await _create_experiment(client, headers_owner, project_id)

    resp = await client.get(
        f"/api/v1/experiments/{exp_id}/fastqs",
        headers=headers_other,
    )
    assert resp.status_code == 404


# --- Delete Tests ---


async def test_delete_fastq(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    upload_resp = await client.post(
        f"/api/v1/experiments/{exp_id}/fastqs/upload",
        files=[("files", ("sample_R1_001.fastq.gz", _make_fastq_gz(), "application/octet-stream"))],
        headers=headers,
    )
    fastq_id = upload_resp.json()["uploaded"][0]["id"]

    # Delete it
    resp = await client.delete(
        f"/api/v1/experiments/{exp_id}/fastqs/{fastq_id}",
        headers=headers,
    )
    assert resp.status_code == 204

    # Verify it's gone from list
    list_resp = await client.get(f"/api/v1/experiments/{exp_id}/fastqs", headers=headers)
    assert list_resp.json()["total"] == 0


async def test_delete_updates_storage_bytes(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    upload_resp = await client.post(
        f"/api/v1/experiments/{exp_id}/fastqs/upload",
        files=[("files", ("sample_R1_001.fastq.gz", _make_fastq_gz(), "application/octet-stream"))],
        headers=headers,
    )
    fastq_id = upload_resp.json()["uploaded"][0]["id"]

    # Delete it
    await client.delete(
        f"/api/v1/experiments/{exp_id}/fastqs/{fastq_id}",
        headers=headers,
    )

    # Storage bytes should be back to 0
    exp_resp = await client.get(f"/api/v1/experiments/{exp_id}", headers=headers)
    assert exp_resp.json()["storageBytes"] == 0

    proj_resp = await client.get(f"/api/v1/projects/{project_id}", headers=headers)
    assert proj_resp.json()["storageBytes"] == 0
