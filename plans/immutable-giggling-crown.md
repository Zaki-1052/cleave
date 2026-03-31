# Plan: Fix All Pass 5 Critique Issues

## Context

Post-commit review of UI Pass 5 (Feature Components) found missed spec requirements: Unicode HTML entities still present, `font-mono` missing on several data types, and `font-display` missing on ~126 instances of the heading/label pattern. The user wants ALL issues fixed for full spec compliance.

---

## Group 1: Primitives (3 files — cascading, do first)

These single-line fixes cascade to 30+ usage sites each.

### 1a. `frontend/src/components/ui/DetailRow.tsx` line 5
- Add `font-display` to label span
- `text-xs font-semibold uppercase tracking-wide text-gray-500` → `font-display text-xs font-semibold uppercase tracking-wide text-gray-500`

### 1b. `frontend/src/components/ui/Input.tsx` line 12
- Add `font-display` to label element
- `text-xs font-semibold uppercase tracking-wide text-gray-500` → `font-display text-xs font-semibold uppercase tracking-wide text-gray-500`

### 1c. `frontend/src/components/ui/StorageGauge.tsx`
- Line 17: add `font-display` to label `<p>` (`text-xs uppercase tracking-wide text-gray-500`)
- Line 27: wrap data in `font-mono` span: `<span className="font-mono">{formatBytes(usedBytes)} / {formatBytes(quotaBytes)} ({percent}%)</span>`
- Line 31 (no-quota variant): similar `font-mono` wrap for `{formatBytes(usedBytes)}`

---

## Group 2: Critical Fixes (5 files)

### 2a. `frontend/src/components/experiments/AutoPipelineBanner.tsx`
- Import `Check, X` from `lucide-react` (add to existing Loader2 import)
- Line 172: `<span>&#10003;</span>` → `<Check className="h-3 w-3" />`
- Line 176: `<span>&#10007;</span>` → `<X className="h-3 w-3" />`

### 2b. `frontend/src/components/alignment/AlignmentInfoPanel.tsx` line 81
- Add `font-mono` to methods text block
- `whitespace-pre-wrap text-sm text-gray-600` → `whitespace-pre-wrap font-mono text-sm text-gray-600`

### 2c. `frontend/src/components/peak-calling/PeakCallingInfoPanel.tsx` line 81
- Same: add `font-mono` to methods text block

### 2d. `frontend/src/components/diffbind/DiffBindInfoPanel.tsx` line 87
- Same: add `font-mono` to methods text block

### 2e. `frontend/src/components/reactions/ReactionFormModal.tsx`
- Find the `selectClass` variable/className used for the FASTQ prefix `<select>` element
- Add `font-mono` to the select className so prefix values render in monospace
- If selectClass is shared with non-prefix selects, apply font-mono specifically to the prefix select element

---

## Group 3: font-mono on Numeric Data (5 files)

### 3a. `frontend/src/components/peak-calling/PeakCallingQCReportPanel.tsx` line 124
- `<td className="px-3 py-2 text-gray-700">{m.significanceThreshold}</td>`
- Add `font-mono`: `px-3 py-2 font-mono text-gray-700`

### 3b. `frontend/src/pages/experiment/DescriptionTab.tsx` ~line 30
- `<DetailRow label="Experiment ID">{experiment.id}</DetailRow>`
- Wrap: `<DetailRow label="Experiment ID"><span className="font-mono">{experiment.id}</span></DetailRow>`

### 3c. `frontend/src/pages/experiment/CustomHeatmapTab.tsx`
- Line 186: Wrap Run ID in `<span className="font-mono">`
- Line 193: Wrap sample count in `<span className="font-mono">`

### 3d. `frontend/src/pages/experiment/PearsonCorrelationTab.tsx`
- Line 186: Wrap Run ID in `<span className="font-mono">`
- Line 192: Wrap sample count in `<span className="font-mono">`

### 3e. `frontend/src/pages/experiment/NormalizationTab.tsx`
- Line 187: Wrap Run ID in `<span className="font-mono">`
- Line 193: Wrap sample count in `<span className="font-mono">`

---

## Group 4: font-display on Standalone Headings (30 files)

All instances use `uppercase` + `tracking-wide` pattern but lack `font-display`. Add `font-display` to each className.

### 4a. Page-Level Headings
| File | Lines | Element types |
|------|-------|---------------|
| `pages/experiment/DescriptionTab.tsx` | 26, 45 | `<h3>` |
| `pages/experiment/HistoryTab.tsx` | 89 | `<h3>` |
| `pages/SettingsPage.tsx` | 80, 110 | `<h3>` |

### 4b. Experiment Tab Job Selector Labels
| File | Line | Element |
|------|------|---------|
| `pages/experiment/AlignmentTab.tsx` | 77 | `<label>` |
| `pages/experiment/PeakCallingTab.tsx` | 75 | `<label>` |
| `pages/experiment/DiffBindTab.tsx` | 75 | `<label>` |
| `pages/experiment/CustomHeatmapTab.tsx` | 76 | `<label>` |
| `pages/experiment/NormalizationTab.tsx` | 76 | `<label>` |
| `pages/experiment/PearsonCorrelationTab.tsx` | 76 | `<label>` |

### 4c. QC Report Labels
| File | Lines | Notes |
|------|-------|-------|
| `components/alignment/AlignmentQCReportPanel.tsx` | 120 | "Reference Genome" span |
| `components/peak-calling/PeakCallingQCReportPanel.tsx` | 55, 62 | "Reference Genome", "QC Report" spans |
| `components/peak-calling/PeakCallingQCReportPanel.tsx` | 88-112 | Table `<th>` headers |
| `components/normalization/NormalizationResultsPanel.tsx` | 124, 127, 130 | Table `<th>` headers |

### 4d. Component Labels and Headings
| File | Lines | Notes |
|------|-------|-------|
| `components/igv/IGVPanel.tsx` | 261 | Genome selector label |
| `components/reactions/ReactionsEditor.tsx` | 192 | Optional columns label |
| `components/fastqs/FileUploadZone.tsx` | 220 | File count label |
| `components/reactions/CsvUploadZone.tsx` | 79 | Upload section label |
| `components/ui/ChooseBigWigSourceStep.tsx` | 74, 127 | Section headings (also add `tracking-wide` to line 74 if missing) |

### 4e. Wizard Details Steps (3 files, ~7 instances each)
| File | Lines |
|------|-------|
| `components/alignment/AlignmentDetailsStep.tsx` | 20, 26, 43, 57, 63, 73, 87 |
| `components/peak-calling/PeakCallingDetailsStep.tsx` | 20, 26, 43, 57, 63, 73, 85 |
| `components/diffbind/DiffBindDetailsStep.tsx` | 20, 26, 43, 57, 63, 75, 88 |

### 4f. Wizard Settings Steps (3 files, many instances each)
| File | Lines |
|------|-------|
| `components/alignment/AlignmentSettingsStep.tsx` | 56, 95, 102, 105, 108, 167, 184 |
| `components/peak-calling/PeakCallingSettingsStep.tsx` | 89, 107, 125, 152, 159, 162, 165, 168, 171, 219, 242, 265, 290, 324, 348 |
| `components/diffbind/DiffBindSettingsStep.tsx` | 55, 106, 140, 160, 163 |

### 4g. Other Wizard/Modal Steps
| File | Lines |
|------|-------|
| `components/experiments/ExperimentDetailsStep.tsx` | 27, 44, 66 |
| `components/projects/CreateProjectModal.tsx` | 48 |
| `components/projects/ManageMembersModal.tsx` | 100 |
| `components/fastqs/TrimConfigModal.tsx` | 60, 76, 93, 105, 120, 133, 147 |

### 4h. Wizard Table Headers
| File | Lines |
|------|-------|
| `components/igv/SelectReactionsModal.tsx` | 85, 88, 91 |
| `components/diffbind/DiffBindInputPanel.tsx` | 38, 41, 44, 47 |
| `components/peak-calling/ChoosePeakCallingStep.tsx` | 42, 45, 48, 51, 54 |
| `components/alignment/ChooseAlignmentStep.tsx` | 43, 46, 49, 52 |
| `components/alignment/ChooseReactionsStep.tsx` | 59, 62, 65, 68 |
| `components/peak-calling/ChooseReactionsStep.tsx` | 63 |

---

## Execution Strategy

1. Run Groups 1-3 first (primitives + critical + font-mono) — these are targeted, low-risk
2. Run Group 4 by sub-batch (4a-4h), using `replace_all` where the exact className string repeats within a file
3. After all edits: `npm run typecheck` and `npm run lint`
4. Verify no frozen files touched

## Verification

1. `npm run typecheck` — zero errors
2. `npm run lint` — zero errors (or only pre-existing warnings)
3. `npm run build` — successful
4. Grep verification:
   - `grep -r '&#10003;\|&#10007;' frontend/src/` → zero results
   - `grep -rn 'uppercase.*tracking-wide' frontend/src/ --include='*.tsx' | grep -v font-display` → zero results (all instances have font-display)
   - `grep -rn 'border-t-transparent' frontend/src/ --include='*.tsx'` → zero results
5. No frozen files modified (api/, hooks/, contexts/, constants.ts, utils.ts, backend/)
