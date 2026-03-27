# backend/tests/test_jobs_api.py
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
        json={"name": "H3K4me3", "assayType": "CUT&RUN"},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _make_fastq_gz() -> io.BytesIO:
    buf = io.BytesIO(gzip.compress(FASTQ_CONTENT))
    buf.seek(0)
    return buf


# --- Job creation tests ---


async def test_create_trimming_job_201(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/jobs",
        json={
            "jobType": "trimming",
            "name": "Auto Trim",
            "params": {
                "experiment_id": exp_id,
                "project_id": project_id,
                "fastq_pairs": [{"prefix": "sample", "r1_path": "a", "r2_path": "b"}],
            },
        },
        headers=headers,
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["jobType"] == "trimming"
    assert data["name"] == "Auto Trim"
    assert data["status"] == "queued"
    assert data["launchedBy"] is not None
    assert data["experimentId"] == exp_id


async def test_create_job_unauthorized_403(client: AsyncClient):
    """Non-member cannot create a job."""
    headers1 = await _register_and_get_headers(client, "owner@example.com")
    headers2 = await _register_and_get_headers(client, "stranger@example.com")
    project_id = await _create_project(client, headers1)
    exp_id = await _create_experiment(client, headers1, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/jobs",
        json={
            "jobType": "trimming",
            "name": "Trim",
            "params": {"experiment_id": exp_id, "project_id": project_id, "fastq_pairs": []},
        },
        headers=headers2,
    )
    assert resp.status_code == 403


async def test_get_job_200(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    # Create job
    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/jobs",
        json={
            "jobType": "trimming",
            "name": "Trim",
            "params": {"experiment_id": exp_id, "project_id": project_id, "fastq_pairs": []},
        },
        headers=headers,
    )
    job_id = resp.json()["id"]

    # Get job
    resp = await client.get(f"/api/v1/jobs/{job_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == job_id
    assert resp.json()["status"] == "queued"


async def test_get_job_not_found_404(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    resp = await client.get("/api/v1/jobs/99999", headers=headers)
    assert resp.status_code == 404


async def test_list_jobs_for_experiment_200(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    # Create two jobs
    for name in ["Trim 1", "Trim 2"]:
        await client.post(
            f"/api/v1/experiments/{exp_id}/jobs",
            json={
                "jobType": "trimming",
                "name": name,
                "params": {"experiment_id": exp_id, "project_id": project_id, "fastq_pairs": []},
            },
            headers=headers,
        )

    resp = await client.get(f"/api/v1/experiments/{exp_id}/jobs", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2


async def test_list_jobs_unauthorized_403(client: AsyncClient):
    headers1 = await _register_and_get_headers(client, "owner@example.com")
    headers2 = await _register_and_get_headers(client, "stranger@example.com")
    project_id = await _create_project(client, headers1)
    exp_id = await _create_experiment(client, headers1, project_id)

    resp = await client.get(f"/api/v1/experiments/{exp_id}/jobs", headers=headers2)
    assert resp.status_code == 403


async def test_get_job_includes_launcher(client: AsyncClient):
    """Job detail response includes launcher user info."""
    headers = await _register_and_get_headers(client, "launcher@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/jobs",
        json={
            "jobType": "alignment",
            "name": "Align",
            "params": {"experiment_id": exp_id, "project_id": project_id, "reactions": []},
        },
        headers=headers,
    )
    job_id = resp.json()["id"]

    resp = await client.get(f"/api/v1/jobs/{job_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["launcher"] is not None
    assert data["launcher"]["email"] == "launcher@example.com"


async def test_list_job_outputs_200(client: AsyncClient, db_session):
    """List outputs for a job with persisted output records."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/jobs",
        json={
            "jobType": "alignment",
            "name": "Align",
            "params": {"experiment_id": exp_id, "project_id": project_id, "reactions": []},
        },
        headers=headers,
    )
    job_id = resp.json()["id"]

    # Persist outputs directly in the DB
    from models.job_output import JobOutput

    for cat, fname, ftype in [
        ("unique_bam", "sample.bam", "bam"),
        ("unique_bam", "sample.bam.bai", "bai"),
        ("bigwig", "sample.bw", "bw"),
    ]:
        db_session.add(
            JobOutput(
                job_id=job_id,
                file_category=cat,
                filename=fname,
                file_path=f"projects/{project_id}/{exp_id}/jobs/{job_id}/{fname}",
                file_type=ftype,
                file_size_bytes=1024,
            )
        )
    await db_session.commit()

    resp = await client.get(f"/api/v1/jobs/{job_id}/outputs", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 3
    filenames = {o["filename"] for o in data}
    assert "sample.bam" in filenames
    assert "sample.bw" in filenames


async def test_list_job_outputs_category_filter(client: AsyncClient, db_session):
    """Filter outputs by file_category query param."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/jobs",
        json={
            "jobType": "alignment",
            "name": "Align",
            "params": {"experiment_id": exp_id, "project_id": project_id, "reactions": []},
        },
        headers=headers,
    )
    job_id = resp.json()["id"]

    from models.job_output import JobOutput

    for cat, fname, ftype in [
        ("unique_bam", "sample.bam", "bam"),
        ("bigwig", "sample.bw", "bw"),
        ("log", "sample.log", "txt"),
    ]:
        db_session.add(
            JobOutput(
                job_id=job_id,
                file_category=cat,
                filename=fname,
                file_path=f"projects/{project_id}/{exp_id}/jobs/{job_id}/{fname}",
                file_type=ftype,
            )
        )
    await db_session.commit()

    resp = await client.get(
        f"/api/v1/jobs/{job_id}/outputs", params={"category": "bigwig"}, headers=headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["fileCategory"] == "bigwig"


async def test_list_job_outputs_unauthorized_404(client: AsyncClient):
    """Non-member cannot list job outputs."""
    headers1 = await _register_and_get_headers(client, "owner@example.com")
    headers2 = await _register_and_get_headers(client, "stranger@example.com")
    project_id = await _create_project(client, headers1)
    exp_id = await _create_experiment(client, headers1, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/jobs",
        json={
            "jobType": "alignment",
            "name": "Align",
            "params": {"experiment_id": exp_id, "project_id": project_id, "reactions": []},
        },
        headers=headers1,
    )
    job_id = resp.json()["id"]

    resp = await client.get(f"/api/v1/jobs/{job_id}/outputs", headers=headers2)
    assert resp.status_code == 404


async def test_adapter_status_in_fastq_response(client: AsyncClient):
    """Verify adapterStatus field is included in FASTQ list response."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    # Upload a FASTQ file
    await client.post(
        f"/api/v1/experiments/{exp_id}/fastqs/upload",
        files=[("files", ("sample_R1_001.fastq.gz", _make_fastq_gz(), "application/octet-stream"))],
        headers=headers,
    )

    # List FASTQs — adapterStatus should be present (initially null)
    resp = await client.get(
        f"/api/v1/experiments/{exp_id}/fastqs",
        headers=headers,
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert "adapterStatus" in items[0]
    # Before FastQC runs, it should be null
    assert items[0]["adapterStatus"] is None
