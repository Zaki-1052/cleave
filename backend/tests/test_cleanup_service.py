# backend/tests/test_cleanup_service.py
"""Tests for the storage lifecycle cleanup service."""

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from httpx import AsyncClient
from sqlalchemy import select, update

from config import settings
from models.analysis_job import AnalysisJob
from models.experiment import Experiment
from models.job_output import JobOutput
from models.project import Project
from services.cleanup_service import (
    cleanup_expired_logs,
    cleanup_stale_tus_uploads,
    run_full_cleanup,
)
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


async def _persist_log_output(
    job_id: int, experiment_id: int, project_id: int, file_size: int = 5000
) -> str:
    """Create a log JobOutput record and a stub file on disk. Returns the relative file path."""
    rel_path = f"projects/{project_id}/{experiment_id}/jobs/{job_id}/logs/pipeline.log"
    abs_path = Path(settings.STORAGE_ROOT) / rel_path
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_text("log content " * 100)

    await persist_job_outputs(
        job_id=job_id,
        experiment_id=experiment_id,
        project_id=project_id,
        outputs=[
            {
                "file_category": "log",
                "filename": "pipeline.log",
                "file_path": rel_path,
                "file_type": "txt",
                "file_size_bytes": file_size,
            }
        ],
    )
    return rel_path


async def _mark_job_complete(job_id: int, completed_at: datetime) -> None:
    """Mark a job as complete with a specific completed_at timestamp."""
    async with test_session_factory() as db:
        await db.execute(
            update(AnalysisJob)
            .where(AnalysisJob.id == job_id)
            .values(status="complete", completed_at=completed_at)
        )
        await db.commit()


async def test_cleanup_deletes_expired_logs(client: AsyncClient, patch_worker_sessions):
    """Log outputs from jobs completed 31+ days ago are deleted from disk and DB."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_job(client, headers, exp_id)

    rel_path = await _persist_log_output(job_id, exp_id, project_id, file_size=5000)
    abs_path = Path(settings.STORAGE_ROOT) / rel_path

    # Mark job completed 31 days ago
    old_date = datetime.now(timezone.utc) - timedelta(days=31)
    await _mark_job_complete(job_id, old_date)

    assert abs_path.exists()

    result = await cleanup_expired_logs()

    assert result["deleted_count"] == 1
    assert result["freed_bytes"] == 5000
    assert not abs_path.exists()

    # Verify DB record is gone
    async with test_session_factory() as db:
        records = await db.execute(
            select(JobOutput).where(JobOutput.job_id == job_id, JobOutput.file_category == "log")
        )
        assert records.scalar_one_or_none() is None

    # Verify storage_bytes decremented
    async with test_session_factory() as db:
        exp = await db.get(Experiment, exp_id)
        proj = await db.get(Project, project_id)
    assert exp.storage_bytes == 0
    assert proj.storage_bytes == 0


async def test_cleanup_preserves_recent_logs(client: AsyncClient, patch_worker_sessions):
    """Log outputs from recently completed jobs are NOT deleted."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_job(client, headers, exp_id)

    rel_path = await _persist_log_output(job_id, exp_id, project_id, file_size=3000)
    abs_path = Path(settings.STORAGE_ROOT) / rel_path

    # Mark job completed 5 days ago (within retention)
    recent_date = datetime.now(timezone.utc) - timedelta(days=5)
    await _mark_job_complete(job_id, recent_date)

    result = await cleanup_expired_logs()

    assert result["deleted_count"] == 0
    assert result["freed_bytes"] == 0
    assert abs_path.exists()

    # DB record still exists
    async with test_session_factory() as db:
        records = await db.execute(
            select(JobOutput).where(JobOutput.job_id == job_id, JobOutput.file_category == "log")
        )
        assert records.scalar_one_or_none() is not None


async def test_cleanup_preserves_non_log_outputs(client: AsyncClient, patch_worker_sessions):
    """Non-log outputs (bigwig, bam, etc.) are never deleted by cleanup."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_job(client, headers, exp_id)

    await persist_job_outputs(
        job_id=job_id,
        experiment_id=exp_id,
        project_id=project_id,
        outputs=[
            {
                "file_category": "bigwig",
                "filename": "sample.bw",
                "file_path": f"projects/{project_id}/{exp_id}/jobs/{job_id}/sample.bw",
                "file_type": "bw",
                "file_size_bytes": 100000,
            }
        ],
    )

    # Mark job completed 31 days ago
    old_date = datetime.now(timezone.utc) - timedelta(days=31)
    await _mark_job_complete(job_id, old_date)

    result = await cleanup_expired_logs()

    assert result["deleted_count"] == 0

    # bigwig record still in DB
    async with test_session_factory() as db:
        records = await db.execute(
            select(JobOutput).where(JobOutput.job_id == job_id, JobOutput.file_category == "bigwig")
        )
        assert records.scalar_one_or_none() is not None


async def test_cleanup_handles_missing_files(client: AsyncClient, patch_worker_sessions):
    """Cleanup succeeds even when the file is already missing from disk."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_job(client, headers, exp_id)

    rel_path = await _persist_log_output(job_id, exp_id, project_id, file_size=2000)
    abs_path = Path(settings.STORAGE_ROOT) / rel_path

    # Delete the file manually before cleanup
    abs_path.unlink()
    assert not abs_path.exists()

    old_date = datetime.now(timezone.utc) - timedelta(days=31)
    await _mark_job_complete(job_id, old_date)

    # Should not raise
    result = await cleanup_expired_logs()
    assert result["deleted_count"] == 1
    assert result["freed_bytes"] == 2000


async def test_cleanup_stale_tus_uploads(client: AsyncClient, patch_worker_sessions):
    """Old files in the tus uploads staging dir are deleted."""
    staging_dir = Path(settings.STORAGE_ROOT) / "uploads"
    staging_dir.mkdir(parents=True, exist_ok=True)

    # Create a stale file (set mtime to 3 days ago)
    stale_file = staging_dir / "abc123.upload"
    stale_file.write_bytes(b"\x00" * 1000)
    old_time = (datetime.now(timezone.utc) - timedelta(hours=72)).timestamp()
    os.utime(stale_file, (old_time, old_time))

    result = await cleanup_stale_tus_uploads()

    assert result["deleted_count"] == 1
    assert result["freed_bytes"] == 1000
    assert not stale_file.exists()


async def test_cleanup_preserves_recent_tus_uploads(client: AsyncClient, patch_worker_sessions):
    """Recent files in the tus uploads staging dir are NOT deleted."""
    staging_dir = Path(settings.STORAGE_ROOT) / "uploads"
    staging_dir.mkdir(parents=True, exist_ok=True)

    recent_file = staging_dir / "recent123.upload"
    recent_file.write_bytes(b"\x00" * 500)
    # mtime is now (just created) — well within the 48-hour retention

    result = await cleanup_stale_tus_uploads()

    assert result["deleted_count"] == 0
    assert recent_file.exists()


async def test_cleanup_storage_bytes_accuracy(client: AsyncClient, patch_worker_sessions):
    """Multiple expired logs across experiments — storage decremented correctly per entity."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp1_id = await _create_experiment(client, headers, project_id)
    exp2_id = await _create_experiment(client, headers, project_id)
    job1_id = await _create_job(client, headers, exp1_id)
    job2_id = await _create_job(client, headers, exp2_id)

    await _persist_log_output(job1_id, exp1_id, project_id, file_size=3000)
    await _persist_log_output(job2_id, exp2_id, project_id, file_size=7000)

    old_date = datetime.now(timezone.utc) - timedelta(days=31)
    await _mark_job_complete(job1_id, old_date)
    await _mark_job_complete(job2_id, old_date)

    result = await cleanup_expired_logs()

    assert result["deleted_count"] == 2
    assert result["freed_bytes"] == 10000

    async with test_session_factory() as db:
        exp1 = await db.get(Experiment, exp1_id)
        exp2 = await db.get(Experiment, exp2_id)
        proj = await db.get(Project, project_id)

    assert exp1.storage_bytes == 0
    assert exp2.storage_bytes == 0
    assert proj.storage_bytes == 0


async def test_run_full_cleanup_integration(client: AsyncClient, patch_worker_sessions):
    """run_full_cleanup returns combined summary from all cleanup tasks."""
    result = await run_full_cleanup()

    assert "logs" in result
    assert "tus_staging" in result
    assert result["logs"]["deleted_count"] == 0
    assert result["tus_staging"]["deleted_count"] == 0


async def test_cleanup_ignores_incomplete_jobs(client: AsyncClient, patch_worker_sessions):
    """Log from a running (non-complete) job is NOT deleted."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_job(client, headers, exp_id)

    await _persist_log_output(job_id, exp_id, project_id, file_size=4000)

    # Mark job as running (not complete) — completed_at is NULL
    async with test_session_factory() as db:
        await db.execute(
            update(AnalysisJob).where(AnalysisJob.id == job_id).values(status="running")
        )
        await db.commit()

    result = await cleanup_expired_logs()

    assert result["deleted_count"] == 0
    assert result["freed_bytes"] == 0


async def test_experiment_delete_cleans_disk(client: AsyncClient, patch_worker_sessions):
    """Deleting an experiment removes its disk directory and decrements project storage."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_job(client, headers, exp_id)

    await _persist_log_output(job_id, exp_id, project_id, file_size=8000)

    exp_dir = Path(settings.STORAGE_ROOT) / "projects" / str(project_id) / str(exp_id)
    assert exp_dir.exists()

    # Delete experiment via API
    resp = await client.delete(f"/api/v1/experiments/{exp_id}", headers=headers)
    assert resp.status_code == 204

    # Disk directory should be gone
    assert not exp_dir.exists()

    # Project storage_bytes should be decremented
    async with test_session_factory() as db:
        proj = await db.get(Project, project_id)
    assert proj.storage_bytes == 0


async def test_project_delete_cleans_disk(client: AsyncClient, patch_worker_sessions):
    """Deleting a project removes its disk directory."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_job(client, headers, exp_id)

    await _persist_log_output(job_id, exp_id, project_id, file_size=6000)

    project_dir = Path(settings.STORAGE_ROOT) / "projects" / str(project_id)
    assert project_dir.exists()

    # Delete project via API
    resp = await client.delete(f"/api/v1/projects/{project_id}", headers=headers)
    assert resp.status_code == 204

    # Disk directory should be gone
    assert not project_dir.exists()
