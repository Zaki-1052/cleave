# backend/tests/test_diffbind_pipeline.py
"""Tests for DiffBind pipeline module — validation, mock_run, and methods text."""

import csv
import json

import pytest

from pipelines.diffbind import DiffBindStage


@pytest.fixture
def stage():
    return DiffBindStage()


def _make_sample(
    reaction_id: int,
    short_name: str,
    condition: str,
    replicate: int,
) -> dict:
    return {
        "reaction_id": reaction_id,
        "short_name": short_name,
        "condition": condition,
        "replicate": replicate,
        "bam_path": f"projects/1/1/jobs/10/bams/{short_name}_final.bam",
        "peak_path": f"projects/1/1/jobs/20/peaks/{short_name}_peaks.narrowPeak",
        "peak_caller": "narrow",
    }


def _make_valid_params(**overrides) -> dict:
    params = {
        "experiment_id": 1,
        "project_id": 1,
        "parent_job_id": 20,
        "alignment_job_id": 10,
        "analysis_method": "deseq2_consensus",
        "samples": [
            _make_sample(1, "K4me3_ctrl1", "ctrl", 1),
            _make_sample(2, "K4me3_ctrl2", "ctrl", 2),
            _make_sample(3, "K4me3_mut1", "mut", 1),
            _make_sample(4, "K4me3_mut2", "mut", 2),
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
    params = _make_valid_params(experiment_id=None)
    errors = stage.validate(params)
    assert any("experiment_id" in e for e in errors)


def test_validate_missing_project_id(stage):
    params = _make_valid_params(project_id=None)
    errors = stage.validate(params)
    assert any("project_id" in e for e in errors)


def test_validate_missing_samples(stage):
    params = _make_valid_params(samples=[])
    errors = stage.validate(params)
    assert any("non-empty" in e for e in errors)


def test_validate_too_few_samples(stage):
    params = _make_valid_params(
        samples=[
            _make_sample(1, "s1", "ctrl", 1),
            _make_sample(2, "s2", "mut", 1),
        ]
    )
    errors = stage.validate(params)
    assert any("at least 4" in e for e in errors)


def test_validate_single_condition(stage):
    params = _make_valid_params(
        samples=[
            _make_sample(1, "s1", "ctrl", 1),
            _make_sample(2, "s2", "ctrl", 2),
            _make_sample(3, "s3", "ctrl", 3),
            _make_sample(4, "s4", "ctrl", 4),
        ]
    )
    errors = stage.validate(params)
    assert any("at least 2 conditions" in e for e in errors)


def test_validate_too_few_replicates(stage):
    params = _make_valid_params(
        samples=[
            _make_sample(1, "s1", "ctrl", 1),
            _make_sample(2, "s2", "ctrl", 2),
            _make_sample(3, "s3", "mut", 1),
            _make_sample(4, "s4", "treat", 1),
        ]
    )
    errors = stage.validate(params)
    assert any("only 1 replicate" in e for e in errors)


def test_validate_invalid_analysis_method(stage):
    params = _make_valid_params(analysis_method="invalid_method")
    errors = stage.validate(params)
    assert any("Invalid analysis_method" in e for e in errors)


def test_validate_peaklist_requires_peakset(stage):
    params = _make_valid_params(analysis_method="deseq2_peaklist")
    errors = stage.validate(params)
    assert any("custom_peakset_path" in e for e in errors)


def test_validate_peaklist_with_peakset_ok(stage):
    params = _make_valid_params(
        analysis_method="deseq2_peaklist",
        custom_peakset_path="projects/1/1/jobs/20/peaks/consensus.bed",
    )
    errors = stage.validate(params)
    assert errors == []


def test_validate_unsafe_condition_name(stage):
    params = _make_valid_params(
        samples=[
            _make_sample(1, "s1", "ctrl;rm", 1),
            _make_sample(2, "s2", "ctrl;rm", 2),
            _make_sample(3, "s3", "mut", 1),
            _make_sample(4, "s4", "mut", 2),
        ]
    )
    errors = stage.validate(params)
    assert any("alphanumeric" in e for e in errors)


def test_validate_missing_sample_field(stage):
    samples = [
        _make_sample(1, "s1", "ctrl", 1),
        _make_sample(2, "s2", "ctrl", 2),
        _make_sample(3, "s3", "mut", 1),
        {"reaction_id": 4, "short_name": "s4", "condition": "mut"},
    ]
    params = _make_valid_params(samples=samples)
    errors = stage.validate(params)
    assert any("missing" in e for e in errors)


def test_validate_edger_peaklist_mode(stage):
    params = _make_valid_params(
        analysis_method="edger_peaklist",
        custom_peakset_path="projects/1/1/consensus.bed",
    )
    errors = stage.validate(params)
    assert errors == []


# ---------------------------------------------------------------------------
# Mock run tests
# ---------------------------------------------------------------------------


def test_mock_run_creates_output_files(stage, tmp_path):
    job_dir = tmp_path / "job"
    working_dir = tmp_path / "working"
    working_dir.mkdir()
    params = _make_valid_params()
    result = stage.mock_run(1, params, working_dir, job_dir)

    assert result["status"] == "complete"
    assert len(result["outputs"]) > 0

    output_dir = job_dir / "diffbind_job_1"
    assert output_dir.is_dir()

    # Results TSV
    results_tsv = output_dir / "diffbind_job_1_diffbind_results.txt"
    assert results_tsv.exists()
    with open(results_tsv) as f:
        header = f.readline().strip().split("\t")
    assert "Conc_ctrl" in header
    assert "Conc_mut" in header
    assert "FDR" in header

    # Normalized counts
    counts_csv = output_dir / "diffbind_job_1_normalized_counts.csv"
    assert counts_csv.exists()

    # Plots
    assert (output_dir / "diffbind_job_1_PCA_plot.png").exists()
    assert (output_dir / "diffbind_job_1_PCA_plot.svg").exists()
    assert (output_dir / "diffbind_job_1_MA_plot.png").exists()
    assert (output_dir / "diffbind_job_1_volcano_plot.png").exists()


def test_mock_run_dynamic_column_names(stage, tmp_path):
    """Column names reflect actual condition values from params."""
    job_dir = tmp_path / "job"
    params = _make_valid_params(
        samples=[
            _make_sample(1, "s1", "treated", 1),
            _make_sample(2, "s2", "treated", 2),
            _make_sample(3, "s3", "vehicle", 1),
            _make_sample(4, "s4", "vehicle", 2),
        ]
    )
    stage.mock_run(1, params, tmp_path, job_dir)

    results_tsv = job_dir / "diffbind_job_1" / "diffbind_job_1_diffbind_results.txt"
    with open(results_tsv) as f:
        header = f.readline().strip().split("\t")
    assert "Conc_treated" in header
    assert "Conc_vehicle" in header


def test_mock_run_edger_skips_heatmaps(stage, tmp_path):
    """edgeR mode should not produce heatmap files."""
    job_dir = tmp_path / "job"
    params = _make_valid_params(
        analysis_method="edger_peaklist",
        custom_peakset_path="dummy.bed",
    )
    stage.mock_run(1, params, tmp_path, job_dir)

    output_dir = job_dir / "diffbind_job_1"
    assert not (output_dir / "diffbind_job_1_heatmapgroup_plot.png").exists()
    assert not (output_dir / "diffbind_job_1_heatmapcondition_plot.png").exists()
    # PCA and MA/Volcano should still exist
    assert (output_dir / "diffbind_job_1_PCA_plot.png").exists()
    assert (output_dir / "diffbind_job_1_MA_plot.png").exists()


def test_mock_run_results_columns_json(stage, tmp_path):
    """A results_columns.json file should be written alongside the TSV."""
    job_dir = tmp_path / "job"
    params = _make_valid_params()
    stage.mock_run(1, params, tmp_path, job_dir)

    columns_json = job_dir / "diffbind_job_1" / "results_columns.json"
    assert columns_json.exists()
    columns = json.loads(columns_json.read_text())
    assert isinstance(columns, list)
    assert "FDR" in columns


def test_mock_run_sample_sheet_csv(stage, tmp_path):
    """Sample sheet CSV should have correct DiffBind columns."""
    job_dir = tmp_path / "job"
    params = _make_valid_params()
    stage.mock_run(1, params, tmp_path, job_dir)

    csv_path = job_dir / "sample_sheet.csv"
    assert csv_path.exists()
    with open(csv_path) as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    assert len(rows) == 4
    assert set(reader.fieldnames) == {
        "SampleID",
        "Factor",
        "Condition",
        "Replicate",
        "bamReads",
        "Peaks",
        "PeakCaller",
    }
    assert rows[0]["SampleID"] == "K4me3_ctrl1"
    assert rows[0]["Condition"] == "ctrl"
    assert rows[0]["Replicate"] == "1"


def test_mock_run_output_categories(stage, tmp_path):
    """Verify output file_category values match expected set."""
    job_dir = tmp_path / "job"
    params = _make_valid_params()
    result = stage.mock_run(1, params, tmp_path, job_dir)

    categories = {o["file_category"] for o in result["outputs"]}
    assert "diffbind_results" in categories
    assert "normalized_counts" in categories
    assert "diffbind_plot_pca" in categories
    assert "diffbind_plot_ma" in categories
    assert "diffbind_plot_volcano" in categories
    assert "diffbind_sample_sheet" in categories
    assert "log" in categories


# ---------------------------------------------------------------------------
# Methods text tests
# ---------------------------------------------------------------------------


def test_methods_text_deseq2(stage):
    params = _make_valid_params()
    text = stage.generate_methods_text(params)
    assert "DiffBind" in text
    assert "DESeq2" in text
    assert "consensus" in text.lower()
    assert "ctrl" in text
    assert "mut" in text


def test_methods_text_edger(stage):
    params = _make_valid_params(analysis_method="edger_peaklist")
    text = stage.generate_methods_text(params)
    assert "edgeR" in text
    assert "TMM" in text
    assert "custom" in text.lower()
