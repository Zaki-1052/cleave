# backend/tests/test_worker.py
"""Integration tests for the worker poll loop."""

import gzip
from pathlib import Path

from httpx import AsyncClient
from sqlalchemy import select

from config import settings
from models.analysis_job import AnalysisJob
from models.experiment import Experiment
from models.notification import Notification
from tests.conftest import test_session_factory
from worker import poll_and_run


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


def _setup_fastq_pair(project_id: int, exp_id: int) -> dict:
    """Create stub FASTQ files on disk and return trimming params."""
    fastq_content = b"@SEQ_ID\nACGTACGT\n+\nIIIIIIII\n"
    base = Path(settings.STORAGE_ROOT) / "projects" / str(project_id) / str(exp_id)
    raw_dir = base / "fastqs" / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    r1_path = raw_dir / "sample_R1_001.fastq.gz"
    r2_path = raw_dir / "sample_R2_001.fastq.gz"
    r1_path.write_bytes(gzip.compress(fastq_content))
    r2_path.write_bytes(gzip.compress(fastq_content))

    return {
        "experiment_id": exp_id,
        "project_id": project_id,
        "fastq_pairs": [
            {
                "prefix": "sample",
                "r1_path": f"projects/{project_id}/{exp_id}/fastqs/raw/sample_R1_001.fastq.gz",
                "r2_path": f"projects/{project_id}/{exp_id}/fastqs/raw/sample_R2_001.fastq.gz",
                "r1_id": None,
                "r2_id": None,
            }
        ],
    }


async def test_worker_picks_up_queued_job(client: AsyncClient, patch_worker_sessions):
    """Worker should pick up a queued job, run mock pipeline, and set status to complete."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    trim_params = _setup_fastq_pair(project_id, exp_id)

    # Create a trimming job via API
    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/jobs",
        json={
            "jobType": "trimming",
            "name": "Auto Trim",
            "params": trim_params,
        },
        headers=headers,
    )
    assert resp.status_code == 201
    job_id = resp.json()["id"]

    # Run one poll cycle
    await poll_and_run()

    # Verify job completed
    async with test_session_factory() as db:
        job = await db.get(AnalysisJob, job_id)

    assert job.status == "complete"
    assert job.duration_seconds is not None
    assert job.completed_at is not None
    assert job.methods_text is not None
    assert "Trimmomatic" in job.methods_text


async def test_worker_creates_notification(client: AsyncClient, patch_worker_sessions):
    """Worker should create a notification for the job launcher on completion."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    trim_params = _setup_fastq_pair(project_id, exp_id)

    await client.post(
        f"/api/v1/experiments/{exp_id}/jobs",
        json={"jobType": "trimming", "name": "Trim", "params": trim_params},
        headers=headers,
    )

    await poll_and_run()

    # Verify notification exists
    async with test_session_factory() as db:
        result = await db.execute(select(Notification).where(Notification.type == "job_complete"))
        notif = result.scalar_one_or_none()

    assert notif is not None
    assert "Trim" in notif.message
    assert "H3K4me3" in notif.message
    assert notif.link_target == f"/experiments/{exp_id}"


async def test_worker_sets_error_on_pipeline_failure(client: AsyncClient, patch_worker_sessions):
    """Worker should set status=error when the pipeline fails validation."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    # Create trimming job with invalid params (empty fastq_pairs will fail validation)
    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/jobs",
        json={
            "jobType": "trimming",
            "name": "Bad Trim",
            "params": {
                "experiment_id": exp_id,
                "project_id": project_id,
                "fastq_pairs": [],
            },
        },
        headers=headers,
    )
    assert resp.status_code == 201
    job_id = resp.json()["id"]

    await poll_and_run()

    async with test_session_factory() as db:
        job = await db.get(AnalysisJob, job_id)

    assert job.status == "error"
    assert job.error_message is not None
    assert "fastq_pairs" in job.error_message


async def test_worker_creates_error_notification(client: AsyncClient, patch_worker_sessions):
    """Worker should create an error notification when a job fails."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    await client.post(
        f"/api/v1/experiments/{exp_id}/jobs",
        json={
            "jobType": "trimming",
            "name": "Fail Job",
            "params": {"experiment_id": exp_id, "project_id": project_id, "fastq_pairs": []},
        },
        headers=headers,
    )

    await poll_and_run()

    async with test_session_factory() as db:
        result = await db.execute(select(Notification).where(Notification.type == "job_error"))
        notif = result.scalar_one_or_none()

    assert notif is not None
    assert "Fail Job" in notif.message


async def test_worker_updates_experiment_status(client: AsyncClient, patch_worker_sessions):
    """Worker should transition experiment status: new -> in_progress -> complete."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    trim_params = _setup_fastq_pair(project_id, exp_id)

    # Experiment starts as "new"
    async with test_session_factory() as db:
        exp = await db.get(Experiment, exp_id)
    assert exp.status == "new"

    await client.post(
        f"/api/v1/experiments/{exp_id}/jobs",
        json={"jobType": "trimming", "name": "Trim", "params": trim_params},
        headers=headers,
    )

    # After the job completes, experiment should be "complete"
    await poll_and_run()

    async with test_session_factory() as db:
        exp = await db.get(Experiment, exp_id)
    assert exp.status == "complete"


async def test_worker_noop_when_no_jobs(client: AsyncClient, patch_worker_sessions):
    """poll_and_run should return cleanly when no queued jobs exist."""
    # Just ensure no error is raised
    await poll_and_run()


async def test_worker_creates_job_dir(client: AsyncClient, patch_worker_sessions):
    """Worker should create the job-specific working directory."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    trim_params = _setup_fastq_pair(project_id, exp_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/jobs",
        json={"jobType": "trimming", "name": "Trim", "params": trim_params},
        headers=headers,
    )
    job_id = resp.json()["id"]

    await poll_and_run()

    job_dir = (
        Path(settings.STORAGE_ROOT)
        / "projects"
        / str(project_id)
        / str(exp_id)
        / "jobs"
        / str(job_id)
    )
    assert job_dir.exists(), f"Job directory should exist at {job_dir}"


async def test_worker_generic_output_persistence(client: AsyncClient, patch_worker_sessions):
    """Worker should use generic persist_job_outputs for non-trimming job types."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    # Create an alignment mock job with valid params
    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/jobs",
        json={
            "jobType": "alignment",
            "name": "Align",
            "params": {
                "experiment_id": exp_id,
                "project_id": project_id,
                "reference_genome": "mm10",
                "reactions": [
                    {
                        "reaction_id": None,
                        "short_name": "IgG",
                        "r1_path": "projects/1/1/fastqs/raw/IgG_R1.fastq.gz",
                        "r2_path": "projects/1/1/fastqs/raw/IgG_R2.fastq.gz",
                        "total_reads": 1000000,
                        "ecoli_spike_in": False,
                        "cutana_spike_in": "None",
                    }
                ],
            },
        },
        headers=headers,
    )
    assert resp.status_code == 201
    job_id = resp.json()["id"]

    await poll_and_run()

    # Alignment mock should complete and persist outputs
    async with test_session_factory() as db:
        job = await db.get(AnalysisJob, job_id)

    assert job.status == "complete"
    assert job.duration_seconds is not None
