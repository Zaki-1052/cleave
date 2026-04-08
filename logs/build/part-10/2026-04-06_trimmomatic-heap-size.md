# 2026-04-06 — Trimmomatic JVM Heap Size Fix

## What Happened

Lab member Jai hit `java.lang.OutOfMemoryError: Java heap space` during trimming on the EC2 instance (m5.8xlarge, 128GB RAM). Root cause: with `MAX_CONCURRENT_REACTIONS=8`, up to 8 Trimmomatic JVMs spawn concurrently, each with a default max heap of ~25% physical RAM (~32GB). 8 × 32GB = 256GB exceeds 128GB, especially with other processes (Jai's manual pipeline, Postgres, OS) sharing the instance.

## What Was Done

Added `TRIMMOMATIC_HEAP_SIZE` config setting (default `4g`) that caps each JVM's heap explicitly:

- **`backend/config.py`**: New `TRIMMOMATIC_HEAP_SIZE: str = "4g"` setting
- **`backend/pipelines/trimming.py`**: `_resolve_trimmomatic_cmd()` injects `-Xmx{heap}` into `java -jar` commands; sets `_JAVA_OPTIONS` env var for wrapper scripts
- **`.env.example`**: Added with explanation
- **`docs/DEPLOYMENT_GUIDE.md`**: Added to .env template, key settings, env var table, and new troubleshooting section
- **`docs/SPEC.md`**: Added to Worker & Pipeline config table
- **`CLAUDE.md`**: Updated Trimmomatic gotcha

## Decisions

- 4GB per JVM: worst case 8 × 4GB = 32GB, leaves ~96GB for everything else on the 128GB instance
- Configurable via env var for flexibility on different instance types
- Wrapper scripts get heap via `_JAVA_OPTIONS` env var (JVM reads this regardless of launch method)

## Key File Paths

- `backend/config.py`
- `backend/pipelines/trimming.py`
- `.env.example`
- `docs/DEPLOYMENT_GUIDE.md`
- `docs/SPEC.md`
- `CLAUDE.md`
