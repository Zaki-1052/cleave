# backend/tests/test_fastq_validation.py
"""Unit tests for FASTQ filename validation and prefix/direction extraction."""

import pytest

from services.fastq_service import validate_fastq_filename


def test_validate_standard_r1():
    """Standard Illumina R1 filename parses to correct prefix and direction."""
    prefix, direction = validate_fastq_filename("sample_L001_R1_001.fastq.gz")

    assert prefix == "sample_L001"
    assert direction == "R1"


def test_validate_r2_fq_extension():
    """R2 file with .fq.gz extension parses correctly."""
    prefix, direction = validate_fastq_filename("mydata_R2.fq.gz")

    assert prefix == "mydata"
    assert direction == "R2"


def test_rejects_empty_filename():
    """Empty filename raises ValueError."""
    with pytest.raises(ValueError, match="empty"):
        validate_fastq_filename("")


def test_rejects_path_traversal():
    """Filenames with path traversal characters are rejected."""
    # Starts with '..' which fails the alphanumeric-start check
    with pytest.raises(ValueError, match="alphanumeric"):
        validate_fastq_filename("../evil_R1.fastq.gz")

    # Contains '/' which fails the path separator check
    with pytest.raises(ValueError, match="path separators"):
        validate_fastq_filename("sub/dir_R1.fastq.gz")


def test_rejects_no_read_direction():
    """Filename without _R1 or _R2 is rejected."""
    with pytest.raises(ValueError, match="R1 or _R2"):
        validate_fastq_filename("sample_001.fastq.gz")
