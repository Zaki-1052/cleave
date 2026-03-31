# scripts/seed_reference_project.py
"""Seed the Gold Standard Reference Project with pre-analyzed data.

Creates: 1 project, 1 experiment, 4 reactions, 6 analysis jobs, and all job output records.
Idempotent — skips if a reference project already exists.

Usage:
    # Production (files already rsynced to STORAGE_ROOT):
    python scripts/seed_reference_project.py

    # Local dev (creates placeholder stub files):
    python scripts/seed_reference_project.py --mock
"""

import argparse
import asyncio
import sys
from pathlib import Path

# Add backend to path so imports work from repo root or scripts/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from config import settings
from models.analysis_job import AnalysisJob
from models.experiment import Experiment
from models.job_output import JobOutput
from models.project import Project
from models.reaction import Reaction


# ---------------------------------------------------------------------------
# Reference data definitions
# ---------------------------------------------------------------------------

PROJECT_NAME = "Gold Standard Reference"
PROJECT_DESCRIPTION = (
    "Pre-analyzed MeCP2 CUT&RUN dataset (mouse mm10) with 4 samples "
    "(2 ctrl, 2 mut). Explore alignment QC, peak calling, DiffBind, "
    "normalization, heatmaps, and correlation outputs."
)

EXPERIMENT_NAME = "MeCP2 CUT&RUN (mm10)"
EXPERIMENT_ASSAY = "CUT&RUN"

# FASTQ prefixes from the actual filenames
REACTIONS = [
    {
        "short_name": "mecp2-ctrl_1",
        "fastq_prefix": "250724_index_41_Bap1_Math1_P90_ctrl1_GST-MeCP2_S47_L007",
        "organism": "Mouse (mm10)",
        "assay_type": "CUT&RUN",
        "experimental_condition": "ctrl",
    },
    {
        "short_name": "mecp2-ctrl_2",
        "fastq_prefix": "250724_index_43_Bap1_Math1_P90_ctrl2_GST-MeCP2_S49_L007",
        "organism": "Mouse (mm10)",
        "assay_type": "CUT&RUN",
        "experimental_condition": "ctrl",
    },
    {
        "short_name": "mecp2-mut_1",
        "fastq_prefix": "250724_index_42_Bap1_Math1_P90_mut1_GST-MeCP2_S48_L007",
        "organism": "Mouse (mm10)",
        "assay_type": "CUT&RUN",
        "experimental_condition": "mut",
    },
    {
        "short_name": "mecp2-mut_2",
        "fastq_prefix": "250724_index_44_Bap1_Math1_P90_mut2_GST-MeCP2_S50_L007",
        "organism": "Mouse (mm10)",
        "assay_type": "CUT&RUN",
        "experimental_condition": "mut",
    },
]

SAMPLE_NAMES = [r["short_name"] for r in REACTIONS]

# Job definitions: (original_dev_job_id, job_type, name, parent_key, params)
# parent_key references another job by its original dev ID
JOBS = [
    (
        11,
        "alignment",
        "Alignment",
        None,
        {
            "reference_genome": "mm10",
            "remove_duplicates": True,
            "remove_blacklist": True,
            "reactions": [],  # Filled dynamically
        },
    ),
    (
        12,
        "peak_calling",
        "Peak Calling",
        11,
        {
            "reference_genome": "mm10",
            "peak_caller": "seacr",
            "peak_size": "stringent",
            "significance_threshold": 0.01,
            "fragment_filter": True,
            "fragment_filter_size": 120,
            "reactions": [],
        },
    ),
    (
        13,
        "diffbind",
        "DiffBind",
        12,
        {
            "reference_genome": "mm10",
            "analysis_method": "deseq2_consensus",
            "samples": [],
        },
    ),
    (
        14,
        "roman_normalization",
        "Normalization",
        11,
        {
            "reference_genome": "mm10",
            "samples": [],
        },
    ),
    (
        15,
        "custom_heatmap",
        "Custom Heatmap",
        11,
        {
            "reference_genome": "mm10",
            "reference_point": "center",
            "flanking_upstream": 1500,
            "flanking_downstream": 1500,
            "sort_order": "descend",
            "samples": [],
        },
    ),
    (
        18,
        "pearson_correlation",
        "Correlation",
        14,
        {
            "reference_genome": "mm10",
            "samples": [],
        },
    ),
]


# File category classification based on path patterns
def classify_file(rel_path: str) -> tuple[str, str | None]:
    """Return (file_category, file_type) for a job output file."""
    name = Path(rel_path).name
    suffix = Path(name).suffix.lstrip(".")

    if "/qc/" in rel_path:
        if "alignment_metrics" in name:
            return "qc_report", "csv"
        if "peak_caller_metrics" in name:
            return "qc_report", "csv"
        if "frip_scores" in name:
            return "frip_scores", "csv"
        if "top_called_peaks" in name:
            return "top_peaks", "csv"
        return "qc", suffix or None

    if "/bams/" in rel_path:
        if name.endswith(".bam.bai"):
            return "bam_index", "bai"
        return "bam", "bam"

    if "/filtered_bams/" in rel_path:
        if name.endswith(".bam.bai"):
            return "filtered_bam_index", "bai"
        return "filtered_bam", "bam"

    if "/bigwigs/" in rel_path:
        return "bigwig", "bw"

    if "/heatmaps/" in rel_path:
        if "tss" in name:
            return "tss_heatmap", suffix
        if "genebody" in name:
            return "genebody_heatmap", suffix
        return "heatmap", suffix

    if "/peaks/" in rel_path:
        if "summit" in name:
            return "summit", "bed"
        if "_clean_clean" in name:
            return "peaks_final", "bed"
        if "_clean" in name:
            return "peaks_clean", "bed"
        if ".sort.bed" in name:
            return "peaks_sorted", "bed"
        return "peaks_raw", "bed"

    if "/annotation/" in rel_path:
        if "_stats" in name:
            return "annotation_stats", "txt"
        return "annotation", "txt"

    if "/logs/" in rel_path:
        return "log", suffix or "log"

    # DiffBind outputs
    if "diffbind" in rel_path:
        if "results_columns" in name:
            return "diffbind_columns", "json"
        if "results" in name and name.endswith(".txt"):
            return "diffbind_results", "tsv"
        if "normalized_counts" in name:
            return "normalized_counts", "csv"
        if "MA_plot" in name:
            return "diffbind_plot_ma", suffix
        if "PCA_plot" in name:
            return "diffbind_plot_pca", suffix
        if "volcano_plot" in name:
            return "diffbind_plot_volcano", suffix
        if "heatmapgroup" in name:
            return "diffbind_plot_heatmap_group", suffix
        if "heatmapcondition" in name:
            return "diffbind_plot_heatmap_condition", suffix

    # Normalization outputs
    if "rnorm.bw" in name:
        return "normalized_bigwig", "bw"
    if "normalization_factors" in name:
        return "normalization_factors", "csv"
    if "normalization_" in name and "factors" in name:
        if suffix == "png":
            return "normalization_plot", "png"
        if suffix == "svg":
            return "normalization_plot", "svg"

    # Custom heatmap outputs
    if rel_path.startswith("jobs/15/results/"):
        if "matrix_" in name:
            return "custom_heatmap_matrix", "gz"
        if "_profile" in name:
            return "custom_heatmap_profile", suffix
        if "_regions" in name:
            return "custom_heatmap_regions", "bed"
        if "heatmap_" in name:
            return "custom_heatmap_plot", suffix

    # Pearson outputs
    if "pearson" in rel_path or "pearson" in name:
        if "coverage_matrix" in name:
            return "pearson_matrix", "csv"
        if "correlation" in name and name.endswith(".csv"):
            return "pearson_correlation", "csv"
        if "heatmap" in name:
            return "pearson_heatmap", suffix

    # Sample sheets (not tracked as job outputs, skip)
    if name == "sample_sheet.csv":
        return "sample_sheet", "csv"

    return "other", suffix or None


def get_reaction_name_from_file(filename: str) -> str | None:
    """Extract sample short_name from a filename like 'mecp2-ctrl_1_final.bam'."""
    for name in SAMPLE_NAMES:
        if filename.startswith(name):
            return name
    return None


# ---------------------------------------------------------------------------
# Main seeding logic
# ---------------------------------------------------------------------------


async def seed(mock: bool = False) -> None:
    engine = create_async_engine(str(settings.DATABASE_URL))
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with session_factory() as db:
        # Check if reference project already exists
        existing = await db.execute(
            select(Project).where(Project.is_reference.is_(True))
        )
        if existing.scalar_one_or_none() is not None:
            print("Reference project already exists. Skipping seed.")
            await engine.dispose()
            return

        # Create project
        project = Project(
            name=PROJECT_NAME,
            description=PROJECT_DESCRIPTION,
            is_reference=True,
            created_by=None,
        )
        db.add(project)
        await db.flush()
        pid = project.id
        print(f"Created reference project: id={pid}")

        # Create experiment
        experiment = Experiment(
            project_id=pid,
            name=EXPERIMENT_NAME,
            assay_type=EXPERIMENT_ASSAY,
            status="complete",
            created_by=None,
        )
        db.add(experiment)
        await db.flush()
        eid = experiment.id
        print(f"Created experiment: id={eid}")

        # Create reactions
        reaction_map: dict[str, Reaction] = {}
        for rxn_data in REACTIONS:
            rxn = Reaction(
                experiment_id=eid,
                fastq_prefix=rxn_data["fastq_prefix"],
                short_name=rxn_data["short_name"],
                organism=rxn_data["organism"],
                assay_type=rxn_data["assay_type"],
                experimental_condition=rxn_data["experimental_condition"],
            )
            db.add(rxn)
            await db.flush()
            reaction_map[rxn_data["short_name"]] = rxn
            print(f"  Reaction: {rxn_data['short_name']} (id={rxn.id})")

        # Build reaction params for jobs
        reaction_params = [
            {"reaction_id": rxn.id, "short_name": rxn.short_name}
            for rxn in reaction_map.values()
        ]
        sample_params = [
            {"short_name": rxn.short_name, "label": rxn.short_name}
            for rxn in reaction_map.values()
        ]
        diffbind_samples = [
            {
                "sample_id": rxn.short_name,
                "condition": "mut" if "mut" in rxn.short_name else "ctrl",
                "replicate": int(rxn.short_name.split("_")[-1]),
                "factor": "MeCP2",
            }
            for rxn in reaction_map.values()
        ]

        # Create jobs
        job_map: dict[int, AnalysisJob] = {}  # dev_job_id -> AnalysisJob
        for dev_id, job_type, name, parent_dev_id, params in JOBS:
            parent_job_id = job_map[parent_dev_id].id if parent_dev_id else None

            # Fill in dynamic params
            if "reactions" in params:
                params["reactions"] = reaction_params
            if "samples" in params:
                if job_type == "diffbind":
                    params["samples"] = diffbind_samples
                else:
                    params["samples"] = sample_params

            job = AnalysisJob(
                experiment_id=eid,
                job_type=job_type,
                name=name,
                status="complete",
                params=params,
                parent_job_id=parent_job_id,
                launched_by=None,
                duration_seconds=0,
            )
            db.add(job)
            await db.flush()
            job_map[dev_id] = job
            print(f"  Job: {name} (id={job.id}, dev_id={dev_id})")

        # Scan dev-data for job outputs and create JobOutput records
        dev_data_base = Path(__file__).resolve().parent.parent / "dev-data" / "projects" / "1" / "1"
        storage_base = Path(settings.STORAGE_ROOT) / "projects" / str(pid) / str(eid)

        total_size = 0
        output_count = 0

        for dev_id, job in job_map.items():
            dev_job_dir = dev_data_base / "jobs" / str(dev_id)
            if not dev_job_dir.exists():
                continue

            for file_path in sorted(dev_job_dir.rglob("*")):
                if not file_path.is_file():
                    continue

                rel_to_job = str(file_path.relative_to(dev_job_dir))
                category, file_type = classify_file(f"jobs/{dev_id}/{rel_to_job}")

                # Skip sample_sheet.csv — not a job output
                if category == "sample_sheet":
                    continue

                # Determine reaction_id from filename
                reaction_id = None
                rxn_name = get_reaction_name_from_file(file_path.name)
                if rxn_name and rxn_name in reaction_map:
                    reaction_id = reaction_map[rxn_name].id

                file_size = file_path.stat().st_size
                total_size += file_size

                # Build storage path relative to STORAGE_ROOT
                storage_rel = f"projects/{pid}/{eid}/jobs/{job.id}/{rel_to_job}"

                output = JobOutput(
                    job_id=job.id,
                    reaction_id=reaction_id,
                    file_category=category,
                    filename=file_path.name,
                    file_path=storage_rel,
                    file_type=file_type,
                    file_size_bytes=file_size,
                )
                db.add(output)
                output_count += 1

            # Create mock stub files if requested
            if mock:
                target_job_dir = storage_base / "jobs" / str(job.id)
                source_job_dir = dev_data_base / "jobs" / str(dev_id)
                if source_job_dir.exists():
                    for file_path in source_job_dir.rglob("*"):
                        if not file_path.is_file():
                            continue
                        rel_to_job = str(file_path.relative_to(source_job_dir))
                        target_path = target_job_dir / rel_to_job
                        target_path.parent.mkdir(parents=True, exist_ok=True)
                        if not target_path.exists():
                            # Create small stub (just copy for small files, truncate for large)
                            size = file_path.stat().st_size
                            if size < 1024 * 1024:  # < 1MB: copy fully
                                target_path.write_bytes(file_path.read_bytes())
                            else:
                                # Create a small placeholder
                                target_path.write_text(
                                    f"# Stub file for {file_path.name} ({size} bytes)\n"
                                )

        # Update storage bytes
        experiment.storage_bytes = total_size
        project.storage_bytes = total_size

        await db.commit()

        print(f"\nSeed complete:")
        print(f"  Project ID:    {pid}")
        print(f"  Experiment ID: {eid}")
        print(f"  Reactions:     {len(reaction_map)}")
        print(f"  Jobs:          {len(job_map)}")
        print(f"  Job outputs:   {output_count}")
        print(f"  Total size:    {total_size:,} bytes")
        print(f"\nData path: {storage_base}")
        if not mock:
            print(f"\nRsync dev-data to this path:")
            print(f"  rsync -avz --exclude='fastqs/raw/' \\")
            print(f"    dev-data/projects/1/1/ \\")
            print(f"    <host>:{storage_base}/")

    await engine.dispose()


async def rescan() -> None:
    """Rescan storage for an existing reference project and rebuild JobOutput records.

    Handles the common case where the seed script ran before files were rsynced:
    1. Renames job directories from dev IDs (11, 12, ...) to actual DB IDs
    2. Creates JobOutput records for all files found on disk
    3. Updates storage_bytes on experiment and project
    """
    engine = create_async_engine(str(settings.DATABASE_URL))
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with session_factory() as db:
        # Find existing reference project
        result = await db.execute(
            select(Project).where(Project.is_reference.is_(True))
        )
        project = result.scalar_one_or_none()
        if project is None:
            print("No reference project found. Run without --rescan first.")
            await engine.dispose()
            return

        # Find experiment
        result = await db.execute(
            select(Experiment).where(Experiment.project_id == project.id)
        )
        experiment = result.scalar_one_or_none()
        if experiment is None:
            print("No experiment found in reference project.")
            await engine.dispose()
            return

        pid = project.id
        eid = experiment.id
        print(f"Found reference project: id={pid}, experiment: id={eid}")

        # Find reactions
        result = await db.execute(
            select(Reaction).where(Reaction.experiment_id == eid)
        )
        reaction_map = {r.short_name: r for r in result.scalars().all()}
        print(f"  Reactions: {len(reaction_map)}")

        # Find jobs and build dev_id → job mapping using JOBS definition order
        result = await db.execute(
            select(AnalysisJob)
            .where(AnalysisJob.experiment_id == eid)
            .order_by(AnalysisJob.id)
        )
        jobs = list(result.scalars().all())

        # Match DB jobs to JOBS definition by job_type (unique per definition)
        job_by_type: dict[str, AnalysisJob] = {}
        for j in jobs:
            job_by_type[j.job_type] = j

        dev_id_to_job: dict[int, AnalysisJob] = {}
        for dev_id, job_type, name, _, _ in JOBS:
            if job_type in job_by_type:
                dev_id_to_job[dev_id] = job_by_type[job_type]
                print(f"  Job: {name} (db_id={job_by_type[job_type].id}, dev_id={dev_id})")

        storage_base = Path(settings.STORAGE_ROOT) / "projects" / str(pid) / str(eid)
        jobs_dir = storage_base / "jobs"

        if not jobs_dir.exists():
            print(f"\nNo jobs directory at {jobs_dir}")
            print("Ensure files are rsynced to the correct path.")
            await engine.dispose()
            return

        # Step 1: Resolve each job's actual directory on disk.
        # Files may be at jobs/{dev_id}/ (rsynced) or jobs/{job.id}/ (renamed).
        # Pick whichever has files; rename dev→actual when possible.
        job_scan_dir: dict[int, tuple[Path, int]] = {}  # dev_id -> (dir_to_scan, dir_label_for_path)
        for dev_id, job in dev_id_to_job.items():
            dev_dir = jobs_dir / str(dev_id)
            actual_dir = jobs_dir / str(job.id)

            if dev_id == job.id:
                # IDs match — no rename needed
                if actual_dir.exists():
                    job_scan_dir[dev_id] = (actual_dir, job.id)
                continue

            dev_has_files = dev_dir.exists() and any(dev_dir.rglob("*"))
            actual_has_files = actual_dir.exists() and any(actual_dir.rglob("*"))

            if dev_has_files and not actual_has_files:
                # Only dev dir has files — rename it
                if actual_dir.exists():
                    actual_dir.rmdir()  # Remove empty dir
                dev_dir.rename(actual_dir)
                print(f"  Renamed jobs/{dev_id}/ → jobs/{job.id}/")
                job_scan_dir[dev_id] = (actual_dir, job.id)
            elif dev_has_files and actual_has_files:
                # Both have files — scan the dev dir, store paths with dev_id
                print(f"  Both jobs/{dev_id}/ and jobs/{job.id}/ have files. Using jobs/{dev_id}/.")
                job_scan_dir[dev_id] = (dev_dir, dev_id)
            elif actual_has_files:
                # Only actual dir has files — use it
                job_scan_dir[dev_id] = (actual_dir, job.id)
            elif dev_dir.exists():
                # Dev dir exists but empty
                job_scan_dir[dev_id] = (dev_dir, dev_id)
            elif actual_dir.exists():
                # Actual dir exists but empty
                job_scan_dir[dev_id] = (actual_dir, job.id)

        # Step 2: Delete existing JobOutput records for these jobs
        job_ids = [j.id for j in dev_id_to_job.values()]
        await db.execute(
            delete(JobOutput).where(JobOutput.job_id.in_(job_ids))
        )
        await db.flush()

        # Step 3: Scan storage and create JobOutput records
        total_size = 0
        output_count = 0

        for dev_id, job in dev_id_to_job.items():
            if dev_id not in job_scan_dir:
                print(f"  Warning: No directory found for {job.name} (dev_id={dev_id}, db_id={job.id})")
                continue

            scan_dir, path_label = job_scan_dir[dev_id]
            job_file_count = 0

            for file_path in sorted(scan_dir.rglob("*")):
                if not file_path.is_file():
                    continue

                rel_to_job = str(file_path.relative_to(scan_dir))
                # Use dev_id for classification (classify_file has hardcoded path checks)
                category, file_type = classify_file(f"jobs/{dev_id}/{rel_to_job}")

                if category == "sample_sheet":
                    continue

                reaction_id = None
                rxn_name = get_reaction_name_from_file(file_path.name)
                if rxn_name and rxn_name in reaction_map:
                    reaction_id = reaction_map[rxn_name].id

                file_size = file_path.stat().st_size
                total_size += file_size

                # Use path_label (actual disk directory name) so path matches real location
                storage_rel = f"projects/{pid}/{eid}/jobs/{path_label}/{rel_to_job}"

                output = JobOutput(
                    job_id=job.id,
                    reaction_id=reaction_id,
                    file_category=category,
                    filename=file_path.name,
                    file_path=storage_rel,
                    file_type=file_type,
                    file_size_bytes=file_size,
                )
                db.add(output)
                output_count += 1
                job_file_count += 1

            print(f"  {job.name}: {job_file_count} outputs from jobs/{path_label}/")

        # Step 4: Update storage_bytes
        experiment.storage_bytes = total_size
        project.storage_bytes = total_size

        await db.commit()

        print(f"\nRescan complete:")
        print(f"  Job outputs created: {output_count}")
        print(f"  Total size:          {total_size:,} bytes ({total_size / 1024 / 1024:.1f} MB)")

    await engine.dispose()


def main():
    parser = argparse.ArgumentParser(description="Seed the Gold Standard Reference Project")
    parser.add_argument("--mock", action="store_true", help="Create stub files for local dev")
    parser.add_argument(
        "--rescan",
        action="store_true",
        help="Rescan storage for an existing reference project: rename job dirs, "
        "create JobOutput records, and update storage_bytes",
    )
    args = parser.parse_args()

    if args.rescan:
        asyncio.run(rescan())
    else:
        asyncio.run(seed(mock=args.mock))


if __name__ == "__main__":
    main()
