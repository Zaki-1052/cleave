# backend/tests/test_trimming_pipeline.py
"""Unit tests for the trimming pipeline module."""

import gzip
import time
from pathlib import Path
from unittest.mock import patch

import pytest

from pipelines.trimming import DEFAULTS, TrimmingStage


@pytest.fixture
def stage():
    return TrimmingStage()


@pytest.fixture
def tmp_fastq_pair(override_storage_root):
    """Create a pair of test FASTQ.gz files under STORAGE_ROOT."""
    from config import settings

    fastq_content = b"@SEQ_ID\nACGTACGT\n+\nIIIIIIII\n"
    raw_dir = Path(settings.STORAGE_ROOT) / "projects" / "1" / "1" / "fastqs" / "raw"
    raw_dir.mkdir(parents=True)

    r1_path = raw_dir / "sample_R1_001.fastq.gz"
    r2_path = raw_dir / "sample_R2_001.fastq.gz"
    r1_path.write_bytes(gzip.compress(fastq_content))
    r2_path.write_bytes(gzip.compress(fastq_content))

    return {
        "r1_abs": r1_path,
        "r2_abs": r2_path,
        "r1_rel": "projects/1/1/fastqs/raw/sample_R1_001.fastq.gz",
        "r2_rel": "projects/1/1/fastqs/raw/sample_R2_001.fastq.gz",
    }


def _make_valid_params(tmp_fastq_pair):
    return {
        "experiment_id": 1,
        "project_id": 1,
        "fastq_pairs": [
            {
                "prefix": "sample",
                "r1_path": tmp_fastq_pair["r1_rel"],
                "r2_path": tmp_fastq_pair["r2_rel"],
                "r1_id": 1,
                "r2_id": 2,
            }
        ],
    }


# --- Validation tests ---


def test_validate_valid_params(stage, tmp_fastq_pair):
    params = _make_valid_params(tmp_fastq_pair)
    errors = stage.validate(params)
    assert errors == []


def test_validate_missing_experiment_id(stage):
    params = {"project_id": 1, "fastq_pairs": [{"prefix": "s", "r1_path": "a", "r2_path": "b"}]}
    errors = stage.validate(params)
    assert any("experiment_id" in e for e in errors)


def test_validate_missing_project_id(stage):
    params = {"experiment_id": 1, "fastq_pairs": [{"prefix": "s", "r1_path": "a", "r2_path": "b"}]}
    errors = stage.validate(params)
    assert any("project_id" in e for e in errors)


def test_validate_empty_fastq_pairs(stage):
    params = {"experiment_id": 1, "project_id": 1, "fastq_pairs": []}
    errors = stage.validate(params)
    assert any("fastq_pairs" in e for e in errors)


def test_validate_missing_pair_fields(stage):
    params = {"experiment_id": 1, "project_id": 1, "fastq_pairs": [{"prefix": "s"}]}
    errors = stage.validate(params)
    assert any("r1_path" in e for e in errors)
    assert any("r2_path" in e for e in errors)


# --- Mock run tests ---


def test_mock_run_creates_files(stage, tmp_fastq_pair):
    """Verify mock_run creates actual files at the expected trimmed output paths."""
    from config import settings

    params = _make_valid_params(tmp_fastq_pair)
    working_dir = Path(settings.STORAGE_ROOT) / "projects"
    job_dir = working_dir / "1" / "1" / "jobs" / "1"

    result = stage.mock_run(job_id=1, params=params, working_dir=working_dir, job_dir=job_dir)

    assert result["status"] == "complete"
    assert len(result["outputs"]) == 1

    output = result["outputs"][0]
    r1_abs = Path(settings.STORAGE_ROOT) / output["r1_path"]
    r2_abs = Path(settings.STORAGE_ROOT) / output["r2_path"]

    assert r1_abs.exists(), f"Trimmed R1 file should exist at {r1_abs}"
    assert r2_abs.exists(), f"Trimmed R2 file should exist at {r2_abs}"
    assert r1_abs.stat().st_size > 0
    assert r2_abs.stat().st_size > 0


def test_mock_run_return_shape(stage, tmp_fastq_pair):
    from config import settings

    params = _make_valid_params(tmp_fastq_pair)
    working_dir = Path(settings.STORAGE_ROOT) / "projects"
    job_dir = working_dir / "1" / "1" / "jobs" / "42"

    result = stage.mock_run(job_id=42, params=params, working_dir=working_dir, job_dir=job_dir)

    assert "status" in result
    assert "outputs" in result
    assert "methods_text" in result
    assert result["job_id"] == 42

    output = result["outputs"][0]
    assert "prefix" in output
    assert "r1_path" in output
    assert "r2_path" in output
    assert "r1_size" in output
    assert "r2_size" in output
    assert "r1_filename" in output
    assert "r2_filename" in output


# --- Methods text test ---


def test_generate_methods_text_includes_params(stage):
    params = {**DEFAULTS}
    text = stage.generate_methods_text(params)

    assert "Trimmomatic" in text
    assert "ILLUMINACLIP" in text
    assert "Truseq3.PE.fa" in text
    assert "2:15:4:4:true" in text
    assert "LEADING:20" in text
    assert "TRAILING:20" in text
    assert "SLIDINGWINDOW:4:15" in text
    assert "MINLEN:25" in text
    assert "42bp" in text
    assert "kseq_test" in text


def test_generate_methods_text_custom_params(stage):
    params = {
        "adapter_file": "NexteraPE-PE.fa",
        "illuminaclip": "3:20:10:8:true",
        "leading": 30,
        "trailing": 30,
        "slidingwindow": "5:20",
        "minlen": 36,
        "kseq_length": 50,
    }
    text = stage.generate_methods_text(params)

    assert "NexteraPE-PE.fa" in text
    assert "3:20:10:8:true" in text
    assert "LEADING:30" in text
    assert "MINLEN:36" in text
    assert "50bp" in text


# --- Concurrency tests ---


def _make_multi_pair_params(storage_root: Path, n_pairs: int = 4) -> dict:
    """Create N FASTQ pairs with stub files and return valid params dict."""
    fastq_content = b"@SEQ_ID\nACGTACGT\n+\nIIIIIIII\n"
    raw_dir = storage_root / "projects" / "1" / "1" / "fastqs" / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    pairs = []
    for i in range(n_pairs):
        name = f"sample_{i}"
        r1 = raw_dir / f"{name}_R1_001.fastq.gz"
        r2 = raw_dir / f"{name}_R2_001.fastq.gz"
        r1.write_bytes(gzip.compress(fastq_content))
        r2.write_bytes(gzip.compress(fastq_content))
        pairs.append(
            {
                "prefix": name,
                "r1_path": f"projects/1/1/fastqs/raw/{name}_R1_001.fastq.gz",
                "r2_path": f"projects/1/1/fastqs/raw/{name}_R2_001.fastq.gz",
                "r1_id": i * 2 + 1,
                "r2_id": i * 2 + 2,
            }
        )

    return {
        "experiment_id": 1,
        "project_id": 1,
        "fastq_pairs": pairs,
    }


@patch("pipelines.trimming.settings")
def test_mock_run_concurrent_correct_results(mock_settings, stage, tmp_path):
    """Multiple pairs concurrently produce all expected outputs."""
    mock_settings.STORAGE_ROOT = str(tmp_path)
    mock_settings.MAX_CONCURRENT_REACTIONS = 4

    params = _make_multi_pair_params(tmp_path, n_pairs=5)
    working_dir = tmp_path / "projects"
    job_dir = tmp_path / "job_1"

    result = stage.mock_run(1, params, working_dir, job_dir)

    assert result["status"] == "complete"
    assert len(result["outputs"]) == 5
    prefixes = {o["prefix"] for o in result["outputs"]}
    assert prefixes == {f"sample_{i}" for i in range(5)}


@patch("pipelines.trimming.settings")
def test_mock_run_output_ordering_deterministic(mock_settings, stage, tmp_path):
    """Outputs follow original pair order, not thread completion order."""
    mock_settings.STORAGE_ROOT = str(tmp_path)
    mock_settings.MAX_CONCURRENT_REACTIONS = 8

    params = _make_multi_pair_params(tmp_path, n_pairs=6)
    working_dir = tmp_path / "projects"
    job_dir = tmp_path / "job_2"

    result = stage.mock_run(2, params, working_dir, job_dir)

    output_prefixes = [o["prefix"] for o in result["outputs"]]
    assert output_prefixes == [f"sample_{i}" for i in range(6)]


@patch("pipelines.trimming.settings")
def test_mock_run_concurrent_faster_than_sequential(mock_settings, stage, tmp_path):
    """Concurrent processing completes faster than N x sleep(1) would sequentially."""
    mock_settings.STORAGE_ROOT = str(tmp_path)
    mock_settings.MAX_CONCURRENT_REACTIONS = 4

    params = _make_multi_pair_params(tmp_path, n_pairs=4)
    working_dir = tmp_path / "projects"
    job_dir = tmp_path / "job_3"

    start = time.time()
    result = stage.mock_run(3, params, working_dir, job_dir)
    elapsed = time.time() - start

    assert result["status"] == "complete"
    # 4 pairs with sleep(1) each, concurrent should finish in ~1-2s, not 4s
    assert elapsed < 3.0


@patch("pipelines.trimming.settings")
def test_mock_run_sequential_equivalence(mock_settings, stage, tmp_path):
    """With MAX_CONCURRENT_REACTIONS=1, output is identical to sequential behavior."""
    mock_settings.STORAGE_ROOT = str(tmp_path)
    mock_settings.MAX_CONCURRENT_REACTIONS = 1

    params = _make_multi_pair_params(tmp_path, n_pairs=3)
    working_dir = tmp_path / "projects"
    job_dir = tmp_path / "job_4"

    result = stage.mock_run(4, params, working_dir, job_dir)

    assert result["status"] == "complete"
    assert len(result["outputs"]) == 3
    # Verify original order preserved
    assert result["outputs"][0]["prefix"] == "sample_0"
    assert result["outputs"][1]["prefix"] == "sample_1"
    assert result["outputs"][2]["prefix"] == "sample_2"
    # Verify all files exist on disk
    for out in result["outputs"]:
        r1 = Path(mock_settings.STORAGE_ROOT) / out["r1_path"]
        r2 = Path(mock_settings.STORAGE_ROOT) / out["r2_path"]
        assert r1.exists()
        assert r2.exists()
