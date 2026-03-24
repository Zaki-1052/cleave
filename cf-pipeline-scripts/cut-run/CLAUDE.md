# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a CUT&RUN bioinformatics pipeline for processing, normalizing, quantifying, and clustering genomic datasets. The pipeline consists of several interconnected scripts designed for sequential processing of paired-end FASTQ files through to final visualization and clustering analysis.

## Pipeline Architecture

The pipeline follows a 4-stage sequential workflow:

1. **Data Processing** (`main_pipeline.sh`) - AWS EC2-based processing of FASTQ files to normalized BigWig files
2. **BigWig Normalization** (`bigwig_normalization.r`) - Interactive R script for normalizing BigWig files
3. **Feature Quantification** (`count_features_*.py`) - Python scripts for quantifying genomic features from deepTools matrix outputs
4. **Hierarchical Clustering** (`clustering.py`) - Jupyter notebook-style Python script for clustering and visualization

### Key Components

- **Main Pipeline (`scripts/main_pipeline.sh`)**: Bash script designed specifically for AWS EC2 remote processing. Handles file uploads, remote execution, and BigWig file retrieval. Uses SSH/SCP with PEM key authentication.
- **BigWig Normalization (`scripts/bigwig_normalization.r`)**: Interactive R script requiring user input for file selection. Uses `rtracklayer` library.
- **Feature Quantification**: Two Python variants (`count_features_earlylate.py`, `count_features_ctrlmut.py`) for processing deepTools computeMatrix outputs.
- **Clustering Analysis (`scripts/clustering.py`)**: Comprehensive Python script using pandas, scipy, matplotlib, seaborn for hierarchical clustering and heatmap generation.

## Common Development Commands

### Running the Pipeline

```bash
# Full pipeline execution (requires EC2 setup)
bash scripts/main_pipeline.sh <EC2_instance> <fastq_file1_R1> <fastq_file2_R1> <output_dir>

# BigWig normalization (interactive)
Rscript scripts/bigwig_normalization.r

# Feature quantification (interactive CLI)
python scripts/count_features_earlylate.py
python scripts/count_features_ctrlmut.py

# Clustering analysis (modify file paths in script before running)
python scripts/clustering.py
```

### Development Testing

```bash
# Test with example data
bash scripts/main_pipeline.sh example_instance example_data/input/sample1_R1.fastq.gz example_data/input/sample2_R1.fastq.gz example_data/output/
```

## Dependencies

### Python Dependencies
- pandas
- numpy
- matplotlib
- seaborn
- scipy
- jenkspy

### R Dependencies
- rtracklayer

### External Tools
- deepTools (computeMatrix command required for feature quantification)
- Standard bioinformatics tools (assumed to be available on EC2 instance)

## Important Configuration Notes

### AWS EC2 Setup Requirements
The main pipeline script is hardcoded for specific AWS EC2 environments with these assumptions:
- PEM file authentication at `~/fergusonLab/210323.pem`
- Remote directories: `/data/rs_256/fastq` (FASTQ), `/data/rs_256/workdir/aligned.aug10` (BigWig)
- Ubuntu user access with specific automation scripts already deployed

### Script Modifications Required
- **BigWig normalization**: Update directory path on line 4 of `bigwig_normalization.r`
- **Clustering analysis**: Update input file paths directly in `clustering.py` script
- **Main pipeline**: Modify EC2 instance details, PEM file path, and directory structures as needed

## File Structure Expectations

```
example_data/
├── input/           # Input FASTQ files (paired-end, R1/R2)
└── output/          # Pipeline outputs including BigWig files
    └── bw/          # Generated BigWig files directory
```

The pipeline expects:
- Paired-end FASTQ files with `_R1` and `_R2` naming convention
- deepTools matrix outputs (.tab and .bed files) for feature quantification
- Excel files (.xlsx) for clustering analysis input

## Development Notes

- Scripts are designed for production bioinformatics environments with external tool dependencies
- The main pipeline requires active AWS EC2 infrastructure
- Interactive scripts (`bigwig_normalization.r`, feature quantification) require manual user input
- The clustering script uses Jupyter notebook cell structure (`# %%`) but runs as a standard Python script

## Coding Standards and Best Practices

These principles are derived from analyzing the existing scripts and should be followed when extending or modifying this codebase:

### 1. Function-Based Modular Design
- **Pattern**: Each major operation gets its own function (e.g., `upload_files`, `save_bigwig_files`, `process_tab_file`)
- **Implementation**: Break complex workflows into focused, single-purpose functions
- **Example**: `main_pipeline.sh` separates file upload, processing, and retrieval into distinct functions

### 2. Comprehensive Error Handling with Specific Messages
- **Pattern**: Detect and classify different error types with actionable messages
- **Implementation**: Use exit codes, capture command outputs, and provide specific guidance
- **Example**: `upload_files()` distinguishes between connection timeouts, DNS resolution failures, and permission issues

### 3. Defensive Programming and Validation
- **Pattern**: Validate inputs and file existence before proceeding with operations
- **Implementation**:
  - Use `[ -s file ]` for non-empty file checks in Bash
  - Validate exactly one required file exists before processing
  - Check data integrity (NaN, infinity) before statistical operations
- **Example**: Feature quantification scripts ensure exactly one `.tab` and one `.bed` file exist

### 4. Configuration Management
- **Pattern**: Define all constants and configurable paths at the top of scripts
- **Implementation**:
  - Bash: Global variables for directories, credentials, and remote paths
  - Python: `INPUT_FILES` and `OUTPUT_FILES` dictionaries
  - R: Directory variables and chromosome lists
- **Example**: `main_pipeline.sh` defines EC2 paths, `clustering.py` uses configuration dictionaries

### 5. Progress Tracking and User Communication
- **Pattern**: Extensive logging for long-running processes and user feedback
- **Implementation**:
  - Bash: Echo statements with timestamps and process descriptions
  - Python: Print statements with emoji milestones (✅) and progress indicators
  - R: `cat()` statements for processing status
- **Example**: All scripts provide detailed progress information for debugging and monitoring

### 6. Process Validation and Recovery
- **Pattern**: Verify outputs exist and are valid before continuing to next stage
- **Implementation**: Check file creation success, validate data integrity, implement conditional processing
- **Example**: `main_pipeline.sh` verifies BAM and BigWig files exist before proceeding to next stage

### 7. Parallel Processing with Proper Synchronization
- **Pattern**: Use background processes for independent operations with proper waiting
- **Implementation**:
  - Background commands with `&` and PID tracking
  - `wait` commands for synchronization
  - Exit status checking for each parallel process
- **Example**: `main_pipeline.sh` processes file pairs in parallel with PID management

### 8. Resource and Environment Management
- **Pattern**: Proper setup/teardown of environments and cleanup of temporary resources
- **Implementation**:
  - Conda environment activation/deactivation as needed
  - Cleanup of temporary exit status files
  - Proper SSH connection handling
- **Example**: `main_pipeline.sh` manages conda environments and cleans temporary files

### 9. Standardized File and Data Handling
- **Pattern**: Consistent approaches to file discovery, naming, and data structure management
- **Implementation**:
  - Automatic file type detection with validation
  - Dynamic output naming based on input directories/files
  - Consistent coordinate format construction (`chr:start-end`)
  - Standard column ordering and data organization patterns
- **Example**: Feature quantification scripts auto-detect required files and construct standardized coordinate columns

### 10. Development-Friendly Patterns
- **Pattern**: Support for both interactive development and automated execution
- **Implementation**:
  - Jupyter notebook cells (`# %%`) for development workflows
  - Command-line argument parsing for automation
  - Interactive prompts with fallback to defaults
  - Commented code preservation for development reference
- **Example**: `clustering.py` uses notebook-style cells, `reorder_quantitation.py` supports CLI arguments

### 11. Statistical and Scientific Rigor
- **Pattern**: Implement proper statistical methods with validation and quality control
- **Implementation**:
  - Non-parametric methods for genomic data
  - Quantile-based normalization approaches
  - Data quality filters (zero coverage, masked regions)
  - Multiple output formats for different analysis needs
- **Example**: `bigwig_normalization.r` implements 99th percentile normalization with masking, `clustering.py` uses non-parametric z-scores and Jenks natural breaks

### 12. Remote and Distributed Processing
- **Pattern**: Handle remote execution, file transfers, and distributed computing gracefully
- **Implementation**:
  - Use heredoc syntax for complex remote command sequences
  - Implement retry logic and connection validation
  - Separate concerns: local coordination vs. remote execution
  - Proper SSH key and credential management
- **Example**: `main_pipeline.sh` demonstrates sophisticated remote processing with AWS EC2

These patterns ensure maintainability, reliability, and scientific reproducibility while supporting both development workflows and production deployment.