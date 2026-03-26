# backend/tests/test_trimming_pipeline.py
"""Unit tests for the trimming pipeline module."""

import gzip
from pathlib import Path

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

    result = stage.mock_run(job_id=1, params=params, working_dir=working_dir)

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

    result = stage.mock_run(job_id=42, params=params, working_dir=working_dir)

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
