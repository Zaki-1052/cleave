# backend/tests/test_rnaseq_feature_counts_pipeline.py
"""Unit tests for the featureCounts pipeline stage.

Covers: validation, mock_run outputs, count matrix format, methods text.
"""

from pathlib import Path

import pytest

from pipelines.rnaseq_alignment import RNASEQ_GENOME_CONFIG
from pipelines.rnaseq_feature_counts import (
    SALMON_LIB_TYPE_TO_STRANDEDNESS,
    FeatureCountsStage,
)


@pytest.fixture
def stage():
    return FeatureCountsStage()


@pytest.fixture
def tmp_bam_files(override_storage_root):
    """Create mock sorted BAM files under STORAGE_ROOT."""
    from config import settings

    bam_dir = Path(settings.STORAGE_ROOT) / "projects" / "1" / "1" / "jobs" / "50" / "bams"
    bam_dir.mkdir(parents=True)

    bam1 = bam_dir / "ctrl_rep1Aligned.sortedByCoord.out.bam"
    bam2 = bam_dir / "mut_rep1Aligned.sortedByCoord.out.bam"
    bam1.write_bytes(b"mock_bam_content")
    bam2.write_bytes(b"mock_bam_content")

    return {
        "ctrl_bam": "projects/1/1/jobs/50/bams/ctrl_rep1Aligned.sortedByCoord.out.bam",
        "mut_bam": "projects/1/1/jobs/50/bams/mut_rep1Aligned.sortedByCoord.out.bam",
    }


def _make_valid_params(tmp_bam_files):
    return {
        "experiment_id": 1,
        "project_id": 1,
        "reference_genome": "mm10",
        "alignment_job_id": 50,
        "strandedness": 2,
        "reactions": [
            {
                "reaction_id": 1,
                "short_name": "ctrl_rep1",
                "bam_path": tmp_bam_files["ctrl_bam"],
            },
        ],
    }


# ---------------------------------------------------------------------------
# Validation tests
# ---------------------------------------------------------------------------


def test_validate_valid_params(stage, tmp_bam_files):
    """No errors for complete and valid params."""
    params = _make_valid_params(tmp_bam_files)
    errors = stage.validate(params)
    assert errors == []


def test_validate_missing_experiment_id(stage):
    """Error for missing experiment_id."""
    errors = stage.validate(
        {
            "project_id": 1,
            "reference_genome": "mm10",
            "alignment_job_id": 50,
            "strandedness": 0,
            "reactions": [],
        }
    )
    assert any("experiment_id" in e for e in errors)


def test_validate_missing_reference_genome(stage):
    """Error for missing reference_genome."""
    errors = stage.validate(
        {
            "experiment_id": 1,
            "project_id": 1,
            "alignment_job_id": 50,
            "strandedness": 0,
            "reactions": [{"reaction_id": 1, "short_name": "s1", "bam_path": "x"}],
        }
    )
    assert any("reference_genome" in e for e in errors)


def test_validate_unsupported_genome(stage):
    """dm6 not in RNASEQ_GENOME_CONFIG — error for no RNA-seq index."""
    params = {
        "experiment_id": 1,
        "project_id": 1,
        "reference_genome": "dm6",
        "alignment_job_id": 50,
        "strandedness": 0,
        "reactions": [{"reaction_id": 1, "short_name": "s1", "bam_path": "x"}],
    }
    errors = stage.validate(params)
    assert any("RNA-seq index" in e or "No RNA-seq" in e for e in errors)
    assert "dm6" not in RNASEQ_GENOME_CONFIG


def test_validate_invalid_strandedness(stage):
    """Error for strandedness not in {0, 1, 2}."""
    params = {
        "experiment_id": 1,
        "project_id": 1,
        "reference_genome": "mm10",
        "alignment_job_id": 50,
        "strandedness": 3,
        "reactions": [{"reaction_id": 1, "short_name": "s1", "bam_path": "x"}],
    }
    errors = stage.validate(params)
    assert any("strandedness" in e.lower() for e in errors)


def test_validate_empty_reactions(stage):
    """Error for empty reactions list."""
    params = {
        "experiment_id": 1,
        "project_id": 1,
        "reference_genome": "mm10",
        "alignment_job_id": 50,
        "strandedness": 0,
        "reactions": [],
    }
    errors = stage.validate(params)
    assert any("reactions" in e for e in errors)


def test_validate_missing_bam_path(stage):
    """Error for reaction missing bam_path."""
    params = {
        "experiment_id": 1,
        "project_id": 1,
        "reference_genome": "mm10",
        "alignment_job_id": 50,
        "strandedness": 0,
        "reactions": [{"reaction_id": 1, "short_name": "s1"}],
    }
    errors = stage.validate(params)
    assert any("bam_path" in e for e in errors)


# ---------------------------------------------------------------------------
# Mock run tests
# ---------------------------------------------------------------------------


def test_mock_run_produces_outputs(stage, tmp_bam_files, override_storage_root):
    """Mock run creates count_matrix, count_summary, and master_log outputs."""
    from config import settings

    params = _make_valid_params(tmp_bam_files)
    working_dir = Path(settings.STORAGE_ROOT) / "projects" / "1" / "1"
    job_dir = working_dir / "jobs" / "99"

    result = stage.mock_run(99, params, working_dir, job_dir)

    assert result["status"] == "complete"
    assert len(result["outputs"]) == 3

    categories = {o["file_category"] for o in result["outputs"]}
    assert "count_matrix" in categories
    assert "count_summary" in categories
    assert "master_log" in categories

    # Verify files on disk
    assert (job_dir / "results" / "feature_counts.txt").exists()
    assert (job_dir / "results" / "feature_counts.txt.summary").exists()


def test_mock_run_count_matrix_has_correct_columns(stage, tmp_bam_files, override_storage_root):
    """Mock count matrix has correct column count matching reactions."""
    from config import settings

    params = _make_valid_params(tmp_bam_files)
    working_dir = Path(settings.STORAGE_ROOT) / "projects" / "1" / "1"
    job_dir = working_dir / "jobs" / "100"

    stage.mock_run(100, params, working_dir, job_dir)

    counts_file = job_dir / "results" / "feature_counts.txt"
    lines = counts_file.read_text().strip().split("\n")

    # Skip comment lines (start with #)
    data_lines = [ln for ln in lines if not ln.startswith("#")]
    header = data_lines[0].split("\t")

    # Header: Geneid, Chr, Start, End, Strand, Length, <sample_columns...>
    assert header[0] == "Geneid"
    assert header[5] == "Length"
    # One sample column for the single reaction
    sample_columns = header[6:]
    assert len(sample_columns) == 1
    assert sample_columns[0] == "ctrl_rep1"


def test_mock_run_multiple_reactions(stage, override_storage_root):
    """Mock run with 3 reactions produces correct count matrix columns."""
    from config import settings

    # Create mock BAMs
    bam_dir = Path(settings.STORAGE_ROOT) / "projects" / "1" / "1" / "jobs" / "50" / "bams"
    bam_dir.mkdir(parents=True)
    for name in ["ctrl1", "ctrl2", "mut1"]:
        (bam_dir / f"{name}.bam").write_bytes(b"mock_bam")

    params = {
        "experiment_id": 1,
        "project_id": 1,
        "reference_genome": "hg38",
        "alignment_job_id": 50,
        "strandedness": 0,
        "reactions": [
            {
                "reaction_id": 1,
                "short_name": "ctrl1",
                "bam_path": "projects/1/1/jobs/50/bams/ctrl1.bam",
            },
            {
                "reaction_id": 2,
                "short_name": "ctrl2",
                "bam_path": "projects/1/1/jobs/50/bams/ctrl2.bam",
            },
            {
                "reaction_id": 3,
                "short_name": "mut1",
                "bam_path": "projects/1/1/jobs/50/bams/mut1.bam",
            },
        ],
    }

    working_dir = Path(settings.STORAGE_ROOT) / "projects" / "1" / "1"
    job_dir = working_dir / "jobs" / "101"

    result = stage.mock_run(101, params, working_dir, job_dir)

    assert result["status"] == "complete"

    # Parse count matrix header
    counts_file = job_dir / "results" / "feature_counts.txt"
    lines = counts_file.read_text().strip().split("\n")
    data_lines = [ln for ln in lines if not ln.startswith("#")]
    header = data_lines[0].split("\t")
    sample_columns = header[6:]

    assert len(sample_columns) == 3
    assert sample_columns == ["ctrl1", "ctrl2", "mut1"]

    # Gene IDs should use ENSG prefix for hg38
    first_gene_line = data_lines[1].split("\t")
    assert first_gene_line[0].startswith("ENSG")


# ---------------------------------------------------------------------------
# Methods text tests
# ---------------------------------------------------------------------------


def test_methods_text_contains_featurecounts(stage, tmp_bam_files):
    """Methods text mentions featureCounts."""
    params = _make_valid_params(tmp_bam_files)
    text = stage.generate_methods_text(params)

    assert "featureCounts" in text
    assert "Subread" in text


def test_methods_text_contains_genome(stage, tmp_bam_files):
    """Methods text includes genome and annotation version."""
    params = _make_valid_params(tmp_bam_files)
    text = stage.generate_methods_text(params)

    assert "mm10" in text
    assert "GENCODE" in text or "gencode" in text


# ---------------------------------------------------------------------------
# Salmon library type mapping test
# ---------------------------------------------------------------------------


def test_salmon_library_type_mapping():
    """Verify Salmon library type to strandedness mapping."""
    assert SALMON_LIB_TYPE_TO_STRANDEDNESS["ISR"] == 2
    assert SALMON_LIB_TYPE_TO_STRANDEDNESS["ISF"] == 1
    assert SALMON_LIB_TYPE_TO_STRANDEDNESS["IU"] == 0
    assert SALMON_LIB_TYPE_TO_STRANDEDNESS["unknown"] == 0
    assert SALMON_LIB_TYPE_TO_STRANDEDNESS["SR"] == 2
    assert SALMON_LIB_TYPE_TO_STRANDEDNESS["SF"] == 1
    assert SALMON_LIB_TYPE_TO_STRANDEDNESS["U"] == 0
