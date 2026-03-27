# backend/tests/test_peak_calling_pipeline.py
"""Unit tests for the peak calling pipeline module."""

import csv
from pathlib import Path

import pytest

from pipelines.peak_calling import (
    DEFAULT_BROAD_CUTOFF,
    DEFAULT_FRAGMENT_SIZE,
    DEFAULT_Q_VALUE,
    DEFAULT_SEACR_THRESHOLD,
    MACS2_GENOME_SIZES,
    PEAK_CALLERS,
    PEAK_SIZES,
    PeakCallingStage,
    _count_peaks,
    _extract_top_peaks,
    _load_canned_peak_qc,
    _load_canned_top_peaks,
    _write_peak_qc_csv,
    _write_top_peaks_csv,
)
from schemas.qc_report import (
    PeakCallingQCReport,
    PeakCallingReactionMetrics,
    TopCalledPeak,
)


@pytest.fixture
def stage():
    return PeakCallingStage()


def _make_valid_params(**overrides):
    params = {
        "experiment_id": 1,
        "project_id": 1,
        "parent_job_id": 10,
        "reference_genome": "mm10",
        "peak_caller": "MACS2",
        "peak_size": "narrow",
        "q_value": DEFAULT_Q_VALUE,
        "fragment_filter": True,
        "reactions": [
            {
                "reaction_id": 1,
                "short_name": "IgG",
                "bam_path": "projects/1/1/jobs/10/bams/IgG_final.bam",
                "igg_bam_path": None,
                "igg_short_name": "IgG",
            },
            {
                "reaction_id": 2,
                "short_name": "K4me3_ctrl1",
                "bam_path": "projects/1/1/jobs/10/bams/K4me3_ctrl1_final.bam",
                "igg_bam_path": "projects/1/1/jobs/10/bams/IgG_final.bam",
                "igg_short_name": "IgG",
            },
        ],
    }
    params.update(overrides)
    return params


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


def test_validate_missing_parent_job_id(stage):
    params = _make_valid_params()
    del params["parent_job_id"]
    errors = stage.validate(params)
    assert any("parent_job_id" in e for e in errors)


def test_validate_missing_reference_genome(stage):
    params = _make_valid_params()
    del params["reference_genome"]
    errors = stage.validate(params)
    assert any("reference_genome" in e for e in errors)


def test_validate_unsupported_genome(stage):
    errors = stage.validate(_make_valid_params(reference_genome="hg99"))
    assert any("Unsupported" in e for e in errors)


def test_validate_missing_peak_caller(stage):
    params = _make_valid_params()
    del params["peak_caller"]
    errors = stage.validate(params)
    assert any("peak_caller" in e for e in errors)


def test_validate_unsupported_peak_caller(stage):
    errors = stage.validate(_make_valid_params(peak_caller="HOMER"))
    assert any("Unsupported peak caller" in e for e in errors)


def test_validate_missing_peak_size(stage):
    params = _make_valid_params()
    del params["peak_size"]
    errors = stage.validate(params)
    assert any("peak_size" in e for e in errors)


def test_validate_invalid_peak_size_for_macs2(stage):
    """MACS2 only supports narrow and broad, not stringent."""
    errors = stage.validate(_make_valid_params(peak_caller="MACS2", peak_size="stringent"))
    assert any("Invalid peak_size" in e for e in errors)


def test_validate_invalid_peak_size_for_seacr(stage):
    """SEACR only supports stringent and relaxed, not narrow."""
    errors = stage.validate(_make_valid_params(peak_caller="SEACR", peak_size="narrow"))
    assert any("Invalid peak_size" in e for e in errors)


def test_validate_invalid_peak_size_for_sicer2(stage):
    """SICER2 only supports broad."""
    errors = stage.validate(_make_valid_params(peak_caller="SICER2", peak_size="narrow"))
    assert any("Invalid peak_size" in e for e in errors)


def test_validate_empty_reactions(stage):
    errors = stage.validate(_make_valid_params(reactions=[]))
    assert any("reactions" in e for e in errors)


def test_validate_missing_reaction_fields(stage):
    """Each reaction must have reaction_id, short_name, and bam_path."""
    params = _make_valid_params(reactions=[{"reaction_id": 1}])
    errors = stage.validate(params)
    assert any("short_name" in e for e in errors)
    assert any("bam_path" in e for e in errors)


def test_validate_rejects_path_traversal_short_name(stage):
    """Defense-in-depth: reject short names that could be path traversal attacks."""
    params = _make_valid_params(
        reactions=[
            {"reaction_id": 1, "short_name": "../etc/passwd", "bam_path": "foo.bam"},
        ],
    )
    errors = stage.validate(params)
    assert any("unsafe characters" in e for e in errors)


def test_validate_accepts_safe_short_names(stage):
    """Standard short names with letters, digits, underscores, hyphens, dots should pass."""
    safe_names = ["IgG", "K4me3_ctrl1", "H3K27me3-rep.2", "CTCF.1"]
    for name in safe_names:
        params = _make_valid_params(
            reactions=[{"reaction_id": 1, "short_name": name, "bam_path": "foo.bam"}],
        )
        errors = stage.validate(params)
        name_errors = [e for e in errors if "unsafe" in e or "short_name" in e]
        assert name_errors == [], f"Short name '{name}' should be accepted but got: {name_errors}"


def test_validate_all_supported_genomes(stage):
    """All genomes in MACS2_GENOME_SIZES should pass validation."""
    for genome in MACS2_GENOME_SIZES:
        errors = stage.validate(_make_valid_params(reference_genome=genome))
        genome_errors = [e for e in errors if "genome" in e.lower()]
        assert genome_errors == [], f"Genome {genome} should be supported"


def test_validate_all_valid_caller_size_combos(stage):
    """All valid peak_caller + peak_size combinations should pass."""
    for caller, valid_sizes in PEAK_SIZES.items():
        for size in valid_sizes:
            errors = stage.validate(_make_valid_params(peak_caller=caller, peak_size=size))
            size_errors = [e for e in errors if "peak_size" in e or "peak_caller" in e]
            assert size_errors == [], f"{caller}/{size} should be valid but got: {size_errors}"


# --- Mock run tests ---


def test_mock_run_creates_files(stage):
    """Mock run should create the expected directory structure and files."""
    from config import settings

    params = _make_valid_params()
    working_dir = Path(settings.STORAGE_ROOT) / "projects"
    job_dir = working_dir / "1" / "1" / "jobs" / "100"
    job_dir.mkdir(parents=True)

    result = stage.mock_run(job_id=100, params=params, working_dir=working_dir, job_dir=job_dir)

    assert result["status"] == "complete"
    assert (job_dir / "peaks").is_dir()
    assert (job_dir / "annotation").is_dir()
    assert (job_dir / "qc").is_dir()
    assert (job_dir / "logs").is_dir()

    # Per-reaction files should exist
    for rxn in params["reactions"]:
        name = rxn["short_name"]
        assert (job_dir / "peaks" / f"{name}_peaks.narrowPeak").exists()
        assert (job_dir / "peaks" / f"{name}_summits.bed").exists()
        assert (job_dir / "annotation" / f"{name}_annotation.txt").exists()
        assert (job_dir / "annotation" / f"{name}_annotation_stats.txt").exists()


def test_mock_run_return_shape(stage):
    """Mock run return dict should have the expected keys."""
    from config import settings

    params = _make_valid_params()
    working_dir = Path(settings.STORAGE_ROOT) / "projects"
    job_dir = working_dir / "1" / "1" / "jobs" / "101"
    job_dir.mkdir(parents=True)

    result = stage.mock_run(job_id=101, params=params, working_dir=working_dir, job_dir=job_dir)

    assert "job_id" in result
    assert "status" in result
    assert "outputs" in result
    assert "methods_text" in result
    assert "qc_metrics" in result
    assert isinstance(result["outputs"], list)
    assert len(result["outputs"]) > 0

    for output in result["outputs"]:
        assert "file_category" in output
        assert "filename" in output
        assert "file_path" in output
        assert "file_type" in output
        assert "file_size_bytes" in output
        assert "reaction_id" in output


def test_mock_run_output_categories(stage):
    """Verify the correct file categories are produced."""
    from config import settings

    params = _make_valid_params()
    working_dir = Path(settings.STORAGE_ROOT) / "projects"
    job_dir = working_dir / "1" / "1" / "jobs" / "102"
    job_dir.mkdir(parents=True)

    result = stage.mock_run(job_id=102, params=params, working_dir=working_dir, job_dir=job_dir)

    categories = {o["file_category"] for o in result["outputs"]}
    expected = {"bed", "annotation", "annotation_stats", "log", "qc_report"}
    assert categories == expected


def test_mock_run_qc_csv_headers(stage):
    """QC CSV headers must match the CUTANA Cloud peak_caller_metrics.csv format."""
    from config import settings

    params = _make_valid_params()
    working_dir = Path(settings.STORAGE_ROOT) / "projects"
    job_dir = working_dir / "1" / "1" / "jobs" / "103"
    job_dir.mkdir(parents=True)

    stage.mock_run(job_id=103, params=params, working_dir=working_dir, job_dir=job_dir)

    qc_csv = job_dir / "qc" / "peak_caller_metrics.csv"
    assert qc_csv.exists()
    with open(qc_csv, newline="") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames

    expected_headers = [
        "Short_Name",
        "Control_Short_Name",
        "Reference_Genome",
        "Peak_Caller",
        "Peak_Size",
        "Significance_Threshold",
        "Uniquely_Aligned_Read_Pairs",
        "Called_Peaks",
        "Reads_in_Peaks",
        "FRiP",
    ]
    assert headers == expected_headers


def test_mock_run_top_peaks_csv_headers(stage):
    """Top peaks CSV headers must match CUTANA Cloud format."""
    from config import settings

    params = _make_valid_params()
    working_dir = Path(settings.STORAGE_ROOT) / "projects"
    job_dir = working_dir / "1" / "1" / "jobs" / "104"
    job_dir.mkdir(parents=True)

    stage.mock_run(job_id=104, params=params, working_dir=working_dir, job_dir=job_dir)

    top_csv = job_dir / "qc" / "top_called_peaks.csv"
    assert top_csv.exists()
    with open(top_csv, newline="") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames

    assert headers[0] == "Short_Name"
    assert headers[6] == "Top Peak"
    assert headers[-1] == "10' Peak"
    assert len(headers) == 16


def test_mock_run_reaction_ids_assigned(stage):
    """Per-reaction outputs have reaction_id; job-level QC CSVs have None."""
    from config import settings

    params = _make_valid_params()
    working_dir = Path(settings.STORAGE_ROOT) / "projects"
    job_dir = working_dir / "1" / "1" / "jobs" / "105"
    job_dir.mkdir(parents=True)

    result = stage.mock_run(job_id=105, params=params, working_dir=working_dir, job_dir=job_dir)

    per_reaction = [o for o in result["outputs"] if o["reaction_id"] is not None]
    job_level = [o for o in result["outputs"] if o["reaction_id"] is None]

    # 2 reactions x 5 files each = 10 per-reaction
    assert len(per_reaction) == 10
    # 2 QC CSVs at job level
    assert len(job_level) == 2
    assert all(o["file_category"] == "qc_report" for o in job_level)


def test_mock_run_peak_files_have_content(stage):
    """Stub peak files should contain valid BED content (non-empty)."""
    from config import settings

    params = _make_valid_params()
    working_dir = Path(settings.STORAGE_ROOT) / "projects"
    job_dir = working_dir / "1" / "1" / "jobs" / "106"
    job_dir.mkdir(parents=True)

    stage.mock_run(job_id=106, params=params, working_dir=working_dir, job_dir=job_dir)

    for rxn in params["reactions"]:
        peak = job_dir / "peaks" / f"{rxn['short_name']}_peaks.narrowPeak"
        content = peak.read_text().strip()
        assert len(content) > 0
        lines = content.split("\n")
        assert len(lines) >= 3
        # Each line should be tab-separated BED
        first_cols = lines[0].split("\t")
        assert first_cols[0].startswith("chr")


def test_mock_run_with_seacr_params(stage):
    """Mock run should work with SEACR peak caller settings."""
    from config import settings

    params = _make_valid_params(peak_caller="SEACR", peak_size="stringent")
    working_dir = Path(settings.STORAGE_ROOT) / "projects"
    job_dir = working_dir / "1" / "1" / "jobs" / "107"
    job_dir.mkdir(parents=True)

    result = stage.mock_run(job_id=107, params=params, working_dir=working_dir, job_dir=job_dir)

    assert result["status"] == "complete"
    # SEACR peak files use .sort.bed extension
    for rxn in params["reactions"]:
        peak = job_dir / "peaks" / f"{rxn['short_name']}_peaks.stringent.sort.bed"
        assert peak.exists()


def test_mock_run_with_macs2_broad_params(stage):
    """Mock run should work with MACS2 broad peak caller settings."""
    from config import settings

    params = _make_valid_params(peak_caller="MACS2", peak_size="broad")
    working_dir = Path(settings.STORAGE_ROOT) / "projects"
    job_dir = working_dir / "1" / "1" / "jobs" / "108"
    job_dir.mkdir(parents=True)

    result = stage.mock_run(job_id=108, params=params, working_dir=working_dir, job_dir=job_dir)

    assert result["status"] == "complete"
    for rxn in params["reactions"]:
        peak = job_dir / "peaks" / f"{rxn['short_name']}_peaks.broadPeak"
        assert peak.exists()


def test_mock_run_with_sicer2_params(stage):
    """Mock run should work with SICER2 peak caller settings."""
    from config import settings

    params = _make_valid_params(peak_caller="SICER2", peak_size="broad")
    working_dir = Path(settings.STORAGE_ROOT) / "projects"
    job_dir = working_dir / "1" / "1" / "jobs" / "109"
    job_dir.mkdir(parents=True)

    result = stage.mock_run(job_id=109, params=params, working_dir=working_dir, job_dir=job_dir)

    assert result["status"] == "complete"
    for rxn in params["reactions"]:
        peak = job_dir / "peaks" / f"{rxn['short_name']}_peaks.sicer2.bed"
        assert peak.exists()


# --- Methods text tests ---


def test_methods_text_includes_genome(stage):
    params = _make_valid_params()
    text = stage.generate_methods_text(params)
    assert "mm10" in text
    assert "Peak Calling" in text


def test_methods_text_macs2_narrow(stage):
    params = _make_valid_params(peak_caller="MACS2", peak_size="narrow")
    text = stage.generate_methods_text(params)
    assert "MACS2" in text
    assert "q-value" in text
    assert str(DEFAULT_Q_VALUE) in text


def test_methods_text_macs2_broad(stage):
    params = _make_valid_params(peak_caller="MACS2", peak_size="broad")
    text = stage.generate_methods_text(params)
    assert "MACS2" in text
    assert "broad-cutoff" in text
    assert str(DEFAULT_BROAD_CUTOFF) in text


def test_methods_text_seacr(stage):
    params = _make_valid_params(peak_caller="SEACR", peak_size="stringent")
    text = stage.generate_methods_text(params)
    assert "SEACR" in text
    assert "1.1" in text
    assert str(DEFAULT_SEACR_THRESHOLD) in text


def test_methods_text_sicer2(stage):
    params = _make_valid_params(peak_caller="SICER2", peak_size="broad")
    text = stage.generate_methods_text(params)
    assert "SICER2" in text
    assert "FDR" in text


def test_methods_text_fragment_filter_mentioned(stage):
    params = _make_valid_params(fragment_filter=True, fragment_size=120)
    text = stage.generate_methods_text(params)
    assert "sub-nucleosomal" in text
    assert "120" in text


def test_methods_text_no_fragment_filter(stage):
    params = _make_valid_params(fragment_filter=False)
    text = stage.generate_methods_text(params)
    assert "sub-nucleosomal" not in text


# --- Helper function tests ---


def test_count_peaks(tmp_path):
    """Count non-comment lines in a peak file."""
    peak = tmp_path / "test.narrowPeak"
    peak.write_text(
        "chr1\t100\t200\tpeak_1\t500\t.\t50.0\t10.0\t5.0\t50\n"
        "chr2\t300\t400\tpeak_2\t400\t.\t40.0\t8.0\t4.0\t50\n"
        "chr3\t500\t600\tpeak_3\t300\t.\t30.0\t6.0\t3.0\t50\n"
    )
    assert _count_peaks(peak) == 3


def test_count_peaks_skips_comments(tmp_path):
    """Lines starting with # or 'track' should be skipped."""
    peak = tmp_path / "test.bed"
    peak.write_text(
        "# comment line\n"
        "track name=test\n"
        "chr1\t100\t200\tpeak_1\t500\n"
        "\n"
        "chr2\t300\t400\tpeak_2\t400\n"
    )
    assert _count_peaks(peak) == 2


def test_extract_top_peaks(tmp_path):
    """Top peaks should be sorted by score and returned as chr:start-end."""
    peak = tmp_path / "test.narrowPeak"
    peak.write_text(
        "chr1\t100\t200\tpeak_1\t100\t.\t10.0\t5.0\t3.0\t50\n"
        "chr2\t300\t400\tpeak_2\t200\t.\t50.0\t8.0\t4.0\t50\n"
        "chr3\t500\t600\tpeak_3\t300\t.\t30.0\t6.0\t3.0\t50\n"
    )
    result = _extract_top_peaks(peak, n=2)
    assert len(result) == 2
    # Highest score (50.0 in col 7) should be first
    assert result[0] == "chr2:300-400"
    assert result[1] == "chr3:500-600"


def test_extract_top_peaks_format(tmp_path):
    """Peaks should be in 'chr:start-end' format."""
    peak = tmp_path / "test.bed"
    peak.write_text("chr15\t32920284\t32924319\tpeak_1\t500\t.\t100.0\n")
    result = _extract_top_peaks(peak, n=1)
    assert result == ["chr15:32920284-32924319"]


def test_load_canned_peak_qc():
    """Canned peak QC data should load from CUTANA export (if available)."""
    data = _load_canned_peak_qc()
    if data:
        assert len(data) == 5
        assert data[0]["short_name"] == "IgG"
        assert data[0]["called_peaks"] == 22
        assert data[1]["frip"] > 0.7
        for row in data:
            assert "uniquely_aligned_read_pairs" in row
            assert "reads_in_peaks" in row


def test_load_canned_top_peaks():
    """Canned top peaks should load from CUTANA export (if available)."""
    data = _load_canned_top_peaks()
    if data:
        assert len(data) == 5
        assert data[0]["short_name"] == "IgG"
        assert len(data[0]["top_peaks"]) == 10
        # First peak for IgG should start with chrUn
        assert data[0]["top_peaks"][0].startswith("chrUn")


# --- CSV writer tests ---


def test_write_peak_qc_csv(tmp_path):
    """Peak QC CSV writer produces correct format."""
    metrics = [
        {
            "short_name": "K4me3_ctrl1",
            "control_short_name": "IgG",
            "reference_genome": "Mouse mm10",
            "peak_caller": "MACS2",
            "peak_size": "Narrow",
            "significance_threshold": 0.01,
            "uniquely_aligned_read_pairs": 15265015,
            "called_peaks": 22236,
            "reads_in_peaks": 11912997,
            "frip": 0.7804,
        }
    ]
    output = tmp_path / "test_peak_metrics.csv"
    _write_peak_qc_csv(metrics, output)

    with open(output, newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    assert len(rows) == 1
    assert rows[0]["Short_Name"] == "K4me3_ctrl1"
    assert rows[0]["Control_Short_Name"] == "IgG"
    assert int(rows[0]["Called_Peaks"]) == 22236
    assert float(rows[0]["FRiP"]) == 0.7804


def test_write_top_peaks_csv(tmp_path):
    """Top peaks CSV writer produces correct format."""
    top_peaks = [
        {
            "short_name": "K4me3_ctrl1",
            "control_short_name": "IgG",
            "reference_genome": "Mouse mm10",
            "peak_caller": "MACS2",
            "peak_size": "Narrow",
            "significance_threshold": 0.01,
            "top_peaks": [f"chr{i}:{i * 1000}-{i * 1000 + 500}" for i in range(1, 11)],
        }
    ]
    output = tmp_path / "test_top_peaks.csv"
    _write_top_peaks_csv(top_peaks, output)

    with open(output, newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    assert len(rows) == 1
    assert rows[0]["Top Peak"] == "chr1:1000-1500"
    assert rows[0]["10' Peak"] == "chr10:10000-10500"


# --- QC Report schema tests ---


def test_peak_calling_qc_schema():
    """PeakCallingQCReport schema accepts valid data."""
    report = PeakCallingQCReport(
        reference_genome="mm10",
        peak_caller="MACS2",
        peak_size="narrow",
        metrics=[
            PeakCallingReactionMetrics(
                short_name="K4me3_ctrl1",
                control_short_name="IgG",
                reference_genome="Mouse mm10",
                peak_caller="MACS2",
                peak_size="Narrow",
                significance_threshold=0.01,
                uniquely_aligned_read_pairs=15265015,
                called_peaks=22236,
                reads_in_peaks=11912997,
                frip=0.7804,
            )
        ],
    )
    assert report.reference_genome == "mm10"
    assert len(report.metrics) == 1
    assert report.metrics[0].frip == 0.7804


def test_peak_calling_qc_schema_camel_case():
    """Schema should serialize to camelCase for the frontend."""
    metrics = PeakCallingReactionMetrics(
        short_name="K4me3_ctrl1",
        control_short_name="IgG",
        reference_genome="Mouse mm10",
        peak_caller="MACS2",
        peak_size="Narrow",
        significance_threshold=0.01,
        uniquely_aligned_read_pairs=15265015,
        called_peaks=22236,
        reads_in_peaks=11912997,
        frip=0.7804,
    )
    data = metrics.model_dump(by_alias=True)
    assert "shortName" in data
    assert "controlShortName" in data
    assert "calledPeaks" in data
    assert "readsInPeaks" in data
    assert "significanceThreshold" in data


def test_top_called_peak_schema():
    """TopCalledPeak schema accepts valid data."""
    peak = TopCalledPeak(
        short_name="K4me3_ctrl1",
        control_short_name="IgG",
        reference_genome="Mouse mm10",
        peak_caller="MACS2",
        peak_size="Narrow",
        significance_threshold=0.01,
        top_peaks=["chr15:32920284-32924319", "chr4:62514937-62520796"],
    )
    assert len(peak.top_peaks) == 2


# --- Constants tests ---


def test_macs2_genome_sizes():
    """All supported genomes should have a MACS2 genome size mapping."""
    assert "mm10" in MACS2_GENOME_SIZES
    assert "hg38" in MACS2_GENOME_SIZES
    assert "hg19" in MACS2_GENOME_SIZES
    assert "dm6" in MACS2_GENOME_SIZES
    assert "sacCer3" in MACS2_GENOME_SIZES
    assert MACS2_GENOME_SIZES["mm10"] == "mm"
    assert MACS2_GENOME_SIZES["hg38"] == "hs"
    assert MACS2_GENOME_SIZES["sacCer3"] == "12157105"


def test_peak_caller_size_combinations():
    """Verify the PEAK_SIZES dict covers all callers and expected modes."""
    assert PEAK_SIZES["MACS2"] == {"narrow", "broad"}
    assert PEAK_SIZES["SICER2"] == {"broad"}
    assert PEAK_SIZES["SEACR"] == {"stringent", "relaxed"}
    assert set(PEAK_SIZES.keys()) == PEAK_CALLERS


def test_default_thresholds():
    """Default thresholds should match lab standards (not CUTANA Cloud)."""
    assert DEFAULT_Q_VALUE == 0.01  # Lab default, NOT 0.05
    assert DEFAULT_BROAD_CUTOFF == 0.1
    assert DEFAULT_SEACR_THRESHOLD == 0.01
    assert DEFAULT_FRAGMENT_SIZE == 120
