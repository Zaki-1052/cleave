# 2026-06-26 — Oracle Cloud Migration (Code + Deployment Guide)

## What was done

- **SMTP email support**: Added SMTP transport alongside AWS SES in `email_service.py`. Priority: SMTP > SES > disabled. Uses stdlib `smtplib` (no new dependency). 6 new config settings in `config.py`.
- **STAR memory limit**: Added `--limitBAMsortRAM` flag to STAR command in `rnaseq_alignment.py` via new `STAR_BAM_SORT_RAM` config setting (8GB default). Updated methods text to include the flag.
- **Conda env update**: Added `star`, `salmon`, `fastp`, `subread`, `multiqc`, `rseqc` to `conda_cleave.yml` (RNA-seq tools were missing from the master YAML).
- **Oracle deployment guide**: Created `docs/ORACLE_DEPLOYMENT.md` — 19-section guide covering aarch64 setup, sparse STAR indices, resource-constrained config, Oracle networking, disk budget.
- **`.env.example` updated**: Added SMTP settings, pipeline concurrency, and STAR RAM limit.
- **SICER2 disabled in frontend**: Removed from all user-facing selections (peak caller dropdown, auto-pipeline config, landing page, docs). Backend code kept intact for future x86 use.

## Decisions made

- **SMTP over SES replacement**: Added SMTP as an alternative rather than replacing SES — both transports coexist, SMTP takes priority if configured.
- **Storage path**: Oracle uses `/opt/cleave/` (root filesystem) instead of EC2's `/data2/cleave/` (secondary volume). All paths are env-configurable, no code changes needed.
- **STAR sparse indices**: Required on 24GB RAM. `--genomeSAsparseD 2` cuts memory to ~16GB at ~2x speed cost. Indices must be rebuilt on Oracle.
- **Concurrency**: `MAX_CONCURRENT_REACTIONS=2`, `MAX_CONCURRENT_RNASEQ_REACTIONS=1`, `TRIMMOMATIC_HEAP_SIZE=2g`, Uvicorn `--workers 2` for 4 OCPU / 24GB instance.
- **SICER2 disabled**: Not available on aarch64. Removed from UI but kept backend code as legacy. Users have MACS2 (narrow + broad) and SEACR as alternatives. Default caller remains SEACR stringent.

## Open items

- Oracle Cloud Email Delivery SMTP credentials not yet configured (requires OCI console setup)
- Genome indices not yet built on Oracle (STAR sparse build takes 2-4 hours per genome)
- Reference project data not yet transferred from EC2
- Actual deployment in progress — PostgreSQL configured, conda env created, deployment guide being followed step-by-step

## Key file paths

- `backend/config.py` — SMTP + STAR_BAM_SORT_RAM settings
- `backend/services/email_service.py` — SMTP transport
- `backend/pipelines/rnaseq_alignment.py` — `--limitBAMsortRAM` flag
- `backend/pipelines/methods_text.py` — methods text update
- `references/conda_envs/conda_cleave.yml` — RNA-seq tools added
- `.env.example` — new settings documented
- `docs/ORACLE_DEPLOYMENT.md` — full Oracle deployment guide (new)
- `frontend/src/lib/constants.ts` — SICER2 removed from PEAK_CALLERS
- `frontend/src/lib/docs-content.ts` — SICER2 removed from docs
- `frontend/src/pages/LandingPage.tsx` — SICER2 removed from marketing
- `frontend/src/components/experiments/AutoPipelineConfigPanel.tsx` — SICER2 removed from dropdown
- `frontend/src/components/peak-calling/PeakCallingDetailsStep.tsx` — updated description
- `frontend/src/components/peak-calling/PeakCallingSettingsStep.tsx` — updated training hint
