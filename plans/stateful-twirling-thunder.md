# Plan: Add Lab-Specific Blacklist as Peak Calling Option

## Context

The lab has a custom blacklist (`references/250123blacklist.bed`, 255 entries, mm10-specific) used in `subtract_blacklist.sh` for post-peak-calling blacklist subtraction. Currently, the pipeline only uses ENCODE DAC blacklists (resolved by genome name via `resolve_blacklist()` in `base.py`). The lab blacklist is more comprehensive for mm10 (255 entries vs. ENCODE DAC's 164 entries) and includes regions like chrM, chrY, and random contigs that the ENCODE list doesn't cover.

The lab blacklist needs to be available as a selectable option in the peak calling pipeline's Advanced Settings.

## Changes

### 1. Copy lab blacklist to pipeline reference directory

- Copy `references/250123blacklist.bed` → `backend/pipelines/reference/blacklists/mm10.lab.blacklist.bed`
- Consistent naming with existing `{genome}.blacklist.bed` pattern

### 2. Update `backend/pipelines/base.py` — `resolve_blacklist()`

Current signature: `resolve_blacklist(genome: str) -> Path | None`

New signature: `resolve_blacklist(genome: str, blacklist_type: str = "encode_dac") -> Path | None`

- `"encode_dac"` (default) → returns `{genome}.blacklist.bed` (current behavior)
- `"lab_custom"` → returns `{genome}.lab.blacklist.bed` if it exists, else `None`
- `"none"` → returns `None` (skip blacklist subtraction)

For "both", the peak calling module will handle running subtraction with each file sequentially rather than complicating the resolve function.

### 3. Update `backend/pipelines/peak_calling.py`

- Read `blacklist_type` param from `params.get("blacklist", "encode_dac")` in `run()`
- If `"both"`: resolve both blacklists and run subtraction sequentially (DAC first, then lab custom on the result)
- Update `validate()` to accept the new `blacklist` param
- Update `mock_run()` to accept the param (no behavioral change needed — mock doesn't run bedtools)
- Update the master log to record which blacklist was used

### 4. Update `frontend/src/lib/constants.ts`

Add blacklist options constant:

```ts
export const BLACKLIST_OPTIONS = [
  { value: 'encode_dac', label: 'ENCODE DAC Exclusion List' },
  { value: 'lab_custom', label: 'Lab Custom Blacklist' },
  { value: 'both', label: 'Both (ENCODE DAC + Lab Custom)' },
  { value: 'none', label: 'None' },
];
```

Add `blacklist: string` to `PEAK_CALLING_DEFAULTS` with default `"encode_dac"`.

### 5. Update `frontend/src/components/peak-calling/PeakCallingSettingsStep.tsx`

- Add `blacklist` / `setBlacklist` props
- Add a dropdown in Advanced Settings for blacklist selection
- Conditionally show "Lab Custom" and "Both" options only when `referenceGenome === 'mm10'` (the lab blacklist is mm10-only)
- Help text explaining the difference between ENCODE DAC and lab custom

### 6. Update `frontend/src/components/peak-calling/NewPeakCallingWizard.tsx`

- Add `blacklist` state initialized to `PEAK_CALLING_DEFAULTS.blacklist`
- Pass to `PeakCallingSettingsStep`
- Include in `buildPeakCallingJobParams()` output

### 7. Update `backend/pipelines/methods_text.py` (if applicable)

- Include which blacklist was used in the auto-generated methods text

## Files to modify

1. `backend/pipelines/reference/blacklists/mm10.lab.blacklist.bed` — **new file** (copy from references)
2. `backend/pipelines/base.py` — update `resolve_blacklist()`
3. `backend/pipelines/peak_calling.py` — read `blacklist` param, handle "both" mode
4. `frontend/src/lib/constants.ts` — add `BLACKLIST_OPTIONS`, update defaults
5. `frontend/src/components/peak-calling/PeakCallingSettingsStep.tsx` — add dropdown
6. `frontend/src/components/peak-calling/NewPeakCallingWizard.tsx` — wire state + params
7. `backend/pipelines/methods_text.py` — mention blacklist in methods text (if relevant)

## Verification

1. `ruff check backend/` and `ruff format --check backend/` pass
2. `npm run build` in frontend passes (no TS errors)
3. Run peak calling-related tests: `docker compose exec api pytest tests/test_peak_calling_pipeline.py -v` (if exists) or relevant test files
4. Manual verification: open the peak calling wizard in the UI, confirm the blacklist dropdown appears in Advanced Settings, and "Lab Custom"/"Both" only show for mm10
