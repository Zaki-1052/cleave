# EC2 Production Deployment — Session Log

**Date**: 2026-03-30
**Scope**: Deploying Cleave to the Ferguson Lab's EC2 m5.8xlarge (Ubuntu 18.04) following `docs/DEPLOYMENT_GUIDE.md`

---

## Issues Encountered & Resolved

### 1. SICER2 pip build failure (Python 3.11 incompatibility)

**Symptom**: `pip install SICER2` fails with `fatal error: longintrepr.h: No such file or directory` and later `PyCode_New` undeclared.

**Root cause**: SICER2's C extensions reference Python internals that moved in 3.11 (`longintrepr.h` → `cpython/longintrepr.h`) and removed (`PyCode_New`). Multiple incompatibilities — not fixable with a single symlink.

**Attempted fixes**:
1. Symlink `longintrepr.h` — fixed one error but hit `PyCode_New` next
2. `conda install -c bioconda sicer2` — bioconda only has a py3.9 build, won't solve into a py3.11 env
3. `mamba install -c bioconda sicer2` — same result, faster failure

**Final fix**: Separate conda env + wrapper script:
```bash
mamba create -n sicer2 -c bioconda -c conda-forge python=3.9 sicer2
```
Wrapper at `$CONDA_PREFIX/bin/sicer` activates the sicer2 env and `exec`s the real binary. Hardcoded `/home/ubuntu/miniconda3` path because systemd worker's PATH doesn't include conda itself.

**Verification**: Traced the full call chain through `peak_calling.py` → `shutil.which("sicer")` → `run_cmd(subprocess.run())` to confirm the wrapper approach works with the pipeline architecture. Key points: no infinite recursion (PATH changes after `conda activate`), exit codes propagate via `exec`, stdout/stderr captured correctly.

**Files modified**: `docs/DEPLOYMENT_GUIDE.md` (install instructions + troubleshooting), `references/conda_envs/conda_cleave.yml` (removed SICER2 from pip section, added comment)

### 2. Phase 3 pip packages not installed

**Symptom**: `import fastapi` → `ModuleNotFoundError`. Phases 1-2 (bioinformatics tools + R) were fine.

**Root cause**: The original `pip install` command included SICER2 at the end. When SICER2 failed, pip rolled back the entire install — none of the web framework packages were retained.

**Fix**: Re-ran pip install without SICER2 (all packages from `fastapi` through `asyncssh`).

### 3. `$CONDA_PREFIX` empty when creating wrapper

**Symptom**: `ln: failed to create symbolic link '/include/python3.11/longintrepr.h': No such file or directory`

**Root cause**: Ran the command without activating the cleave conda env first. `$CONDA_PREFIX` is only set when an env is activated.

**Fix**: `conda activate cleave` before running commands that reference `$CONDA_PREFIX`.

### 4. HOMER `configureHomer.pl` not found

**Symptom**: `configureHomer.pl: command not found` after installing HOMER to `/data2/cleave/homer/`.

**Root cause**: HOMER's bin directory wasn't on PATH. The `~/.bash_profile` entry (`PATH=$PATH:/data2/cleave/homer//bin/`) wasn't sourced in the current shell.

**Fix**: `source ~/.bashrc` then ran with full path. Updated systemd service PATH in deployment guide to include `/data2/cleave/homer/bin`.

### 5. Node.js too old for Vite build (Ubuntu 18.04 + glibc 2.27)

**Symptom**: `npm run build` → `TypeError: crypto$2.getRandomValues is not a function` (Node 16). Node 18 and 20 fail with `GLIBC_2.28 not found`.

**Root cause**: Ubuntu 18.04 ships glibc 2.27. Node 18+ requires glibc 2.28+. The `crypto.getRandomValues` API (needed by Vite) was added in Node 19.

**Attempted fixes**:
1. `nvm install 20` — `GLIBC_2.28 not found`
2. `nvm install 18` — same glibc error (18.20+ requires 2.28)
3. `nvm install 18.17.0` — same

**Final fix**: Build frontend locally on Mac (Node 20) and `scp` the `dist/` directory to EC2. Node is only needed at build time — NGINX serves the static files, no Node runtime needed on the server.

**Files modified**: `docs/DEPLOYMENT_GUIDE.md` (Section 9 rewritten for local build + scp)

### 6. `scp` nested directory issue

**Symptom**: `scp -r dist/ ubuntu@ec2:/data2/cleave/app/frontend/dist/` → `scp: realpath ... No such file` (target doesn't exist), and after `mkdir -p`, files ended up at `dist/dist/` (double-nested).

**Root cause**: Two issues: (a) scp requires target directory to exist, (b) trailing `/` on source copies contents *into* the target, creating nesting.

**Fix**: Target the parent directory without trailing slash on source:
```bash
scp -r dist/ ubuntu@ec2:/data2/cleave/app/frontend/
```
Cleaned up nested dir: `mv dist/dist/* dist/ && rm -r dist/dist`

### 7. Seed script DB connection failure

**Symptom**: `asyncpg.exceptions.InvalidPasswordError: password authentication failed for user "cleave"`

**Root cause**: Script was run from `/data2/cleave/app/` but `.env` is at `/data2/cleave/app/backend/.env`. Pydantic Settings loads `.env` relative to working directory.

**Fix**: Run from the backend directory: `cd /data2/cleave/app/backend && python ../scripts/seed_reference_project.py`

**Files modified**: `docs/DEPLOYMENT_GUIDE.md` (updated seed script path)

### 8. macOS rsync incompatible with Ubuntu 18.04

**Symptom**: `rsync` crashes with `exit status 11` (segfault) immediately after starting file transfer. Both default protocol and `--protocol=30` failed. macOS uses `openrsync`, EC2 has GNU rsync.

**Fix**: Used `scp -r` instead. Transferred only `jobs/` and `fastqc/` directories (skipped huge trimmed FASTQs for the reference project).

**Files modified**: `docs/DEPLOYMENT_GUIDE.md` (Section 13.2 switched from rsync to scp)

### 9. EC2 Security Group — wrong group ID

**Symptom**: Added port 80 to `sg-04ad5578923262b6b` but `curl http://54.244.37.255` still timed out.

**Root cause**: The instance has a different security group attached (`sg-0e26b7db676d5f3d5`, launch-wizard-16). The first group ID came from a metadata query that returned a different group.

**Fix**: Used `aws ec2 describe-instances --query SecurityGroups` to find the correct group, then added port 80 to it.

**Files modified**: `docs/DEPLOYMENT_GUIDE.md` (Section 10.3 emphasizes finding the correct SG first)

### 10. UPLOAD_MAX_SIZE_MB too small

**Change**: Increased from 5000 (5GB) to 50000 (50GB) for large concatenated FASTQs. Also updated NGINX `client_max_body_size` from 5120m to 10240m (10GB).

---

## Deployment Guide Updates

All issues discovered during deployment were documented back into `docs/DEPLOYMENT_GUIDE.md`:

| Section | Change |
|---------|--------|
| 6.2 | SICER2 moved to separate env with wrapper script |
| 6.3 | HOMER install path clarified |
| 9 | Frontend build: local Mac + scp (not on EC2) |
| 10.1 | Added dedicated SSE location block with 86400s timeout |
| 10.1 | NGINX `client_max_body_size` → 10240m |
| 10.3 | New section: EC2 Security Group setup |
| 10.4 | Cloudflare DNS: clarified Flexible mode is fine |
| 11 | systemd PATH includes `/data2/cleave/homer/bin` |
| 13.1 | Seed script run from `backend/` directory |
| 13.2 | Switched from rsync to scp, noted macOS incompatibility |
| 14 | Domain switch: added Cloudflare Origin Certificate + Full (strict) for coleferguson.com |
| .env | `UPLOAD_MAX_SIZE_MB=50000`, `CLEANUP_ENABLED=false` |

Also updated `references/conda_envs/conda_cleave.yml` to remove SICER2 from pip section with explanatory comment.

---

## Current Deployment State

- **Conda env**: cleave (py3.11) with all tools + sicer2 (py3.9) separate env with wrapper
- **HOMER**: Installed at `/data2/cleave/homer/`, mm10/hg38/hg19 databases downloaded
- **Frontend**: Built locally, scp'd to EC2
- **Database**: Migrated, reference project seeded (Project 1, Experiment 1, 4 reactions, 6 jobs)
- **NGINX**: Running, port 80 open, SSE-aware config
- **systemd**: API + worker services configured
- **Cloudflare**: DNS proxied, Flexible SSL mode
- **Site**: `https://cleave.nazalibhai.com` — live and responding

## Open Items

- Reference project data transfer: only `jobs/` and `fastqc/` transferred (trimmed FASTQs skipped due to size)
- `coleferguson.com` domain switch: Origin Certificate + Full (strict) documented but not yet executed
- Real pipeline end-to-end test with actual FASTQ alignment not yet performed on EC2
- SICER2 wrapper not yet tested with an actual SICER2 peak calling job
- Remove stale port 80 rule from wrong security group (`sg-04ad5578923262b6b`)
