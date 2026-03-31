# Phase 4.1: Peak Calling Pipeline Module — Implementation Plan

## Context

Phase 3 (alignment pipeline) is complete with 213 tests. The peak calling pipeline module takes alignment BAMs as input and calls peaks using MACS2, SICER2, or SEACR. This is the backend pipeline module only — the wizard UI (4.2), QC report endpoints (4.3), and sub-tabs (4.4) are separate subsequent steps.

**Lab reference compliance**: All MACS2/SEACR flags verified against `references/data_workdir/aligned.aug10/integrated.step2.sh`. The bioinformatics logic matches the lab scripts exactly (per CLAUDE.md mandatory reference compliance).

---

## Files to Create/Modify

| File | Action | Lines est. |
|------|--------|-----------|
| `backend/pipelines/peak_calling.py` | **Create** | ~900 |
| `backend/pipelines/__init__.py` | **Modify** | +2 lines |
| `backend/pipelines/methods_text.py` | **Modify** | +40 lines |
| `backend/schemas/qc_report.py` | **Modify** | +40 lines |
| `backend/tests/test_peak_calling_pipeline.py` | **Create** | ~450 |

---

## Step 1: Create `backend/pipelines/peak_calling.py`

### Constants

```python
MACS2_GENOME_SIZES = {"mm10": "mm", "hg38": "hs", "hg19": "hs", "dm6": "dm", "sacCer3": "12157105"}
PEAK_CALLERS = {"MACS2", "SICER2", "SEACR"}
PEAK_SIZES = {"MACS2": {"narrow", "broad"}, "SICER2": {"broad"}, "SEACR": {"stringent", "relaxed"}}
DEFAULT_Q_VALUE = 0.01        # Lab standard (NOT 0.05 CUTANA Cloud)
DEFAULT_BROAD_CUTOFF = 0.1    # From integrated.step2.sh line 119
DEFAULT_SEACR_THRESHOLD = 0.01  # From integrated.step2.sh line 129
DEFAULT_FRAGMENT_SIZE = 120   # From filter_below.awk
```

Paths: `_TOOLS_DIR`, `_CHROM_SIZES_DIR`, `_BLACKLISTS_DIR`, `_CUTANA_DATA_DIR` — same pattern as alignment.py.

### Helper Functions

Duplicate from alignment.py (each module is self-contained, matching existing trimming/alignment pattern):
- `_run_cmd(cmd, log_path, timeout, check)` — same as alignment.py:82-96 but logger name `"peak_calling.subprocess"`
- `_run_piped_cmd(cmd1, cmd2, output_path, log_path, timeout)` — same as alignment.py:99-132
- `_count_bam_reads(bam_path)` — `samtools view -c`
- `_get_threads()` — `os.cpu_count() or 4`
- `_resolve_blacklist(genome)` — lookup in `_BLACKLISTS_DIR`
- `_resolve_chrom_sizes(genome)` — **new**, lookup in `_CHROM_SIZES_DIR`

New helpers:
- `_run_triple_pipe(cmd1, cmd2, cmd3, output_path, timeout)` — for the 3-command fragment filter pipe (`samtools view -h | awk -f filter_below.awk | samtools view -Sb -`). Uses raw Popen since `_run_piped_cmd` only handles 2 commands.
- `_count_peaks(peak_file)` — count non-comment lines in BED/narrowPeak
- `_extract_top_peaks(peak_file, n=10)` — sort by score column, return top N as `"chr:start-end"` strings
- `_calculate_frip(bam_path, peak_bed)` — `bedtools intersect -abam bam -b peaks -u | samtools view -c` / `samtools view -c bam`
- `_write_peak_qc_csv(metrics_list, output_path)` — csv.DictWriter with `_PEAK_QC_CSV_HEADERS`, comma-separated (matching alignment CSV pattern)
- `_write_top_peaks_csv(top_peaks_list, output_path)` — csv.DictWriter with `_TOP_PEAKS_CSV_HEADERS`
- `_load_canned_peak_qc()` — loads from `cutana/H3K4me3/peak_caller_metrics.csv` (tab-separated: `delimiter='\t'`)
- `_load_canned_top_peaks()` — loads from `cutana/H3K4me3/top_called_peaks.csv` (tab-separated)

### QC CSV Headers (Matching CUTANA Cloud Format)

```python
_PEAK_QC_CSV_HEADERS = [
    "Short_Name", "Control_Short_Name", "Reference_Genome",
    "Peak_Caller", "Peak_Size", "Significance_Threshold",
    "Uniquely_Aligned_Read_Pairs", "Called_Peaks", "Reads_in_Peaks", "FRiP",
]
_TOP_PEAKS_CSV_HEADERS = [
    "Short_Name", "Control_Short_Name", "Reference_Genome",
    "Peak_Caller", "Peak_Size", "Significance_Threshold",
    "Top Peak", "2' Peak", "3' Peak", "4' Peak", "5' Peak",
    "6' Peak", "7' Peak", "8' Peak", "9' Peak", "10' Peak",
]
```

### `PeakCallingStage.validate(params)`

Required params:
- `experiment_id`, `project_id`, `parent_job_id` (alignment job)
- `reference_genome` — must be in `MACS2_GENOME_SIZES`
- `peak_caller` — must be in `PEAK_CALLERS`
- `peak_size` — must be valid for the chosen peak_caller (checked against `PEAK_SIZES`)
- `reactions[]` — non-empty, each with: `reaction_id`, `short_name` (alphanumeric + `_-. ` regex, defense-in-depth against path traversal), `bam_path`

In real mode: verify tools in PATH (`samtools`, `bedtools`, `macs2`; plus `sicer` for SICER2, `Rscript` for SEACR, `annotatePeaks.pl` for HOMER).

### `PeakCallingStage.run()` — Real Pipeline Steps

**Output directory structure under job_dir:**
```
job_dir/
  filtered_bams/     # Fragment-filtered BAMs (if filter ON)
  peaks/             # Peak files + summits per reaction
  annotation/        # HOMER output per reaction
  qc/                # peak_caller_metrics.csv, top_called_peaks.csv
  logs/              # Per-reaction tool logs
```

**Per-reaction loop** (reactions from params):

#### Step 1: Locate input BAM
- `input_bam = Path(settings.STORAGE_ROOT) / rxn["bam_path"]`
- Raise PipelineError if not found

#### Step 2: Fragment size filter (<120bp) — if `fragment_filter=True` (default ON)
Exact match to lab reference `integrated.step2.sh` lines 81-82:
```bash
samtools view -h input.bam | LC_ALL=C awk -f filter_below.awk | samtools view -Sb - > filtered.bam
samtools index filtered.bam
```
- Use `_run_triple_pipe()` helper (3-command pipe via raw Popen)
- When `fragment_size == 120`: use `-f filter_below.awk` from `_TOOLS_DIR`
- When `fragment_size != 120`: inline the awk script with custom SIZE (since `filter_below.awk` hardcodes `SIZE=120` in its BEGIN block and awk `-v` can't override a BEGIN assignment)
- **IgG caching**: IgG control BAM may be shared across reactions; filter once, cache in a dict keyed by `igg_bam_path` within `run()`
- Output: `filtered_bams/{short_name}_filtered.bam`

#### Step 3: Resolve IgG control BAM
- `control_bam = Path(settings.STORAGE_ROOT) / rxn["igg_bam_path"]` if present
- If fragment_filter is ON and IgG not yet filtered, filter and cache it
- IgG is passed as MACS2 `-c` flag (not in lab scripts, but in CUTANA Cloud and PLAN.md spec)

#### Step 4: Peak calling — dispatch by caller

**4a. MACS2 Narrow** (exact flags from `integrated.step2.sh` line 115):
```bash
macs2 callpeak -t {bam} [-c {igg_bam}] -g {mm|hs|dm|12157105} -f BAMPE \
  -n {short_name} --outdir {peaks_dir} -q 0.01 -B --SPMR --keep-dup all
```
Output: `{name}_peaks.narrowPeak`, `{name}_summits.bed`, `{name}_treat_pileup.bdg`, `{name}_peaks.xls`

**4b. MACS2 Broad** (exact flags from `integrated.step2.sh` line 119):
```bash
macs2 callpeak -t {bam} [-c {igg_bam}] -g {genome} -f BAMPE \
  -n {short_name} --outdir {peaks_dir} --broad --broad-cutoff 0.1 -B --SPMR --keep-dup all
```
Output: `{name}_peaks.broadPeak`
Then summit extraction (exact from lab line 121):
```bash
python get_summits_broadPeak.py {broadPeak} | bedtools sort -i - > {summits.bed}
```

**4c. SEACR** (exact chain from `integrated.step2.sh` lines 125-146):
```bash
# C1: MACS2 bedgraph (NO --SPMR, per lab line 125)
macs2 callpeak -t {bam} [-c {igg_bam}] -g {genome} -f BAMPE \
  -n {name}_seacr --outdir {peaks_dir} -q 0.01 -B --keep-dup all

# C2: Float → integer (lab line 127)
python change.bdg.py {name}_seacr_treat_pileup.bdg > {name}_treat_integer.bdg

# C3: SEACR stringent or relaxed (lab lines 129, 141)
bash SEACR_1.1.sh {name}_treat_integer.bdg 0.01 non {stringent|relaxed} {output_prefix} {Rscriptbin}

# C4: Sort peaks (bedtools sort instead of sort-bed, equivalent)
bedtools sort -i {peaks.bed} > {peaks.sort.bed}

# C5: Summit extraction (lab lines 133, 145)
python get_summits_seacr.py {peaks.bed} | bedtools sort -i - > {summits.bed}

# C6: Clean up MACS2 intermediates (lab lines 135-138)
```
**Critical**: SEACR_1.1.sh creates temp files in CWD. Run with `cwd=peaks_dir` in `subprocess.run()`.
**Critical**: No `--SPMR` on the MACS2 bedgraph step for SEACR (per lab; SEACR needs raw counts).

**4d. SICER2** (no lab reference; standard CLI):
```bash
sicer -t {bam} [-c {igg_bam}] -s {genome} -w 200 -g 600 \
  --false_discovery_rate 0.01 -o {peaks_dir}
```
Output: glob for `*-island.bed`, rename to `{short_name}_peaks.sicer2.bed`
Summit extraction via `get_summits_broadPeak.py` (midpoint of each peak).

#### Step 5: Blacklist subtraction (post-peak-calling)
```bash
bedtools subtract -a {peaks.bed} -b {blacklist.bed} > {peaks_clean.bed}
```
Reference: `references/data_workdir/blklist_subtract/subtract_blacklist.sh`.
Only if blacklist file exists for this genome.

#### Step 6: FRiP calculation
```python
reads_in_peaks = bedtools intersect -abam {call_bam} -b {peak_file} -u | samtools view -c
total_reads = samtools view -c {call_bam}
frip = reads_in_peaks / total_reads
```
Implemented via `_calculate_frip()` helper using Popen pipe.

#### Step 7: HOMER peak annotation
```bash
annotatePeaks.pl {peak_file} {genome} -annStats {stats_file} > {annotation.txt}
```
HOMER captures stdout as the annotation table. The `-annStats` flag produces a separate summary file with per-feature-category counts (needed for the stacked bar chart in Phase 4.3).
**Non-fatal**: if HOMER fails, log warning and continue (core peak calling + FRiP already done).

#### Step 8: Aggregate metrics
Count peaks (`_count_peaks()`), extract top 10 (`_extract_top_peaks()`), store in `all_metrics` and `all_top_peaks` lists.

#### Step 9: Register outputs
Same pattern as alignment — append dicts with `file_category`, `filename`, `file_path` (relative to STORAGE_ROOT), `file_type`, `file_size_bytes`, `reaction_id`.

**File categories**: `"bed"` (peaks, summits), `"annotation"` (HOMER output), `"annotation_stats"`, `"filtered_bam"`, `"qc_report"` (CSVs), `"log"`.

#### Post-loop: Write QC CSVs
- `peak_caller_metrics.csv` — per-reaction metrics (file_category: `"qc_report"`, reaction_id: None)
- `top_called_peaks.csv` — per-reaction top 10 peaks (file_category: `"qc_report"`, reaction_id: None)

Return dict: `{"job_id", "status": "complete", "outputs", "methods_text", "qc_metrics"}`

### `PeakCallingStage.mock_run()`

Follows alignment mock_run pattern (alignment.py:924-1093):
1. `time.sleep(5)` — simulate processing
2. Create directory structure under job_dir
3. Load canned data from `cutana/H3K4me3/peak_caller_metrics.csv` (tab-separated) and `top_called_peaks.csv`
4. Per-reaction: create stub files on disk (valid BED content for peaks/summits, stub annotation, stub log)
5. Write QC CSVs (comma-separated, matching alignment CSV convention)
6. Return outputs list + methods_text + qc_metrics

Stub peak files contain valid 3-line BED (narrowPeak or broadPeak format depending on caller). Summit stubs are 3-column BED. This ensures file browser, downloads, and IGV (Phase 5) work locally.

### Expected `params` Contract

```python
{
    "experiment_id": int,
    "project_id": int,
    "parent_job_id": int,           # Alignment job ID
    "reference_genome": str,        # "mm10", "hg38", etc.
    "peak_caller": str,             # "MACS2", "SICER2", "SEACR"
    "peak_size": str,               # "narrow", "broad", "stringent", "relaxed"
    "q_value": float,               # Default 0.01
    "broad_cutoff": float,          # Default 0.1
    "fragment_filter": bool,        # Default True
    "fragment_size": int,           # Default 120
    "seacr_threshold": float,       # Default 0.01
    "sicer2_window": int,           # Default 200
    "sicer2_gap": int,              # Default 600
    "sicer2_fdr": float,            # Default 0.01
    "reactions": [
        {
            "reaction_id": int,
            "short_name": str,
            "bam_path": str,                # Relative to STORAGE_ROOT (from parent alignment job)
            "igg_bam_path": str | None,     # IgG BAM path (relative)
            "igg_short_name": str | None,   # For QC CSV "Control Short Name" column
        }
    ],
}
```

---

## Step 2: Register in `backend/pipelines/__init__.py`

Add import and entry:
```python
from pipelines.peak_calling import PeakCallingStage

_STAGES: dict[str, PipelineStage] = {
    "trimming": TrimmingStage(),
    "alignment": AlignmentStage(),
    "peak_calling": PeakCallingStage(),   # <-- add
}
```

---

## Step 3: Add `peak_calling_methods()` to `backend/pipelines/methods_text.py`

New function alongside existing `alignment_methods()`. Generates manuscript-ready text incorporating:
- Peak caller name + version
- Significance threshold (q-value / broad-cutoff / SEACR threshold / SICER2 FDR)
- Fragment filter mention (if enabled, with size)
- FRiP calculation method (BEDTools + SAMtools)
- HOMER annotation (version)
- Reference genome

Template follows CUTANA Cloud's methods.txt format:
```
Peaks were called on the {genome_display} reference genome using the Cleave Peak Calling Pipeline.
[BAM files were filtered to retain only sub-nucleosomal fragments (< {size}bp) prior to peak calling.]
BED files were produced by {MACS2|SEACR|SICER2} (version X) with {caller-specific params}.
FRiP scores were calculated by dividing the number of reads in peaks (BEDTools) by the total reads (SAMtools).
Peak annotation was performed by HOMER.
```

---

## Step 4: Add QC schemas to `backend/schemas/qc_report.py`

Following the existing `AlignmentReactionMetrics` / `AlignmentQCReport` pattern:

```python
class PeakCallingReactionMetrics(CamelModel):
    """Maps to cutana/H3K4me3/peak_caller_metrics.csv columns."""
    short_name: str
    control_short_name: str
    reference_genome: str
    peak_caller: str
    peak_size: str
    significance_threshold: float
    uniquely_aligned_read_pairs: int
    called_peaks: int
    reads_in_peaks: int
    frip: float

class TopCalledPeak(CamelModel):
    short_name: str
    control_short_name: str
    reference_genome: str
    peak_caller: str
    peak_size: str
    significance_threshold: float
    top_peaks: list[str]  # ["chr15:32920284-32924319", ...]

class PeakCallingQCReport(CamelModel):
    reference_genome: str
    peak_caller: str
    peak_size: str
    metrics: list[PeakCallingReactionMetrics]
    top_peaks: list[TopCalledPeak] | None = None
```

---

## Step 5: Create `backend/tests/test_peak_calling_pipeline.py`

Following `test_alignment_pipeline.py` pattern exactly (~40 tests):

**Validation tests** (~15):
- Valid params pass, missing required fields caught, unsupported genome/caller/size rejected
- Invalid peak_size for caller (e.g., "narrow" for SEACR, "stringent" for MACS2)
- Empty reactions, missing reaction fields, path-traversal short_names rejected
- All 5 valid caller+size combos pass

**Mock run tests** (~10):
- Creates directory structure (peaks/, annotation/, qc/, logs/)
- Per-reaction files exist (peak BED, summits, annotation, log)
- QC CSVs written with correct headers (match `_PEAK_QC_CSV_HEADERS`)
- Output categories match expected set: `{"bed", "annotation", "annotation_stats", "log", "qc_report"}`
- Reaction IDs assigned to per-reaction outputs, None for job-level CSVs
- Stub peak files are non-empty valid BED
- SEACR params test, SICER2 params test

**Methods text tests** (~6):
- Includes genome, includes caller name
- MACS2 narrow mentions q-value, MACS2 broad mentions broad-cutoff
- SEACR mentions threshold, SICER2 mentions FDR
- Fragment filter mentioned when enabled, absent when disabled

**Helper function tests** (~5):
- `_count_peaks` counts lines correctly, skips comments/track headers
- `_extract_top_peaks` returns chr:start-end format, correct count

**Schema tests** (~3):
- `PeakCallingQCReport` validates correctly
- camelCase serialization works
- `PeakCallingReactionMetrics` all fields present

---

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| MACS2 default q-value | 0.01 | Lab standard per CLAUDE.md (not CUTANA's 0.05) |
| Input BAM source | `rxn["bam_path"]` relative to STORAGE_ROOT | Frontend wizard (4.2) resolves from parent alignment outputs |
| IgG control | `rxn["igg_bam_path"]` per-reaction | Matches CUTANA Cloud model (IgG assigned per reaction) |
| MACS2 -c flag for IgG | Yes, when IgG assigned | Not in lab scripts but in CUTANA Cloud and PLAN.md spec |
| SEACR bdg: no --SPMR | Correct | Lab line 125 omits --SPMR; SEACR needs raw counts |
| sort-bed replacement | `bedtools sort` | Already a dependency; avoids adding BEDOPS |
| HOMER failure | Non-fatal warning | Core peak calling + FRiP complete even if HOMER misconfigured |
| IgG fragment filter | Cache filtered IgG across reactions | Multiple reactions may share same IgG; filter once |
| Tab vs comma CSV | Comma for our CSVs, tab when loading CUTANA canned data | Consistency with alignment module's comma CSV pattern |
| Helper function duplication | Copy _run_cmd etc. from alignment.py | Matches existing pattern (trimming.py also self-contained) |
| Blacklist subtraction | Included | Lab does it post-peak-calling; reference data already in repo |

---

## Implementation Order

1. Constants, helpers, `validate()`, `mock_run()`, `generate_methods_text()` — enables frontend dev (4.2) to proceed
2. Schemas in `qc_report.py`
3. Registration in `__init__.py`
4. Test file — validation + mock + methods + helper + schema tests
5. `run()` method — MACS2 narrow first, then broad, then SEACR, then SICER2 (incremental)
6. Run `ruff format` + `ruff check` + `docker compose exec api pytest tests/test_peak_calling_pipeline.py`

---

## Verification

```bash
# Run tests
docker compose exec api pytest tests/test_peak_calling_pipeline.py -v

# Lint
docker compose exec api ruff check .
docker compose exec api ruff format --check .

# Type check frontend (if schemas changed)
cd frontend && npx tsc --noEmit

# Mock mode integration test: create a peak calling job via API
# and verify the worker processes it (status queued → complete, stub files created)
```

---

## Critical Reference Files

- `backend/pipelines/alignment.py` — primary pattern reference (1096 lines)
- `references/data_workdir/aligned.aug10/integrated.step2.sh` — lab peak calling script (MANDATORY compliance)
- `backend/pipelines/tools/filter_below.awk` — fragment size filter
- `backend/pipelines/tools/{change.bdg.py, SEACR_1.1.sh, SEACR_1.1.R}` — SEACR toolchain
- `backend/pipelines/tools/{get_summits_seacr.py, get_summits_broadPeak.py}` — summit extraction
- `cutana/H3K4me3/peak_caller_metrics.csv` — canned QC data (tab-separated, 5 reactions)
- `cutana/H3K4me3/top_called_peaks.csv` — canned top peaks (tab-separated)
