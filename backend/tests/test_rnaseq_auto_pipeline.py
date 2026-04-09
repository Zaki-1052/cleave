# backend/tests/test_rnaseq_auto_pipeline.py
"""Tests for RNA-seq auto-pipeline chain.

Verifies: FastQC -> fastp -> STAR+Salmon -> [DE Analysis] -> complete.
Uses direct service function calls against the test database.
"""

from sqlalchemy import select
from sqlalchemy import update as sa_update

from models.analysis_job import AnalysisJob
from models.experiment import Experiment
from models.fastq_file import FastqFile
from models.project import Project, ProjectMember
from models.reaction import Reaction
from models.user import User
from tests.conftest import test_session_factory


async def _setup_rnaseq_experiment(
    *,
    with_fastqc: bool = True,
    adapter_status: str = "pass",
    with_trimmed: bool = False,
    with_conditions: bool = False,
    use_treatment_field: bool = False,
):
    """Create an RNA-seq experiment with reactions and FASTQs for testing."""
    async with test_session_factory() as db:
        user = User(email="auto@test.com", hashed_password="x")
        db.add(user)
        await db.flush()

        project = Project(name="Test Project", created_by=user.id)
        db.add(project)
        await db.flush()

        member = ProjectMember(project_id=project.id, user_id=user.id, role="admin")
        db.add(member)

        exp = Experiment(
            project_id=project.id,
            name="RNA-seq Test",
            assay_type="RNA-seq",
            created_by=user.id,
        )
        db.add(exp)
        await db.flush()

        # Create reactions — use neutral names when no conditions desired
        # to avoid Tier 3 short_name pattern matching
        prefixes = (
            ["sample_ctrl_1", "sample_ctrl_2", "sample_mut_1", "sample_mut_2"]
            if with_conditions
            else ["sample_A_1", "sample_A_2", "sample_B_1", "sample_B_2"]
        )
        for prefix in prefixes:
            rxn_kwargs = {
                "experiment_id": exp.id,
                "fastq_prefix": prefix,
                "short_name": prefix,
                "organism": "Mouse",
                "assay_type": "RNA-seq",
            }
            if with_conditions:
                if use_treatment_field:
                    rxn_kwargs["treatment"] = "ctrl" if "ctrl" in prefix else "mut"
                else:
                    rxn_kwargs["experimental_condition"] = "ctrl" if "ctrl" in prefix else "mut"
            db.add(Reaction(**rxn_kwargs))

        # Create raw FASTQ files
        for prefix in prefixes:
            for direction in ["R1", "R2"]:
                f = FastqFile(
                    experiment_id=exp.id,
                    filename=f"{prefix}_{direction}_001.fastq.gz",
                    prefix=prefix,
                    read_direction=direction,
                    file_path=f"projects/{project.id}/{exp.id}/fastqs/raw/{prefix}_{direction}_001.fastq.gz",
                    total_reads=1000000 if with_fastqc else None,
                    adapter_status=adapter_status if with_fastqc else None,
                )
                db.add(f)

        # Optionally create trimmed FASTQ files
        if with_trimmed:
            for prefix in prefixes:
                for direction in ["R1", "R2"]:
                    f = FastqFile(
                        experiment_id=exp.id,
                        filename=f"{prefix}_{direction}_001_trimmed.fastq.gz",
                        prefix=prefix,
                        read_direction=direction,
                        file_path=f"projects/{project.id}/{exp.id}/fastqs/trimmed/{prefix}_{direction}_001_trimmed.fastq.gz",
                        is_trimmed=True,
                        total_reads=900000,
                    )
                    db.add(f)

        await db.commit()
        return {
            "experiment_id": exp.id,
            "project_id": project.id,
            "user_id": user.id,
        }


async def _get_auto_jobs(experiment_id: int) -> list[AnalysisJob]:
    """Fetch all auto-pipeline jobs for an experiment."""
    async with test_session_factory() as db:
        result = await db.execute(
            select(AnalysisJob)
            .where(AnalysisJob.experiment_id == experiment_id)
            .where(AnalysisJob.auto_pipeline.is_(True))
            .order_by(AnalysisJob.created_at)
        )
        return list(result.scalars().all())


async def _get_experiment(experiment_id: int) -> Experiment:
    async with test_session_factory() as db:
        result = await db.execute(select(Experiment).where(Experiment.id == experiment_id))
        return result.scalar_one()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_start_rnaseq_auto_pipeline_sets_status(setup_db, patch_worker_sessions):
    """Starting auto-pipeline stores assay_type and sets pending_fastqc."""
    from services.auto_pipeline_service import start_auto_pipeline

    ids = await _setup_rnaseq_experiment(with_fastqc=False)

    async with test_session_factory() as db:
        config = {"reference_genome": "mm10", "remove_duplicates": False}
        await start_auto_pipeline(db, ids["experiment_id"], ids["user_id"], config)

    exp = await _get_experiment(ids["experiment_id"])
    assert exp.auto_pipeline_status == "pending_fastqc"
    assert exp.auto_pipeline_config["assay_type"] == "RNA-seq"
    assert exp.auto_pipeline_config["reference_genome"] == "mm10"


async def test_rnaseq_fastqc_complete_always_queues_trimming(setup_db, patch_worker_sessions):
    """RNA-seq always queues fastp trimming even without adapter issues."""
    from services.auto_pipeline_service import start_auto_pipeline

    ids = await _setup_rnaseq_experiment(with_fastqc=True, adapter_status="pass")

    async with test_session_factory() as db:
        config = {"reference_genome": "mm10"}
        await start_auto_pipeline(db, ids["experiment_id"], ids["user_id"], config)

    jobs = await _get_auto_jobs(ids["experiment_id"])
    assert len(jobs) == 1
    assert jobs[0].job_type == "rnaseq_trimming"
    assert jobs[0].name == "Auto: Trimming (fastp)"


async def test_rnaseq_fastqc_with_adapters_queues_trimming(setup_db, patch_worker_sessions):
    """RNA-seq queues fastp trimming when adapters are detected too."""
    from services.auto_pipeline_service import start_auto_pipeline

    ids = await _setup_rnaseq_experiment(with_fastqc=True, adapter_status="warn")

    async with test_session_factory() as db:
        config = {"reference_genome": "mm10"}
        await start_auto_pipeline(db, ids["experiment_id"], ids["user_id"], config)

    jobs = await _get_auto_jobs(ids["experiment_id"])
    assert len(jobs) == 1
    assert jobs[0].job_type == "rnaseq_trimming"


async def test_rnaseq_trimming_complete_queues_alignment(setup_db, patch_worker_sessions):
    """Completing rnaseq_trimming queues rnaseq_alignment."""
    from services.auto_pipeline_service import on_job_complete, start_auto_pipeline

    ids = await _setup_rnaseq_experiment(with_fastqc=True)

    async with test_session_factory() as db:
        config = {"reference_genome": "mm10"}
        await start_auto_pipeline(db, ids["experiment_id"], ids["user_id"], config)

    trim_jobs = await _get_auto_jobs(ids["experiment_id"])
    trim_job = trim_jobs[0]

    # Simulate worker completing the trimming job
    async with test_session_factory() as db:
        await db.execute(
            sa_update(AnalysisJob).where(AnalysisJob.id == trim_job.id).values(status="complete")
        )
        await db.commit()

    await on_job_complete(ids["experiment_id"], trim_job.id, "rnaseq_trimming")

    jobs = await _get_auto_jobs(ids["experiment_id"])
    alignment_jobs = [j for j in jobs if j.job_type == "rnaseq_alignment"]
    assert len(alignment_jobs) == 1
    assert alignment_jobs[0].name == "Auto: Alignment (STAR+Salmon)"
    assert alignment_jobs[0].parent_job_id == trim_job.id


async def test_rnaseq_alignment_params_correct(setup_db, patch_worker_sessions):
    """RNA-seq alignment job has correct params (no blacklist, dedup OFF)."""
    from services.auto_pipeline_service import on_job_complete, start_auto_pipeline

    ids = await _setup_rnaseq_experiment(with_fastqc=True)

    async with test_session_factory() as db:
        config = {"reference_genome": "mm10", "remove_duplicates": False}
        await start_auto_pipeline(db, ids["experiment_id"], ids["user_id"], config)

    trim_jobs = await _get_auto_jobs(ids["experiment_id"])

    async with test_session_factory() as db:
        await db.execute(
            sa_update(AnalysisJob)
            .where(AnalysisJob.id == trim_jobs[0].id)
            .values(status="complete")
        )
        await db.commit()

    await on_job_complete(ids["experiment_id"], trim_jobs[0].id, "rnaseq_trimming")

    jobs = await _get_auto_jobs(ids["experiment_id"])
    align_job = [j for j in jobs if j.job_type == "rnaseq_alignment"][0]
    params = align_job.params

    assert params["reference_genome"] == "mm10"
    assert params["remove_duplicates"] is False
    assert "remove_dac_exclusion" not in params
    assert "blacklist_source" not in params
    assert len(params["reactions"]) == 4


async def test_rnaseq_alignment_complete_queues_de(setup_db, patch_worker_sessions):
    """Completing rnaseq_alignment queues rnaseq_de when conditions are detected."""
    from services.auto_pipeline_service import on_job_complete, start_auto_pipeline

    ids = await _setup_rnaseq_experiment(with_fastqc=True, with_conditions=True)

    async with test_session_factory() as db:
        config = {"reference_genome": "mm10", "include_de": True}
        await start_auto_pipeline(db, ids["experiment_id"], ids["user_id"], config)

    # Simulate trimming -> alignment chain
    trim_jobs = await _get_auto_jobs(ids["experiment_id"])
    async with test_session_factory() as db:
        await db.execute(
            sa_update(AnalysisJob)
            .where(AnalysisJob.id == trim_jobs[0].id)
            .values(status="complete")
        )
        await db.commit()
    await on_job_complete(ids["experiment_id"], trim_jobs[0].id, "rnaseq_trimming")

    align_jobs = [
        j for j in await _get_auto_jobs(ids["experiment_id"]) if j.job_type == "rnaseq_alignment"
    ]
    async with test_session_factory() as db:
        await db.execute(
            sa_update(AnalysisJob)
            .where(AnalysisJob.id == align_jobs[0].id)
            .values(status="complete")
        )
        await db.commit()
    await on_job_complete(ids["experiment_id"], align_jobs[0].id, "rnaseq_alignment")

    all_jobs = await _get_auto_jobs(ids["experiment_id"])
    de_jobs = [j for j in all_jobs if j.job_type == "rnaseq_de"]
    assert len(de_jobs) == 1
    assert de_jobs[0].name == "Auto: DE Analysis (DESeq2)"
    assert de_jobs[0].params["quantification_source"] == "salmon"
    assert len(de_jobs[0].params["samples"]) == 4


async def test_rnaseq_alignment_complete_without_conditions_marks_done(
    setup_db, patch_worker_sessions
):
    """Without detectable conditions, pipeline marks complete after alignment."""
    from services.auto_pipeline_service import on_job_complete, start_auto_pipeline

    # No conditions assigned to reactions
    ids = await _setup_rnaseq_experiment(with_fastqc=True, with_conditions=False)

    async with test_session_factory() as db:
        config = {"reference_genome": "mm10", "include_de": True}
        await start_auto_pipeline(db, ids["experiment_id"], ids["user_id"], config)

    # Fast-forward: trim complete -> alignment created
    trim_jobs = await _get_auto_jobs(ids["experiment_id"])
    async with test_session_factory() as db:
        await db.execute(
            sa_update(AnalysisJob)
            .where(AnalysisJob.id == trim_jobs[0].id)
            .values(status="complete")
        )
        await db.commit()
    await on_job_complete(ids["experiment_id"], trim_jobs[0].id, "rnaseq_trimming")

    align_jobs = [
        j for j in await _get_auto_jobs(ids["experiment_id"]) if j.job_type == "rnaseq_alignment"
    ]
    async with test_session_factory() as db:
        await db.execute(
            sa_update(AnalysisJob)
            .where(AnalysisJob.id == align_jobs[0].id)
            .values(status="complete")
        )
        await db.commit()
    await on_job_complete(ids["experiment_id"], align_jobs[0].id, "rnaseq_alignment")

    exp = await _get_experiment(ids["experiment_id"])
    assert exp.auto_pipeline_status == "complete"

    # No DE job should exist
    all_jobs = await _get_auto_jobs(ids["experiment_id"])
    de_jobs = [j for j in all_jobs if j.job_type == "rnaseq_de"]
    assert len(de_jobs) == 0


async def test_rnaseq_de_complete_marks_done(setup_db, patch_worker_sessions):
    """Completing rnaseq_de marks pipeline as complete."""
    from services.auto_pipeline_service import on_job_complete

    ids = await _setup_rnaseq_experiment(with_fastqc=True)

    # Manually set up the pipeline state
    async with test_session_factory() as db:
        await db.execute(
            sa_update(Experiment)
            .where(Experiment.id == ids["experiment_id"])
            .values(
                auto_pipeline=True,
                auto_pipeline_status="running",
                auto_pipeline_config={
                    "assay_type": "RNA-seq",
                    "reference_genome": "mm10",
                },
            )
        )
        # Create a fake DE job
        job = AnalysisJob(
            experiment_id=ids["experiment_id"],
            job_type="rnaseq_de",
            name="Auto: DE Analysis",
            params={},
            auto_pipeline=True,
            status="complete",
        )
        db.add(job)
        await db.commit()
        await db.refresh(job)
        de_job_id = job.id

    await on_job_complete(ids["experiment_id"], de_job_id, "rnaseq_de")

    exp = await _get_experiment(ids["experiment_id"])
    assert exp.auto_pipeline_status == "complete"


async def test_rnaseq_skips_trimming_if_already_trimmed(setup_db, patch_worker_sessions):
    """If trimmed FASTQs exist, pipeline skips straight to rnaseq_alignment."""
    from services.auto_pipeline_service import start_auto_pipeline

    ids = await _setup_rnaseq_experiment(with_fastqc=True, with_trimmed=True)

    async with test_session_factory() as db:
        config = {"reference_genome": "mm10"}
        await start_auto_pipeline(db, ids["experiment_id"], ids["user_id"], config)

    jobs = await _get_auto_jobs(ids["experiment_id"])
    assert len(jobs) == 1
    assert jobs[0].job_type == "rnaseq_alignment"


async def test_rnaseq_error_sets_pipeline_error(setup_db, patch_worker_sessions):
    """Job error sets auto-pipeline status to error."""
    from services.auto_pipeline_service import on_job_error

    ids = await _setup_rnaseq_experiment(with_fastqc=True)

    async with test_session_factory() as db:
        await db.execute(
            sa_update(Experiment)
            .where(Experiment.id == ids["experiment_id"])
            .values(
                auto_pipeline=True,
                auto_pipeline_status="running",
                auto_pipeline_config={"assay_type": "RNA-seq"},
            )
        )
        await db.commit()

    await on_job_error(ids["experiment_id"], 999, "rnaseq_trimming")

    exp = await _get_experiment(ids["experiment_id"])
    assert exp.auto_pipeline_status == "error"


async def test_rnaseq_condition_detection_uses_treatment(setup_db, patch_worker_sessions):
    """Condition detection uses the treatment field for RNA-seq reactions."""
    from services.auto_pipeline_service import _detect_conditions

    ids = await _setup_rnaseq_experiment(
        with_fastqc=True, with_conditions=True, use_treatment_field=True
    )

    async with test_session_factory() as db:
        result = await db.execute(
            select(Reaction).where(Reaction.experiment_id == ids["experiment_id"])
        )
        reactions = list(result.scalars().all())

    conditions = _detect_conditions(reactions)
    assert "ctrl" in conditions
    assert "mut" in conditions
    assert len(conditions["ctrl"]) == 2
    assert len(conditions["mut"]) == 2


async def test_cutandrun_pipeline_unchanged(setup_db, patch_worker_sessions):
    """Regression: CUT&RUN experiment routes through existing pipeline."""
    from services.auto_pipeline_service import start_auto_pipeline

    async with test_session_factory() as db:
        user = User(email="cutandrun@test.com", hashed_password="x")
        db.add(user)
        await db.flush()

        project = Project(name="CUT&RUN Project", created_by=user.id)
        db.add(project)
        await db.flush()

        member = ProjectMember(project_id=project.id, user_id=user.id, role="admin")
        db.add(member)

        exp = Experiment(
            project_id=project.id,
            name="CUT&RUN Test",
            assay_type="CUT&RUN",
            created_by=user.id,
        )
        db.add(exp)
        await db.flush()
        exp_id = exp.id

        db.add(
            Reaction(
                experiment_id=exp_id,
                fastq_prefix="ctrl_H3K4me3",
                short_name="ctrl_H3K4me3",
                organism="Mouse",
                assay_type="CUT&RUN",
            )
        )

        for direction in ["R1", "R2"]:
            db.add(
                FastqFile(
                    experiment_id=exp_id,
                    filename=f"ctrl_H3K4me3_{direction}_001.fastq.gz",
                    prefix="ctrl_H3K4me3",
                    read_direction=direction,
                    file_path=f"projects/{project.id}/{exp_id}/fastqs/raw/ctrl_{direction}.fq.gz",
                    total_reads=5000000,
                    adapter_status="warn",
                )
            )

        await db.commit()

        config = {"reference_genome": "mm10", "peak_caller": "SEACR"}
        await start_auto_pipeline(db, exp_id, user.id, config)

    # CUT&RUN with adapters should queue trimming (not rnaseq_trimming)
    async with test_session_factory() as db:
        result = await db.execute(
            select(AnalysisJob)
            .where(AnalysisJob.experiment_id == exp_id)
            .where(AnalysisJob.auto_pipeline.is_(True))
        )
        jobs = list(result.scalars().all())

    assert len(jobs) == 1
    assert jobs[0].job_type == "trimming"
    assert jobs[0].job_type != "rnaseq_trimming"
