# backend/tests/test_rnaseq_pathway_report.py
"""Tests for RNA-seq pathway analysis report endpoints."""

import json

from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models.analysis_job import AnalysisJob
from models.job_output import JobOutput

GO_TSV_HEADER = "\t".join(
    [
        "ID",
        "Description",
        "GeneRatio",
        "BgRatio",
        "pvalue",
        "p.adjust",
        "qvalue",
        "geneID",
        "Count",
        "ontology",
    ]
)
GO_TSV_ROW = "\t".join(
    [
        "GO:0007399",
        "nervous system development",
        "45/312",
        "2051/21754",
        "1.2e-08",
        "5.6e-06",
        "4.8e-06",
        "MYC/SOX2",
        "45",
        "BP",
    ]
)

KEGG_TSV_HEADER = "\t".join(
    ["ID", "Description", "GeneRatio", "BgRatio", "pvalue", "p.adjust", "qvalue", "geneID", "Count"]
)
KEGG_TSV_ROW = "\t".join(
    [
        "mmu04550",
        "Signaling pathways",
        "18/250",
        "295/8925",
        "2.1e-05",
        "1.8e-03",
        "1.5e-03",
        "22346/74637",
        "18",
    ]
)


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
        json={"name": "Pathway Test", "assayType": "RNA-seq"},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_pathway_job(
    client: AsyncClient,
    headers: dict,
    experiment_id: int,
    project_id: int,
) -> int:
    resp = await client.post(
        f"/api/v1/experiments/{experiment_id}/jobs",
        json={
            "jobType": "rnaseq_pathway",
            "name": "Test Pathway",
            "params": {
                "experiment_id": experiment_id,
                "project_id": project_id,
                "de_job_id": 1,
                "reference_genome": "mm10",
                "gene_list_source": "both",
                "fdr_threshold": 0.05,
                "enable_gsea": False,
                "de_results_path": "projects/1/1/jobs/1/results/de_results.tsv",
            },
        },
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _complete_pathway_job_with_outputs(
    db_session: AsyncSession,
    job_id: int,
    project_id: int,
    experiment_id: int,
):
    storage = settings.STORAGE_ROOT
    rel = f"projects/{project_id}/{experiment_id}/jobs/{job_id}"
    results_dir = f"{storage}/{rel}/results"
    plots_dir = f"{storage}/{rel}/plots"

    import os

    os.makedirs(results_dir, exist_ok=True)
    os.makedirs(plots_dir, exist_ok=True)

    # Write GO results
    go_path = f"{results_dir}/go_results.csv"
    with open(go_path, "w") as f:
        f.write(GO_TSV_HEADER + "\n" + GO_TSV_ROW + "\n")

    # Write KEGG results
    kegg_path = f"{results_dir}/kegg_results.csv"
    with open(kegg_path, "w") as f:
        f.write(KEGG_TSV_HEADER + "\n" + KEGG_TSV_ROW + "\n")

    # Write summary JSON
    summary = {
        "total_input_genes": 312,
        "mapped_entrez_genes": 280,
        "unmapped_genes": 32,
        "go_bp_terms": 1,
        "go_mf_terms": 0,
        "go_cc_terms": 0,
        "kegg_pathways": 1,
        "gsea_enabled": False,
        "gsea_terms": 0,
    }
    summary_path = f"{results_dir}/pathway_summary.json"
    with open(summary_path, "w") as f:
        json.dump(summary, f)

    # Write stub plot
    plot_path = f"{plots_dir}/go_bp.png"
    with open(plot_path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + b"\x00" * 50)

    # Mark job complete
    await db_session.execute(
        update(AnalysisJob).where(AnalysisJob.id == job_id).values(status="complete")
    )

    # Create job outputs
    outputs = [
        JobOutput(
            job_id=job_id,
            file_category="go_results",
            filename="go_results.csv",
            file_path=f"{rel}/results/go_results.csv",
            file_type="csv",
            file_size_bytes=len(GO_TSV_HEADER + "\n" + GO_TSV_ROW + "\n"),
        ),
        JobOutput(
            job_id=job_id,
            file_category="kegg_results",
            filename="kegg_results.csv",
            file_path=f"{rel}/results/kegg_results.csv",
            file_type="csv",
            file_size_bytes=len(KEGG_TSV_HEADER + "\n" + KEGG_TSV_ROW + "\n"),
        ),
        JobOutput(
            job_id=job_id,
            file_category="pathway_summary",
            filename="pathway_summary.json",
            file_path=f"{rel}/results/pathway_summary.json",
            file_type="json",
            file_size_bytes=len(json.dumps(summary)),
        ),
        JobOutput(
            job_id=job_id,
            file_category="go_bp_plot",
            filename="go_bp.png",
            file_path=f"{rel}/plots/go_bp.png",
            file_type="png",
            file_size_bytes=58,
        ),
    ]
    for o in outputs:
        db_session.add(o)
    await db_session.commit()


# ---------------------------------------------------------------------------
# Report endpoint tests
# ---------------------------------------------------------------------------


async def test_get_pathway_report_success(client: AsyncClient, db_session: AsyncSession):
    headers = await _register_and_get_headers(client, "pathway_report@test.com")
    project_id = await _create_project(client, headers)
    experiment_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_pathway_job(client, headers, experiment_id, project_id)

    await _complete_pathway_job_with_outputs(db_session, job_id, project_id, experiment_id)

    resp = await client.get(f"/api/v1/jobs/{job_id}/pathway-report", headers=headers)
    assert resp.status_code == 200

    data = resp.json()
    assert data["geneListSource"] == "both"
    assert data["fdrThreshold"] == 0.05
    assert data["totalInputGenes"] == 312
    assert data["mappedEntrezGenes"] == 280
    assert data["goBpTerms"] == 1
    assert data["keggPathways"] == 1
    assert len(data["goPreview"]) == 1
    assert len(data["keggPreview"]) == 1
    assert len(data["plotOutputs"]) >= 1


async def test_get_pathway_report_not_found(client: AsyncClient):
    headers = await _register_and_get_headers(client, "pathway_404@test.com")
    resp = await client.get("/api/v1/jobs/99999/pathway-report", headers=headers)
    assert resp.status_code == 404


async def test_get_pathway_report_wrong_type(client: AsyncClient, db_session: AsyncSession):
    headers = await _register_and_get_headers(client, "pathway_wrong@test.com")
    project_id = await _create_project(client, headers)
    experiment_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{experiment_id}/jobs",
        json={
            "jobType": "rnaseq_alignment",
            "name": "Alignment",
            "params": {"experiment_id": experiment_id, "project_id": project_id},
        },
        headers=headers,
    )
    assert resp.status_code == 201
    wrong_job_id = resp.json()["id"]

    await db_session.execute(
        update(AnalysisJob).where(AnalysisJob.id == wrong_job_id).values(status="complete")
    )
    await db_session.commit()

    resp = await client.get(f"/api/v1/jobs/{wrong_job_id}/pathway-report", headers=headers)
    assert resp.status_code == 409


async def test_get_pathway_report_not_complete(client: AsyncClient):
    headers = await _register_and_get_headers(client, "pathway_nc@test.com")
    project_id = await _create_project(client, headers)
    experiment_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_pathway_job(client, headers, experiment_id, project_id)

    resp = await client.get(f"/api/v1/jobs/{job_id}/pathway-report", headers=headers)
    assert resp.status_code == 409


async def test_get_pathway_report_unauthorized(client: AsyncClient, db_session: AsyncSession):
    headers1 = await _register_and_get_headers(client, "pathway_owner@test.com")
    headers2 = await _register_and_get_headers(client, "pathway_other@test.com")
    project_id = await _create_project(client, headers1)
    experiment_id = await _create_experiment(client, headers1, project_id)
    job_id = await _create_pathway_job(client, headers1, experiment_id, project_id)

    await _complete_pathway_job_with_outputs(db_session, job_id, project_id, experiment_id)

    resp = await client.get(f"/api/v1/jobs/{job_id}/pathway-report", headers=headers2)
    assert resp.status_code == 404


async def test_download_go_results_success(client: AsyncClient, db_session: AsyncSession):
    headers = await _register_and_get_headers(client, "pathway_dgo@test.com")
    project_id = await _create_project(client, headers)
    experiment_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_pathway_job(client, headers, experiment_id, project_id)

    await _complete_pathway_job_with_outputs(db_session, job_id, project_id, experiment_id)

    resp = await client.get(f"/api/v1/jobs/{job_id}/pathway-report/download-go", headers=headers)
    assert resp.status_code == 200
    assert "GO:0007399" in resp.text


async def test_download_kegg_results_success(client: AsyncClient, db_session: AsyncSession):
    headers = await _register_and_get_headers(client, "pathway_dkegg@test.com")
    project_id = await _create_project(client, headers)
    experiment_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_pathway_job(client, headers, experiment_id, project_id)

    await _complete_pathway_job_with_outputs(db_session, job_id, project_id, experiment_id)

    resp = await client.get(f"/api/v1/jobs/{job_id}/pathway-report/download-kegg", headers=headers)
    assert resp.status_code == 200
    assert "mmu04550" in resp.text


async def test_pathway_report_summary_counts(client: AsyncClient, db_session: AsyncSession):
    headers = await _register_and_get_headers(client, "pathway_counts@test.com")
    project_id = await _create_project(client, headers)
    experiment_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_pathway_job(client, headers, experiment_id, project_id)

    await _complete_pathway_job_with_outputs(db_session, job_id, project_id, experiment_id)

    resp = await client.get(f"/api/v1/jobs/{job_id}/pathway-report", headers=headers)
    data = resp.json()
    assert data["unmappedGenes"] == 32
    assert data["gseaEnabled"] is False
    assert data["gseaTerms"] == 0
