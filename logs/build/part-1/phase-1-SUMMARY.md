# Phase 1 Summary — Foundation

> 10 sessions across 2026-03-23 and 2026-03-24. Phase 1 is **complete**. All 8 done criteria checked off. 46 tests passing.

---

## What Was Built

### Auth (1.1-1.2)
- **fastapi-users** library replaces hand-rolled JWT/bcrypt. Custom login/register/refresh/logout endpoints (not generated routers) for dual-transport: access token in JSON body (15-min) + refresh token in httpOnly cookie (7-day).
- Argon2 password hashing via `pwdlib`. Rate limiting via `slowapi` (5/min login, 3/min register).
- Frontend: `AuthContext` stores token in memory, Axios interceptor auto-refreshes on 401 with request queue (`isRefreshing` + `failedQueue`), fire-and-forget logout.
- Password reset deferred to Phase 7.5 (needs SES).

### Project CRUD (1.3)
- Full CRUD with membership filtering (list only shows member projects). Creator auto-added as admin.
- `UserBrief` nested in `MemberRead` for user details. `selectinload` on all member queries.
- Frontend: HomePage project cards, CreateProjectModal, ProjectDetailPage with member sidebar + experiments DataTable.

### Member Management (1.4)
- Invite by email, change roles, remove members. Roles: `admin`, `contributor`, `viewer` (validated via `Literal` type).
- Guards: self-role-change (400), self-removal (400), last-admin demotion/removal (400), duplicate invite (409).
- Invite creates `project_invitation` notification with inviter name + project name.
- Frontend: ManageMembersModal with role dropdowns, own-role disabled.

### Experiment CRUD (1.5)
- Create (100-char name limit, assay type `CUT&RUN`/`CUT&Tag`), list (by project), get, update, delete.
- Permission: admin + contributor can create/update/delete; viewer is read-only.
- Frontend: CreateExperimentModal (step 1 only — wizard conversion in Phase 2), ExperimentView with tab routing, DescriptionTab with real metadata.

### Notifications (1.6)
- Backend: `GET /notifications`, `PATCH /notifications/:id/read`. Welcome notification on register, project_invitation on member invite.
- Frontend: NotificationPanel dropdown from bell icon, red unread badge, per-type icons, click-to-navigate + mark-read. 30s polling (SSE deferred to Phase 3).

### Settings (1.7)
- `PATCH /users/me` updates firstName, lastName, emailNotifications (partial update via `exclude_unset=True`).
- Frontend: SettingsPage with read-only email, editable name fields, notification dropdown, change detection, save + refreshUser.

### Tests (1.8)
- 46 tests across 5 files: auth (13), projects (14), experiments (10), notifications (5), users (4).
- Test infra: Postgres test DB (`cleave_test`), `NullPool`, autouse `setup_db` fixture (create/drop per test), rate limiter disabled.

---

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth library | fastapi-users | Production-audited, eliminates ~500 lines of security code |
| Token transport | Bearer body + httpOnly cookie | Access token in memory (XSS-safe), refresh in cookie (CSRF-safe via SameSite=Lax) |
| Schema casing | `CamelModel` base class | All Pydantic models use camelCase JSON keys, snake_case Python fields |
| Permission model | `require_project_role()` dependency | Returns 403 for non-members AND wrong roles (not 404) |
| ORM loading | `selectinload` | Avoids async `MissingGreenlet` for relationship access |
| Frontend state | TanStack Query (server) + useState (local) | No global store needed at lab scale (~8-10 users) |
| Test helpers | Inline per file | `conftest.py` can't be imported as module; matches established pattern |
| Experiment creation | Modal (not WizardModal) | Only step 1 in Phase 1; convert to 3-step wizard in Phase 2 |

---

## API Status After Phase 1

### Fully Implemented
- `POST /auth/login|register|refresh|logout`
- `GET|PATCH /users/me`
- `GET|POST /projects` + `GET|PATCH|DELETE /projects/:id`
- `GET|POST|PATCH|DELETE /projects/:id/members[/:uid]`
- `GET|POST /experiments` + `GET|PATCH|DELETE /experiments/:id`
- `GET /notifications` + `PATCH /notifications/:id/read`
- `GET /health`

### Stub (501 — Phase 2+)
- `GET|POST /experiments/:id/fastqs[/upload]`
- `GET|POST /experiments/:id/reactions`
- `GET|POST /experiments/:id/jobs` + `GET /jobs/:id` + `GET /jobs`
- `GET /jobs/:jid/files/:fid/download` + `GET /experiments/:id/files`

---

## Known Issues / Tech Debt

- JWT `InsecureKeyLengthWarning` in tests — dev SECRET_KEY too short (cosmetic)
- Projects router missing Query aliases for `per_page` -> `perPage` (experiments has them)
- Mock mode must create stub files on disk, not just DB records (Phase 2.9/2.10/5 depend on real paths)
- Worker DB session needs `async_sessionmaker` (not `Depends(get_db)`) — address in Phase 3.1
- File browser path traversal validation needed in Phase 2.9
- `storage_bytes` updates should use atomic SQL (`SET storage_bytes = storage_bytes + :delta`)
- Domain validation not yet enforced: R1/R2 FASTQ pairing, zero-reaction alignment block, IgG-only warning

---

## Database Schema (2 migrations applied)

9 tables: `users`, `projects`, `project_members`, `experiments`, `fastq_files`, `reactions`, `analysis_jobs`, `job_outputs`, `notifications`. All created in migration 1 (`bce0e9c5d2ee`), auth columns adjusted in migration 2 (`fafd5c9dc468`).

---

## What's Next: Phase 2 (Data Management)

FASTQ upload (multipart), FastQC integration (auto-run + report viewer), Reactions CRUD (manual + CSV import), adapter detection, trimming pipeline (mock mode), file browser, file download. See `docs/PLAN.md` Phase 2 for full spec.
