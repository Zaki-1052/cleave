# 2026-03-28 — Fix 28 TypeScript Build Errors

## What was done

Fixed all 28 `tsc` errors preventing `npm run build` from completing. Four root causes:

1. **DetailRow `value` prop (18 errors)** — 3 Phase 6 tab files used `<DetailRow value={X} />` but the component only accepts `children`. Converted to `<DetailRow>{X}</DetailRow>` to match the pattern in AlignmentInfoPanel, PeakCallingInfoPanel, etc.

2. **Array swap with `noUncheckedIndexedAccess` (6 errors)** — Destructuring swap `[a[i], a[j]] = [a[j], a[i]]` returns `T | undefined` under strict indexing. Added `!` non-null assertions (safe — bounds checked on prior line) in 3 SelectSamplesStep components.

3. **`samples[0]` possibly undefined (2 errors)** — Same `noUncheckedIndexedAccess` issue. Added `?.` optional chaining in NormalizationSettingsStep and NormalizationTab.

4. **Missing `@types/node` (2 errors)** — `vite.config.ts` uses `path` and `__dirname` but Node types weren't installed. Added `@types/node` devDep and `"types": ["node"]` to `tsconfig.node.json`.

## Decisions made

- Preserved `noUncheckedIndexedAccess: true` — didn't loosen type safety
- Used `!` assertions (not temp variables) for array swaps — minimal diff, bounds already validated
- Used `?.` (not `!`) for `samples[0]` access — more defensive, pairs naturally with `??` fallback

## Key file paths

- `frontend/tsconfig.node.json` — added `"types": ["node"]`
- `frontend/package.json` — added `@types/node`
- `frontend/src/pages/experiment/CustomHeatmapTab.tsx`
- `frontend/src/pages/experiment/NormalizationTab.tsx`
- `frontend/src/pages/experiment/PearsonCorrelationTab.tsx`
- `frontend/src/components/custom-heatmap/SelectSamplesStep.tsx`
- `frontend/src/components/normalization/NormalizationSelectSamplesStep.tsx`
- `frontend/src/components/normalization/NormalizationSettingsStep.tsx`
- `frontend/src/components/pearson-correlation/PearsonSelectSamplesStep.tsx`
