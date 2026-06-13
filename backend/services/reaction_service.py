# backend/services/reaction_service.py
import csv
import io
import re

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from models.fastq_file import FastqFile
from models.reaction import Reaction
from schemas.reaction import ReactionCreate, ReactionUpdate
from services.event_service import log_event
from services.permission_helpers import check_experiment_membership, get_experiment_with_permission


async def list_reactions(
    db: AsyncSession,
    experiment_id: int,
    user_id: int,
    page: int,
    per_page: int,
) -> tuple[list[Reaction], int] | None:
    """List reactions for an experiment. Returns None if not authorized."""
    experiment = await check_experiment_membership(db, experiment_id, user_id)
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
    experiment = await get_experiment_with_permission(
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
    await log_event(
        db,
        experiment_id,
        user_id,
        action="reaction_created",
        resource_type="reaction",
        resource_id=reaction.id,
        detail=f"Created reaction '{data.short_name}'",
    )
    await db.commit()
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
    experiment = await get_experiment_with_permission(
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

    await log_event(
        db,
        experiment_id,
        user_id,
        action="reactions_imported",
        resource_type="reaction",
        detail=f"Imported {len(reactions)} reaction(s)",
    )
    await db.commit()
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
    experiment = await get_experiment_with_permission(
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

    await log_event(
        db,
        experiment_id,
        user_id,
        action="reaction_updated",
        resource_type="reaction",
        resource_id=reaction_id,
        detail=f"Updated reaction '{reaction.short_name}'",
    )

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
    experiment = await get_experiment_with_permission(
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

    short_name = reaction.short_name
    await db.delete(reaction)
    await log_event(
        db,
        experiment_id,
        user_id,
        action="reaction_deleted",
        resource_type="reaction",
        resource_id=reaction_id,
        detail=f"Deleted reaction '{short_name}'",
    )
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
    "treatment": "treatment",
    "timepoint": "timepoint",
    "genotype": "genotype",
    "replicate_number": "replicate_number",
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
        kwargs: dict[str, str | bool | int | None] = {}  # type: ignore[assignment]
        for csv_header, model_field in header_mapping.items():
            raw_value = (row.get(csv_header) or "").strip()

            if model_field == "ecoli_spike_in":
                try:
                    kwargs[model_field] = _parse_bool(raw_value, csv_header, row_num)
                except ValueError as e:
                    errors.append(str(e))
                    continue
            elif model_field == "replicate_number":
                if raw_value:
                    try:
                        kwargs[model_field] = int(raw_value)
                    except ValueError:
                        errors.append(
                            f"Row {row_num}: Replicate_Number must be an integer, got '{raw_value}'"
                        )
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
        "Treatment",
        "Timepoint",
        "Genotype",
        "Replicate_Number",
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
    experiment = await check_experiment_membership(db, experiment_id, user_id)
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


# ---------------------------------------------------------------------------
# FASTQ prefix → reaction metadata parsing
# ---------------------------------------------------------------------------

_BOILERPLATE_PATTERNS = [
    re.compile(r"^\d{6,8}_"),
    re.compile(r"index_\d+_?"),
    re.compile(r"_S\d+"),
    re.compile(r"_L\d{3,}"),
    re.compile(r"_001$"),
]

_CONDITION_REPLICATE_RE = re.compile(
    r"(?:^|_)(ctrl|control|wt|wildtype|wild_type"
    r"|mut|mutant|ko|knockout|knock_out"
    r"|het|heterozygous"
    r"|treated|untreated|vehicle|sham)"
    r"[_-]?(\d*)(?=_|$)",
    re.IGNORECASE,
)

_CTRL_LABELS = frozenset(
    {"ctrl", "control", "wt", "wildtype", "wild_type", "untreated", "vehicle", "sham"}
)
_MUT_LABELS = frozenset({"mut", "mutant", "ko", "knockout", "knock_out"})
_HET_LABELS = frozenset({"het", "heterozygous"})

_VENDOR_RE = re.compile(
    r"(?:^|_)(NEB|CST|Abcam|EpiCypher|Millipore|ActiveMotif|Diagenode)(?=_|$)",
    re.IGNORECASE,
)

_IGG_RE = re.compile(r"(?:^|_)igg(?=_|$)", re.IGNORECASE)

_SAFE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_\-\.]{0,99}$")


def parse_prefix_metadata(prefix: str) -> dict:
    """Parse a FASTQ prefix into suggested reaction metadata.

    Returns a dict with ``short_name``, ``experimental_condition``,
    ``replicate_number``, ``antibody_vendor``, and ``auto_detected_fields``.
    All values are best-effort; undetected fields are ``None``.
    """
    short = prefix
    for pat in _BOILERPLATE_PATTERNS:
        short = pat.sub("", short)
    short = short.strip("_")
    short = re.sub(r"_+", "_", short)
    if not short or not _SAFE_NAME_RE.match(short):
        short = prefix

    condition: str | None = None
    replicate: int | None = None
    auto_detected: list[str] = []

    is_igg = bool(_IGG_RE.search(prefix))

    if not is_igg:
        m = _CONDITION_REPLICATE_RE.search(prefix)
        if m:
            raw = m.group(1).lower()
            if raw in _CTRL_LABELS:
                condition = "ctrl"
            elif raw in _MUT_LABELS:
                condition = "mut"
            elif raw in _HET_LABELS:
                condition = "het"
            else:
                condition = raw
            auto_detected.append("experimental_condition")

            rep_str = m.group(2)
            if rep_str:
                replicate = int(rep_str)
                auto_detected.append("replicate_number")

    vendor: str | None = None
    vm = _VENDOR_RE.search(prefix)
    if vm:
        vendor = vm.group(1)
        auto_detected.append("antibody_vendor")

    return {
        "short_name": short,
        "experimental_condition": condition,
        "replicate_number": replicate,
        "antibody_vendor": vendor,
        "auto_detected_fields": auto_detected,
    }


def _deduplicate_short_names(suggestions: list[dict]) -> None:
    """Append alphabetic suffixes to duplicate short_name values in-place."""
    counts: dict[str, int] = {}
    for s in suggestions:
        name = s["short_name"]
        counts[name] = counts.get(name, 0) + 1

    duplicates = {name for name, count in counts.items() if count > 1}
    if not duplicates:
        return

    counters: dict[str, int] = {}
    for s in suggestions:
        name = s["short_name"]
        if name in duplicates:
            idx = counters.get(name, 0)
            suffix = chr(ord("a") + idx)
            s["short_name"] = f"{name}_{suffix}"
            counters[name] = idx + 1


async def suggest_reactions_from_prefixes(
    db: AsyncSession,
    experiment_id: int,
    user_id: int,
    organism: str,
    assay_type: str,
) -> dict | None:
    """Generate suggested reaction metadata from FASTQ prefixes.

    Returns ``None`` if not authorized.  Otherwise returns a dict with
    ``suggestions`` (list of dicts) and ``skipped_prefixes`` (list of str).
    """
    experiment = await check_experiment_membership(db, experiment_id, user_id)
    if experiment is None:
        return None

    prefix_infos = await get_fastq_prefixes(db, experiment_id, user_id)
    if prefix_infos is None:
        return None

    existing_result = await db.execute(
        select(Reaction.fastq_prefix).where(Reaction.experiment_id == experiment_id)
    )
    existing_prefixes = {row[0] for row in existing_result.all()}

    suggestions: list[dict] = []
    skipped: list[str] = []

    for pi in prefix_infos:
        prefix = pi["prefix"]
        if prefix in existing_prefixes:
            skipped.append(prefix)
            continue

        parsed = parse_prefix_metadata(prefix)
        suggestions.append(
            {
                "fastq_prefix": prefix,
                "short_name": parsed["short_name"],
                "organism": organism,
                "assay_type": assay_type,
                "experimental_condition": parsed["experimental_condition"],
                "replicate_number": parsed["replicate_number"],
                "antibody_vendor": parsed["antibody_vendor"],
                "has_r1": pi["has_r1"],
                "has_r2": pi["has_r2"],
                "auto_detected_fields": parsed["auto_detected_fields"],
            }
        )

    _deduplicate_short_names(suggestions)

    return {"suggestions": suggestions, "skipped_prefixes": skipped}
