# backend/tests/test_pipeline_base.py
"""Unit tests for pipeline base utility functions."""

from pipelines.base import (
    append_to_master_log,
    get_threads,
    resolve_blacklist,
    run_cmd,
)


def test_get_threads_returns_positive_int():
    """get_threads() returns a positive integer (os.cpu_count() or fallback 4)."""
    result = get_threads()

    assert isinstance(result, int)
    assert result > 0


def test_append_to_master_log_writes_content(tmp_path):
    """append_to_master_log writes a timestamped section with separator, header, and content."""
    log_file = tmp_path / "master.log"

    append_to_master_log(log_file, "STEP 1 | echo hello", "hello world output")

    text = log_file.read_text()
    assert "=" * 72 in text
    assert "STEP 1 | echo hello" in text
    assert "hello world output" in text
    assert "UTC" in text


def test_append_to_master_log_skips_none():
    """Passing None as master_log does nothing (no error)."""
    # Should not raise any exception
    append_to_master_log(None, "header", "content")


def test_resolve_blacklist_none_type():
    """resolve_blacklist with type 'none' always returns None."""
    result = resolve_blacklist("mm10", "none")

    assert result is None


def test_run_cmd_echo_success():
    """run_cmd successfully executes a simple echo command."""
    proc = run_cmd(["echo", "hello"], check=True)

    assert proc.returncode == 0
    assert "hello" in proc.stdout
