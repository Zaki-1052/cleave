# Plan: Fix label density and remove coord_fixed() from network plot

## Context

The network plot (Figure 5C) has two issues after the recent changes:
1. **Labels too dense** — `label_top_n = 25` labels the top 25 clustered genes + 5 "Other" = 30 total. With 161 genes packed into 3 clusters, this makes the plot unreadable.
2. **`coord_fixed()` is distorting the layout** — it forces equal x/y scales, which compresses the layout and wastes space instead of letting nodes spread naturally into the 14×12 canvas.

## Changes to `scripts/network_analysis.R`

### 1. Reduce label count (line 85)

Change `label_top_n = 25L` → `label_top_n = 10L`. This labels only the top 10 clustered genes + top 3 "Other" = ~13 labels total. Much cleaner. Also reduce the "Other" label count from 5 to 3 (line 734).

### 2. Remove `coord_fixed()` (line 893)

Delete `coord_fixed() +` from the theme section. This lets the plot fill its natural 14×12 inch canvas.

**Trade-off**: Without `coord_fixed()`, the ggforce node border circles may render as slight ellipses if x/y data ranges differ. This is acceptable — the linetype encoding is still clear, and the layout gains much better use of space.

## Verification

Run `Rscript scripts/network_analysis.R --timepoint late` and check that the network plot has fewer labels and better spatial distribution.
