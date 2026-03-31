# Phase 4.3: Peak Calling QC Report — Peak Annotation Chart + Bug Fixes + Tests

## Context

Phase 4.2 built the Peak Calling QC Report panel with FRiP metrics table, top called peaks, and CSV download. The **peak annotation stacked bar chart** was explicitly deferred. A bug in `top_peaks` file resolution was also discovered. No backend tests were added for the QC endpoints. This plan completes Phase 4.3 per PLAN.md §4.3.

---

## Step 1: Bug Fix — top_peaks file_category mismatch

**Problem**: `qc_report_service.py:282` calls `_resolve_output_path(job, "top_peaks", "csv")` but the pipeline registers `top_called_peaks.csv` with `file_category: "qc_report"` (not `"top_peaks"`). Since `peak_caller_metrics.csv` is ALSO `"qc_report"` + `"csv"`, `_resolve_output_path` returns the first match (metrics CSV), meaning top_peaks is always `None`.

**Fix**:
1. **`backend/services/qc_report_service.py`** — Add `_resolve_output_by_name(job, filename)` helper that finds a job output by exact filename. Update line 282 to use fallback:
   ```python
   top_peaks_path = (
       _resolve_output_path(job, "top_peaks", "csv")
       or _resolve_output_by_name(job, "top_called_peaks.csv")
   )
   ```
2. **`backend/pipelines/peak_calling.py`** — Change `file_category` for `top_called_peaks.csv` from `"qc_report"` to `"top_peaks"` in both `run()` (~line 1117) and `mock_run()` (~line 1285). New jobs get the correct category; the service fallback handles old jobs.

---

## Step 2: Backend — Annotation Data Schema + Parsing

### 2a. New Pydantic schemas (`backend/schemas/qc_report.py`)

Add after `TopCalledPeak`:

```python
class PeakAnnotationResult(CamelModel):
    """Per-reaction peak annotation distribution (% peaks per genomic feature)."""
    short_name: str
    categories: dict[str, float]  # e.g. {"Promoter": 23.5, "Intron": 37.0, ...}
```

Update `PeakCallingQCReport`:
```python
class PeakCallingQCReport(CamelModel):
    ...
    annotations: list[PeakAnnotationResult] | None = None  # NEW
```

Update import in `qc_report_service.py` to include `PeakAnnotationResult`.

### 2b. HOMER annotation_stats parser (`backend/services/qc_report_service.py`)

Add constants and parsing functions:

- `ANNOTATION_CATEGORIES` ordered list: `["Promoter", "Exon", "Intron", "Intergenic", "3UTR", "5UTR", "TTS", "ncRNA", "miRNA", "pseudo"]`
- `_classify_annotation(raw_label: str) -> str` — prefix-based mapping from HOMER labels (e.g. `"Promoter-TSS"` → `"Promoter"`, `"3' UTR"` → `"3UTR"`, `"non-coding"` → `"ncRNA"`, etc.)
- `_parse_annotation_stats(stats_path: Path) -> dict[str, float]` — reads HOMER stats file, counts peaks per category, returns `{category: percentage}`
- `_resolve_all_outputs(job, category, file_type) -> list[tuple[int | None, Path]]` — finds ALL job outputs matching category+type (not just first), returns `(reaction_id, path)` pairs

### 2c. Integrate into `get_peak_calling_qc_report()`

After loading `top_peaks`, add:
1. Call `_resolve_all_outputs(job, "annotation_stats", "txt")` to find all per-reaction annotation stats files
2. For each `(reaction_id, stats_path)`, parse the stats and build `PeakAnnotationResult`
3. Map `reaction_id` → `short_name` from `job.params["reactions"]` list (each entry has `"reaction_id"` and `"short_name"`)
4. Set `annotations` field on the response

### 2d. Annotation CSV download endpoint

- **Service**: `get_peak_annotation_csv(db, job_id, user_id) -> str` — generates a CSV string with columns `Short_Name, Promoter, Exon, Intron, Intergenic, 3UTR, 5UTR, TTS, ncRNA, miRNA, pseudo`
- **Router** (`backend/routers/jobs.py`): `GET /jobs/{job_id}/peak-qc-report/annotation-csv` → returns `Response(content=csv_str, media_type="text/csv")`
- Same auth/validation pattern as existing peak QC endpoints

---

## Step 3: Mock Pipeline — Vary Annotation Data

**`backend/pipelines/peak_calling.py`** mock_run (~line 1231-1240):

The current mock writes identical annotation_stats for all reactions. Update to vary by IgG vs target:
- **IgG-like** (when `igg_short_name` is absent / self-referencing): Heavy intergenic/intron, low promoter
- **Target-like**: Heavy promoter, moderate exon, lower intergenic — matching H3K4me3 biology
- Add missing categories: `5' UTR`, `non-coding` so all 10 CUTANA categories are represented

---

## Step 4: Frontend Types + API

### 4a. Types (`frontend/src/api/types.ts`)

Add:
```typescript
export interface PeakAnnotationResult {
  shortName: string;
  categories: Record<string, number>;
}
```

Update `PeakCallingQCReport`:
```typescript
export interface PeakCallingQCReport {
  ...
  annotations: PeakAnnotationResult[] | null;  // NEW
}
```

### 4b. API function (`frontend/src/api/jobs.ts`)

Add `downloadPeakAnnotationCsv(jobId: number): Promise<void>` — GET `/jobs/{jobId}/peak-qc-report/annotation-csv` with blob download.

---

## Step 5: Frontend — PeakAnnotationChart Component

Create `frontend/src/components/peak-calling/PeakAnnotationChart.tsx`.

This is the **first Recharts chart** in the codebase. Recharts v2.15.0 is already installed.

### Structure:
- Props: `{ jobId, annotations, referenceGenome }`
- Transform `annotations` array into Recharts data format: `[{ shortName: "IgG", Promoter: 7.0, Exon: 3.5, ... }]`
- Render `<BarChart layout="vertical">` with stacked `<Bar>` for each of the 10 annotation categories
- `<ResponsiveContainer>` with dynamic height based on reaction count (~40px per bar + padding)
- Color palette (10 distinct colors matching CUTANA Cloud):
  - Promoter: deep orange, Exon: green, Intron: blue, Intergenic: yellow, 3UTR: purple, 5UTR: pink, TTS: lilac, ncRNA: dark red, miRNA: dark purple, pseudo: amber
- Tooltip showing `{category}: {value}%` on hover
- Legend with all 10 categories

### Toolbar:
- **Download Image as PNG**: Serialize the SVG from the chart container → draw to canvas → export as PNG (zero-dependency approach, no html2canvas needed)
- **Download Data as CSV**: Call `downloadPeakAnnotationCsv(jobId)`

### Card wrapper with title: `"{referenceGenome} Feature Distribution"`

---

## Step 6: Integrate Chart into QC Report Panel

**`frontend/src/components/peak-calling/PeakCallingQCReportPanel.tsx`**:

1. Import `PeakAnnotationChart`
2. After the Top Called Peaks section (line ~170, before closing `</div>` of the left column), add:
   ```tsx
   {report.annotations && report.annotations.length > 0 && (
     <PeakAnnotationChart
       jobId={jobId}
       annotations={report.annotations}
       referenceGenome={genome}
     />
   )}
   ```
3. Add "About Peak Annotation Plots" section to the info sidebar (after FRiP Color Coding section, ~line 214):
   - Text from cutana-cloud-ui.md §6g-iii: "Visual breakdown of where peaks fall relative to genomic features..."

---

## Step 7: Backend Tests

**`backend/tests/test_qc_report.py`** — add peak calling QC tests alongside existing alignment QC tests.

### Test helpers needed:
- `PEAK_QC_CSV_HEADERS` and `SAMPLE_PEAK_QC_ROWS` — sample data matching CUTANA export format
- `_write_peak_qc_csv(csv_path)` — write test CSV
- `_write_top_peaks_csv(csv_path)` — write test top peaks CSV
- `_write_annotation_stats(stats_path, is_igg=False)` — write test HOMER stats
- `_create_peak_calling_job_with_qc(db, ...)` — helper that creates a complete peak calling job with all output files registered

### Tests:
1. `test_get_peak_qc_report_success` — verifies JSON structure, metrics fields, FRiP values
2. `test_get_peak_qc_report_with_top_peaks` — verifies top_peaks included (tests the bug fix)
3. `test_get_peak_qc_report_with_annotations` — verifies annotations with correct percentages
4. `test_get_peak_qc_report_not_found` — 404 for nonexistent job
5. `test_get_peak_qc_report_wrong_status` — 409 for non-complete job
6. `test_get_peak_qc_report_unauthorized` — 404 for non-member user
7. `test_download_peak_qc_csv` — verifies CSV file download
8. `test_download_peak_annotation_csv` — verifies annotation CSV download

---

## Step 8: Validation

1. `ruff check backend/ && ruff format backend/`
2. `cd frontend && npx tsc --noEmit && npm run lint`
3. `docker compose exec api pytest tests/test_qc_report.py -v`
4. Manual verification: trigger mock peak calling job → view QC Report tab → confirm:
   - FRiP table renders with color coding
   - Top peaks section shows genomic coordinates (bug fix verified)
   - Stacked bar chart renders with 10 color-coded categories
   - IgG bar looks different from target bars (varied mock data)
   - Download PNG produces a valid image
   - Download CSV (both metrics and annotation) produce valid files
   - Info sidebar has both FRiP and Annotation explanations

---

## Files Modified

| File | Change |
|------|--------|
| `backend/schemas/qc_report.py` | Add `PeakAnnotationResult`, update `PeakCallingQCReport` |
| `backend/services/qc_report_service.py` | Add annotation parsing, `_resolve_output_by_name`, `_resolve_all_outputs`, `get_peak_annotation_csv`; fix top_peaks resolution |
| `backend/routers/jobs.py` | Add `/jobs/{job_id}/peak-qc-report/annotation-csv` endpoint |
| `backend/pipelines/peak_calling.py` | Fix top_peaks `file_category`; vary mock annotation data |
| `frontend/src/api/types.ts` | Add `PeakAnnotationResult`, update `PeakCallingQCReport` |
| `frontend/src/api/jobs.ts` | Add `downloadPeakAnnotationCsv()` |
| `frontend/src/components/peak-calling/PeakAnnotationChart.tsx` | **NEW** — Recharts stacked bar chart |
| `frontend/src/components/peak-calling/PeakCallingQCReportPanel.tsx` | Integrate chart + update info sidebar |
| `backend/tests/test_qc_report.py` | Add ~8 peak calling QC tests |

## Key Patterns Reused

- `CamelModel` for all Pydantic schemas (auto snake_case → camelCase)
- `_resolve_output_path` / `_get_authorized_job` service helpers
- `Card` wrapper for frontend sections
- Same two-column layout as alignment QC (flex-1 main + w-80 sidebar)
- Same download blob pattern from `downloadPeakCallingQCCsv`
- Same error/loading state pattern from existing panel
