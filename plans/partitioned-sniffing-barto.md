# Plan: Fix 28 TypeScript Build Errors

## Context

`npm run build` fails with 28 TS errors across 8 files. These stem from **4 distinct root causes**, not 28 independent issues. All are real type safety problems (not false positives), and the fixes preserve `strict` + `noUncheckedIndexedAccess` — no loosening of type checks.

---

## Root Cause Analysis

### RC1: `DetailRow` used with `value` prop that doesn't exist (18 errors)

**What's wrong:** `DetailRow` accepts `{ label: string; children: ReactNode }` — no `value` prop. Three recently-added tab files pass `value={...}` instead of using `children`. The working files (AlignmentInfoPanel, PeakCallingInfoPanel, DiffBindInfoPanel, DescriptionTab) all use the correct `<DetailRow label="X">{Y}</DetailRow>` pattern.

**Files:** `CustomHeatmapTab.tsx`, `NormalizationTab.tsx`, `PearsonCorrelationTab.tsx`

**Fix:** Convert from `<DetailRow label="X" value={Y} />` to `<DetailRow label="X">{Y}</DetailRow>` in all 3 files. This matches the established pattern used by the working tab components.

### RC2: Array swap with `noUncheckedIndexedAccess` (6 errors)

**What's wrong:** `tsconfig.app.json` has `noUncheckedIndexedAccess: true`, so `array[index]` returns `T | undefined`. The destructuring swap pattern `[next[index], next[target]] = [next[target], next[index]]` fails because the RHS values are `T | undefined` but the LHS assignment targets expect `T`.

**Files:** `SelectSamplesStep.tsx:104`, `NormalizationSelectSamplesStep.tsx:74`, `PearsonSelectSamplesStep.tsx:74`

**Fix:** All three sites have already validated bounds (`if (target < 0 || target >= samples.length) return;`), so the values are guaranteed to exist. Use non-null assertions on the RHS:
```ts
[next[index], next[target]] = [next[target]!, next[index]!];
```
This is safe (bounds checked), explicit about intent, and minimal diff. Alternative: temp variable swap — equally valid but more verbose for no safety gain since bounds are already checked.

### RC3: `samples[0]` possibly undefined after length check (2 errors)

**What's wrong:** Same `noUncheckedIndexedAccess` cause. `samples[0]` is `T | undefined` even after `samples.length > 0`.

**Files:** `NormalizationSettingsStep.tsx:14`, `NormalizationTab.tsx:158`

**Fix:** Use optional chaining on the indexed access:
- `NormalizationSettingsStep.tsx:14`: `samples[0]?.label ?? '(none)'`
- `NormalizationTab.tsx:158`: `samples[0]?.label ?? 'Unknown'` (already has `??` but missing `?.` on the index access)

### RC4: `vite.config.ts` missing Node.js types (2 errors)

**What's wrong:** `vite.config.ts` imports `path` and uses `__dirname` (Node.js globals), but `@types/node` is not installed. `tsconfig.node.json` (which covers `vite.config.ts`) has no `types` field to resolve Node built-ins.

**Fix:**
1. `npm install -D @types/node` (add to devDependencies)
2. Add `"types": ["node"]` to `tsconfig.node.json` compilerOptions

---

## Execution Steps

### Step 1: Install `@types/node` (RC4)
```bash
cd frontend && npm install -D @types/node
```

### Step 2: Update `tsconfig.node.json` (RC4)
Add `"types": ["node"]` to compilerOptions.

### Step 3: Fix `DetailRow` usage in 3 tab files (RC1)
Convert `value={X}` → `{X}` as children in:
- `src/pages/experiment/CustomHeatmapTab.tsx` (lines 185-193, 6 DetailRow calls)
- `src/pages/experiment/NormalizationTab.tsx` (lines 186-194, 6 DetailRow calls)
- `src/pages/experiment/PearsonCorrelationTab.tsx` (lines 185-195, 6 DetailRow calls)

### Step 4: Fix array swap assertions in 3 components (RC2)
Add `!` non-null assertions to the RHS of the destructuring swap in:
- `src/components/custom-heatmap/SelectSamplesStep.tsx:104`
- `src/components/normalization/NormalizationSelectSamplesStep.tsx:74`
- `src/components/pearson-correlation/PearsonSelectSamplesStep.tsx:74`

### Step 5: Fix `samples[0]` access in 2 files (RC3)
Add optional chaining `?.` on the indexed access:
- `src/components/normalization/NormalizationSettingsStep.tsx:14`
- `src/pages/experiment/NormalizationTab.tsx:158`

### Step 6: Verify
```bash
cd frontend && npm run build
```
Expected: 0 errors, clean build.

---

## Files Modified (8 total)

| File | Root Cause | Change |
|------|-----------|--------|
| `package.json` | RC4 | Add `@types/node` devDep |
| `tsconfig.node.json` | RC4 | Add `"types": ["node"]` |
| `CustomHeatmapTab.tsx` | RC1 | `value={}` → children |
| `NormalizationTab.tsx` | RC1 + RC3 | `value={}` → children + `?.` on `samples[0]` |
| `PearsonCorrelationTab.tsx` | RC1 | `value={}` → children |
| `SelectSamplesStep.tsx` | RC2 | Add `!` to swap RHS |
| `NormalizationSelectSamplesStep.tsx` | RC2 | Add `!` to swap RHS |
| `PearsonSelectSamplesStep.tsx` | RC2 | Add `!` to swap RHS |
| `NormalizationSettingsStep.tsx` | RC3 | `samples[0].label` → `samples[0]?.label` |

## Risk Assessment

- **No behavior changes** — all fixes are type-level only. The `!` assertions are safe because bounds are pre-checked. The `?.` additions are defensive and already have fallback values. The `DetailRow` children conversion renders identically.
- **No regressions** — the component output is unchanged; only the prop passing syntax differs.
