# backend/services/reaction_service.py
import csv
import io

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from models.experiment import Experiment
from models.fastq_file import FastqFile
from models.project import ProjectMember
from models.reaction import Reaction
from schemas.reaction import ReactionCreate, ReactionUpdate


# TODO: extract to shared module (duplicated from fastq_service.py)
async def _get_experiment_with_permission(
    db: AsyncSession, experiment_id: int, user_id: int, roles: list[str]
) -> Experiment | None:
    """Fetch experiment if user is a project member with one of the given roles."""
    result = await db.execute(
        select(Experiment)
        .join(ProjectMember, ProjectMember.project_id == Experiment.project_id)
        .where(
            Experiment.id == experiment_id,
            ProjectMember.user_id == user_id,
            ProjectMember.role.in_(roles),
        )
    )
    return result.scalar_one_or_none()


async def list_reactions(
    db: AsyncSession,
    experiment_id: int,
    user_id: int,
    page: int,
    per_page: int,
) -> tuple[list[Reaction], int] | None:
    """List reactions for an experiment. Returns None if not authorized."""
    experiment = await _get_experiment_with_permission(
        db, experiment_id, user_id, ["admin", "contributor", "viewer"]
    )
    if experiment is None:
        return None

    base = select(Reaction).where(Reaction.experiment_id == experiment_id)

    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar_one()

    result = await db.execute(
        base.order_by(Reaction.id).offset((page - 1) * per_page).limit(per_page)
    )
    return list(result.scalars().all()), total


async def create_reaction(
    db: AsyncSession,
    experiment_id: int,
    data: ReactionCreate,
    user_id: int,
) -> Reaction | None:
    """Create a single reaction. Returns None if not authorized.

    Raises ValueError on unique constraint violation.
    """
    experiment = await _get_experiment_with_permission(
        db, experiment_id, user_id, ["admin", "contributor"]
    )
    if experiment is None:
        return None

    reaction = Reaction(
        experiment_id=experiment_id,
        **data.model_dump(),
    )
    db.add(reaction)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ValueError(
            f"Reaction with organism '{data.organism}' and short name "
            f"'{data.short_name}' already exists in this experiment"
        )

    await db.refresh(reaction)
    return reaction


async def bulk_create_reactions(
    db: AsyncSession,
    experiment_id: int,
    reactions_data: list[ReactionCreate],
    user_id: int,
) -> list[Reaction] | None:
    """Bulk-create reactions. Returns None if not authorized.

    Validates no duplicates within batch or against existing DB rows.
    Raises ValueError on validation failure. All-or-nothing.
    """
    experiment = await _get_experiment_with_permission(
        db, experiment_id, user_id, ["admin", "contributor"]
    )
    if experiment is None:
        return None

    if not reactions_data:
        raise ValueError("No reactions provided")

    # Check for duplicates within the batch
    seen: set[tuple[str, str]] = set()
    for r in reactions_data:
        key = (r.organism, r.short_name)
        if key in seen:
            raise ValueError(
                f"Duplicate within batch: organism '{r.organism}', short name '{r.short_name}'"
            )
        seen.add(key)

    # Check for conflicts with existing reactions in DB
    existing_result = await db.execute(
        select(Reaction.organism, Reaction.short_name).where(
            Reaction.experiment_id == experiment_id
        )
    )
    existing_keys = {(row[0], row[1]) for row in existing_result.all()}

    conflicts = seen & existing_keys
    if conflicts:
        conflict_list = [f"({org}, {name})" for org, name in conflicts]
        raise ValueError(
            f"Reactions already exist with these (organism, short_name) pairs: "
            f"{', '.join(conflict_list)}"
        )

    # Bulk insert
    reactions = [Reaction(experiment_id=experiment_id, **r.model_dump()) for r in reactions_data]
    db.add_all(reactions)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ValueError("Unique constraint violation during bulk insert")

    for reaction in reactions:
        await db.refresh(reaction)

    return reactions


async def update_reaction(
    db: AsyncSession,
    experiment_id: int,
    reaction_id: int,
    data: ReactionUpdate,
    user_id: int,
) -> Reaction | None:
    """Partial update of a reaction. Returns None if not found or not authorized.

    Raises ValueError on unique constraint violation.
    """
    experiment = await _get_experiment_with_permission(
        db, experiment_id, user_id, ["admin", "contributor"]
    )
    if experiment is None:
        return None

    result = await db.execute(
        select(Reaction).where(
            Reaction.id == reaction_id,
            Reaction.experiment_id == experiment_id,
        )
    )
    reaction = result.scalar_one_or_none()
    if reaction is None:
        return None

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(reaction, field, value)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise ValueError(
            "Update would create a duplicate (organism, short_name) in this experiment"
        )

    await db.refresh(reaction)
    return reaction


async def delete_reaction(
    db: AsyncSession,
    experiment_id: int,
    reaction_id: int,
    user_id: int,
) -> bool:
    """Delete a reaction. Returns False if not found or not authorized."""
    experiment = await _get_experiment_with_permission(
        db, experiment_id, user_id, ["admin", "contributor"]
    )
    if experiment is None:
        return False

    result = await db.execute(
        select(Reaction).where(
            Reaction.id == reaction_id,
            Reaction.experiment_id == experiment_id,
        )
    )
    reaction = result.scalar_one_or_none()
    if reaction is None:
        return False

    await db.delete(reaction)
    await db.commit()
    return True


# ---------------------------------------------------------------------------
# CSV parsing (pure functions, no DB)
# ---------------------------------------------------------------------------

# Maps normalized CSV header → model field name
_CSV_HEADER_MAP: dict[str, str] = {
    "fastq_prefix": "fastq_prefix",
    "short_name": "short_name",
    "organism": "organism",
    "assay_type": "assay_type",
    "e.coli_spike_in": "ecoli_spike_in",
    "ecoli_spike_in": "ecoli_spike_in",
    "cell_type": "cell_type",
    "cell_number": "cell_number",
    "sample_prep": "sample_prep",
    "cell_prep": "sample_prep",
    "experimental_condition": "experimental_condition",
    "antibody_vendor": "antibody_vendor",
    "antibody_cat_no": "antibody_cat_no",
    "antibody_lot_no": "antibody_lot_no",
    "cutana_spike_in": "cutana_spike_in",
    "cutana_spike_in_target": "cutana_spike_in_target",
    "cutana_spike_in_2": "cutana_spike_in_2",
    "cutana_spike_in_target_2": "cutana_spike_in_target_2",
}

_IGNORED_CSV_COLUMNS = {"reference_genome"}

_REQUIRED_CSV_COLUMNS = {"fastq_prefix", "short_name", "organism"}

_TRUTHY = {"yes", "true", "1", "y"}
_FALSY = {"no", "false", "0", "n", ""}


def _normalize_csv_header(header: str) -> str:
    """Normalize a CSV header to lowercase_underscore format."""
    return header.strip().lower().replace(" ", "_")


def _parse_bool(value: str, column_name: str, row_num: int) -> bool:
    v = value.strip().lower()
    if v in _TRUTHY:
        return True
    if v in _FALSY:
        return False
    raise ValueError(
        f"Row {row_num}: cannot convert '{value}' to boolean for column "
        f"'{column_name}'. Use 'Yes' or 'No'."
    )


def parse_reaction_csv(
    csv_content: str,
    default_assay_type: str | None = None,
) -> tuple[list[ReactionCreate], list[str]]:
    """Parse CSV text into ReactionCreate objects.

    Returns (reactions, warnings). Raises ValueError if the CSV is
    structurally invalid (missing required columns, zero valid rows).
    """
    warnings: list[str] = []
    reader = csv.DictReader(io.StringIO(csv_content))

    if reader.fieldnames is None:
        raise ValueError("CSV file is empty or has no header row")

    # Map CSV headers to model fields
    header_mapping: dict[str, str] = {}  # csv_header → model_field
    for raw_header in reader.fieldnames:
        normalized = _normalize_csv_header(raw_header)
        if normalized in _CSV_HEADER_MAP:
            header_mapping[raw_header] = _CSV_HEADER_MAP[normalized]
        elif normalized in _IGNORED_CSV_COLUMNS:
            warnings.append(f"Column '{raw_header}' is not a reaction field and will be ignored")
        elif normalized:
            warnings.append(f"Unknown column '{raw_header}' will be ignored")

    # Check required columns are present
    mapped_fields = set(header_mapping.values())
    missing = _REQUIRED_CSV_COLUMNS - mapped_fields
    if missing:
        raise ValueError(
            f"CSV is missing required columns: {', '.join(sorted(missing))}. "
            f"Required: FASTQ_Prefix, Short_Name, Organism"
        )

    reactions: list[ReactionCreate] = []
    errors: list[str] = []

    for row_num, row in enumerate(reader, start=2):
        # Skip blank rows
        if all(not (v or "").strip() for v in row.values()):
            continue

        # Build kwargs for ReactionCreate (Pydantic validates types at construction)
        kwargs: dict[str, str | bool | None] = {}  # type: ignore[assignment]
        for csv_header, model_field in header_mapping.items():
            raw_value = (row.get(csv_header) or "").strip()

            if model_field == "ecoli_spike_in":
                try:
                    kwargs[model_field] = _parse_bool(raw_value, csv_header, row_num)
                except ValueError as e:
                    errors.append(str(e))
                    continue
            elif raw_value == "":
                # Only set optional fields to None; skip required fields so
                # Pydantic validation catches them
                if model_field not in _REQUIRED_CSV_COLUMNS:
                    kwargs[model_field] = None
            else:
                kwargs[model_field] = raw_value

        # Apply default assay_type if not in CSV
        if "assay_type" not in kwargs or kwargs.get("assay_type") is None:
            if default_assay_type:
                kwargs["assay_type"] = default_assay_type
            elif "assay_type" not in mapped_fields:
                kwargs["assay_type"] = "CUT&RUN"

        try:
            reactions.append(ReactionCreate(**kwargs))
        except Exception as e:
            errors.append(f"Row {row_num}: {e}")

    if errors:
        raise ValueError("CSV validation errors:\n" + "\n".join(errors))

    if not reactions:
        raise ValueError("CSV contains no valid data rows")

    return reactions, warnings


def generate_csv_template() -> str:
    """Return a CSV template string with CUTANA-format headers."""
    headers = [
        "FASTQ_Prefix",
        "Short_Name",
        "Organism",
        "Assay_Type",
        "CUTANA_Spike_in",
        "CUTANA_Spike_in_Target",
        "E.coli_Spike_in",
        "Cell_Type",
        "Cell_Number",
        "Sample_Prep",
        "Experimental_Condition",
        "Antibody_Vendor",
        "Antibody_Cat_No",
        "Antibody_Lot_No",
        "CUTANA_Spike_in_2",
        "CUTANA_Spike_in_Target_2",
    ]
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    return output.getvalue()


# ---------------------------------------------------------------------------
# FASTQ prefix detection
# ---------------------------------------------------------------------------


async def get_fastq_prefixes(
    db: AsyncSession,
    experiment_id: int,
    user_id: int,
) -> list[dict] | None:
    """Get distinct FASTQ prefixes for an experiment with R1/R2 availability.

    Returns None if not authorized.
    """
    experiment = await _get_experiment_with_permission(
        db, experiment_id, user_id, ["admin", "contributor", "viewer"]
    )
    if experiment is None:
        return None

    result = await db.execute(
        select(FastqFile.prefix, FastqFile.read_direction).where(
            FastqFile.experiment_id == experiment_id
        )
    )
    rows = result.all()

    # Group by prefix
    prefix_map: dict[str, dict[str, bool]] = {}
    for prefix, direction in rows:
        if prefix not in prefix_map:
            prefix_map[prefix] = {"has_r1": False, "has_r2": False}
        if direction == "R1":
            prefix_map[prefix]["has_r1"] = True
        elif direction == "R2":
            prefix_map[prefix]["has_r2"] = True

    return [{"prefix": prefix, **flags} for prefix, flags in sorted(prefix_map.items())]
