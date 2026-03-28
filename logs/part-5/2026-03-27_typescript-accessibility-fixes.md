# 2026-03-27 — TypeScript + Accessibility Fixes Across Frontend

## What Was Done

Systematic sweep of TS errors and axe accessibility violations across alignment and peak-calling components, triggered by VS Code's language server and Edge Tools diagnostics.

### TypeScript Fixes
- **`as const` literal type narrowing** — `PEAK_CALLING_DEFAULTS` had `as const`, making `useState(0.01)` infer `useState<0.01>` (literal), incompatible with `(v: number) => void` props. Fixed by adding explicit `number`/`boolean` type annotation to the object. (6 TS2322 errors)
- **`noUncheckedIndexedAccess` violations** — `array[0].prop` flagged as possibly undefined even after `length > 0` guard. Fixed by extracting into variable + truthiness guard in 3 locations.
- **File category literal types** — `ALIGNMENT_FILE_CATEGORIES[0].value` and `PEAK_CALLING_FILE_CATEGORIES[0].value` inferred as literal from `as const`. Extracted union types (`AlignmentFileCategory`, `PeakCallingFileCategory`) and cast `e.target.value` in handlers. (2 TS2345 errors)
- **Spike-in heatmap** — `results[0].ptmResults` possibly undefined. Added optional chain. (1 TS2532)

### Accessibility Fixes (axe/forms)
- **Checkboxes without labels**: Added `aria-label` to all header ("Select all") and row ("Select {name}") checkboxes across 5 components
- **Selects without accessible names**: Linked `<label>` to `<select>` via `htmlFor`/`id` pairs across 6 select elements
- **Inputs without labels**: Linked `<label>` to `<input>` via `htmlFor`/`id` pairs for 7 number inputs
- **Textareas without labels**: Added `aria-label="Job notes"` to 2 notes textareas
- **Radio without label**: Added `aria-label` to alignment selection radio
- **Buttons without type**: Added `type="button"` to ~15 buttons to prevent implicit form submission

### Files Modified
- `frontend/src/lib/constants.ts`
- `frontend/src/components/alignment/AlignmentFilesPanel.tsx`
- `frontend/src/components/alignment/AlignmentInfoPanel.tsx`
- `frontend/src/components/alignment/AlignmentQCReportPanel.tsx`
- `frontend/src/components/alignment/AlignmentSettingsStep.tsx`
- `frontend/src/components/alignment/ChooseReactionsStep.tsx`
- `frontend/src/components/alignment/NewAlignmentWizard.tsx`
- `frontend/src/components/peak-calling/ChooseAlignmentStep.tsx`
- `frontend/src/components/peak-calling/ChooseReactionsStep.tsx`
- `frontend/src/components/peak-calling/NewPeakCallingWizard.tsx`
- `frontend/src/components/peak-calling/PeakCallingSettingsStep.tsx`
- `frontend/src/components/peak-calling/PeakCallingInfoPanel.tsx`
- `frontend/src/components/peak-calling/PeakCallingFilesPanel.tsx`
