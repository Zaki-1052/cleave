# Gold Standard Reference Project — Deployment Guide

## Overview

The Gold Standard Reference Project is a read-only, pre-analyzed MeCP2 CUT&RUN dataset (mouse mm10) that all authenticated Cleave users can browse. It demonstrates all pipeline outputs: alignment QC, peak calling, DiffBind, normalization, heatmaps, and Pearson correlation.

**Data source**: `dev-data/projects/1/1/` in the repo (NOT committed to git — local only).

---

## Prerequisites

- Cleave backend deployed and running (Docker Compose or EC2)
- Database accessible and migrations up to date
- `dev-data/` directory available locally (from end-to-end pipeline test)

---

## Step-by-Step Deployment

### 1. Run database migration

The `is_reference` column must be added to the `projects` table.

```bash
# Docker Compose (local dev)
docker compose exec api alembic upgrade head

# EC2 (production)
cd /path/to/cleave/backend
alembic upgrade head
```

### 2. Run the seed script

The seed script creates all database records (project, experiment, reactions, jobs, job outputs) and prints the assigned project and experiment IDs.

```bash
# Docker Compose (local dev, with mock stub files)
docker compose exec api python scripts/seed_reference_project.py --mock

# EC2 (production, real files)
cd /path/to/cleave
python scripts/seed_reference_project.py
```

**Expected output:**
```
Created reference project: id=<PID>
Created experiment: id=<EID>
  Reaction: mecp2-ctrl_1 (id=...)
  Reaction: mecp2-ctrl_2 (id=...)
  Reaction: mecp2-mut_1 (id=...)
  Reaction: mecp2-mut_2 (id=...)
  Job: Alignment (id=..., dev_id=11)
  Job: Peak Calling (id=..., dev_id=12)
  Job: DiffBind (id=..., dev_id=13)
  Job: Normalization (id=..., dev_id=14)
  Job: Custom Heatmap (id=..., dev_id=15)
  Job: Correlation (id=..., dev_id=18)

Seed complete:
  Project ID:    <PID>
  Experiment ID: <EID>
  ...

Data path: /data/cleave/projects/<PID>/<EID>
```

**Note the Project ID (`<PID>`) and Experiment ID (`<EID>`)** — you'll need them for the rsync.

### 3. Transfer data files to EC2

The actual analysis output files (~4.5 GB excluding raw FASTQs) need to be rsynced to the EC2 instance at the path printed by the seed script.

```bash
# From your local machine (where dev-data/ lives)
rsync -avz --progress \
  --exclude='fastqs/raw/' \
  dev-data/projects/1/1/ \
  -e "ssh -i ./210323.pem" \
  ubuntu@<EC2_HOST>:/data/cleave/projects/<PID>/<EID>/
```

**Important**: The rsync destination path must match the `Data path` printed by the seed script. The job output file paths in the database are relative to `STORAGE_ROOT` and reference these project/experiment IDs.

**What gets transferred (~4.5 GB):**
- `fastqs/trimmed/` — Trimmed FASTQ files (needed for display, not raw)
- `fastqc/` — FastQC HTML reports
- `jobs/11/` — Alignment outputs (BAMs, bigWigs, heatmaps, QC)
- `jobs/12/` — Peak calling outputs (filtered BAMs, peaks, annotation, QC)
- `jobs/13/` — DiffBind results (plots, TSV, normalized counts)
- `jobs/14/` — Normalization results (normalized bigWigs, factors)
- `jobs/15/` — Custom heatmap results
- `jobs/18/` — Pearson correlation results

**What's excluded:**
- `fastqs/raw/` — Raw FASTQs (~16 GB, not needed for browsing results)

### 4. Verify

1. Open the Cleave web app in a browser
2. Log in with any account
3. The **Gold Standard Reference** card should appear in the left sidebar on the Projects page
4. Click it to open the project detail page (should show the crown icon and "Shared with all users")
5. Click the "MeCP2 CUT&RUN (mm10)" experiment
6. Browse each tab:
   - **Alignment** — Should show QC metrics and heatmaps
   - **Peak Calling** — Should show SEACR peak metrics and annotation charts
   - **DiffBind** — Should show volcano plot, MA plot, PCA
   - **Normalization** — Should show normalization factors
   - **Heatmaps** — Should show the reference-point heatmap
   - **Correlation** — Should show the Pearson correlation heatmap
   - **All Files** — Should show the full file tree
7. Verify **no mutation buttons** are visible (no "Run Full Pipeline", no "New Analysis", no "Edit" on reactions)

---

## Re-seeding / Updating

The seed script is **idempotent** — if a reference project already exists (`is_reference=True`), it prints a message and exits without changes.

To re-seed (e.g., after updating the test data):

```bash
# 1. Delete the existing reference project from the database
docker compose exec api python -c "
import asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from config import settings
from models.project import Project

async def delete_ref():
    engine = create_async_engine(str(settings.DATABASE_URL))
    sf = async_sessionmaker(engine, expire_on_commit=False)
    async with sf() as db:
        result = await db.execute(select(Project).where(Project.is_reference.is_(True)))
        proj = result.scalar_one_or_none()
        if proj:
            await db.delete(proj)
            await db.commit()
            print(f'Deleted reference project id={proj.id}')
    await engine.dispose()

asyncio.run(delete_ref())
"

# 2. Re-run the seed script
docker compose exec api python scripts/seed_reference_project.py

# 3. Re-rsync data if paths changed
```

---

## Local Development

For local dev without the full 4.5 GB of data:

```bash
docker compose exec api python scripts/seed_reference_project.py --mock
```

The `--mock` flag creates small stub files on disk so the file browser and API endpoints work. Large files (BAMs, bigWigs) are replaced with tiny placeholders — IGV and actual data viewing won't work, but navigation and UI testing will.

---

## Architecture Notes

- **No ProjectMember rows** are created for the reference project. Access is granted via `Project.is_reference == True` checks in all read-access queries.
- **Write operations** (create experiment, submit job, upload FASTQ, etc.) are blocked because:
  1. No `ProjectMember` record exists, so role-based checks fail
  2. Explicit `is_reference` guards in service functions provide defense in depth
- **The `/api/v1/projects/reference` endpoint** returns reference projects separately from the user's own project list.
- **Frontend** uses `useReferenceProjects()` hook for the sidebar card, and `project.isReference` to enable read-only mode on ProjectDetailPage and ExperimentView.

---

## File Inventory (What Changed)

| Area | Files |
|------|-------|
| Migration | `backend/migrations/versions/b4c7e2f19a53_add_is_reference_to_projects.py` |
| Model/Schema | `backend/models/project.py`, `backend/schemas/project.py` |
| Permissions | `backend/services/permission_helpers.py` (outerjoin for reads) |
| Services | `project_service.py`, `experiment_service.py`, `job_service.py`, `qc_report_service.py`, `reaction_service.py`, `fastq_service.py` |
| Routers | `routers/projects.py` (reference endpoint), `routers/files.py`, `routers/jobs.py` |
| Seed Script | `scripts/seed_reference_project.py` |
| Frontend API | `api/types.ts`, `api/projects.ts`, `hooks/useProjects.ts` |
| Frontend UI | `pages/HomePage.tsx`, `pages/ProjectDetailPage.tsx`, `pages/ExperimentView.tsx`, `pages/experiment/FastqsTab.tsx`, `pages/experiment/ReactionsTab.tsx` |
| Tests | `tests/test_projects.py` (8 new tests) |
