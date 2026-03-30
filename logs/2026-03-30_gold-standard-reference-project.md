# 2026-03-30 — Gold Standard Reference Project

## What was done

- Added `is_reference` boolean column to `projects` table (model, schema, migration)
- Modified all read-access queries across 8 backend files to use `outerjoin + OR is_reference` pattern, allowing reference project data to be visible to all authenticated users without `ProjectMember` rows
- Added `GET /api/v1/projects/reference` endpoint for fetching reference projects separately
- Added write-protection guards (BED upload, delete_project) for defense in depth
- Created `scripts/seed_reference_project.py` — idempotent async script that creates all DB records (project, experiment, 4 reactions, 6 jobs, ~130 job outputs) from dev-data inventory
- Added `useReferenceProjects` hook and `getReferenceProjects` API call on frontend
- Updated HomePage sidebar with gold-accented reference card (Crown icon, amber border, explore link) and first-time user guidance banner
- Updated ProjectDetailPage with read-only mode (hidden mutation buttons, crown icon, "Shared with all users")
- Updated ExperimentView to propagate `isReadOnly` via Outlet context, hiding "Run Full Pipeline" and "New Analysis" buttons
- Updated FastqsTab and ReactionsTab to hide upload/edit buttons when `isReadOnly`
- Added `isReference` to frontend `Project` type
- Added 8 new backend tests for reference project access control
- Created deployment guide at `docs/reference-project-deployment.md`

## Decisions made

- Used `is_reference` flag on Project model (not auto-adding all users as viewers) — cleanest approach with natural write-protection
- Reference projects live in a separate API endpoint (`/projects/reference`), not mixed into the user's project list
- Seed script uses auto-increment IDs and prints them for rsync path construction
- Raw FASTQs (~16GB) excluded from rsync — not needed for browsing results
- `--mock` flag on seed script creates small stub files for local dev

## Open items

- Run full backend test suite inside Docker to verify no regressions
- Actually rsync dev-data to EC2 and run seed script in production
- Consider adding a tooltip-based walkthrough (e.g., react-joyride) as a future enhancement

## Key file paths

- `backend/migrations/versions/b4c7e2f19a53_add_is_reference_to_projects.py`
- `backend/services/permission_helpers.py`
- `backend/services/project_service.py`
- `scripts/seed_reference_project.py`
- `frontend/src/pages/HomePage.tsx`
- `frontend/src/pages/ProjectDetailPage.tsx`
- `frontend/src/pages/ExperimentView.tsx`
- `docs/reference-project-deployment.md`
