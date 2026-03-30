# Cleave — EC2 Production Deployment Guide

> **Target instance**: m5.8xlarge (32 vCPU, 128 GB RAM, x86_64) in us-west-2c
> **Public IP**: 54.244.37.255
> **Storage**: 3 EBS volumes (`/dev/sda1`, `/dev/sdg`, `/dev/sdh`)
> **Date**: 2026-03-31

This guide covers the complete deployment of Cleave on the Ferguson Lab's EC2 instance. It assumes a fresh Ubuntu instance with SSH access via `210323.pem`.

---

## Table of Contents

1. [Pre-Deployment Checklist](#1-pre-deployment-checklist)
2. [SSH Into the Instance](#2-ssh-into-the-instance)
3. [Mount EBS Volumes](#3-mount-ebs-volumes)
4. [System Packages](#4-system-packages)
5. [Install PostgreSQL 15](#5-install-postgresql-15)
6. [Install Node.js 20](#6-install-nodejs-20)
7. [Install Python 3.11+ and Backend Dependencies](#7-install-python-311-and-backend-dependencies)
8. [Install Bioinformatics Tools](#8-install-bioinformatics-tools)
9. [Install R and R Packages](#9-install-r-and-r-packages)
10. [Set Up Bowtie2 Genome Indices](#10-set-up-bowtie2-genome-indices)
11. [Clone the Repository](#11-clone-the-repository)
12. [Compile kseq_test](#12-compile-kseq_test)
13. [Configure Environment Variables](#13-configure-environment-variables)
14. [Initialize the Database](#14-initialize-the-database)
15. [Build the Frontend](#15-build-the-frontend)
16. [Configure NGINX](#16-configure-nginx)
17. [Configure TLS with Certbot](#17-configure-tls-with-certbot)
18. [Create systemd Services](#18-create-systemd-services)
19. [Seed the Gold Standard Reference Project](#19-seed-the-gold-standard-reference-project)
20. [Transfer Reference Data](#20-transfer-reference-data)
21. [Verification Checklist](#21-verification-checklist)
22. [Operations & Maintenance](#22-operations--maintenance)
23. [Troubleshooting](#23-troubleshooting)
24. [Quick Reference](#24-quick-reference)

---

## 1. Pre-Deployment Checklist

Before you start, confirm you have:

- [ ] SSH access: `./210323.pem` on your local Mac
- [ ] EC2 instance is **running** (not stopped) — Public IP: `54.244.37.255`
- [ ] A domain name pointing to `54.244.37.255` (for TLS), or plan to use the raw IP
- [ ] The `dev-data/projects/1/1/` directory locally (from the end-to-end pipeline test) — ~4.5 GB for reference project
- [ ] AWS SES configured (optional — emails skipped if not set)
- [ ] The repo pushed to a Git remote accessible from the EC2 instance (GitHub, etc.)

---

## 2. SSH Into the Instance

```bash
# From your Mac
ssh -i ./210323.pem ubuntu@54.244.37.255
```

> **Lab rule**: Never terminate this instance — only stop it. Check `who` before stopping (`0` users = safe).

---

## 3. Mount EBS Volumes

The instance has 3 EBS volumes. The root volume (`/dev/sda1`) has the OS. The additional volumes (`/dev/sdg`, `/dev/sdh`) should be mounted for data storage.

```bash
# Check what's attached and current mount state
lsblk
df -h

# If /dev/sdg and /dev/sdh are not yet formatted:
# WARNING: Only run mkfs on NEW/EMPTY volumes — this erases all data
sudo file -s /dev/xvdg   # Should say "data" if unformatted
sudo file -s /dev/xvdh

# Format if needed (ext4)
sudo mkfs -t ext4 /dev/xvdg
sudo mkfs -t ext4 /dev/xvdh

# Create mount points
sudo mkdir -p /data/cleave
sudo mkdir -p /data2

# Mount
sudo mount /dev/xvdg /data/cleave
sudo mount /dev/xvdh /data2

# Make persistent across reboots — add to /etc/fstab
# Get UUIDs first:
sudo blkid /dev/xvdg /dev/xvdh

# Add lines like these to /etc/fstab (use YOUR UUIDs):
# UUID=<uuid-of-sdg>  /data/cleave  ext4  defaults,nofail  0  2
# UUID=<uuid-of-sdh>  /data2        ext4  defaults,nofail  0  2
sudo nano /etc/fstab

# Verify fstab is correct (will mount all entries)
sudo mount -a

# Set ownership
sudo chown -R ubuntu:ubuntu /data/cleave
sudo chown -R ubuntu:ubuntu /data2
```

> **Note**: The device names may appear as `/dev/xvdg`/`/dev/xvdh` (Xen) or `/dev/nvme1n1`/`/dev/nvme2n1` (Nitro) depending on the instance type. Use `lsblk` to identify.

### Storage Layout

After mounting, the directory structure will be:

```
/data/cleave/                    # Primary data volume (Cleave STORAGE_ROOT)
├── projects/{pid}/{eid}/        # Per-experiment files
│   ├── fastqs/raw/              # Uploaded FASTQs
│   ├── fastqs/trimmed/          # Trimmed FASTQs
│   ├── fastqc/                  # FastQC reports
│   ├── beds/                    # User-uploaded BED files
│   └── jobs/{job_id}/           # Pipeline outputs
├── uploads/                     # tus staging area
└── genomes/                     # Bowtie2 indices
    ├── mm10/                    # mm10.*.bt2
    ├── hg38/                    # GRCh38.*.bt2
    ├── hg19/                    # hg19.*.bt2
    ├── dm6/                     # dm6.*.bt2
    ├── sacCer3/                 # sacCer3.*.bt2
    └── ecoli/                   # ecoli.*.bt2
```

---

## 4. System Packages

```bash
sudo apt-get update && sudo apt-get upgrade -y

sudo apt-get install -y \
  build-essential \
  git \
  curl \
  wget \
  unzip \
  zlib1g-dev \
  libncurses5-dev \
  libbz2-dev \
  liblzma-dev \
  libcurl4-openssl-dev \
  libssl-dev \
  libffi-dev \
  libreadline-dev \
  libsqlite3-dev \
  software-properties-common \
  nginx \
  certbot \
  python3-certbot-nginx \
  openjdk-17-jre-headless \
  gcc \
  make
```

> **Java is required** for Trimmomatic. Verify: `java -version` (should show OpenJDK 17+).

---

## 5. Install PostgreSQL 15

```bash
# Add PostgreSQL APT repo
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt-get update

sudo apt-get install -y postgresql-15 postgresql-client-15

# Start and enable
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create the cleave database and user
sudo -u postgres psql <<EOF
CREATE USER cleave WITH PASSWORD '<CHOOSE_A_STRONG_PASSWORD>';
CREATE DATABASE cleave OWNER cleave;
CREATE DATABASE cleave_test OWNER cleave;
ALTER USER cleave CREATEDB;
EOF

# Verify connectivity
psql -h localhost -U cleave -d cleave -c "SELECT 1;"
# Enter password when prompted
```

> **Important**: Replace `<CHOOSE_A_STRONG_PASSWORD>` with a real password. You'll use this in the `.env` file.

### Configure pg_hba.conf for local connections

```bash
# Find the config file
sudo -u postgres psql -c "SHOW hba_file;"

# Edit to allow password auth for local connections
sudo nano /etc/postgresql/15/main/pg_hba.conf

# Change the line for local IPv4 connections from:
#   local   all   all   peer
# to:
#   local   all   all   md5
# Also ensure:
#   host    all   all   127.0.0.1/32   md5

sudo systemctl restart postgresql
```

---

## 6. Install Node.js 20

```bash
# Using NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version   # v20.x
npm --version    # 10.x
```

---

## 7. Install Python 3.11+ and Backend Dependencies

```bash
# Check system Python version
python3 --version

# If < 3.11, install from deadsnakes PPA:
sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt-get update
sudo apt-get install -y python3.11 python3.11-venv python3.11-dev

# Create a virtual environment for Cleave
cd /data/cleave
python3.11 -m venv /data/cleave/venv
source /data/cleave/venv/bin/activate

# Verify
python --version  # 3.11.x
```

---

## 8. Install Bioinformatics Tools

All pipeline tools must be on `PATH` when the worker runs. Install via conda (recommended) or compile from source.

### Option A: Conda (Recommended)

```bash
# Install Miniconda if not already present
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O ~/miniconda.sh
bash ~/miniconda.sh -b -p /data/cleave/miniconda
rm ~/miniconda.sh
eval "$(/data/cleave/miniconda/bin/conda shell.bash hook)"

# Create the pipeline environment
conda create -n cleave-pipeline python=3.11 -y
conda activate cleave-pipeline

# Install bioinformatics tools
conda install -c bioconda -c conda-forge -y \
  bowtie2 \
  samtools \
  bedtools \
  picard \
  deeptools \
  macs2 \
  homer \
  fastqc \
  trimmomatic

# SICER2 (if needed)
pip install SICER2

# SEACR is already in the repo at backend/pipelines/tools/SEACR_1.1.sh
# Make it executable:
# chmod +x /path/to/cleave/backend/pipelines/tools/SEACR_1.1.sh
```

### Option B: Manual/APT install

```bash
sudo apt-get install -y bowtie2 samtools bedtools picard-tools fastqc
pip install deeptools macs2 SICER2
# HOMER: follow install instructions at http://homer.ucsd.edu/homer/introduction/install.html
```

### Verify all tools are accessible

```bash
bowtie2 --version
samtools --version
bedtools --version
picard MarkDuplicates --version 2>&1 | head -1
bamCoverage --version
macs2 --version
fastqc --version
trimmomatic -version 2>&1 | head -1
annotatePeaks.pl 2>&1 | head -1   # HOMER
```

> **Every tool above must be on PATH** when the worker process runs. If using conda, the systemd service must activate the conda env (shown in Step 18).

---

## 9. Install R and R Packages

R is required for DiffBind, Pearson correlation (rtracklayer), and Roman normalization.

```bash
# Install R 4.3+
sudo apt-key adv --keyserver keyserver.ubuntu.com --recv-key '95C0FAF38DB3CCAD0C080A7BDC78B2DDEABC47B7'
sudo add-apt-repository "deb https://cloud.r-project.org/bin/linux/ubuntu $(lsb_release -cs)-cran40/"
sudo apt-get update
sudo apt-get install -y r-base r-base-dev

# Install system dependencies for R packages
sudo apt-get install -y \
  libxml2-dev \
  libcurl4-openssl-dev \
  libharfbuzz-dev \
  libfribidi-dev \
  libfreetype6-dev \
  libpng-dev \
  libtiff5-dev \
  libjpeg-dev

# Install R packages
sudo R -e '
if (!requireNamespace("BiocManager", quietly = TRUE))
    install.packages("BiocManager", repos="https://cloud.r-project.org")

BiocManager::install(c(
    "DiffBind",
    "rtracklayer",
    "GenomicRanges",
    "BiocParallel"
), ask = FALSE, update = FALSE)

install.packages(c("dplyr", "tidyr"), repos = "https://cloud.r-project.org")
'

# Verify
Rscript -e "library(DiffBind); library(rtracklayer); cat('R packages OK\n')"
```

---

## 10. Set Up Bowtie2 Genome Indices

Bowtie2 indices must exist at `GENOME_INDEX_DIR/<genome>/<index_name>*.bt2`.

```bash
mkdir -p /data/cleave/genomes/{mm10,hg38,hg19,dm6,sacCer3,ecoli}
```

### Expected index base names (hardcoded in `alignment.py`)

| Genome | Directory | Index base name | Files expected |
|--------|-----------|-----------------|----------------|
| mm10 | `/data/cleave/genomes/mm10/` | `mm10` | `mm10.1.bt2`, `mm10.2.bt2`, ... `mm10.rev.2.bt2` |
| hg38 | `/data/cleave/genomes/hg38/` | `GRCh38` | `GRCh38.1.bt2`, ... |
| hg19 | `/data/cleave/genomes/hg19/` | `hg19` | `hg19.1.bt2`, ... |
| dm6 | `/data/cleave/genomes/dm6/` | `dm6` | `dm6.1.bt2`, ... |
| sacCer3 | `/data/cleave/genomes/sacCer3/` | `sacCer3` | `sacCer3.1.bt2`, ... |
| ecoli | `/data/cleave/genomes/ecoli/` | `ecoli` | `ecoli.1.bt2`, ... |

### If indices exist on the instance already

The lab's existing Bowtie2 indices may be at `~/cutruntools/assemblies/` or similar. Copy or symlink them:

```bash
# Example: if mm10 index is at /data/rs_256/workdir/bowtie2_idx/
ln -s /path/to/existing/mm10/mm10 /data/cleave/genomes/mm10/mm10
# Verify: ls /data/cleave/genomes/mm10/mm10.*.bt2
```

### If you need to download and build indices

```bash
# mm10 (mouse) — download pre-built from NCBI/iGenomes or build from FASTA
cd /data/cleave/genomes/mm10
wget https://genome-idx.s3.amazonaws.com/bt2/mm10.zip
unzip mm10.zip && rm mm10.zip

# hg38 (human)
cd /data/cleave/genomes/hg38
wget https://genome-idx.s3.amazonaws.com/bt2/GRCh38_noalt_as.zip
unzip GRCh38_noalt_as.zip && rm GRCh38_noalt_as.zip
# Note: rename index files to GRCh38.*.bt2 if needed

# E. coli K12 MG1655 (spike-in)
cd /data/cleave/genomes/ecoli
# Build from FASTA:
# bowtie2-build ecoli_k12.fasta ecoli
```

> **At minimum, install mm10 and ecoli** for the Gold Standard reference project. Other genomes can be added as needed.

---

## 11. Clone the Repository

```bash
cd /data/cleave
git clone <your-repo-url> app
cd app
```

> Adjust the URL for your private GitHub repo. You may need to set up a deploy key or personal access token.

---

## 12. Compile kseq_test

The `kseq_test` binary must be compiled for x86_64 Linux (the Mac arm64 binary won't work).

```bash
cd /data/cleave/app/backend/pipelines/tools
gcc -O2 kseq_test.c -lz -o kseq_test
chmod +x kseq_test

# Verify
./kseq_test 2>&1 | head -1
# Should show usage info, not "command not found" or "exec format error"
```

---

## 13. Configure Environment Variables

Create the production `.env` file:

```bash
cd /data/cleave/app/backend
cp ../.env.example .env
```

Edit `.env` with production values:

```bash
nano .env
```

```env
# Database — use the password you set in Step 5
DATABASE_URL=postgresql+asyncpg://cleave:<DB_PASSWORD>@localhost:5432/cleave
TEST_DATABASE_URL=postgresql+asyncpg://cleave:<DB_PASSWORD>@localhost:5432/cleave_test

# Auth — GENERATE STRONG RANDOM SECRETS (min 32 chars each)
# python3 -c "import secrets; print(secrets.token_urlsafe(48))"
SECRET_KEY=<GENERATE_ME>
REFRESH_SECRET_KEY=<GENERATE_ME>
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
COOKIE_SECURE=true

# App
CORS_ORIGINS=https://your-domain.com
STORAGE_ROOT=/data/cleave
UPLOAD_MAX_SIZE_MB=5000
PIPELINE_MODE=real

# File serving — NGINX handles large files
NGINX_FILE_SERVING=true
NGINX_INTERNAL_PREFIX=/internal-files/

# Worker
WORKER_POLL_INTERVAL_SECONDS=2

# Pipeline concurrency — m5.8xlarge has 32 vCPUs
MAX_CONCURRENT_REACTIONS=8

# Email (Amazon SES) — leave empty to skip emails
AWS_SES_REGION=us-west-2
AWS_SES_FROM_EMAIL=cleave@your-domain.com
APP_URL=https://your-domain.com

# Password reset
RESET_TOKEN_LIFETIME_SECONDS=3600

# Genomes
GENOME_INDEX_DIR=/data/cleave/genomes

# Storage Lifecycle
CLEANUP_ENABLED=true
CLEANUP_INTERVAL_HOURS=24
LOG_RETENTION_DAYS=30
STORAGE_QUOTA_BYTES=0
TUS_STAGING_RETENTION_HOURS=48
```

### Generate secrets

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
# Run twice — one for SECRET_KEY, one for REFRESH_SECRET_KEY
```

> **Critical**: `COOKIE_SECURE=true` is mandatory in production (requires HTTPS). `PIPELINE_MODE=real` enables actual bioinformatics tool execution.

---

## 14. Initialize the Database

```bash
cd /data/cleave/app/backend

# Activate the virtual environment (or conda env)
source /data/cleave/venv/bin/activate
# OR: conda activate cleave-pipeline

# Install backend dependencies
pip install -e ".[dev]"

# Run all Alembic migrations (11 migrations)
alembic upgrade head

# Verify tables exist
psql -h localhost -U cleave -d cleave -c "\dt"
# Should show 11 tables: users, projects, project_members, experiments,
# fastq_files, reactions, analysis_jobs, job_outputs, notifications,
# experiment_events, saved_servers
```

---

## 15. Build the Frontend

```bash
cd /data/cleave/app/frontend

# Install dependencies
npm install

# Build production bundle
npm run build
# Output goes to frontend/dist/
```

The production build creates static files that NGINX will serve directly. The Vite dev proxy is not used in production — NGINX handles API proxying.

---

## 16. Configure NGINX

NGINX serves three roles:
1. **Static file server** for the React SPA (`frontend/dist/`)
2. **Reverse proxy** for the FastAPI backend (`/api/*` → `localhost:8000`)
3. **Internal file server** for `X-Accel-Redirect` (large file downloads without loading into FastAPI)

Create the NGINX config:

```bash
sudo nano /etc/nginx/sites-available/cleave
```

```nginx
server {
    listen 80;
    server_name your-domain.com;     # or 54.244.37.255 if no domain

    # Max upload size — must match UPLOAD_MAX_SIZE_MB (5 GB)
    client_max_body_size 5120m;

    # Increase proxy timeouts for long-running pipeline operations
    proxy_read_timeout 600s;
    proxy_connect_timeout 60s;
    proxy_send_timeout 600s;

    # --- React SPA (static files) ---
    root /data/cleave/app/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # --- API reverse proxy ---
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE support (disable buffering for event streams)
        proxy_buffering off;
        proxy_cache off;

        # tus upload support (chunked transfer)
        proxy_request_buffering off;
    }

    # --- Internal file serving (X-Accel-Redirect) ---
    # FastAPI sets X-Accel-Redirect header; NGINX serves the file directly.
    # The /internal-files/ prefix must match NGINX_INTERNAL_PREFIX in .env
    location /internal-files/ {
        internal;
        alias /data/cleave/projects/;
    }

    # --- Static assets caching ---
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # --- Gzip ---
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 1024;
}
```

Enable the site:

```bash
# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# Enable cleave
sudo ln -sf /etc/nginx/sites-available/cleave /etc/nginx/sites-enabled/cleave

# Test config
sudo nginx -t

# Reload
sudo systemctl reload nginx
sudo systemctl enable nginx
```

---

## 17. Configure TLS with Certbot

**Skip this step if using raw IP address (no domain).** TLS is required for `COOKIE_SECURE=true` (production auth cookies). If no domain, set `COOKIE_SECURE=false` temporarily.

```bash
# Obtain certificate (replace with your domain)
sudo certbot --nginx -d your-domain.com

# Certbot will:
# 1. Obtain a Let's Encrypt certificate
# 2. Modify the NGINX config to add SSL
# 3. Set up auto-renewal

# Verify auto-renewal
sudo certbot renew --dry-run
```

> If using raw IP without TLS: set `COOKIE_SECURE=false` in `.env` and access via `http://54.244.37.255`. This is acceptable for internal lab use but not recommended for production.

---

## 18. Create systemd Services

Three services are needed:
1. **cleave-api** — FastAPI application (Uvicorn)
2. **cleave-worker** — Pipeline job queue processor
3. **cleave-api.socket** (optional) — Socket activation for zero-downtime restarts

### Service: cleave-api

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
WorkingDirectory=/data/cleave/app/backend
Environment="PATH=/data/cleave/miniconda/envs/cleave-pipeline/bin:/usr/local/bin:/usr/bin:/bin"
EnvironmentFile=/data/cleave/app/backend/.env
ExecStart=/data/cleave/miniconda/envs/cleave-pipeline/bin/uvicorn main:app \
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

### Service: cleave-worker

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
WorkingDirectory=/data/cleave/app/backend
Environment="PATH=/data/cleave/miniconda/envs/cleave-pipeline/bin:/usr/local/bin:/usr/bin:/bin"
EnvironmentFile=/data/cleave/app/backend/.env
ExecStart=/data/cleave/miniconda/envs/cleave-pipeline/bin/python worker.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=cleave-worker

# Pipeline jobs can be long-running — don't kill too fast
TimeoutStopSec=300

[Install]
WantedBy=multi-user.target
```

> **Important**: Adjust `PATH` to include the directory where ALL bioinformatics tools are installed. If using conda, point to the conda env's `bin/` directory. If tools are installed in multiple locations, include all paths.

### Enable and start services

```bash
sudo systemctl daemon-reload

# Enable (auto-start on boot)
sudo systemctl enable cleave-api cleave-worker

# Start
sudo systemctl start cleave-api
sudo systemctl start cleave-worker

# Check status
sudo systemctl status cleave-api
sudo systemctl status cleave-worker

# View logs
sudo journalctl -u cleave-api -f
sudo journalctl -u cleave-worker -f
```

### HOMER PATH Note

HOMER installs to a non-standard location (often `~/homer/bin/`). Make sure the `PATH` in the systemd services includes it:

```ini
Environment="PATH=/data/cleave/miniconda/envs/cleave-pipeline/bin:/home/ubuntu/homer/bin:/usr/local/bin:/usr/bin:/bin"
```

---

## 19. Seed the Gold Standard Reference Project

The reference project provides a pre-analyzed dataset visible to all authenticated users.

```bash
cd /data/cleave/app

# Activate environment
source /data/cleave/venv/bin/activate
# OR: conda activate cleave-pipeline

# Run the seed script (production mode — expects files to be rsynced)
python scripts/seed_reference_project.py

# Note the output — you'll need the Project ID and Experiment ID for rsync:
# Created reference project: id=<PID>
# Created experiment: id=<EID>
# Data path: /data/cleave/projects/<PID>/<EID>
```

---

## 20. Transfer Reference Data

From your **local Mac** (where `dev-data/` lives):

```bash
# Replace <PID> and <EID> with the IDs from the seed script output
rsync -avz --progress \
  --exclude='fastqs/raw/' \
  dev-data/projects/1/1/ \
  -e "ssh -i ./210323.pem" \
  ubuntu@54.244.37.255:/data/cleave/projects/<PID>/<EID>/
```

### What gets transferred (~4.5 GB)

| Directory | Contents | Size |
|-----------|----------|------|
| `fastqs/trimmed/` | Trimmed FASTQ files | ~2 GB |
| `fastqc/` | FastQC HTML reports | ~50 MB |
| `jobs/11/` | Alignment outputs (BAMs, bigWigs, heatmaps, QC) | ~1.5 GB |
| `jobs/12/` | Peak calling outputs (peaks, annotation, QC) | ~200 MB |
| `jobs/13/` | DiffBind results (plots, TSV) | ~50 MB |
| `jobs/14/` | Normalization results (bigWigs, factors) | ~500 MB |
| `jobs/15/` | Custom heatmap results | ~50 MB |
| `jobs/18/` | Pearson correlation results | ~50 MB |

### What's excluded

- `fastqs/raw/` — Raw FASTQs (~16 GB, not needed for browsing results)

> **The rsync destination path MUST match** the `Data path` from the seed script. Job output file paths in the database are relative to `STORAGE_ROOT`.

---

## 21. Verification Checklist

After deployment, verify each component:

### Infrastructure

```bash
# PostgreSQL
psql -h localhost -U cleave -d cleave -c "SELECT count(*) FROM users;"

# NGINX
curl -I http://localhost    # Should return 200

# API
curl http://localhost:8000/api/v1/health   # {"status":"ok"}

# API through NGINX
curl http://54.244.37.255/api/v1/health    # {"status":"ok"}

# Services
sudo systemctl status cleave-api       # Active (running)
sudo systemctl status cleave-worker    # Active (running)
sudo systemctl status nginx            # Active (running)
sudo systemctl status postgresql       # Active (running)
```

### Pipeline tools (run from worker context)

```bash
# Activate the same env as the worker
conda activate cleave-pipeline  # or source the venv

bowtie2 --version | head -1
samtools --version | head -1
bedtools --version
picard MarkDuplicates --version 2>&1 | head -1
bamCoverage --version
macs2 --version
fastqc --version
trimmomatic -version 2>&1 | head -1
annotatePeaks.pl 2>&1 | head -1
Rscript -e "library(DiffBind); cat('DiffBind OK\n')"
Rscript -e "library(rtracklayer); cat('rtracklayer OK\n')"

# kseq_test
/data/cleave/app/backend/pipelines/tools/kseq_test 2>&1 | head -1

# Genome indices
ls /data/cleave/genomes/mm10/mm10.*.bt2 | wc -l    # Should be 6
ls /data/cleave/genomes/ecoli/ecoli.*.bt2 | wc -l   # Should be 6
```

### Application

1. Open `https://your-domain.com` (or `http://54.244.37.255`) in a browser
2. **Landing page** should load with the pipeline visualization
3. **Register** a new account
4. **Log in** — should redirect to `/dashboard`
5. **Gold Standard Reference** card should appear in the sidebar
6. Click the reference project — should show the crown icon and "Shared with all users"
7. Click "MeCP2 CUT&RUN (mm10)" experiment
8. Browse each tab:
   - **Alignment** — QC metrics and heatmaps
   - **Peak Calling** — SEACR peak metrics and annotation charts
   - **DiffBind** — Volcano plot, MA plot, PCA
   - **Normalization** — Normalization factors
   - **Heatmaps** — Reference-point heatmap
   - **Correlation** — Pearson correlation heatmap
   - **All Files** — Full file tree
9. Verify **no mutation buttons** on reference project (no "Run Full Pipeline", no "New Analysis")

### End-to-end pipeline test

1. Create a new project
2. Create an experiment (CUT&RUN, Mouse mm10)
3. Upload test FASTQ files (from `test_data/` or a real dataset)
4. Set up reactions
5. Run alignment — verify BAMs and bigWigs are produced
6. Run peak calling — verify BED files and annotation charts appear
7. Check IGV browser — tracks should load with byte-range support
8. Download a file — verify HMAC-signed token works

---

## 22. Operations & Maintenance

### Updating the application

```bash
cd /data/cleave/app

# Pull latest code
git pull origin main

# Backend: install any new dependencies
cd backend
source /data/cleave/venv/bin/activate   # or conda activate
pip install -e ".[dev]"

# Run migrations
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
# API logs
sudo journalctl -u cleave-api -f --no-pager

# Worker logs (pipeline execution)
sudo journalctl -u cleave-worker -f --no-pager

# NGINX access/error logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Pipeline job logs (per-job)
ls /data/cleave/projects/<pid>/<eid>/jobs/<jid>/master.log
```

### Manual storage cleanup

```bash
# Via API (requires superuser account)
curl -X POST https://your-domain.com/api/v1/admin/cleanup \
  -H "Authorization: Bearer <admin_token>"

# Or check storage info
curl https://your-domain.com/api/v1/admin/storage-info \
  -H "Authorization: Bearer <admin_token>"
```

### Database backup

```bash
# Backup
pg_dump -h localhost -U cleave cleave > /data2/backups/cleave_$(date +%Y%m%d).sql

# Restore
psql -h localhost -U cleave cleave < /data2/backups/cleave_YYYYMMDD.sql
```

### Monitoring disk space

```bash
df -h /data/cleave /data2
du -sh /data/cleave/projects/*/
```

---

## 23. Troubleshooting

### "502 Bad Gateway" from NGINX

The API is not running or not responding on port 8000.

```bash
sudo systemctl status cleave-api
sudo journalctl -u cleave-api --since "5 min ago"
curl http://127.0.0.1:8000/api/v1/health
```

### Pipeline jobs stay in "queued" state

The worker is not running or cannot reach the database.

```bash
sudo systemctl status cleave-worker
sudo journalctl -u cleave-worker --since "5 min ago"
```

### "kseq_test binary not found"

Compile it for x86_64:

```bash
cd /data/cleave/app/backend/pipelines/tools
gcc -O2 kseq_test.c -lz -o kseq_test
chmod +x kseq_test
```

### "Trimmomatic not found"

The worker uses `_resolve_trimmomatic_cmd()` which tries three methods:
1. `TRIMMOMATIC_JAR` env var (explicit JAR path)
2. Conda wrapper (`trimmomatic` on PATH)
3. `trimmomatic` on PATH directly

If using conda, ensure the systemd PATH includes the conda env bin. If using a manual install, set:

```bash
# In .env or systemd Environment
TRIMMOMATIC_JAR=/path/to/trimmomatic-0.39.jar
```

### "Bowtie2 index not found"

Check the genome directory matches expected naming:

```bash
ls /data/cleave/genomes/mm10/mm10.*.bt2
# Must have: mm10.1.bt2, mm10.2.bt2, mm10.3.bt2, mm10.4.bt2, mm10.rev.1.bt2, mm10.rev.2.bt2
```

### "effectiveGenomeSize" concerns

Cleave uses the **correct** per-genome values (not the lab's buggy mm10-for-all):

| Genome | effectiveGenomeSize |
|--------|---------------------|
| mm10 | 2,467,481,108 |
| hg38 | 2,913,022,398 |
| hg19 | 2,864,785,220 |
| dm6 | 142,573,017 |
| sacCer3 | 12,157,105 |

### SSE not connecting / notifications not arriving

Check that NGINX is not buffering SSE:

```nginx
location /api/ {
    proxy_buffering off;   # Required for SSE
    proxy_cache off;
}
```

### CORS errors in browser

`CORS_ORIGINS` in `.env` must exactly match the URL in your browser (including protocol and port):

```env
# If accessing via https://cleave.fergusonlab.ucsd.edu
CORS_ORIGINS=https://cleave.fergusonlab.ucsd.edu

# If accessing via http://54.244.37.255
CORS_ORIGINS=http://54.244.37.255
```

### File downloads return 403/404

When `NGINX_FILE_SERVING=true`, NGINX must be configured to serve the internal files path:

```nginx
location /internal-files/ {
    internal;
    alias /data/cleave/projects/;
}
```

### Large uploads fail

Check `client_max_body_size` in NGINX matches `UPLOAD_MAX_SIZE_MB`:

```nginx
client_max_body_size 5120m;   # 5 GB
```

### DiffBind: BiocParallel fork crash

Cleave includes `SerialParam()` fallback for macOS, but on Linux this shouldn't be an issue. If it occurs:

```bash
# Check R is using the correct library path
Rscript -e ".libPaths()"
```

---

## 24. Quick Reference

### Service Management

```bash
# Start/stop/restart
sudo systemctl start cleave-api cleave-worker
sudo systemctl stop cleave-api cleave-worker
sudo systemctl restart cleave-api cleave-worker

# View status
sudo systemctl status cleave-api cleave-worker nginx postgresql

# View logs (live)
sudo journalctl -u cleave-api -f
sudo journalctl -u cleave-worker -f
```

### Key File Paths

| What | Path |
|------|------|
| Application code | `/data/cleave/app/` |
| Backend code | `/data/cleave/app/backend/` |
| Frontend build | `/data/cleave/app/frontend/dist/` |
| Environment config | `/data/cleave/app/backend/.env` |
| Project data | `/data/cleave/projects/` |
| Genome indices | `/data/cleave/genomes/` |
| tus upload staging | `/data/cleave/uploads/` |
| NGINX config | `/etc/nginx/sites-available/cleave` |
| API systemd unit | `/etc/systemd/system/cleave-api.service` |
| Worker systemd unit | `/etc/systemd/system/cleave-worker.service` |
| PostgreSQL data | `/var/lib/postgresql/15/main/` |
| kseq_test binary | `/data/cleave/app/backend/pipelines/tools/kseq_test` |
| SEACR script | `/data/cleave/app/backend/pipelines/tools/SEACR_1.1.sh` |

### Key Environment Variables

| Variable | Production Value |
|----------|-----------------|
| `DATABASE_URL` | `postgresql+asyncpg://cleave:<password>@localhost:5432/cleave` |
| `SECRET_KEY` | Random 48+ char string |
| `COOKIE_SECURE` | `true` (requires HTTPS) |
| `PIPELINE_MODE` | `real` |
| `NGINX_FILE_SERVING` | `true` |
| `STORAGE_ROOT` | `/data/cleave` |
| `GENOME_INDEX_DIR` | `/data/cleave/genomes` |
| `MAX_CONCURRENT_REACTIONS` | `8` (for 32 vCPU) |
| `CORS_ORIGINS` | `https://your-domain.com` |

### Instance Management

```bash
# Check who's logged in before stopping
who

# Disk space
df -h

# Memory usage
free -h

# CPU usage
htop

# Running pipelines
sudo journalctl -u cleave-worker --since "1 hour ago" | grep "running"
```

---

## Architecture Diagram (Production)

```
                    Internet
                       │
                       ▼
               ┌───────────────┐
               │    NGINX      │  :80/:443
               │  (TLS + proxy)│
               └───────┬───────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
          ▼            ▼            ▼
   Static Files    /api/* proxy   /internal-files/
   (React SPA)         │          (X-Accel-Redirect)
   frontend/dist/      │              │
                       ▼              │
               ┌───────────────┐      │
               │   Uvicorn     │      │
               │  (FastAPI)    │      │
               │  :8000        │──────┘ (sets X-Accel-Redirect header)
               └───────┬───────┘
                       │
          ┌────────────┼─────────────┐
          │            │             │
          ▼            ▼             ▼
   ┌──────────┐ ┌──────────┐ ┌──────────────┐
   │ Postgres │ │  Worker   │ │ /data/cleave │
   │  :5432   │ │ (async)   │ │  (EBS vol)   │
   │          │ │           │ │              │
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

---

## Security Checklist

- [ ] `SECRET_KEY` and `REFRESH_SECRET_KEY` are unique random strings (48+ chars)
- [ ] `COOKIE_SECURE=true` (requires HTTPS)
- [ ] Database password is not the default `dev`
- [ ] `.env` file is not world-readable (`chmod 600 .env`)
- [ ] NGINX has TLS configured (Certbot)
- [ ] Firewall allows only ports 22 (SSH), 80 (HTTP→HTTPS redirect), 443 (HTTPS)
- [ ] FTP/SFTP import SSRF prevention is active (blocks private IPs, localhost, AWS metadata)
- [ ] `CORS_ORIGINS` is set to the exact production URL
- [ ] Rate limiting is active on auth endpoints (5/min login, 3/min register)
