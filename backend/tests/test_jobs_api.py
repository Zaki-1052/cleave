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


# --- Job update tests ---


async def test_update_job_notes_200(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    create_resp = await client.post(
        f"/api/v1/experiments/{exp_id}/jobs",
        json={"jobType": "alignment", "name": "Test Align", "params": {}},
        headers=headers,
    )
    job_id = create_resp.json()["id"]

    resp = await client.patch(
        f"/api/v1/jobs/{job_id}",
        json={"notes": "Updated notes text"},
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["notes"] == "Updated notes text"

    # Verify persisted
    get_resp = await client.get(f"/api/v1/jobs/{job_id}", headers=headers)
    assert get_resp.json()["notes"] == "Updated notes text"


async def test_update_job_notes_unauthorized_404(client: AsyncClient):
    headers1 = await _register_and_get_headers(client, "owner@example.com")
    headers2 = await _register_and_get_headers(client, "stranger@example.com")
    project_id = await _create_project(client, headers1)
    exp_id = await _create_experiment(client, headers1, project_id)

    create_resp = await client.post(
        f"/api/v1/experiments/{exp_id}/jobs",
        json={"jobType": "alignment", "name": "Test Align", "params": {}},
        headers=headers1,
    )
    job_id = create_resp.json()["id"]

    resp = await client.patch(
        f"/api/v1/jobs/{job_id}",
        json={"notes": "Hacked"},
        headers=headers2,
    )
    assert resp.status_code == 404


async def test_update_job_notes_not_found_404(client: AsyncClient):
    headers = await _register_and_get_headers(client, "user@example.com")
    resp = await client.patch(
        "/api/v1/jobs/99999",
        json={"notes": "No such job"},
        headers=headers,
    )
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

    # Verify perPage alias works (regression test for missing alias bug)
    resp2 = await client.get(
        f"/api/v1/experiments/{exp_id}/jobs",
        params={"perPage": 1},
        headers=headers,
    )
    assert resp2.status_code == 200
    data2 = resp2.json()
    assert data2["total"] == 2
    assert len(data2["items"]) == 1
    assert data2["perPage"] == 1


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


# --- Analysis Queue (cross-project) tests ---


async def _create_job(
    client: AsyncClient, headers: dict, exp_id: int, project_id: int, name: str = "Job"
) -> int:
    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/jobs",
        json={
            "jobType": "alignment",
            "name": name,
            "params": {"experiment_id": exp_id, "project_id": project_id, "reactions": []},
        },
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def test_list_all_jobs_200(client: AsyncClient):
    """Cross-project job listing returns jobs from all user's projects."""
    headers = await _register_and_get_headers(client, "user@example.com")

    proj1 = await _create_project(client, headers)
    exp1 = await _create_experiment(client, headers, proj1)
    await _create_job(client, headers, exp1, proj1, "Job A")

    proj2 = await _create_project(client, headers)
    exp2 = await _create_experiment(client, headers, proj2)
    await _create_job(client, headers, exp2, proj2, "Job B")

    resp = await client.get("/api/v1/jobs", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2
    names = {item["name"] for item in data["items"]}
    assert names == {"Job A", "Job B"}
    # Verify queue-specific fields are present
    item = data["items"][0]
    assert "projectName" in item
    assert "experimentName" in item
    assert "launcher" in item


async def test_list_all_jobs_cross_project_isolation(client: AsyncClient):
    """Users only see jobs from projects they belong to."""
    alice = await _register_and_get_headers(client, "alice@example.com")
    bob = await _register_and_get_headers(client, "bob@example.com")

    proj_a = await _create_project(client, alice)
    exp_a = await _create_experiment(client, alice, proj_a)
    await _create_job(client, alice, exp_a, proj_a, "Alice Job")

    proj_b = await _create_project(client, bob)
    exp_b = await _create_experiment(client, bob, proj_b)
    await _create_job(client, bob, exp_b, proj_b, "Bob Job")

    resp_alice = await client.get("/api/v1/jobs", headers=alice)
    assert resp_alice.json()["total"] == 1
    assert resp_alice.json()["items"][0]["name"] == "Alice Job"

    resp_bob = await client.get("/api/v1/jobs", headers=bob)
    assert resp_bob.json()["total"] == 1
    assert resp_bob.json()["items"][0]["name"] == "Bob Job"


async def test_list_all_jobs_shared_project_visibility(client: AsyncClient):
    """Members added to a project can see that project's jobs."""
    alice = await _register_and_get_headers(client, "alice@example.com")
    bob = await _register_and_get_headers(client, "bob@example.com")

    proj = await _create_project(client, alice)
    exp = await _create_experiment(client, alice, proj)
    await _create_job(client, alice, exp, proj, "Shared Job")

    # Bob has no jobs yet
    resp = await client.get("/api/v1/jobs", headers=bob)
    assert resp.json()["total"] == 0

    # Alice adds Bob to the project
    await client.post(
        f"/api/v1/projects/{proj}/members",
        json={"email": "bob@example.com", "role": "contributor"},
        headers=alice,
    )

    # Now Bob sees Alice's job
    resp = await client.get("/api/v1/jobs", headers=bob)
    assert resp.json()["total"] == 1
    assert resp.json()["items"][0]["name"] == "Shared Job"


async def test_list_all_jobs_status_filter(client: AsyncClient, db_session):
    """Filter jobs by status query parameter."""
    headers = await _register_and_get_headers(client, "user@example.com")
    proj = await _create_project(client, headers)
    exp = await _create_experiment(client, headers, proj)

    await _create_job(client, headers, exp, proj, "Queued Job")
    job2_id = await _create_job(client, headers, exp, proj, "Running Job")

    # Update job2 to running via DB
    from sqlalchemy import select

    from models.analysis_job import AnalysisJob

    result = await db_session.execute(select(AnalysisJob).where(AnalysisJob.id == job2_id))
    job2 = result.scalar_one()
    job2.status = "running"
    await db_session.commit()

    # No filter — both returned
    resp = await client.get("/api/v1/jobs", headers=headers)
    assert resp.json()["total"] == 2

    # Filter queued
    resp = await client.get("/api/v1/jobs", params={"status": "queued"}, headers=headers)
    assert resp.json()["total"] == 1
    assert resp.json()["items"][0]["name"] == "Queued Job"

    # Filter running
    resp = await client.get("/api/v1/jobs", params={"status": "running"}, headers=headers)
    assert resp.json()["total"] == 1
    assert resp.json()["items"][0]["name"] == "Running Job"


async def test_list_all_jobs_pagination(client: AsyncClient):
    """Pagination works with perPage and page params."""
    headers = await _register_and_get_headers(client, "user@example.com")
    proj = await _create_project(client, headers)
    exp = await _create_experiment(client, headers, proj)

    for i in range(3):
        await _create_job(client, headers, exp, proj, f"Job {i}")

    resp = await client.get("/api/v1/jobs", params={"perPage": 2, "page": 1}, headers=headers)
    data = resp.json()
    assert data["total"] == 3
    assert len(data["items"]) == 2

    resp = await client.get("/api/v1/jobs", params={"perPage": 2, "page": 2}, headers=headers)
    data = resp.json()
    assert data["total"] == 3
    assert len(data["items"]) == 1


async def test_list_all_jobs_response_shape(client: AsyncClient):
    """Response items have exactly the expected queue-specific fields."""
    headers = await _register_and_get_headers(client, "user@example.com")
    proj = await _create_project(client, headers)
    exp = await _create_experiment(client, headers, proj)
    await _create_job(client, headers, exp, proj, "Shape Test")

    resp = await client.get("/api/v1/jobs", headers=headers)
    item = resp.json()["items"][0]

    expected_keys = {
        "id",
        "experimentId",
        "experimentName",
        "projectId",
        "projectName",
        "jobType",
        "name",
        "status",
        "launchedBy",
        "launcher",
        "startedAt",
        "completedAt",
        "durationSeconds",
        "createdAt",
    }
    assert set(item.keys()) == expected_keys
    assert item["launcher"] is not None
    assert "email" in item["launcher"]
    assert "firstName" in item["launcher"]


async def test_list_all_jobs_unauthenticated_401(client: AsyncClient):
    """Unauthenticated request returns 401."""
    resp = await client.get("/api/v1/jobs")
    assert resp.status_code == 401


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


# --- Terminate tests ---


async def test_terminate_queued_job_200(client: AsyncClient):
    """Terminating a queued job sets status to terminated."""
    headers = await _register_and_get_headers(client, "user@example.com")
    proj = await _create_project(client, headers)
    exp = await _create_experiment(client, headers, proj)
    job_id = await _create_job(client, headers, exp, proj, "To Terminate")

    resp = await client.post(f"/api/v1/jobs/{job_id}/terminate", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "terminated"
    assert data["completedAt"] is not None


async def test_terminate_running_job_200(client: AsyncClient):
    """Terminating a running job sets terminated status and termination timestamp."""
    headers = await _register_and_get_headers(client, "user@example.com")
    proj = await _create_project(client, headers)
    exp = await _create_experiment(client, headers, proj)
    job_id = await _create_job(client, headers, exp, proj, "Running Job")

    # Manually set job to running via PATCH (simulate worker pickup)
    from sqlalchemy import update as sa_update

    from models.analysis_job import AnalysisJob as AJ
    from tests.conftest import test_session_factory

    async with test_session_factory() as db:
        await db.execute(sa_update(AJ).where(AJ.id == job_id).values(status="running"))
        await db.commit()

    resp = await client.post(f"/api/v1/jobs/{job_id}/terminate", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "terminated"


async def test_terminate_completed_job_409(client: AsyncClient):
    """Cannot terminate a completed job."""
    headers = await _register_and_get_headers(client, "user@example.com")
    proj = await _create_project(client, headers)
    exp = await _create_experiment(client, headers, proj)
    job_id = await _create_job(client, headers, exp, proj, "Done Job")

    from sqlalchemy import update as sa_update

    from models.analysis_job import AnalysisJob as AJ
    from tests.conftest import test_session_factory

    async with test_session_factory() as db:
        await db.execute(sa_update(AJ).where(AJ.id == job_id).values(status="complete"))
        await db.commit()

    resp = await client.post(f"/api/v1/jobs/{job_id}/terminate", headers=headers)
    assert resp.status_code == 409


async def test_terminate_unauthorized_404(client: AsyncClient):
    """Non-member cannot terminate a job."""
    headers1 = await _register_and_get_headers(client, "owner@example.com")
    headers2 = await _register_and_get_headers(client, "stranger@example.com")
    proj = await _create_project(client, headers1)
    exp = await _create_experiment(client, headers1, proj)
    job_id = await _create_job(client, headers1, exp, proj, "Private Job")

    resp = await client.post(f"/api/v1/jobs/{job_id}/terminate", headers=headers2)
    assert resp.status_code == 404


# --- Retry tests ---


async def test_retry_error_job_201(client: AsyncClient):
    """Retrying a failed job creates a new queued job with same params."""
    headers = await _register_and_get_headers(client, "user@example.com")
    proj = await _create_project(client, headers)
    exp = await _create_experiment(client, headers, proj)
    job_id = await _create_job(client, headers, exp, proj, "Failed Job")

    from sqlalchemy import update as sa_update

    from models.analysis_job import AnalysisJob as AJ
    from tests.conftest import test_session_factory

    async with test_session_factory() as db:
        await db.execute(
            sa_update(AJ).where(AJ.id == job_id).values(status="error", error_message="boom")
        )
        await db.commit()

    resp = await client.post(f"/api/v1/jobs/{job_id}/retry", headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "queued"
    assert data["retryOfJobId"] == job_id
    assert data["jobType"] == "alignment"
    assert data["id"] != job_id


async def test_retry_terminated_job_201(client: AsyncClient):
    """Can also retry a terminated job."""
    headers = await _register_and_get_headers(client, "user@example.com")
    proj = await _create_project(client, headers)
    exp = await _create_experiment(client, headers, proj)
    job_id = await _create_job(client, headers, exp, proj, "Killed Job")

    from sqlalchemy import update as sa_update

    from models.analysis_job import AnalysisJob as AJ
    from tests.conftest import test_session_factory

    async with test_session_factory() as db:
        await db.execute(sa_update(AJ).where(AJ.id == job_id).values(status="terminated"))
        await db.commit()

    resp = await client.post(f"/api/v1/jobs/{job_id}/retry", headers=headers)
    assert resp.status_code == 201
    assert resp.json()["status"] == "queued"


async def test_retry_queued_job_409(client: AsyncClient):
    """Cannot retry a job that is still queued."""
    headers = await _register_and_get_headers(client, "user@example.com")
    proj = await _create_project(client, headers)
    exp = await _create_experiment(client, headers, proj)
    job_id = await _create_job(client, headers, exp, proj, "Active Job")

    resp = await client.post(f"/api/v1/jobs/{job_id}/retry", headers=headers)
    assert resp.status_code == 409


async def test_retry_unauthorized_404(client: AsyncClient):
    """Non-member cannot retry a job."""
    headers1 = await _register_and_get_headers(client, "owner@example.com")
    headers2 = await _register_and_get_headers(client, "stranger@example.com")
    proj = await _create_project(client, headers1)
    exp = await _create_experiment(client, headers1, proj)
    job_id = await _create_job(client, headers1, exp, proj, "Private Job")

    from sqlalchemy import update as sa_update

    from models.analysis_job import AnalysisJob as AJ
    from tests.conftest import test_session_factory

    async with test_session_factory() as db:
        await db.execute(sa_update(AJ).where(AJ.id == job_id).values(status="error"))
        await db.commit()

    resp = await client.post(f"/api/v1/jobs/{job_id}/retry", headers=headers2)
    assert resp.status_code == 404


# --- Log tail tests ---


async def test_log_tail_no_log_200(client: AsyncClient):
    """Log tail returns empty when no log file exists."""
    headers = await _register_and_get_headers(client, "user@example.com")
    proj = await _create_project(client, headers)
    exp = await _create_experiment(client, headers, proj)
    job_id = await _create_job(client, headers, exp, proj, "No Log Job")

    resp = await client.get(f"/api/v1/jobs/{job_id}/log-tail", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["logTail"] == ""
    assert data["totalLines"] == 0


async def test_log_tail_with_log_200(client: AsyncClient):
    """Log tail returns last N lines when a log file exists."""
    from pathlib import Path

    from config import settings

    headers = await _register_and_get_headers(client, "user@example.com")
    proj = await _create_project(client, headers)
    exp = await _create_experiment(client, headers, proj)
    job_id = await _create_job(client, headers, exp, proj, "Logged Job")

    # Create a log file at the expected path
    logs_dir = (
        Path(settings.STORAGE_ROOT)
        / "projects"
        / str(proj)
        / str(exp)
        / "jobs"
        / str(job_id)
        / "logs"
    )
    logs_dir.mkdir(parents=True, exist_ok=True)
    log_file = logs_dir / "alignment.log"
    lines = [f"Line {i}" for i in range(100)]
    log_file.write_text("\n".join(lines))

    resp = await client.get(
        f"/api/v1/jobs/{job_id}/log-tail", params={"lines": 10}, headers=headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["totalLines"] == 100
    tail_lines = data["logTail"].split("\n")
    assert len(tail_lines) == 10
    assert tail_lines[0] == "Line 90"


async def test_log_tail_unauthorized_404(client: AsyncClient):
    """Non-member cannot access log tail."""
    headers1 = await _register_and_get_headers(client, "owner@example.com")
    headers2 = await _register_and_get_headers(client, "stranger@example.com")
    proj = await _create_project(client, headers1)
    exp = await _create_experiment(client, headers1, proj)
    job_id = await _create_job(client, headers1, exp, proj, "Secret Job")

    resp = await client.get(f"/api/v1/jobs/{job_id}/log-tail", headers=headers2)
    assert resp.status_code == 404


# --- Event logging tests ---


async def test_terminate_creates_event(client: AsyncClient):
    """Terminating a job logs an experiment event."""
    headers = await _register_and_get_headers(client, "user@example.com")
    proj = await _create_project(client, headers)
    exp = await _create_experiment(client, headers, proj)
    job_id = await _create_job(client, headers, exp, proj, "Terminate Event")

    await client.post(f"/api/v1/jobs/{job_id}/terminate", headers=headers)

    resp = await client.get(f"/api/v1/experiments/{exp}/history", headers=headers)
    assert resp.status_code == 200
    events = resp.json()["items"]
    actions = [e["action"] for e in events]
    assert "job_terminated" in actions


async def test_retry_creates_event(client: AsyncClient):
    """Retrying a job logs an experiment event."""
    headers = await _register_and_get_headers(client, "user@example.com")
    proj = await _create_project(client, headers)
    exp = await _create_experiment(client, headers, proj)
    job_id = await _create_job(client, headers, exp, proj, "Retry Event")

    from sqlalchemy import update as sa_update

    from models.analysis_job import AnalysisJob as AJ
    from tests.conftest import test_session_factory

    async with test_session_factory() as db:
        await db.execute(sa_update(AJ).where(AJ.id == job_id).values(status="error"))
        await db.commit()

    await client.post(f"/api/v1/jobs/{job_id}/retry", headers=headers)

    resp = await client.get(f"/api/v1/experiments/{exp}/history", headers=headers)
    assert resp.status_code == 200
    events = resp.json()["items"]
    actions = [e["action"] for e in events]
    assert "job_retried" in actions


# --- Auto-pipeline retry tests ---


async def test_retry_auto_pipeline_creates_job_201(client: AsyncClient):
    """Retrying an errored auto-pipeline creates a new auto_pipeline job."""
    headers = await _register_and_get_headers(client, "user@example.com")
    proj = await _create_project(client, headers)
    exp = await _create_experiment(client, headers, proj)
    job_id = await _create_job(client, headers, exp, proj, "Auto: Alignment")

    from sqlalchemy import update as sa_update

    from models.analysis_job import AnalysisJob as AJ
    from models.experiment import Experiment as Exp
    from tests.conftest import test_session_factory

    async with test_session_factory() as db:
        # Mark job as auto-pipeline and failed
        await db.execute(
            sa_update(AJ)
            .where(AJ.id == job_id)
            .values(status="error", auto_pipeline=True, error_message="crash")
        )
        # Mark experiment as auto-pipeline in error state
        await db.execute(
            sa_update(Exp)
            .where(Exp.id == exp)
            .values(auto_pipeline=True, auto_pipeline_status="error")
        )
        await db.commit()

    resp = await client.post(f"/api/v1/experiments/{exp}/auto-pipeline/retry", headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "queued"
    assert data["autoPipeline"] is True
    assert data["retryOfJobId"] == job_id


async def test_retry_auto_pipeline_resets_experiment_status(client: AsyncClient):
    """Retrying auto-pipeline resets experiment status from error to running."""
    headers = await _register_and_get_headers(client, "user@example.com")
    proj = await _create_project(client, headers)
    exp = await _create_experiment(client, headers, proj)
    job_id = await _create_job(client, headers, exp, proj, "Auto: Peak Calling")

    from sqlalchemy import select
    from sqlalchemy import update as sa_update

    from models.analysis_job import AnalysisJob as AJ
    from models.experiment import Experiment as Exp
    from tests.conftest import test_session_factory

    async with test_session_factory() as db:
        await db.execute(
            sa_update(AJ).where(AJ.id == job_id).values(status="error", auto_pipeline=True)
        )
        await db.execute(
            sa_update(Exp)
            .where(Exp.id == exp)
            .values(auto_pipeline=True, auto_pipeline_status="error")
        )
        await db.commit()

    resp = await client.post(f"/api/v1/experiments/{exp}/auto-pipeline/retry", headers=headers)
    assert resp.status_code == 201

    # Verify experiment status was reset
    async with test_session_factory() as db:
        result = await db.execute(select(Exp).where(Exp.id == exp))
        experiment = result.scalar_one()
        assert experiment.auto_pipeline_status == "running"


async def test_retry_auto_pipeline_not_in_error_409(client: AsyncClient):
    """Cannot retry auto-pipeline when experiment is not in error state."""
    headers = await _register_and_get_headers(client, "user@example.com")
    proj = await _create_project(client, headers)
    exp = await _create_experiment(client, headers, proj)

    from sqlalchemy import update as sa_update

    from models.experiment import Experiment as Exp
    from tests.conftest import test_session_factory

    async with test_session_factory() as db:
        await db.execute(
            sa_update(Exp)
            .where(Exp.id == exp)
            .values(auto_pipeline=True, auto_pipeline_status="running")
        )
        await db.commit()

    resp = await client.post(f"/api/v1/experiments/{exp}/auto-pipeline/retry", headers=headers)
    assert resp.status_code == 409


async def test_retry_job_preserves_auto_pipeline_flag(client: AsyncClient):
    """Manual retry of an auto-pipeline job copies the auto_pipeline flag."""
    headers = await _register_and_get_headers(client, "user@example.com")
    proj = await _create_project(client, headers)
    exp = await _create_experiment(client, headers, proj)
    job_id = await _create_job(client, headers, exp, proj, "Auto: Alignment")

    from sqlalchemy import update as sa_update

    from models.analysis_job import AnalysisJob as AJ
    from tests.conftest import test_session_factory

    async with test_session_factory() as db:
        await db.execute(
            sa_update(AJ)
            .where(AJ.id == job_id)
            .values(status="error", auto_pipeline=True, error_message="fail")
        )
        await db.commit()

    resp = await client.post(f"/api/v1/jobs/{job_id}/retry", headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["autoPipeline"] is True
