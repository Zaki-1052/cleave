# Phase 2.4: FastQC Report Viewer Modal

## Context

Phase 2.3 added FastQC integration — reports auto-generate post-upload, HTML is served via `GET /experiments/{eid}/fastqs/{fid}/fastqc`, and the FASTQC column in the FASTQs table has a clickable icon. Currently that icon **opens the report in a new browser tab**. Per PLAN.md §2.4 and `cutana-cloud-ui.md` §6b-i, we need a **modal viewer** with a summary sidebar showing pass/fail/warning per module.

**Problem**: The module summary data (already parsed by `parse_fastqc_data()` in `backend/pipelines/fastqc.py`) is never exposed to the frontend — it's only used internally during FastQC processing. The frontend has no way to render a summary sidebar.

**Outcome**: Clicking the FASTQC icon opens a large modal with a left sidebar (module statuses) and an iframe rendering the full HTML report, plus Download Report and Full Screen toolbar buttons.

---

## Implementation Steps

### Step 1: Fix mock mode to copy TXT alongside HTML

**File**: `backend/pipelines/fastqc.py` — `mock_run_for_file()` (line 99)

Currently mock mode copies only the HTML from `cutana/fastqc/`. The new summary endpoint needs the TXT file on disk to parse module statuses. Add a copy of the TXT next to the HTML:

```python
dest_txt = output_dir / f"{stem}_fastqc_data.txt"
shutil.copy2(sample_txt, dest_txt)
```

### Step 2: Add `find_fastqc_data_txt()` helper

**File**: `backend/pipelines/fastqc.py` — new function

Given an HTML report path, locate the corresponding TXT data file. Must handle two layouts:
- **Real mode**: `{stem}_fastqc/fastqc_data.txt` (extracted subdirectory)
- **Mock mode**: `{stem}_fastqc_data.txt` (flat, next to HTML)

```python
def find_fastqc_data_txt(html_abs_path: Path) -> Path | None:
```

### Step 3: Add summary response schema

**File**: `backend/schemas/fastq_file.py`

Two new `CamelModel` schemas:

```python
class FastqcModuleSummary(CamelModel):
    name: str        # e.g. "Basic Statistics"
    status: str      # "pass", "warn", or "fail"

class FastqcSummaryResponse(CamelModel):
    filename: str
    total_reads: int | None = None
    module_summaries: list[FastqcModuleSummary]
```

Using a list (not dict) preserves module ordering from the FastQC report.

### Step 4: Add `GET .../fastqc-summary` endpoint

**File**: `backend/routers/fastq_files.py`

New endpoint adjacent to existing `get_fastqc_report`:

```
GET /api/v1/experiments/{experiment_id}/fastqs/{fastq_id}/fastqc-summary
→ FastqcSummaryResponse
```

- Same auth pattern as `get_fastqc_report` (`_check_experiment_membership`)
- Same path traversal guard
- Resolves HTML path → finds TXT via `find_fastqc_data_txt()` → parses with existing `parse_fastqc_data()` → returns structured JSON

**Reuses**: `_check_experiment_membership()` (line 37), `parse_fastqc_data()` from `pipelines/fastqc.py` (line 52), path traversal guard pattern (lines 147-150).

### Step 5: Add frontend API function + types

**File**: `frontend/src/api/fastqs.ts`

```typescript
export interface FastqcModuleSummary {
  name: string;
  status: string;
}

export interface FastqcSummaryResponse {
  filename: string;
  totalReads: number | null;
  moduleSummaries: FastqcModuleSummary[];
}

export async function getFastqcSummary(
  experimentId: number, fastqId: number
): Promise<FastqcSummaryResponse>
```

Types co-located in `fastqs.ts` following existing pattern (`FastqUploadResponse` is in `fastqs.ts`, not `types.ts`).

### Step 6: Add `useFastqcSummary` hook

**File**: `frontend/src/hooks/useFastqs.ts`

```typescript
export function useFastqcSummary(experimentId: number, fastqId: number | null) {
  return useQuery({
    queryKey: ['fastqc-summary', experimentId, fastqId],
    queryFn: () => fastqsApi.getFastqcSummary(experimentId, fastqId!),
    enabled: fastqId !== null,
  });
}
```

Query only fires when a FASTQ is selected (modal open).

### Step 7: Create `FastqcReportModal` component

**File**: `frontend/src/components/fastqs/FastqcReportModal.tsx` — **NEW**

Follows `WizardModal` structural pattern (own backdrop, blue header, close button — does NOT reuse `Modal` component since that's capped at `max-w-2xl`).

**Layout**:
```
+--------------------------------------------------+
| [bg-primary] FASTQC Report                  [X]  |
+--------------------------------------------------+
| [toolbar] Download Report  |  Full Screen        |
+--------------------------------------------------+
| Summary Sidebar  |  iframe (FastQC HTML)         |
| w-56, bg-gray-50 |  flex-1                       |
| - module list    |                               |
|   with status    |                               |
|   icons          |                               |
+--------------------------------------------------+
```

**Props**: `isOpen`, `onClose`, `experimentId`, `fastqId: number | null`, `filename: string`

**Key behaviors**:
- **Sizing**: `h-[90vh] w-[95vw] max-w-7xl` (normal), full viewport (full screen toggle)
- **Sidebar**: Fetches module summaries via `useFastqcSummary`. Shows loading skeleton while fetching. Each module is a clickable button with a status icon (green checkmark / red X / amber warning triangle — inline SVGs matching codebase convention)
- **Iframe**: `src` points to existing `getFastqcReportUrl()`. Same-origin, so fragment navigation works
- **Module click**: Uses `iframeRef.current.contentWindow.location.hash = '#M{index}'` to scroll the report to the clicked module section
- **Download**: Opens report URL in new tab (`window.open`)
- **Full screen**: Toggles between normal and full-viewport modal sizing via state
- **Status icons**: Inline SVG sub-component using `text-status-complete` (pass), `text-status-error` (fail), `text-amber-500` (warn) — matches existing Tailwind color config

### Step 8: Wire modal into `FastqsTab`

**File**: `frontend/src/pages/experiment/FastqsTab.tsx`

1. Add state: `const [fastqcTarget, setFastqcTarget] = useState<FastqFile | null>(null)`
2. Replace `<a href={url} target="_blank">` (lines 52-72) with `<button onClick={() => setFastqcTarget(row)}>` keeping the same SVG icon
3. Add `<FastqcReportModal>` after the delete confirmation modal
4. Remove `getFastqcReportUrl` import (moves to modal component)

### Step 9: Add tests

**File**: `backend/tests/test_fastqc.py`

- **Unit test**: `test_find_fastqc_data_txt_mock_mode` and `test_find_fastqc_data_txt_real_mode` — verify the resolver finds TXT in both directory layouts
- **Integration test**: `test_fastqc_summary_endpoint` — upload FASTQ → wait for FastQC → hit `/fastqc-summary` → assert module summaries returned with valid statuses
- **Integration test**: `test_fastqc_summary_404_before_ready` — hit summary endpoint before FastQC completes → 404

---

## Files Changed

| File | Action | Summary |
|------|--------|---------|
| `backend/pipelines/fastqc.py` | Modify | Copy TXT in mock mode, add `find_fastqc_data_txt()` |
| `backend/schemas/fastq_file.py` | Modify | Add `FastqcModuleSummary`, `FastqcSummaryResponse` |
| `backend/routers/fastq_files.py` | Modify | Add `GET .../fastqc-summary` endpoint |
| `frontend/src/api/fastqs.ts` | Modify | Add types + `getFastqcSummary()` |
| `frontend/src/hooks/useFastqs.ts` | Modify | Add `useFastqcSummary()` hook |
| `frontend/src/components/fastqs/FastqcReportModal.tsx` | **Create** | Modal with sidebar + iframe |
| `frontend/src/pages/experiment/FastqsTab.tsx` | Modify | Replace `<a>` with modal trigger |
| `backend/tests/test_fastqc.py` | Modify | Add summary endpoint + resolver tests |

No database migrations needed — module summaries are parsed on-the-fly from the TXT file.

---

## Design Decisions

1. **Parse on-the-fly, not stored in DB**: The TXT file is small and parsing is fast. Avoids a migration + backfill for a field only read when the modal opens. For 8-10 users this is fine.

2. **Standalone modal, not extending `Modal`**: `Modal` is hardcoded to `max-w-2xl`. FastQC needs near-full-viewport. `WizardModal` already sets the precedent for standalone full-viewport modals in this codebase.

3. **Iframe for HTML rendering**: FastQC HTML is self-contained (~900KB, embedded CSS/images). Iframe is the simplest approach — no DOM injection, no CSS conflicts.

4. **Same-origin fragment navigation**: The report URL goes through Vite proxy (dev) or NGINX (prod), so `contentWindow.location.hash` works for scrolling to modules.

5. **Redundant sidebar**: FastQC HTML has its own internal sidebar inside the iframe. Our external sidebar adds status icons (pass/warn/fail) which FastQC's sidebar doesn't show as prominently. Accept the visual duplication for now — KISS.

---

## Verification

1. **Backend**: `pytest backend/tests/test_fastqc.py` — all existing + new tests pass
2. **Lint**: `ruff check backend/` and `cd frontend && npx tsc --noEmit` pass
3. **Manual test**:
   - `docker compose up`
   - Upload test FASTQs → wait for FastQC to complete (polling fills in totalReads)
   - Click the FASTQC icon → modal opens with blue header, sidebar shows 11 modules with pass/warn/fail icons, iframe shows the HTML report
   - Click a module in the sidebar → iframe scrolls to that section
   - Click "Download Report" → report opens in new tab
   - Click "Full Screen" → modal expands to fill viewport
   - Close modal → returns to FASTQs table
