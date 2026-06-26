# Cleave — Oracle Cloud Deployment Guide

> **Target instance**: Oracle Cloud VM.Standard.A1.Flex (4 OCPU, 24 GB RAM, aarch64/ARM)
> **OS**: Ubuntu 22.04 aarch64
> **Deploy to**: `/opt/cleave/`
> **Domain**: `cleave.nazalibhai.com`
> **TLS**: Cloudflare (Full mode) — no certificates on the origin server
> **Date**: 2026-06-26

This guide deploys Cleave onto an Oracle Cloud Ampere A1 instance. It assumes a fresh Ubuntu 22.04 aarch64 VM with a 200 GB boot volume. All bioinformatics tools, R packages, and the web stack are installed via conda.

**Key differences from the EC2 deployment** (`DEPLOYMENT_GUIDE.md`):
- **ARM (aarch64)** instead of x86-64 — `kseq_test` must be recompiled, conda auto-selects ARM packages
- **4 OCPU / 24 GB RAM** instead of 32 vCPU / 128 GB — concurrency and memory limits reduced
- **200 GB boot volume** instead of multi-volume EBS — all on root filesystem, disk monitoring important
- **Ubuntu 22.04** instead of 18.04 — can build frontend on-instance (no glibc limitation)
- **SMTP email** instead of AWS SES — Oracle Cloud Email Delivery or any SMTP provider
- **STAR sparse indices** — required to fit in 24 GB RAM (`--genomeSAsparseD 2`)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Pre-flight Validation](#2-pre-flight-validation)
3. [System Packages](#3-system-packages)
4. [PostgreSQL Setup](#4-postgresql-setup)
5. [Directory Structure](#5-directory-structure)
6. [Conda Environment](#6-conda-environment)
7. [Clone and Configure](#7-clone-and-configure)
8. [Build Genome Indices](#8-build-genome-indices)
9. [Database Migration](#9-database-migration)
10. [Frontend Build](#10-frontend-build)
11. [NGINX Configuration](#11-nginx-configuration)
12. [systemd Services](#12-systemd-services)
13. [Oracle Cloud Networking](#13-oracle-cloud-networking)
14. [Cloudflare DNS](#14-cloudflare-dns)
15. [Seed Reference Project](#15-seed-reference-project)
16. [Verification Checklist](#16-verification-checklist)
17. [Operations & Maintenance](#17-operations--maintenance)
18. [Troubleshooting](#18-troubleshooting)
19. [Resource Tuning Reference](#19-resource-tuning-reference)

---

## 1. Architecture Overview

```
                   Internet
                      |
              +-------+-------+
              |  Cloudflare   |  TLS termination (Full mode)
              |  DNS + CDN    |  cleave.nazalibhai.com -> 146.235.203.57
              +-------+-------+
                      | HTTP :80
              +-------+-------+
              |    NGINX      |  Static files (React SPA)
              |    :80        |  Reverse proxy -> :8000
              |               |  X-Accel-Redirect (large files)
              +-------+-------+
                      |
         +------------+------------+
         |            |            |
         v            v            v
  Static Files    /api/* proxy   /internal-files/
  frontend/dist/      |          (X-Accel-Redirect)
                      v
              +---------------+
              |   Uvicorn     |
              |  (FastAPI)    |
              |  :8000        |
              +-------+-------+
                      |
         +------------+-------------+
         |            |             |
         v            v             v
  +----------+ +----------+ +--------------+
  | Postgres | |  Worker   | | /opt/cleave  |
  |  :5432   | | (async)   | |  (boot vol)  |
  +----------+ +-----+----+ +--------------+
                     |
              +------+-------+
              |  Pipeline    |
              |  Modules     |
              | (subprocess) |
              |              |
              | bowtie2,     |
              | STAR, salmon,|
              | samtools,    |
              | macs2, R,    |
              | ...          |
              +--------------+
```

Same architecture as EC2 — NGINX reverse proxy, FastAPI API server, standalone worker process, PostgreSQL job queue. All on a single ARM instance.

---

## 2. Pre-flight Validation

SSH into the Oracle instance:

```bash
ssh -i ~/.ssh/oracle_key ubuntu@146.235.203.57
```

```bash
# Instance specs — verify ARM and resources
uname -m                    # Expect: aarch64
nproc                       # Expect: 4
free -h                     # Expect: ~24 GB
df -h /                     # Check boot volume size (~200 GB)

# OS version
lsb_release -a              # Expect: Ubuntu 22.04
```

---

## 3. System Packages

```bash
sudo apt-get update

# PostgreSQL
sudo apt-get install -y postgresql postgresql-client

# NGINX
sudo apt-get install -y nginx

# Build tools (for compiling kseq_test)
sudo apt-get install -y build-essential zlib1g-dev

# Node.js 20 (Ubuntu 22.04 can run it natively — no glibc issue)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**Verify:**

```bash
pg_isready                  # accepting connections
nginx -v                    # nginx version
node --version              # v20.x
gcc --version | head -1     # gcc installed (aarch64)
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
sudo -u postgres psql -c "SHOW hba_file;"

# Edit pg_hba.conf — add these lines BEFORE the existing "local all all peer" line:
#   local   cleave      cleave                          md5
#   host    cleave      cleave      127.0.0.1/32        md5
sudo nano "$(sudo -u postgres psql -t -c 'SHOW hba_file;' | xargs)"

sudo systemctl restart postgresql
```

### 4.4 Verify

```bash
psql -h localhost -U cleave -d cleave -c "SELECT 1;"
# Enter password. Expect: 1
```

---

## 5. Directory Structure

Everything lives on the 200 GB boot volume under `/opt/cleave/`.

```bash
sudo mkdir -p /opt/cleave/{app,projects,uploads,genomes}
sudo chown -R ubuntu:ubuntu /opt/cleave
```

### Final layout

```
/opt/cleave/
├── app/                    # Git repo (Step 7)
├── projects/               # Pipeline output data
├── uploads/                # tus upload staging
└── genomes/
    ├── mm10/               # Bowtie2 indices
    ├── hg38/               # Bowtie2 indices
    ├── ecoli/              # E. coli spike-in index
    ├── star/
    │   ├── mm10/           # STAR sparse index (~15 GB)
    │   └── hg38/           # STAR sparse index (~15 GB)
    ├── salmon/
    │   ├── mm10/           # Salmon index
    │   └── hg38/           # Salmon index
    └── gtf/
        ├── gencode.vM10.annotation.gtf
        └── gencode.v29.annotation.gtf
```

### Disk budget (~200 GB boot volume)

| Component | Size |
|-----------|------|
| OS + system packages | ~8 GB |
| Conda environments | ~20 GB |
| Bowtie2 indices (mm10, hg38, ecoli) | ~12 GB |
| STAR sparse indices (mm10, hg38) | ~25 GB |
| Salmon indices | ~2 GB |
| Genome FASTAs + GTFs | ~10 GB |
| HOMER databases | ~8 GB |
| App + frontend | ~1 GB |
| PostgreSQL | ~1 GB |
| Reference project data | ~5 GB |
| **Available for pipeline output** | **~100 GB** |

100 GB is adequate for a small lab but should be monitored. Enable `CLEANUP_ENABLED=true` in `.env`.

---

## 6. Conda Environment

### 6.1 Install Miniconda (aarch64)

If conda is not already installed:

```bash
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-aarch64.sh
bash Miniconda3-latest-Linux-aarch64.sh -b -p /home/ubuntu/miniconda3
eval "$(/home/ubuntu/miniconda3/bin/conda shell.bash hook)"
conda init
source ~/.bashrc
```

### 6.2 Create the environment

```bash
cd /opt/cleave/app
conda env create -f references/conda_envs/conda_cleave.yml
```

**Estimated time**: 30-60 minutes for the solver + download + install on ARM.

> **Tip**: If `conda` is slow, install `mamba` for faster solving:
> ```bash
> conda install -n base -c conda-forge mamba
> mamba env create -f references/conda_envs/conda_cleave.yml
> ```

### 6.3 Fallback: phased install

If the monolithic YAML solve fails on aarch64:

```bash
# Phase 1: Python + bioinformatics tools
conda create -n cleave -c conda-forge -c bioconda -c defaults \
  python=3.11 bowtie2 samtools bedtools picard deeptools macs2 \
  fastqc trimmomatic homer star salmon fastp subread \
  openjdk perl wget pandas matplotlib seaborn numpy scipy pip

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
  "aioftp>=0.22" "asyncssh>=2.14" multiqc rseqc
```

### 6.4 SICER2 (optional, separate environment)

SICER2 requires Python 3.9. Check aarch64 availability:

```bash
conda search -c bioconda sicer2 --platform linux-aarch64
```

If available:

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

If SICER2 is not available for aarch64, skip it. Users can still use MACS2 and SEACR for peak calling. The pipeline validates tool availability before job submission.

### 6.5 Install HOMER annotation databases

```bash
conda activate cleave
configureHomer.pl -install mm10
configureHomer.pl -install hg38
configureHomer.pl -install hg19
```

### 6.6 Verify the environment

```bash
conda activate cleave

# Architecture
file $(which python)         # ELF 64-bit LSB ... ARM aarch64

# Python
python --version             # 3.11.x

# Bioinformatics tools
bowtie2 --version | head -1
samtools --version | head -1
bedtools --version
picard MarkDuplicates --version 2>&1 | head -1
bamCoverage --version
STAR --version
salmon --version
fastp --version
featureCounts -v 2>&1 | head -1
macs2 --version
fastqc --version
trimmomatic -version 2>&1 | head -1
annotatePeaks.pl 2>&1 | head -1

# Java
java -version                # 17+

# R packages
Rscript -e "library(DiffBind); library(rtracklayer); cat('R OK\n')"
Rscript -e "library(DESeq2); library(edgeR); cat('Bioconductor OK\n')"

# Python web stack
python -c "import fastapi, uvicorn, sqlalchemy, asyncpg; print('Web stack OK')"
```

---

## 7. Clone and Configure

### 7.1 Clone the repository

```bash
cd /opt/cleave
git clone <repo-url> app
cd /opt/cleave/app
```

### 7.2 Compile kseq_test (ARM)

The committed binary is x86-64 and will not run on aarch64. Recompile from source:

```bash
cd /opt/cleave/app/backend/pipelines/tools
gcc -O2 kseq_test.c -lz -o kseq_test
chmod +x kseq_test

# Verify — should print usage info, NOT "exec format error"
./kseq_test 2>&1 | head -1
file kseq_test               # Expect: ELF 64-bit LSB ... ARM aarch64
```

### 7.3 Make SEACR executable

```bash
chmod +x /opt/cleave/app/backend/pipelines/tools/SEACR_1.1.sh
```

### 7.4 Create production .env

Generate secret keys:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # SECRET_KEY
python3 -c "import secrets; print(secrets.token_urlsafe(48))"   # REFRESH_SECRET_KEY
```

Create `/opt/cleave/app/backend/.env`:

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
STORAGE_ROOT=/opt/cleave
UPLOAD_MAX_SIZE_MB=10000
PIPELINE_MODE=real

# File serving — NGINX handles large files
NGINX_FILE_SERVING=true
NGINX_INTERNAL_PREFIX=/internal-files/

# Worker
WORKER_POLL_INTERVAL_SECONDS=2

# Pipeline concurrency — tuned for 4 OCPU / 24 GB RAM
MAX_CONCURRENT_REACTIONS=2
MAX_CONCURRENT_RNASEQ_REACTIONS=1
TRIMMOMATIC_HEAP_SIZE=2g
STAR_BAM_SORT_RAM=8000000000

# Genomes
GENOME_INDEX_DIR=/opt/cleave/genomes
STAR_INDEX_DIR=/opt/cleave/genomes/star
SALMON_INDEX_DIR=/opt/cleave/genomes/salmon
GENCODE_GTF_DIR=/opt/cleave/genomes/gtf
RSEQC_BED_DIR=/opt/cleave/genomes/rseqc

# Local path import
LOCAL_IMPORT_DEFAULT_PATH=/opt

# Email (SMTP — Oracle Cloud Email Delivery)
# Configure after setting up OCI Email Delivery in the Oracle Cloud console.
# See: https://docs.oracle.com/en-us/iaas/Content/Email/home.htm
SMTP_HOST=
SMTP_PORT=587
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=
SMTP_USE_TLS=true
APP_URL=https://cleave.nazalibhai.com

# Leave SES empty (using SMTP instead)
AWS_SES_REGION=
AWS_SES_FROM_EMAIL=

# Password reset
RESET_TOKEN_LIFETIME_SECONDS=3600

# Storage lifecycle — important on 200 GB boot volume
CLEANUP_ENABLED=true
CLEANUP_INTERVAL_HOURS=12
LOG_RETENTION_DAYS=14
STORAGE_QUOTA_BYTES=0
TUS_STAGING_RETENTION_HOURS=24
```

### 7.5 Secure the .env file

```bash
chmod 600 /opt/cleave/app/backend/.env
```

---

## 8. Build Genome Indices

### 8.1 Download genome files

```bash
mkdir -p /opt/cleave/genomes/{fasta,gtf}
cd /opt/cleave/genomes/fasta

# Mouse mm10
wget https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M10/GRCm38.primary_assembly.genome.fa.gz
gunzip GRCm38.primary_assembly.genome.fa.gz
mv GRCm38.primary_assembly.genome.fa mm10.fa

# Human hg38
wget https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_29/GRCh38.primary_assembly.genome.fa.gz
gunzip GRCh38.primary_assembly.genome.fa.gz
mv GRCh38.primary_assembly.genome.fa hg38.fa

# GTF annotations
cd /opt/cleave/genomes/gtf
wget https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_mouse/release_M10/gencode.vM10.annotation.gtf.gz
gunzip gencode.vM10.annotation.gtf.gz
wget https://ftp.ebi.ac.uk/pub/databases/gencode/Gencode_human/release_29/gencode.v29.annotation.gtf.gz
gunzip gencode.v29.annotation.gtf.gz
```

### 8.2 Bowtie2 indices

Option A — **Copy from EC2** (`.bt2` files are architecture-independent):

```bash
# From your local machine or EC2:
scp -r ubuntu@<ec2-ip>:/data2/cleave/genomes/mm10 ubuntu@146.235.203.57:/opt/cleave/genomes/
scp -r ubuntu@<ec2-ip>:/data2/cleave/genomes/hg38 ubuntu@146.235.203.57:/opt/cleave/genomes/
scp -r ubuntu@<ec2-ip>:/data2/cleave/genomes/ecoli ubuntu@146.235.203.57:/opt/cleave/genomes/
```

Option B — **Build on Oracle** (~1-2 hours per genome on 4 OCPUs):

```bash
conda activate cleave
mkdir -p /opt/cleave/genomes/{mm10,hg38}

bowtie2-build --threads 4 /opt/cleave/genomes/fasta/mm10.fa /opt/cleave/genomes/mm10/mm10
bowtie2-build --threads 4 /opt/cleave/genomes/fasta/hg38.fa /opt/cleave/genomes/hg38/hg38
```

Verify:

```bash
ls /opt/cleave/genomes/mm10/mm10.*.bt2 | wc -l      # 6
ls /opt/cleave/genomes/hg38/hg38.*.bt2 | wc -l      # 6
```

### 8.3 STAR sparse indices (required for 24 GB RAM)

STAR indices **must be rebuilt** with `--genomeSAsparseD 2` to fit in 24 GB RAM. Standard indices require ~30 GB and will cause OOM.

Run each in a `screen` session — they take 2-4 hours per genome on 4 OCPUs:

```bash
conda activate cleave
screen -S star-index

# Mouse mm10 (sparse)
mkdir -p /opt/cleave/genomes/star/mm10
STAR --runMode genomeGenerate \
  --runThreadN 4 \
  --genomeDir /opt/cleave/genomes/star/mm10/ \
  --genomeFastaFiles /opt/cleave/genomes/fasta/mm10.fa \
  --sjdbGTFfile /opt/cleave/genomes/gtf/gencode.vM10.annotation.gtf \
  --sjdbOverhang 100 \
  --genomeSAsparseD 2

# Human hg38 (sparse)
mkdir -p /opt/cleave/genomes/star/hg38
STAR --runMode genomeGenerate \
  --runThreadN 4 \
  --genomeDir /opt/cleave/genomes/star/hg38/ \
  --genomeFastaFiles /opt/cleave/genomes/fasta/hg38.fa \
  --sjdbGTFfile /opt/cleave/genomes/gtf/gencode.v29.annotation.gtf \
  --sjdbOverhang 100 \
  --genomeSAsparseD 2

# Ctrl+A, D to detach from screen
```

### 8.4 Salmon indices

Option A — **Copy from EC2**:

```bash
scp -r ubuntu@<ec2-ip>:/data2/cleave/genomes/salmon ubuntu@146.235.203.57:/opt/cleave/genomes/
```

Option B — **Build on Oracle** (requires extracting transcriptome from genome + GTF):

```bash
# Extract transcriptome from genome FASTA + GTF
# (salmon needs a transcriptome FASTA, not a genome FASTA)
# Use gffread from conda if available, or download pre-built transcriptome

mkdir -p /opt/cleave/genomes/salmon/mm10
salmon index \
  -t /opt/cleave/genomes/fasta/mm10_transcripts.fa \
  -i /opt/cleave/genomes/salmon/mm10/ \
  --gencode

mkdir -p /opt/cleave/genomes/salmon/hg38
salmon index \
  -t /opt/cleave/genomes/fasta/hg38_transcripts.fa \
  -i /opt/cleave/genomes/salmon/hg38/ \
  --gencode
```

### 8.5 E. coli spike-in index

Copy from EC2 or build:

```bash
scp -r ubuntu@<ec2-ip>:/data2/cleave/genomes/ecoli ubuntu@146.235.203.57:/opt/cleave/genomes/
```

---

## 9. Database Migration

```bash
conda activate cleave
cd /opt/cleave/app/backend

# Install the cleave backend package
pip install -e .

# Run all Alembic migrations (fresh database)
alembic upgrade head
```

**Verify:**

```bash
psql -h localhost -U cleave -d cleave -c "\dt"
# Expect 11 tables
```

---

## 10. Frontend Build

Ubuntu 22.04 can run Node.js 20 natively — build directly on the instance:

```bash
cd /opt/cleave/app/frontend
npm install
npm run build
```

**Verify:**

```bash
ls /opt/cleave/app/frontend/dist/index.html    # Must exist
ls /opt/cleave/app/frontend/dist/assets/        # Must contain JS/CSS bundles
```

---

## 11. NGINX Configuration

### 11.1 Create the site config

```bash
sudo nano /etc/nginx/sites-available/cleave
```

```nginx
# Cloudflare IP ranges — restore real client IPs for rate limiting
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

    # Max upload size
    client_max_body_size 10240m;

    # Proxy timeouts for long-running pipeline API calls
    proxy_read_timeout 600s;
    proxy_connect_timeout 60s;
    proxy_send_timeout 600s;

    # -- React SPA (static files) --
    root /opt/cleave/app/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # -- SSE endpoint (long-lived connection, no buffering) --
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

    # -- API reverse proxy --
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_buffering off;
        proxy_cache off;
        proxy_request_buffering off;
    }

    # -- Internal file serving (X-Accel-Redirect) --
    location /internal-files/ {
        internal;
        alias /opt/cleave/projects/;
    }

    # -- Static asset caching --
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # -- Gzip --
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 1024;
}
```

### 11.2 Enable the site

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/cleave /etc/nginx/sites-enabled/cleave
sudo nginx -t                     # Must say "ok"
sudo systemctl reload nginx
sudo systemctl enable nginx
```

---

## 12. systemd Services

### 12.1 cleave-api.service

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
WorkingDirectory=/opt/cleave/app/backend
Environment="PATH=/home/ubuntu/miniconda3/envs/cleave/bin:/usr/local/bin:/usr/bin:/bin"
EnvironmentFile=/opt/cleave/app/backend/.env
ExecStart=/home/ubuntu/miniconda3/envs/cleave/bin/uvicorn main:app \
    --host 127.0.0.1 \
    --port 8000 \
    --workers 2 \
    --timeout-graceful-shutdown 10
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=cleave-api

[Install]
WantedBy=multi-user.target
```

Note: `--workers 2` (not 4) for 4 OCPUs.

### 12.2 cleave-worker.service

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
WorkingDirectory=/opt/cleave/app/backend
Environment="PATH=/home/ubuntu/miniconda3/envs/cleave/bin:/usr/local/bin:/usr/bin:/bin"
EnvironmentFile=/opt/cleave/app/backend/.env
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

### 12.3 Enable and start

```bash
sudo systemctl daemon-reload
sudo systemctl enable cleave-api cleave-worker
sudo systemctl start cleave-api
sudo systemctl start cleave-worker
```

---

## 13. Oracle Cloud Networking

The Oracle instance needs to allow inbound HTTP on port 80.

### 13.1 VCN Security List

In the Oracle Cloud Console:

1. Navigate to **Networking > Virtual Cloud Networks** > your VCN (`vcn-20240617-1645`)
2. Click the **subnet** your instance is attached to
3. Click the **Security List**
4. Add an **Ingress Rule**:
   - Source CIDR: `0.0.0.0/0`
   - IP Protocol: TCP
   - Destination Port Range: `80`
   - Description: "HTTP for Cleave (Cloudflare)"

### 13.2 Instance iptables

Ubuntu 22.04 on Oracle Cloud may have iptables rules blocking port 80. Check and open:

```bash
sudo iptables -L INPUT -n | grep 80
# If no rule exists, add one:
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT

# Persist the rule
sudo netfilter-persistent save
```

### 13.3 Verify from local machine

```bash
curl -v --connect-timeout 5 http://146.235.203.57/api/v1/health
# Should return: {"status":"ok"}
```

---

## 14. Cloudflare DNS

In the Cloudflare dashboard for `nazalibhai.com`:

1. Update the **A record** for `cleave`:
   - Old: `54.244.37.255` (EC2)
   - New: `146.235.203.57` (Oracle)
   - Keep **Proxied** (orange cloud)
2. SSL/TLS mode: **Flexible** (NGINX listens on port 80; Cloudflare handles HTTPS to users)

---

## 15. Seed Reference Project

### 15.1 Run the seed script

```bash
conda activate cleave
cd /opt/cleave/app/backend
python ../scripts/seed_reference_project.py
```

Note the **Project ID** and **Experiment ID** from the output.

### 15.2 Transfer reference data from EC2

```bash
# On Oracle — create target directory
mkdir -p /opt/cleave/projects/<PID>

# From EC2 or local machine (where dev-data/ or EC2 data lives)
scp -r ubuntu@<ec2-ip>:/data2/cleave/projects/<PID>/<EID> \
  ubuntu@146.235.203.57:/opt/cleave/projects/<PID>/
```

### 15.3 Promote superuser

```bash
conda activate cleave
cd /opt/cleave/app/backend
python ../scripts/promote_superuser.py --email <your-email>
```

---

## 16. Verification Checklist

### Infrastructure

```bash
sudo systemctl status cleave-api cleave-worker nginx postgresql

curl http://127.0.0.1:8000/api/v1/health    # Direct
curl http://localhost/api/v1/health          # Through NGINX
```

### Pipeline tools

```bash
export PATH=/home/ubuntu/miniconda3/envs/cleave/bin:/usr/local/bin:/usr/bin:/bin

bowtie2 --version | head -1
STAR --version
salmon --version
samtools --version | head -1
macs2 --version
fastqc --version
Rscript -e "library(DiffBind); library(DESeq2); cat('R OK\n')"
/opt/cleave/app/backend/pipelines/tools/kseq_test 2>&1 | head -1
```

### Genome indices

```bash
ls /opt/cleave/genomes/mm10/mm10.*.bt2 | wc -l          # 6
ls /opt/cleave/genomes/star/mm10/ | wc -l                # STAR index files
ls /opt/cleave/genomes/star/hg38/ | wc -l                # STAR index files
```

### Application (from browser)

1. Open `https://cleave.nazalibhai.com`
2. Landing page loads
3. Register a new account
4. Create a project, create an experiment
5. Upload a small test FASTQ — verify tus upload works
6. Reference project card visible on dashboard
7. Check Admin panel (after promoting superuser)

---

## 17. Operations & Maintenance

### Updating the application

```bash
cd /opt/cleave/app
git pull origin main

conda activate cleave
cd backend
pip install -e .
alembic upgrade head

cd ../frontend
npm install
npm run build

sudo systemctl restart cleave-api cleave-worker
```

### Viewing logs

```bash
sudo journalctl -u cleave-api -f --no-pager
sudo journalctl -u cleave-worker -f --no-pager
sudo tail -f /var/log/nginx/access.log
```

### Database backup

```bash
pg_dump -h localhost -U cleave cleave > /opt/cleave/backup_$(date +%Y%m%d).sql
```

### Disk monitoring (critical on 200 GB)

```bash
df -h /
du -sh /opt/cleave/projects/
du -sh /opt/cleave/uploads/
du -sh /opt/cleave/genomes/
```

---

## 18. Troubleshooting

### "kseq_test: exec format error"

The binary was compiled for the wrong architecture. Recompile:

```bash
cd /opt/cleave/app/backend/pipelines/tools
gcc -O2 kseq_test.c -lz -o kseq_test
chmod +x kseq_test
```

### STAR "OutOfMemoryError" or killed by OOM

STAR indices were not built with sparse mode. Rebuild with `--genomeSAsparseD 2` (see Step 8.3). Also verify `STAR_BAM_SORT_RAM=8000000000` is set in `.env`.

### Trimmomatic "OutOfMemoryError: Java heap space"

With `MAX_CONCURRENT_REACTIONS=2` and `TRIMMOMATIC_HEAP_SIZE=2g`, worst case is 4 GB JVM heap. If still OOM:

1. Reduce `MAX_CONCURRENT_REACTIONS` to `1`
2. Or reduce `TRIMMOMATIC_HEAP_SIZE` to `1g`

### SICER2 not available on aarch64

If SICER2 has no ARM package, users can still use MACS2 (narrow + broad) and SEACR for peak calling. The pipeline validates tool availability before job submission.

### Port 80 blocked despite security list

Oracle Cloud Ubuntu images include iptables rules. Open port 80:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo netfilter-persistent save
```

### "502 Bad Gateway" from NGINX

API is not running:

```bash
sudo systemctl status cleave-api
sudo journalctl -u cleave-api --since "5 min ago"
curl http://127.0.0.1:8000/api/v1/health
```

### Pipeline jobs very slow

Expected. With 4 OCPUs and `MAX_CONCURRENT_REACTIONS=2`, processing is ~4x slower than the 32-vCPU EC2. An 8-reaction CUT&RUN experiment takes ~2 hours for alignment (vs ~30 min on EC2).

---

## 19. Resource Tuning Reference

### Oracle vs EC2 configuration

| Setting | EC2 (32 vCPU, 128 GB) | Oracle (4 OCPU, 24 GB) |
|---------|----------------------|----------------------|
| `MAX_CONCURRENT_REACTIONS` | 8 | 2 |
| `MAX_CONCURRENT_RNASEQ_REACTIONS` | 2 | 1 |
| `TRIMMOMATIC_HEAP_SIZE` | 4g | 2g |
| `STAR_BAM_SORT_RAM` | 8000000000 | 8000000000 |
| `CLEANUP_ENABLED` | false | true |
| `CLEANUP_INTERVAL_HOURS` | 24 | 12 |
| `LOG_RETENTION_DAYS` | 30 | 14 |
| `TUS_STAGING_RETENTION_HOURS` | 48 | 24 |
| Uvicorn `--workers` | 4 | 2 |
| STAR index mode | Standard | Sparse (`--genomeSAsparseD 2`) |

### How concurrency math works

`get_threads()` returns `os.cpu_count()` (4 on Oracle). Thread allocation per pipeline:

```
concurrent_count = min(MAX_CONCURRENT_REACTIONS, len(reactions))  # min(2, N)
threads_per_reaction = max(2, total_threads // concurrent_count)  # max(2, 4//2) = 2
```

With 2 concurrent reactions on 4 cores: each reaction gets 2 threads. No oversubscription.

### Estimated processing times

| Stage | EC2 | Oracle | Factor |
|-------|-----|--------|--------|
| Trimming (8 pairs) | ~10 min | ~40 min | ~4x |
| Alignment (8 reactions) | ~30 min | ~2 hr | ~4x |
| Peak Calling (8 reactions) | ~15 min | ~1 hr | ~4x |
| STAR RNA-seq (per reaction) | ~15 min | ~1 hr | ~4x |
| DiffBind | ~5 min | ~15 min | ~3x |

### Disk space monitoring

With 100 GB available for pipeline output, monitor usage proactively:

```bash
# Quick check
df -h / | tail -1

# Per-project usage
du -sh /opt/cleave/projects/*/

# Trigger manual cleanup
curl -X POST http://127.0.0.1:8000/api/v1/admin/cleanup \
  -H "Authorization: Bearer <admin-token>"
```
