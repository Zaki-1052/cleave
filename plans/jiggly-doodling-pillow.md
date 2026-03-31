# Plan: Rewrite Deployment Guide for Real EC2 Instance

## Context

The existing `docs/DEPLOYMENT.md` is dangerously wrong for the Ferguson Lab's actual EC2 instance. It assumes a fresh instance, uses apt for bioinformatics tools, suggests Certbot for TLS, and makes up paths. The instance is **actively used** by the lab with real data, existing conda envs, and mounted volumes. A complete rewrite is required as `docs/DEPLOYMENT_GUIDE.md`.

## Instance Facts (Confirmed)

- **Instance**: m5.8xlarge (32 vCPU, 128 GB RAM), Ubuntu, x86_64
- **User**: `ubuntu`, IP: `54.244.37.255`
- **Deploy to**: `/data2/cleave/` (existing data on /data2: `fastq`, `rs_256`, `test_directory` — DO NOT TOUCH)
- **Conda**: Miniconda at `/home/ubuntu/miniconda3` with 27 existing envs. Build NEW `cleave` env.
- **Genome indices**: `/home/ubuntu/cutruntools/assemblies/chrom.{genome}/`
  - mm10: `chrom.mm10/mm10.*.bt2` ✓
  - hg38: `chrom.hg38/hg38.*.bt2` ✓ (NOT GRCh38 — code fix needed)
  - hg19: `chrom.hg19/` (exists, assumed `hg19.*.bt2`)
  - ecoli: `chrom.ecoli/ecoli.*.bt2` ✓
- **Domain**: `cleave.nazalibhai.com` (dev) → `cleave.coleferguson.com` (prod)
- **TLS**: Cloudflare (SSL mode: Full). No Certbot needed. NGINX listens on port 80.
- **PostgreSQL**: Install via apt (not installed yet)
- **NGINX**: Install via apt (not installed yet)

## Deliverables

1. **`docs/DEPLOYMENT_GUIDE.md`** — Complete rewrite of the deployment guide
2. **`references/conda_envs/conda_cleave.yml`** — Master conda env YAML with all tools
3. **Code fix**: `backend/pipelines/alignment.py` line 46: `"hg38": "GRCh38"` → `"hg38": "hg38"`

## Directory Structure

```
/data2/cleave/
├── app/                    # Git clone of the cleave repo
│   ├── backend/
│   ├── frontend/
│   └── ...
├── projects/               # STORAGE_ROOT data ({pid}/{eid}/ tree)
├── uploads/                # tus staging area
└── genomes/                # Symlinks to actual genome indices
    ├── mm10 → /home/ubuntu/cutruntools/assemblies/chrom.mm10
    ├── hg38 → /home/ubuntu/cutruntools/assemblies/chrom.hg38
    ├── hg19 → /home/ubuntu/cutruntools/assemblies/chrom.hg19
    └── ecoli → /home/ubuntu/cutruntools/assemblies/chrom.ecoli
```

## Architecture

```
Cloudflare (TLS, Full mode) → NGINX (:80) → Uvicorn (:8000) → PostgreSQL (:5432)
                                                             → Worker (polls DB)
NGINX also serves:
  - Static files (React SPA from frontend/dist/)
  - X-Accel-Redirect for large file downloads (/internal-files/ → /data2/cleave/projects/)
```

## Deployment Phases

### Phase 0: Pre-flight Validation
- SSH in, verify disk space on /data2, verify genome indices exist, check who else is logged in
- No changes — survey only

### Phase 1: System Packages (apt)
- Install PostgreSQL, NGINX, build-essential, zlib1g-dev, Node.js 20
- **NO `apt-get upgrade`** — only install new packages to avoid breaking existing tools
- **NO Certbot** — Cloudflare handles TLS
- **NO Java via apt** — comes from conda env

### Phase 2: PostgreSQL Configuration
- Create `cleave` user + database with strong generated password
- Configure `pg_hba.conf` for md5 auth on localhost
- Verify: `psql -h localhost -U cleave -d cleave -c "SELECT 1;"`

### Phase 3: Directory Structure
- Create `/data2/cleave/{app,projects,uploads,genomes}`
- Create genome symlinks: `mm10 → chrom.mm10`, `hg38 → chrom.hg38`, etc.

### Phase 4: Conda Environment (highest-risk step)
- Create `references/conda_envs/conda_cleave.yml` with:

**Conda packages (conda-forge + bioconda):**
- python=3.11, pip
- bowtie2, samtools, bedtools, picard, deeptools, macs2, fastqc, trimmomatic, homer
- openjdk>=17, wget, perl
- r-base>=4.2, r-essentials, r-tidyverse
- bioconductor-diffbind, bioconductor-rtracklayer, bioconductor-genomicranges, bioconductor-biocparallel, bioconductor-deseq2, bioconductor-edger
- pandas, matplotlib, seaborn, numpy, scipy

**Pip packages (in pip: section):**
- All from pyproject.toml: fastapi, uvicorn, sqlalchemy, asyncpg, psycopg2-binary, alembic, pydantic, pydantic-settings, fastapi-users, slowapi, python-multipart, tuspyserver, httpx, structlog, stream-zip, boto3, jinja2, aioftp, asyncssh
- SICER2

**NOT included** (verified not needed by tracing all code paths):
- ucsc-bigwigsummary, ucsc-bigwigtobedgraph — R scripts use `rtracklayer::import.bw()` directly

**Fallback if monolithic solve fails:**
Two-phase: (1) conda create with Python + bioinfo tools, (2) conda install R + Bioconductor, (3) pip install web framework

**Post-install:** `configureHomer.pl -install mm10 hg38 hg19` for HOMER annotation databases

### Phase 5: Clone and Configure
- `git clone` to `/data2/cleave/app`
- Apply hg38 code fix: `alignment.py` line 46
- Compile kseq_test: `gcc -O2 kseq_test.c -lz -o kseq_test`
- `chmod +x SEACR_1.1.sh`
- Create production `.env` with all env vars
- `chmod 600 .env`

### Phase 6: Database Migration
- `pip install -e .` then `alembic upgrade head`
- Verify 11 tables created

### Phase 7: Frontend Build
- `npm install && npm run build`
- Verify `frontend/dist/index.html` exists

### Phase 8: NGINX Configuration
- `/etc/nginx/sites-available/cleave`
- Cloudflare real IP headers (`set_real_ip_from` + `real_ip_header CF-Connecting-IP`)
- `proxy_buffering off` for SSE
- `proxy_request_buffering off` for tus uploads
- `client_max_body_size 5120m`
- `location /internal-files/ { internal; alias /data2/cleave/projects/; }`

### Phase 9: systemd Services
- `cleave-api.service`: Uvicorn with 4 workers, PATH pointing to conda env bin
- `cleave-worker.service`: `python worker.py`, same PATH, TimeoutStopSec=300
- PATH: `/home/ubuntu/miniconda3/envs/cleave/bin:/usr/local/bin:/usr/bin:/bin`
- No conda activate needed — direct binary paths via PATH

### Phase 10: Verification
- Health check chain: direct API → NGINX → Cloudflare
- All pipeline tools accessible from worker PATH
- Genome indices resolve correctly
- Register account, create project, test upload

### Phase 11: Seed Reference Project (optional)
- Run `seed_reference_project.py`
- rsync dev-data from local Mac

### Phase 12: Domain Switch Section
- Update Cloudflare DNS, NGINX server_name, .env CORS_ORIGINS + APP_URL
- Option to support both domains temporarily during transition

### Phase 13: Operations & Maintenance
- Viewing logs (`journalctl -u cleave-api -f`)
- Updating the app (git pull, pip install, alembic upgrade, npm build, restart)
- Database backup (`pg_dump`)
- Disk monitoring
- Security checklist

## Required Code Fix

**File**: `backend/pipelines/alignment.py:46`
**Change**: `"hg38": "GRCh38"` → `"hg38": "hg38"`
**Reason**: Lab's actual Bowtie2 index files are named `hg38.*.bt2`, not `GRCh38.*.bt2`. Without this fix, all hg38 alignments fail.

## Cloudflare Configuration Note

SSL/TLS mode MUST be set to **"Full"** (not "Full (strict)") in the Cloudflare dashboard, because there is no TLS certificate on the origin server. Cloudflare terminates TLS at the edge and connects to the origin via HTTP port 80.

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Conda solve fails (Python+R+bioconda) | High | Two-phase install fallback documented |
| Existing /data2 data touched | Critical | All ops under /data2/cleave/ only |
| `apt-get upgrade` breaks lab tools | High | Intentionally omitted — new packages only |
| kseq_test is macOS binary | High | Must recompile on x86_64 instance |
| hg38 index naming mismatch | High | Code fix + symlinks |
| HOMER annotation DBs missing | Medium | `configureHomer.pl -install` post-env-creation |

## Verification Plan

1. `curl localhost:8000/api/v1/health` → `{"status":"ok"}`
2. `curl localhost/api/v1/health` → through NGINX
3. `curl https://cleave.nazalibhai.com/api/v1/health` → through Cloudflare
4. All tools on PATH: bowtie2, samtools, bedtools, picard, bamCoverage, macs2, fastqc, trimmomatic, annotatePeaks.pl, Rscript, java, kseq_test
5. R packages load: DiffBind, rtracklayer, GenomicRanges, DESeq2, edgeR
6. Frontend loads at domain, register account, create project
7. Upload test FASTQ, run alignment → verify BAM output
