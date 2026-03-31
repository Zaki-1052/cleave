# Phase 2.9: File Browser — Implementation Plan

## Context

Phase 2.8 (Trimming Pipeline) is the last completed step. The experiment directory now contains `fastqs/raw/`, `fastqs/trimmed/`, and `fastqc/` subdirectories on disk. The `AllFilesTab.tsx` and `backend/routers/files.py` are both stubs returning "Not yet implemented" / 501. The All Files tab is already wired into `ExperimentView.tsx` at route path `files`.

This step builds the dual-panel file browser per `cutana-cloud-ui.md` §6h — a directory tree on the left, a file table on the right, and a download button for selected files. The backend scans the actual experiment directory on disk (not just DB records) to build the tree, ensuring all files are visible.

---

## Step 1: Backend Schema — `backend/schemas/file.py` (NEW)

Create Pydantic response schemas following the `CamelModel` convention from `schemas/common.py`.

```python
class FileNode(CamelModel):
    name: str                                    # "raw", "sample_R1.fastq.gz"
    path: str                                    # relative to experiment root: "fastqs/raw"
    type: str                                    # "folder" | "fastq.gz" | "html" | "txt" etc.
    size: int | None = None                      # bytes for files, None for folders
    children: list["FileNode"] | None = None     # list for folders, None for files

FileNode.model_rebuild()   # required for self-referential Pydantic v2

class FileTreeResponse(CamelModel):
    root: FileNode
    total_files: int
    total_size: int
```

Design:
- `path` is relative to the experiment directory root (e.g. `fastqs/raw/sample_R1.fastq.gz`), never exposing project_id or STORAGE_ROOT to the frontend
- `children` is `None` for files, `[]` for empty folders — lets frontend distinguish leaf nodes from empty dirs
- `type` is `"folder"` for directories, or the file extension for files — matches the UI spec's "Type/Class" column

---

## Step 2: Backend Service — `backend/services/file_service.py` (NEW)

Three functions:

### 2a. Path validation (critical security)

```python
def validate_experiment_path(
    storage_root: str, project_id: int, experiment_id: int, relative_path: str
) -> Path:
```

Per `docs/todos.md` security requirement:
1. Reject if `relative_path` contains `..` segments or starts with `/`
2. Construct `experiment_dir = Path(storage_root) / "projects" / str(project_id) / str(experiment_id)`
3. Resolve both paths, verify `abs_path` is under `experiment_dir`
4. Raise `ValueError` on violation

This is stricter than the existing STORAGE_ROOT guard in `fastq_files.py:154` — validates against the specific experiment directory.

### 2b. File type detection

```python
def _get_file_type(filename: str) -> str:
```

Returns `"fastq.gz"` for `.fastq.gz`/`.fq.gz`, otherwise strips the last extension (e.g. `"html"`, `"bam"`, `"bw"`). Falls back to `"file"` for extensionless files.

### 2c. Tree builder

```python
def build_experiment_file_tree(
    storage_root: str, project_id: int, experiment_id: int
) -> tuple[FileNode, int, int]:
```

Algorithm:
1. Construct experiment directory path
2. If directory doesn't exist, return empty root node with `children=[]`
3. Recursively scan with `pathlib.iterdir()`:
   - Skip hidden files (names starting with `.`)
   - Skip symlinks (prevent symlink-based traversal)
   - Sort entries: folders first, then files, case-insensitive alphabetical
   - Build `FileNode` for each entry; recurse into subdirectories
4. Track running totals for `total_files` and `total_size`
5. Return `(root_node, total_files, total_size)`

Reuses the `_check_experiment_membership` pattern from `fastq_files.py:43-55` (join Experiment with ProjectMember to verify access). Since the codebase duplicates this helper per router, we follow the same pattern here.

---

## Step 3: Backend Router — `backend/routers/files.py` (MODIFY)

Replace both stubs. Add all necessary imports (Path, Query, Depends, FileResponse, mimetypes, select, AsyncSession, current_active_user, get_db, settings, Experiment, ProjectMember, User, schemas, service).

### 3a. `GET /experiments/{experiment_id}/files` → `FileTreeResponse`

1. `_check_experiment_membership()` → 404 if None
2. `build_experiment_file_tree(settings.STORAGE_ROOT, experiment.project_id, experiment_id)`
3. Return `FileTreeResponse`

### 3b. `GET /experiments/{experiment_id}/files/download?path=...`

New endpoint (replaces the stub at `/experiments/{experiment_id}/files` which was a different shape):

1. `_check_experiment_membership()` → 404 if None
2. `validate_experiment_path(...)` → 403 on ValueError
3. Verify `abs_path.is_file()` → 404 if not
4. `mimetypes.guess_type()` for media_type
5. Return `FileResponse(abs_path, ...)`

### 3c. `GET /jobs/{job_id}/files/{file_id}/download`

Implement the existing stub using `JobOutput` DB lookup:

1. Look up `JobOutput` by `(job_id, file_id)`
2. Join through `AnalysisJob` → `Experiment` → `ProjectMember` for auth
3. Resolve `JobOutput.file_path` via same path traversal guard
4. Return `FileResponse`

---

## Step 4: Backend Tests — `backend/tests/test_files.py` (NEW)

Follow the existing helper pattern from `test_fastq_upload.py` (`_register_and_get_headers`, `_create_project`, `_create_experiment`).

Tests (~12):

**File tree endpoint:**
1. `test_list_files_empty_experiment` — 200, empty root, totalFiles=0
2. `test_list_files_after_upload` — Upload FASTQs, verify tree has `fastqs/raw/` with files, correct totalFiles/totalSize
3. `test_list_files_nonmember` — 404 for non-member
4. `test_list_files_hidden_files_skipped` — Create `.DS_Store` in experiment dir, verify excluded

**Download endpoint:**
5. `test_download_file` — Upload FASTQ, download via path, verify content
6. `test_download_path_traversal_dotdot` — `path=../../etc/passwd` → 403
7. `test_download_path_traversal_absolute` — `path=/etc/passwd` → 403
8. `test_download_nonexistent_file` — valid-looking path that doesn't exist → 404
9. `test_download_nonmember` — 404

**Service unit tests:**
10. `test_file_type_detection` — `.fastq.gz` → "fastq.gz", `.html` → "html", etc.
11. `test_tree_sorts_folders_first` — Verify sort order
12. `test_validate_path_rejects_symlinks` — (if implemented)

---

## Step 5: Frontend Types — `frontend/src/api/types.ts` (MODIFY)

Add at end of file:

```typescript
export interface FileNode {
  name: string;
  path: string;
  type: string;
  size: number | null;
  children: FileNode[] | null;
}

export interface FileTreeResponse {
  root: FileNode;
  totalFiles: number;
  totalSize: number;
}
```

---

## Step 6: Frontend API Module — `frontend/src/api/files.ts` (NEW)

```typescript
export async function getExperimentFiles(experimentId: number): Promise<FileTreeResponse>
export async function downloadFile(experimentId: number, filePath: string, filename: string): Promise<void>
```

`downloadFile` uses Axios with `responseType: 'blob'` (since JWT is in-memory, not cookie — direct browser navigation won't have auth). Creates a temporary `<a>` element to trigger browser download.

---

## Step 7: Frontend Hook — `frontend/src/hooks/useFiles.ts` (NEW)

```typescript
export function useExperimentFiles(experimentId: number) {
  return useQuery({
    queryKey: ['experiment-files', experimentId],
    queryFn: () => filesApi.getExperimentFiles(experimentId),
    enabled: !!experimentId,
    staleTime: 30_000,  // Cache 30s to avoid re-scanning on tab switches
  });
}
```

---

## Step 8: Frontend Component — `frontend/src/pages/experiment/AllFilesTab.tsx` (MODIFY)

Dual-panel layout per `cutana-cloud-ui.md` §6h.

### State

```typescript
const [selectedPath, setSelectedPath] = useState('');           // '' = Root
const [expandedPaths, setExpandedPaths] = useState(new Set(['']));
const [selectedFiles, setSelectedFiles] = useState(new Set<string>());
```

### Left Panel — Directory Tree

A recursive `TreeNode` component rendered inside a Card:
- Shows only folder nodes from the `FileNode` tree
- Toggle arrows (▶/▼) control `expandedPaths` Set
- Clicking a folder name sets `selectedPath` and expands it
- Indentation via `paddingLeft: depth * 16`
- Active folder highlighted with `bg-white font-semibold text-primary`

### Right Panel — File Table

Uses the existing `DataTable` component. Derives table data from selected folder:

```typescript
function findNode(node: FileNode, path: string): FileNode | null { ... }
const selectedNode = findNode(data.root, selectedPath);
const tableItems = selectedNode?.children ?? [];
```

Columns per UI spec:
1. **Checkbox** — row selection for download
2. **Name** — folder icon + clickable name (folders navigate into, files are plain text)
3. **Type/Class** — `"folder"` or file extension
4. **Size** — `formatBytes(size)`, blank for folders

### Toolbar

- Header showing selected folder name
- Download button — enabled when `selectedFiles.size > 0`, triggers `filesApi.downloadFile()` for each selected file

### Empty/Loading states

- Loading: spinner (matching `ExperimentView.tsx:23-28` pattern)
- Empty experiment: "No files found. Upload FASTQs to get started."
- Error: red banner with error message

---

## Files Summary

| Action | File Path |
|--------|-----------|
| CREATE | `backend/schemas/file.py` |
| CREATE | `backend/services/file_service.py` |
| CREATE | `backend/tests/test_files.py` |
| CREATE | `frontend/src/api/files.ts` |
| CREATE | `frontend/src/hooks/useFiles.ts` |
| MODIFY | `backend/routers/files.py` |
| MODIFY | `frontend/src/api/types.ts` |
| MODIFY | `frontend/src/pages/experiment/AllFilesTab.tsx` |

---

## Verification

Per PLAN.md: "After uploading FASTQs, the All Files tab shows the directory tree with `fastqs/raw/` containing the uploaded files."

1. Upload paired-end FASTQs to an experiment
2. Navigate to All Files tab
3. Verify tree shows `fastqs` → `raw` hierarchy with uploaded files
4. Click `fastqs` folder → right panel shows `raw` subfolder
5. Click `raw` → right panel shows FASTQ files with correct sizes
6. Select a file, click Download → file downloads correctly
7. Run `docker compose exec api pytest tests/test_files.py` — all pass
8. Run `npm run typecheck` and `ruff check backend/` — clean
