# Plan: Add Infrastructure Gap Items to todos.md and Decisions Doc

## Context

A spec completeness audit identified 8 Phase-1-relevant web app infrastructure gaps and 4 later-phase gaps. The pipeline/bioinformatics side is fully specified, but the web app scaffolding needs decisions on: env vars, error format, pagination, CORS, auth details, API client pattern, email delivery, and logging. User provided decisions on the 4 that needed input; the remaining items are "bake into Phase 1 scaffold" tasks.

## User Decisions (2026-03-23, second round)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Password reset | Skip entirely | Admins reset passwords manually. Appropriate for 8-10 lab members. |
| Email notifications | Amazon SES from Phase 3 | Already on AWS, pennies per email. In-app notifications for Phase 1-2. |
| Frontend API client | Axios | Interceptors for auth/error handling. Request cancellation and progress events useful for file uploads. |
| Refresh token CSRF | httpOnly cookie + SameSite=Lax | Standard secure approach. Survives page refreshes. SameSite=Lax prevents CSRF. |

## Deliverables

### 1. Update `todos.md`

Add a new section **"Phase 1 scaffolding tasks (for Claude)"** between the existing Phase 1 and Phase 2 sections. These are items Claude should handle during scaffold generation, not things Zakir needs to do manually. They serve as a checklist.

New items to add:
- [ ] Create `.env.example` with full env var inventory (DATABASE_URL, SECRET_KEY, REFRESH_SECRET_KEY, ACCESS_TOKEN_EXPIRE_MINUTES=15, REFRESH_TOKEN_EXPIRE_DAYS=7, CORS_ORIGINS, UPLOAD_DIR, MAX_UPLOAD_SIZE_MB, PIPELINE_MODE, STORAGE_ROOT; Phase 3+: GENOME_INDEX_DIR, AWS_SES_REGION, AWS_SES_FROM_EMAIL, WORKER_POLL_INTERVAL=2)
- [ ] Define standardized API error response schema: `{"error": str, "detail": str | null, "field_errors": dict | null}`
- [ ] Define pagination response envelope: `{"items": [...], "total": int, "page": int, "per_page": int}`
- [ ] Add CORS middleware to FastAPI (allow `:5173` in dev, not needed in prod behind NGINX)
- [ ] Implement refresh token as httpOnly cookie with SameSite=Lax
- [ ] Set up Axios client with interceptors (auth header injection, 401 → refresh flow, error normalization)
- [ ] Set up Python logging + structlog for structured JSON logging from day one
- [ ] Define QC report Pydantic schemas (AlignmentQCReport, PeakCallingQCReport) — based on exported CSVs in `cutana/H3K4me3/`

Also add under Phase 3 section:
- [ ] Set up Amazon SES for job completion email notifications

### 2. Update `docs/cleave-spec-decisions.md`

Add a new **Section 12: Web App Infrastructure Decisions** after the existing Section 11, documenting all 12 items (8 Phase-1 + 4 later-phase) with their resolutions:

1. **Env var inventory**: `.env.example` enumerates all vars from day one
2. **API error format**: `{"error": str, "detail": str | null, "field_errors": dict | null}`
3. **Pagination contract**: `{"items": [...], "total": int, "page": int, "per_page": int}`
4. **CORS**: FastAPI CORSMiddleware, allow `:5173` in dev
5. **CSRF / refresh token**: httpOnly cookie + SameSite=Lax
6. **Password reset**: Skip. Admins reset manually.
7. **API client**: Axios with interceptors for auth headers, 401 refresh, error normalization
8. **Email notifications**: Amazon SES from Phase 3. In-app only for Phase 1-2.
9. **QC report schemas**: Define Pydantic models from CUTANA Cloud CSVs (Phase 3 task)
10. **Gene annotation BEDs**: Download from UCSC/GENCODE (Phase 3 task, in todos.md)
11. **hg38 blacklist**: Ship both ENCODE/DAC v1 (lab's) and Boyle Lab v2. Default to v2.
12. **Application logging**: Python `logging` + structlog for structured JSON. Set up in scaffold.

### 3. Update session log

Append to `logs/2026-03-23_pre-build-audit-and-repo-restructure.md` noting the infrastructure decisions round.

## Files to modify
- `todos.md` (root)
- `docs/cleave-spec-decisions.md`
- `logs/2026-03-23_pre-build-audit-and-repo-restructure.md`

## Verification
- Read updated todos.md and confirm all 12 infrastructure items are captured
- Read updated decisions doc and confirm Section 12 exists with all resolutions
- No contradictions with CLAUDE.md or architecture plan
