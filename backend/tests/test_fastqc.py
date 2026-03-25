# backend/tests/test_fastqc.py
"""Tests for FastQC pipeline module and integration with upload flow."""

import asyncio
import gzip
import io
from pathlib import Path
from unittest.mock import patch

import pytest
from httpx import AsyncClient

from pipelines.fastqc import (
    _strip_fastq_extension,
    find_fastqc_data_txt,
    mock_run_for_file,
    parse_fastqc_data,
)

FASTQ_CONTENT = b"@SEQ_ID\nACGTACGT\n+\nIIIIIIII\n"

# Path to real sample data in the repo
SAMPLE_DIR = Path(__file__).resolve().parents[2] / "cutana" / "fastqc"


# --- Unit Tests: Parsing ---


def test_strip_fastq_extension():
    assert _strip_fastq_extension("sample_R1_001.fastq.gz") == "sample_R1_001"
    assert _strip_fastq_extension("sample_R1_001.fastq") == "sample_R1_001"
    assert _strip_fastq_extension("sample_R1_001.fq.gz") == "sample_R1_001"
    assert _strip_fastq_extension("sample_R1_001.fq") == "sample_R1_001"
    assert _strip_fastq_extension("no_extension") == "no_extension"


@pytest.mark.skipif(not SAMPLE_DIR.exists(), reason="cutana/fastqc/ not available")
def test_parse_fastqc_data():
    """Parse a real FastQC TXT from cutana/fastqc/ and verify key fields."""
    txt_name = "230301_index_25_ctrl_1_old_PUM1_H3K4me3_trimmed_L001_R1_001.stats-fastqc.txt"
    txt_path = SAMPLE_DIR / txt_name
    result = parse_fastqc_data(txt_path)

    assert result.total_reads == 9519486
    assert result.adapter_status == "pass"
    assert "Basic Statistics" in result.module_summaries
    assert result.module_summaries["Basic Statistics"] == "pass"
    assert result.module_summaries["Per base sequence content"] == "fail"
    assert result.module_summaries["Sequence Length Distribution"] == "warn"


def test_parse_fastqc_data_minimal(tmp_path: Path):
    """Parse a minimal synthetic FastQC TXT."""
    txt = tmp_path / "test_fastqc_data.txt"
    txt.write_text(
        "##FastQC\t0.12.1\n"
        ">>Basic Statistics\tpass\n"
        "#Measure\tValue\n"
        "Filename\ttest.fastq\n"
        "Total Sequences\t12345\n"
        ">>END_MODULE\n"
        ">>Adapter Content\twarn\n"
        "#Position\tIllumina\n"
        ">>END_MODULE\n"
    )
    result = parse_fastqc_data(txt)
    assert result.total_reads == 12345
    assert result.adapter_status == "warn"
    assert result.module_summaries["Basic Statistics"] == "pass"


# --- Unit Tests: Mock Run ---


@pytest.mark.skipif(not SAMPLE_DIR.exists(), reason="cutana/fastqc/ not available")
def test_mock_run_creates_report(tmp_path: Path):
    """Mock FastQC creates an HTML report at the expected path."""
    fake_fastq = tmp_path / "input" / "sample_R1_001.fastq.gz"
    fake_fastq.parent.mkdir(parents=True)
    fake_fastq.write_bytes(b"fake")

    output_dir = tmp_path / "fastqc"
    result = mock_run_for_file(fake_fastq, output_dir)

    assert result.total_reads is not None
    assert result.total_reads > 0
    report_path = Path(result.report_html_path)
    assert report_path.exists()
    assert report_path.name == "sample_R1_001_fastqc.html"
    assert report_path.stat().st_size > 0


@pytest.mark.skipif(not SAMPLE_DIR.exists(), reason="cutana/fastqc/ not available")
def test_mock_run_returns_module_summaries(tmp_path: Path):
    """Mock FastQC returns module summaries from sample data."""
    fake_fastq = tmp_path / "test_R1_001.fastq.gz"
    fake_fastq.write_bytes(b"fake")

    output_dir = tmp_path / "fastqc"
    result = mock_run_for_file(fake_fastq, output_dir)

    assert result.adapter_status is not None
    assert len(result.module_summaries) > 0


# --- Integration Tests: Upload triggers FastQC ---


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
        json={"name": "Test"},
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


async def _wait_for_fastqc(
    client: AsyncClient, exp_id: int, headers: dict, timeout: float = 10.0
) -> list[dict]:
    """Poll the fastqs list until all files have totalReads populated."""
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        resp = await client.get(f"/api/v1/experiments/{exp_id}/fastqs", headers=headers)
        items = resp.json()["items"]
        if items and all(f["totalReads"] is not None for f in items):
            return items
        await asyncio.sleep(0.3)
    return []


@pytest.mark.skipif(not SAMPLE_DIR.exists(), reason="cutana/fastqc/ not available")
async def test_upload_triggers_fastqc(client: AsyncClient):
    """Upload FASTQs, wait for FastQC background task, verify totalReads and reportPath."""
    from tests.conftest import test_session_factory

    # Patch async_session_factory in fastqc_service to use the test DB
    with patch("services.fastqc_service.async_session_factory", test_session_factory):
        headers = await _register_and_get_headers(client, "user@example.com")
        project_id = await _create_project(client, headers)
        exp_id = await _create_experiment(client, headers, project_id)

        resp = await client.post(
            f"/api/v1/experiments/{exp_id}/fastqs/upload",
            files=[
                ("files", ("sample_R1_001.fastq.gz", _make_fastq_gz(), "application/octet-stream")),
            ],
            headers=headers,
        )
        assert resp.status_code == 201
        # Initially, totalReads should be None
        assert resp.json()["uploaded"][0]["totalReads"] is None

        # Wait for background FastQC to complete
        items = await _wait_for_fastqc(client, exp_id, headers)
        assert len(items) == 1
        assert items[0]["totalReads"] is not None
        assert items[0]["totalReads"] > 0
        assert items[0]["fastqcReportPath"] is not None


@pytest.mark.skipif(not SAMPLE_DIR.exists(), reason="cutana/fastqc/ not available")
async def test_fastqc_report_endpoint_200(client: AsyncClient):
    """After FastQC completes, the report endpoint returns HTML."""
    from tests.conftest import test_session_factory

    with patch("services.fastqc_service.async_session_factory", test_session_factory):
        headers = await _register_and_get_headers(client, "user@example.com")
        project_id = await _create_project(client, headers)
        exp_id = await _create_experiment(client, headers, project_id)

        resp = await client.post(
            f"/api/v1/experiments/{exp_id}/fastqs/upload",
            files=[
                ("files", ("sample_R1_001.fastq.gz", _make_fastq_gz(), "application/octet-stream")),
            ],
            headers=headers,
        )
        fastq_id = resp.json()["uploaded"][0]["id"]

        items = await _wait_for_fastqc(client, exp_id, headers)
        assert len(items) == 1

        report_resp = await client.get(
            f"/api/v1/experiments/{exp_id}/fastqs/{fastq_id}/fastqc",
            headers=headers,
        )
        assert report_resp.status_code == 200
        assert "text/html" in report_resp.headers.get("content-type", "")


async def test_fastqc_report_404_before_ready(client: AsyncClient):
    """Before FastQC completes, the report endpoint returns 404."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    # Upload but don't wait for FastQC — request report immediately
    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/fastqs/upload",
        files=[
            ("files", ("sample_R1_001.fastq.gz", _make_fastq_gz(), "application/octet-stream")),
        ],
        headers=headers,
    )
    fastq_id = resp.json()["uploaded"][0]["id"]

    # Immediately check — should be 404 (FastQC hasn't run yet)
    report_resp = await client.get(
        f"/api/v1/experiments/{exp_id}/fastqs/{fastq_id}/fastqc",
        headers=headers,
    )
    assert report_resp.status_code == 404


# --- Unit Tests: find_fastqc_data_txt ---


def test_find_fastqc_data_txt_real_mode(tmp_path: Path):
    """find_fastqc_data_txt resolves the real mode TXT location (extracted subdir)."""
    html = tmp_path / "sample_R1_001_fastqc.html"
    subdir = tmp_path / "sample_R1_001_fastqc"
    subdir.mkdir()
    txt = subdir / "fastqc_data.txt"
    html.write_text("<html></html>")
    txt.write_text(">>Basic Statistics\tpass\n>>END_MODULE\n")

    result = find_fastqc_data_txt(html)
    assert result == txt


def test_find_fastqc_data_txt_mock_mode(tmp_path: Path):
    """find_fastqc_data_txt resolves the mock mode TXT location (flat file)."""
    html = tmp_path / "sample_R1_001_fastqc.html"
    txt = tmp_path / "sample_R1_001_fastqc_data.txt"
    html.write_text("<html></html>")
    txt.write_text(">>Basic Statistics\tpass\n>>END_MODULE\n")

    result = find_fastqc_data_txt(html)
    assert result == txt


def test_find_fastqc_data_txt_not_found(tmp_path: Path):
    """find_fastqc_data_txt returns None when no TXT exists."""
    html = tmp_path / "sample_R1_001_fastqc.html"
    html.write_text("<html></html>")

    result = find_fastqc_data_txt(html)
    assert result is None


@pytest.mark.skipif(not SAMPLE_DIR.exists(), reason="cutana/fastqc/ not available")
def test_mock_run_copies_txt_alongside_html(tmp_path: Path):
    """Mock FastQC run copies both HTML and TXT files."""
    fake_fastq = tmp_path / "input" / "sample_R1_001.fastq.gz"
    fake_fastq.parent.mkdir(parents=True)
    fake_fastq.write_bytes(b"fake")

    output_dir = tmp_path / "fastqc"
    result = mock_run_for_file(fake_fastq, output_dir)

    html_path = Path(result.report_html_path)
    assert html_path.exists()
    # TXT should be resolvable from the HTML path
    txt_path = find_fastqc_data_txt(html_path)
    assert txt_path is not None
    assert txt_path.exists()


# --- Integration Tests: FastQC Summary Endpoint ---


@pytest.mark.skipif(not SAMPLE_DIR.exists(), reason="cutana/fastqc/ not available")
async def test_fastqc_summary_endpoint(client: AsyncClient):
    """After FastQC completes, the summary endpoint returns module statuses."""
    from tests.conftest import test_session_factory

    with patch("services.fastqc_service.async_session_factory", test_session_factory):
        headers = await _register_and_get_headers(client, "user@example.com")
        project_id = await _create_project(client, headers)
        exp_id = await _create_experiment(client, headers, project_id)

        resp = await client.post(
            f"/api/v1/experiments/{exp_id}/fastqs/upload",
            files=[
                ("files", ("sample_R1_001.fastq.gz", _make_fastq_gz(), "application/octet-stream")),
            ],
            headers=headers,
        )
        fastq_id = resp.json()["uploaded"][0]["id"]

        await _wait_for_fastqc(client, exp_id, headers)

        summary_resp = await client.get(
            f"/api/v1/experiments/{exp_id}/fastqs/{fastq_id}/fastqc-summary",
            headers=headers,
        )
        assert summary_resp.status_code == 200
        data = summary_resp.json()
        assert "moduleSummaries" in data
        assert len(data["moduleSummaries"]) > 0
        mod = data["moduleSummaries"][0]
        assert "name" in mod
        assert "status" in mod
        assert mod["status"] in ("pass", "warn", "fail")
        assert data["filename"] == "sample_R1_001.fastq.gz"


async def test_fastqc_summary_404_before_ready(client: AsyncClient):
    """Before FastQC completes, the summary endpoint returns 404."""
    headers = await _register_and_get_headers(client, "user@example.com")
    project_id = await _create_project(client, headers)
    exp_id = await _create_experiment(client, headers, project_id)

    resp = await client.post(
        f"/api/v1/experiments/{exp_id}/fastqs/upload",
        files=[
            ("files", ("sample_R1_001.fastq.gz", _make_fastq_gz(), "application/octet-stream")),
        ],
        headers=headers,
    )
    fastq_id = resp.json()["uploaded"][0]["id"]

    summary_resp = await client.get(
        f"/api/v1/experiments/{exp_id}/fastqs/{fastq_id}/fastqc-summary",
        headers=headers,
    )
    assert summary_resp.status_code == 404
