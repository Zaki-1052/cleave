# backend/tests/test_rnaseq_alignment_pipeline.py
"""Unit tests for the RNA-seq alignment pipeline (STAR + Salmon + BigWig).

Covers: validation, mock_run outputs, QC metric parsing, methods text.
"""

import gzip
import json
from pathlib import Path

import pytest

from pipelines.rnaseq_alignment import (
    RNASEQ_GENOME_CONFIG,
    RnaseqAlignmentStage,
    _parse_salmon_meta,
    _parse_star_log,
)


@pytest.fixture
def stage():
    return RnaseqAlignmentStage()


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
        "reference_genome": "mm10",
        "remove_duplicates": False,
        "bam_coverage_bin_size": 20,
        "smoothed_bin_size": 100,
        "reactions": [
            {
                "reaction_id": 1,
                "short_name": "ctrl_rep1",
                "r1_path": tmp_fastq_pair["r1_rel"],
                "r2_path": tmp_fastq_pair["r2_rel"],
            },
        ],
    }


# ---------------------------------------------------------------------------
# Validation tests
# ---------------------------------------------------------------------------


def test_validate_valid_params(stage, tmp_fastq_pair):
    """No errors for complete and valid params."""
    params = _make_valid_params(tmp_fastq_pair)
    errors = stage.validate(params)
    assert errors == []


def test_validate_missing_experiment_id(stage):
    """Error for missing experiment_id."""
    errors = stage.validate({"project_id": 1, "reference_genome": "mm10", "reactions": []})
    assert any("experiment_id" in e for e in errors)


def test_validate_missing_reference_genome(stage):
    """Error for missing reference_genome."""
    errors = stage.validate({"experiment_id": 1, "project_id": 1, "reactions": []})
    assert any("reference_genome" in e for e in errors)


def test_validate_unsupported_genome(stage):
    """dm6 not in RNASEQ_GENOME_CONFIG — error for no RNA-seq index."""
    params = {
        "experiment_id": 1,
        "project_id": 1,
        "reference_genome": "dm6",
        "reactions": [{"reaction_id": 1, "short_name": "s1", "r1_path": "x", "r2_path": "y"}],
    }
    errors = stage.validate(params)
    assert any("RNA-seq index" in e or "No RNA-seq" in e for e in errors)
    assert "dm6" not in RNASEQ_GENOME_CONFIG


def test_validate_missing_reaction_fields(stage):
    """Error for reactions missing required fields."""
    params = {
        "experiment_id": 1,
        "project_id": 1,
        "reference_genome": "mm10",
        "reactions": [{"reaction_id": 1}],
    }
    errors = stage.validate(params)
    assert any("short_name" in e for e in errors)
    assert any("r1_path" in e for e in errors)
    assert any("r2_path" in e for e in errors)


# ---------------------------------------------------------------------------
# Mock run tests
# ---------------------------------------------------------------------------


def test_mock_run_creates_outputs(stage, tmp_fastq_pair, override_storage_root):
    """Mock run creates all expected output files."""
    from config import settings

    params = _make_valid_params(tmp_fastq_pair)
    working_dir = Path(settings.STORAGE_ROOT) / "projects" / "1" / "1"
    job_dir = working_dir / "jobs" / "99"

    result = stage.mock_run(99, params, working_dir, job_dir)

    assert result["status"] == "complete"
    assert len(result["outputs"]) > 0

    # Check key output categories exist
    categories = {o["file_category"] for o in result["outputs"]}
    assert "sorted_bam" in categories
    assert "bam_index" in categories
    assert "bigwig" in categories
    assert "smoothed_bigwig" in categories
    assert "salmon_quant" in categories
    assert "qc_report" in categories

    # Verify files on disk
    assert (job_dir / "bams" / "ctrl_rep1Aligned.sortedByCoord.out.bam").exists()
    assert (job_dir / "bigwigs" / "ctrl_rep1.bw").exists()
    assert (job_dir / "salmon" / "ctrl_rep1" / "quant.sf").exists()


def test_mock_run_multiple_reactions(stage, override_storage_root):
    """Mock run with 2 reactions produces per-reaction outputs."""
    from config import settings

    raw_dir = Path(settings.STORAGE_ROOT) / "projects" / "1" / "1" / "fastqs" / "raw"
    raw_dir.mkdir(parents=True)
    fastq_content = gzip.compress(b"@SEQ\nACGT\n+\nIIII\n")
    for prefix in ["ctrl", "mut"]:
        for d in ["R1", "R2"]:
            (raw_dir / f"{prefix}_{d}_001.fastq.gz").write_bytes(fastq_content)

    params = {
        "experiment_id": 1,
        "project_id": 1,
        "reference_genome": "mm10",
        "reactions": [
            {
                "reaction_id": 1,
                "short_name": "ctrl",
                "r1_path": "projects/1/1/fastqs/raw/ctrl_R1_001.fastq.gz",
                "r2_path": "projects/1/1/fastqs/raw/ctrl_R2_001.fastq.gz",
            },
            {
                "reaction_id": 2,
                "short_name": "mut",
                "r1_path": "projects/1/1/fastqs/raw/mut_R1_001.fastq.gz",
                "r2_path": "projects/1/1/fastqs/raw/mut_R2_001.fastq.gz",
            },
        ],
    }

    working_dir = Path(settings.STORAGE_ROOT) / "projects" / "1" / "1"
    job_dir = working_dir / "jobs" / "100"

    result = stage.mock_run(100, params, working_dir, job_dir)

    # Each reaction produces: sorted_bam, bam_index, transcriptome_bam,
    # bigwig, smoothed_bigwig, salmon_quant, star_log = 7 per reaction
    # Plus shared: qc_report = 1
    reaction_outputs = [o for o in result["outputs"] if o.get("reaction_id")]
    shared_outputs = [o for o in result["outputs"] if not o.get("reaction_id")]
    assert len(reaction_outputs) == 14  # 7 per reaction * 2 reactions
    assert len(shared_outputs) >= 1  # qc_report at minimum


def test_mock_run_output_categories(stage, tmp_fastq_pair, override_storage_root):
    """Verify all expected file categories are present."""
    from config import settings

    params = _make_valid_params(tmp_fastq_pair)
    working_dir = Path(settings.STORAGE_ROOT) / "projects" / "1" / "1"
    job_dir = working_dir / "jobs" / "101"

    result = stage.mock_run(101, params, working_dir, job_dir)

    categories = {o["file_category"] for o in result["outputs"]}
    # Per-reaction categories
    assert "sorted_bam" in categories
    assert "bam_index" in categories
    assert "transcriptome_bam" in categories
    assert "bigwig" in categories
    assert "smoothed_bigwig" in categories
    assert "salmon_quant" in categories
    assert "star_log" in categories
    # Shared categories
    assert "qc_report" in categories


# ---------------------------------------------------------------------------
# QC parsing tests
# ---------------------------------------------------------------------------


def test_parse_star_log(tmp_path):
    """_parse_star_log extracts all metrics from STAR Log.final.out."""
    log = tmp_path / "Log.final.out"
    log.write_text(
        "                          Number of input reads |\t10000000\n"
        "                   Uniquely mapped reads number |\t9435272\n"
        "                        Uniquely mapped reads % |\t94.35%\n"
        "                          Average mapped length |\t199.19\n"
        "                       Number of splices: Total |\t7218019\n"
        "            Number of splices: Annotated (sjdb) |\t6503217\n"
        "                    Number of splices: GT/AG |\t7139825\n"
        "                    Number of splices: GC/AG |\t52341\n"
        "                    Number of splices: AT/AC |\t7521\n"
        "               Number of splices: Non-canonical |\t18332\n"
        "                      Mismatch rate per base, % |\t0.22%\n"
        "             % of reads mapped to multiple loci |\t3.91%\n"
        "             % of reads mapped to too many loci |\t0.06%\n"
        "       % of reads unmapped: too many mismatches |\t0.00%\n"
        "                 % of reads unmapped: too short |\t1.62%\n"
        "                     % of reads unmapped: other |\t0.06%\n"
    )

    result = _parse_star_log(log)

    assert result["total_input_reads"] == 10000000
    assert result["uniquely_mapped_reads"] == 9435272
    assert result["unique_mapping_rate"] == 94.35
    assert result["average_mapped_length"] == 199.19
    assert result["num_splices"] == 7218019
    assert result["num_splices_annotated"] == 6503217
    assert result["num_splices_gt_ag"] == 7139825
    assert result["num_splices_gc_ag"] == 52341
    assert result["num_splices_at_ac"] == 7521
    assert result["num_splices_non_canonical"] == 18332
    assert result["mismatch_rate"] == 0.22
    assert result["multi_mapped_rate"] == 3.97  # 3.91 + 0.06
    assert result["unmapped_rate"] == 1.68  # 0.00 + 1.62 + 0.06


def test_parse_salmon_meta(tmp_path):
    """_parse_salmon_meta extracts metrics from Salmon meta_info.json."""
    meta = tmp_path / "meta_info.json"
    meta.write_text(
        json.dumps(
            {
                "salmon_version": "1.10.0",
                "num_processed": 10000000,
                "num_mapped": 9250000,
                "percent_mapped": 92.50,
                "library_types": ["ISR"],
                "frag_length_mean": 234.5,
                "frag_length_sd": 48.2,
            }
        )
    )

    result = _parse_salmon_meta(meta)

    assert result["salmon_mapping_rate"] == 92.50
    assert result["salmon_library_type"] == "ISR"
    assert result["salmon_num_processed"] == 10000000
    assert result["salmon_frag_length_mean"] == 234.5
    assert result["salmon_frag_length_sd"] == 48.2


# ---------------------------------------------------------------------------
# Methods text tests
# ---------------------------------------------------------------------------


def test_methods_text_contains_tools(stage, tmp_fastq_pair):
    """Methods text mentions STAR, Salmon, and bamCoverage."""
    params = _make_valid_params(tmp_fastq_pair)
    text = stage.generate_methods_text(params)

    assert "STAR" in text
    assert "Salmon" in text or "salmon" in text
    assert "bamCoverage" in text or "bigWig" in text.lower()


def test_methods_text_contains_genome(stage, tmp_fastq_pair):
    """Methods text includes genome and annotation version."""
    params = _make_valid_params(tmp_fastq_pair)
    text = stage.generate_methods_text(params)

    assert "mm10" in text
    assert "GENCODE" in text or "gencode" in text
