# Cleave Backend Patterns: Jobs and QC Reports - Comprehensive Analysis                                       
                                                                                                                 
## 1. QC CSV DATA SCHEMA (Source: cutana/H3K4me3/Mouse mm10_alignment_metrics.csv)                            
                                                
### CSV Columns (Exact Match):                                                                                
```
Short_Name,Total_Read_Pairs,Aligned_Read_Pairs,Uniquely_Aligned_Read_Pairs,Unique_Alignment_Rate(%),Duplica
tion_Rate(%),chrM_Bandwidth(%),Ecoli_Read_Pairs,Ecoli_Alignment_Rate(%)
```

### Sample Data:
- IgG: 23538581 total reads, 9906793 aligned, 6856185 uniquely aligned, 29.13% unique rate, 21.36% dup
rate, 0.12% chrM, 12842807 E. coli reads, 54.56% E. coli rate
- K4me3_ctrl1: 9519486 total reads, 9120700 aligned, 7630846 uniquely aligned, 80.16% unique rate, 12.45%
dup rate, 0.0% chrM, 1020 E. coli reads, 0.01% E. coli rate

---

## 2. PYDANTIC QC REPORT SCHEMAS (backend/schemas/qc_report.py)

### AlignmentReactionMetrics Class
```python
class AlignmentReactionMetrics(CamelModel):
    short_name: str
    total_read_pairs: int
    aligned_read_pairs: int
    uniquely_aligned_read_pairs: int
    unique_alignment_rate: float                # %
    duplication_rate: float                     # %
    chrm_bandwidth: float                       # %
    ecoli_read_pairs: int
    ecoli_alignment_rate: float                 # %
```

### AlignmentQCReport Class
```python
class AlignmentQCReport(CamelModel):
    reference_genome: str                       # e.g., "mm10", "hg38", "hg19", "dm6", "sacCer3"
    metrics: list[AlignmentReactionMetrics]
```

### CamelModel Base (schemas/common.py)
- Converts snake_case to camelCase on serialization
- populate_by_name=True: accepts both forms
- Example: `short_name` → `shortName` (in JSON)

---

## 3. JOB MODEL & SCHEMAS

### AnalysisJob ORM Model (backend/models/analysis_job.py)
```python
class AnalysisJob(Base):
    __tablename__ = "analysis_jobs"

    id: int (PK)
    experiment_id: int (FK → experiments.id, CASCADE)
    job_type: str                               # "alignment", "trimming", etc.
    name: str[30]
    notes: str | None
    status: str = "queued"                      # "queued", "running", "complete", "error", "terminated"
    params: dict (JSON)                         # Pipeline-specific parameters
    parent_job_id: int | None (FK → analysis_jobs.id)
    launched_by: int | None (FK → users.id)
    started_at: datetime | None (timezone-aware)
    completed_at: datetime | None (timezone-aware)
    duration_seconds: int | None
    error_message: str | None
    methods_text: str | None                    # Manuscript-ready methods description
    created_at: datetime (server default: now)

    Relationships:
    - experiment: Experiment (back_populates="analysis_jobs")
    - launcher: User
    - parent_job: AnalysisJob | None (self-referential)
    - outputs: list[JobOutput] (cascade delete)
```

### JobCreate Schema (backend/schemas/job.py)
```python
class JobCreate(CamelModel):
    job_type: str
    name: str = Field(..., max_length=30)
    notes: str | None = None
    params: dict[str, Any] = {}                 # Custom per job_type
    parent_job_id: int | None = None
```

### JobRead Schema (backend/schemas/job.py)
```python
class JobRead(CamelModel):
    id: int
    experiment_id: int
    job_type: str
    name: str
    notes: str | None
    status: str = "queued"
    params: dict[str, Any] = {}
    parent_job_id: int | None
    launched_by: int | None
    started_at: datetime | None
    completed_at: datetime | None
    duration_seconds: int | None
    error_message: str | None
    methods_text: str | None
    created_at: datetime
```

---

## 4. JOB OUTPUT MODEL

### JobOutput ORM Model (backend/models/job_output.py)
```python
class JobOutput(Base):
    __tablename__ = "job_outputs"

    id: int (PK)
    job_id: int (FK → analysis_jobs.id, CASCADE)
    reaction_id: int | None (FK → reactions.id)          # Links output to specific reaction
    file_category: str                          # "unique_bam", "bigwig", "smoothed_bigwig", "tss_heatmap",
"genebody_heatmap", "qc_report", "log"
    filename: str                               # e.g., "IgG_final.bam"
    file_path: str                              # Relative to STORAGE_ROOT, e.g.,
"projects/1/1/jobs/5/bams/IgG_final.bam"
    file_type: str | None                       # Extension/type: "bam", "bai", "bw", "png", "csv", "txt"
    file_size_bytes: int | None (BigInteger)
    created_at: datetime (server default: now)

    Relationships:
    - job: AnalysisJob (back_populates="outputs")
    - reaction: Reaction | None (back_populates="job_outputs")
```

---

## 5. JOB ROUTER ENDPOINTS (backend/routers/jobs.py)

### POST /experiments/{experiment_id}/jobs
- Create a new queued job
- Request body: JobCreate (job_type, name, notes, params, parent_job_id)
- Response: JobRead (201 CREATED)
- Permission: admin or contributor

### GET /experiments/{experiment_id}/jobs
- List jobs for an experiment (paginated)
- Query params: page=1, per_page=25
- Response: PaginatedResponse[JobRead]
- Permission: admin, contributor, or viewer

### GET /jobs/{job_id}
- Fetch single job by ID
- Response: JobRead
- Permission: user must have access to job's experiment's project

---

## 6. JOB SERVICE (backend/services/job_service.py)

### create_job(db, experiment_id, user_id, job_create) → AnalysisJob | None
- Creates queued job with status="queued"
- Checks permission: admin or contributor
- Returns None if unauthorized
- Persists job to DB with launched_by=user_id

### get_job(db, job_id, user_id) → AnalysisJob | None
- Fetches job by ID with permission check
- Joins through Experiment → ProjectMember to verify access
- Eagerly loads outputs via selectinload
- Returns None if not found or unauthorized

### list_jobs_for_experiment(db, experiment_id, user_id, page, per_page) → tuple[list[AnalysisJob], int] |
None
- Lists jobs with pagination (order by created_at DESC)
- Permission check: admin, contributor, or viewer
- Returns None if unauthorized
- Returns (jobs, total) on success

---

## 7. JOB OUTPUT SERVICE (backend/services/job_output_service.py)

### persist_job_outputs(job_id, experiment_id, project_id, outputs) → int
Receives list of output dicts from pipeline with required fields:
```python
[
    {
        "file_category": str,           # REQUIRED
        "filename": str,                # REQUIRED
        "file_path": str,               # REQUIRED (relative to STORAGE_ROOT)
        "file_type": str | None,
        "file_size_bytes": int,
        "reaction_id": int | None,      # Optional, links to specific reaction
    },
    ...
]
```

Behavior:
- Creates JobOutput record for each output dict
- Atomically increments Experiment.storage_bytes and Project.storage_bytes
- Uses own DB session (can be called from worker context)
- Returns total_bytes persisted
- Logs job_id, output count, total_bytes

---

## 8. PIPELINE BASE CLASS (backend/pipelines/base.py)

### PipelineStage (ABC)
```python
class PipelineStage(ABC):

    @abstractmethod
    def validate(self, params: dict) -> list[str]:
        """Returns list of error messages (empty = valid)."""
        ...

    @abstractmethod
    def run(self, job_id: int, params: dict, working_dir: Path, job_dir: Path) -> dict:
        """Execute real pipeline. Returns result dict with outputs, qc_metrics, methods_text."""
        ...

    def mock_run(self, job_id: int, params: dict, working_dir: Path, job_dir: Path) -> dict:
        """Override to return canned results."""
        return {
            "job_id": job_id,
            "status": "complete",
            "message": f"Mock run for {self.__class__.__name__}",
        }

    @abstractmethod
    def generate_methods_text(self, params: dict) -> str:
        """Generate manuscript-ready methods text."""
        ...
```

---

## 9. ALIGNMENT PIPELINE IMPLEMENTATION (backend/pipelines/alignment.py)

### AlignmentStage Class

#### validate(params) → list[str]
Requires:
- experiment_id (int)
- project_id (int)
- reference_genome (str) in EFFECTIVE_GENOME_SIZES
- reactions (non-empty list) with per-reaction:
    - reaction_id (int)
    - short_name (str)
    - r1_path (str, relative to STORAGE_ROOT)
    - r2_path (str, relative to STORAGE_ROOT)

Optional:
- remove_duplicates: bool = True
- remove_dac_exclusion: bool = True
- bam_coverage_bin_size: int = 20
- smoothed_bin_size: int = 100

Returns list of validation error messages.

#### run(job_id, params, working_dir, job_dir) → dict
Full real pipeline (requires bowtie2, samtools, picard, bedtools, bamCoverage, computeMatrix, plotHeatmap):

**Per Reaction:**
1. Bowtie2 alignment (--dovetail --phred33)
2. SAM → BAM conversion
3. Filter unmapped/unpaired + multi-mapper removal (-q 10)
4. DAC Exclusion List filtering (if enabled)
5. Coordinate sort (Picard)
6. Mark duplicates (Picard MarkDuplicates)
7. Remove duplicates (samtools, if enabled)
8. Index final BAM
9. Unsmoothed bigWig (20bp bins, RPKM normalized)
10. Smoothed bigWig (100bp bins)
11. TSS heatmap (reference-point mode, ±1500bp)
12. Gene body heatmap (scale-regions mode)
13. E. coli spike-in alignment (if ecoli_spike_in=true in reaction)

**QC Metrics Collected Per Reaction:**
- short_name
- total_read_pairs
- aligned_read_pairs (from bowtie2 log)
- uniquely_aligned_read_pairs (samtools view count on final BAM)
- unique_alignment_rate (%)
- duplication_rate (%) from Picard MarkDuplicates
- chrm_bandwidth (%) - chrM reads / total reads
- ecoli_read_pairs
- ecoli_alignment_rate (%)

**Return Value:**
```python
{
    "job_id": int,
    "status": "complete",
    "message": str,
    "outputs": [                    # Per-reaction + job-level files
        {
            "file_category": str,   # "unique_bam", "bigwig", "smoothed_bigwig", "tss_heatmap",
"genebody_heatmap", "log", "qc_report"
            "filename": str,
            "file_path": str,       # Relative to STORAGE_ROOT
            "file_type": str,
            "file_size_bytes": int,
            "reaction_id": int | None,
        },
        ...
    ],
    "methods_text": str,            # Manuscript-ready description
    "qc_metrics": [                 # List matching all_metrics in run()
        {
            "short_name": str,
            "total_read_pairs": int,
            "aligned_read_pairs": int,
            "uniquely_aligned_read_pairs": int,
            "unique_alignment_rate": float,
            "duplication_rate": float,
            "chrm_bandwidth": float,
            "ecoli_read_pairs": int,
            "ecoli_alignment_rate": float,
        },
        ...
    ],
}
```

#### mock_run(job_id, params, working_dir, job_dir) → dict
Creates stub files on disk for testing/development:

**Loads Canned QC Data:**
- From cutana/H3K4me3/Mouse mm10_alignment_metrics.csv if available
- Cycles through rows if fewer canned rows than reactions
- Falls back to synthetic defaults if no file

**Creates Per Reaction:**
- empty BAM files: `{short_name}_final.bam`, `{short_name}_final.bam.bai`
- empty bigWigs: `{short_name}.bw`, `{short_name}_smoothed.bw`
- stub PNGs (1x1 transparent): `{short_name}_tss_heatmap.png`, `{short_name}_genebody_heatmap.png`
- mock log: `{short_name}.bowtie2`

**Creates Job-Level:**
- QC CSV: `qc/alignment_metrics.csv` (written via _write_qc_csv)

**Return Value:**
Same as run() - includes outputs list and qc_metrics

#### generate_methods_text(params) → str
Generates manuscript-ready methods from pipelines/methods_text.py:alignment_methods()
- Includes genome
- Tool versions (bowtie2, samtools, picard, bedtools, bamCoverage)
- Flags and parameters (--dovetail, --phred33, -q 10, RPKM, bin sizes)
- Conditional text based on remove_duplicates, remove_dac_exclusion settings
- Correct effective genome sizes per EFFECTIVE_GENOME_SIZES dict

---

## 10. WORKER EXECUTION FLOW (backend/worker.py)

### poll_and_run() → None (async)

**Workflow:**
1. Lock and fetch first queued job (ordered by created_at)
2. Snapshot job attributes (id, type, params, experiment_id, project_id, etc.)
3. Update job.status = "running", .started_at = now
4. Update experiment.status = "new" → "in_progress"
5. Create job_dir = STORAGE_ROOT/projects/{project_id}/{experiment_id}/jobs/{job_id}
6. Call `pipelines.run(job_type, params, working_dir, job_dir)`
7. On success:
    - Update job.status = "complete", .completed_at, .duration_seconds, .methods_text
    - For "trimming": call create_trimmed_fastq_records()
    - For others (including "alignment"): call persist_job_outputs() with pipeline outputs
8. On error:
    - Update job.status = "error", .error_message, .completed_at, .duration_seconds
    - Update experiment.status = "error"
9. Create Notification for job.launched_by

### pipelines.run(job_type, params, working_dir, job_dir) → dict
Located in backend/pipelines/__init__.py:

**Registry:**
```python
_STAGES = {
    "trimming": TrimmingStage(),
    "alignment": AlignmentStage(),
}
```

**Execution:**
1. Lookup stage in registry
2. Call stage.validate(params) - raise PipelineError if validation fails
3. If PIPELINE_MODE == "mock": call stage.mock_run()
4. Else: call stage.run()
5. Return result dict with outputs, methods_text, qc_metrics

---

## 11. OUTPUT FILE DIRECTORY STRUCTURE

Created by alignment.mock_run() and alignment.run():

```
STORAGE_ROOT/
    projects/
    {project_id}/
        {experiment_id}/
        jobs/
            {job_id}/
            bams/
                {short_name}_final.bam
                {short_name}_final.bam.bai
            bigwigs/
                {short_name}.bw
                {short_name}_smoothed.bw
            heatmaps/
                {short_name}_tss_heatmap.png
                {short_name}_genebody_heatmap.png
            qc/
                alignment_metrics.csv       ← ALIGNMENT QC REPORT (CSV)
            logs/
                {short_name}.bowtie2
                {short_name}_picard_metrics.txt
```

**Relative Path Format (stored in JobOutput.file_path):**
```
projects/{project_id}/{experiment_id}/jobs/{job_id}/bams/IgG_final.bam
projects/{project_id}/{experiment_id}/jobs/{job_id}/qc/alignment_metrics.csv
```

---

## 12. QC CSV WRITING (_write_qc_csv helper)

**Location:** backend/pipelines/alignment.py

**Input:** list[dict] with metrics
**Output:** CSV file at specified path

**Conversion:** snake_case → CUTANA Cloud column names:
- short_name → Short_Name
- total_read_pairs → Total_Read_Pairs
- aligned_read_pairs → Aligned_Read_Pairs
- uniquely_aligned_read_pairs → Uniquely_Aligned_Read_Pairs
- unique_alignment_rate → Unique_Alignment_Rate(%)
- duplication_rate → Duplication_Rate(%)
- chrm_bandwidth → chrM_Bandwidth(%)
- ecoli_read_pairs → Ecoli_Read_Pairs
- ecoli_alignment_rate → Ecoli_Alignment_Rate(%)

**Rounding:** Floats rounded to 2 decimal places

---

## 13. CANNED QC DATA LOADING (_load_canned_qc_data helper)

**Source:** cutana/H3K4me3/Mouse mm10_alignment_metrics.csv

**Behavior:**
- Reads CSV file (if exists)
- Parses each row into dict with snake_case keys
- Returns list[dict] with fields matching AlignmentReactionMetrics

**Used in:** alignment.mock_run() to populate realistic QC metrics

---

## 14. EFFECTIVE GENOME SIZES CONSTANT

**From:** backend/pipelines/methods_text.py:EFFECTIVE_GENOME_SIZES

```python
EFFECTIVE_GENOME_SIZES = {
    "mm10": 2_467_481_108,
    "hg38": 2_913_022_398,
    "hg19": 2_864_785_220,
    "dm6": 142_573_017,
    "sacCer3": 12_157_105,
}
```

**Purpose:** Used in BAM coverage normalization (bamCoverage --effectiveGenomeSize)

**Note:** Fixes lab's bug (they hardcoded mm10 value for all genomes)

---

## 15. PERMISSION PATTERNS

### Job Creation
- Requires: admin or contributor on experiment's project

### Job Reading
- get_job: User must be ProjectMember on job's experiment's project
- list_jobs: User must be admin, contributor, or viewer on project

### Via job_service.get_experiment_with_permission(db, experiment_id, user_id, allowed_roles)
Joins: User → ProjectMember → Project → Experiment
Checks: ProjectMember.role in allowed_roles

---

## 16. TEST COVERAGE (backend/tests/test_alignment_pipeline.py)

**Key test assertions:**
- Validation passes for valid params, fails for missing required fields
- mock_run creates real stub files in correct directory structure
- Output structure matches persist_job_outputs expectations
- QC CSV headers match CUTANA Cloud export exactly
- Per-reaction outputs have reaction_id set; job-level have reaction_id=None
- Canned QC data loads from cutana/ directory
- AlignmentQCReport schema accepts valid data
- Schema serializes to camelCase (shortName, totalReadPairs, etc.)
- Effective genome sizes are correct per genome
- Methods text respects Advanced Settings

---

## 17. KEY PATTERNS FOR IMPLEMENTATION

### Creating a new QC Report Endpoint

1. **Receive job_id in URL path**
    ```python
    @router.get("/jobs/{job_id}/qc-report", response_model=AlignmentQCReport)
    async def get_alignment_qc_report(job_id: int, ...):
    ```

2. **Fetch job, verify permissions, check if it's an alignment job**
    ```python
    job = await get_job(db, job_id, user.id)
    if job is None or job.job_type != "alignment":
        raise HTTPException(404, "Alignment job not found")
    ```

3. **Parse QC CSV from disk or extract from database**
    - Option A: Read qc/alignment_metrics.csv from disk
    - Option B: Parse CSV, validate against AlignmentQCReport schema
    - Option C: Store qc_metrics as JSON in AnalysisJob (requires schema change)

4. **Return AlignmentQCReport(reference_genome=..., metrics=[...])**

### Current Metadata Storage
- job.params (JSON): Stores input parameters (reference_genome, reactions, etc.)
- job.methods_text (String): Stores generated methods description
- job.outputs (via JobOutput): Stores files with file_category="qc_report" marking CSV location
- Currently NO structured QC metrics storage - CSV is the source of truth

### Recommendation
For QC report endpoint, parse CSV file from disk:
```python
qc_csv_path = STORAGE_ROOT / job_output.file_path  # qc/alignment_metrics.csv
metrics = parse_alignment_qc_csv(qc_csv_path)
return AlignmentQCReport(reference_genome=job.params["reference_genome"], metrics=metrics)
```