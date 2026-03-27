#!/usr/bin/env bash
# scripts/run-local.sh — Run the API locally with real pipeline tools (not in Docker).
# Requires: conda env 'cleave-pipeline', Postgres running (docker compose up db -d).
#
# Usage:
#   ./scripts/run-local.sh          # real pipeline mode (default)
#   ./scripts/run-local.sh mock     # mock pipeline mode
#   ./scripts/run-local.sh worker   # run the worker process instead of the API

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONDA_ENV="cleave-pipeline"
MODE="${1:-real}"

# ── Verify conda env ──────────────────────────────────────────────────────────
if ! conda info --envs 2>/dev/null | grep -q "$CONDA_ENV"; then
  echo "ERROR: conda env '$CONDA_ENV' not found. Create it first."
  exit 1
fi

# ── Verify Postgres is reachable ──────────────────────────────────────────────
if ! pg_isready -h localhost -p 5432 -q 2>/dev/null; then
  echo "Postgres not running. Starting db container..."
  docker compose -f "$PROJECT_ROOT/docker-compose.yml" up db -d
  echo "Waiting for Postgres..."
  until pg_isready -h localhost -p 5432 -q 2>/dev/null; do sleep 1; done
  echo "Postgres ready."
fi

# ── Activate conda ────────────────────────────────────────────────────────────
eval "$(conda shell.bash hook)"
conda activate "$CONDA_ENV"

# ── Set environment variables ─────────────────────────────────────────────────
export DATABASE_URL="postgresql+asyncpg://cleave:dev@localhost:5432/cleave"
export TEST_DATABASE_URL="postgresql+asyncpg://cleave:dev@localhost:5432/cleave_test"
export SECRET_KEY="cleave-dev-secret-key-not-for-production-use"
export REFRESH_SECRET_KEY="cleave-dev-refresh-key-not-for-production"
export STORAGE_ROOT="$PROJECT_ROOT/dev-data"
export GENOME_INDEX_DIR="$HOME/Documents/BIO_LAB/genomes"
export CORS_ORIGINS="http://localhost:5173"
export COOKIE_SECURE="false"

if [ "$MODE" = "mock" ]; then
  export PIPELINE_MODE="mock"
  echo "Pipeline mode: MOCK"
elif [ "$MODE" = "worker" ]; then
  export PIPELINE_MODE="real"
  echo "Starting WORKER (real pipeline mode)..."
  cd "$PROJECT_ROOT/backend"
  exec python worker.py
else
  export PIPELINE_MODE="real"
  echo "Pipeline mode: REAL"
fi

# ── Verify key tools are on PATH ──────────────────────────────────────────────
if [ "$PIPELINE_MODE" = "real" ]; then
  MISSING=""
  for tool in fastqc bowtie2 samtools bedtools picard trimmomatic; do
    if ! command -v "$tool" &>/dev/null; then
      MISSING="$MISSING $tool"
    fi
  done
  if [ -n "$MISSING" ]; then
    echo "WARNING: Missing tools in conda env:$MISSING"
    echo "Some pipeline stages will fail. Install them or use './scripts/run-local.sh mock'"
  else
    echo "All pipeline tools found in conda env."
  fi
fi

# ── Run migrations and start API ──────────────────────────────────────────────
cd "$PROJECT_ROOT/backend"
echo "Running migrations..."
alembic upgrade head

if [ "$MODE" != "worker" ]; then
  echo ""
  echo "Starting API at http://localhost:8000"
  echo "  API docs:  http://localhost:8000/docs"
  echo "  Frontend:  http://localhost:5173 (run 'cd frontend && npm run dev' separately)"
  echo ""
  exec uvicorn main:app --reload --host 0.0.0.0 --port 8000
fi
