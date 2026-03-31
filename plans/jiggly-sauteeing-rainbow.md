# Phase 2.2: FASTQ Upload Frontend

## Context

Phase 2.1 built the backend FASTQ upload/list/delete API with 15 tests (all passing). The `FastqsTab.tsx` is currently a stub. This plan replaces it with a full FASTQs tab featuring drag-and-drop upload, progress tracking, a file table, and delete functionality — matching the CUTANA Cloud UI reference (`cutana-cloud-ui.md` §6b and §6c).

## Files to Create

### 1. `frontend/src/api/fastqs.ts` — API module

Three functions following the `api/experiments.ts` pattern:

- `getFastqs(experimentId, page?, perPage?)` → `PaginatedResponse<FastqFile>` — GET list endpoint
- `uploadFastqs(experimentId, files: File[], onProgress?)` → `FastqUploadResponse` — POST multipart upload. Builds `FormData` internally, passes `onUploadProgress` to Axios for progress tracking
- `deleteFastq(experimentId, fastqId)` → `void` — DELETE endpoint

Also defines `FastqUploadResponse` interface (`uploaded: FastqFile[], totalBytes: number, fileCount: number`) matching the backend `FastqFileUploadResponse` schema.

### 2. `frontend/src/hooks/useFastqs.ts` — TanStack Query hooks

Three hooks following the `hooks/useExperiments.ts` pattern:

- `useFastqs(experimentId, page, perPage)` — `useQuery` with key `['fastqs', experimentId, { page, perPage }]`, `enabled: !!experimentId`
- `useUploadFastqs()` — `useMutation` that invalidates `['fastqs', experimentId]` and `['experiments']` on success (experiment `storageBytes` changes after upload)
- `useDeleteFastq()` — `useMutation` with same invalidation strategy

### 3. `frontend/src/components/fastqs/FileUploadZone.tsx` — Upload component

Props: `experimentId: number`, `onUploadComplete: () => void`

**Internal state** (all `useState` — ephemeral UI state):
- `stagedFiles: File[]` — files selected/dropped but not yet uploaded
- `isDragOver: boolean` — visual feedback for drag hover
- `uploadPercent: number` — aggregate progress from Axios `onUploadProgress`
- `isUploading: boolean` — disables UI during upload
- `uploadError: string | null` — backend error messages

**Behavior**:
1. **Drag-and-drop**: Native HTML5 events (`dragenter/dragleave/dragover/drop`) on the drop zone div. `onDrop` extracts files, filters for valid extensions (`.fastq.gz`, `.fastq`, `.fq.gz`, `.fq`), appends to `stagedFiles`
2. **File picker**: Hidden `<input type="file" multiple accept=".fastq,.fastq.gz,.fq,.fq.gz">` triggered by "Browse" button click via `useRef`
3. **Staging list**: Shows staged files with name, size (`formatBytes`), and a remove (✕) button per file
4. **Upload button**: Disabled when empty or uploading. Calls `uploadFastqs()` from the mutation hook. On success: clears staged files, calls `onUploadComplete()`. On error: parses API error, sets `uploadError`
5. **Progress bar**: Single aggregate bar (Axios gives one progress stream for the whole multipart POST). Shown only during upload

**Drop zone styling** (matching CUTANA Cloud §6c):
- Default: `border-2 border-dashed border-primary/40 rounded-lg p-8 text-center`
- Drag hover: `border-primary bg-primary/5`
- Icon: ⊕ character or SVG, "Drag & Drop or **Browse**" text
- "Browse" styled as `text-primary cursor-pointer font-medium`

### 4. `frontend/src/pages/experiment/FastqsTab.tsx` — Replace stub

**Data flow**:
- Gets `experiment` from `useOutletContext<ExperimentContext>()`
- Fetches FASTQ list via `useFastqs(experiment.id)`
- `showUpload` state toggles the `FileUploadZone` visibility
- `deleteTarget` state (`FastqFile | null`) controls delete confirmation modal

**Layout** (matching `cutana-cloud-ui.md` §6b):
```
Card
├── Header: "FASTQ Files" title + toolbar ("+ Add FASTQs" primary button)
├── FileUploadZone (shown when showUpload=true)
├── DataTable (when files exist)
│   Columns: Name, Size, Uploaded, FASTQC (disabled placeholder), Total Reads, Actions (delete)
├── Empty state (when no files and not loading)
└── Delete confirmation Modal
```

**Table columns** (`ColumnDef<FastqFile>[]`):
1. **Name**: `accessorKey: 'filename'` — plain text
2. **Size**: `accessorKey: 'fileSizeBytes'` — cell renders `formatBytes(value)` or "—"
3. **Uploaded**: `accessorKey: 'uploadedAt'` — cell renders `formatDate(value)`
4. **FASTQC**: display-only column, renders disabled placeholder icon ("—") — wired in Phase 2.4
5. **Total Reads**: `accessorKey: 'totalReads'` — cell renders `value.toLocaleString()` or "—" (populated by FastQC in Phase 2.3)
6. **Actions**: delete button (trash icon) — clicking sets `deleteTarget`, opens confirmation modal

**Delete flow**: Trash icon → confirmation Modal ("Delete {filename}?") → `useDeleteFastq().mutate()` → auto-invalidates cache → modal closes.

## Files NOT Modified

- `App.tsx` — routing already wired (`<Route path="fastqs" element={<FastqsTab />} />`)
- `api/types.ts` — `FastqFile` type already defined and matches backend `FastqFileRead`
- `lib/utils.ts` — `formatBytes`, `formatDate` already exist
- `components/ui/DataTable.tsx` — used as-is
- `components/ui/Modal.tsx` — used as-is for delete confirmation

## Error Handling

| Error | HTTP | Frontend |
|-------|------|----------|
| Invalid filename (format/extension/no R1-R2) | 422 | Red banner above upload zone with backend `detail` message |
| Duplicate filename in experiment or batch | 422 | Red banner with detail message |
| Viewer / non-member | 403 | Red banner: "Insufficient permissions" |
| Network error | — | Red banner: "Network error" |
| Delete not found | 404 | Close modal, brief error |

## Implementation Order

1. `api/fastqs.ts` (no deps)
2. `hooks/useFastqs.ts` (depends on #1)
3. `components/fastqs/FileUploadZone.tsx` (depends on #1 for types)
4. `pages/experiment/FastqsTab.tsx` (depends on #2, #3)

## Verification

1. Navigate to an experiment → FASTQs tab → see empty state with "+ Add FASTQs" button
2. Click "+ Add FASTQs" → upload zone appears with dashed border drop zone
3. Drag `.fastq.gz` files onto drop zone → files appear in staging list with sizes
4. Click "Upload" → progress bar fills → files appear in table with filename, size, date
5. Try uploading invalid file (no R1/R2) → error banner with validation message
6. Click delete icon on a file → confirmation modal → confirm → file removed from table
7. Experiment storage size updates after upload/delete (visible on Description tab)
8. `npx tsc --noEmit` passes (no type errors)
