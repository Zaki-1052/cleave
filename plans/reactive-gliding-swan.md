# Plan: Fix Path Traversal via Reaction `short_name`

## Context

The security review identified one confirmed HIGH-severity vulnerability: the `short_name` field on reactions accepts arbitrary strings (including `../`, `/`, `\`) and is used directly in f-string file path construction in `alignment.py` at 20+ locations. An authenticated contributor can write pipeline output files outside the intended job directory within `STORAGE_ROOT` by creating a reaction with a malicious `short_name` like `../../other_project/1/jobs/1/bams/victim`.

## Fix Strategy: Defense in Depth (2 layers)

### Layer 1 — Schema Validation (primary fix)

**File:** `backend/schemas/reaction.py`

Add a shared `_validate_short_name()` helper (same pattern as existing `_validate_organism()`) and apply it via `field_validator` to both `ReactionCreate.short_name` and `ReactionUpdate.short_name`.

**Validation rules:**
- Must be non-empty, max 100 characters (matches experiment name limit)
- Must start with alphanumeric character (matches FASTQ filename rule)
- Only allows: letters, digits, underscores, hyphens, dots
- Rejects: `/`, `\`, `..`, null bytes, any other path-unsafe characters
- Regex: `^[A-Za-z0-9][A-Za-z0-9_\-\.]{0,99}$`

Also apply the same validation to `fastq_prefix` in `ReactionCreate` and `ReactionUpdate` — it follows the same risk pattern (used in file paths during trimming/alignment), though currently partially protected by the FASTQ filename validation at upload time. Belt-and-suspenders.

### Layer 2 — Pipeline-Level Sanitization (defense in depth)

**File:** `backend/pipelines/alignment.py`

Add a `_sanitize_path_component(value: str) -> str` function called at line ~435 (where `short_name` is extracted from params) that:
- Raises `PipelineError` if value contains `/`, `\`, `..`, or null bytes
- This catches any bypass of schema validation (e.g., direct DB manipulation, CSV import edge cases)

### Layer 3 — CSV Import Validation

**File:** `backend/services/reaction_service.py`

The CSV import path (`import_reactions_csv()`) constructs `ReactionCreate` objects from CSV rows — these already go through Pydantic validation, so the new `field_validator` will automatically protect this path. No additional changes needed, but verify in tests.

## Files to Modify

1. **`backend/schemas/reaction.py`** — Add `_validate_short_name()` and `_validate_fastq_prefix()` validators
2. **`backend/pipelines/alignment.py`** — Add `_sanitize_path_component()` defense-in-depth check at reaction processing entry point
3. **`backend/tests/test_reactions.py`** — Add tests for short_name validation (path traversal, special chars, boundary cases)
4. **`backend/tests/test_alignment_pipeline.py`** — Add test for pipeline-level sanitization rejecting malicious short_name

## Implementation Steps

### Step 1: Schema validators in `reaction.py`

Add `_validate_short_name()` helper with the regex above. Apply to:
- `ReactionCreate.short_name` (required field)
- `ReactionUpdate.short_name` (optional field, validate only if not None)

Add `_validate_fastq_prefix()` helper with same character rules. Apply to:
- `ReactionCreate.fastq_prefix`
- `ReactionUpdate.fastq_prefix`

### Step 2: Pipeline defense-in-depth in `alignment.py`

Add at line ~435 (inside the per-reaction loop, after extracting `short_name`):
```python
# Defense-in-depth: reject path-unsafe characters even if schema validation is bypassed
if not re.match(r'^[A-Za-z0-9][A-Za-z0-9_\-\.]*$', short_name):
    raise PipelineError(
        f"Invalid short_name '{short_name}': contains unsafe characters"
    )
```

### Step 3: Tests for reaction validation

In `test_reactions.py`, add:
- `test_create_reaction_rejects_path_traversal` — `short_name: "../../../evil"` → 422
- `test_create_reaction_rejects_slash` — `short_name: "foo/bar"` → 422
- `test_create_reaction_rejects_backslash` — `short_name: "foo\\bar"` → 422
- `test_create_reaction_rejects_null_byte` — `short_name: "foo\x00bar"` → 422
- `test_create_reaction_valid_chars` — `short_name: "K4me3_ctrl-1.rep2"` → 200
- `test_csv_import_rejects_path_traversal` — CSV with traversal short_name → 422

### Step 4: Test for pipeline sanitization

In `test_alignment_pipeline.py`, add:
- `test_validate_rejects_path_traversal_short_name` — params with `../evil` short_name → validation error

## Verification

```bash
docker compose exec api pytest tests/test_reactions.py -v
docker compose exec api pytest tests/test_alignment_pipeline.py -v
docker compose exec api ruff check .
```
