# Cleave -- Action Items

Things that need to be done by **you** (Zakir) before or during development. Grouped by when they block progress.

---

## Before Phase 1 (do now)

Nothing blocking from you. Phase 1 is pure web app (React + FastAPI + Postgres + auth + CRUD). No bioinformatics dependencies.

### Phase 1 scaffolding checklist (for Claude to handle)

These are infrastructure patterns to bake into the scaffold. Not things you need to do manually.

- [x] Create `.env.example` with full env var inventory
- [x] Standardized API error response: `ErrorResponse` in `schemas/common.py`
- [x] Pagination response envelope: `PaginatedResponse[T]` in `schemas/common.py`
- [x] CORS middleware in FastAPI (`main.py`)
- [x] Refresh token as httpOnly cookie with `SameSite=Lax` (`routers/auth.py`)
- [x] Axios client with interceptors (`api/client.ts`)
- [x] Python `logging` + `structlog` for structured JSON logging (`logging_config.py`)
- [ ] QC report Pydantic schemas — deferred to Phase 3 per scaffold-prompt.md
- [x] Rate limiting setup — `slowapi` on `/api/v1/auth/login` (5/min) and `/api/v1/auth/register` (3/min). Done in Phase 1.1.
- [x] No password reset flow in Phase 1 -- fastapi-users includes `get_reset_password_router()` but it requires SES email transport. **Deferred to Phase 3**, not permanently skipped. Enable when SES is configured.

### Phase 1.1 auth — completed 2026-03-24

- [x] Install `fastapi-users[sqlalchemy]`, `slowapi`; remove `python-jose`, `passlib`
- [x] User model extends `SQLAlchemyBaseUserTable[int]` with custom fields preserved
- [x] Alembic migration: rename `password_hash` → `hashed_password`, add `is_active`/`is_superuser`/`is_verified`
- [x] `backend/auth.py` — UserManager, JWT strategies, auth backend, `current_active_user`
- [x] Custom login/register/refresh/logout endpoints (dual transport: bearer body + httpOnly cookie)
- [x] All routers updated to use `current_active_user`
- [x] `require_project_role()` preserved, uses new dependency
- [x] Rate limiting on login (5/min) and register (3/min)
- [x] Auth test suite (13 tests, all passing)

### Phase 1.2 auth frontend — completed 2026-03-24

- [x] Fixed critical casing mismatch: auth `TokenResponse`, `LoginRequest`, `RegisterRequest` now extend `CamelModel` (consistent with all other schemas)
- [x] Added `logout()` to `api/auth.ts`; `AuthContext.logout()` now calls backend to delete refresh cookie
- [x] Added request queue to Axios 401 refresh interceptor (`isRefreshing` flag + `failedQueue`)
- [x] Cleaned up refresh interceptor: removed unnecessary `{ refreshToken: null }` body, added `_retry` flag to prevent infinite loops
- [x] Marked `cc-scaffold-prompt.md` as executed
- [x] Closed non-issues: CORS `withCredentials` (not needed due to proxy), frontend auth contract (already correct)

---

## Known issues to address during implementation

Items from code review that will cause bugs or security problems if not addressed in the relevant phase. Grouped by severity.

### Will cause bugs

- [ ] **Test database must be Postgres, not SQLite.** Current `tests/conftest.py` uses SQLite for speed, but `analysis_jobs.params` is JSONB which SQLite doesn't support. When Phase 1.3+ tests touch jobs, they will fail or silently change column behavior. Fix: use a second database (`cleave_test`) in the same Docker Compose Postgres container. The auth-only tests work on SQLite for now, but switch before Phase 1.3.

- [x] **Frontend auth contract: no `refresh_token` in body.** Confirmed correct. `TokenResponse` has no `refreshToken` field; refresh uses cookie only. Fixed casing mismatch (auth schemas now extend `CamelModel` like all other schemas) in Phase 1.2.

- [x] **Axios refresh interceptor needs a request queue.** Fixed in Phase 1.2: queued refresh pattern with `isRefreshing` flag and `failedQueue` array in `api/client.ts`.

- [ ] **Mock mode must create stub files on disk, not just DB records.** Phase 2.9 (file browser), 2.10 (download), and Phase 5 (IGV) depend on files at real paths. If mock mode only returns mock API data without creating small placeholder files at `{STORAGE_ROOT}/projects/{pid}/{eid}/...`, half the frontend features won't work locally. Specify in each pipeline module's `mock_run()`: create actual stub files at the expected paths.

- [ ] **Worker DB session management.** The worker is a standalone process, not a FastAPI request — can't use `Depends(get_db)`. Must create a new session per job poll cycle via `async_sessionmaker` from `database.py`. Don't use a single long-lived session (stale reads) and don't forget to commit. Address when implementing Phase 3.1.

### Security (public-facing URL)

- [ ] **File browser path traversal.** Phase 2.9 file browser "scans the experiment directory." Any endpoint that constructs paths from user input must validate paths are within `{STORAGE_ROOT}/projects/{project_id}/{experiment_id}/` and reject `..` or absolute paths. Add explicit validation in Phase 2.9.

- [x] **CORS `withCredentials` for local dev.** Non-issue: Vite dev proxy (`/api` → `:8000`) and production NGINX proxy both make cookies same-origin. `withCredentials` is not needed in either environment. No action required.

### Consistency

- [ ] **`storage_bytes` update atomicity.** Both uploads and job completion update `storage_bytes` on projects and experiments. Use `UPDATE ... SET storage_bytes = storage_bytes + :delta` (atomic SQL) instead of read-modify-write to avoid race conditions if two uploads finish near-simultaneously.

### Domain validation rules (not in docs yet)

These are implicit domain constraints that an LLM won't infer:

- [ ] R1 and R2 FASTQs must always be uploaded as a pair — reject orphaned single-end uploads
- [ ] An experiment with zero reactions cannot launch alignment — validate before job creation
- [ ] IgG should not be the only reaction in an alignment (needs targets to be useful) — warn or block
- [ ] Paired-end FASTQ filenames must share a common prefix differing only in R1/R2 designation

### Documentation maintenance

- [x] **Mark `scaffold-prompt.md` as executed.** Added status line to `docs/cc-scaffold-prompt.md` in Phase 1.2.

- [ ] **Consider splitting `CLAUDE.md` pipeline rules.** Pipeline-specific rules (MACS2 q-value, SEACR preprocessing chain, effectiveGenomeSize per genome) are in CLAUDE.md but only matter in Phases 3-6. LLM attention to late instructions degrades over long system prompts. Consider moving pipeline rules to a `PIPELINE.md` referenced only during pipeline phases, keeping CLAUDE.md focused on universal standards.

### Dev tooling gaps

- [ ] **Ruff not in Docker image.** `ruff` is not installed in the API container — `docker compose exec api ruff check .` fails. Add `ruff` to dev dependencies in `pyproject.toml` or install it in the Dockerfile so linting works inside the container.
- [ ] **ESLint config missing.** ESLint 9 requires `eslint.config.js` (flat config format). The frontend has no config file, so `npm run lint` fails. Create `frontend/eslint.config.js` with TypeScript + React rules.

---

## Before Phase 2 (data management)

- [x] ~~Create test FASTQs~~ -- Done. `test_data/test_R1.fastq.gz` + `test_R2.fastq.gz` (100K reads from K4me3_ctrl1, ~5MB each)
- [x] ~~Compile kseq_test for Mac~~ -- Done. `references/cutruntools/kseq_test_mac` (arm64)

---

## Before Phase 3 (core pipeline)

### You need to export from CUTANA Cloud

- [x] ~~Alignment stats CSV~~ -- Done. `cutana/H3K4me3/Mouse mm10_alignment_metrics.csv`

### You need to download (for EC2 deployment, not local dev)

- [ ] **Bowtie2 indices** -- scp from lab instance (saves hours vs rebuilding):
  ```bash
  scp -i 210323.pem ubuntu@<ec2>:/home/ubuntu/cutruntools/assemblies/chrom.mm10/mm10*.bt2 /data/cleave/genomes/mm10/
  scp -i 210323.pem ubuntu@<ec2>:/home/ubuntu/cutruntools/assemblies/chrom.hg38/hg38*.bt2 /data/cleave/genomes/hg38/
  scp -i 210323.pem ubuntu@<ec2>:/home/ubuntu/cutruntools/assemblies/chrom.ecoli/ecoli*.bt2 /data/cleave/genomes/ecoli/
  ```

- [ ] **Gene annotation BEDs** for TSS/gene body heatmaps (mm10 + hg38). Two options:
  - UCSC Table Browser: assembly > track "NCBI RefSeq" > table "refGene" > output BED
  - GENCODE GTFs: gencodegenes.org (mm10 Release M25, hg38 Release 44)

- [ ] **HOMER genome data** (on EC2 instance):
  ```bash
  perl configureHomer.pl -install mm10
  perl configureHomer.pl -install hg38
  ```

### Phase 3 implementation tasks (for Claude)

- [ ] Set up Amazon SES for job completion email notifications
- [ ] Enable fastapi-users password reset flow (`get_reset_password_router()`) once SES is configured — config flag flip, not a feature build. Add `/auth/forgot-password` to slowapi rate limiting list.
- [ ] Define QC report Pydantic schemas from exported CUTANA Cloud CSVs
- [ ] Switch test database from SQLite to Postgres (see "Known issues" above)

### Consider supplementing

- [ ] **hg38 blacklist** -- The lab's `references/cutruntools/hg38.blacklist.bed` has only 38 entries (unusually small). Consider downloading Boyle Lab v2 (`hg38-blacklist.v2.bed.gz`, ~910 entries) from https://github.com/Boyle-Lab/Blacklist as a more comprehensive alternative.

---

## Before Phase 6 (lab extensions)

Nothing to collect -- all lab scripts are already in `references/`. But when you implement DiffBind, note:
- [ ] **Fix DiffBind R script bugs** before porting (3 bugs documented in `docs/cleave-spec-decisions.md` section 4)

---

## Already done (for reference)

These were listed as outstanding in the old questions doc but are now resolved:

- [x] Adapter FASTAs -- all 4 in `references/cutruntools/adapters/`
- [x] Blacklist BEDs -- mm10, hg38, hg19 in `references/cutruntools/`
- [x] Chromosome sizes -- mm10, hg38, hg19, ecoli in `references/cutruntools/assemblies/`
- [x] SEACR script -- v1.1 in `references/cutruntools/SEACR_1.1.sh`
- [x] kseq_test source -- `references/cutruntools/kseq_test.c` + build script
- [x] K-MetStat barcode sequences -- all 32 in `references/media_misc/k_metstat_script.sh`
- [x] DiffBind scripts -- `references/DPA/diffbind.R`, `diffbind_peaklist.R`, `diffbind_peaklist_edgeR.R`
- [x] Roman normalization -- `references/media_normalization/normalization.r`
- [x] Pearson correlation -- `references/media_pearson_corr/peak_extractor.r` + `pearson.py`
- [x] Heatmap script -- `references/genomewide_plots/heatmaps.sh`
- [x] Peak calling QC CSVs -- `cutana/H3K4me3/peak_caller_metrics.csv`, `top_called_peaks.csv`, etc.
- [x] Peak calling input config -- `cutana/H3K4me3/H3K4me3-peak-calling.csv`
- [x] Reactions metadata -- `cutana/H3K4me3/H3K4me3-reactions.csv`
- [x] FastQC reports -- `cutana/fastqc/` (10 HTML + 10 TXT)
- [x] Methods text -- `cutana/H3K4me3/methods.txt`
- [x] Conda env specs -- 27 YAML files in `references/conda_envs/`
