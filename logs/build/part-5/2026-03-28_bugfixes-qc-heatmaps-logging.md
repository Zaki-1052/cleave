# 2026-03-28 — Bugfixes, QC Heatmaps, Pipeline Logging

## What was done

### Bugfixes (carried over from late 3/27)
- **Fixed Bowtie2 missing read groups**: Added `--rg-id`, `--rg SM:`, `--rg LB:`, `--rg PL:ILLUMINA` to Bowtie2 command — Picard MarkDuplicates requires RG headers
- **HOMER PATH**: Added `$HOME/homer/bin` to PATH in `scripts/run-local.sh`
- **SEACR default**: Changed peak calling wizard default from MACS2 narrow → SEACR stringent
- **Access token TTL**: Bumped from 15 min → 30 min in `config.py`
- **SSE reconnection resilience**: Increased MAX_RETRIES from 3 → 10, added 3-second delay before reconnect attempts to survive hot-reloads

### QC Report Heatmaps
- Added TSS and Gene Body heatmap sections to `AlignmentQCReportPanel`
- New `HeatmapSection` and `HeatmapImage` components render PNGs inline via signed URLs
- Each image has a "Download PNG" button and collapsible "About" info panel
- New backend endpoint: `GET /jobs/{job_id}/outputs/{output_id}/signed-url` generates HMAC-signed download URLs
- New frontend API function: `getOutputSignedUrl()` in `api/jobs.ts`

### Peak Calling QC Enhancements
- Added top called peaks CSV download: backend endpoint `GET /jobs/{jid}/peak-qc-report/top-peaks-csv`, frontend `downloadTopPeaksCsv()`, download button on Top Called Peaks section
- Reordered QC panel: Top Called Peaks now renders above Peak Annotation Plots (matches CUTANA Cloud layout)
- Enhanced peak annotation chart tooltip to match CUTANA Cloud: shows Annotation, Percentage, Control Short Name, Peak Type, Peak Caller, Significance Threshold on hover
- Passed `metrics` prop from QC panel to `PeakAnnotationChart` for tooltip context lookup
- Fixed annotation stats parser: `int("9.0")` → `int(float("9.0"))` — HOMER outputs float counts, parser was silently skipping every line
- Added `append_to_master_log` calls for HOMER and blacklist subtraction subprocess calls in peak_calling.py (were missing from master log)
- Compiled HOMER C++ binaries for ARM Mac (`~/homer/cpp/make` with `unset CPATH` to fix `<cmath>` header conflict)

### Pipeline Master Logs
- Added `append_to_master_log()` helper to `pipelines/base.py` — writes timestamped sections
- Extended `run_cmd` and `run_piped_cmd` with optional `master_log` parameter
- Alignment pipeline: creates `logs/alignment.log` with all subprocess output consolidated
- Peak calling pipeline: creates `logs/peak_calling.log`, consolidates individual tool logs at end
- Both master logs registered as downloadable job outputs

## Key file paths
- `backend/pipelines/base.py` — `append_to_master_log`, `run_cmd`/`run_piped_cmd` master_log param
- `backend/pipelines/alignment.py` — read groups, master log wiring, `_run`/`_run_piped` wrappers
- `backend/pipelines/peak_calling.py` — master log wiring, log consolidation, HOMER/blacklist logging
- `backend/services/qc_report_service.py` — annotation stats float parse fix, top peaks CSV service
- `frontend/src/components/peak-calling/PeakAnnotationChart.tsx` — enhanced tooltip with metrics context
- `frontend/src/components/peak-calling/PeakCallingQCReportPanel.tsx` — top peaks download button
- `backend/routers/jobs.py` — `signed-url` endpoint for job outputs
- `backend/config.py` — access token TTL 30 min
- `frontend/src/components/alignment/AlignmentQCReportPanel.tsx` — heatmap sections
- `frontend/src/hooks/useSSE.ts` — retry/delay improvements
- `scripts/run-local.sh` — HOMER PATH
