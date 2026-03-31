# Plan: Add 15 Targeted Tests (485 → 500)

## Context
The backend test suite has 485 passing tests across 27 files. The goal is to add exactly 15 well-targeted tests to reach 500. All tests are pure unit tests (no DB interaction needed) targeting functions with **zero direct test coverage**.

## Three New Test Files

### 1. `backend/tests/test_download_token_service.py` (5 tests)
**Target**: `services/download_token_service.py` — HMAC-signed token creation/verification. Zero direct tests exist (only tested indirectly via HTTP endpoints in `test_files.py`).

| # | Test Name | What It Tests |
|---|-----------|---------------|
| 1 | `test_create_and_verify_roundtrip` | Create token → verify returns original payload + exp_ts |
| 2 | `test_expired_token_rejected` | Token with `ttl=-10` → verify returns None |
| 3 | `test_tampered_signature_rejected` | Modify signature portion → verify returns None |
| 4 | `test_tampered_payload_rejected` | Modify payload portion → verify returns None |
| 5 | `test_malformed_token_no_dot` | String without `.` separator → verify returns None |

### 2. `backend/tests/test_pipeline_base.py` (5 tests)
**Target**: `pipelines/base.py` — utility functions (`get_threads`, `append_to_master_log`, `resolve_blacklist`, `run_cmd`). Zero direct unit tests exist.

| # | Test Name | What It Tests |
|---|-----------|---------------|
| 6 | `test_get_threads_returns_positive_int` | `get_threads()` returns int > 0 |
| 7 | `test_append_to_master_log_writes_content` | Writes timestamped section to file with separator + header + content |
| 8 | `test_append_to_master_log_skips_none` | `None` master_log → no error (early return) |
| 9 | `test_resolve_blacklist_none_type` | `resolve_blacklist("mm10", "none")` returns None |
| 10 | `test_run_cmd_echo_success` | `run_cmd(["echo", "hello"])` → returncode 0, "hello" in stdout |

### 3. `backend/tests/test_fastq_validation.py` (5 tests)
**Target**: `services/fastq_service.validate_fastq_filename()` — pure function for FASTQ name parsing. Zero direct unit tests (only tested through API layer in `test_fastq_upload.py`).

| # | Test Name | What It Tests |
|---|-----------|---------------|
| 11 | `test_validate_standard_r1` | `"sample_L001_R1_001.fastq.gz"` → `("sample_L001", "R1")` |
| 12 | `test_validate_r2_fq_extension` | `"mydata_R2.fq.gz"` → `("mydata", "R2")` |
| 13 | `test_rejects_empty_filename` | `""` → raises ValueError |
| 14 | `test_rejects_path_traversal` | `"../evil_R1.fastq.gz"` → raises ValueError |
| 15 | `test_rejects_no_read_direction` | `"sample_001.fastq.gz"` → raises ValueError |

## Implementation Notes
- All 15 tests are **synchronous** `def test_...` (no async needed)
- The autouse `setup_db` fixture will run but these tests don't touch the DB
- `echo` is available in the Docker container for `run_cmd` test
- `ttl=-10` for expired token test is proven to work (used in existing `test_files.py:482`)
- No changes to existing files needed

## Verification
```bash
docker compose exec api pytest tests/test_download_token_service.py tests/test_pipeline_base.py tests/test_fastq_validation.py -v
docker compose exec api pytest tests/ --co -q | tail -1  # confirm total count
```
