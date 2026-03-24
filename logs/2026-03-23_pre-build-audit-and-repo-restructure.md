# 2026-03-23: Pre-Build Audit & Repo Restructure

## What was done

### New files created
- `docs/cleave-spec-decisions.md` — 11-section decisions document resolving all 13 TODO.md questions, documenting 9 critical corrections to existing docs, DiffBind bugs, normalization algorithm, pipeline parameter reference, effective genome sizes, complete file index, and data download steps

### Files updated
- `docs/cutana-architecture-plan.md` — Fixed Peak Caller Support Matrix (corrected MACS2 q-value, added SEACR v1.1, fragment filter, SEACR preprocessing docs). Added 6 new resolved questions (#11-#16) to Open Questions table. Updated Phase 3 for spike-in QC.
- `CLAUDE.md` — Updated `@` references to `docs/` paths. Added fragment filter, SEACR preprocessing, MACS2 q-value to Pipeline-Specific Rules. Added 5 new gotchas. Added Session Logging instruction. Added spike-in QC to Phase 3.

### Repo restructure
- `cut-run/` moved into `references/cut-run/`
- All doc MDs moved from root to `docs/`
- `TODO.md` renamed to `docs/cleave-questions.md`
- Created `logs/` directory with `.gitkeep`

## Decisions made
- MACS2 q-value: default `0.01` (lab standard)
- Fragment size filter (<120bp): default ON
- SNAP-CUTANA spike-in QC: implement in Phase 3 (barcodes found in repo)
- File uploads: plain multipart initially
- SSE: 2-second polling initially
- IgG: run peak calling on it, flag as control
- User will export CUTANA Cloud QC CSVs (now in `cutana/H3K4me3/`)

## Infrastructure decisions (second round)
- Password reset: skip entirely, admins reset manually
- Email notifications: Amazon SES from Phase 3, in-app only for Phase 1-2
- Frontend API client: Axios with interceptors
- Refresh token CSRF: httpOnly cookie + SameSite=Lax
- Also specified: env var inventory, API error format, pagination contract, CORS, structured logging
- All 12 items documented in `docs/cleave-spec-decisions.md` Section 12
- Scaffolding checklist added to `todos.md`

## Open items
- Gene annotation BEDs (RefSeq) still need downloading for TSS/gene body heatmaps
- Bowtie2 indices need scp from lab instance (for EC2, not local dev)
- hg38 blacklist supplement (Boyle Lab v2) to download
- Phase 1 scaffolding not yet started

## Key file paths
- `docs/cleave-spec-decisions.md` — authoritative decisions document
- `docs/cutana-architecture-plan.md` — architecture plan (updated)
- `CLAUDE.md` — project instructions (updated)
- `cutana/H3K4me3/` — QC data CSVs from CUTANA Cloud test run
- `references/` — all lab pipeline scripts + cut-run scripts
