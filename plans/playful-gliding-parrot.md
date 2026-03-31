# Cleave Phase 1 Scaffold — Execution Plan

## Context
Cleave is a self-hosted CUT&RUN/CUT&Tag bioinformatics platform. The repo currently has documentation, reference scripts, and test data but NO application code. This plan executes `scaffold-prompt.md` to create the complete monorepo scaffold: backend (FastAPI + SQLAlchemy + Alembic), frontend (React + Vite + Tailwind), Docker Compose, and all configuration files.

## Pre-conditions Verified
- No `backend/` or `frontend/` directories exist — clean slate
- All 27 reference files (adapters, blacklists, chrom_sizes, tools) confirmed present in `references/`
- CLAUDE.md exists and must NOT be modified
- `references/` directory must NOT be modified

## Execution Order

### Phase A: Root Config Files
1. `.env.example` — All environment variables with defaults
2. `.gitignore` — Python, Node, Postgres, IDE, genomic data ignores
3. `docker-compose.yml` — db + api + frontend services

### Phase B: Backend Config & Core
4. `backend/pyproject.toml` — Dependencies, ruff config
5. `backend/alembic.ini` — Alembic configuration
6. `backend/Dockerfile` — Python 3.11-slim container
7. `backend/config.py` — Pydantic BaseSettings
8. `backend/database.py` — Async SQLAlchemy engine, session, Base
9. `backend/main.py` — FastAPI app, CORS, router includes, health endpoint
10. `backend/dependencies.py` — get_db, get_current_user, require_project_role

### Phase C: Backend Models (SQLAlchemy 2.0 mapped_column)
11. `backend/models/__init__.py` — Re-exports all models
12. `backend/models/user.py`
13. `backend/models/project.py` — Project + ProjectMember
14. `backend/models/experiment.py`
15. `backend/models/fastq_file.py`
16. `backend/models/reaction.py`
17. `backend/models/analysis_job.py`
18. `backend/models/job_output.py`
19. `backend/models/notification.py`

### Phase D: Backend Schemas (Pydantic v2)
20. `backend/schemas/__init__.py`
21. `backend/schemas/common.py` — Enums, PaginatedResponse, ErrorResponse
22. `backend/schemas/auth.py`
23. `backend/schemas/user.py`
24. `backend/schemas/project.py`
25. `backend/schemas/experiment.py`
26. `backend/schemas/reaction.py`
27. `backend/schemas/fastq_file.py`
28. `backend/schemas/job.py`
29. `backend/schemas/notification.py`

### Phase E: Backend Routers
30. `backend/routers/__init__.py`
31. `backend/routers/auth.py` — login, register, refresh
32. `backend/routers/users.py` — /users/me
33. `backend/routers/projects.py` — Full project CRUD + members
34. `backend/routers/experiments.py` — Experiment CRUD
35. `backend/routers/reactions.py` — 501 stub
36. `backend/routers/fastq_files.py` — 501 stub
37. `backend/routers/jobs.py` — 501 stub
38. `backend/routers/files.py` — 501 stub
39. `backend/routers/notifications.py` — 501 stub

### Phase F: Backend Services
40. `backend/services/__init__.py`
41. `backend/services/auth_service.py`
42. `backend/services/project_service.py`
43. `backend/services/experiment_service.py`
44. `backend/services/notification_service.py`

### Phase G: Backend Migrations & Pipeline Stubs
45. `backend/migrations/env.py` — Async Alembic env
46. `backend/migrations/script.py.mako` — Migration template
47. `backend/migrations/versions/` — Empty directory
48. `backend/pipelines/__init__.py` — Dispatch function
49. `backend/pipelines/base.py` — PipelineStage ABC
50. Copy reference files to `backend/pipelines/adapters/`, `reference/`, `tools/`

### Phase H: Backend Worker & Tests
51. `backend/worker.py` — Standalone worker stub
52. `backend/tests/__init__.py`
53. `backend/tests/conftest.py` — Test fixtures
54. `backend/tests/test_auth.py` — Test stubs
55. `backend/tests/test_projects.py` — Test stubs
56. `backend/tests/test_experiments.py` — Test stubs

### Phase I: Frontend Config
57. `frontend/package.json`
58. `frontend/tsconfig.json`
59. `frontend/tsconfig.app.json`
60. `frontend/tsconfig.node.json`
61. `frontend/vite.config.ts`
62. `frontend/tailwind.config.js`
63. `frontend/postcss.config.js`
64. `frontend/index.html`
65. `frontend/.eslintrc.cjs`

### Phase J: Frontend Source — Core
66. `frontend/src/main.tsx`
67. `frontend/src/App.tsx`
68. `frontend/src/index.css`
69. `frontend/src/vite-env.d.ts`

### Phase K: Frontend Source — API Layer
70. `frontend/src/api/client.ts`
71. `frontend/src/api/auth.ts`
72. `frontend/src/api/projects.ts`
73. `frontend/src/api/experiments.ts`
74. `frontend/src/api/types.ts`

### Phase L: Frontend Source — Hooks, Contexts, Lib
75. `frontend/src/hooks/useAuth.ts`
76. `frontend/src/hooks/useProjects.ts`
77. `frontend/src/contexts/AuthContext.tsx`
78. `frontend/src/lib/constants.ts`
79. `frontend/src/lib/utils.ts`

### Phase M: Frontend Source — Components
80. `frontend/src/components/layout/Navbar.tsx`
81. `frontend/src/components/layout/Breadcrumbs.tsx`
82. `frontend/src/components/layout/GradientBackground.tsx`
83. `frontend/src/components/layout/Card.tsx`
84. `frontend/src/components/ui/Button.tsx`
85. `frontend/src/components/ui/StatusBadge.tsx`
86. `frontend/src/components/ui/DataTable.tsx`
87. `frontend/src/components/ui/WizardModal.tsx`
88. `frontend/src/components/ui/Modal.tsx`
89. `frontend/src/components/ui/Input.tsx`
90. `frontend/src/components/auth/ProtectedRoute.tsx`

### Phase N: Frontend Source — Pages
91. `frontend/src/pages/LoginPage.tsx`
92. `frontend/src/pages/RegisterPage.tsx`
93. `frontend/src/pages/HomePage.tsx`
94. `frontend/src/pages/ProjectDetailPage.tsx`
95. `frontend/src/pages/ExperimentView.tsx`
96. `frontend/src/pages/experiment/DescriptionTab.tsx`
97. `frontend/src/pages/experiment/FastqsTab.tsx`
98. `frontend/src/pages/experiment/ReactionsTab.tsx`
99. `frontend/src/pages/experiment/AlignmentTab.tsx`
100. `frontend/src/pages/experiment/PeakCallingTab.tsx`
101. `frontend/src/pages/experiment/HistoryTab.tsx`
102. `frontend/src/pages/experiment/AllFilesTab.tsx`
103. `frontend/src/pages/AnalysisQueuePage.tsx`
104. `frontend/src/pages/SettingsPage.tsx`

### Phase O: Wiring & Verification
105. Install frontend dependencies (`npm install`)
106. Install backend dependencies (`pip install -e .`)
107. Verify `ruff check backend/` passes
108. Verify `npx tsc --noEmit` passes
109. Test `docker compose config` validates

## Design Decisions (from scaffold-prompt.md Part 4)
- SQLAlchemy 2.0 style: `Mapped[]`, `mapped_column()`, string `back_populates`
- Async everywhere: `create_async_engine`, `async_sessionmaker`, all handlers `async def`
- Pydantic v2: `ConfigDict`, `model_validator`, standard type hints
- No global state (except `settings` singleton)
- camelCase API responses via Pydantic `alias_generator`
- `@/` path alias for frontend imports
- Real CUTANA labels, no Lorem ipsum

## Verification Checklist (from scaffold-prompt.md Part 3)
- [ ] `docker compose up` starts all three services
- [ ] `localhost:8000/api/v1/health` returns `{"status": "ok"}`
- [ ] `localhost:8000/docs` shows OpenAPI docs
- [ ] `localhost:5173` shows React app with gradient
- [ ] Frontend calls health via Vite proxy (no CORS)
- [ ] `alembic upgrade head` applies migrations
- [ ] `alembic downgrade base` reverses cleanly
- [ ] `psql` shows all tables
- [ ] `ruff check .` passes
- [ ] `npx tsc --noEmit` passes
