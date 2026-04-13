# backend/tests/test_rnaseq_de_report.py
"""Tests for RNA-seq DE report endpoints."""

import csv
import io
from pathlib import Path

from httpx import AsyncClient

from config import settings

DE_TSV_HEADERS = [
    "gene_name",
    "gene_id",
    "baseMean",
    "log2FoldChange",
    "lfcSE",
    "stat",
    "pvalue",
    "padj",
]

# Mock DE results with known significance counts
SAMPLE_DE_ROWS = [
    # Up-regulated (padj < 0.05, log2FC > 0)
    {
        "gene_name": "Myc",
        "gene_id": "ENSMUSG00000022346",
        "baseMean": "312.7",
        "log2FoldChange": "2.45",
        "lfcSE": "0.31",
        "stat": "7.9",
        "pvalue": "2.8e-15",
        "padj": "1.4e-12",
    },
    {
        "gene_name": "Sox2",
        "gene_id": "ENSMUSG00000074637",
        "baseMean": "156.2",
        "log2FoldChange": "3.12",
        "lfcSE": "0.45",
        "stat": "6.93",
        "pvalue": "4.2e-12",
        "padj": "1.3e-9",
    },
    {
        "gene_name": "Nanog",
        "gene_id": "ENSMUSG00000012396",
        "baseMean": "201.8",
        "log2FoldChange": "1.56",
        "lfcSE": "0.33",
        "stat": "4.73",
        "pvalue": "2.2e-6",
        "padj": "2.8e-4",
    },
    # Down-regulated (padj < 0.05, log2FC < 0)
    {
        "gene_name": "Trp53",
        "gene_id": "ENSMUSG00000059552",
        "baseMean": "678.4",
        "log2FoldChange": "-1.87",
        "lfcSE": "0.28",
        "stat": "-6.68",
        "pvalue": "2.4e-11",
        "padj": "6.0e-9",
    },
    {
        "gene_name": "Pou5f1",
        "gene_id": "ENSMUSG00000024406",
        "baseMean": "89.5",
        "log2FoldChange": "-2.91",
        "lfcSE": "0.52",
        "stat": "-5.6",
        "pvalue": "2.1e-8",
        "padj": "3.5e-6",
    },
    # padj < 0.01 subset: first 5 rows have padj < 0.01
    # Down-regulated, padj < 0.05 but > 0.01
    {
        "gene_name": "Klf4",
        "gene_id": "ENSMUSG00000003032",
        "baseMean": "445.9",
        "log2FoldChange": "-0.78",
        "lfcSE": "0.19",
        "stat": "-4.1",
        "pvalue": "4.1e-5",
        "padj": "4.1e-3",
    },
    # Not significant
    {
        "gene_name": "Gapdh",
        "gene_id": "ENSMUSG00000057666",
        "baseMean": "5432.1",
        "log2FoldChange": "-0.12",
        "lfcSE": "0.08",
        "stat": "-1.5",
        "pvalue": "0.134",
        "padj": "0.892",
    },
    {
        "gene_name": "Actb",
        "gene_id": "ENSMUSG00000029580",
        "baseMean": "8901.3",
        "log2FoldChange": "0.05",
        "lfcSE": "0.06",
        "stat": "0.83",
        "pvalue": "0.407",
        "padj": "0.953",
    },
]
# Expected counts:
# total=8, sig_005=6, sig_001=5, up=3, down=3


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
        json={"name": "RNA-seq DE Test", "assayType": "RNA-seq"},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_de_job(
    client: AsyncClient,
    headers: dict,
    experiment_id: int,
    project_id: int,
) -> int:
    resp = await client.post(
        f"/api/v1/experiments/{experiment_id}/jobs",
        json={
            "jobType": "rnaseq_de",
            "name": "Test DE",
            "params": {
                "experiment_id": experiment_id,
                "project_id": project_id,
                "reference_genome": "mm10",
                "quantification_source": "salmon",
                "samples": [
                    {
                        "reaction_id": 1,
                        "short_name": "ctrl_rep1",
                        "condition": "ctrl",
                        "replicate": 1,
                        "salmon_quant_path": "projects/1/1/jobs/10/salmon/ctrl_rep1/quant.sf",
                    },
                    {
                        "reaction_id": 2,
                        "short_name": "ctrl_rep2",
                        "condition": "ctrl",
                        "replicate": 2,
                        "salmon_quant_path": "projects/1/1/jobs/10/salmon/ctrl_rep2/quant.sf",
                    },
                    {
                        "reaction_id": 3,
                        "short_name": "mut_rep1",
                        "condition": "mut",
                        "replicate": 1,
                        "salmon_quant_path": "projects/1/1/jobs/10/salmon/mut_rep1/quant.sf",
                    },
                    {
                        "reaction_id": 4,
                        "short_name": "mut_rep2",
                        "condition": "mut",
                        "replicate": 2,
                        "salmon_quant_path": "projects/1/1/jobs/10/salmon/mut_rep2/quant.sf",
                    },
                ],
            },
        },
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _write_de_results_tsv(tsv_path: Path) -> None:
    """Write mock DE results TSV to disk."""
    tsv_path.parent.mkdir(parents=True, exist_ok=True)
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=DE_TSV_HEADERS, delimiter="\t")
    writer.writeheader()
    for row in SAMPLE_DE_ROWS:
        writer.writerow(row)
    tsv_path.write_text(buf.getvalue())


def _write_normalized_counts_csv(csv_path: Path) -> None:
    """Write mock normalized counts CSV to disk."""
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["gene_id", "ctrl_rep1", "ctrl_rep2", "mut_rep1", "mut_rep2"])
    for row in SAMPLE_DE_ROWS:
        writer.writerow([row["gene_id"], "100.0", "110.0", "200.0", "210.0"])
    csv_path.write_text(buf.getvalue())


async def _complete_de_job_with_outputs(
    job_id: int,
    project_id: int,
    experiment_id: int,
) -> None:
    """Write DE outputs to disk and mark job as complete via direct DB manipulation."""
    from sqlalchemy import update

    from models.analysis_job import AnalysisJob
    from models.job_output import JobOutput
    from tests.conftest import test_session_factory

    rel_base = f"projects/{project_id}/{experiment_id}/jobs/{job_id}"

    # Write results TSV
    tsv_rel = f"{rel_base}/results/de_results.tsv"
    _write_de_results_tsv(Path(settings.STORAGE_ROOT) / tsv_rel)

    # Write normalized counts CSV
    csv_rel = f"{rel_base}/results/normalized_counts.csv"
    _write_normalized_counts_csv(Path(settings.STORAGE_ROOT) / csv_rel)

    async with test_session_factory() as db:
        await db.execute(
            update(AnalysisJob).where(AnalysisJob.id == job_id).values(status="complete")
        )
        # Register TSV output
        db.add(
            JobOutput(
                job_id=job_id,
                reaction_id=None,
                file_category="de_results",
                filename="de_results.tsv",
                file_path=tsv_rel,
                file_type="tsv",
                file_size_bytes=(Path(settings.STORAGE_ROOT) / tsv_rel).stat().st_size,
            )
        )
        # Register CSV output
        db.add(
            JobOutput(
                job_id=job_id,
                reaction_id=None,
                file_category="normalized_counts",
                filename="normalized_counts.csv",
                file_path=csv_rel,
                file_type="csv",
                file_size_bytes=(Path(settings.STORAGE_ROOT) / csv_rel).stat().st_size,
            )
        )
        # Register a plot output for testing
        png_rel = f"{rel_base}/plots/volcano.png"
        png_path = Path(settings.STORAGE_ROOT) / png_rel
        png_path.parent.mkdir(parents=True, exist_ok=True)
        png_path.write_bytes(b"\x89PNG")
        db.add(
            JobOutput(
                job_id=job_id,
                reaction_id=None,
                file_category="volcano_plot",
                filename="volcano.png",
                file_path=png_rel,
                file_type="png",
                file_size_bytes=4,
            )
        )
        await db.commit()


# --- Tests ---


async def test_get_rnaseq_de_report_success(client: AsyncClient):
    """GET /jobs/{id}/rnaseq-de-report returns structured DE report."""
    headers = await _register_and_get_headers(client, "de_user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_de_job(client, headers, exp_id, project_id)

    await _complete_de_job_with_outputs(job_id, project_id, exp_id)

    resp = await client.get(f"/api/v1/jobs/{job_id}/rnaseq-de-report", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["quantificationSource"] == "salmon"
    assert "ctrl" in data["conditions"]
    assert "mut" in data["conditions"]
    assert data["totalGenes"] == len(SAMPLE_DE_ROWS)
    assert len(data["columnNames"]) == len(DE_TSV_HEADERS)
    assert len(data["resultsPreview"]) == len(SAMPLE_DE_ROWS)
    assert len(data["plotOutputs"]) >= 1


async def test_download_rnaseq_de_results(client: AsyncClient):
    """GET /jobs/{id}/rnaseq-de-report/download-results returns TSV."""
    headers = await _register_and_get_headers(client, "de_dl@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_de_job(client, headers, exp_id, project_id)

    await _complete_de_job_with_outputs(job_id, project_id, exp_id)

    resp = await client.get(
        f"/api/v1/jobs/{job_id}/rnaseq-de-report/download-results", headers=headers
    )
    assert resp.status_code == 200
    assert "text/tab-separated-values" in resp.headers["content-type"]
    assert "de_results.tsv" in resp.headers.get("content-disposition", "")


async def test_download_rnaseq_de_counts(client: AsyncClient):
    """GET /jobs/{id}/rnaseq-de-report/download-counts returns CSV."""
    headers = await _register_and_get_headers(client, "de_counts@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_de_job(client, headers, exp_id, project_id)

    await _complete_de_job_with_outputs(job_id, project_id, exp_id)

    resp = await client.get(
        f"/api/v1/jobs/{job_id}/rnaseq-de-report/download-counts", headers=headers
    )
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    assert "normalized_counts.csv" in resp.headers.get("content-disposition", "")


async def test_get_rnaseq_de_report_not_found(client: AsyncClient):
    """GET /jobs/99999/rnaseq-de-report returns 404 for non-existent job."""
    headers = await _register_and_get_headers(client, "de_404@example.com")
    resp = await client.get("/api/v1/jobs/99999/rnaseq-de-report", headers=headers)
    assert resp.status_code == 404


async def test_get_rnaseq_de_report_not_complete(client: AsyncClient):
    """GET report for a queued (incomplete) job returns 409."""
    headers = await _register_and_get_headers(client, "de_409@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_de_job(client, headers, exp_id, project_id)
    # Job is still in 'queued' status — don't complete it

    resp = await client.get(f"/api/v1/jobs/{job_id}/rnaseq-de-report", headers=headers)
    assert resp.status_code == 409


async def test_get_rnaseq_de_report_wrong_type(client: AsyncClient):
    """GET rnaseq-de-report for an alignment job returns 409."""
    headers = await _register_and_get_headers(client, "de_wrong@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    # Create an alignment job instead
    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/jobs",
        json={
            "jobType": "alignment",
            "name": "Test Align",
            "params": {
                "experiment_id": exp_id,
                "project_id": project_id,
                "reference_genome": "mm10",
                "reactions": [{"reaction_id": 1, "short_name": "s1", "cutana_spike_in": "None"}],
            },
        },
        headers=headers,
    )
    assert resp.status_code == 201
    align_job_id = resp.json()["id"]

    # Mark it complete
    from sqlalchemy import update

    from models.analysis_job import AnalysisJob
    from tests.conftest import test_session_factory

    async with test_session_factory() as db:
        await db.execute(
            update(AnalysisJob).where(AnalysisJob.id == align_job_id).values(status="complete")
        )
        await db.commit()

    resp = await client.get(f"/api/v1/jobs/{align_job_id}/rnaseq-de-report", headers=headers)
    assert resp.status_code == 409


async def test_get_rnaseq_de_report_unauthorized(client: AsyncClient):
    """Non-member gets 404 for DE report (not 403 — hides existence)."""
    headers1 = await _register_and_get_headers(client, "de_owner@example.com")
    headers2 = await _register_and_get_headers(client, "de_other@example.com")
    project_id = await _create_project(client, headers1)
    exp_id = await _create_experiment(client, headers1, project_id)
    job_id = await _create_de_job(client, headers1, exp_id, project_id)

    resp = await client.get(f"/api/v1/jobs/{job_id}/rnaseq-de-report", headers=headers2)
    assert resp.status_code == 404


async def test_significance_counting(client: AsyncClient):
    """Verify correct padj-based significance counts in DE report."""
    headers = await _register_and_get_headers(client, "de_sig@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_de_job(client, headers, exp_id, project_id)

    await _complete_de_job_with_outputs(job_id, project_id, exp_id)

    resp = await client.get(f"/api/v1/jobs/{job_id}/rnaseq-de-report", headers=headers)
    assert resp.status_code == 200
    data = resp.json()

    # From SAMPLE_DE_ROWS: 6 sig at 0.05, 6 sig at 0.01 (4.1e-3 < 0.01), 3 up, 3 down
    assert data["significantGenes005"] == 6
    assert data["significantGenes001"] == 6
    assert data["upregulated"] == 3
    assert data["downregulated"] == 3
    assert data["totalGenes"] == 8
