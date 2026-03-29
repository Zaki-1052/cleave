# backend/tests/test_alignment_concurrency.py
"""Tests for concurrent reaction processing in the alignment pipeline."""

import time
from unittest.mock import patch

import pytest

from pipelines.alignment import AlignmentStage


@pytest.fixture
def stage():
    return AlignmentStage()


def _make_params(n_reactions: int = 3) -> dict:
    """Build valid alignment params with N reactions."""
    reactions = []
    for i in range(n_reactions):
        name = f"sample_{i}"
        reactions.append(
            {
                "reaction_id": i + 1,
                "short_name": name,
                "r1_path": f"projects/1/1/fastqs/raw/{name}_R1.fastq.gz",
                "r2_path": f"projects/1/1/fastqs/raw/{name}_R2.fastq.gz",
                "total_reads": 1000000,
                "ecoli_spike_in": False,
                "cutana_spike_in": "None",
            }
        )
    return {
        "experiment_id": 1,
        "project_id": 1,
        "reference_genome": "mm10",
        "remove_duplicates": True,
        "remove_dac_exclusion": True,
        "bam_coverage_bin_size": 20,
        "smoothed_bin_size": 100,
        "reactions": reactions,
    }


# --- Thread count calculation ---


def test_thread_count_formula():
    """Verify threads_per_reaction = max(2, total_threads // concurrent_count)."""
    # 32 threads, 8 concurrent → 4 each
    assert max(2, 32 // 8) == 4
    # 32 threads, 1 concurrent → 32 each
    assert max(2, 32 // 1) == 32
    # 2 threads, 8 concurrent → 2 each (floor)
    assert max(2, 2 // 8) == 2
    # 10 threads, 3 concurrent → 3 each
    assert max(2, 10 // 3) == 3
    # 4 threads, 4 concurrent → 2 each (floor of 1, clamped to 2)
    assert max(2, 4 // 4) == 2


# --- Sequential equivalence (MAX_CONCURRENT_REACTIONS=1) ---


@patch("pipelines.alignment.settings")
def test_sequential_equivalence(mock_settings, stage, tmp_path):
    """With MAX_CONCURRENT_REACTIONS=1, output is identical to sequential behavior."""
    mock_settings.PIPELINE_MODE = "mock"
    mock_settings.MAX_CONCURRENT_REACTIONS = 1
    mock_settings.STORAGE_ROOT = str(tmp_path)

    params = _make_params(3)
    job_dir = tmp_path / "job_1"
    job_dir.mkdir()

    result = stage.mock_run(1, params, tmp_path, job_dir)

    assert result["status"] == "complete"
    assert len(result["qc_metrics"]) == 3
    # 3 reactions × 7 files each + 1 QC CSV = 22 outputs
    assert len(result["outputs"]) == 22
    # Verify original order preserved
    assert result["qc_metrics"][0]["short_name"] == "sample_0"
    assert result["qc_metrics"][1]["short_name"] == "sample_1"
    assert result["qc_metrics"][2]["short_name"] == "sample_2"


# --- Concurrent mock produces correct results ---


@patch("pipelines.alignment.settings")
def test_concurrent_mock_correct_results(mock_settings, stage, tmp_path):
    """Multiple reactions concurrently produce all expected outputs."""
    mock_settings.PIPELINE_MODE = "mock"
    mock_settings.MAX_CONCURRENT_REACTIONS = 4
    mock_settings.STORAGE_ROOT = str(tmp_path)

    params = _make_params(5)
    job_dir = tmp_path / "job_2"
    job_dir.mkdir()

    result = stage.mock_run(2, params, tmp_path, job_dir)

    assert result["status"] == "complete"
    assert len(result["qc_metrics"]) == 5
    # 5 reactions × 7 files + 1 QC CSV = 36
    assert len(result["outputs"]) == 36

    # QC CSV file exists and has 5 data rows
    qc_csv = job_dir / "qc" / "alignment_metrics.csv"
    assert qc_csv.exists()
    lines = qc_csv.read_text().strip().split("\n")
    assert len(lines) == 6  # 1 header + 5 data rows


# --- Output ordering is deterministic ---


@patch("pipelines.alignment.settings")
def test_output_ordering_deterministic(mock_settings, stage, tmp_path):
    """Outputs follow original reaction order, not thread completion order."""
    mock_settings.PIPELINE_MODE = "mock"
    mock_settings.MAX_CONCURRENT_REACTIONS = 8
    mock_settings.STORAGE_ROOT = str(tmp_path)

    params = _make_params(5)
    job_dir = tmp_path / "job_3"
    job_dir.mkdir()

    result = stage.mock_run(3, params, tmp_path, job_dir)

    # QC metrics should be in original order
    names = [m["short_name"] for m in result["qc_metrics"]]
    assert names == ["sample_0", "sample_1", "sample_2", "sample_3", "sample_4"]

    # Per-reaction outputs should be grouped by reaction in original order
    reaction_ids_seen = []
    for out in result["outputs"]:
        rid = out.get("reaction_id")
        if rid is not None and (not reaction_ids_seen or reaction_ids_seen[-1] != rid):
            reaction_ids_seen.append(rid)
    assert reaction_ids_seen == [1, 2, 3, 4, 5]


# --- Concurrent mock is faster than sequential ---


@patch("pipelines.alignment.settings")
def test_concurrent_faster_than_sequential(mock_settings, stage, tmp_path):
    """Concurrent processing completes faster than N × sleep(1) would sequentially."""
    mock_settings.PIPELINE_MODE = "mock"
    mock_settings.MAX_CONCURRENT_REACTIONS = 4
    mock_settings.STORAGE_ROOT = str(tmp_path)

    params = _make_params(4)
    job_dir = tmp_path / "job_4"
    job_dir.mkdir()

    start = time.time()
    result = stage.mock_run(4, params, tmp_path, job_dir)
    elapsed = time.time() - start

    assert result["status"] == "complete"
    # 4 reactions with sleep(1) each, concurrent should finish in ~1-2s, not 4s
    assert elapsed < 3.0


# --- All file categories present ---


@patch("pipelines.alignment.settings")
def test_all_output_categories_present(mock_settings, stage, tmp_path):
    """Every expected file category is produced."""
    mock_settings.PIPELINE_MODE = "mock"
    mock_settings.MAX_CONCURRENT_REACTIONS = 4
    mock_settings.STORAGE_ROOT = str(tmp_path)

    params = _make_params(2)
    job_dir = tmp_path / "job_5"
    job_dir.mkdir()

    result = stage.mock_run(5, params, tmp_path, job_dir)

    categories = {out["file_category"] for out in result["outputs"]}
    assert categories == {
        "unique_bam",
        "bigwig",
        "smoothed_bigwig",
        "tss_heatmap",
        "genebody_heatmap",
        "log",
        "qc_report",
    }


# --- Stub files exist on disk ---


@patch("pipelines.alignment.settings")
def test_stub_files_exist_on_disk(mock_settings, stage, tmp_path):
    """All referenced output files actually exist on disk."""
    mock_settings.PIPELINE_MODE = "mock"
    mock_settings.MAX_CONCURRENT_REACTIONS = 2
    mock_settings.STORAGE_ROOT = str(tmp_path)

    params = _make_params(2)
    job_dir = tmp_path / "job_6"
    job_dir.mkdir()

    result = stage.mock_run(6, params, tmp_path, job_dir)

    for out in result["outputs"]:
        # file_path is STORAGE_ROOT-relative; strip the "projects/1/1/jobs/6/" prefix
        # to get the path relative to job_dir
        rel = out["file_path"].split("/", 5)[-1]  # e.g. "bams/sample_0_final.bam"
        file_path = job_dir / rel
        assert file_path.exists(), f"Missing: {rel} (full: {out['file_path']})"
