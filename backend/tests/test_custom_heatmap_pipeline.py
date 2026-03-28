# backend/tests/test_custom_heatmap_pipeline.py
"""Tests for custom heatmap pipeline module — validation, mock_run, and methods text."""

import gzip

import pytest

from pipelines.custom_heatmap import CustomHeatmapStage


@pytest.fixture
def stage():
    return CustomHeatmapStage()


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
        "bed_path": "projects/1/1/jobs/20/peaks/summits.bed",
        "bed_source": "peak_calling",
        "bed_label": "H3K4me3 summits",
        "samples": [
            _make_sample(1, "K4me3_ctrl1", "h3k4me3_ctrl"),
            _make_sample(2, "K4me3_mut1", "h3k4me3_mut"),
            _make_sample(3, "K4me3_ctrl2", "h3k4me3_ctrl"),
            _make_sample(4, "K4me3_mut2", "h3k4me3_mut"),
        ],
        "flanking_upstream": 1500,
        "flanking_downstream": 1500,
        "reference_point": "center",
        "sort_order": "descend",
        "color_map": None,
        "z_min": None,
        "z_max": None,
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


def test_validate_missing_bed_path(stage):
    errors = stage.validate(_make_valid_params(bed_path=""))
    assert any("bed_path" in e for e in errors)


def test_validate_empty_samples(stage):
    errors = stage.validate(_make_valid_params(samples=[]))
    assert any("non-empty" in e for e in errors)


def test_validate_missing_sample_fields(stage):
    bad_sample = {"reaction_id": 1}
    errors = stage.validate(_make_valid_params(samples=[bad_sample]))
    assert any("short_name" in e for e in errors)
    assert any("label" in e for e in errors)
    assert any("bigwig_path" in e for e in errors)


def test_validate_flanking_too_small(stage):
    errors = stage.validate(_make_valid_params(flanking_upstream=50))
    assert any("flanking_upstream" in e for e in errors)


def test_validate_flanking_too_large(stage):
    errors = stage.validate(_make_valid_params(flanking_downstream=20000))
    assert any("flanking_downstream" in e for e in errors)


def test_validate_invalid_sort_order(stage):
    errors = stage.validate(_make_valid_params(sort_order="random"))
    assert any("sort_order" in e for e in errors)


def test_validate_invalid_reference_point(stage):
    errors = stage.validate(_make_valid_params(reference_point="start"))
    assert any("reference_point" in e for e in errors)


def test_validate_valid_with_optional_color_map(stage):
    errors = stage.validate(_make_valid_params(color_map="RdYlBu_r"))
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
    # Verify all output files exist on disk
    for out in result["outputs"]:
        filename = out["filename"]
        if out["file_category"] == "log":
            assert (job_dir / "logs" / filename).exists()
        else:
            assert (job_dir / "results" / filename).exists()


def test_mock_run_output_categories(stage, tmp_path):
    job_dir = tmp_path / "job"
    working_dir = tmp_path / "working"
    result = stage.mock_run(1, _make_valid_params(), working_dir, job_dir)

    categories = {o["file_category"] for o in result["outputs"]}
    assert "custom_heatmap_plot" in categories
    assert "custom_heatmap_matrix" in categories
    assert "custom_heatmap_bed" in categories
    assert "log" in categories


def test_mock_run_png_and_svg(stage, tmp_path):
    job_dir = tmp_path / "job"
    working_dir = tmp_path / "working"
    result = stage.mock_run(1, _make_valid_params(), working_dir, job_dir)

    plot_outputs = [o for o in result["outputs"] if o["file_category"] == "custom_heatmap_plot"]
    types = {o["file_type"] for o in plot_outputs}
    assert "png" in types
    assert "svg" in types


def test_mock_run_matrix_is_valid_gzip(stage, tmp_path):
    job_dir = tmp_path / "job"
    working_dir = tmp_path / "working"
    result = stage.mock_run(1, _make_valid_params(), working_dir, job_dir)

    matrix_outs = [o for o in result["outputs"] if o["file_category"] == "custom_heatmap_matrix"]
    assert len(matrix_outs) == 1
    matrix_file = job_dir / "results" / matrix_outs[0]["filename"]
    # Verify it's valid gzip
    with gzip.open(matrix_file, "rb") as f:
        content = f.read()
    assert len(content) > 0


def test_mock_run_file_sizes_positive(stage, tmp_path):
    job_dir = tmp_path / "job"
    working_dir = tmp_path / "working"
    result = stage.mock_run(1, _make_valid_params(), working_dir, job_dir)

    for out in result["outputs"]:
        assert out["file_size_bytes"] > 0, f"{out['filename']} has zero size"


# ---------------------------------------------------------------------------
# Methods text tests
# ---------------------------------------------------------------------------


def test_methods_text_default_params(stage):
    text = stage.generate_methods_text(_make_valid_params())
    assert "deepTools" in text
    assert "reference-point" in text
    assert "center" in text
    assert "1500" in text
    assert "4 samples" in text


def test_methods_text_custom_params(stage):
    params = _make_valid_params(
        flanking_upstream=2000,
        flanking_downstream=3000,
        reference_point="TSS",
        sort_order="ascend",
        color_map="viridis",
    )
    text = stage.generate_methods_text(params)
    assert "2000" in text
    assert "3000" in text
    assert "TSS" in text
    assert "--sortRegions ascend" in text
    assert "--colorMap viridis" in text
