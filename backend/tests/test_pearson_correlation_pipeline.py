# backend/tests/test_pearson_correlation_pipeline.py
"""Tests for Pearson correlation pipeline module — validation, mock_run, and methods text."""

import csv
import io

import pytest

from pipelines.pearson_correlation import PearsonCorrelationStage


@pytest.fixture
def stage():
    return PearsonCorrelationStage()


def _make_sample(reaction_id: int, short_name: str, label: str) -> dict:
    return {
        "reaction_id": reaction_id,
        "short_name": short_name,
        "label": label,
        "bigwig_path": f"projects/1/1/jobs/10/bigwigs/{short_name}.bw",
    }


def _make_valid_params(**overrides) -> dict:
    params = {
        "experiment_id": 1,
        "project_id": 1,
        "parent_job_id": 10,
        "alignment_job_id": 10,
        "reference_genome": "mm10",
        "samples": [
            _make_sample(1, "K4me3_ctrl1", "H3K4me3 ctrl 1"),
            _make_sample(2, "K4me3_ctrl2", "H3K4me3 ctrl 2"),
            _make_sample(3, "K4me3_mut1", "H3K4me3 mut 1"),
            _make_sample(4, "K4me3_mut2", "H3K4me3 mut 2"),
        ],
    }
    params.update(overrides)
    return params


# ---------------------------------------------------------------------------
# Validation tests
# ---------------------------------------------------------------------------


def test_validate_valid_params(stage):
    errors = stage.validate(_make_valid_params())
    assert errors == []


def test_validate_missing_experiment_id(stage):
    errors = stage.validate(_make_valid_params(experiment_id=None))
    assert any("experiment_id" in e for e in errors)


def test_validate_missing_project_id(stage):
    errors = stage.validate(_make_valid_params(project_id=None))
    assert any("project_id" in e for e in errors)


def test_validate_missing_reference_genome(stage):
    errors = stage.validate(_make_valid_params(reference_genome=""))
    assert any("reference_genome" in e for e in errors)


def test_validate_invalid_genome(stage):
    errors = stage.validate(_make_valid_params(reference_genome="mm9"))
    assert any("reference_genome" in e for e in errors)
    assert any("mm9" in e for e in errors)


def test_validate_empty_samples(stage):
    errors = stage.validate(_make_valid_params(samples=[]))
    assert any("non-empty" in e for e in errors)


def test_validate_too_few_samples(stage):
    errors = stage.validate(_make_valid_params(samples=[_make_sample(1, "K4me3_ctrl1", "ctrl1")]))
    assert any("at least 2" in e for e in errors)


def test_validate_missing_sample_fields(stage):
    bad_sample = {"reaction_id": 1}
    errors = stage.validate(_make_valid_params(samples=[bad_sample, bad_sample]))
    assert any("short_name" in e for e in errors)
    assert any("label" in e for e in errors)
    assert any("bigwig_path" in e for e in errors)


def test_validate_valid_with_optional_bed(stage):
    errors = stage.validate(
        _make_valid_params(restrict_bed_path="projects/1/1/jobs/20/peaks/summits.bed")
    )
    assert errors == []


def test_validate_valid_human_genome(stage):
    errors = stage.validate(_make_valid_params(reference_genome="hg38"))
    assert errors == []


# ---------------------------------------------------------------------------
# Mock run tests
# ---------------------------------------------------------------------------


def test_mock_run_creates_output_files(stage, tmp_path):
    job_dir = tmp_path / "job"
    working_dir = tmp_path / "working"
    params = _make_valid_params()
    result = stage.mock_run(1, params, working_dir, job_dir)

    assert result["status"] == "complete"
    assert len(result["outputs"]) > 0
    for out in result["outputs"]:
        filename = out["filename"]
        if out["file_category"] == "log":
            assert (job_dir / "logs" / filename).exists()
        elif out["file_category"] == "pearson_sample_sheet":
            assert (job_dir / filename).exists()
        else:
            assert (job_dir / "results" / filename).exists()


def test_mock_run_output_categories(stage, tmp_path):
    job_dir = tmp_path / "job"
    working_dir = tmp_path / "working"
    result = stage.mock_run(1, _make_valid_params(), working_dir, job_dir)

    categories = {o["file_category"] for o in result["outputs"]}
    assert "pearson_heatmap" in categories
    assert "pearson_matrix" in categories
    assert "pearson_correlation" in categories
    assert "pearson_sample_sheet" in categories
    assert "log" in categories


def test_mock_run_png_and_svg(stage, tmp_path):
    job_dir = tmp_path / "job"
    working_dir = tmp_path / "working"
    result = stage.mock_run(1, _make_valid_params(), working_dir, job_dir)

    heatmap_outputs = [o for o in result["outputs"] if o["file_category"] == "pearson_heatmap"]
    types = {o["file_type"] for o in heatmap_outputs}
    assert "png" in types
    assert "svg" in types


def test_mock_run_coverage_csv_has_sample_columns(stage, tmp_path):
    job_dir = tmp_path / "job"
    working_dir = tmp_path / "working"
    params = _make_valid_params()
    result = stage.mock_run(1, params, working_dir, job_dir)

    cov_outs = [o for o in result["outputs"] if o["file_category"] == "pearson_matrix"]
    assert len(cov_outs) == 1
    cov_file = job_dir / "results" / cov_outs[0]["filename"]
    reader = csv.reader(io.StringIO(cov_file.read_text()))
    header = next(reader)
    labels = [s["label"] for s in params["samples"]]
    for label in labels:
        assert label in header


def test_mock_run_correlation_csv_is_square(stage, tmp_path):
    job_dir = tmp_path / "job"
    working_dir = tmp_path / "working"
    params = _make_valid_params()
    n_samples = len(params["samples"])
    result = stage.mock_run(1, params, working_dir, job_dir)

    corr_outs = [o for o in result["outputs"] if o["file_category"] == "pearson_correlation"]
    assert len(corr_outs) == 1
    corr_file = job_dir / "results" / corr_outs[0]["filename"]
    reader = csv.reader(io.StringIO(corr_file.read_text()))
    header = next(reader)
    # First col is index label, then N sample columns
    assert len(header) == n_samples + 1
    rows = list(reader)
    assert len(rows) == n_samples


def test_mock_run_file_sizes_positive(stage, tmp_path):
    job_dir = tmp_path / "job"
    working_dir = tmp_path / "working"
    result = stage.mock_run(1, _make_valid_params(), working_dir, job_dir)

    for out in result["outputs"]:
        assert out["file_size_bytes"] > 0, f"{out['filename']} has zero size"


# ---------------------------------------------------------------------------
# Methods text tests
# ---------------------------------------------------------------------------


def test_methods_text_default_mm10(stage):
    text = stage.generate_methods_text(_make_valid_params())
    assert "Pearson" in text
    assert "rtracklayer" in text
    assert "50 bp" in text
    assert "seaborn" in text
    assert "4 samples" in text
    assert "masked" in text.lower()


def test_methods_text_human_no_masking(stage):
    text = stage.generate_methods_text(_make_valid_params(reference_genome="hg38"))
    assert "Pearson" in text
    assert "hg38" in text.lower() or "Human" in text
    assert "masked" not in text.lower()


def test_methods_text_with_bed_restriction(stage):
    text = stage.generate_methods_text(
        _make_valid_params(
            restrict_bed_path="some/path.bed",
            restrict_bed_label="H3K4me3 peaks",
        )
    )
    assert "H3K4me3 peaks" in text
