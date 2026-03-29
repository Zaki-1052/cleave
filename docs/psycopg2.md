# PSycopg2 Import Origin Analysis - Cleave Backend                                                                              
                                                                                                                                   
## Summary
The "No module named 'psycopg2'" error originates from the worker process attempting to create a synchronous SQLAlchemy         
database engine that defaults to using psycopg2 as the PostgreSQL driver.                                                       

---

## Detailed Execution Path

### 1. Entry Point: Worker Process
**File:** `backend/worker.py` (lines 34-39)

```python
def _get_sync_engine():
    global _sync_engine
    if _sync_engine is None:
        sync_url = settings.DATABASE_URL.replace("+asyncpg", "")
        _sync_engine = create_engine(sync_url, pool_size=1)
    return _sync_engine
```

**Key Issue:**
- DATABASE_URL starts as `"postgresql+asyncpg://cleave:dev@localhost:5432/cleave"`
- `.replace("+asyncpg", "")` converts it to `"postgresql://cleave:dev@localhost:5432/cleave"`
- SQLAlchemy automatically selects **psycopg2** as the driver for plain `postgresql://` URLs
- This is imported by SQLAlchemy during engine creation

---

### 2. When _get_sync_engine() is Called

The sync engine is initialized when the first termination check occurs during pipeline execution.

**Location:** `backend/worker.py` (line 188)

```python
cancelled = lambda: _sync_check_terminated(job_id)
```

This callback is passed to the alignment pipeline and gets invoked during execution.

**Calling Chain:**
```
poll_and_run()
    → pipeline_run("alignment", run_params, working_dir, job_dir, cancelled=cancelled)
    → AlignmentStage.run(job_id, params, working_dir, job_dir, cancelled=cancelled)
        → _process_reaction(rxn, ctx, reaction_log)  # ctx.cancelled = the lambda
        → _run() / _run_piped()  # In base.py
            → run_cmd() or run_piped_cmd()
            → if cancelled and cancelled():  # Line 100/134 in base.py
                → _sync_check_terminated(job_id)  # First call!
                → _get_sync_engine().connect()
                    → SQLAlchemy imports psycopg2
```

---

### 3. Where Psycopg2 Gets Imported

**Trigger:** First `create_engine()` call with a plain PostgreSQL URL

**Chain:**
1. `backend/worker.py`: `create_engine(sync_url, pool_size=1)`
2. SQLAlchemy detects URL dialect is `postgresql`
3. SQLAlchemy dynamically imports: `from psycopg2 import ...`
4. If psycopg2 is not installed in the current Python environment → **ImportError**

---

## Why Alignment Pipeline Specifically?

The alignment pipeline is the most likely to trigger the error because:

1. **Termination checks are frequent** - The cancelled callback is checked in:
    - `run_cmd()` at the start of every subprocess call
    - `run_piped_cmd()` before executing piped commands

2. **Alignment has many subprocess calls** (from `backend/pipelines/alignment.py`):
    - Line 349: Bowtie2 alignment
    - Line 365: SAM→BAM conversion
    - Line 387: Filter unmapped/multi-mappers
    - Line 421: DAC exclusion filtering (if enabled)
    - Line 494: Remove duplicates (if enabled)
    - Many more for bigWig generation and heatmap processing

3. **Peak calling also triggers it** - Even more subprocess calls

---

## Database Operations During Pipeline Execution

### Operations that DON'T trigger psycopg2 import (use async engine):
- `persist_job_outputs()` - Line 238 in worker.py
    - Uses `async_session_factory()`
    - Communicates via asyncpg (not psycopg2)

- `create_trimmed_fastq_records()` - Line 230 in worker.py
    - Uses `async_session_factory()`
    - Communicates via asyncpg

- `log_event_standalone()` - Line 217 in worker.py
    - Uses `async_session_factory()`
    - Communicates via asyncpg

### Operations that DO trigger psycopg2 import (use sync engine):
- `_sync_check_terminated()` - Line 42-49 in worker.py
    - Calls `_get_sync_engine()` for the first time
    - **This is where psycopg2 is imported**

---

## Database Configuration

**File:** `backend/config.py` (line 9)
```python
DATABASE_URL: str = "postgresql+asyncpg://cleave:dev@localhost:5432/cleave"
```

**Default driver selection:**
- `postgresql+asyncpg://` → Uses asyncpg (async driver, no psycopg2 needed)
- `postgresql://` → Uses psycopg2 (sync driver, requires psycopg2 package)

---

## Subprocess Calls (For Reference - Don't Use Python)

The pipeline code does call external Python scripts, but they're executed via:
- `subprocess.run(["python", str(_TOOLS_DIR / "change.bdg.py"), ...])` in peak_calling.py

However, these are small utility scripts with no database dependencies:
- `change.bdg.py` - Simple float→integer conversion in bedgraph files
- `get_summits_seacr.py` - Coordinate extraction from peak files
- `get_summits_broadPeak.py` - Coordinate extraction from peak files

None of these subprocess-spawned Python processes need psycopg2.

---

## Files Involved in the Error Chain

### Critical Files:
1. **backend/worker.py** - Lines 34-39, 42-49, 188
    - Sync engine creation
    - Termination check function
    - Cancelled callback definition

2. **backend/pipelines/base.py** - Lines 100, 134
    - Calls to `cancelled()` that trigger first psycopg2 import

3. **backend/pipelines/alignment.py** - Line 298-299
    - Passes cancelled callback to _run() helper

4. **backend/config.py** - Line 9
    - Database URL with +asyncpg dialect

5. **backend/pyproject.toml** - Line 16
    - Dependency: psycopg2-binary (must be installed)

---

## Root Cause Summary

The error occurs because:

1. **Setup:** Worker process defines a sync SQLAlchemy engine factory (_get_sync_engine)
2. **Trigger:** First pipeline execution attempts to check if job termination was requested
3. **Import:** The termination check needs a sync database connection
4. **Failure:** SQLAlchemy tries to import psycopg2, which isn't available in the subprocess environment
5. **Result:** "No module named 'psycopg2'" error

---

## Solution Approaches

1. **Ensure psycopg2-binary is installed** in the worker environment (from pyproject.toml)
2. **Use asyncpg for all checks** instead of creating a sync engine
3. **Import psycopg2 at worker startup** instead of lazy-loading it during pipeline execution
4. **Remove termination checks** if the database driver is unavailable (nuclear option)
