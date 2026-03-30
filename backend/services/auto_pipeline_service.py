# backend/services/auto_pipeline_service.py
"""
Auto-pipeline orchestrator: chains all analysis steps sequentially.

Flow: FastQC → Trimming (if adapters) → Alignment → Peak Calling →
      Roman Normalization (mouse) → DiffBind (if conditions) →
      Custom Heatmaps → Pearson Correlation
"""

import re
from datetime import datetime, timezone

import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import async_session_factory
from models.analysis_job import AnalysisJob
from models.experiment import Experiment
from models.fastq_file import FastqFile
from models.job_output import JobOutput
from models.reaction import Reaction

logger = structlog.get_logger()

_CONDITION_PATTERNS = {
    "ctrl": re.compile(r"ctrl|control|wt|wildtype|wild_type", re.IGNORECASE),
    "mut": re.compile(r"mut|mutant|ko|knockout|knock_out", re.IGNORECASE),
}


async def start_auto_pipeline(
    db: AsyncSession,
    experiment_id: int,
    user_id: int,
    config: dict,
) -> None:
    """Enable auto-pipeline on an experiment."""
    project_id = (
        await db.execute(select(Experiment.project_id).where(Experiment.id == experiment_id))
    ).scalar_one()

    config["project_id"] = project_id
    config["launched_by"] = user_id

    await db.execute(
        update(Experiment)
        .where(Experiment.id == experiment_id)
        .values(
            auto_pipeline=True,
            auto_pipeline_status="pending_fastqc",
            auto_pipeline_config=config,
        )
    )
    await db.commit()

    # If FastQC is already done, skip straight to evaluation
    result = await db.execute(
        select(FastqFile)
        .where(FastqFile.experiment_id == experiment_id)
        .where(FastqFile.is_trimmed.is_(False))
    )
    raw_fastqs = result.scalars().all()
    all_have_fastqc = raw_fastqs and all(f.total_reads is not None for f in raw_fastqs)

    if all_have_fastqc:
        logger.info("auto_pipeline.fastqc_already_done", experiment_id=experiment_id)
        await _evaluate_fastqc_and_queue(db, experiment_id, config, raw_fastqs)


async def on_fastqc_complete(experiment_id: int) -> None:
    """Called after FastQC files are processed. Evaluates adapter status only when ALL are done."""
    async with async_session_factory() as db:
        exp = (
            await db.execute(select(Experiment).where(Experiment.id == experiment_id))
        ).scalar_one_or_none()

        if not exp or exp.auto_pipeline_status != "pending_fastqc":
            return

        config = exp.auto_pipeline_config or {}
        result = await db.execute(
            select(FastqFile)
            .where(FastqFile.experiment_id == experiment_id)
            .where(FastqFile.is_trimmed.is_(False))
        )
        raw_fastqs = result.scalars().all()

        # Wait until ALL raw FASTQs have completed FastQC before evaluating
        all_have_fastqc = raw_fastqs and all(f.total_reads is not None for f in raw_fastqs)
        if not all_have_fastqc:
            logger.info(
                "auto_pipeline.fastqc_not_all_done",
                experiment_id=experiment_id,
                total=len(raw_fastqs),
                done=sum(1 for f in raw_fastqs if f.total_reads is not None),
            )
            return

        await _evaluate_fastqc_and_queue(db, experiment_id, config, raw_fastqs)


async def _evaluate_fastqc_and_queue(
    db: AsyncSession,
    experiment_id: int,
    config: dict,
    raw_fastqs: list,
) -> None:
    """Check adapter status and queue trimming or alignment."""
    adapters_detected = any(f.adapter_status in ("warn", "fail") for f in raw_fastqs)

    await db.execute(
        update(Experiment)
        .where(Experiment.id == experiment_id)
        .values(auto_pipeline_status="running")
    )
    await db.commit()

    if adapters_detected:
        logger.info("auto_pipeline.adapters_detected", experiment_id=experiment_id)
        await _queue_trimming(db, experiment_id, config)
    else:
        logger.info("auto_pipeline.no_adapters", experiment_id=experiment_id)
        await _queue_alignment(db, experiment_id, config, parent_job_id=None)


async def on_job_complete(experiment_id: int, job_id: int, job_type: str) -> None:
    """Called by the worker after an auto-pipeline job completes successfully."""
    async with async_session_factory() as db:
        exp = (
            await db.execute(select(Experiment).where(Experiment.id == experiment_id))
        ).scalar_one_or_none()

        if not exp or exp.auto_pipeline_status != "running":
            return

        config = exp.auto_pipeline_config or {}
        logger.info(
            "auto_pipeline.step_complete",
            experiment_id=experiment_id,
            job_type=job_type,
            job_id=job_id,
        )

        if job_type == "trimming":
            await _queue_alignment(db, experiment_id, config, parent_job_id=job_id)

        elif job_type == "alignment":
            await _queue_peak_calling(db, experiment_id, config, alignment_job_id=job_id)

        elif job_type == "peak_calling":
            genome = config.get("reference_genome", "")
            is_mouse = genome == "mm10"
            if is_mouse and config.get("include_normalization", True):
                await _queue_normalization(
                    db,
                    experiment_id,
                    config,
                    alignment_job_id=_get_alignment_job_id(config, job_id),
                )
            else:
                await _queue_post_normalization(db, experiment_id, config, job_id)

        elif job_type == "roman_normalization":
            await _queue_post_normalization(db, experiment_id, config, job_id)

        elif job_type == "diffbind":
            if config.get("include_heatmap", True):
                await _queue_custom_heatmap(db, experiment_id, config)
            elif config.get("include_pearson", True):
                await _queue_pearson(db, experiment_id, config)
            else:
                await _mark_complete(db, experiment_id)

        elif job_type == "custom_heatmap":
            if config.get("include_pearson", True):
                await _queue_pearson(db, experiment_id, config)
            else:
                await _mark_complete(db, experiment_id)

        elif job_type == "pearson_correlation":
            await _mark_complete(db, experiment_id)


async def _queue_post_normalization(
    db: AsyncSession,
    experiment_id: int,
    config: dict,
    parent_job_id: int,
) -> None:
    """Queue steps after normalization (or after peak calling for non-mouse)."""
    if config.get("include_diffbind", True):
        can_diffbind = await _can_run_diffbind(db, experiment_id)
        if can_diffbind:
            await _queue_diffbind(db, experiment_id, config)
            return

    if config.get("include_heatmap", True):
        await _queue_custom_heatmap(db, experiment_id, config)
    elif config.get("include_pearson", True):
        await _queue_pearson(db, experiment_id, config)
    else:
        await _mark_complete(db, experiment_id)


async def on_job_error(experiment_id: int, job_id: int, job_type: str) -> None:
    """Called by the worker when an auto-pipeline job fails."""
    async with async_session_factory() as db:
        await db.execute(
            update(Experiment)
            .where(Experiment.id == experiment_id)
            .values(auto_pipeline_status="error")
        )
        await db.commit()
        logger.warning(
            "auto_pipeline.step_failed",
            experiment_id=experiment_id,
            job_type=job_type,
            job_id=job_id,
        )


async def retry_auto_pipeline(
    db: AsyncSession,
    experiment_id: int,
    user_id: int,
) -> AnalysisJob | None:
    """Retry the failed auto-pipeline step and resume the chain.

    Returns the newly created job, or None if experiment is not in error state
    or no failed auto-pipeline job exists.
    """
    exp = (
        await db.execute(select(Experiment).where(Experiment.id == experiment_id))
    ).scalar_one_or_none()

    if not exp or exp.auto_pipeline_status != "error":
        return None

    # Find the most recent failed auto-pipeline job
    failed_job = (
        await db.execute(
            select(AnalysisJob)
            .where(
                AnalysisJob.experiment_id == experiment_id,
                AnalysisJob.auto_pipeline.is_(True),
                AnalysisJob.status == "error",
            )
            .order_by(AnalysisJob.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if not failed_job:
        return None

    new_job = AnalysisJob(
        experiment_id=experiment_id,
        job_type=failed_job.job_type,
        name=failed_job.name,
        params=dict(failed_job.params) if failed_job.params else {},
        parent_job_id=failed_job.parent_job_id,
        retry_of_job_id=failed_job.id,
        launched_by=user_id,
        auto_pipeline=True,
    )
    db.add(new_job)

    await db.execute(
        update(Experiment)
        .where(Experiment.id == experiment_id)
        .values(auto_pipeline_status="running")
    )

    await db.commit()
    await db.refresh(new_job)

    logger.info(
        "auto_pipeline.retry",
        experiment_id=experiment_id,
        failed_job_id=failed_job.id,
        new_job_id=new_job.id,
        job_type=failed_job.job_type,
    )
    return new_job


async def cancel_auto_pipeline(db: AsyncSession, experiment_id: int) -> None:
    """Cancel auto-pipeline. Terminate queued jobs, leave completed ones."""
    await db.execute(
        update(Experiment)
        .where(Experiment.id == experiment_id)
        .values(auto_pipeline_status="cancelled")
    )
    await db.execute(
        update(AnalysisJob)
        .where(AnalysisJob.experiment_id == experiment_id)
        .where(AnalysisJob.auto_pipeline.is_(True))
        .where(AnalysisJob.status == "queued")
        .values(
            status="terminated",
            termination_requested_at=datetime.now(timezone.utc),
        )
    )
    await db.commit()
    logger.info("auto_pipeline.cancelled", experiment_id=experiment_id)


# ---------------------------------------------------------------------------
# Queue helpers — each creates a real AnalysisJob with auto_pipeline=True
# ---------------------------------------------------------------------------


async def _queue_trimming(db: AsyncSession, experiment_id: int, config: dict) -> None:
    """Queue a trimming job with default parameters."""
    result = await db.execute(
        select(FastqFile)
        .where(FastqFile.experiment_id == experiment_id)
        .where(FastqFile.is_trimmed.is_(False))
    )
    raw_fastqs = result.scalars().all()

    # Group by prefix to build pairs
    pairs_map: dict[str, dict] = {}
    for f in raw_fastqs:
        if f.prefix not in pairs_map:
            pairs_map[f.prefix] = {"prefix": f.prefix}
        if f.read_direction == "R1":
            pairs_map[f.prefix]["r1_path"] = f.file_path
            pairs_map[f.prefix]["r1_id"] = f.id
        elif f.read_direction == "R2":
            pairs_map[f.prefix]["r2_path"] = f.file_path
            pairs_map[f.prefix]["r2_id"] = f.id

    fastq_pairs = [p for p in pairs_map.values() if "r1_path" in p and "r2_path" in p]

    params = {
        "experiment_id": experiment_id,
        "project_id": config["project_id"],
        "fastq_pairs": fastq_pairs,
    }
    await _create_auto_job(db, experiment_id, "trimming", "Auto: Trimming", params, config)


async def _queue_alignment(
    db: AsyncSession, experiment_id: int, config: dict, parent_job_id: int | None
) -> None:
    """Queue an alignment job with default parameters."""
    reactions = await _get_reactions(db, experiment_id)
    reaction_params = [{"reaction_id": r.id, "short_name": r.short_name} for r in reactions]

    params = {
        "experiment_id": experiment_id,
        "project_id": config["project_id"],
        "reference_genome": config["reference_genome"],
        "remove_duplicates": True,
        "remove_dac_exclusion": True,
        "blacklist_source": "both",
        "bam_coverage_bin_size": 20,
        "smoothed_bin_size": 100,
        "reactions": reaction_params,
    }
    await _create_auto_job(
        db, experiment_id, "alignment", "Auto: Alignment", params, config, parent_job_id
    )


async def _queue_peak_calling(
    db: AsyncSession, experiment_id: int, config: dict, alignment_job_id: int
) -> None:
    """Queue peak calling with IgG auto-assigned."""
    reactions = await _get_reactions(db, experiment_id)
    igg = next((r for r in reactions if "igg" in r.short_name.lower()), None)

    # Resolve BAM paths from alignment outputs
    result = await db.execute(
        select(JobOutput)
        .where(JobOutput.job_id == alignment_job_id)
        .where(JobOutput.file_category == "unique_bam")
        .where(JobOutput.file_type == "bam")
    )
    bam_outputs = result.scalars().all()
    bam_map = {o.reaction_id: o.file_path for o in bam_outputs}

    reaction_params = []
    for r in reactions:
        rp: dict = {
            "reaction_id": r.id,
            "short_name": r.short_name,
            "bam_path": bam_map.get(r.id, ""),
        }
        if igg and r.id != igg.id:
            rp["igg_control_reaction_id"] = igg.id
        reaction_params.append(rp)

    params = {
        "experiment_id": experiment_id,
        "project_id": config["project_id"],
        "parent_job_id": alignment_job_id,
        "alignment_job_id": alignment_job_id,
        "reference_genome": config["reference_genome"],
        "peak_caller": config.get("peak_caller", "macs2"),
        "peak_size": config.get("peak_size", "narrow"),
        "macs2_qvalue": config.get("macs2_qvalue", 0.01),
        "fragment_filter": config.get("fragment_filter", True),
        "reactions": reaction_params,
    }
    # Store alignment_job_id in config for later steps
    config["_alignment_job_id"] = alignment_job_id
    await db.execute(
        update(Experiment).where(Experiment.id == experiment_id).values(auto_pipeline_config=config)
    )
    await _create_auto_job(
        db, experiment_id, "peak_calling", "Auto: Peak Calling", params, config, alignment_job_id
    )


async def _queue_normalization(
    db: AsyncSession, experiment_id: int, config: dict, alignment_job_id: int
) -> None:
    """Queue Roman normalization (mouse only)."""
    reactions = await _get_reactions(db, experiment_id)
    non_igg = [r for r in reactions if "igg" not in r.short_name.lower()]

    # Resolve bigWig paths from alignment
    result = await db.execute(
        select(JobOutput)
        .where(JobOutput.job_id == alignment_job_id)
        .where(JobOutput.file_category == "bigwig")
        .where(JobOutput.file_type == "bw")
    )
    bw_outputs = result.scalars().all()
    bw_map = {o.reaction_id: o.file_path for o in bw_outputs}

    sample_params = [
        {
            "reaction_id": r.id,
            "short_name": r.short_name,
            "label": r.short_name,
            "bigwig_path": bw_map.get(r.id, ""),
        }
        for r in non_igg
    ]

    params = {
        "experiment_id": experiment_id,
        "project_id": config["project_id"],
        "parent_job_id": alignment_job_id,
        "alignment_job_id": alignment_job_id,
        "reference_genome": "mm10",
        "samples": sample_params,
    }
    await _create_auto_job(
        db,
        experiment_id,
        "roman_normalization",
        "Auto: Normalization",
        params,
        config,
        alignment_job_id,
    )


async def _can_run_diffbind(db: AsyncSession, experiment_id: int) -> bool:
    """Check if DiffBind can run (≥2 conditions with ≥2 replicates each)."""
    reactions = await _get_reactions(db, experiment_id)
    conditions = _detect_conditions(reactions)
    valid_conditions = {c: rs for c, rs in conditions.items() if len(rs) >= 2}
    return len(valid_conditions) >= 2


async def _queue_diffbind(db: AsyncSession, experiment_id: int, config: dict) -> None:
    """Queue DiffBind with auto-detected conditions."""
    reactions = await _get_reactions(db, experiment_id)
    conditions = _detect_conditions(reactions)
    valid_conditions = {c: rs for c, rs in conditions.items() if len(rs) >= 2}

    alignment_job_id = config.get("_alignment_job_id")
    peak_calling_job = await _find_latest_auto_job(db, experiment_id, "peak_calling")
    if not peak_calling_job or not alignment_job_id:
        return

    # Resolve BAMs from alignment
    bam_result = await db.execute(
        select(JobOutput)
        .where(JobOutput.job_id == alignment_job_id)
        .where(JobOutput.file_category == "unique_bam")
        .where(JobOutput.file_type == "bam")
    )
    bam_map = {o.reaction_id: o.file_path for o in bam_result.scalars().all()}

    # Resolve BEDs from peak calling
    bed_result = await db.execute(
        select(JobOutput)
        .where(JobOutput.job_id == peak_calling_job.id)
        .where(JobOutput.file_category == "bed")
    )
    bed_map = {
        o.reaction_id: (o.file_path, o.file_type or "bed") for o in bed_result.scalars().all()
    }

    sample_params = []
    for condition, rxns in valid_conditions.items():
        for rep_num, r in enumerate(rxns, 1):
            bam_path = bam_map.get(r.id, "")
            bed_info = bed_map.get(r.id, ("", "bed"))
            sample_params.append(
                {
                    "reaction_id": r.id,
                    "short_name": r.short_name,
                    "condition": condition,
                    "replicate": rep_num,
                    "bam_path": bam_path,
                    "peak_path": bed_info[0],
                    "peak_caller": "bed",
                }
            )

    params = {
        "experiment_id": experiment_id,
        "project_id": config["project_id"],
        "parent_job_id": peak_calling_job.id,
        "alignment_job_id": alignment_job_id,
        "analysis_method": "deseq2_consensus",
        "samples": sample_params,
    }
    await _create_auto_job(
        db, experiment_id, "diffbind", "Auto: DiffBind", params, config, peak_calling_job.id
    )


async def _queue_custom_heatmap(db: AsyncSession, experiment_id: int, config: dict) -> None:
    """Queue custom heatmap using peak calling BEDs + best available bigWigs."""
    alignment_job_id = config.get("_alignment_job_id")
    peak_calling_job = await _find_latest_auto_job(db, experiment_id, "peak_calling")
    if not peak_calling_job or not alignment_job_id:
        await _mark_complete(db, experiment_id)
        return

    # Find a BED file from peak calling
    bed_result = await db.execute(
        select(JobOutput)
        .where(JobOutput.job_id == peak_calling_job.id)
        .where(JobOutput.file_category == "bed")
    )
    bed_outputs = bed_result.scalars().all()
    if not bed_outputs:
        logger.warning("auto_pipeline.no_bed_for_heatmap", experiment_id=experiment_id)
        if config.get("include_pearson", True):
            await _queue_pearson(db, experiment_id, config)
        else:
            await _mark_complete(db, experiment_id)
        return

    first_bed = bed_outputs[0]

    # Resolve bigWigs (prefer rnorm if available)
    bw_source_job_id, bw_category = await _resolve_best_bigwig_source(
        db, experiment_id, alignment_job_id
    )

    reactions = await _get_reactions(db, experiment_id)
    non_igg = [r for r in reactions if "igg" not in r.short_name.lower()]

    bw_result = await db.execute(
        select(JobOutput)
        .where(JobOutput.job_id == bw_source_job_id)
        .where(JobOutput.file_category == bw_category)
        .where(JobOutput.file_type == "bw")
    )
    bw_map = {o.reaction_id: o.file_path for o in bw_result.scalars().all()}

    sample_params = [
        {
            "reaction_id": r.id,
            "short_name": r.short_name,
            "label": r.short_name,
            "bigwig_path": bw_map.get(r.id, ""),
        }
        for r in non_igg
    ]

    parent_id = bw_source_job_id
    params = {
        "experiment_id": experiment_id,
        "project_id": config["project_id"],
        "parent_job_id": parent_id,
        "alignment_job_id": alignment_job_id,
        "bed_source": "peak_calling",
        "bed_path": first_bed.file_path,
        "bed_output_id": first_bed.id,
        "bed_label": first_bed.filename,
        "samples": sample_params,
        "flanking_upstream": 1500,
        "flanking_downstream": 1500,
        "reference_point": "center",
        "sort_order": "descend",
        "color_map": None,
        "z_min": None,
        "z_max": None,
    }
    await _create_auto_job(
        db, experiment_id, "custom_heatmap", "Auto: Heatmap", params, config, parent_id
    )


async def _queue_pearson(db: AsyncSession, experiment_id: int, config: dict) -> None:
    """Queue Pearson correlation with best available bigWigs."""
    alignment_job_id = config.get("_alignment_job_id")
    if not alignment_job_id:
        await _mark_complete(db, experiment_id)
        return

    bw_source_job_id, bw_category = await _resolve_best_bigwig_source(
        db, experiment_id, alignment_job_id
    )

    reactions = await _get_reactions(db, experiment_id)
    non_igg = [r for r in reactions if "igg" not in r.short_name.lower()]

    bw_result = await db.execute(
        select(JobOutput)
        .where(JobOutput.job_id == bw_source_job_id)
        .where(JobOutput.file_category == bw_category)
        .where(JobOutput.file_type == "bw")
    )
    bw_map = {o.reaction_id: o.file_path for o in bw_result.scalars().all()}

    sample_params = [
        {
            "reaction_id": r.id,
            "short_name": r.short_name,
            "label": r.short_name,
            "bigwig_path": bw_map.get(r.id, ""),
        }
        for r in non_igg
    ]

    parent_id = bw_source_job_id
    norm_job = await _find_latest_auto_job(db, experiment_id, "roman_normalization")
    bigwig_resolution = 50 if bw_category == "normalization_bigwig" else 20
    params: dict = {
        "experiment_id": experiment_id,
        "project_id": config["project_id"],
        "parent_job_id": parent_id,
        "alignment_job_id": alignment_job_id,
        "reference_genome": config.get("reference_genome", ""),
        "samples": sample_params,
        "restrict_bed_path": None,
        "restrict_bed_label": None,
        "bigwig_resolution": bigwig_resolution,
    }
    if norm_job and norm_job.status == "complete":
        params["normalization_job_id"] = norm_job.id

    await _create_auto_job(
        db, experiment_id, "pearson_correlation", "Auto: Pearson", params, config, parent_id
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _create_auto_job(
    db: AsyncSession,
    experiment_id: int,
    job_type: str,
    name: str,
    params: dict,
    config: dict,
    parent_job_id: int | None = None,
) -> AnalysisJob:
    """Create an auto-pipeline job record."""
    job = AnalysisJob(
        experiment_id=experiment_id,
        job_type=job_type,
        name=name,
        params=params,
        parent_job_id=parent_job_id,
        launched_by=config.get("launched_by"),
        auto_pipeline=True,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    logger.info(
        "auto_pipeline.job_queued",
        experiment_id=experiment_id,
        job_type=job_type,
        job_id=job.id,
    )
    return job


async def _get_reactions(db: AsyncSession, experiment_id: int) -> list:
    """Fetch all reactions for an experiment."""
    result = await db.execute(select(Reaction).where(Reaction.experiment_id == experiment_id))
    return list(result.scalars().all())


async def _find_latest_auto_job(
    db: AsyncSession, experiment_id: int, job_type: str
) -> AnalysisJob | None:
    """Find the most recent completed auto-pipeline job of a given type."""
    result = await db.execute(
        select(AnalysisJob)
        .where(AnalysisJob.experiment_id == experiment_id)
        .where(AnalysisJob.job_type == job_type)
        .where(AnalysisJob.auto_pipeline.is_(True))
        .where(AnalysisJob.status == "complete")
        .order_by(AnalysisJob.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def _resolve_best_bigwig_source(
    db: AsyncSession, experiment_id: int, alignment_job_id: int
) -> tuple[int, str]:
    """Return (job_id, file_category) for the best available bigWig source."""
    norm_job = await _find_latest_auto_job(db, experiment_id, "roman_normalization")
    if norm_job:
        return norm_job.id, "normalization_bigwig"
    return alignment_job_id, "bigwig"


def _detect_conditions(reactions: list) -> dict[str, list]:
    """Auto-detect conditions from reaction metadata or short_name patterns."""
    conditions: dict[str, list] = {}

    for r in reactions:
        if "igg" in r.short_name.lower():
            continue

        condition = None

        # Tier 1: explicit experimental_condition field
        if r.experimental_condition:
            condition = r.experimental_condition.strip()

        # Tier 2: parse short_name for common patterns
        if not condition:
            for cond_name, pattern in _CONDITION_PATTERNS.items():
                if pattern.search(r.short_name):
                    condition = cond_name
                    break

        if condition:
            conditions.setdefault(condition, []).append(r)

    return conditions


def _get_alignment_job_id(config: dict, fallback_job_id: int) -> int:
    """Extract the alignment job ID from auto-pipeline config."""
    return config.get("_alignment_job_id", fallback_job_id)


async def _mark_complete(db: AsyncSession, experiment_id: int) -> None:
    """Mark the auto-pipeline as complete."""
    await db.execute(
        update(Experiment)
        .where(Experiment.id == experiment_id)
        .values(auto_pipeline_status="complete")
    )
    await db.commit()
    logger.info("auto_pipeline.complete", experiment_id=experiment_id)
