# Gold Standard Reference Project — Implementation Plan

## Context

You ran the full Cleave pipeline end-to-end and the output data lives in `dev-data/projects/1/1/`. This plan adds a read-only "Gold Standard" reference project that all authenticated users can browse — letting new users explore alignment QC, peak calling, DiffBind, heatmaps, correlation, and normalization outputs without uploading their own data.

The data itself (~4.5GB excluding FASTQs) will be rsynced to the EC2 instance, not committed to git. A seed script creates the matching database records.

---

## Phase 1: Backend Schema + Migration

### 1.1 Add `is_reference` column to Project model

**File**: `backend/models/project.py`

```python
is_reference: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
```

### 1.2 Add `is_reference` to ProjectRead schema

**File**: `backend/schemas/project.py`

Add `is_reference: bool = False` to `ProjectRead`.

### 1.3 Alembic migration

New migration: `add_is_reference_to_projects` — adds `is_reference BOOLEAN NOT NULL DEFAULT FALSE` to `projects` table.

### 1.4 Add `isReference` to frontend Project type

**File**: `frontend/src/api/types.ts`

Add `isReference: boolean;` to the `Project` interface.

---

## Phase 2: Backend Permission Changes

The core challenge: all read-access queries join `ProjectMember` — no membership = no access. Reference projects have NO `ProjectMember` rows, so we need to add an `OR Project.is_reference == True` escape hatch for read operations.

### 2.1 Modify permission helpers

**File**: `backend/services/permission_helpers.py`

**`check_experiment_membership()`** (used for reads — file downloads, QC reports, job listing):
- Change: `JOIN ProjectMember` → `outerjoin(ProjectMember, and_(PM.project_id == Exp.project_id, PM.user_id == user_id))` + `JOIN Project` + `WHERE (PM.user_id IS NOT NULL OR Project.is_reference == True)`

**`get_experiment_with_permission()`** (used for writes — create job, upload, etc.):
- Keep strict: Only allow through if `ProjectMember` exists AND role matches. Reference projects naturally block writes since there's no membership row.
- Add explicit guard: if `Project.is_reference == True`, return `None` even if somehow a membership exists.

### 2.2 Modify project service

**File**: `backend/services/project_service.py`

- **`get_project()`**: Add `OR Project.is_reference == True` to the WHERE clause (change INNER JOIN to outerjoin pattern).
- **`delete_project()`**: Add guard: `if project.is_reference: raise HTTPException(403, "Cannot delete reference project")`.
- **New function `get_reference_projects()`**: `SELECT * FROM projects WHERE is_reference = TRUE ORDER BY name`.

### 2.3 New endpoint for reference projects

**File**: `backend/routers/projects.py`

```python
@router.get("/reference", response_model=list[ProjectRead])
async def list_reference_projects(
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_reference_projects(db)
```

**Important**: This route MUST be registered before `/{project_id}` to avoid FastAPI treating "reference" as a project_id.

### 2.4 Modify inline ProjectMember joins

These files have inline `ProjectMember` JOINs for read access that need the same outerjoin + `OR is_reference` pattern:

| File | Functions/queries to modify |
|------|---------------------------|
| `backend/services/job_service.py` | `get_job()`, `list_all_jobs_for_user()` |
| `backend/services/qc_report_service.py` | `_get_authorized_job()` (used by ALL QC report endpoints) |
| `backend/routers/files.py` | `download_job_file()`, `batch_download_job_files()`, `create_igv_tokens()`, `get_output_signed_url()` — any inline query joining PM for read access |
| `backend/routers/jobs.py` | `get_output_signed_url()` if it has inline joins |
| `backend/services/experiment_service.py` | `list_experiments()`, `get_experiment()` |
| `backend/services/reaction_service.py` | `list_reactions()` if it joins PM |

### 2.5 DRY helper for the pattern

Add a reusable function to `permission_helpers.py`:

```python
from sqlalchemy import or_, and_

def build_read_access_filter(user_id: int):
    """Returns (join_clause, where_clause) for read access including reference projects."""
    # Use this in all read-access queries to avoid repeating the outerjoin logic
```

### 2.6 Write-protection defense in depth

Add explicit `is_reference` checks in these write service functions (belt-and-suspenders with the natural PM block):
- `experiment_service.create_experiment()`
- `experiment_service.update_experiment()`
- `experiment_service.delete_experiment()`
- `job_service.create_job()`
- `fastq_service.upload_fastqs()`
- `files.py: upload_bed_file()`

Pattern: fetch the project, if `is_reference`, return `None` or raise 403.

---

## Phase 3: Seed Script

**New file**: `scripts/seed_reference_project.py`

Async Python script that creates all database records for the reference project. Idempotent — checks if a reference project already exists before creating.

### What it creates:

1. **Project**: `name="Gold Standard Reference", description="Pre-analyzed MeCP2 CUT&RUN dataset...", is_reference=True, created_by=NULL`
   - Use auto-increment ID (query after insert to get it)

2. **Experiment**: `name="MeCP2 CUT&RUN (mm10)", assay_type="CUT&RUN", status="complete"`

3. **4 Reactions**:
   | short_name | organism | experimental_condition |
   |---|---|---|
   | mecp2-ctrl_1 | Mouse (mm10) | ctrl |
   | mecp2-ctrl_2 | Mouse (mm10) | ctrl |
   | mecp2-mut_1 | Mouse (mm10) | mut |
   | mecp2-mut_2 | Mouse (mm10) | mut |

4. **6 Analysis Jobs** (all `status="complete"`):
   | job_type | name | parent_job_id |
   |---|---|---|
   | alignment | Alignment | NULL |
   | peak_calling | Peak Calling | alignment job |
   | diffbind | DiffBind | peak_calling job |
   | roman_normalization | Normalization | alignment job |
   | custom_heatmap | Custom Heatmap | alignment job |
   | pearson_correlation | Correlation | normalization job |

5. **JobOutput records**: One per output file. The seed script walks the `dev-data/projects/1/1/jobs/` directory tree, maps each file to a `file_category` (bam, bigwig, bed, heatmap, log, qc, annotation, etc.), and creates a `JobOutput` with `file_path` relative to `STORAGE_ROOT`.

### File path strategy:

The seed script needs to know the **actual** project_id and experiment_id that get auto-assigned. After creating the project+experiment, it uses those IDs to construct file paths like `projects/{pid}/{eid}/jobs/11/bams/mecp2-ctrl_1_final.bam`.

**On EC2**: rsync the data to match:
```bash
rsync -avz --progress \
  --exclude='fastqs/raw/' \
  dev-data/projects/1/1/ \
  ubuntu@cleave-host:/data/cleave/projects/{PID}/{EID}/
```

Where `{PID}` and `{EID}` are printed by the seed script after it runs.

### Mock mode support:

For local dev, the seed script should optionally create placeholder stub files (like the mock pipeline does) so the file browser and QC report endpoints work without rsyncing 4.5GB. Use a `--mock` flag.

### Running the seed script:

```bash
# In production (after rsync):
docker compose exec api python scripts/seed_reference_project.py

# Locally (with mock files):
docker compose exec api python scripts/seed_reference_project.py --mock
```

---

## Phase 4: Frontend — Sidebar Reference Card

### 4.1 New API call + hook

**File**: `frontend/src/api/projects.ts`
```typescript
export async function getReferenceProjects(): Promise<Project[]> {
  const { data } = await client.get<Project[]>('/projects/reference');
  return data;
}
```

**File**: `frontend/src/hooks/useProjects.ts`
```typescript
export function useReferenceProjects() {
  return useQuery({
    queryKey: ['projects', 'reference'],
    queryFn: () => getReferenceProjects(),
    staleTime: 10 * 60 * 1000, // 10 min — rarely changes
  });
}
```

### 4.2 HomePage sidebar update

**File**: `frontend/src/pages/HomePage.tsx`

Replace the "Coming soon" filters placeholder with:

```
┌──────────────────────┐
│ ★ REFERENCE DATA     │
│                      │
│ 👑 Gold Standard     │
│    MeCP2 CUT&RUN     │
│    Pre-analyzed data  │
│    with full pipeline │
│    outputs            │
│    → Explore          │
│                      │
│ ─────────────────    │
│ PROJECT FILTERS      │
│ 🕐 Coming soon       │
└──────────────────────┘
```

- Crown icon (`Crown` from lucide-react) in gold (`text-amber-500`)
- Card has subtle gold left border (`border-l-4 border-amber-400`) or gold ring
- Hover state with warm highlight
- "Explore" link navigates to `/projects/{id}`
- Keep the "Project Filters" section below with "Coming soon"

### 4.3 First-time user guidance

On first visit (tracked via `localStorage.getItem('cleave_seen_reference_guide')`), show a dismissible callout banner above the project grid:

> **New to Cleave?** Explore the Gold Standard Reference Project in the sidebar to browse pre-analyzed CUT&RUN data and see what Cleave can do.

Banner has a gold/amber accent, an "Explore" button that navigates to the reference project, and an "×" dismiss button that sets the localStorage flag.

---

## Phase 5: Frontend — Read-Only Mode

### 5.1 ProjectDetailPage

**File**: `frontend/src/pages/ProjectDetailPage.tsx`

When `project.isReference`:
- **Hide** "Create Experiment" button
- **Hide** "Manage Members" button/link
- **Show** a gold banner below the project name: "This is a read-only reference project with pre-analyzed data. Browse the experiment below to explore outputs."
- **Show** crown icon next to project name
- Members section: show "Shared with all users" instead of member list

### 5.2 ExperimentView read-only propagation

**File**: `frontend/src/pages/ExperimentView.tsx`

- Fetch parent project: `const { data: project } = useProject(experiment.projectId);`
- Derive: `const isReadOnly = project?.isReference ?? false;`
- When `isReadOnly`:
  - **Hide** "Run Full Pipeline" button
  - **Hide** `NewAnalysisDropdown`
- Pass through Outlet context: `<Outlet context={{ experiment, isReadOnly }} />`

### 5.3 Tab components read-only behavior

Update the `ExperimentContext` type (or wherever it's defined) to include `isReadOnly?: boolean`.

| Tab | What to hide when `isReadOnly` |
|-----|-------------------------------|
| `DescriptionTab` | Edit button |
| `FastqsTab` | Upload area, delete buttons |
| `ReactionsTab` | Add/Edit/Delete buttons, CSV import |
| Analysis tabs | Already view-only for completed jobs — no changes needed |
| `AllFilesTab` | Upload BED button (if any) |

Downloads remain enabled for all tabs.

---

## Phase 6: Tests

**File**: `backend/tests/test_projects.py` (extend existing)

New tests:
1. `test_reference_project_visible_to_all_users` — non-member can GET reference project
2. `test_reference_project_blocks_experiment_creation` — POST experiment returns 403/404
3. `test_reference_project_blocks_job_creation` — POST job returns 403/404
4. `test_reference_project_allows_file_download` — GET file works for non-member
5. `test_reference_project_allows_qc_report` — GET QC report works for non-member
6. `test_reference_project_cannot_be_deleted` — DELETE returns 403
7. `test_list_reference_projects_endpoint` — GET /projects/reference returns reference projects
8. `test_reference_project_not_in_user_projects_list` — GET /projects doesn't include reference projects (they're separate)

---

## Phase 7: Deployment

### 7.1 Data transfer

```bash
# 1. Run seed script to get project/experiment IDs
docker compose exec api python scripts/seed_reference_project.py
# Output: "Reference project created: project_id=X, experiment_id=Y"

# 2. Rsync data (exclude raw FASTQs — 16GB not needed for browsing)
rsync -avz --progress \
  --exclude='fastqs/raw/' \
  dev-data/projects/1/1/ \
  ubuntu@<ec2>:/data/cleave/projects/X/Y/
```

### 7.2 Production deployment steps
1. Deploy new backend code (includes migration + seed script)
2. Run `alembic upgrade head` (adds `is_reference` column)
3. Run seed script: `python scripts/seed_reference_project.py`
4. rsync data files to the path printed by seed script
5. Verify: visit the app, check sidebar shows reference project, browse experiment

---

## Files Inventory

### New files
| File | Purpose |
|------|---------|
| `backend/migrations/versions/XXXX_add_is_reference_to_projects.py` | Migration |
| `scripts/seed_reference_project.py` | DB seeding script |

### Modified files — Backend
| File | Change |
|------|--------|
| `backend/models/project.py` | Add `is_reference` column |
| `backend/schemas/project.py` | Add `is_reference` to `ProjectRead` |
| `backend/services/permission_helpers.py` | Outerjoin + OR pattern for reads, explicit guard for writes |
| `backend/services/project_service.py` | `get_reference_projects()`, modify `get_project()`, guard `delete_project()` |
| `backend/services/experiment_service.py` | Modify read queries, add write guards |
| `backend/services/job_service.py` | Modify `get_job()`, `list_all_jobs_for_user()` |
| `backend/services/qc_report_service.py` | Modify `_get_authorized_job()` |
| `backend/routers/projects.py` | Add `GET /reference` endpoint |
| `backend/routers/files.py` | Modify inline PM joins for reads, guard BED upload |
| `backend/tests/test_projects.py` | Add 8 reference project tests |

### Modified files — Frontend
| File | Change |
|------|--------|
| `frontend/src/api/types.ts` | Add `isReference` to `Project` |
| `frontend/src/api/projects.ts` | Add `getReferenceProjects()` |
| `frontend/src/hooks/useProjects.ts` | Add `useReferenceProjects()` hook |
| `frontend/src/pages/HomePage.tsx` | Reference card in sidebar, first-time banner |
| `frontend/src/pages/ProjectDetailPage.tsx` | Read-only mode (hide mutations, gold banner) |
| `frontend/src/pages/ExperimentView.tsx` | Fetch project, derive `isReadOnly`, propagate via Outlet context |
| `frontend/src/pages/experiment/FastqsTab.tsx` | Respect `isReadOnly` |
| `frontend/src/pages/experiment/ReactionsTab.tsx` | Respect `isReadOnly` |
| `frontend/src/pages/experiment/DescriptionTab.tsx` | Respect `isReadOnly` |

---

## Verification Plan

1. **Local dev**: Run seed script with `--mock`, verify sidebar card appears, navigate to reference project, confirm all tabs render with read-only UX
2. **Backend tests**: Run `docker compose exec api pytest tests/test_projects.py` — all new + existing tests pass
3. **Full suite**: `docker compose exec api pytest tests/` — 474+ tests still pass
4. **Frontend build**: `cd frontend && npm run build` — no TypeScript errors
5. **Manual E2E**: Create a new user, verify they see the reference project without being a member, verify they can browse all analysis outputs, verify they CANNOT create experiments/jobs/uploads
