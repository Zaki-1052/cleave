# Plan: Add Boyle Lab v2 hg38 Blacklist

## Context

The current `hg38.blacklist.bed` has only 38 entries (ENCODE DAC v1, unusually sparse). The community-standard Boyle Lab v2 blacklist has 636 entries and is widely used in the field. This was flagged as a "consider supplementing" item in `docs/todos.md`.

**Verified**: All 38 current entries are fully contained within the Boyle Lab v2 regions (`bedtools intersect -f 1.0` = 38/38). The Boyle v2 list is a strict superset — no merging needed, safe to replace.

## Files to Modify

1. **`backend/pipelines/reference/blacklists/hg38.blacklist.bed`** — Replace 38-entry contents with Boyle Lab v2 (636 entries, 3-column BED, strip the 4th annotation column)
2. **`docs/todos.md`** — Check off the hg38 blacklist item

## Steps

### 1. Fetch and prepare the Boyle Lab v2 hg38 blacklist

Already downloaded to `/tmp/hg38-blacklist.v2.bed`. The raw file is 4-column BED (col 4 = region type like "High Signal Region", "Low Mappability"). Strip to 3-column to match the format of existing blacklist files (`chrom  start  end`), then sort by position.

### 2. Replace `hg38.blacklist.bed`

Overwrite the existing 38-entry file. No rename needed — `resolve_blacklist()` looks for `{genome}.blacklist.bed`.

### 3. No code changes needed

- `resolve_blacklist("hg38", "encode_dac")` returns the same path — works unchanged
- Alignment pipeline (`bedtools intersect -v`) — works unchanged
- Peak calling pipeline (`bedtools subtract`) — works unchanged
- Frontend labels ("ENCODE DAC Exclusion List") — still accurate, Boyle v2 is the successor
- No new blacklist type or UI option needed

### 4. Update `docs/todos.md`

Check off the hg38 blacklist consider-supplementing item.

## Verification

1. `wc -l backend/pipelines/reference/blacklists/hg38.blacklist.bed` — should be 636 lines
2. `head -5 backend/pipelines/reference/blacklists/hg38.blacklist.bed` — verify 3-column BED format
3. `awk '{print NF}' backend/pipelines/reference/blacklists/hg38.blacklist.bed | sort -u` — should be `3` only
4. Existing tests pass unchanged
