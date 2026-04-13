# backend/tests/test_rnaseq_de_pipeline.py
"""Tests for the RNA-seq DESeq2 differential expression pipeline stage."""

import csv
import json

import pytest

from pipelines.rnaseq_de import (
    _PLOT_TYPES,
    _RESULTS_HEADER,
    RnaseqDEStage,
    _generate_tx2gene,
)


@pytest.fixture
def stage():
    return RnaseqDEStage()


def _make_sample(
    reaction_id: int,
    short_name: str,
    condition: str,
    replicate: int,
    source: str = "salmon",
) -> dict:
    sample = {
        "reaction_id": reaction_id,
        "short_name": short_name,
        "condition": condition,
        "replicate": replicate,
    }
    if source == "salmon":
        sample["salmon_quant_path"] = f"projects/1/1/jobs/10/salmon/{short_name}/quant.sf"
    return sample


def _make_valid_params(source: str = "salmon", **overrides) -> dict:
    params = {
        "experiment_id": 1,
        "project_id": 1,
        "reference_genome": "mm10",
        "alignment_job_id": 10,
        "quantification_source": source,
        "samples": [
            _make_sample(1, "ctrl_rep1", "ctrl", 1, source),
            _make_sample(2, "ctrl_rep2", "ctrl", 2, source),
            _make_sample(3, "mut_rep1", "mut", 1, source),
            _make_sample(4, "mut_rep2", "mut", 2, source),
        ],
    }
    if source == "featurecounts":
        params["count_matrix_path"] = "projects/1/1/jobs/20/results/feature_counts.txt"
    params.update(overrides)
    return params


# ---------------------------------------------------------------------------
# Validation tests
# ---------------------------------------------------------------------------


def test_validate_valid_salmon_params(stage):
    errors = stage.validate(_make_valid_params("salmon"))
    assert errors == []


def test_validate_valid_featurecounts_params(stage):
    errors = stage.validate(_make_valid_params("featurecounts"))
    assert errors == []


def test_validate_missing_experiment_id(stage):
    params = _make_valid_params()
    del params["experiment_id"]
    errors = stage.validate(params)
    assert any("experiment_id" in e for e in errors)


def test_validate_missing_reference_genome(stage):
    params = _make_valid_params()
    del params["reference_genome"]
    errors = stage.validate(params)
    assert any("reference_genome" in e for e in errors)


def test_validate_unsupported_genome(stage):
    params = _make_valid_params(reference_genome="dm6")
    errors = stage.validate(params)
    assert any("Unsupported" in e or "dm6" in e for e in errors)


def test_validate_empty_samples(stage):
    params = _make_valid_params(samples=[])
    errors = stage.validate(params)
    assert any("samples" in e.lower() for e in errors)


def test_validate_insufficient_conditions(stage):
    """Only one condition — need at least 2."""
    params = _make_valid_params(
        samples=[
            _make_sample(1, "ctrl_rep1", "ctrl", 1),
            _make_sample(2, "ctrl_rep2", "ctrl", 2),
            _make_sample(3, "ctrl_rep3", "ctrl", 3),
        ]
    )
    errors = stage.validate(params)
    assert any("2 conditions" in e for e in errors)


def test_validate_insufficient_replicates(stage):
    """Two conditions but one has only 1 replicate."""
    params = _make_valid_params(
        samples=[
            _make_sample(1, "ctrl_rep1", "ctrl", 1),
            _make_sample(2, "ctrl_rep2", "ctrl", 2),
            _make_sample(3, "mut_rep1", "mut", 1),
        ]
    )
    errors = stage.validate(params)
    assert any("2 conditions" in e or "2 replicates" in e for e in errors)


def test_validate_salmon_missing_quant_path(stage):
    params = _make_valid_params("salmon")
    params["samples"][0]["salmon_quant_path"] = ""
    errors = stage.validate(params)
    assert any("salmon_quant_path" in e for e in errors)


def test_validate_featurecounts_missing_matrix(stage):
    params = _make_valid_params("featurecounts")
    del params["count_matrix_path"]
    errors = stage.validate(params)
    assert any("count_matrix_path" in e for e in errors)


def test_validate_invalid_condition_name(stage):
    params = _make_valid_params(
        samples=[
            _make_sample(1, "ctrl_rep1", "ctrl;rm", 1),
            _make_sample(2, "ctrl_rep2", "ctrl;rm", 2),
            _make_sample(3, "mut_rep1", "mut", 1),
            _make_sample(4, "mut_rep2", "mut", 2),
        ]
    )
    errors = stage.validate(params)
    assert any("invalid characters" in e for e in errors)


def test_validate_invalid_reference_condition(stage):
    params = _make_valid_params(reference_condition="nonexistent")
    errors = stage.validate(params)
    assert any("reference_condition" in e for e in errors)


# ---------------------------------------------------------------------------
# Mock run tests
# ---------------------------------------------------------------------------


def test_mock_run_salmon_creates_outputs(stage, tmp_path):
    params = _make_valid_params("salmon")
    result = stage.mock_run(job_id=1, params=params, working_dir=tmp_path, job_dir=tmp_path)

    assert result["status"] == "complete"
    assert result["job_id"] == 1
    assert len(result["outputs"]) > 0

    categories = {o["file_category"] for o in result["outputs"]}
    assert "de_results" in categories
    assert "normalized_counts" in categories
    assert "de_summary" in categories
    assert "de_sample_sheet" in categories
    assert "master_log" in categories
    # 5 plot types x 2 formats = at least volcano_plot, ma_plot, etc.
    assert "volcano_plot" in categories
    assert "ma_plot" in categories
    assert "pca_plot" in categories
    assert "distance_heatmap" in categories
    assert "gene_heatmap" in categories


def test_mock_run_output_categories(stage, tmp_path):
    params = _make_valid_params("salmon")
    result = stage.mock_run(job_id=1, params=params, working_dir=tmp_path, job_dir=tmp_path)

    expected_categories = {
        "de_results",
        "normalized_counts",
        "de_summary",
        "de_sample_sheet",
        "master_log",
        "volcano_plot",
        "ma_plot",
        "pca_plot",
        "distance_heatmap",
        "gene_heatmap",
    }
    actual = {o["file_category"] for o in result["outputs"]}
    assert expected_categories.issubset(actual)


def test_mock_run_results_tsv_columns(stage, tmp_path):
    params = _make_valid_params("salmon")
    stage.mock_run(job_id=1, params=params, working_dir=tmp_path, job_dir=tmp_path)

    tsv_path = tmp_path / "results" / "de_results.tsv"
    assert tsv_path.exists()
    with open(tsv_path) as f:
        reader = csv.reader(f, delimiter="\t")
        header = next(reader)
    assert header == _RESULTS_HEADER


def test_mock_run_summary_json_keys(stage, tmp_path):
    params = _make_valid_params("salmon")
    stage.mock_run(job_id=1, params=params, working_dir=tmp_path, job_dir=tmp_path)

    summary_path = tmp_path / "results" / "de_summary.json"
    assert summary_path.exists()
    summary = json.loads(summary_path.read_text())
    assert "total_genes" in summary
    assert "upregulated" in summary
    assert "downregulated" in summary
    assert "not_significant" in summary
    assert "fdr_threshold" in summary
    assert summary["fdr_threshold"] == 0.05


def test_mock_run_normalized_counts_columns(stage, tmp_path):
    params = _make_valid_params("salmon")
    stage.mock_run(job_id=1, params=params, working_dir=tmp_path, job_dir=tmp_path)

    counts_path = tmp_path / "results" / "normalized_counts.csv"
    assert counts_path.exists()
    with open(counts_path) as f:
        reader = csv.reader(f)
        header = next(reader)
    assert header[0] == "gene_id"
    sample_names = [s["short_name"] for s in params["samples"]]
    assert header[1:] == sample_names


def test_mock_run_svg_stubs_created(stage, tmp_path):
    params = _make_valid_params("salmon")
    stage.mock_run(job_id=1, params=params, working_dir=tmp_path, job_dir=tmp_path)

    plots_dir = tmp_path / "plots"
    for plot_name in _PLOT_TYPES:
        png_file = plots_dir / f"{plot_name}.png"
        svg_file = plots_dir / f"{plot_name}.svg"
        assert png_file.exists(), f"Missing PNG: {plot_name}.png"
        assert svg_file.exists(), f"Missing SVG: {plot_name}.svg"
        assert png_file.stat().st_size > 0, f"Empty PNG: {plot_name}.png"
        assert svg_file.stat().st_size > 0, f"Empty SVG: {plot_name}.svg"


# ---------------------------------------------------------------------------
# Methods text tests
# ---------------------------------------------------------------------------


def test_methods_text_salmon(stage):
    params = _make_valid_params("salmon")
    text = stage.generate_methods_text(params)
    assert "DESeq2" in text
    assert "tximport" in text
    assert "Salmon" in text


def test_methods_text_featurecounts(stage):
    params = _make_valid_params("featurecounts")
    text = stage.generate_methods_text(params)
    assert "DESeq2" in text
    assert "featureCounts" in text


def test_methods_text_includes_genome(stage):
    params = _make_valid_params("salmon")
    text = stage.generate_methods_text(params)
    assert "mm10" in text or "Mouse" in text


# ---------------------------------------------------------------------------
# tx2gene generation test
# ---------------------------------------------------------------------------


def test_generate_tx2gene(tmp_path):
    """Create minimal GTF data and verify tx2gene output."""
    gtf_path = tmp_path / "test.gtf"
    tx1_attrs = (
        'transcript_id "ENSMUST00000193812.1"; '
        'gene_id "ENSMUSG00000102693.1"; '
        'gene_name "4933401J01Rik";'
    )
    tx2_attrs = (
        'transcript_id "ENSMUST00000195335.1"; '
        'gene_id "ENSMUSG00000102693.1"; '
        'gene_name "4933401J01Rik";'
    )
    tx3_attrs = (
        'transcript_id "ENSMUST00000082908.1"; gene_id "ENSMUSG00000064842.1"; gene_name "Gm26206";'
    )
    gene_attrs = 'gene_id "ENSMUSG00000102693.1"; gene_name "4933401J01Rik";'
    exon_attrs = 'transcript_id "ENSMUST00000193812.1"; gene_id "ENSMUSG00000102693.1";'
    gtf_lines = [
        "# comment line\n",
        "#!genome-build GRCm38\n",
        f"chr1\tHAVANA\tgene\t11869\t14409\t.\t+\t.\t{gene_attrs}\n",
        f"chr1\tHAVANA\ttranscript\t11869\t14409\t.\t+\t.\t{tx1_attrs}\n",
        f"chr1\tHAVANA\texon\t11869\t12227\t.\t+\t.\t{exon_attrs}\n",
        f"chr1\tHAVANA\ttranscript\t12613\t14409\t.\t+\t.\t{tx2_attrs}\n",
        f"chr2\tHAVANA\ttranscript\t100000\t200000\t.\t-\t.\t{tx3_attrs}\n",
    ]
    gtf_path.write_text("".join(gtf_lines))

    output_path = tmp_path / "tx2gene.tsv"
    _generate_tx2gene(gtf_path, output_path)

    assert output_path.exists()
    with open(output_path) as f:
        reader = csv.reader(f, delimiter="\t")
        header = next(reader)
        rows = list(reader)

    assert header == ["TXNAME", "GENEID", "GENENAME"]
    assert len(rows) == 3  # 3 transcript lines in the GTF

    # Verify first transcript
    assert rows[0][0] == "ENSMUST00000193812.1"
    assert rows[0][1] == "ENSMUSG00000102693.1"
    assert rows[0][2] == "4933401J01Rik"

    # Verify last transcript (different gene)
    assert rows[2][0] == "ENSMUST00000082908.1"
    assert rows[2][1] == "ENSMUSG00000064842.1"
    assert rows[2][2] == "Gm26206"
