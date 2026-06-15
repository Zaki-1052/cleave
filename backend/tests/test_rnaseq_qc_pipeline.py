# backend/tests/test_rnaseq_qc_pipeline.py
"""Unit tests for the RNA-seq QC pipeline (RSeQC + MultiQC).

Covers: validation, mock_run outputs, RSeQC output parsing, methods text.
"""

from pathlib import Path

import pytest

from pipelines.rnaseq_qc import (
    RSEQC_BED_CONFIG,
    RnaseqQCStage,
    _parse_infer_experiment,
    _parse_read_distribution,
    _write_rseqc_metrics_csv,
)


@pytest.fixture
def stage():
    return RnaseqQCStage()


@pytest.fixture
def tmp_bam_file(override_storage_root):
    """Create a stub BAM file under STORAGE_ROOT for validation tests."""
    from config import settings

    bam_dir = Path(settings.STORAGE_ROOT) / "projects" / "1" / "1" / "jobs" / "10" / "bams"
    bam_dir.mkdir(parents=True)
    bam_path = bam_dir / "ctrl_rep1Aligned.sortedByCoord.out.bam"
    bam_path.write_bytes(b"")
    return {
        "bam_abs": bam_path,
        "bam_rel": "projects/1/1/jobs/10/bams/ctrl_rep1Aligned.sortedByCoord.out.bam",
    }


def _make_valid_params(tmp_bam_file=None):
    bam_path = tmp_bam_file["bam_rel"] if tmp_bam_file else "projects/1/1/jobs/10/bams/sample.bam"
    return {
        "experiment_id": 1,
        "project_id": 1,
        "reference_genome": "mm10",
        "alignment_job_id": 10,
        "reactions": [
            {
                "reaction_id": 1,
                "short_name": "ctrl_rep1",
                "bam_path": bam_path,
            },
        ],
    }


# ---------------------------------------------------------------------------
# Validation tests
# ---------------------------------------------------------------------------


def test_validate_valid_params(stage, tmp_bam_file):
    params = _make_valid_params(tmp_bam_file)
    errors = stage.validate(params)
    assert errors == []


def test_validate_missing_experiment_id(stage):
    errors = stage.validate(
        {"project_id": 1, "reference_genome": "mm10", "alignment_job_id": 10, "reactions": []}
    )
    assert any("experiment_id" in e for e in errors)


def test_validate_missing_reference_genome(stage):
    errors = stage.validate(
        {"experiment_id": 1, "project_id": 1, "alignment_job_id": 10, "reactions": []}
    )
    assert any("reference_genome" in e for e in errors)


def test_validate_unsupported_genome(stage):
    params = {
        "experiment_id": 1,
        "project_id": 1,
        "reference_genome": "dm6",
        "alignment_job_id": 10,
        "reactions": [{"reaction_id": 1, "short_name": "s1", "bam_path": "x.bam"}],
    }
    errors = stage.validate(params)
    assert any("Unsupported" in e or "dm6" in e for e in errors)
    assert "dm6" not in RSEQC_BED_CONFIG


def test_validate_missing_alignment_job_id(stage):
    errors = stage.validate(
        {"experiment_id": 1, "project_id": 1, "reference_genome": "mm10", "reactions": []}
    )
    assert any("alignment_job_id" in e for e in errors)


def test_validate_empty_reactions(stage):
    params = {
        "experiment_id": 1,
        "project_id": 1,
        "reference_genome": "mm10",
        "alignment_job_id": 10,
        "reactions": [],
    }
    errors = stage.validate(params)
    assert any("reaction" in e.lower() for e in errors)


def test_validate_missing_bam_path(stage):
    params = {
        "experiment_id": 1,
        "project_id": 1,
        "reference_genome": "mm10",
        "alignment_job_id": 10,
        "reactions": [{"reaction_id": 1, "short_name": "s1"}],
    }
    errors = stage.validate(params)
    assert any("bam_path" in e for e in errors)


# ---------------------------------------------------------------------------
# Mock run tests
# ---------------------------------------------------------------------------


def test_mock_run_creates_expected_outputs(stage, tmp_bam_file, override_storage_root):
    from config import settings

    params = _make_valid_params(tmp_bam_file)
    working_dir = Path(settings.STORAGE_ROOT) / "projects" / "1" / "1"
    job_dir = working_dir / "jobs" / "99"

    result = stage.mock_run(99, params, working_dir, job_dir)

    assert result["status"] == "complete"
    assert len(result["outputs"]) > 0

    categories = {o["file_category"] for o in result["outputs"]}
    assert "rseqc_infer_experiment" in categories
    assert "rseqc_read_distribution" in categories
    assert "rseqc_genebody_coverage" in categories
    assert "rseqc_inner_distance" in categories
    assert "rseqc_junction_saturation" in categories
    assert "multiqc_report" in categories
    assert "rseqc_metrics" in categories
    assert "master_log" in categories


def test_mock_run_correct_file_categories(stage, tmp_bam_file, override_storage_root):
    from config import settings

    params = _make_valid_params(tmp_bam_file)
    working_dir = Path(settings.STORAGE_ROOT) / "projects" / "1" / "1"
    job_dir = working_dir / "jobs" / "99"

    result = stage.mock_run(99, params, working_dir, job_dir)

    expected = {
        "rseqc_infer_experiment",
        "rseqc_read_distribution",
        "rseqc_genebody_coverage",
        "rseqc_inner_distance",
        "rseqc_junction_saturation",
        "multiqc_report",
        "rseqc_metrics",
        "master_log",
    }
    actual = {o["file_category"] for o in result["outputs"]}
    assert expected.issubset(actual)


def test_mock_run_multiple_reactions(stage, override_storage_root):
    from config import settings

    params = {
        "experiment_id": 1,
        "project_id": 1,
        "reference_genome": "mm10",
        "alignment_job_id": 10,
        "reactions": [
            {"reaction_id": 1, "short_name": "ctrl_rep1", "bam_path": "x.bam"},
            {"reaction_id": 2, "short_name": "ctrl_rep2", "bam_path": "y.bam"},
            {"reaction_id": 3, "short_name": "mut_rep1", "bam_path": "z.bam"},
        ],
    }
    working_dir = Path(settings.STORAGE_ROOT) / "projects" / "1" / "1"
    job_dir = working_dir / "jobs" / "99"

    result = stage.mock_run(99, params, working_dir, job_dir)

    assert result["status"] == "complete"
    assert len(result["qc_metrics"]) == 3
    per_reaction_outputs = [o for o in result["outputs"] if o.get("reaction_id") is not None]
    shared_outputs = [o for o in result["outputs"] if o.get("reaction_id") is None]
    assert len(per_reaction_outputs) >= 3 * 5
    assert len(shared_outputs) >= 3


# ---------------------------------------------------------------------------
# Parser tests
# ---------------------------------------------------------------------------


def test_parse_infer_experiment():
    stdout = (
        "This is PairEnd Data\n"
        "Fraction of reads failed to determine: 0.0112\n"
        'Fraction of reads explained by "1++,1--,2+-,2-+": 0.4756\n'
        'Fraction of reads explained by "1+-,1-+,2++,2--": 0.5132\n'
    )
    result = _parse_infer_experiment(stdout)

    assert result["fraction_sense"] == 0.4756
    assert result["fraction_antisense"] == 0.5132
    assert result["fraction_undetermined"] == 0.0112
    assert result["inferred_strandedness"] == "unstranded"


def test_parse_infer_experiment_stranded():
    stdout = (
        "Fraction of reads failed to determine: 0.02\n"
        'Fraction of reads explained by "1++,1--,2+-,2-+": 0.92\n'
        'Fraction of reads explained by "1+-,1-+,2++,2--": 0.06\n'
    )
    result = _parse_infer_experiment(stdout)

    assert result["inferred_strandedness"] == "RF"
    assert result["fraction_sense"] == 0.92


def test_parse_read_distribution():
    stdout = (
        "Module\tread_distribution.py\n"
        "Group\tTag_count\tTags/Kb\n"
        "===================================\n"
        "CDS_Exons\t2817489\t120.5\n"
        "5'UTR_Exons\t120345\t8.2\n"
        "3'UTR_Exons\t456789\t25.1\n"
        "Introns\t1234567\t5.3\n"
        "Intergenic_regions\t345678\t1.2\n"
        "===================================\n"
    )
    result = _parse_read_distribution(stdout)

    assert result["cds_exons_tags"] == 2817489
    assert result["five_utr_exons_tags"] == 120345
    assert result["three_utr_exons_tags"] == 456789
    assert result["intron_tags"] == 1234567
    assert result["intergenic_tags"] == 345678


def test_metrics_csv_roundtrip(tmp_path):
    import csv

    metrics = [
        {
            "short_name": "ctrl_rep1",
            "fraction_sense": 0.475,
            "fraction_antisense": 0.513,
            "fraction_undetermined": 0.012,
            "inferred_strandedness": "unstranded",
            "cds_exons_tags": 2817489,
            "five_utr_exons_tags": 120345,
            "three_utr_exons_tags": 456789,
            "intron_tags": 1234567,
            "intergenic_tags": 345678,
            "coverage_skewness": 1.02,
            "inner_distance_mean": 145.5,
            "inner_distance_sd": 22.3,
        }
    ]

    csv_path = tmp_path / "rseqc_metrics.csv"
    _write_rseqc_metrics_csv(metrics, csv_path)

    assert csv_path.exists()
    with open(csv_path) as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    assert len(rows) == 1
    assert rows[0]["Short_Name"] == "ctrl_rep1"
    assert float(rows[0]["Fraction_Sense"]) == 0.475
    assert int(float(rows[0]["CDS_Exons_Tags"])) == 2817489
    assert float(rows[0]["Coverage_Skewness"]) == 1.02


# ---------------------------------------------------------------------------
# Methods text tests
# ---------------------------------------------------------------------------


def test_methods_text_mentions_rseqc(stage, tmp_bam_file):
    params = _make_valid_params(tmp_bam_file)
    text = stage.generate_methods_text(params)
    assert "RSeQC" in text
    assert "infer_experiment" in text
    assert "read_distribution" in text


def test_methods_text_mentions_multiqc(stage, tmp_bam_file):
    params = _make_valid_params(tmp_bam_file)
    text = stage.generate_methods_text(params)
    assert "MultiQC" in text
