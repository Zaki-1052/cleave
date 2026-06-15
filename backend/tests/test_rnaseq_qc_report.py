# backend/tests/test_rnaseq_qc_report.py
"""Tests for RNA-seq QC dashboard report endpoints (RSeQC + MultiQC)."""

import csv
import io
from pathlib import Path

from httpx import AsyncClient

from config import settings

RSEQC_CSV_HEADERS = [
    "Short_Name",
    "Fraction_Sense",
    "Fraction_Antisense",
    "Fraction_Undetermined",
    "Inferred_Strandedness",
    "CDS_Exons_Tags",
    "5UTR_Exons_Tags",
    "3UTR_Exons_Tags",
    "Intron_Tags",
    "Intergenic_Tags",
    "Coverage_Skewness",
    "Inner_Distance_Mean",
    "Inner_Distance_SD",
]

SAMPLE_METRICS_ROWS = [
    {
        "Short_Name": "ctrl_rep1",
        "Fraction_Sense": "0.475",
        "Fraction_Antisense": "0.513",
        "Fraction_Undetermined": "0.012",
        "Inferred_Strandedness": "unstranded",
        "CDS_Exons_Tags": "2817489",
        "5UTR_Exons_Tags": "120345",
        "3UTR_Exons_Tags": "456789",
        "Intron_Tags": "1234567",
        "Intergenic_Tags": "345678",
        "Coverage_Skewness": "1.02",
        "Inner_Distance_Mean": "145.5",
        "Inner_Distance_SD": "22.3",
    },
    {
        "Short_Name": "mut_rep1",
        "Fraction_Sense": "0.48",
        "Fraction_Antisense": "0.51",
        "Fraction_Undetermined": "0.01",
        "Inferred_Strandedness": "unstranded",
        "CDS_Exons_Tags": "3012456",
        "5UTR_Exons_Tags": "134567",
        "3UTR_Exons_Tags": "512345",
        "Intron_Tags": "1456789",
        "Intergenic_Tags": "378901",
        "Coverage_Skewness": "0.98",
        "Inner_Distance_Mean": "150.2",
        "Inner_Distance_SD": "25.1",
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
        json={"name": "RNA-seq QC Test", "assayType": "RNA-seq"},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_qc_job(
    client: AsyncClient,
    headers: dict,
    experiment_id: int,
    project_id: int,
) -> int:
    resp = await client.post(
        f"/api/v1/experiments/{experiment_id}/jobs",
        json={
            "jobType": "rnaseq_qc",
            "name": "Test QC",
            "params": {
                "experiment_id": experiment_id,
                "project_id": project_id,
                "reference_genome": "mm10",
                "alignment_job_id": 10,
                "reactions": [
                    {"reaction_id": 1, "short_name": "ctrl_rep1", "bam_path": "x.bam"},
                    {"reaction_id": 2, "short_name": "mut_rep1", "bam_path": "y.bam"},
                ],
            },
        },
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _write_metrics_csv(csv_path: Path) -> None:
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=RSEQC_CSV_HEADERS)
    writer.writeheader()
    for row in SAMPLE_METRICS_ROWS:
        writer.writerow(row)
    csv_path.write_text(buf.getvalue())


async def _complete_qc_job_with_outputs(
    job_id: int,
    project_id: int,
    experiment_id: int,
) -> None:
    from sqlalchemy import update

    from models.analysis_job import AnalysisJob
    from models.job_output import JobOutput
    from tests.conftest import test_session_factory

    rel_base = f"projects/{project_id}/{experiment_id}/jobs/{job_id}"

    csv_rel = f"{rel_base}/rseqc/rseqc_metrics.csv"
    _write_metrics_csv(Path(settings.STORAGE_ROOT) / csv_rel)

    html_rel = f"{rel_base}/multiqc/multiqc_report.html"
    html_path = Path(settings.STORAGE_ROOT) / html_rel
    html_path.parent.mkdir(parents=True, exist_ok=True)
    html_path.write_text("<html><body>MultiQC</body></html>")

    async with test_session_factory() as db:
        await db.execute(
            update(AnalysisJob).where(AnalysisJob.id == job_id).values(status="complete")
        )
        db.add(
            JobOutput(
                job_id=job_id,
                reaction_id=None,
                file_category="rseqc_metrics",
                filename="rseqc_metrics.csv",
                file_path=csv_rel,
                file_type="csv",
                file_size_bytes=(Path(settings.STORAGE_ROOT) / csv_rel).stat().st_size,
            )
        )
        db.add(
            JobOutput(
                job_id=job_id,
                reaction_id=None,
                file_category="multiqc_report",
                filename="multiqc_report.html",
                file_path=html_rel,
                file_type="html",
                file_size_bytes=html_path.stat().st_size,
            )
        )
        await db.commit()


# --- Tests ---


async def test_get_rnaseq_qc_dashboard_report_success(client: AsyncClient):
    headers = await _register_and_get_headers(client, "qc_user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_qc_job(client, headers, exp_id, project_id)

    await _complete_qc_job_with_outputs(job_id, project_id, exp_id)

    resp = await client.get(f"/api/v1/jobs/{job_id}/rnaseq-qc-dashboard-report", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["referenceGenome"] == "mm10"
    assert len(data["modulesRun"]) == 5
    assert len(data["metrics"]) == 2
    assert data["metrics"][0]["shortName"] == "ctrl_rep1"
    assert data["metrics"][0]["cdsExonsTags"] == 2817489
    assert data["multiqcOutputId"] is not None


async def test_download_rnaseq_qc_dashboard_csv(client: AsyncClient):
    headers = await _register_and_get_headers(client, "qc_dl@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_qc_job(client, headers, exp_id, project_id)

    await _complete_qc_job_with_outputs(job_id, project_id, exp_id)

    resp = await client.get(
        f"/api/v1/jobs/{job_id}/rnaseq-qc-dashboard-report/download", headers=headers
    )
    assert resp.status_code == 200
    assert "text/csv" in resp.headers.get("content-type", "")


async def test_get_rnaseq_qc_dashboard_report_not_found(client: AsyncClient):
    headers = await _register_and_get_headers(client, "qc_404@example.com")
    resp = await client.get("/api/v1/jobs/99999/rnaseq-qc-dashboard-report", headers=headers)
    assert resp.status_code == 404


async def test_get_rnaseq_qc_dashboard_report_wrong_type(client: AsyncClient):
    headers = await _register_and_get_headers(client, "qc_wrong@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/jobs",
        json={
            "jobType": "rnaseq_alignment",
            "name": "Test Align",
            "params": {
                "experiment_id": exp_id,
                "project_id": project_id,
                "reference_genome": "mm10",
                "reactions": [],
            },
        },
        headers=headers,
    )
    assert resp.status_code == 201
    align_job_id = resp.json()["id"]

    from sqlalchemy import update

    from models.analysis_job import AnalysisJob
    from tests.conftest import test_session_factory

    async with test_session_factory() as db:
        await db.execute(
            update(AnalysisJob).where(AnalysisJob.id == align_job_id).values(status="complete")
        )
        await db.commit()

    resp = await client.get(
        f"/api/v1/jobs/{align_job_id}/rnaseq-qc-dashboard-report", headers=headers
    )
    assert resp.status_code == 409


async def test_get_rnaseq_qc_dashboard_report_not_complete(client: AsyncClient):
    headers = await _register_and_get_headers(client, "qc_409@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_qc_job(client, headers, exp_id, project_id)

    resp = await client.get(f"/api/v1/jobs/{job_id}/rnaseq-qc-dashboard-report", headers=headers)
    assert resp.status_code == 409


async def test_get_rnaseq_qc_dashboard_report_unauthorized(client: AsyncClient):
    headers1 = await _register_and_get_headers(client, "qc_owner@example.com")
    headers2 = await _register_and_get_headers(client, "qc_other@example.com")
    project_id = await _create_project(client, headers1)
    exp_id = await _create_experiment(client, headers1, project_id)
    job_id = await _create_qc_job(client, headers1, exp_id, project_id)

    resp = await client.get(f"/api/v1/jobs/{job_id}/rnaseq-qc-dashboard-report", headers=headers2)
    assert resp.status_code == 404
