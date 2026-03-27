# backend/tests/test_job_output_service.py
"""Tests for the generic job output persistence service."""

from httpx import AsyncClient
from sqlalchemy import select

from models.experiment import Experiment
from models.job_output import JobOutput
from models.project import Project
from services.job_output_service import persist_job_outputs
from tests.conftest import test_session_factory


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
        json={"name": "Test Exp", "assayType": "CUT&RUN"},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_job(client: AsyncClient, headers: dict, exp_id: int) -> int:
    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/jobs",
        json={
            "jobType": "alignment",
            "name": "Test Alignment",
            "params": {},
        },
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def test_persist_outputs_creates_records(client: AsyncClient, patch_worker_sessions):
    """Verify JobOutput records are created for each output entry."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_job(client, headers, exp_id)

    outputs = [
        {
            "file_category": "bam",
            "filename": "sample.unique.bam",
            "file_path": f"projects/{project_id}/{exp_id}/jobs/{job_id}/bams/sample.unique.bam",
            "file_type": "bam",
            "file_size_bytes": 1024000,
        },
        {
            "file_category": "bigwig",
            "filename": "sample.bw",
            "file_path": f"projects/{project_id}/{exp_id}/jobs/{job_id}/bigwigs/sample.bw",
            "file_type": "bw",
            "file_size_bytes": 512000,
        },
    ]

    total = await persist_job_outputs(
        job_id=job_id,
        experiment_id=exp_id,
        project_id=project_id,
        outputs=outputs,
    )

    assert total == 1024000 + 512000

    # Verify records in DB
    async with test_session_factory() as db:
        result = await db.execute(
            select(JobOutput).where(JobOutput.job_id == job_id).order_by(JobOutput.id)
        )
        records = list(result.scalars().all())

    assert len(records) == 2
    assert records[0].file_category == "bam"
    assert records[0].filename == "sample.unique.bam"
    assert records[0].file_size_bytes == 1024000
    assert records[1].file_category == "bigwig"
    assert records[1].filename == "sample.bw"


async def test_persist_outputs_updates_storage_bytes(client: AsyncClient, patch_worker_sessions):
    """Verify storage_bytes is atomically incremented on experiment and project."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_job(client, headers, exp_id)

    outputs = [
        {
            "file_category": "bam",
            "filename": "sample.bam",
            "file_path": "projects/1/1/jobs/1/bams/sample.bam",
            "file_type": "bam",
            "file_size_bytes": 2048000,
        },
    ]

    await persist_job_outputs(
        job_id=job_id,
        experiment_id=exp_id,
        project_id=project_id,
        outputs=outputs,
    )

    # Check storage_bytes incremented
    async with test_session_factory() as db:
        exp = await db.get(Experiment, exp_id)
        proj = await db.get(Project, project_id)

    assert exp.storage_bytes == 2048000
    assert proj.storage_bytes == 2048000


async def test_persist_outputs_empty_list(client: AsyncClient, patch_worker_sessions):
    """Empty output list should be a no-op."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_job(client, headers, exp_id)

    total = await persist_job_outputs(
        job_id=job_id,
        experiment_id=exp_id,
        project_id=project_id,
        outputs=[],
    )

    assert total == 0

    async with test_session_factory() as db:
        result = await db.execute(select(JobOutput).where(JobOutput.job_id == job_id))
        records = list(result.scalars().all())

    assert len(records) == 0


async def test_persist_outputs_with_reaction_id(client: AsyncClient, patch_worker_sessions):
    """Verify reaction_id is correctly set on JobOutput records when provided."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_job(client, headers, exp_id)

    # Create a reaction to link to
    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/reactions",
        json={
            "fastqPrefix": "sample_L001",
            "shortName": "K4me3_ctrl1",
            "organism": "Mouse",
            "assayType": "CUT&RUN",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    reaction_id = resp.json()["id"]

    outputs = [
        {
            "file_category": "bam",
            "filename": "K4me3_ctrl1.unique.bam",
            "file_path": "projects/1/1/jobs/1/bams/K4me3_ctrl1.unique.bam",
            "file_type": "bam",
            "file_size_bytes": 500000,
            "reaction_id": reaction_id,
        },
        {
            "file_category": "log",
            "filename": "alignment.log",
            "file_path": "projects/1/1/jobs/1/logs/alignment.log",
            "file_type": "txt",
            "file_size_bytes": 1024,
            "reaction_id": None,
        },
    ]

    await persist_job_outputs(
        job_id=job_id,
        experiment_id=exp_id,
        project_id=project_id,
        outputs=outputs,
    )

    async with test_session_factory() as db:
        result = await db.execute(
            select(JobOutput).where(JobOutput.job_id == job_id).order_by(JobOutput.id)
        )
        records = list(result.scalars().all())

    assert len(records) == 2
    assert records[0].reaction_id == reaction_id
    assert records[1].reaction_id is None
