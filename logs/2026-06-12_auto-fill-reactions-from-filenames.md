# 2026-06-12 — Auto-fill Reactions from FASTQ Filenames

## What was done

Added an "Auto-fill from Filenames" feature that parses FASTQ filename prefixes to auto-generate reaction metadata (short name, condition, replicate, vendor), presented in an editable preview table before bulk creation.

### Backend
- Added `parse_prefix_metadata()` pure function to `reaction_service.py` — strips Illumina boilerplate (date, index, S/L numbers) from prefixes to generate short names, detects condition (ctrl/mut/ko/wt/het), replicate number, vendor abbreviation, and IgG controls
- Added `suggest_reactions_from_prefixes()` async function — queries prefixes, skips already-assigned ones, deduplicates short names
- Added 3 new Pydantic schemas: `ReactionSuggestion`, `SuggestReactionsRequest`, `SuggestReactionsResponse`
- Added `POST /experiments/{id}/reactions/suggest` endpoint (returns suggestions, does not create)

### Frontend
- Added `ReactionSuggestion` and `SuggestReactionsResponse` types
- Added `suggestReactions()` API function and `useSuggestReactions()` hook
- Created `AutoFillReactionsModal.tsx` — organism selector, editable preview table with inline inputs for short name/condition/replicate, auto-detected field highlighting, per-row removal
- Wired "Auto-fill from Filenames" button into `ReactionsEditor.tsx` (visible only when FASTQs are uploaded)

## Decisions made
- Backend parsing (not frontend) to centralize regex logic and enable testing
- Suggest-then-confirm flow: user reviews editable preview before committing
- Single organism dropdown for all suggestions (user's choice)
- Reuses existing `/reactions/bulk` endpoint for creation
- Regex uses `(?:^|_)...[_-]?(\d*)(?=_|$)` boundaries (underscore-delimited, not word boundaries) to correctly parse FASTQ naming conventions

## Tests added (19 new tests in `test_reactions.py`)
- 12 unit tests for `parse_prefix_metadata()`: boilerplate stripping, condition detection (ctrl/mut/ko/wt/het), replicate extraction, IgG clearing, vendor detection, auto_detected_fields tracking, fallback short name
- 7 integration tests for `POST /suggest`: basic flow, skips existing reactions, empty experiment, condition detection end-to-end, invalid organism validation, short name deduplication, upload helper

## Open items
- Docker not running locally — integration tests (DB-dependent) need `docker compose exec api pytest` to run
- Manual UI testing: full flow in browser (upload FASTQs → auto-fill → review → create)
- Potential future enhancement: detect antibody target (H3K4me3, CTCF, etc.) from prefix and populate a field

## Key file paths
- `backend/services/reaction_service.py` — parsing logic + suggest function
- `backend/schemas/reaction.py` — new schemas
- `backend/routers/reactions.py` — new endpoint
- `frontend/src/components/reactions/AutoFillReactionsModal.tsx` — new modal
- `frontend/src/components/reactions/ReactionsEditor.tsx` — button wiring
- `frontend/src/api/reactions.ts`, `types.ts`, `hooks/useReactions.ts` — API layer
