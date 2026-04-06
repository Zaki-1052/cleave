# 2026-03-27 — Fix: db_session Fixture Teardown Errors

## What Was Done

Fixed `RuntimeError: Task got Future attached to a different loop` errors that occurred during teardown of the `db_session` fixture in tests using both `client` and `db_session`.

### Root Cause

Two pytest async plugins were active simultaneously:
1. **pytest-asyncio** (installed, `asyncio_mode = "auto"` in pyproject.toml)
2. **anyio's built-in pytest plugin** (`anyio.pytest_plugin`, transitive dep via httpx/starlette)

Both have `pytest_fixture_setup` hooks that wrap async generator fixtures. When a test used `@pytest.mark.anyio` (which activates anyio's plugin) AND `asyncio_mode = "auto"` (which activates pytest-asyncio's plugin), the `db_session` fixture got **double-wrapped**. Setup ran in one plugin's event loop, teardown ran in the other's. asyncpg connections are loop-bound, so `session.close()` → `connection.rollback()` hit a different loop and raised `RuntimeError`.

### Why Only test_files.py and test_tus_upload.py

These were the only files using `@pytest.mark.anyio` markers. All other test files relied solely on `asyncio_mode = "auto"` — one plugin, one loop, no conflict.

### Fix

Removed all `@pytest.mark.anyio` markers from `test_files.py` (30 occurrences) and `test_tus_upload.py` (7 occurrences). With `asyncio_mode = "auto"`, pytest-asyncio auto-detects `async def test_*` functions — the markers were redundant.

### Files Modified
- `backend/tests/test_files.py` — removed `@pytest.mark.anyio` markers, removed unused `pytest` import (re-added since `pytest.raises` still needed)
- `backend/tests/test_tus_upload.py` — removed `@pytest.mark.anyio` markers and now-unused `pytest` import

### Result
- Before: 296 passed + 7 teardown errors
- After: 296 passed, 0 failed, 0 errors
