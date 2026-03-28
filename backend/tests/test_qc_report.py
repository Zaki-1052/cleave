# backend/tests/test_qc_report.py
"""Tests for alignment and peak calling QC report endpoints."""

import csv
import io
from pathlib import Path

from httpx import AsyncClient

from config import settings
from services.qc_report_service import ANNOTATION_CATEGORIES

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


# ---------------------------------------------------------------------------
# Peak Calling QC Report Tests
# ---------------------------------------------------------------------------

PEAK_QC_CSV_HEADERS = [
    "Short_Name",
    "Control_Short_Name",
    "Reference_Genome",
    "Peak_Caller",
    "Peak_Size",
    "Significance_Threshold",
    "Uniquely_Aligned_Read_Pairs",
    "Called_Peaks",
    "Reads_in_Peaks",
    "FRiP",
]

SAMPLE_PEAK_QC_ROWS = [
    {
        "Short_Name": "K4me3_ctrl1",
        "Control_Short_Name": "IgG",
        "Reference_Genome": "Mouse mm10",
        "Peak_Caller": "MACS2",
        "Peak_Size": "narrow",
        "Significance_Threshold": "0.01",
        "Uniquely_Aligned_Read_Pairs": "7630846",
        "Called_Peaks": "22236",
        "Reads_in_Peaks": "5578816",
        "FRiP": "0.7311",
    },
    {
        "Short_Name": "K4me3_mut1",
        "Control_Short_Name": "IgG",
        "Reference_Genome": "Mouse mm10",
        "Peak_Caller": "MACS2",
        "Peak_Size": "narrow",
        "Significance_Threshold": "0.01",
        "Uniquely_Aligned_Read_Pairs": "5324032",
        "Called_Peaks": "18500",
        "Reads_in_Peaks": "3950000",
        "FRiP": "0.6820",
    },
]

TOP_PEAKS_CSV_HEADERS = [
    "Short_Name",
    "Control_Short_Name",
    "Reference_Genome",
    "Peak_Caller",
    "Peak_Size",
    "Significance_Threshold",
    "Top Peak",
    "2' Peak",
    "3' Peak",
]

SAMPLE_TOP_PEAKS_ROWS = [
    {
        "Short_Name": "K4me3_ctrl1",
        "Control_Short_Name": "IgG",
        "Reference_Genome": "Mouse mm10",
        "Peak_Caller": "MACS2",
        "Peak_Size": "narrow",
        "Significance_Threshold": "0.01",
        "Top Peak": "chr15:32920284-32924319",
        "2' Peak": "chr4:62514937-62520796",
        "3' Peak": "chr1:55053483-55056567",
    },
]


def _write_peak_qc_csv(csv_path: Path) -> None:
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=PEAK_QC_CSV_HEADERS)
    writer.writeheader()
    for row in SAMPLE_PEAK_QC_ROWS:
        writer.writerow(row)
    csv_path.write_text(buf.getvalue())


def _write_top_peaks_csv(csv_path: Path) -> None:
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=TOP_PEAKS_CSV_HEADERS)
    writer.writeheader()
    for row in SAMPLE_TOP_PEAKS_ROWS:
        writer.writerow(row)
    csv_path.write_text(buf.getvalue())


def _write_annotation_stats(stats_path: Path, *, is_igg: bool = False) -> None:
    """Write a HOMER annotation_stats.txt stub."""
    stats_path.parent.mkdir(parents=True, exist_ok=True)
    if is_igg:
        stats_path.write_text(
            "Annotation\tNumber of peaks\tTotal size (bp)\tLog2 Enrichment\n"
            "Promoter-TSS\t100\t500000\t0.5\n"
            "Intron\t500\t15000000\t0.9\n"
            "Intergenic\t400\t12000000\t1.0\n"
        )
    else:
        stats_path.write_text(
            "Annotation\tNumber of peaks\tTotal size (bp)\tLog2 Enrichment\n"
            "Promoter-TSS\t8000\t40000000\t3.2\n"
            "Intron\t5000\t150000000\t0.5\n"
            "Intergenic\t3000\t90000000\t-0.5\n"
            "Exon\t3000\t45000000\t1.8\n"
            "3' UTR\t1000\t15000000\t0.7\n"
        )


async def _create_reactions(
    client: AsyncClient,
    headers: dict,
    experiment_id: int,
) -> list[int]:
    """Create two reactions and return their IDs."""
    ids = []
    for name in ("K4me3_ctrl1", "K4me3_mut1"):
        resp = await client.post(
            f"/api/v1/experiments/{experiment_id}/reactions",
            json={
                "fastqPrefix": f"test_{name}",
                "shortName": name,
                "organism": "Mouse",
                "assayType": "CUT&RUN",
            },
            headers=headers,
        )
        assert resp.status_code == 201
        ids.append(resp.json()["id"])
    return ids


async def _create_peak_calling_job(
    client: AsyncClient,
    headers: dict,
    experiment_id: int,
    project_id: int,
    reaction_ids: list[int] | None = None,
) -> int:
    rxn_ids = reaction_ids or [10, 11]
    resp = await client.post(
        f"/api/v1/experiments/{experiment_id}/jobs",
        json={
            "jobType": "peak_calling",
            "name": "Test Peak Calling",
            "params": {
                "experiment_id": experiment_id,
                "project_id": project_id,
                "reference_genome": "mm10",
                "peak_caller": "MACS2",
                "peak_size": "narrow",
                "reactions": [
                    {"reaction_id": rxn_ids[0], "short_name": "K4me3_ctrl1"},
                    {"reaction_id": rxn_ids[1], "short_name": "K4me3_mut1"},
                ],
            },
        },
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _complete_peak_job_with_qc(
    job_id: int,
    project_id: int,
    experiment_id: int,
    *,
    include_top_peaks: bool = True,
    include_annotations: bool = False,
    reaction_ids: list[int] | None = None,
) -> None:
    """Write peak QC files to disk and mark job as complete."""
    from sqlalchemy import update

    from models.analysis_job import AnalysisJob
    from models.job_output import JobOutput
    from tests.conftest import test_session_factory

    base = Path(settings.STORAGE_ROOT) / f"projects/{project_id}/{experiment_id}/jobs/{job_id}"
    qc_dir = base / "qc"
    annotation_dir = base / "annotation"

    # Metrics CSV
    metrics_path = qc_dir / "peak_caller_metrics.csv"
    _write_peak_qc_csv(metrics_path)
    rel_metrics = f"projects/{project_id}/{experiment_id}/jobs/{job_id}/qc/peak_caller_metrics.csv"

    async with test_session_factory() as db:
        await db.execute(
            update(AnalysisJob).where(AnalysisJob.id == job_id).values(status="complete")
        )
        db.add(
            JobOutput(
                job_id=job_id,
                reaction_id=None,
                file_category="qc_report",
                filename="peak_caller_metrics.csv",
                file_path=rel_metrics,
                file_type="csv",
                file_size_bytes=metrics_path.stat().st_size,
            )
        )

        if include_top_peaks:
            top_path = qc_dir / "top_called_peaks.csv"
            _write_top_peaks_csv(top_path)
            rel_top = f"projects/{project_id}/{experiment_id}/jobs/{job_id}/qc/top_called_peaks.csv"
            db.add(
                JobOutput(
                    job_id=job_id,
                    reaction_id=None,
                    file_category="top_peaks",
                    filename="top_called_peaks.csv",
                    file_path=rel_top,
                    file_type="csv",
                    file_size_bytes=top_path.stat().st_size,
                )
            )

        if include_annotations:
            rxn_ids = reaction_ids or [10, 11]
            rxn_defs = [
                (rxn_ids[0], "K4me3_ctrl1", False),
                (rxn_ids[1], "K4me3_mut1", False),
            ]
            for rxn_id, short_name, is_igg in rxn_defs:
                stats_path = annotation_dir / f"{short_name}_annotation_stats.txt"
                _write_annotation_stats(stats_path, is_igg=is_igg)
                rel_stats = (
                    f"projects/{project_id}/{experiment_id}/jobs/{job_id}"
                    f"/annotation/{short_name}_annotation_stats.txt"
                )
                db.add(
                    JobOutput(
                        job_id=job_id,
                        reaction_id=rxn_id,
                        file_category="annotation_stats",
                        filename=f"{short_name}_annotation_stats.txt",
                        file_path=rel_stats,
                        file_type="txt",
                        file_size_bytes=stats_path.stat().st_size,
                    )
                )

        await db.commit()


# --- Peak Calling QC Tests ---


async def test_get_peak_qc_report_success(client: AsyncClient):
    """GET /jobs/{id}/peak-qc-report returns structured data for a completed peak calling job."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_peak_calling_job(client, headers, exp_id, project_id)

    await _complete_peak_job_with_qc(job_id, project_id, exp_id, include_top_peaks=False)

    resp = await client.get(f"/api/v1/jobs/{job_id}/peak-qc-report", headers=headers)
    assert resp.status_code == 200

    data = resp.json()
    assert data["referenceGenome"] == "mm10"
    assert data["peakCaller"] == "MACS2"
    assert data["peakSize"] == "narrow"
    assert len(data["metrics"]) == 2

    m0 = data["metrics"][0]
    assert m0["shortName"] == "K4me3_ctrl1"
    assert m0["controlShortName"] == "IgG"
    assert m0["calledPeaks"] == 22236
    assert m0["frip"] == 0.7311
    assert m0["uniquelyAlignedReadPairs"] == 7630846


async def test_get_peak_qc_report_with_top_peaks(client: AsyncClient):
    """Top peaks are included when the file exists (tests bug fix)."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_peak_calling_job(client, headers, exp_id, project_id)

    await _complete_peak_job_with_qc(job_id, project_id, exp_id, include_top_peaks=True)

    resp = await client.get(f"/api/v1/jobs/{job_id}/peak-qc-report", headers=headers)
    assert resp.status_code == 200

    data = resp.json()
    assert data["topPeaks"] is not None
    assert len(data["topPeaks"]) == 1
    tp = data["topPeaks"][0]
    assert tp["shortName"] == "K4me3_ctrl1"
    assert "chr15:32920284-32924319" in tp["topPeaks"]
    assert len(tp["topPeaks"]) == 3


async def test_get_peak_qc_report_with_annotations(client: AsyncClient):
    """Annotations are included with correct category percentages."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    rxn_ids = await _create_reactions(client, headers, exp_id)
    job_id = await _create_peak_calling_job(client, headers, exp_id, project_id, rxn_ids)

    await _complete_peak_job_with_qc(
        job_id, project_id, exp_id, include_annotations=True, reaction_ids=rxn_ids
    )

    resp = await client.get(f"/api/v1/jobs/{job_id}/peak-qc-report", headers=headers)
    assert resp.status_code == 200

    data = resp.json()
    assert data["annotations"] is not None
    assert len(data["annotations"]) == 2

    # Verify categories are present and sum to ~100%
    ann = data["annotations"][0]
    assert ann["shortName"] in ("K4me3_ctrl1", "K4me3_mut1")
    cats = ann["categories"]
    for cat in ANNOTATION_CATEGORIES:
        assert cat in cats
    total = sum(cats.values())
    assert 99.0 <= total <= 101.0  # Allow rounding tolerance


async def test_get_peak_qc_report_not_found(client: AsyncClient):
    """GET /jobs/99999/peak-qc-report returns 404."""
    headers = await _register_and_get_headers(client, "user@example.com")
    resp = await client.get("/api/v1/jobs/99999/peak-qc-report", headers=headers)
    assert resp.status_code == 404


async def test_get_peak_qc_report_wrong_status(client: AsyncClient):
    """GET /jobs/{id}/peak-qc-report returns 409 for a queued job."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_peak_calling_job(client, headers, exp_id, project_id)

    resp = await client.get(f"/api/v1/jobs/{job_id}/peak-qc-report", headers=headers)
    assert resp.status_code == 409


async def test_get_peak_qc_report_unauthorized(client: AsyncClient):
    """Non-member cannot access peak QC report."""
    headers1 = await _register_and_get_headers(client, "owner@example.com")
    headers2 = await _register_and_get_headers(client, "stranger@example.com")
    project_id = await _create_project(client, headers1)
    exp_id = await _create_experiment(client, headers1, project_id)
    job_id = await _create_peak_calling_job(client, headers1, exp_id, project_id)

    await _complete_peak_job_with_qc(job_id, project_id, exp_id)

    resp = await client.get(f"/api/v1/jobs/{job_id}/peak-qc-report", headers=headers2)
    assert resp.status_code == 404


async def test_download_peak_qc_csv(client: AsyncClient):
    """GET /jobs/{id}/peak-qc-report/download returns the raw CSV."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    job_id = await _create_peak_calling_job(client, headers, exp_id, project_id)

    await _complete_peak_job_with_qc(job_id, project_id, exp_id)

    resp = await client.get(f"/api/v1/jobs/{job_id}/peak-qc-report/download", headers=headers)
    assert resp.status_code == 200
    assert "text/csv" in resp.headers.get("content-type", "")
    assert "K4me3_ctrl1" in resp.text


async def test_download_peak_annotation_csv(client: AsyncClient):
    """GET /jobs/{id}/peak-qc-report/annotation-csv returns annotation percentages."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)
    rxn_ids = await _create_reactions(client, headers, exp_id)
    job_id = await _create_peak_calling_job(client, headers, exp_id, project_id, rxn_ids)

    await _complete_peak_job_with_qc(
        job_id, project_id, exp_id, include_annotations=True, reaction_ids=rxn_ids
    )

    resp = await client.get(f"/api/v1/jobs/{job_id}/peak-qc-report/annotation-csv", headers=headers)
    assert resp.status_code == 200
    assert "text/csv" in resp.headers.get("content-type", "")

    text = resp.text
    assert "Short_Name" in text
    assert "Promoter" in text
    assert "K4me3_ctrl1" in text
