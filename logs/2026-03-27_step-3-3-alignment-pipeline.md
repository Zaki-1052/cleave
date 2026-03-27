# 2026-03-27 — Step 3.3: Alignment Pipeline Module

## What was done

- Built `AlignmentStage(PipelineStage)` — the core alignment pipeline module
- Implemented full 13-step real-mode pipeline per reaction: Bowtie2 → SAM→BAM → filter/multi-mapper removal (-f 3 -F 4 -F 8 -q 10) → DAC exclusion list → Picard SortSam → MarkDuplicates → dup removal → index → 2x bigWig (20bp + 100bp) → TSS heatmap → gene body heatmap → E. coli spike-in alignment
- Mock mode creates real stub files on disk (empty BAMs/bigWigs, 1x1 PNGs, canned QC CSV from CUTANA export) so file browser/IGV/downloads work locally
- Created `AlignmentQCReport` Pydantic schema matching exact CUTANA Cloud CSV columns
- Created `methods_text.py` with correct per-genome `EFFECTIVE_GENOME_SIZES` (fixes lab's create_bams.sh bug)
- Registered `AlignmentStage` in pipeline dispatcher
- Wrote 27 tests covering validation, mock file creation, output categories, QC CSV format, bowtie2/picard log parsing, methods text, and schema serialization
- Fixed existing `test_worker_generic_output_persistence` to provide valid alignment params

## Decisions made

- Combined lab's `-f 3 -F 4 -F 8` (properly paired filter) with CUTANA's `-q 10` (MAPQ filter) in a single samtools call
- All tool flags match lab reference scripts exactly (verified against integrated.sh, integrated.step2.sh, create_bams.sh)
- Fragment filter (<120bp via filter_below.awk) deferred to Phase 4 (peak calling) — not part of alignment
- Picard invoked via conda wrapper (`shutil.which("picard")`) rather than `java -jar`
- E. coli spike-in uses piped bowtie2→samtools (Harvard pattern) to avoid intermediate SAM

## Open items

- SNAP-CUTANA K-MetStat spike-in QC (barcode grep on FASTQs) — noted in PLAN.md §3.3 but deferred; all 32 barcodes available in `references/media_misc/k_metstat_script.sh`
- Real-mode testing on EC2 with actual FASTQs pending
- QC report API endpoint (`GET /api/v1/jobs/:jid/qc-report`) not yet wired — covered in step 3.5

## Key file paths

- `backend/pipelines/alignment.py` — main pipeline module (created)
- `backend/pipelines/methods_text.py` — methods text generator (created)
- `backend/schemas/qc_report.py` — QC report Pydantic schema (created)
- `backend/pipelines/__init__.py` — dispatcher registration (modified)
- `backend/tests/test_alignment_pipeline.py` — 27 tests (created)
- `backend/tests/test_worker.py` — fixed FK constraint in alignment test (modified)

## Test results

196 passed, 0 failed (27 new alignment tests + 169 existing)
