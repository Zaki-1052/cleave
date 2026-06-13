# backend/routers/reactions.py
from io import StringIO

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from auth import current_active_user
from database import get_db
from models.user import User
from schemas.common import PaginatedResponse
from schemas.reaction import (
    CsvImportResponse,
    PrefixInfo,
    ReactionBulkCreate,
    ReactionCreate,
    ReactionRead,
    ReactionUpdate,
    SuggestReactionsRequest,
    SuggestReactionsResponse,
)
from services.reaction_service import (
    bulk_create_reactions,
    create_reaction,
    delete_reaction,
    generate_csv_template,
    get_fastq_prefixes,
    list_reactions,
    parse_reaction_csv,
    suggest_reactions_from_prefixes,
    update_reaction,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# List reactions (paginated)
# ---------------------------------------------------------------------------


@router.get(
    "/experiments/{experiment_id}/reactions",
    response_model=PaginatedResponse[ReactionRead],
)
async def list_reactions_endpoint(
    experiment_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100, alias="perPage"),
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await list_reactions(db, experiment_id, current_user.id, page, per_page)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found or not authorized",
        )
    items, total = result
    return PaginatedResponse(items=items, total=total, page=page, per_page=per_page)


# ---------------------------------------------------------------------------
# Create single reaction
# ---------------------------------------------------------------------------


@router.post(
    "/experiments/{experiment_id}/reactions",
    response_model=ReactionRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_reaction_endpoint(
    experiment_id: int,
    body: ReactionCreate,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        reaction = await create_reaction(db, experiment_id, body, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))

    if reaction is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this project or insufficient permissions",
        )
    return reaction


# ---------------------------------------------------------------------------
# Bulk create reactions (JSON)
# ---------------------------------------------------------------------------


@router.post(
    "/experiments/{experiment_id}/reactions/bulk",
    response_model=CsvImportResponse,
    status_code=status.HTTP_201_CREATED,
)
async def bulk_create_reactions_endpoint(
    experiment_id: int,
    body: ReactionBulkCreate,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        reactions = await bulk_create_reactions(db, experiment_id, body.reactions, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))

    if reactions is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this project or insufficient permissions",
        )
    return CsvImportResponse(created=len(reactions), reactions=reactions, warnings=[])


# ---------------------------------------------------------------------------
# Import reactions from CSV upload
# ---------------------------------------------------------------------------


@router.post(
    "/experiments/{experiment_id}/reactions/import-csv",
    response_model=CsvImportResponse,
    status_code=status.HTTP_201_CREATED,
)
async def import_csv_endpoint(
    experiment_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    # Read and decode CSV content
    raw_bytes = await file.read()
    try:
        csv_content = raw_bytes.decode("utf-8")
    except UnicodeDecodeError:
        try:
            csv_content = raw_bytes.decode("latin-1")
        except UnicodeDecodeError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Cannot decode CSV file. Use UTF-8 or Latin-1 encoding.",
            )

    # Get experiment assay_type for default
    from models.experiment import Experiment

    exp_result = await db.get(Experiment, experiment_id)
    default_assay_type = exp_result.assay_type if exp_result else None

    # Parse CSV
    try:
        reactions_data, warnings = parse_reaction_csv(csv_content, default_assay_type)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e))

    # Bulk create
    try:
        reactions = await bulk_create_reactions(db, experiment_id, reactions_data, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))

    if reactions is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this project or insufficient permissions",
        )

    return CsvImportResponse(created=len(reactions), reactions=reactions, warnings=warnings)


# ---------------------------------------------------------------------------
# Download CSV template
# ---------------------------------------------------------------------------


@router.get("/experiments/{experiment_id}/reactions/template")
async def download_template_endpoint(
    experiment_id: int,
    _current_user: User = Depends(current_active_user),
):
    template = generate_csv_template()
    return StreamingResponse(
        StringIO(template),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=reaction_template.csv"},
    )


# ---------------------------------------------------------------------------
# Suggest reactions from FASTQ filenames
# ---------------------------------------------------------------------------


@router.post(
    "/experiments/{experiment_id}/reactions/suggest",
    response_model=SuggestReactionsResponse,
)
async def suggest_reactions_endpoint(
    experiment_id: int,
    body: SuggestReactionsRequest,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await suggest_reactions_from_prefixes(
        db,
        experiment_id,
        current_user.id,
        body.organism,
        body.assay_type,
    )
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found or not authorized",
        )
    return result


# ---------------------------------------------------------------------------
# Get available FASTQ prefixes
# ---------------------------------------------------------------------------


@router.get(
    "/experiments/{experiment_id}/reactions/prefixes",
    response_model=list[PrefixInfo],
)
async def list_prefixes_endpoint(
    experiment_id: int,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await get_fastq_prefixes(db, experiment_id, current_user.id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found or not authorized",
        )
    return result


# ---------------------------------------------------------------------------
# Update reaction
# ---------------------------------------------------------------------------


@router.patch(
    "/experiments/{experiment_id}/reactions/{reaction_id}",
    response_model=ReactionRead,
)
async def update_reaction_endpoint(
    experiment_id: int,
    reaction_id: int,
    body: ReactionUpdate,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        reaction = await update_reaction(db, experiment_id, reaction_id, body, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))

    if reaction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reaction not found or insufficient permissions",
        )
    return reaction


# ---------------------------------------------------------------------------
# Delete reaction
# ---------------------------------------------------------------------------


@router.delete(
    "/experiments/{experiment_id}/reactions/{reaction_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_reaction_endpoint(
    experiment_id: int,
    reaction_id: int,
    current_user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await delete_reaction(db, experiment_id, reaction_id, current_user.id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reaction not found or insufficient permissions",
        )
