# Phase 2.6 — Reactions Frontend

## Context

Phase 2.5 (Reactions Backend) is complete: 8 endpoints, 23 tests, all passing. The `ReactionsTab.tsx` is a stub ("Not yet implemented"). This plan builds the frontend to wire up the reactions CRUD, CSV import, and FASTQ prefix cross-referencing per `cutana-cloud-ui.md` §6d (read-only table) and §6e (edit wizard). The editor component must be reusable for embedding in the experiment creation wizard step 3 (PLAN §2.7).

---

## Files to Create/Modify

| # | File | Action | Purpose |
|---|------|--------|---------|
| 1 | `frontend/src/lib/constants.ts` | Modify | Add `CUTANA_SPIKE_IN_OPTIONS`, `CUTANA_SPIKE_IN_TARGETS` |
| 2 | `frontend/src/api/types.ts` | Modify | Extend `Reaction` with 9 optional fields; add `PrefixInfo`, `CsvImportResponse`, `ReactionCreatePayload`, `ReactionUpdatePayload` |
| 3 | `frontend/src/api/reactions.ts` | Create | 8 API functions matching backend endpoints |
| 4 | `frontend/src/hooks/useReactions.ts` | Create | 7 TanStack Query hooks (2 queries + 5 mutations) |
| 5 | `frontend/src/components/reactions/CsvUploadZone.tsx` | Create | CSV drag-drop upload + Download Template link |
| 6 | `frontend/src/components/reactions/ReactionFormModal.tsx` | Create | Add/edit single reaction form modal |
| 7 | `frontend/src/components/reactions/ReactionsEditor.tsx` | Create | Reusable editor: CSV upload + reactions table + CRUD |
| 8 | `frontend/src/pages/experiment/ReactionsTab.tsx` | Rewrite | Full tab replacing stub |
| 9 | `frontend/src/components/ui/Modal.tsx` | Modify | Add optional `className` prop for width override |

---

## Step-by-Step Implementation

### Step 1: Constants (`constants.ts`)

Append after `ORGANISMS`:

```typescript
export const CUTANA_SPIKE_IN_OPTIONS = ['None', 'KMetStat'] as const;

export const CUTANA_SPIKE_IN_TARGETS = [
  'Unmodified', 'H3K4me1', 'H3K4me2', 'H3K4me3',
  'H3K9me1', 'H3K9me2', 'H3K9me3',
  'H3K27me1', 'H3K27me2', 'H3K27me3',
  'H3K36me1', 'H3K36me2', 'H3K36me3',
  'H4K20me1', 'H4K20me2', 'H4K20me3',
] as const;
```

Source: 16 PTMs from K-MetStat panel (`cleave-spec-decisions.md` §8).

### Step 2: Types (`api/types.ts`)

**Extend `Reaction`** (lines 36-46) — add the 9 optional metadata fields the backend `ReactionRead` returns but the frontend type is missing:

```typescript
cellType: string | null;
cellNumber: string | null;
samplePrep: string | null;
experimentalCondition: string | null;
antibodyVendor: string | null;
antibodyCatNo: string | null;
antibodyLotNo: string | null;
cutanaSpikeIn2: string | null;
cutanaSpikeInTarget2: string | null;
```

**Add new types**:

- `PrefixInfo` — `{ prefix: string; hasR1: boolean; hasR2: boolean }`
- `CsvImportResponse` — `{ created: number; reactions: Reaction[]; warnings: string[] }`
- `ReactionCreatePayload` — all create fields (fastqPrefix, shortName, organism, assayType required; rest optional)
- `ReactionUpdatePayload` — all fields optional (partial update)

### Step 3: API Module (`api/reactions.ts`)

Follow `api/fastqs.ts` pattern. 8 functions:

| Function | Method | Endpoint | Notes |
|----------|--------|----------|-------|
| `getReactions` | GET | `/experiments/:id/reactions` | `perPage=100` default (experiments have few reactions) |
| `createReaction` | POST | `/experiments/:id/reactions` | Returns `Reaction` |
| `bulkCreateReactions` | POST | `/experiments/:id/reactions/bulk` | Body: `{ reactions: [...] }` |
| `importReactionsCsv` | POST | `/experiments/:id/reactions/import-csv` | `FormData` with key `file` |
| `downloadTemplate` | GET | `/experiments/:id/reactions/template` | `responseType: 'blob'`, trigger download via temp `<a>` |
| `getPrefixes` | GET | `/experiments/:id/reactions/prefixes` | Returns `PrefixInfo[]` |
| `updateReaction` | PATCH | `/experiments/:id/reactions/:rid` | Returns `Reaction` |
| `deleteReaction` | DELETE | `/experiments/:id/reactions/:rid` | Returns void |

### Step 4: Hooks (`hooks/useReactions.ts`)

Follow `hooks/useFastqs.ts` pattern:

- `useReactions(experimentId)` — query, key `['reactions', experimentId]`
- `usePrefixes(experimentId)` — query, key `['prefixes', experimentId]`
- `useCreateReaction()` — mutation, invalidates `['reactions', experimentId]`
- `useBulkCreateReactions()` — mutation, invalidates reactions
- `useImportReactionsCsv()` — mutation, invalidates reactions
- `useUpdateReaction()` — mutation, invalidates reactions
- `useDeleteReaction()` — mutation, invalidates reactions

### Step 5: Modal Width (`components/ui/Modal.tsx`)

Add optional `className` prop to the inner container `div` so the editor modal can use `max-w-5xl` instead of the default `max-w-2xl`. One-line change.

### Step 6: CSV Upload Zone (`components/reactions/CsvUploadZone.tsx`)

Simplified version of `FileUploadZone`:

- **Props**: `experimentId`, `onImportComplete: (result: CsvImportResponse) => void`
- Drag-drop zone accepting only `.csv` files (same visual pattern: dashed border, "Drag & Drop or Browse")
- Single file, immediate upload on drop (no staging — CSVs are tiny)
- Uses `useImportReactionsCsv()` mutation
- Success banner: green, shows `"Imported {created} reactions"`
- Warnings: yellow banner with bulleted list (e.g., "Column 'Reference_Genome' will be ignored")
- Errors: red banner with detail text (422 validation / 409 conflict)
- "Download Template" link below the drop zone — calls `downloadTemplate(experimentId)`

### Step 7: Reaction Form Modal (`components/reactions/ReactionFormModal.tsx`)

Modal form for add/edit of a single reaction.

**Props**: `isOpen`, `onClose`, `experimentId`, `prefixes: PrefixInfo[]`, `assayType: string`, `existingReaction?: Reaction`

**Fields (form state via `useState` per field)**:
- FASTQ Prefix — `<select>` from `prefixes` prop. Empty state: "Upload FASTQ files first"
- Short Name — `<input>` text
- Organism — `<select>` from `ORGANISMS` constant
- CUTANA Spike in — `<select>` from `CUTANA_SPIKE_IN_OPTIONS`
- CUTANA Spike in Target — `<select>` from `CUTANA_SPIKE_IN_TARGETS`, disabled when spike-in is "None"
- E.coli Spike in — `<select>` Yes/No → boolean
- Collapsible "More Fields" toggle revealing: cellType, cellNumber, samplePrep, experimentalCondition, antibodyVendor, antibodyCatNo, antibodyLotNo, cutanaSpikeIn2, cutanaSpikeInTarget2

**Behavior**:
- Add mode: assayType auto-filled from experiment, calls `useCreateReaction()`
- Edit mode: pre-fills from `existingReaction`, calls `useUpdateReaction()` with changed fields only
- 409 error (duplicate organism+shortName) displayed inline
- On success: close modal, cache auto-invalidated

### Step 8: Reactions Editor (`components/reactions/ReactionsEditor.tsx`)

**The core reusable component** — used in ReactionsTab modal AND wizard step 3 (§2.7).

**Props**: `experimentId: number`, `assayType: string`

**Layout** (per §6e):
```
[CSV Upload Section]  (CsvUploadZone component)
         ── OR ──
[Reactions Table]     (DataTable + toolbar)
   [+ Add Reaction]   [Customize Columns]
```

**Data**: fetches `useReactions(experimentId)` and `usePrefixes(experimentId)` internally.

**Table columns** (default visible):
- FASTQ Prefix — text
- R1 File — green ✓ or gray — (cross-ref prefix in `prefixes` data via `useMemo` lookup map)
- R2 File — same logic
- Short Name — text
- Assay Type — text
- Organism — text
- Actions — Edit (pencil) + Delete (trash) icon buttons

**Customize Columns**: toggle button opens a dropdown with switches for 11 optional columns (cutanaSpikeIn, ecoliSpikeIn, cellType, cellNumber, samplePrep, experimentalCondition, antibodyVendor, antibodyCatNo, antibodyLotNo, cutanaSpikeIn2, cutanaSpikeInTarget2). Managed via `useState<Set<string>>`. Dynamically builds `ColumnDef[]` based on visible set.

**State**: `editTarget`, `deleteTarget`, `showAddForm` (same pattern as FastqsTab).

**Delete confirmation**: same Modal pattern as FastqsTab — "Are you sure?" + Cancel/Delete buttons.

### Step 9: Reactions Tab (`pages/experiment/ReactionsTab.tsx`)

Replace stub. Read-only view + edit modal.

**Structure**:
```typescript
const { experiment } = useOutletContext<ExperimentContext>();
const { data, isLoading } = useReactions(experiment.id);
const { data: prefixes } = usePrefixes(experiment.id);
const [showEditor, setShowEditor] = useState(false);

// Read-only columns: FASTQ Prefix, R1 ✓, R2 ✓, Short Name, Assay Type, Organism
// (no actions column in read-only view)

return (
  <>
    <Card>
      <Toolbar: "Reactions" title + "Edit" button />
      {reactions.length > 0 ? <DataTable /> : <EmptyState />}
    </Card>

    <Modal isOpen={showEditor} title="Edit Reactions" className="max-w-5xl">
      <ReactionsEditor experimentId={experiment.id} assayType={experiment.assayType} />
    </Modal>
  </>
);
```

Loading spinner and empty state follow FastqsTab pattern exactly.

---

## Edge Cases

- **No FASTQs uploaded**: Prefix dropdown is empty — show "Upload FASTQ files first" message
- **Duplicate shortName+organism**: Backend returns 409 — display inline in form
- **CSV warnings**: Show in yellow banner (e.g., ignored columns), not errors
- **CSV errors**: 422 with validation details — red banner
- **Orphaned prefixes**: If FASTQ deleted, R1/R2 columns show gray dashes gracefully
- **Spike-in target dependency**: Disable target dropdown when spike-in is "None"

---

## Verification

After implementation:
1. Upload CSV with 5 reactions → table shows 5 rows with correct R1/R2 checkmarks
2. Click Edit → modal opens with CSV zone + existing reactions table
3. Add a reaction via form → appears in table immediately
4. Edit a reaction → changes reflected after save
5. Delete a reaction → confirmation → row removed
6. Download Template → CSV downloads with 16 columns
7. CSV with warnings → import succeeds, warnings shown
8. Duplicate shortName+organism → 409 error shown inline
9. Customize Columns toggle → optional columns appear/disappear
10. Close edit modal → read-only tab reflects all changes
11. `npx tsc --noEmit` passes
