# Phase 2.5: Reactions Backend — Implementation Plan

## Context

Phase 2 (Data Management) is in progress. Steps 2.1–2.4 are complete (FASTQ upload, FastQC integration, FastQC report viewer). Step 2.5 builds the reactions CRUD and CSV import/export — the sample metadata layer that links FASTQ files to biological samples. Reactions are the bridge between raw data (FASTQs) and analysis jobs (alignment, peak calling). Without reactions, experiments cannot proceed to Phase 3.

The Reaction model, basic schemas, and a stub router already exist. The task is to implement the service layer, replace the stub router with full endpoints, extend the schemas, and write tests.

---

## Files to Modify/Create

| File | Action | Description |
|------|--------|-------------|
| `backend/schemas/reaction.py` | **Modify** | Add `ReactionUpdate`, `PrefixInfo`, `CsvImportResponse`; add field validators |
| `backend/services/reaction_service.py` | **Create** | All business logic: CRUD, CSV parsing, prefix detection |
| `backend/routers/reactions.py` | **Rewrite** | Replace 2 stub endpoints with 8 real endpoints |
| `backend/tests/test_reactions.py` | **Create** | ~20 integration tests |

No model changes. No migrations. No new dependencies (stdlib `csv` + `io` suffice).

---

## Step 1: Schema Additions (`backend/schemas/reaction.py`)

### 1a. Add `ReactionUpdate` (partial update, all fields optional)

Same fields as `ReactionCreate` but every field is `T | None = None`. Follows the `ExperimentUpdate` pattern — used with `model_dump(exclude_unset=True)` in the service layer.

### 1b. Add field validators on `ReactionCreate`

- `organism` must be one of `Organism` enum values (`Human`, `Mouse`, `Drosophila`, `Yeast`) from `schemas/common.py`
- `assay_type` must be one of `AssayType` enum values (`CUT&RUN`, `CUT&Tag`)

Use `@field_validator`. Apply equivalent validators to `ReactionUpdate` (only when field is not None).

### 1c. Add `PrefixInfo` response schema

```python
class PrefixInfo(CamelModel):
    model_config = ConfigDict(from_attributes=True)
    prefix: str
    has_r1: bool
    has_r2: bool
```

Powers the "auto-detect FASTQ prefix" feature for the frontend dropdown.

### 1d. Add `CsvImportResponse`

```python
class CsvImportResponse(CamelModel):
    created: int
    reactions: list[ReactionRead]
    warnings: list[str]
```

---

## Step 2: Service Layer (`backend/services/reaction_service.py`)

### Permission helper

Duplicate `_get_experiment_with_permission()` from `fastq_service.py` (same join pattern: `Experiment` → `ProjectMember` → role check). Add a `# TODO: extract to shared module` comment — refactoring fastq_service is out of scope for this step.

### CRUD functions

All follow the established pattern: return `None` on permission failure, let router decide HTTP status.

| Function | Auth | Notes |
|----------|------|-------|
| `list_reactions(db, exp_id, user_id, page, per_page)` | any role | Paginated, ordered by `Reaction.id` |
| `create_reaction(db, exp_id, data, user_id)` | admin/contributor | Catch `IntegrityError` → raise `ValueError` for unique constraint |
| `bulk_create_reactions(db, exp_id, reactions_data, user_id)` | admin/contributor | Validate no duplicate `(organism, short_name)` within batch before insert. All-or-nothing. |
| `update_reaction(db, exp_id, reaction_id, data, user_id)` | admin/contributor | `model_dump(exclude_unset=True)` pattern. Catch `IntegrityError`. |
| `delete_reaction(db, exp_id, reaction_id, user_id)` | admin/contributor | Returns `bool` |

### CSV parsing (pure function, no DB)

`parse_reaction_csv(csv_content: str, default_assay_type: str | None = None) -> tuple[list[ReactionCreate], list[str]]`

**Column mapping** (from `cutana/H3K4me3/H3K4me3-reactions.csv`):

| CSV Header | Model Field | Conversion |
|---|---|---|
| `FASTQ_Prefix` | `fastq_prefix` | str |
| `Short_Name` | `short_name` | str |
| `Organism` | `organism` | str |
| `Assay_Type` | `assay_type` | str |
| `E.coli_Spike_in` | `ecoli_spike_in` | "Yes"/"No" → bool |
| `CUTANA_Spike_in` | `cutana_spike_in` | str |
| `CUTANA_Spike_in_Target` | `cutana_spike_in_target` | str or "" → None |
| `Cell_Type` | `cell_type` | str or "" → None |
| `Cell_Number` | `cell_number` | str or "" → None |
| `Sample_Prep` | `sample_prep` | str or "" → None |
| `Cell_Prep` | `sample_prep` | alias (CUTANA UI maps this) |
| `Experimental_Condition` | `experimental_condition` | str or "" → None |
| `Antibody_Vendor` | `antibody_vendor` | str or "" → None |
| `Antibody_Cat_No` | `antibody_cat_no` | str or "" → None |
| `Antibody_Lot_No` | `antibody_lot_no` | str or "" → None |
| `CUTANA_Spike_in_2` | `cutana_spike_in_2` | str or "" → None |
| `CUTANA_Spike_in_Target_2` | `cutana_spike_in_target_2` | str or "" → None |
| `Reference_Genome` | **ignored** | Not a reaction field; add to warnings |

Key implementation details:
- Use `csv.DictReader` with header normalization (lowercase + replace spaces with underscores)
- Boolean conversion: accept `Yes/No/yes/no/TRUE/FALSE/1/0/""` for `ecoli_spike_in`
- Empty strings → `None` for all optional fields
- If `assay_type` is missing from a row, use `default_assay_type` param (experiment's assay type)
- Validate required columns exist in header: `fastq_prefix`, `short_name`, `organism`
- Skip blank rows
- Collect warnings for unknown columns, ignored columns, empty optional fields

### Template generation

`generate_csv_template() -> str` — returns CSV string with the CUTANA-format headers and zero data rows.

### Prefix detection

`get_fastq_prefixes(db, exp_id, user_id) -> list[dict] | None` — query `FastqFile` for distinct prefixes, check R1/R2 existence per prefix.

---

## Step 3: Router Rewrite (`backend/routers/reactions.py`)

Router already mounted at `/api/v1` in `main.py` line 40.

**Important**: Static path segments (`/template`, `/import-csv`, `/prefixes`, `/bulk`) must be defined BEFORE `/{reaction_id}` to avoid FastAPI treating them as path params.

### Endpoints

| # | Method | Path | Response | Status | Notes |
|---|--------|------|----------|--------|-------|
| 1 | GET | `/experiments/{eid}/reactions` | `PaginatedResponse[ReactionRead]` | 200 | Paginated list. Query: `page`, `perPage` |
| 2 | POST | `/experiments/{eid}/reactions` | `ReactionRead` | 201 | Single create. 403 on auth fail, 409 on duplicate |
| 3 | POST | `/experiments/{eid}/reactions/bulk` | `CsvImportResponse` | 201 | JSON bulk create via `ReactionBulkCreate` body |
| 4 | POST | `/experiments/{eid}/reactions/import-csv` | `CsvImportResponse` | 201 | CSV file upload. Read bytes, decode UTF-8 (Latin-1 fallback), parse, bulk create |
| 5 | GET | `/experiments/{eid}/reactions/template` | StreamingResponse | 200 | `text/csv`, `Content-Disposition: attachment` |
| 6 | GET | `/experiments/{eid}/reactions/prefixes` | `list[PrefixInfo]` | 200 | FASTQ prefix auto-detection |
| 7 | PATCH | `/experiments/{eid}/reactions/{rid}` | `ReactionRead` | 200 | Partial update. 409 on duplicate |
| 8 | DELETE | `/experiments/{eid}/reactions/{rid}` | — | 204 | 404 if not found/unauthorized |

### Error handling pattern (matching fastq_files.py)

- Service returns `None` → router raises `HTTPException(403)` or `HTTPException(404)`
- Service raises `ValueError` → router raises `HTTPException(409)` for unique constraint, `HTTPException(422)` for validation
- CSV decode errors → `HTTPException(422, detail="Invalid CSV...")`

---

## Step 4: Tests (`backend/tests/test_reactions.py`)

Follow `test_experiments.py` pattern: helper functions for setup, camelCase JSON keys.

### Helpers
- `_register_and_get_headers(client, email)` — register + return auth headers
- `_create_project(client, headers)` — create project, return ID
- `_create_experiment(client, headers, project_id)` — create experiment, return ID

### Test cases (~20)

**CRUD:**
1. `test_create_reaction_success` — verify all fields returned in camelCase
2. `test_create_reaction_invalid_organism` — expect 422
3. `test_create_reaction_invalid_assay_type` — expect 422
4. `test_create_reaction_missing_required_field` — expect 422
5. `test_create_reaction_duplicate_short_name` — second create with same (organism, shortName) → 409
6. `test_create_reaction_nonmember` — expect 403
7. `test_create_reaction_viewer_forbidden` — viewer role → 403
8. `test_list_reactions_success` — create 3, verify total=3
9. `test_list_reactions_pagination` — create 3, perPage=2, verify pagination envelope
10. `test_update_reaction_success` — PATCH shortName, verify change
11. `test_update_reaction_partial` — PATCH only one field, others unchanged
12. `test_update_reaction_unique_violation` — PATCH to create duplicate → 409
13. `test_delete_reaction_success` — 204, verify gone
14. `test_delete_reaction_viewer_forbidden` — viewer → 404

**Bulk/CSV:**
15. `test_bulk_create_success` — POST /bulk with 3 reactions
16. `test_bulk_create_duplicate_within_batch` — two reactions with same key → 409/422
17. `test_import_csv_success` — upload CUTANA-format CSV
18. `test_import_csv_boolean_conversion` — "Yes"/"No" → bool
19. `test_import_csv_missing_required_column` — no Short_Name header → 422
20. `test_download_template` — GET template, verify CSV headers

**Prefix detection:**
21. `test_list_prefixes_with_uploads` — upload R1+R2, verify prefix with hasR1/hasR2
22. `test_list_prefixes_empty` — no uploads, verify empty list

---

## Verification

1. `ruff check backend/ && ruff format backend/` — lint + format
2. `pytest backend/tests/test_reactions.py -v` — new tests pass
3. `pytest backend/tests/` — full suite passes (no regressions)
4. Manual curl checks:
   - `POST /api/v1/experiments/{id}/reactions` with JSON body → 201
   - `GET /api/v1/experiments/{id}/reactions` → paginated list
   - `POST /api/v1/experiments/{id}/reactions/import-csv` with CSV file → 201
   - `GET /api/v1/experiments/{id}/reactions/template` → CSV download
   - `GET /api/v1/experiments/{id}/reactions/prefixes` → prefix list
