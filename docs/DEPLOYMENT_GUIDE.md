# Cleave — Production Deployment Guide

> **Target instance**: Ferguson Lab EC2 m5.8xlarge (32 vCPU, 128 GB RAM, x86_64)
> **Deploy to**: `/data2/cleave/`
> **Domain**: `cleave.nazalibhai.com` (dev) → `cleave.coleferguson.com` (production)
> **TLS**: Cloudflare (Full mode) — no certificates on the origin server
> **Date**: 2026-03-30

This guide deploys Cleave onto the Ferguson Lab's existing, actively-used EC2 instance. It does **not** assume a fresh instance — all operations are additive and will not touch existing data, conda environments, or lab tools.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Pre-flight Validation](#2-pre-flight-validation)
3. [System Packages](#3-system-packages)
4. [PostgreSQL Setup](#4-postgresql-setup)
5. [Directory Structure](#5-directory-structure)
6. [Conda Environment](#6-conda-environment)
7. [Clone and Configure](#7-clone-and-configure)
8. [Database Migration](#8-database-migration)
9. [Frontend Build](#9-frontend-build)
10. [NGINX Configuration](#10-nginx-configuration)
11. [systemd Services](#11-systemd-services)
12. [Verification Checklist](#12-verification-checklist)
13. [Seed Reference Project](#13-seed-reference-project)
14. [Promote Superuser](#14-promote-superuser-admin-access)
15. [Domain Switch](#15-domain-switch-nazalibhaicom--colefergusoncom)
16. [Operations & Maintenance](#16-operations--maintenance)
17. [Troubleshooting](#17-troubleshooting)
18. [Security Checklist](#18-security-checklist)
19. [Quick Reference](#19-quick-reference)

---

## 1. Architecture Overview

```
                   Internet
                      │
              ┌───────┴───────┐
              │  Cloudflare   │  TLS termination (Full mode)
              │  DNS + CDN    │  cleave.nazalibhai.com → 54.244.37.255
              └───────┬───────┘
                      │ HTTP :80
              ┌───────┴───────┐
              │    NGINX      │  Static files (React SPA)
              │    :80        │  Reverse proxy → :8000
              │               │  X-Accel-Redirect (large files)
              └───────┬───────┘
                      │
         ┌────────────┼────────────┐
         │            │            │
         ▼            ▼            ▼
  Static Files    /api/* proxy   /internal-files/
  frontend/dist/      │          (X-Accel-Redirect)
                      ▼
              ┌───────────────┐
              │   Uvicorn     │
              │  (FastAPI)    │
              │  :8000        │
              └───────┬───────┘
                      │
         ┌────────────┼─────────────┐
         │            │             │
         ▼            ▼             ▼
  ┌──────────┐ ┌──────────┐ ┌──────────────┐
  │ Postgres │ │  Worker   │ │ /data2/cleave│
  │  :5432   │ │ (async)   │ │  (EBS vol)   │
  └──────────┘ └─────┬────┘ └──────────────┘
                     │
              ┌──────┴───────┐
              │  Pipeline    │
              │  Modules     │
              │ (subprocess) │
              │              │
              │ bowtie2,     │
              │ samtools,    │
              │ macs2,       │
              │ deeptools,   │
              │ homer,       │
              │ R/DiffBind,  │
              │ ...          │
              └──────────────┘
```

**Key design points:**
- Cloudflare terminates TLS. NGINX listens on port 80 only.
- NGINX serves the React SPA, proxies `/api/*` to Uvicorn, and handles large file downloads via `X-Accel-Redirect`.
- The worker process polls the `analysis_jobs` table and runs pipeline modules via subprocess.
- All bioinformatics tools, R, Python, and Java live in a single conda env (`cleave`).
- Genome indices are symlinked from the existing `~/cutruntools/assemblies/` directory.

---

## 2. Pre-flight Validation

SSH into the instance and verify the current state. **No changes in this step.**

```bash
ssh -i ./210323.pem ubuntu@54.244.37.255
```

```bash
# Instance specs
uname -m                    # Expect: x86_64
nproc                       # Expect: 32
free -h                     # Expect: ~128 GB

# Disk space — need at least ~50 GB free on /data2
df -h /data2

# Existing data — these directories must NOT be touched
ls /data2/                  # Expect: fastq  rs_256  test_directory

# Conda is installed
conda --version
ls /home/ubuntu/miniconda3/envs/ | head -5

# Genome indices exist
ls /home/ubuntu/cutruntools/assemblies/chrom.mm10/mm10.1.bt2
ls /home/ubuntu/cutruntools/assemblies/chrom.hg38/hg38.1.bt2
ls /home/ubuntu/cutruntools/assemblies/chrom.ecoli/ecoli.1.bt2

# Check who else is logged in
who
```

> **Lab rule**: Never terminate this instance — only stop it. Check `who` before stopping (`0` users = safe).

---

## 3. System Packages

Install PostgreSQL, NGINX, Node.js, and build tools via apt.

> **IMPORTANT**: Do NOT run `apt-get upgrade`. Only install new packages. Upgrading system packages on an actively-used instance risks breaking existing conda environments and lab tools.

```bash
sudo apt-get update

# PostgreSQL
sudo apt-get install -y postgresql postgresql-client

# NGINX
sudo apt-get install -y nginx

# Build tools (for compiling kseq_test)
sudo apt-get install -y build-essential zlib1g-dev

# Node.js 20 (for frontend build)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**NOT installed (and why):**
- **Certbot** — Cloudflare handles TLS. No certificates on the origin.
- **Java** — Comes from the conda environment to avoid conflicts.
- **Bioinformatics tools** — All installed via conda (lab policy).

**Verify:**

```bash
pg_isready                  # accepting connections
nginx -v                    # nginx version
node --version              # v20.x
gcc --version | head -1     # gcc installed
```

---

## 4. PostgreSQL Setup

### 4.1 Generate a strong password

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

Save this password — you will need it for the `.env` file in Step 7.

### 4.2 Create database and user

```bash
sudo -u postgres psql <<'EOF'
CREATE USER cleave WITH PASSWORD '<PASTE_GENERATED_PASSWORD>';
CREATE DATABASE cleave OWNER cleave;
\q
EOF
```

### 4.3 Configure authentication

```bash
# Find the pg_hba.conf location
sudo -u postgres psql -c "SHOW hba_file;"

# Edit pg_hba.conf — add these lines BEFORE the existing "local all all peer" line:
#   local   cleave      cleave                          md5
#   host    cleave      cleave      127.0.0.1/32        md5
sudo nano "$(sudo -u postgres psql -t -c 'SHOW hba_file;' | xargs)"

sudo systemctl restart postgresql
```

### 4.4 Verify local-only access

PostgreSQL must only listen on localhost (this is the default).

```bash
sudo -u postgres psql -c "SHOW listen_addresses;"
# Expect: localhost
```

### 4.5 Verify connectivity

```bash
psql -h localhost -U cleave -d cleave -c "SELECT 1;"
# Enter password when prompted. Expect: 1
```

---

## 5. Directory Structure

### 5.1 Create the deployment tree

```bash
sudo mkdir -p /data2/cleave/{app,projects,uploads,genomes}
sudo chown -R ubuntu:ubuntu /data2/cleave
```

### 5.2 Create genome index symlinks

The alignment pipeline expects indices at `GENOME_INDEX_DIR/{genome}/{index_base}.*.bt2`. The lab's existing indices are at `~/cutruntools/assemblies/chrom.{genome}/`. Symlinks bridge the naming gap.

```bash
ln -s /home/ubuntu/cutruntools/assemblies/chrom.mm10  /data2/cleave/genomes/mm10
ln -s /home/ubuntu/cutruntools/assemblies/chrom.hg38  /data2/cleave/genomes/hg38
ln -s /home/ubuntu/cutruntools/assemblies/chrom.ecoli /data2/cleave/genomes/ecoli

# hg19 — only if the directory exists on this instance
if [ -d /home/ubuntu/cutruntools/assemblies/chrom.hg19 ]; then
  ln -s /home/ubuntu/cutruntools/assemblies/chrom.hg19 /data2/cleave/genomes/hg19
fi
```

### 5.3 Verify index resolution

```bash
# These paths are what alignment.py constructs internally
ls /data2/cleave/genomes/mm10/mm10.1.bt2      # Must exist
ls /data2/cleave/genomes/hg38/hg38.1.bt2      # Must exist
ls /data2/cleave/genomes/ecoli/ecoli.1.bt2     # Must exist
```

> **Note on hg38**: The codebase previously expected `GRCh38.*.bt2` index names. This has been fixed to `hg38.*.bt2` to match the lab's actual index files. If you encounter a version of the code that still references `GRCh38`, update `BOWTIE2_INDEX_NAMES` in `backend/pipelines/alignment.py`.

### 5.4 Additional genomes (optional)

dm6 (Drosophila) and sacCer3 (yeast) are supported but not currently on this instance. To add them later:

```bash
# Download pre-built indices or build from FASTA
mkdir -p /data2/cleave/genomes/dm6
cd /data2/cleave/genomes/dm6
# bowtie2-build dm6.fa dm6

mkdir -p /data2/cleave/genomes/sacCer3
cd /data2/cleave/genomes/sacCer3
# bowtie2-build sacCer3.fa sacCer3
```

### Final layout

```
/data2/cleave/
├── app/                    # Git repo (Step 7)
├── projects/               # Pipeline output data
├── uploads/                # tus upload staging
└── genomes/
    ├── mm10 → ~/cutruntools/assemblies/chrom.mm10
    ├── hg38 → ~/cutruntools/assemblies/chrom.hg38
    ├── hg19 → ~/cutruntools/assemblies/chrom.hg19
    └── ecoli → ~/cutruntools/assemblies/chrom.ecoli
```

---

## 6. Conda Environment

Create a single `cleave` conda environment containing all bioinformatics tools, R/Bioconductor, and the Python web framework.

> **Lab rule**: Never modify existing conda environments. This creates a completely new `cleave` env.

### 6.1 Create the environment

The YAML file is at `references/conda_envs/conda_cleave.yml` in the repo. Copy it to the instance first (or create it after cloning in Step 7).

```bash
# If the repo is already cloned:
cd /data2/cleave/app
conda env create -f references/conda_envs/conda_cleave.yml

# Or create directly from the YAML (copy it to the instance first):
conda env create -f /path/to/conda_cleave.yml
```

**Estimated time**: 20-40 minutes for the solver + download + install.

> **Tip**: If `conda` is slow, install `mamba` for faster solving:
> ```bash
> conda install -n base -c conda-forge mamba
> mamba env create -f references/conda_envs/conda_cleave.yml
> ```

### 6.2 Fallback: two-phase install

If the monolithic YAML solve fails (dependency conflict between Python 3.11 + R + bioconda tools), use this phased approach:

```bash
# Phase 1: Python + bioinformatics tools
conda create -n cleave -c conda-forge -c bioconda -c defaults \
  python=3.11 bowtie2 samtools bedtools picard deeptools macs2 \
  fastqc trimmomatic homer openjdk perl wget \
  pandas matplotlib seaborn numpy scipy pip

# Phase 2: R + Bioconductor
conda activate cleave
conda install -c conda-forge -c bioconda \
  r-base r-essentials r-tidyverse \
  bioconductor-diffbind bioconductor-rtracklayer \
  bioconductor-genomicranges bioconductor-biocparallel \
  bioconductor-deseq2 bioconductor-edger

# Phase 3: Web framework (pip)
pip install \
  "fastapi>=0.109" "uvicorn[standard]" "sqlalchemy[asyncio]>=2.0" \
  asyncpg psycopg2-binary alembic "pydantic>=2.0" pydantic-settings \
  "fastapi-users[sqlalchemy]" slowapi python-multipart "tuspyserver>=4.2.3" \
  httpx structlog "stream-zip>=0.0.83" boto3 jinja2 \
  "aioftp>=0.22" "asyncssh>=2.14"

# Phase 4: SICER2 (separate env — bioconda only has py3.9, pip fails on 3.11+)
mamba create -n sicer2 -c bioconda -c conda-forge python=3.9 sicer2
# Create wrapper so `sicer` is callable from the cleave env.
# Hardcode miniconda path — the systemd worker PATH doesn't include conda itself.
cat > "$CONDA_PREFIX/bin/sicer" << 'WRAPPER'
#!/bin/bash
source /home/ubuntu/miniconda3/etc/profile.d/conda.sh
conda activate sicer2
exec sicer "$@"
WRAPPER
chmod +x "$CONDA_PREFIX/bin/sicer"
```

### 6.3 Install HOMER annotation databases

HOMER's `annotatePeaks.pl` needs annotation databases for each genome.

```bash
conda activate cleave
configureHomer.pl -install mm10
configureHomer.pl -install hg38
configureHomer.pl -install hg19
```

### 6.4 Verify the environment

```bash
conda activate cleave

# Python
python --version                                    # 3.11.x

# Bioinformatics tools
bowtie2 --version | head -1
samtools --version | head -1
bedtools --version
picard MarkDuplicates --version 2>&1 | head -1
bamCoverage --version
computeMatrix --version
plotHeatmap --version
plotProfile --version
macs2 --version
fastqc --version
trimmomatic -version 2>&1 | head -1
annotatePeaks.pl 2>&1 | head -1
sicer --help 2>&1 | head -1

# Java
java -version                                       # 17+

# R packages
Rscript -e "library(DiffBind); library(rtracklayer); library(GenomicRanges); cat('R OK\n')"
Rscript -e "library(DESeq2); library(edgeR); library(BiocParallel); cat('Bioconductor OK\n')"
Rscript -e "library(tidyverse); cat('tidyverse OK\n')"

# Python web stack
python -c "import fastapi, uvicorn, sqlalchemy, asyncpg, alembic; print('Web stack OK')"
python -c "import pandas, matplotlib, seaborn; print('Scientific OK')"
```

---

## 7. Clone and Configure

### 7.1 Clone the repository

```bash
cd /data2/cleave
git clone <repo-url> app
cd /data2/cleave/app
```

### 7.2 Compile kseq_test

The `kseq_test` binary must be compiled on the x86_64 instance. The binary in the repo (if any) is compiled for macOS arm64 and will not work.

```bash
cd /data2/cleave/app/backend/pipelines/tools
gcc -O2 kseq_test.c -lz -o kseq_test
chmod +x kseq_test

# Verify — should print usage info, NOT "exec format error"
./kseq_test 2>&1 | head -1
```

### 7.3 Make SEACR executable

```bash
chmod +x /data2/cleave/app/backend/pipelines/tools/SEACR_1.1.sh
```

### 7.4 Create production .env

Generate two secret keys:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # SECRET_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # REFRESH_SECRET_KEY
```

Create `/data2/cleave/app/backend/.env`:

```env
# Database — use the password from Step 4
DATABASE_URL=postgresql+asyncpg://cleave:<DB_PASSWORD>@localhost:5432/cleave

# Auth — paste generated secrets
SECRET_KEY=<GENERATED_SECRET_1>
REFRESH_SECRET_KEY=<GENERATED_SECRET_2>
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
COOKIE_SECURE=true

# App
CORS_ORIGINS=https://cleave.nazalibhai.com
STORAGE_ROOT=/data2/cleave
UPLOAD_MAX_SIZE_MB=10000
PIPELINE_MODE=real

# File serving — NGINX handles large files
NGINX_FILE_SERVING=true
NGINX_INTERNAL_PREFIX=/internal-files/

# Worker
WORKER_POLL_INTERVAL_SECONDS=2
MAX_CONCURRENT_REACTIONS=8

# Genomes
GENOME_INDEX_DIR=/data2/cleave/genomes

# Email (leave empty to disable — configure SES later)
AWS_SES_REGION=
AWS_SES_FROM_EMAIL=
APP_URL=https://cleave.nazalibhai.com

# Password reset
RESET_TOKEN_LIFETIME_SECONDS=3600

# Storage lifecycle
CLEANUP_ENABLED=true
CLEANUP_INTERVAL_HOURS=24
LOG_RETENTION_DAYS=30
STORAGE_QUOTA_BYTES=0
TUS_STAGING_RETENTION_HOURS=48
```

**Key settings explained:**
- `STORAGE_ROOT=/data2/cleave` — Project data lives at `/data2/cleave/projects/{pid}/{eid}/`
- `GENOME_INDEX_DIR=/data2/cleave/genomes` — Points to the symlink directory from Step 5
- `PIPELINE_MODE=real` — Runs actual bioinformatics tools (not mock stubs)
- `NGINX_FILE_SERVING=true` — Large file downloads via NGINX X-Accel-Redirect
- `COOKIE_SECURE=true` — Required because users access via HTTPS (Cloudflare)
- `MAX_CONCURRENT_REACTIONS=8` — Tuned for 32 vCPU instance

### 7.5 Secure the .env file

```bash
chmod 600 /data2/cleave/app/backend/.env
```

---

## 8. Database Migration

```bash
conda activate cleave
cd /data2/cleave/app/backend

# Install the cleave backend package
pip install -e .

# Run all Alembic migrations
alembic upgrade head
```

**Verify:**

```bash
psql -h localhost -U cleave -d cleave -c "\dt"
# Expect 11 tables: users, projects, project_members, experiments,
# fastq_files, reactions, analysis_jobs, job_outputs, notifications,
# experiment_events, saved_servers
```

> **Pitfall**: Alembic reads `DATABASE_URL` from config.py which loads the `.env` file. If the password contains characters that need URL-encoding (`@`, `%`, `#`), escape them. Using `secrets.token_urlsafe()` avoids this issue.

---

## 9. Frontend Build

Ubuntu 18.04 (glibc 2.27) cannot run Node 18+ — build the frontend locally and copy `dist/` to the instance.

```bash
# On your local machine (Node 20+ required)
cd frontend
npm install
npm run build

# Copy built assets to EC2 (get EC2 public DNS from AWS console or aws cli)
scp -i ~/.ssh/210323.pem -r dist/ ubuntu@<ec2-public-dns>:/data2/cleave/app/frontend/
```

**Verify:**

```bash
ls /data2/cleave/app/frontend/dist/index.html    # Must exist
ls /data2/cleave/app/frontend/dist/assets/        # Must contain JS/CSS bundles
```

---

## 10. NGINX Configuration

### 10.1 Create the site config

```bash
sudo nano /etc/nginx/sites-available/cleave
```

Paste:

```nginx
# Cloudflare IP ranges — restore real client IPs for rate limiting
# Update from https://www.cloudflare.com/ips-v4 if stale
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 131.0.72.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
real_ip_header CF-Connecting-IP;

server {
    listen 80;
    server_name cleave.nazalibhai.com;

    # Max upload size — matches UPLOAD_MAX_SIZE_MB
    client_max_body_size 10240m;

    # Proxy timeouts for long-running pipeline API calls
    proxy_read_timeout 600s;
    proxy_connect_timeout 60s;
    proxy_send_timeout 600s;

    # ── React SPA (static files) ──
    root /data2/cleave/app/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # ── SSE endpoint (long-lived connection, no buffering) ──
    location /api/v1/notifications/stream {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        chunked_transfer_encoding off;
        proxy_read_timeout 86400s;
    }

    # ── API reverse proxy ──
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;

        # Disable buffering for remaining API calls
        proxy_buffering off;
        proxy_cache off;

        # tus upload — disable request buffering for chunked uploads
        proxy_request_buffering off;
    }

    # ── Internal file serving (X-Accel-Redirect) ──
    # FastAPI sets X-Accel-Redirect header; NGINX serves the file directly.
    location /internal-files/ {
        internal;
        alias /data2/cleave/projects/;
    }

    # ── Static asset caching (Vite uses content-hashed filenames) ──
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # ── Gzip ──
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 1024;
}
```

**Key details:**
- `X-Forwarded-Proto` is hardcoded to `https` because all users access via Cloudflare HTTPS.
- `set_real_ip_from` + `real_ip_header CF-Connecting-IP` ensures `$remote_addr` is the actual client IP, not Cloudflare's edge server. This is critical for `slowapi` rate limiting.
- `proxy_buffering off` is required for SSE (Server-Sent Events) to work.
- `proxy_request_buffering off` is required for tus chunked uploads.

### 10.2 Enable the site

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/cleave /etc/nginx/sites-enabled/cleave
sudo nginx -t                     # Test config — must say "ok"
sudo systemctl reload nginx
sudo systemctl enable nginx
```

### 10.3 EC2 Security Group

The security group must allow inbound HTTP from Cloudflare. Find the **actual** security group attached to the instance (there may be multiple groups in the account — use the one attached to this instance):

```bash
aws ec2 describe-instances --instance-ids i-094efb787523fb12d --region us-west-2 \
  --query 'Reservations[0].Instances[0].SecurityGroups' --output table
```

Then add port 80:

```bash
aws ec2 authorize-security-group-ingress \
  --group-id <sg-id-from-above> --protocol tcp --port 80 --cidr 0.0.0.0/0 \
  --region us-west-2
```

Verify from your local machine:

```bash
curl -v --connect-timeout 5 http://54.244.37.255/api/v1/health
# Should return: {"status":"ok"}
```

### 10.4 Cloudflare DNS

In the Cloudflare dashboard for `nazalibhai.com`:

1. Add an **A record**: `cleave` → `54.244.37.255` (Proxied / orange cloud)
2. SSL/TLS mode can stay on **Flexible** (NGINX listens on port 80; Cloudflare handles HTTPS to users)

---

## 11. systemd Services

Two services: the FastAPI API server and the pipeline worker.

### 11.1 cleave-api.service

```bash
sudo nano /etc/systemd/system/cleave-api.service
```

```ini
[Unit]
Description=Cleave API (FastAPI/Uvicorn)
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/data2/cleave/app/backend
Environment="PATH=/home/ubuntu/miniconda3/envs/cleave/bin:/data2/cleave/homer/bin:/usr/local/bin:/usr/bin:/bin"
EnvironmentFile=/data2/cleave/app/backend/.env
ExecStart=/home/ubuntu/miniconda3/envs/cleave/bin/uvicorn main:app \
    --host 127.0.0.1 \
    --port 8000 \
    --workers 4 \
    --timeout-graceful-shutdown 10
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=cleave-api

[Install]
WantedBy=multi-user.target
```

### 11.2 cleave-worker.service

```bash
sudo nano /etc/systemd/system/cleave-worker.service
```

```ini
[Unit]
Description=Cleave Pipeline Worker
After=network.target postgresql.service cleave-api.service
Requires=postgresql.service

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/data2/cleave/app/backend
Environment="PATH=/home/ubuntu/miniconda3/envs/cleave/bin:/data2/cleave/homer/bin:/usr/local/bin:/usr/bin:/bin"
EnvironmentFile=/data2/cleave/app/backend/.env
ExecStart=/home/ubuntu/miniconda3/envs/cleave/bin/python worker.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=cleave-worker
TimeoutStopSec=300

[Install]
WantedBy=multi-user.target
```

**Why no `conda activate`?** systemd services don't source `.bashrc`. Instead, the `PATH` environment variable points directly to the conda env's `bin/` directory. This ensures `python`, `Rscript`, `bowtie2`, `samtools`, `java`, and all other tools resolve to the conda env.

### 11.3 Enable and start

```bash
sudo systemctl daemon-reload
sudo systemctl enable cleave-api cleave-worker
sudo systemctl start cleave-api
sudo systemctl start cleave-worker
```

### 11.4 Verify services

```bash
sudo systemctl status cleave-api       # Active (running)
sudo systemctl status cleave-worker    # Active (running)
sudo journalctl -u cleave-api --since "1 min ago" --no-pager
sudo journalctl -u cleave-worker --since "1 min ago" --no-pager
```

> **If a service fails to start**, test the command manually to see the error:
> ```bash
> sudo -u ubuntu bash -c '
>   export PATH=/home/ubuntu/miniconda3/envs/cleave/bin:/usr/local/bin:/usr/bin:/bin
>   set -a; source /data2/cleave/app/backend/.env; set +a
>   cd /data2/cleave/app/backend
>   uvicorn main:app --host 127.0.0.1 --port 8000
> '
> ```

---

## 12. Verification Checklist

### Infrastructure

```bash
# All services running
sudo systemctl status cleave-api cleave-worker nginx postgresql

# API health check — direct
curl http://127.0.0.1:8000/api/v1/health
# Expect: {"status":"ok"}

# API health check — through NGINX
curl http://localhost/api/v1/health
# Expect: {"status":"ok"}
```

### Cloudflare (from your local machine, not the EC2)

```bash
curl https://cleave.nazalibhai.com/api/v1/health
# Expect: {"status":"ok"}
```

### Pipeline tools (from worker's PATH context)

```bash
export PATH=/home/ubuntu/miniconda3/envs/cleave/bin:/usr/local/bin:/usr/bin:/bin

bowtie2 --version | head -1
samtools --version | head -1
bedtools --version
picard MarkDuplicates --version 2>&1 | head -1
bamCoverage --version
computeMatrix --version
macs2 --version
fastqc --version
trimmomatic -version 2>&1 | head -1
annotatePeaks.pl 2>&1 | head -1
java -version
Rscript -e "library(DiffBind); library(rtracklayer); cat('R OK\n')"
/data2/cleave/app/backend/pipelines/tools/kseq_test 2>&1 | head -1
```

### Genome indices

```bash
ls /data2/cleave/genomes/mm10/mm10.*.bt2 | wc -l      # 6
ls /data2/cleave/genomes/hg38/hg38.*.bt2 | wc -l      # 6
ls /data2/cleave/genomes/ecoli/ecoli.*.bt2 | wc -l     # 6
```

### Application

1. Open `https://cleave.nazalibhai.com` in a browser
2. Landing page loads with the pipeline visualization
3. Register a new account
4. Log in — redirects to `/dashboard`
5. Create a project, create an experiment
6. Upload a test FASTQ — verify tus upload progress works
7. Run alignment on a small test file — verify BAM output is produced
8. Check IGV browser — tracks should load

---

## 13. Seed Reference Project

The Gold Standard Reference Project provides a pre-analyzed dataset visible to all authenticated users.

### 13.1 Run the seed script (on EC2)

```bash
conda activate cleave
cd /data2/cleave/app/backend
python ../scripts/seed_reference_project.py
```

Note the **Project ID** (`<PID>`) and **Experiment ID** (`<EID>`) from the output.

### 13.2 Transfer data files (from local Mac)

```bash
# On EC2 — create parent directory first
mkdir -p /data2/cleave/projects/<PID>

# From your Mac where dev-data/ lives (no trailing slash on source)
scp -i ~/.ssh/210323.pem -r dev-data/projects/<PID>/<EID> \
  ubuntu@<ec2-public-dns>:/data2/cleave/projects/<PID>/
```

The destination path **must match** the `Data path` printed by the seed script.
`<PID>` and `<EID>` are the Project ID and Experiment ID from the seed output.

> **Note**: macOS `openrsync` may crash against Ubuntu 18.04's GNU rsync — use `scp -r` instead.

**What gets transferred (~4.5 GB):**
- `fastqs/trimmed/` — Trimmed FASTQ files
- `fastqc/` — FastQC HTML reports
- `jobs/11/` — Alignment outputs (BAMs, bigWigs, heatmaps, QC)
- `jobs/12/` — Peak calling outputs (peaks, annotation, QC)
- `jobs/13/` — DiffBind results
- `jobs/14/` — Normalization results
- `jobs/15/` — Custom heatmap results
- `jobs/18/` — Pearson correlation results

**Excluded:** `fastqs/raw/` (~16 GB, not needed for browsing results)

### 13.3 Verify

1. Log in to Cleave
2. The **Gold Standard Reference** card should appear on the dashboard
3. Browse each tab — Alignment, Peak Calling, DiffBind, Normalization, Heatmaps, Correlation
4. Verify no edit/run buttons are visible (read-only)

---

## 14. Promote Superuser (Admin Access)

After registering your account, promote it to superuser to access the Admin Panel (`/admin`).

### 14.1 Run the promote script (on EC2)

```bash
conda activate cleave
cd /data2/cleave/app/backend
python ../scripts/promote_superuser.py
```

This promotes `zalibhai@ucsd.edu` by default (idempotent — safe to run multiple times).

To promote a different user:

```bash
python ../scripts/promote_superuser.py --email someone@ucsd.edu
```

### 14.2 Via Docker Compose (local dev)

```bash
docker compose exec api python scripts/promote_superuser.py
docker compose exec api python scripts/promote_superuser.py --email other@example.com
```

### 14.3 Verify

1. Log out and log back in (so the frontend fetches the updated user profile)
2. The **Admin** link (shield icon, amber color) should appear in the navbar after "Analysis Queue"
3. The Admin Panel has 4 tabs: **System** (stats + storage), **Users** (manage roles), **Projects** (global view), **Jobs** (global queue)

> **Note**: The user must register first — the script errors if the email doesn't exist in the database.

---

## 15. Domain Switch (nazalibhai.com → coleferguson.com)

When the PI's domain moves from GoDaddy to Cloudflare:

### 14.1 Cloudflare Origin Certificate

Generate a certificate so the connection between Cloudflare and the origin is fully verified.

1. In the `coleferguson.com` Cloudflare dashboard → **SSL/TLS** → **Origin Server**
2. Click **Create Certificate**
3. Keep defaults (RSA 2048, 15 years, hostnames: `*.coleferguson.com, coleferguson.com`)
4. Copy the **Origin Certificate** and **Private Key**
5. Save them on EC2:

```bash
sudo mkdir -p /etc/ssl/cloudflare
sudo nano /etc/ssl/cloudflare/origin.pem      # paste certificate
sudo nano /etc/ssl/cloudflare/origin-key.pem   # paste private key
sudo chmod 600 /etc/ssl/cloudflare/origin-key.pem
```

### 14.2 Cloudflare DNS

In the `coleferguson.com` Cloudflare dashboard:
- Add **A record**: `cleave` → `54.244.37.255` (Proxied / orange cloud)
- Set **SSL/TLS mode** to **Full (strict)**

### 14.3 NGINX

Update `/etc/nginx/sites-available/cleave` — add HTTPS listener with the origin cert:

```nginx
server {
    listen 80;
    server_name cleave.coleferguson.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name cleave.coleferguson.com;

    ssl_certificate     /etc/ssl/cloudflare/origin.pem;
    ssl_certificate_key /etc/ssl/cloudflare/origin-key.pem;

    # ... rest of config (client_max_body_size, locations, etc.) stays the same ...
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 14.4 Backend .env

Update two variables in `/data2/cleave/app/backend/.env`:

```env
CORS_ORIGINS=https://cleave.coleferguson.com
APP_URL=https://cleave.coleferguson.com
```

```bash
sudo systemctl restart cleave-api cleave-worker
```

### 14.5 Temporary dual-domain support (optional)

To support both domains during the transition:

**NGINX:**
```nginx
server_name cleave.coleferguson.com cleave.nazalibhai.com;
```

**.env:**
```env
CORS_ORIGINS=https://cleave.coleferguson.com,https://cleave.nazalibhai.com
```

Remove the old domain once the transition is complete.

---

## 16. Operations & Maintenance

### Updating the application

```bash
cd /data2/cleave/app
git pull origin main

# Backend: install any new dependencies
conda activate cleave
cd backend
pip install -e .
alembic upgrade head

# Frontend: rebuild
cd ../frontend
npm install
npm run build

# Restart services
sudo systemctl restart cleave-api cleave-worker
```

### Viewing logs

```bash
# API logs (live)
sudo journalctl -u cleave-api -f --no-pager

# Worker logs (live — shows pipeline execution)
sudo journalctl -u cleave-worker -f --no-pager

# NGINX logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Pipeline job logs (per-job)
cat /data2/cleave/projects/<pid>/<eid>/jobs/<jid>/master.log
```

### Database backup

```bash
pg_dump -h localhost -U cleave cleave > /data2/cleave/backup_$(date +%Y%m%d).sql
```

### Database restore

```bash
psql -h localhost -U cleave cleave < /data2/cleave/backup_YYYYMMDD.sql
```

### Disk monitoring

```bash
df -h /data2
du -sh /data2/cleave/projects/
du -sh /data2/cleave/uploads/
```

### Service management

```bash
sudo systemctl start   cleave-api cleave-worker
sudo systemctl stop    cleave-api cleave-worker
sudo systemctl restart cleave-api cleave-worker
sudo systemctl status  cleave-api cleave-worker nginx postgresql
```

---

## 17. Troubleshooting

### "502 Bad Gateway" from NGINX

The API is not running or not responding on port 8000.

```bash
sudo systemctl status cleave-api
sudo journalctl -u cleave-api --since "5 min ago"
curl http://127.0.0.1:8000/api/v1/health
```

### Pipeline jobs stuck in "queued"

The worker is not running or cannot reach the database.

```bash
sudo systemctl status cleave-worker
sudo journalctl -u cleave-worker --since "5 min ago"
```

### "kseq_test: exec format error"

The binary was compiled for the wrong architecture (e.g., macOS arm64).

```bash
cd /data2/cleave/app/backend/pipelines/tools
gcc -O2 kseq_test.c -lz -o kseq_test
chmod +x kseq_test
```

### SICER2 build fails via pip / conda

SICER2's C extensions are incompatible with Python 3.11+ and bioconda only provides a py3.9 build. Install it in a separate conda env with a wrapper script:

```bash
mamba create -n sicer2 -c bioconda -c conda-forge python=3.9 sicer2
conda activate cleave
cat > "$CONDA_PREFIX/bin/sicer" << 'WRAPPER'
#!/bin/bash
source /home/ubuntu/miniconda3/etc/profile.d/conda.sh
conda activate sicer2
exec sicer "$@"
WRAPPER
chmod +x "$CONDA_PREFIX/bin/sicer"
```

**Note**: The path `/home/ubuntu/miniconda3` is hardcoded because the systemd worker's PATH only includes the cleave env's bin dir, not conda itself.

### "Trimmomatic not found"

The worker uses `_resolve_trimmomatic_cmd()` which tries (in order):
1. `$TRIMMOMATIC_JAR` env var → `java -jar <path>`
2. `$CONDA_PREFIX/share/trimmomatic-*/trimmomatic.jar` → `java -jar`
3. `trimmomatic` on PATH

Verify trimmomatic is installed in the conda env:

```bash
conda activate cleave
which trimmomatic
```

### "Bowtie2 index not found"

Verify the symlinks resolve correctly:

```bash
ls -la /data2/cleave/genomes/mm10
ls /data2/cleave/genomes/mm10/mm10.1.bt2
```

### SSE not connecting / notifications not arriving

Verify NGINX is not buffering SSE:

```bash
grep -A5 "location /api/" /etc/nginx/sites-available/cleave | grep proxy_buffering
# Should show: proxy_buffering off;
```

### CORS errors in browser

`CORS_ORIGINS` in `.env` must exactly match the browser URL:

```env
# If browser shows https://cleave.nazalibhai.com
CORS_ORIGINS=https://cleave.nazalibhai.com
```

### File downloads return 403/404

Verify the X-Accel-Redirect path matches:

```bash
grep "internal-files" /etc/nginx/sites-available/cleave
# Should show: alias /data2/cleave/projects/;
```

### Large uploads fail

Verify `client_max_body_size` in NGINX matches `UPLOAD_MAX_SIZE_MB`:

```bash
grep client_max_body_size /etc/nginx/sites-available/cleave
# Should show: 5120m (5 GB)
```

---

## 18. Security Checklist

- [ ] `SECRET_KEY` and `REFRESH_SECRET_KEY` are unique random strings (48+ chars)
- [ ] `COOKIE_SECURE=true`
- [ ] Database password is strong (generated via `secrets.token_urlsafe`)
- [ ] `.env` file is not world-readable (`chmod 600`)
- [ ] PostgreSQL listens on localhost only
- [ ] Cloudflare SSL/TLS mode is set to **Full**
- [ ] AWS security group allows only ports 22 (SSH) and 80 (HTTP from Cloudflare)
- [ ] `CORS_ORIGINS` matches the exact production URL
- [ ] Rate limiting is active on auth endpoints (5/min login, 3/min register)
- [ ] FTP/SFTP import SSRF prevention is active (blocks private IPs, localhost, AWS metadata)

---

## 19. Quick Reference

### Key File Paths

| What | Path |
|------|------|
| Application code | `/data2/cleave/app/` |
| Backend code | `/data2/cleave/app/backend/` |
| Frontend build | `/data2/cleave/app/frontend/dist/` |
| Environment config | `/data2/cleave/app/backend/.env` |
| Project data | `/data2/cleave/projects/` |
| Genome indices | `/data2/cleave/genomes/` |
| tus upload staging | `/data2/cleave/uploads/` |
| NGINX config | `/etc/nginx/sites-available/cleave` |
| API systemd unit | `/etc/systemd/system/cleave-api.service` |
| Worker systemd unit | `/etc/systemd/system/cleave-worker.service` |
| kseq_test binary | `/data2/cleave/app/backend/pipelines/tools/kseq_test` |
| SEACR script | `/data2/cleave/app/backend/pipelines/tools/SEACR_1.1.sh` |
| Conda env YAML | `/data2/cleave/app/references/conda_envs/conda_cleave.yml` |

### Key Environment Variables

| Variable | Production Value |
|----------|-----------------|
| `DATABASE_URL` | `postgresql+asyncpg://cleave:<password>@localhost:5432/cleave` |
| `SECRET_KEY` | Random 48+ char string |
| `COOKIE_SECURE` | `true` |
| `PIPELINE_MODE` | `real` |
| `NGINX_FILE_SERVING` | `true` |
| `STORAGE_ROOT` | `/data2/cleave` |
| `GENOME_INDEX_DIR` | `/data2/cleave/genomes` |
| `MAX_CONCURRENT_REACTIONS` | `8` |
| `CORS_ORIGINS` | `https://cleave.nazalibhai.com` |

### Service Commands

```bash
# Start / stop / restart
sudo systemctl start   cleave-api cleave-worker
sudo systemctl stop    cleave-api cleave-worker
sudo systemctl restart cleave-api cleave-worker

# Live logs
sudo journalctl -u cleave-api -f
sudo journalctl -u cleave-worker -f

# Instance health
who                         # Who else is logged in
df -h /data2                # Disk space
htop                        # CPU/memory
```
