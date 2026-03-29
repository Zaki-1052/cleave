# 2026-03-29 — Add Lab Custom Blacklist to Peak Calling Pipeline

## What was done

- Copied lab's custom blacklist (`references/250123blacklist.bed`, 255 entries, mm10) to `backend/pipelines/reference/blacklists/mm10.lab.blacklist.bed`
- Extended `resolve_blacklist()` in `base.py` with a `blacklist_type` parameter (`encode_dac`, `lab_custom`, `none`) — backward-compatible default
- Updated `peak_calling.py` to read `blacklist` param from job params, support sequential subtraction with multiple blacklists ("both" mode)
- Added blacklist dropdown to Peak Calling Advanced Settings (frontend), with "Lab Custom" and "Both" options gated to mm10 only
- Updated auto-generated methods text to describe which blacklist was applied
- All 52 peak calling + 29 alignment tests pass, ruff + TypeScript clean

## Decisions made

- Lab blacklist is mm10-only — UI conditionally shows lab/both options based on reference genome
- "Both" mode applies ENCODE DAC first, then lab custom sequentially (not merged into one file)
- Default remains `encode_dac` to match existing behavior
- Blacklist subtraction failure remains non-fatal (warning logged, pipeline continues)

## Key file paths

- `backend/pipelines/reference/blacklists/mm10.lab.blacklist.bed` (new)
- `backend/pipelines/base.py` — `resolve_blacklist()` updated
- `backend/pipelines/peak_calling.py` — blacklist param + multi-blacklist subtraction
- `backend/pipelines/methods_text.py` — blacklist mention in methods text
- `frontend/src/lib/constants.ts` — `BLACKLIST_OPTIONS`, defaults
- `frontend/src/components/peak-calling/PeakCallingSettingsStep.tsx` — dropdown UI
- `frontend/src/components/peak-calling/NewPeakCallingWizard.tsx` — state wiring
