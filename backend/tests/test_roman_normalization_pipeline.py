# backend/tests/test_roman_normalization_pipeline.py
"""Tests for the Roman normalization pipeline module."""

import csv
import io

import pytest

from pipelines.roman_normalization import RomanNormalizationStage


@pytest.fixture()
def stage():
    return RomanNormalizationStage()


def _make_sample(idx: int, short_name: str | None = None) -> dict:
    name = short_name or f"K4me3_sample{idx}"
    return {
        "reaction_id": idx,
        "short_name": name,
        "label": name,
        "bigwig_path": f"projects/1/1/jobs/10/results/{name}.bw",
    }


def _make_valid_params(**overrides) -> dict:
    params = {
        "experiment_id": 1,
        "project_id": 1,
        "parent_job_id": 10,
        "alignment_job_id": 10,
        "reference_genome": "mm10",
        "samples": [
            _make_sample(1, "K4me3_ctrl1"),
            _make_sample(2, "K4me3_ctrl2"),
            _make_sample(3, "K4me3_mut1"),
            _make_sample(4, "K4me3_mut2"),
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


def test_validate_non_mouse_genome_hg38(stage):
    errors = stage.validate(_make_valid_params(reference_genome="hg38"))
    assert any("mouse-only" in e.lower() for e in errors)


def test_validate_non_mouse_genome_hg19(stage):
    errors = stage.validate(_make_valid_params(reference_genome="hg19"))
    assert any("mouse-only" in e.lower() for e in errors)


def test_validate_non_mouse_genome_dm6(stage):
    errors = stage.validate(_make_valid_params(reference_genome="dm6"))
    assert any("mouse-only" in e.lower() for e in errors)


def test_validate_empty_samples(stage):
    errors = stage.validate(_make_valid_params(samples=[]))
    assert any("non-empty" in e for e in errors)


def test_validate_too_few_samples(stage):
    errors = stage.validate(
        _make_valid_params(samples=[_make_sample(1)])
    )
    assert any("at least 2" in e for e in errors)


def test_validate_missing_sample_fields(stage):
    errors = stage.validate(
        _make_valid_params(samples=[{"reaction_id": 1}, {"reaction_id": 2}])
    )
    assert any("missing" in e for e in errors)


def test_validate_valid_minimum_samples(stage):
    """Exactly 2 samples should be valid."""
    errors = stage.validate(
        _make_valid_params(
            samples=[_make_sample(1, "ctrl"), _make_sample(2, "mut")]
        )
    )
    assert errors == []


# ---------------------------------------------------------------------------
# Mock run tests
# ---------------------------------------------------------------------------


def test_mock_run_creates_output_files(stage, tmp_path):
    working_dir = tmp_path / "work"
    job_dir = tmp_path / "job"
    working_dir.mkdir()
    job_dir.mkdir()

    params = _make_valid_params()
    result = stage.mock_run(1, params, working_dir, job_dir)

    assert result["status"] == "complete"
    assert (job_dir / "results").is_dir()
    assert (job_dir / "logs").is_dir()

    # Check normalization factors CSV exists
    factors = job_dir / "results" / "normalization_factors.csv"
    assert factors.exists()

    # Check at least one rnorm.bw exists
    bw_files = list((job_dir / "results").glob("*_rnorm.bw"))
    assert len(bw_files) == len(params["samples"])


def test_mock_run_output_categories(stage, tmp_path):
    working_dir = tmp_path / "work"
    job_dir = tmp_path / "job"
    working_dir.mkdir()
    job_dir.mkdir()

    result = stage.mock_run(1, _make_valid_params(), working_dir, job_dir)
    categories = {o["file_category"] for o in result["outputs"]}

    assert "normalization_bigwig" in categories
    assert "normalization_factors" in categories
    assert "normalization_plot" in categories
    assert "normalization_sample_sheet" in categories
    assert "log" in categories


def test_mock_run_per_reaction_bigwigs(stage, tmp_path):
    working_dir = tmp_path / "work"
    job_dir = tmp_path / "job"
    working_dir.mkdir()
    job_dir.mkdir()

    params = _make_valid_params()
    result = stage.mock_run(1, params, working_dir, job_dir)

    bw_outputs = [
        o for o in result["outputs"] if o["file_category"] == "normalization_bigwig"
    ]
    assert len(bw_outputs) == len(params["samples"])

    # Each should have a reaction_id
    reaction_ids = {o["reaction_id"] for o in bw_outputs}
    expected_ids = {s["reaction_id"] for s in params["samples"]}
    assert reaction_ids == expected_ids


def test_mock_run_normalization_factors_csv(stage, tmp_path):
    working_dir = tmp_path / "work"
    job_dir = tmp_path / "job"
    working_dir.mkdir()
    job_dir.mkdir()

    params = _make_valid_params()
    stage.mock_run(1, params, working_dir, job_dir)

    factors_path = job_dir / "results" / "normalization_factors.csv"
    reader = csv.DictReader(io.StringIO(factors_path.read_text()))
    rows = list(reader)

    assert len(rows) == len(params["samples"])
    assert "SampleName" in reader.fieldnames
    assert "Percentile99" in reader.fieldnames
    assert "NormalizationFactor" in reader.fieldnames

    # First sample should have NF ≈ 1.0
    assert float(rows[0]["NormalizationFactor"]) == pytest.approx(1.0, abs=0.01)


def test_mock_run_file_sizes_positive(stage, tmp_path):
    working_dir = tmp_path / "work"
    job_dir = tmp_path / "job"
    working_dir.mkdir()
    job_dir.mkdir()

    result = stage.mock_run(1, _make_valid_params(), working_dir, job_dir)

    for output in result["outputs"]:
        assert output["file_size_bytes"] > 0, (
            f"{output['filename']} has size 0"
        )


def test_mock_run_png_and_svg(stage, tmp_path):
    working_dir = tmp_path / "work"
    job_dir = tmp_path / "job"
    working_dir.mkdir()
    job_dir.mkdir()

    result = stage.mock_run(1, _make_valid_params(), working_dir, job_dir)

    plot_outputs = [
        o for o in result["outputs"] if o["file_category"] == "normalization_plot"
    ]
    types = {o["file_type"] for o in plot_outputs}
    assert "png" in types
    assert "svg" in types


# ---------------------------------------------------------------------------
# Methods text tests
# ---------------------------------------------------------------------------


def test_methods_text_default(stage):
    text = stage.generate_methods_text(_make_valid_params())
    assert "99th percentile" in text.lower() or "99th-percentile" in text.lower()
    assert "rtracklayer" in text
    assert "mm10" in text
    assert "50 bp" in text
    assert "masked" in text.lower()


def test_methods_text_sample_count(stage):
    params = _make_valid_params()
    text = stage.generate_methods_text(params)
    assert str(len(params["samples"])) in text
