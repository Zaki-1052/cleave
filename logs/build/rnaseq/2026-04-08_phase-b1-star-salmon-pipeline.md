# Phase B.1 — STAR + Salmon + BigWig Pipeline Stage

**Date**: 2026-04-08

## What Was Done

Implemented the core RNA-seq alignment pipeline stage: STAR splice-aware alignment, Salmon pseudo-alignment quantification, and deepTools BigWig generation — all in a single `rnaseq_alignment` job type.

### Files Created

- **`backend/pipelines/rnaseq_alignment.py`** (~890 lines) — Full pipeline module:
  - `RNASEQ_GENOME_CONFIG` — modular genome index/annotation mapping
  - `_parse_star_log()` — STAR `Log.final.out` parser (9 metrics extracted)
  - `_parse_salmon_meta()` — Salmon `aux_info/meta_info.json` parser (3 metrics)
  - `_write_rnaseq_qc_csv()` — 12-column QC CSV writer
  - `_RnaseqAlignmentContext` — frozen dataclass for thread-safe concurrency
  - `_process_reaction()` — 7-step per-reaction pipeline (STAR, samtools index, optional dedup, Salmon quant, bamCoverage ×2, QC parse)
  - `RnaseqAlignmentStage(PipelineStage)` — validate, run, mock_run, generate_methods_text
  - Tool resolution helpers (`_resolve_star_bin`, `_resolve_salmon_bin`, `_resolve_star_index`, `_resolve_salmon_index`)
  - ThreadPoolExecutor concurrency with partial failure + TerminatedError support
  - Mock mode creates realistic stub files (STAR Log.final.out, Salmon meta_info.json, quant.sf, BAMs, BigWigs)

### Files Modified

- **`backend/config.py`** — Added `MAX_CONCURRENT_RNASEQ_REACTIONS = 2` (STAR uses ~30GB RAM per instance)
- **`backend/pipelines/__init__.py`** — Registered `"rnaseq_alignment": RnaseqAlignmentStage()` in stage dispatcher
- **`backend/pipelines/methods_text.py`** — Added `RNASEQ_ANNOTATION_VERSIONS` dict and `rnaseq_alignment_methods()` function

## Reference Script Compliance

All bioinformatics flags verified against the actual lab scripts:

| Tool | Reference Script | Flags Matched | Improvements |
|------|-----------------|---------------|--------------|
| STAR | `mouse/align_reads.sh` | `--runThreadN`, `--genomeDir`, `--readFilesIn`, `--outSAMtype BAM SortedByCoordinate`, `--quantMode TranscriptomeSAM`, `--outFileNamePrefix` | Added `--readFilesCommand zcat` (reference manually gunzips) |
| Salmon | `mouse/salmon_quant2.sh` | `-i`, `--libType A`, `-1`, `-2`, `-p`, `--gcBias`, `--validateMappings`, `-o` | Exact match |
| bamCoverage | `mouse/create_bw.sh` | `-b`, `-o` | Added `--binSize`, `--normalizeUsing RPKM`, `--effectiveGenomeSize` |
| `--sjdbOverhang` | Only in `create_index.sh` | Correctly omitted at alignment time | — |

Reference bugs avoided: `salmon_quant.sh` typo (`*_R1.fast.gz`), `create_bw.sh` echo syntax (`{$file}`), hardcoded sample names.

## Decisions Made

- **Duplicate removal default OFF** for RNA-seq (controversial; optional advanced setting)
- **Salmon runs on FASTQs** directly (not STAR's transcriptomic BAM), matching `salmon_quant2.sh`
- **Output categories `bigwig`/`smoothed_bigwig`** reuse existing CUT&RUN names for IGV/Pearson/heatmap compatibility
- **`MAX_CONCURRENT_RNASEQ_REACTIONS = 2`** conservative default due to STAR's ~30GB RAM footprint
- **STAR output prefix** follows reference convention: `{short_name}Aligned.sortedByCoord.out.bam`

## Genome Version Configuration

Annotation versions are tagged with `TODO(genome-versions)` across two files. To update:

```bash
grep -r 'TODO(genome-versions)' backend/pipelines/
```

**Two files to change when updating genome annotations:**

1. **`backend/pipelines/rnaseq_alignment.py`** lines 43-68 — `RNASEQ_GENOME_CONFIG`
   - `gtf_filename`: the GTF file used when building STAR/Salmon indices
   - `star_index_subdir` / `salmon_index_subdir`: directory names under `STAR_INDEX_DIR` / `SALMON_INDEX_DIR`

2. **`backend/pipelines/methods_text.py`** lines 26-32 — `RNASEQ_ANNOTATION_VERSIONS`
   - Human-readable version strings that appear in auto-generated methods text (e.g., "GENCODE vM10")

**Also need to rebuild indices on EC2** when changing versions — see `docs/RNASEQ-PLAN.md` "EC2 Setup" section for `STAR --runMode genomeGenerate` and `salmon index` commands.

**Index root directories** are in `backend/config.py`:
- `STAR_INDEX_DIR` (default `/data/cleave/genomes/star`)
- `SALMON_INDEX_DIR` (default `/data/cleave/genomes/salmon`)
- `GENCODE_GTF_DIR` (default `/data/cleave/genomes/gtf`)

## Verification

- `ruff check` + `ruff format --check` — all clean
- Docker import test — config, stage registration, validation, methods text all verified
- 27 existing pipeline tests — all pass (test_rnaseq_trimming, test_worker, test_pipeline_base)

## Open Items

- B.2: RNA-seq QC report endpoint + Pydantic schema (backend API)
- B.3: Frontend alignment wizard + tab + QC report panel
- B.4: Auto-pipeline RNA-seq chain (fastp → STAR+Salmon)
- B.5: Tests for rnaseq_alignment pipeline
- Genome annotation versions: awaiting PI input on whether to stay on gencode.vM10/v29 or update
