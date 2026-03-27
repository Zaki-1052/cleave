# backend/tests/test_alignment_pipeline.py
"""Unit tests for the alignment pipeline module."""

import csv
from pathlib import Path

import pytest

from pipelines.alignment import (
    AlignmentStage,
    _load_canned_qc_data,
    _parse_bowtie2_log,
    _parse_picard_metrics,
    _write_qc_csv,
)
from pipelines.methods_text import EFFECTIVE_GENOME_SIZES
from schemas.qc_report import AlignmentQCReport, AlignmentReactionMetrics


@pytest.fixture
def stage():
    return AlignmentStage()


def _make_valid_params():
    return {
        "experiment_id": 1,
        "project_id": 1,
        "reference_genome": "mm10",
        "remove_duplicates": True,
        "remove_dac_exclusion": True,
        "bam_coverage_bin_size": 20,
        "smoothed_bin_size": 100,
        "reactions": [
            {
                "reaction_id": 1,
                "short_name": "IgG",
                "r1_path": "projects/1/1/fastqs/raw/IgG_R1_001.fastq.gz",
                "r2_path": "projects/1/1/fastqs/raw/IgG_R2_001.fastq.gz",
                "total_reads": 23538581,
                "ecoli_spike_in": True,
                "cutana_spike_in": "None",
            },
            {
                "reaction_id": 2,
                "short_name": "K4me3_ctrl1",
                "r1_path": "projects/1/1/fastqs/raw/K4me3_ctrl1_R1_001.fastq.gz",
                "r2_path": "projects/1/1/fastqs/raw/K4me3_ctrl1_R2_001.fastq.gz",
                "total_reads": 9519486,
                "ecoli_spike_in": True,
                "cutana_spike_in": "None",
            },
        ],
    }


# --- Validation tests ---


def test_validate_valid_params(stage):
    errors = stage.validate(_make_valid_params())
    assert errors == []


def test_validate_missing_experiment_id(stage):
    params = _make_valid_params()
    del params["experiment_id"]
    errors = stage.validate(params)
    assert any("experiment_id" in e for e in errors)


def test_validate_missing_project_id(stage):
    params = _make_valid_params()
    del params["project_id"]
    errors = stage.validate(params)
    assert any("project_id" in e for e in errors)


def test_validate_missing_reference_genome(stage):
    params = _make_valid_params()
    del params["reference_genome"]
    errors = stage.validate(params)
    assert any("reference_genome" in e for e in errors)


def test_validate_unsupported_genome(stage):
    params = _make_valid_params()
    params["reference_genome"] = "hg99"
    errors = stage.validate(params)
    assert any("Unsupported reference genome" in e for e in errors)


def test_validate_empty_reactions(stage):
    params = _make_valid_params()
    params["reactions"] = []
    errors = stage.validate(params)
    assert any("reactions" in e for e in errors)


def test_validate_missing_reaction_fields(stage):
    params = _make_valid_params()
    params["reactions"] = [{"short_name": "IgG"}]
    errors = stage.validate(params)
    assert any("reaction_id" in e for e in errors)
    assert any("r1_path" in e for e in errors)
    assert any("r2_path" in e for e in errors)


def test_validate_all_supported_genomes(stage):
    """Every genome in EFFECTIVE_GENOME_SIZES should pass validation."""
    for genome in EFFECTIVE_GENOME_SIZES:
        params = _make_valid_params()
        params["reference_genome"] = genome
        errors = stage.validate(params)
        assert errors == [], f"Validation failed for genome {genome}: {errors}"


# --- Mock run tests ---


def test_mock_run_creates_files(stage):
    """Verify mock_run creates actual files at expected paths."""
    from config import settings

    params = _make_valid_params()
    working_dir = Path(settings.STORAGE_ROOT) / "projects"
    job_dir = working_dir / "1" / "1" / "jobs" / "1"
    job_dir.mkdir(parents=True)

    result = stage.mock_run(job_id=1, params=params, working_dir=working_dir, job_dir=job_dir)

    assert result["status"] == "complete"

    # Check directory structure created
    assert (job_dir / "bams").is_dir()
    assert (job_dir / "bigwigs").is_dir()
    assert (job_dir / "heatmaps").is_dir()
    assert (job_dir / "qc").is_dir()
    assert (job_dir / "logs").is_dir()

    # Check per-reaction stub files exist for both reactions
    for short_name in ["IgG", "K4me3_ctrl1"]:
        assert (job_dir / "bams" / f"{short_name}_final.bam").exists()
        assert (job_dir / "bams" / f"{short_name}_final.bam.bai").exists()
        assert (job_dir / "bigwigs" / f"{short_name}.bw").exists()
        assert (job_dir / "bigwigs" / f"{short_name}_smoothed.bw").exists()
        assert (job_dir / "heatmaps" / f"{short_name}_tss_heatmap.png").exists()
        assert (job_dir / "heatmaps" / f"{short_name}_genebody_heatmap.png").exists()
        assert (job_dir / "logs" / f"{short_name}.bowtie2").exists()

    # Check QC CSV
    qc_csv = job_dir / "qc" / "alignment_metrics.csv"
    assert qc_csv.exists()
    assert qc_csv.stat().st_size > 0


def test_mock_run_return_shape(stage):
    from config import settings

    params = _make_valid_params()
    working_dir = Path(settings.STORAGE_ROOT) / "projects"
    job_dir = working_dir / "1" / "1" / "jobs" / "42"
    job_dir.mkdir(parents=True)

    result = stage.mock_run(job_id=42, params=params, working_dir=working_dir, job_dir=job_dir)

    assert result["job_id"] == 42
    assert result["status"] == "complete"
    assert "outputs" in result
    assert "methods_text" in result
    assert "qc_metrics" in result

    # 2 reactions x 7 per-reaction outputs + 1 QC CSV = 15
    assert len(result["outputs"]) == 15

    # Check output dict structure matches persist_job_outputs expectations
    for output in result["outputs"]:
        assert "file_category" in output
        assert "filename" in output
        assert "file_path" in output
        assert "file_type" in output
        assert "file_size_bytes" in output
        assert "reaction_id" in output  # can be None for job-level files


def test_mock_run_output_categories(stage):
    """Verify the correct file categories are produced (matching CUTANA Cloud)."""
    from config import settings

    params = _make_valid_params()
    working_dir = Path(settings.STORAGE_ROOT) / "projects"
    job_dir = working_dir / "1" / "1" / "jobs" / "5"
    job_dir.mkdir(parents=True)

    result = stage.mock_run(job_id=5, params=params, working_dir=working_dir, job_dir=job_dir)

    categories = {o["file_category"] for o in result["outputs"]}
    expected = {
        "unique_bam",
        "bigwig",
        "smoothed_bigwig",
        "tss_heatmap",
        "genebody_heatmap",
        "log",
        "qc_report",
    }
    assert categories == expected


def test_mock_run_qc_csv_matches_cutana_format(stage):
    """QC CSV headers must match the CUTANA Cloud export exactly."""
    from config import settings

    params = _make_valid_params()
    working_dir = Path(settings.STORAGE_ROOT) / "projects"
    job_dir = working_dir / "1" / "1" / "jobs" / "10"
    job_dir.mkdir(parents=True)

    stage.mock_run(job_id=10, params=params, working_dir=working_dir, job_dir=job_dir)

    qc_csv = job_dir / "qc" / "alignment_metrics.csv"
    with open(qc_csv, newline="") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames

    expected_headers = [
        "Short_Name",
        "Total_Read_Pairs",
        "Aligned_Read_Pairs",
        "Uniquely_Aligned_Read_Pairs",
        "Unique_Alignment_Rate(%)",
        "Duplication_Rate(%)",
        "chrM_Bandwidth(%)",
        "Ecoli_Read_Pairs",
        "Ecoli_Alignment_Rate(%)",
        "Ecoli_Normalization_Factor",
    ]
    assert headers == expected_headers


def test_mock_run_reaction_ids_assigned(stage):
    """Per-reaction outputs should have reaction_id set; job-level should be None."""
    from config import settings

    params = _make_valid_params()
    working_dir = Path(settings.STORAGE_ROOT) / "projects"
    job_dir = working_dir / "1" / "1" / "jobs" / "7"
    job_dir.mkdir(parents=True)

    result = stage.mock_run(job_id=7, params=params, working_dir=working_dir, job_dir=job_dir)

    per_reaction = [o for o in result["outputs"] if o["reaction_id"] is not None]
    job_level = [o for o in result["outputs"] if o["reaction_id"] is None]

    # 2 reactions x 7 files each = 14 per-reaction
    assert len(per_reaction) == 14
    # 1 QC CSV at job level
    assert len(job_level) == 1
    assert job_level[0]["file_category"] == "qc_report"


# --- Methods text tests ---


def test_methods_text_includes_genome(stage):
    params = _make_valid_params()
    text = stage.generate_methods_text(params)
    assert "mm10" in text
    assert "Bowtie2" in text
    assert "--dovetail" in text
    assert "--phred33" in text


def test_methods_text_includes_tools(stage):
    params = _make_valid_params()
    text = stage.generate_methods_text(params)
    assert "SAMtools" in text
    assert "BEDTools" in text
    assert "Picard" in text
    assert "deepTools" in text
    assert "bamCoverage" in text
    assert "RPKM" in text


def test_methods_text_correct_effective_genome_size(stage):
    """Methods text must use the CORRECT effective genome size, not the lab's
    hardcoded mm10 value (fixes bug per cleave-spec-decisions.md §7)."""
    for genome, expected_size in EFFECTIVE_GENOME_SIZES.items():
        params = {**_make_valid_params(), "reference_genome": genome}
        text = stage.generate_methods_text(params)
        assert str(expected_size) in text, (
            f"Methods text for {genome} should include effectiveGenomeSize {expected_size}"
        )


def test_methods_text_respects_settings(stage):
    """Methods text should reflect user's Advanced Settings choices."""
    # Duplicates off, DAC off
    params = {
        **_make_valid_params(),
        "remove_duplicates": False,
        "remove_dac_exclusion": False,
    }
    text = stage.generate_methods_text(params)
    assert "Picard" not in text
    assert "Exclusion List" not in text

    # Duplicates on, DAC on
    params["remove_duplicates"] = True
    params["remove_dac_exclusion"] = True
    text = stage.generate_methods_text(params)
    assert "Picard" in text
    assert "Exclusion List" in text


def test_methods_text_custom_bin_size(stage):
    params = {**_make_valid_params(), "bam_coverage_bin_size": 50}
    text = stage.generate_methods_text(params)
    assert "--binSize 50" in text


# --- Helper function tests ---


def test_parse_bowtie2_log(tmp_path):
    """Parse alignment stats from bowtie2 stderr format."""
    log = tmp_path / "test.bowtie2"
    log.write_text(
        "9519486 reads; of these:\n"
        "  9519486 (100.00%) were paired; of these:\n"
        "    398786 (4.19%) aligned concordantly 0 times\n"
        "    8889064 (93.38%) aligned concordantly exactly 1 time\n"
        "    231636 (2.43%) aligned concordantly >1 times\n"
        "----\n"
        "95.81% overall alignment rate\n"
    )
    result = _parse_bowtie2_log(log)
    assert result["total_reads"] == 9519486
    assert result["alignment_rate"] == 95.81
    assert result["aligned_reads"] > 0


def test_parse_bowtie2_log_empty(tmp_path):
    """Gracefully handle empty or malformed bowtie2 log."""
    log = tmp_path / "empty.bowtie2"
    log.write_text("")
    result = _parse_bowtie2_log(log)
    assert result["total_reads"] == 0
    assert result["alignment_rate"] == 0.0


def test_parse_picard_metrics(tmp_path):
    """Parse duplication rate from Picard MarkDuplicates metrics format."""
    metrics = tmp_path / "metrics.txt"
    metrics.write_text(
        "## htsjdk.samtools.metrics.StringHeader\n"
        "# MarkDuplicates ...\n"
        "## METRICS CLASS\tpicard.sam.DuplicationMetrics\n"
        "LIBRARY\tUNPAIRED_READS_EXAMINED\tREAD_PAIRS_EXAMINED\t"
        "SECONDARY_OR_SUPPLEMENTARY_DUPLICATES\tUNMAPPED_READS\t"
        "UNPAIRED_READ_DUPLICATES\tREAD_PAIR_DUPLICATES\t"
        "READ_PAIR_OPTICAL_DUPLICATES\tPERCENT_DUPLICATION\t"
        "ESTIMATED_LIBRARY_SIZE\n"
        "Unknown\t0\t7630846\t0\t0\t0\t950123\t45678\t0.1245\t28765432\n"
    )
    dup_rate = _parse_picard_metrics(metrics)
    assert abs(dup_rate - 12.45) < 0.01  # 0.1245 * 100 = 12.45%


def test_parse_picard_metrics_missing_column(tmp_path):
    """Gracefully handle missing PERCENT_DUPLICATION column."""
    metrics = tmp_path / "bad_metrics.txt"
    metrics.write_text(
        "## METRICS CLASS\tpicard.sam.DuplicationMetrics\n"
        "LIBRARY\tREAD_PAIRS_EXAMINED\n"
        "Unknown\t7630846\n"
    )
    dup_rate = _parse_picard_metrics(metrics)
    assert dup_rate == 0.0


def test_write_qc_csv(tmp_path):
    """QC CSV writer produces correct format."""
    metrics = [
        {
            "short_name": "IgG",
            "total_read_pairs": 23538581,
            "aligned_read_pairs": 9906793,
            "uniquely_aligned_read_pairs": 6856185,
            "unique_alignment_rate": 29.13,
            "duplication_rate": 21.36,
            "chrm_bandwidth": 0.12,
            "ecoli_read_pairs": 12842807,
            "ecoli_alignment_rate": 54.56,
            "ecoli_normalization_factor": 1.873178,
        }
    ]
    output = tmp_path / "test_metrics.csv"
    _write_qc_csv(metrics, output)

    with open(output, newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    assert len(rows) == 1
    assert rows[0]["Short_Name"] == "IgG"
    assert int(rows[0]["Total_Read_Pairs"]) == 23538581
    assert float(rows[0]["Unique_Alignment_Rate(%)"]) == 29.13


def test_load_canned_qc_data():
    """Canned QC data should load 5 reactions from CUTANA export."""
    data = _load_canned_qc_data()
    # May be empty if cutana/ dir not available, but if it loads, check shape
    if data:
        assert len(data) == 5
        assert data[0]["short_name"] == "IgG"
        assert data[0]["unique_alignment_rate"] == 29.13
        for row in data:
            assert "total_read_pairs" in row
            assert "ecoli_alignment_rate" in row


# --- QC Report schema tests ---


def test_alignment_qc_schema():
    """AlignmentQCReport schema accepts valid data."""
    report = AlignmentQCReport(
        reference_genome="mm10",
        metrics=[
            AlignmentReactionMetrics(
                short_name="IgG",
                total_read_pairs=23538581,
                aligned_read_pairs=9906793,
                uniquely_aligned_read_pairs=6856185,
                unique_alignment_rate=29.13,
                duplication_rate=21.36,
                chrm_bandwidth=0.12,
                ecoli_read_pairs=12842807,
                ecoli_alignment_rate=54.56,
                ecoli_normalization_factor=1.873178,
            )
        ],
    )
    assert report.reference_genome == "mm10"
    assert len(report.metrics) == 1
    assert report.metrics[0].short_name == "IgG"


def test_alignment_qc_schema_camel_case():
    """Schema should serialize to camelCase for the frontend."""
    metrics = AlignmentReactionMetrics(
        short_name="K4me3_ctrl1",
        total_read_pairs=9519486,
        aligned_read_pairs=9120700,
        uniquely_aligned_read_pairs=7630846,
        unique_alignment_rate=80.16,
        duplication_rate=12.45,
        chrm_bandwidth=0.0,
        ecoli_read_pairs=1020,
        ecoli_alignment_rate=0.01,
        ecoli_normalization_factor=0.000134,
    )
    data = metrics.model_dump(by_alias=True)
    assert "shortName" in data
    assert "totalReadPairs" in data
    assert "uniqueAlignmentRate" in data
    assert "ecoliReadPairs" in data
    assert "ecoliNormalizationFactor" in data


# --- Genome size constants test ---


def test_effective_genome_sizes():
    """Verify correct effective genome sizes per cleave-spec-decisions.md §7.

    The lab's create_bams.sh uses mm10's value (2467481108) for ALL genomes —
    this is a known bug. Cleave MUST use the correct per-genome values.
    """
    assert EFFECTIVE_GENOME_SIZES["mm10"] == 2_467_481_108
    assert EFFECTIVE_GENOME_SIZES["hg38"] == 2_913_022_398
    assert EFFECTIVE_GENOME_SIZES["hg19"] == 2_864_785_220
    assert EFFECTIVE_GENOME_SIZES["dm6"] == 142_573_017
    assert EFFECTIVE_GENOME_SIZES["sacCer3"] == 12_157_105

    # Verify hg38 is NOT the mm10 value (the bug we're fixing)
    assert EFFECTIVE_GENOME_SIZES["hg38"] != EFFECTIVE_GENOME_SIZES["mm10"]
