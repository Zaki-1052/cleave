# Plan: Step 3.3 — Alignment Pipeline Module

## Context

Phases 1-2 are complete and steps 3.1 (worker/job queue) and 3.2 (SSE) are done. The worker polls `analysis_jobs`, dispatches to pipeline modules via `pipelines/__init__.py`, handles output persistence via `persist_job_outputs()`, and pushes live status via SSE. The `TrimmingStage` in `pipelines/trimming.py` is the reference pattern for new pipeline modules.

Step 3.3 builds `backend/pipelines/alignment.py` — the core alignment pipeline that takes paired-end FASTQs (raw or trimmed) and produces unique BAMs, bigWigs, heatmaps, and QC metrics. Mock mode must create stub files on disk (not just DB records) so that downstream frontend features (file browser, IGV, downloads) work locally.

---

## Files to Create

| File | Purpose |
|------|---------|
| `backend/pipelines/alignment.py` | `AlignmentStage(PipelineStage)` — main alignment pipeline |
| `backend/pipelines/methods_text.py` | Reusable methods text generator (alignment + future stages) |
| `backend/schemas/qc_report.py` | `AlignmentQCReport` Pydantic schema from CUTANA CSV columns |

## Files to Modify

| File | Change |
|------|--------|
| `backend/pipelines/__init__.py` | Register `AlignmentStage` in `_STAGES` dict |
| `backend/config.py` | No changes needed — `GENOME_INDEX_DIR` already exists |

---

## Step 1: Create `backend/pipelines/alignment.py`

### 1a: Constants and Genome Mappings

Define reference data at module level (matching `cleave-spec-decisions.md` §7):

```python
# Correct per-genome values — fixes lab bug in create_bams.sh
EFFECTIVE_GENOME_SIZES = {
    "mm10": 2467481108,
    "hg38": 2913022398,
    "hg19": 2864785220,
    "dm6": 142573017,
    "sacCer3": 12157105,
}

# Bowtie2 index base names (from config2.json, config_human.json, ecoli_config.json)
BOWTIE2_INDEX_NAMES = {
    "mm10": "mm10",
    "hg38": "GRCh38",  # Lab uses GRCh38, not hg38
    "hg19": "hg19",
    "dm6": "dm6",
    "sacCer3": "sacCer3",
    "ecoli": "ecoli",
}

_REFERENCE_DIR = Path(__file__).resolve().parent / "reference"
_BLACKLISTS_DIR = _REFERENCE_DIR / "blacklists"
_ANNOTATIONS_DIR = _REFERENCE_DIR / "annotations"
```

### 1b: `validate()` Method

Check required params and file existence:

```python
def validate(self, params: dict) -> list[str]:
    errors = []
    # Required keys: experiment_id, project_id, reference_genome, reactions (non-empty list)
    # Each reaction must have: reaction_id, short_name, r1_path, r2_path
    # reference_genome must be in EFFECTIVE_GENOME_SIZES
    # In real mode: verify bowtie2 index exists at GENOME_INDEX_DIR/{genome}/{index_name}
    # In real mode: verify blacklist BED exists if remove_dac_exclusion=True
    # In real mode: verify annotation BED exists for heatmaps
    return errors
```

### 1c: `run()` Method — Real Mode

**Processing flow per reaction** (matches PLAN.md §3.3 + lab reference scripts):

Each step chains subprocess calls with stdout/stderr captured to `{job_dir}/logs/`:

```
Step 1: Bowtie2 alignment
  bowtie2 -p {nproc} --dovetail --phred33 \
    -x {GENOME_INDEX_DIR}/{genome}/{index_name} \
    -1 {r1_fastq} -2 {r2_fastq} \
    > {short_name}_aligned_reads.sam \
    2> logs/{short_name}.bowtie2
  # Flags from lab's integrated.sh (line 62): --dovetail --phred33 -p 16

Step 2: SAM → BAM conversion
  samtools view -bS -@ {nproc} {sam} > {short_name}_aligned_reads.bam
  # From lab's integrated.sh (line 63)
  rm {sam}  # Save disk space (line 64)

Step 3: Filter unmapped/unpaired + multi-mapper removal
  samtools view -bh -f 3 -F 4 -F 8 -q 10 {aligned.bam} > {short_name}_uniq.bam
  # -f 3: properly paired
  # -F 4 -F 8: both mates mapped (from lab's integrated.step2.sh line 58)
  # -q 10: MAPQ >= 10, removes multi-mappers (from CUTANA Cloud/PLAN.md)

Step 4: DAC Exclusion List filtering (if remove_dac_exclusion=True)
  bedtools intersect -v -abam {uniq.bam} -b {blacklist.bed} \
    > {short_name}_exclusion_list_filtered_uniq.bam
  # From CUTANA Cloud pipeline; lab does this post-hoc via subtract_blacklist.sh

Step 5: Coordinate sort (required before MarkDuplicates)
  picard SortSam \
    INPUT={filtered.bam} OUTPUT={sorted.bam} \
    SORT_ORDER=coordinate VALIDATION_STRINGENCY=SILENT
  # From lab's integrated.step2.sh (line 62)

Step 6: Mark duplicates
  picard MarkDuplicates \
    INPUT={sorted.bam} OUTPUT={dup_marked.bam} \
    VALIDATION_STRINGENCY=SILENT METRICS_FILE={metrics.txt}
  # From lab's integrated.step2.sh (line 67)
  # Parse metrics.txt for duplication rate

Step 7: Remove duplicates (if remove_duplicates=True)
  samtools view -bh -F 1024 {dup_marked.bam} > {short_name}_final.bam
  # From lab's integrated.step2.sh (line 71)
  # If remove_duplicates=False, copy dup_marked.bam as final.bam

Step 8: Index final BAM
  samtools index {short_name}_final.bam

Step 9: Unsmoothed bigWig (for heatmaps)
  bamCoverage -b {final.bam} \
    --effectiveGenomeSize {EFFECTIVE_GENOME_SIZES[genome]} \
    --normalizeUsing RPKM \
    --binSize {bam_coverage_bin_size} \
    -o {short_name}.bw
  # From create_bams.sh (line 36), with CORRECT genome size per cleave-spec-decisions.md §7

Step 10: Smoothed bigWig (for IGV)
  bamCoverage -b {final.bam} \
    --effectiveGenomeSize {EFFECTIVE_GENOME_SIZES[genome]} \
    --normalizeUsing RPKM \
    --binSize {smoothed_bin_size} \
    -o {short_name}_smoothed.bw
  # Second bin size from CUTANA Cloud advanced settings (default 100bp)

Step 11: TSS heatmap
  computeMatrix reference-point \
    --referencePoint TSS \
    -R {annotations_dir}/{genome}_refGene.bed \
    -S {short_name}.bw \
    -a 1500 -b 1500 \
    -o {short_name}_tss_matrix.gz
  plotHeatmap -m {short_name}_tss_matrix.gz \
    -o {short_name}_tss_heatmap.png \
    --colorMap RdYlBu_r
  # Flanking from lab's heatmaps.sh (line 74): -a 1500 -b 1500

Step 12: Gene body heatmap
  computeMatrix scale-regions \
    -R {annotations_dir}/{genome}_refGene.bed \
    -S {short_name}.bw \
    -a 1500 -b 1500 \
    -o {short_name}_genebody_matrix.gz
  plotHeatmap -m {short_name}_genebody_matrix.gz \
    -o {short_name}_genebody_heatmap.png \
    --colorMap RdYlBu_r
```

**E. coli spike-in (if any reaction has ecoli_spike_in=True):**

```
Step 13: Align to E. coli genome
  bowtie2 -p {nproc} --dovetail --phred33 \
    -x {GENOME_INDEX_DIR}/ecoli/ecoli \
    -1 {r1_fastq} -2 {r2_fastq} \
    2> logs/{short_name}.ecoli.bowtie2 | \
    samtools view -bS -@ {nproc} - > {short_name}_ecoli.bam
  # Count aligned reads from bowtie2 stderr log
```

**QC metrics collection (per reaction):**

After all processing, collect metrics from logs and tool outputs:

```python
{
    "Short_Name": short_name,
    "Total_Read_Pairs": total_reads,           # from FastqFile.total_reads (already in DB)
    "Aligned_Read_Pairs": aligned_reads,       # parse bowtie2 stderr log
    "Uniquely_Aligned_Read_Pairs": uniq_reads, # samtools view -c {final.bam}
    "Unique_Alignment_Rate(%)": rate,          # uniq / total * 100
    "Duplication_Rate(%)": dup_rate,            # from Picard MarkDuplicates metrics.txt
    "chrM_Bandwidth(%)": chrm_pct,             # samtools idxstats chrM / total * 100
    "Ecoli_Read_Pairs": ecoli_reads,           # from ecoli bowtie2 log (0 if no spike-in)
    "Ecoli_Alignment_Rate(%)": ecoli_rate,     # ecoli / total * 100
}
```

Write metrics to `{job_dir}/alignment_metrics.csv` matching the exact CUTANA export format.

### 1d: `mock_run()` Method

Must create **real files on disk** (per todos.md "Mock mode must create stub files on disk"):

```python
def mock_run(self, job_id, params, working_dir, job_dir):
    time.sleep(5)  # Per PLAN.md 3.3

    # Create directory structure
    bams_dir = job_dir / "bams"
    bigwigs_dir = job_dir / "bigwigs"
    heatmaps_dir = job_dir / "heatmaps"
    logs_dir = job_dir / "logs"
    qc_dir = job_dir / "qc"
    # mkdir -p for each

    # Read canned QC data from cutana/H3K4me3/Mouse mm10_alignment_metrics.csv
    # Map reactions to canned metrics by index (cycling if fewer/more)

    # For each reaction in params["reactions"]:
    #   Create stub files (small empty/minimal files with correct names):
    #   - bams/{short_name}_final.bam (empty)
    #   - bams/{short_name}_final.bam.bai (empty)
    #   - bigwigs/{short_name}.bw (empty)
    #   - bigwigs/{short_name}_smoothed.bw (empty)
    #   - heatmaps/{short_name}_tss_heatmap.png (1x1 pixel placeholder)
    #   - heatmaps/{short_name}_genebody_heatmap.png (1x1 pixel placeholder)

    # Write alignment_metrics.csv to qc/ with canned data
    # Build outputs list for persist_job_outputs
    # Generate methods_text

    return {
        "job_id": job_id,
        "status": "complete",
        "outputs": outputs,  # list of dicts for persist_job_outputs
        "methods_text": self.generate_methods_text(params),
    }
```

### 1e: `generate_methods_text()` Method

Generate manuscript-ready text matching CUTANA Cloud's format (from `cutana/H3K4me3/methods.txt`):

```python
def generate_methods_text(self, params):
    genome = params["reference_genome"]
    remove_dups = params.get("remove_duplicates", True)
    remove_dac = params.get("remove_dac_exclusion", True)
    bin_size = params.get("bam_coverage_bin_size", 20)

    text = (
        f"Paired-end reads were aligned to the {genome} reference genome "
        f"using Bowtie2 (--dovetail --phred33). "
        f"Multi-aligned reads (MAPQ < 10) were removed using SAMtools. "
    )
    if remove_dac:
        text += "Reads mapping to ENCODE DAC Exclusion List regions were removed using BEDTools. "
    if remove_dups:
        text += "Duplicate reads were identified with Picard MarkDuplicates and removed. "
    text += (
        f"RPKM-normalized bigWig files were generated via deepTools bamCoverage "
        f"(--binSize {bin_size}, effectiveGenomeSize {EFFECTIVE_GENOME_SIZES[genome]}). "
        f"Enrichment at transcription start sites (reference-point mode) and annotated "
        f"gene bodies (scale-regions mode) was computed using deepTools computeMatrix "
        f"and visualized with plotHeatmap."
    )
    return text
```

### 1f: Output File Categories

Map each output file to the correct `file_category` for `job_outputs` (matching CUTANA Cloud's Files sub-tab dropdowns from `cutana-cloud-ui.md` §6f-iv):

| File Pattern | `file_category` | `file_type` |
|---|---|---|
| `{short_name}_final.bam` | `unique_bam` | `bam` |
| `{short_name}_final.bam.bai` | `unique_bam` | `bai` |
| `{short_name}.bw` | `bigwig` | `bw` |
| `{short_name}_smoothed.bw` | `smoothed_bigwig` | `bw` |
| `{short_name}_tss_heatmap.png` | `tss_heatmap` | `png` |
| `{short_name}_genebody_heatmap.png` | `genebody_heatmap` | `png` |
| `alignment_metrics.csv` | `qc_report` | `csv` |
| `{short_name}.bowtie2` | `log` | `txt` |
| `{short_name}_picard_metrics.txt` | `log` | `txt` |

Each per-reaction file gets `reaction_id` set. Job-level files (QC CSV, combined heatmaps) get `reaction_id=None`.

### 1g: Helper Functions

Extract reusable subprocess helpers (following `trimming.py` pattern):

```python
def _run_cmd(cmd: list[str], log_path: Path | None = None, timeout: int = 7200) -> subprocess.CompletedProcess:
    """Run a subprocess, capture output, log, raise PipelineError on failure."""
    logger.info("alignment.subprocess", cmd=" ".join(cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if log_path:
        log_path.write_text(proc.stdout + "\n" + proc.stderr)
    if proc.returncode != 0:
        raise PipelineError(f"Command failed (exit {proc.returncode}): {proc.stderr.strip()}")
    return proc

def _parse_bowtie2_log(log_path: Path) -> dict:
    """Extract alignment stats from bowtie2 stderr log."""
    # Parse lines like:
    #   "9519486 reads; of these:" → total reads
    #   "9120700 (95.81%) were paired; of these:" → ...
    #   "8234123 (90.23%) aligned concordantly exactly 1 time" → unique
    # Return dict with total_reads, aligned_reads, alignment_rate

def _parse_picard_metrics(metrics_path: Path) -> float:
    """Extract duplication rate from Picard MarkDuplicates metrics file."""
    # Parse TSV: find PERCENT_DUPLICATION in the METRICS CLASS row
    # Return float (0-100 percentage)

def _count_bam_reads(bam_path: Path) -> int:
    """Count reads in a BAM file via samtools view -c."""
    proc = subprocess.run(["samtools", "view", "-c", str(bam_path)],
                          capture_output=True, text=True)
    return int(proc.stdout.strip())

def _count_chrm_reads(bam_path: Path) -> int:
    """Count chrM reads via samtools idxstats."""
    proc = subprocess.run(["samtools", "idxstats", str(bam_path)],
                          capture_output=True, text=True)
    for line in proc.stdout.strip().split("\n"):
        parts = line.split("\t")
        if parts[0] == "chrM":
            return int(parts[2])  # mapped reads column
    return 0

def _get_threads() -> int:
    return os.cpu_count() or 4
```

---

## Step 2: Create `backend/pipelines/methods_text.py`

Simple module with functions that generate methods text strings. Called by `alignment.py` and future pipeline modules.

```python
def alignment_methods(params: dict) -> str:
    """Generate alignment methods text (see 1e above)."""

def peak_calling_methods(params: dict) -> str:
    """Stub for Phase 4."""
```

**Rationale:** Centralizes methods text generation per PLAN.md §3.3 ("Generate methods text from `pipelines/methods_text.py`"). Alignment methods text is also generated inline via `generate_methods_text()` on the stage class — `methods_text.py` is the shared utility, the stage method is the caller.

---

## Step 3: Create `backend/schemas/qc_report.py`

Define the `AlignmentQCReport` Pydantic schema from the CUTANA CSV columns (per PLAN.md §3.5 and `cleave-spec-decisions.md` §12 item 11):

```python
class AlignmentReactionMetrics(CamelModel):
    short_name: str
    total_read_pairs: int
    aligned_read_pairs: int
    uniquely_aligned_read_pairs: int
    unique_alignment_rate: float      # percentage
    duplication_rate: float           # percentage
    chrm_bandwidth: float             # percentage
    ecoli_read_pairs: int
    ecoli_alignment_rate: float       # percentage

class AlignmentQCReport(CamelModel):
    reference_genome: str
    metrics: list[AlignmentReactionMetrics]
```

Column names match `cutana/H3K4me3/Mouse mm10_alignment_metrics.csv`:
`Short_Name, Total_Read_Pairs, Aligned_Read_Pairs, Uniquely_Aligned_Read_Pairs, Unique_Alignment_Rate(%), Duplication_Rate(%), chrM_Bandwidth(%), Ecoli_Read_Pairs, Ecoli_Alignment_Rate(%)`

---

## Step 4: Register in `backend/pipelines/__init__.py`

```python
from pipelines.alignment import AlignmentStage

_STAGES: dict[str, PipelineStage] = {
    "trimming": TrimmingStage(),
    "alignment": AlignmentStage(),
}
```

---

## Implementation Details

### Params Structure (populated by job creation endpoint)

The frontend wizard → API endpoint builds this JSONB dict:

```python
{
    "experiment_id": 1,
    "project_id": 1,
    "reference_genome": "mm10",
    "remove_duplicates": True,        # Advanced Settings checkbox
    "remove_dac_exclusion": True,     # Advanced Settings checkbox
    "bam_coverage_bin_size": 20,      # Advanced Settings
    "smoothed_bin_size": 100,         # Advanced Settings
    "reactions": [
        {
            "reaction_id": 1,
            "short_name": "IgG",
            "fastq_prefix": "230301_IgG_old_PUM1_trimmed_L001",
            "organism": "Mouse",
            "r1_path": "projects/1/1/fastqs/trimmed/..._R1_001_trimmed.fastq.gz",
            "r2_path": "projects/1/1/fastqs/trimmed/..._R2_001_trimmed.fastq.gz",
            "total_reads": 23538581,
            "ecoli_spike_in": True,
            "cutana_spike_in": "None",
            "cutana_spike_in_target": None,
        },
        # ... more reactions
    ]
}
```

### File Organization on Disk

```
{STORAGE_ROOT}/projects/{project_id}/{experiment_id}/jobs/{job_id}/
├── bams/
│   ├── {short_name}_aligned_reads.bam    (raw, deleted after processing to save space)
│   ├── {short_name}_uniq.bam             (intermediate, can be auto-deleted)
│   ├── {short_name}_final.bam            (the Unique BAM — kept)
│   └── {short_name}_final.bam.bai
├── bigwigs/
│   ├── {short_name}.bw                   (unsmoothed, 20bp bins)
│   └── {short_name}_smoothed.bw          (smoothed, 100bp bins)
├── heatmaps/
│   ├── {short_name}_tss_heatmap.png
│   └── {short_name}_genebody_heatmap.png
├── qc/
│   └── alignment_metrics.csv             (CUTANA-format QC data)
└── logs/
    ├── {short_name}.bowtie2              (bowtie2 stderr)
    ├── {short_name}_picard_metrics.txt   (dup metrics)
    └── {short_name}.ecoli.bowtie2        (E. coli alignment log, if applicable)
```

### Processing Order Within `run()`

```
1. Validate all FASTQ paths exist
2. Create output directories (bams/, bigwigs/, heatmaps/, qc/, logs/)
3. For each reaction:
   a. Bowtie2 align → SAM
   b. samtools view -bS → BAM, delete SAM
   c. samtools view -bh -f 3 -F 4 -F 8 -q 10 → uniq BAM
   d. bedtools intersect -v (if remove_dac_exclusion) → filtered BAM
   e. picard SortSam → sorted BAM
   f. picard MarkDuplicates → dup_marked BAM + metrics
   g. samtools view -F 1024 (if remove_duplicates) → final BAM
   h. samtools index → final BAM index
   i. bamCoverage (20bp) → unsmoothed bigWig
   j. bamCoverage (100bp) → smoothed bigWig
   k. If ecoli_spike_in: bowtie2 → ecoli BAM, parse log
   l. Collect QC metrics (parse logs, count reads, parse picard metrics)
4. Generate TSS heatmaps (can be combined across reactions or per-reaction)
5. Generate gene body heatmaps
6. Write alignment_metrics.csv
7. Clean up intermediate files (raw SAMs, intermediate BAMs)
8. Build outputs list with all file paths, sizes, categories, reaction_ids
9. Return result dict with outputs + methods_text
```

### Tool Resolution Pattern (follows trimming.py)

```python
# Check tools are available via shutil.which()
bowtie2 = shutil.which("bowtie2")
samtools = shutil.which("samtools")
picard_jar = shutil.which("picard")  # conda provides the wrapper
bedtools = shutil.which("bedtools")
bamCoverage = shutil.which("bamCoverage")
computeMatrix = shutil.which("computeMatrix")
plotHeatmap = shutil.which("plotHeatmap")

# Raise PipelineError if any tool is missing (with install instructions)
```

### Bowtie2 Log Parsing

Bowtie2 writes alignment stats to stderr. Example format:
```
9519486 reads; of these:
  9519486 (100.00%) were paired; of these:
    398786 (4.19%) aligned concordantly 0 times
    8889064 (93.38%) aligned concordantly exactly 1 time
    231636 (2.43%) aligned concordantly >1 times
...
95.81% overall alignment rate
```

Parse: total reads (first line), overall alignment rate (last line with %), concordantly exactly 1 time (uniquely aligned).

### Picard MarkDuplicates Metrics Parsing

Picard writes a metrics file with a header section, then a TSV table. Key column: `PERCENT_DUPLICATION`. Parse by finding the `## METRICS CLASS` line, then reading the header row and data row.

---

## Verification

### Mock mode (local Docker):
1. Create an alignment job via `POST /api/v1/experiments/{id}/jobs` with `job_type: "alignment"`
2. Worker picks it up → status transitions: queued → running → complete (via SSE)
3. Stub files exist at `{STORAGE_ROOT}/projects/{pid}/{eid}/jobs/{jid}/bams/`, `bigwigs/`, `heatmaps/`
4. `alignment_metrics.csv` in `qc/` matches CUTANA export column format
5. `job_outputs` records created with correct `file_category` values
6. Notification created for the launching user
7. Methods text stored in `analysis_jobs.methods_text`

### Real mode (EC2 / local with conda `cleave-pipeline`):
1. Launch alignment with test FASTQs from `test_data/`
2. Real BAMs, bigWigs, and heatmaps produced
3. QC metrics within expected ranges:
   - Unique alignment rate: 70-95% for targets, ~29% for IgG
   - Duplication rate: <30%
   - E. coli alignment rate: <5% for targets
4. BigWigs use correct `effectiveGenomeSize` per genome (NOT hardcoded mm10 value)

---

## Key Reference Compliance Checklist

Per "Pipeline-Specific Rules — MANDATORY Reference Compliance" in CLAUDE.md:

- [x] Read `references/data_workdir/integrated.sh` — Bowtie2 flags: `--dovetail --phred33 -p 16`
- [x] Read `references/data_workdir/aligned.aug10/integrated.step2.sh` — Post-processing: `-f 3 -F 4 -F 8`, SortSam, MarkDuplicates, `-F 1024`
- [x] Read `references/data_workdir/aligned.aug10/create_bams.sh` — bamCoverage: `--effectiveGenomeSize --normalizeUsing RPKM`
- [x] Read `references/cutruntools/filter_below.awk` — Fragment filter `|TLEN| < 120bp` (NOT used in alignment — used in peak calling Phase 4)
- [x] Read `references/cutruntools/config2.json` — mm10 index path, fastq_sequence_length: 42
- [x] Read `references/cutruntools/config_human.json` — hg38 index base name: `GRCh38`
- [x] Read `references/cutruntools/ecoli_config.json` — E. coli index path
- [x] Read `references/media_misc/k_metstat_script.sh` — All 32 spike-in barcodes (for SNAP-CUTANA QC)
- [x] Verified effectiveGenomeSize bug in create_bams.sh (uses mm10 value for all genomes) — Cleave uses correct per-genome values per `cleave-spec-decisions.md` §7
- [x] Bowtie2 flags match exactly: `--dovetail --phred33` (from integrated.sh line 62)
- [x] Picard invocation matches: `SortSam SORT_ORDER=coordinate VALIDATION_STRINGENCY=SILENT` (from integrated.step2.sh line 62)
- [x] MarkDuplicates invocation matches: `VALIDATION_STRINGENCY=SILENT METRICS_FILE=metrics.txt` (from integrated.step2.sh line 67)
- [x] Thread counts parameterized via `os.cpu_count()` (lab uses 16, Harvard uses 2 — parameterize, don't hardcode)
