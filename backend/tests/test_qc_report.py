# backend/tests/test_qc_report.py
"""Tests for alignment QC report endpoints."""

import csv
import io
from pathlib import Path

from httpx import AsyncClient

from config import settings

# QC CSV headers matching CUTANA Cloud export format
QC_CSV_HEADERS = [
    "Short_Name",
    "Total_Read_Pairs",
    "Aligned_Read_Pairs",
    "Uniquely_Aligned_Read_Pairs",
    "Unique_Alignment_Rate(%)",
    "Duplication_Rate(%)",
    "chrM_Bandwidth(%)",
    "Ecoli_Read_Pairs",
    "Ecoli_Alignment_Rate(%)",
    "Ecoli_Normalization_Factor",
]

SAMPLE_QC_ROWS = [
    {
        "Short_Name": "IgG",
        "Total_Read_Pairs": "23538581",
        "Aligned_Read_Pairs": "9906793",
        "Uniquely_Aligned_Read_Pairs": "6856185",
        "Unique_Alignment_Rate(%)": "29.13",
        "Duplication_Rate(%)": "21.36",
        "chrM_Bandwidth(%)": "0.12",
        "Ecoli_Read_Pairs": "12842807",
        "Ecoli_Alignment_Rate(%)": "54.56",
        "Ecoli_Normalization_Factor": "1.873178",
    },
    {
        "Short_Name": "K4me3_ctrl1",
        "Total_Read_Pairs": "9519486",
        "Aligned_Read_Pairs": "9120700",
        "Uniquely_Aligned_Read_Pairs": "7630846",
        "Unique_Alignment_Rate(%)": "80.16",
        "Duplication_Rate(%)": "12.45",
        "chrM_Bandwidth(%)": "0.0",
        "Ecoli_Read_Pairs": "1020",
        "Ecoli_Alignment_Rate(%)": "0.01",
        "Ecoli_Normalization_Factor": "0.000134",
    },
]


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


async def _create_alignment_job(
    client: AsyncClient,
    headers: dict,
    experiment_id: int,
    project_id: int,
) -> int:
    resp = await client.post(
        f"/api/v1/experiments/{experiment_id}/jobs",
        json={
            "jobType": "alignment",
            "name": "Test Alignment",
            "params": {
                "experiment_id": experiment_id,
                "project_id": project_id,
                "reference_genome": "mm10",
                "reactions": [
                    {"reaction_id": 1, "short_name": "IgG", "cutana_spike_in": "None"},
                    {"reaction_id": 2, "short_name": "K4me3_ctrl1", "cutana_spike_in": "None"},
                ],
            },
        },
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _write_qc_csv(csv_path: Path) -> None:
    """Write sample QC CSV to disk."""
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=QC_CSV_HEADERS)
    writer.writeheader()
    for row in SAMPLE_QC_ROWS:
        writer.writerow(row)
    csv_path.write_text(buf.getvalue())


async def _complete_job_with_qc(
    job_id: int,
    project_id: int,
    experiment_id: int,
) -> None:
    """Write QC CSV to disk and mark job as complete via direct DB manipulation."""
    from sqlalchemy import update

    from models.analysis_job import AnalysisJob
    from models.job_output import JobOutput
    from tests.conftest import test_session_factory

    rel_path = f"projects/{project_id}/{experiment_id}/jobs/{job_id}/qc/alignment_metrics.csv"
    abs_path = Path(settings.STORAGE_ROOT) / rel_path
    _write_qc_csv(abs_path)

    async with test_session_factory() as db:
        await db.execute(
            update(AnalysisJob).where(AnalysisJob.id == job_id).values(status="complete")
        )
        output = JobOutput(
            job_id=job_id,
            reaction_id=None,
            file_category="qc_report",
            filename="alignment_metrics.csv",
            file_path=rel_path,
            file_type="csv",
            file_size_bytes=abs_path.stat().st_size,
        )
        db.add(output)
        await db.commit()


# --- Tests ---


async def test_get_qc_report_success(client: AsyncClient):
    """GET /jobs/{id}/qc-report returns structured QC data for a completed alignment."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_alignment_job(client, headers, exp_id, project_id)

    await _complete_job_with_qc(job_id, project_id, exp_id)

    resp = await client.get(f"/api/v1/jobs/{job_id}/qc-report", headers=headers)
    assert resp.status_code == 200

    data = resp.json()
    assert data["referenceGenome"] == "mm10"
    assert len(data["metrics"]) == 2

    igG = data["metrics"][0]
    assert igG["shortName"] == "IgG"
    assert igG["totalReadPairs"] == 23538581
    assert igG["alignedReadPairs"] == 9906793
    assert igG["uniquelyAlignedReadPairs"] == 6856185
    assert igG["uniqueAlignmentRate"] == 29.13
    assert igG["duplicationRate"] == 21.36
    assert igG["chrmBandwidth"] == 0.12
    assert igG["ecoliReadPairs"] == 12842807
    assert igG["ecoliAlignmentRate"] == 54.56
    assert igG["ecoliNormalizationFactor"] == 1.873178

    ctrl = data["metrics"][1]
    assert ctrl["shortName"] == "K4me3_ctrl1"
    assert ctrl["totalReadPairs"] == 9519486


async def test_get_qc_report_download(client: AsyncClient):
    """GET /jobs/{id}/qc-report/download returns the raw CSV file."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_alignment_job(client, headers, exp_id, project_id)

    await _complete_job_with_qc(job_id, project_id, exp_id)

    resp = await client.get(f"/api/v1/jobs/{job_id}/qc-report/download", headers=headers)
    assert resp.status_code == 200
    assert "text/csv" in resp.headers.get("content-type", "")

    # Verify CSV content
    text = resp.text
    assert "Short_Name" in text
    assert "IgG" in text
    assert "K4me3_ctrl1" in text


async def test_get_qc_report_not_found(client: AsyncClient):
    """GET /jobs/99999/qc-report returns 404 for non-existent job."""
    headers = await _register_and_get_headers(client, "user@example.com")
    resp = await client.get("/api/v1/jobs/99999/qc-report", headers=headers)
    assert resp.status_code == 404


async def test_get_qc_report_not_complete(client: AsyncClient):
    """GET /jobs/{id}/qc-report returns 409 for a queued (not complete) job."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_alignment_job(client, headers, exp_id, project_id)

    # Job is still "queued" — don't complete it
    resp = await client.get(f"/api/v1/jobs/{job_id}/qc-report", headers=headers)
    assert resp.status_code == 409


async def test_get_qc_report_unauthorized(client: AsyncClient):
    """Non-member cannot access QC report."""
    headers1 = await _register_and_get_headers(client, "owner@example.com")
    headers2 = await _register_and_get_headers(client, "stranger@example.com")
    project_id = await _create_project(client, headers1)
    exp_id = await _create_experiment(client, headers1, project_id)
    job_id = await _create_alignment_job(client, headers1, exp_id, project_id)

    await _complete_job_with_qc(job_id, project_id, exp_id)

    resp = await client.get(f"/api/v1/jobs/{job_id}/qc-report", headers=headers2)
    assert resp.status_code == 404


async def test_download_qc_csv_not_complete(client: AsyncClient):
    """GET /jobs/{id}/qc-report/download returns 409 for a queued job."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_alignment_job(client, headers, exp_id, project_id)

    resp = await client.get(f"/api/v1/jobs/{job_id}/qc-report/download", headers=headers)
    assert resp.status_code == 409
