# UI Improvement Pass 5: Feature Components

## Context

Passes 1-4 established the foundation (shadcn/ui, fonts, Tailwind theme), upgraded core UI primitives (Button, Modal, WizardModal, DataTable, Card, StatusBadge, JobErrorDetails, JobActions), polished layout/navigation (Navbar, Breadcrumbs, NewAnalysisDropdown, ExperimentView sidebar tabs), and applied page-level polish (auth pages, HomePage, ProjectDetailPage, AnalysisQueuePage, SettingsPage).

Pass 5 applies the **same patterns systematically across all feature components** — the domain-specific panels, wizards, and tabs that researchers interact with daily. This is high-volume, low-risk work: icon swaps, font class additions, and spinner replacements following established conventions.

## Change Summary

| Change Type | Count | Pattern |
|-------------|-------|---------|
| Inline spinners → `Loader2` | ~40 | `<Loader2 className="h-8 w-8 animate-spin text-primary" />` |
| Custom SVG icons → lucide | ~12 | Replace `<svg>` with lucide component |
| Unicode chars → lucide icons | ~14 | `▼`/`▲`/`↑`/`↓`/`✕`/`📁`/`▶`/`&#8635;` → lucide equivalents |
| Download button icons | ~20 | Add `<Download className="h-3.5 w-3.5" />` before text |
| Copy button icons | ~3 | Add `<Copy className="h-3.5 w-3.5" />` before text |
| `font-mono` on data values | ~30 cells | File sizes, read counts, FRiP, percentages, coordinates |
| `font-display` on headings | ~25 headings | Section titles, card headers |

## Execution Batches (8 batches, verify after each)

### Batch 1: Reactions Components
**Files**: `ReactionsEditor.tsx`, `ReactionsTab.tsx`, `CsvUploadZone.tsx`, `ReactionFormModal.tsx`

**ReactionsEditor.tsx** (`frontend/src/components/reactions/ReactionsEditor.tsx`):
- Delete local `CheckIcon()`, `PencilIcon()`, `TrashIcon()` SVG functions (lines 27-49)
- Import `{ Check, Pencil, Trash2, Loader2 }` from `lucide-react`
- Replace `<CheckIcon />` → `<Check className="h-5 w-5 text-green-500" />`
- Replace `<PencilIcon />` → `<Pencil className="h-4 w-4" />`
- Replace `<TrashIcon />` → `<Trash2 className="h-4 w-4" />`
- Line 179: spinner → `<Loader2 className="h-8 w-8 animate-spin text-primary" />`
- Line ~202: "Reactions" heading → add `font-display`

**ReactionsTab.tsx** (`frontend/src/pages/experiment/ReactionsTab.tsx`):
- Delete local `CheckIcon()` SVG function (lines 17-23)
- Import `{ Check, Loader2 }` from `lucide-react`
- Replace `<CheckIcon />` → `<Check className="h-5 w-5 text-green-500" />`
- Line 71: spinner → `<Loader2 className="h-8 w-8 animate-spin text-primary" />`
- Line ~81: "Reactions" heading → add `font-display`

**CsvUploadZone.tsx** (`frontend/src/components/reactions/CsvUploadZone.tsx`):
- Line 88-90: Replace inline download SVG → `<Download className="h-4 w-4" />` from lucide
- Line 129: spinner → `<Loader2 className="h-6 w-6 animate-spin text-primary" />`

**ReactionFormModal.tsx** (`frontend/src/components/reactions/ReactionFormModal.tsx`):
- Line 283: `▲`/`▼` text → `<ChevronDown className={cn("h-4 w-4 transition-transform", showMore && "rotate-180")} />` with text label
- Import `{ ChevronDown }` from `lucide-react` and `cn` from `@/lib/cn`

**Verify**: `npm run typecheck`. Reactions tab renders. Edit/delete/CSV upload works.

---

### Batch 2: FASTQ Components
**Files**: `FileUploadZone.tsx`, `FastqcReportModal.tsx`, `FastqsTab.tsx`

**FileUploadZone.tsx** (`frontend/src/components/fastqs/FileUploadZone.tsx`):
- Import `{ X, Upload, Loader2 }` from `lucide-react`
- Line 256: `✕` → `<X className="h-4 w-4" />`
- Drag-and-drop placeholder area: add `<Upload className="h-8 w-8 text-gray-400" />` icon
- File sizes (formatBytes outputs) and progress percentages: wrap in `<span className="font-mono">...</span>`

**FastqcReportModal.tsx** (`frontend/src/components/fastqs/FastqcReportModal.tsx`):
- Import `{ Download, Maximize2, Minimize2, X, Loader2 }` from `lucide-react`
- Line 52: `✕` → `<X className="h-4 w-4" />`
- Lines 60-66: Download SVG → `<Download className="h-4 w-4" />`
- Lines 75-80: Fullscreen toggle SVG → `<Maximize2 className="h-4 w-4" />` / `<Minimize2 className="h-4 w-4" />`
- Line 102: spinner → `<Loader2 className="h-8 w-8 animate-spin text-primary" />`

**FastqsTab.tsx** (`frontend/src/pages/experiment/FastqsTab.tsx`):
- Import `{ AlertTriangle, FileText, Trash2, Loader2 }` from `lucide-react`
- Lines 306-308: Warning SVG → `<AlertTriangle className="h-5 w-5 text-amber-500" />`
- Lines 203-213: File/FASTQC icon SVG → `<FileText className="h-4 w-4" />` (or keep if it's a complex status indicator — check)
- Lines 240-251: Delete/trash SVG → `<Trash2 className="h-4 w-4" />`
- Lines 272, 347: spinners → `<Loader2 ...>`
- File sizes, total reads columns: add `font-mono` to cell renderers
- Line ~282: "FASTQ Files" heading → add `font-display`

**Verify**: `npm run typecheck`. FASTQs tab renders. Upload zone works. FastQC modal opens. Trim banner shows.

---

### Batch 3: Alignment Components
**Files**: `AlignmentQCReportPanel.tsx`, `AlignmentFilesPanel.tsx`, `AlignmentInfoPanel.tsx`, `AlignmentInputPanel.tsx`, `AlignmentSettingsStep.tsx`, `NewAlignmentWizard.tsx`, `AlignmentTab.tsx`

**AlignmentQCReportPanel.tsx** (`frontend/src/components/alignment/AlignmentQCReportPanel.tsx`) — **largest file, ~489 lines**:
- Import `{ ChevronDown, Download, Loader2 }` from `lucide-react` and `cn` from `@/lib/cn`
- Lines 91, 295, 396: spinners → `<Loader2 ...>`
- Line 153: `▲ Hide` / `▼ Show` → `<ChevronDown className={cn("h-3.5 w-3.5 transition-transform", infoOpen && "rotate-180")} />` + text
- Line 323: Same pattern for "About" toggle
- Lines 129-136: "Download Data as CSV" button → add `<Download className="h-3.5 w-3.5" />` before text
- All numeric metric cells (read pairs, alignment rates, duplication rates, percentages, spike-in recovery values): add `font-mono`
- Section headings (QC Report, Spike-in, Heatmaps): add `font-display`

**AlignmentFilesPanel.tsx** (`frontend/src/components/alignment/AlignmentFilesPanel.tsx`):
- Import `{ Download, Loader2 }` from `lucide-react`
- Line 157: spinner → `<Loader2 ...>`
- Download button → add `<Download className="h-3.5 w-3.5" />`
- File sizes: add `font-mono`
- Section heading: add `font-display`

**AlignmentInfoPanel.tsx** (`frontend/src/components/alignment/AlignmentInfoPanel.tsx`):
- Section headings (Details, Run Methods, Notes): add `font-display`
- Run ID value: add `font-mono`
- Methods text block: already `font-mono` (verify)
- Copy button: verify it already has lucide `Copy` icon (from Pass 2 JobErrorDetails pattern)

**AlignmentInputPanel.tsx** (`frontend/src/components/alignment/AlignmentInputPanel.tsx`):
- "Reactions" heading: add `font-display`

**AlignmentSettingsStep.tsx** (`frontend/src/components/alignment/AlignmentSettingsStep.tsx`):
- Line 138: `▼` → `<ChevronDown className="h-4 w-4" />`

**NewAlignmentWizard.tsx** (`frontend/src/components/alignment/NewAlignmentWizard.tsx`):
- Line 211: spinner → `<Loader2 ...>`

**AlignmentTab.tsx** (`frontend/src/pages/experiment/AlignmentTab.tsx`):
- Line 52: spinner → `<Loader2 ...>`

**Verify**: `npm run typecheck`. Alignment tab renders with all sub-tabs (Info/Input/QC/Files/IGV). QC report shows metrics. Download works.

---

### Batch 4: Peak Calling Components
**Files**: `PeakCallingQCReportPanel.tsx`, `PeakAnnotationChart.tsx`, `PeakCallingSettingsStep.tsx`, `PeakCallingFilesPanel.tsx`, `PeakCallingInfoPanel.tsx`, `PeakCallingInputPanel.tsx`, `NewPeakCallingWizard.tsx`, `PeakCallingTab.tsx`

**PeakCallingQCReportPanel.tsx**:
- Import `{ Download, Loader2 }` from `lucide-react`
- Line 33: spinner → `<Loader2 ...>`
- Numeric values (read pairs, called peaks, FRiP): add `font-mono`
- Download button: add `<Download className="h-3.5 w-3.5" />`
- Section headings: add `font-display`

**PeakAnnotationChart.tsx**:
- FRiP values in tooltip: add `font-mono`
- Percentage values: add `font-mono`
- Download buttons (PNG/CSV): add `<Download className="h-3.5 w-3.5" />`
- Chart title: add `font-display`

**PeakCallingSettingsStep.tsx**:
- Line 210: `▼` → `<ChevronDown className="h-4 w-4" />`
- Parameter values in advanced settings inputs: add `font-mono`

**PeakCallingFilesPanel.tsx**:
- Line 154: spinner → `<Loader2 ...>`
- File sizes: add `font-mono`
- Section heading: add `font-display`

**PeakCallingInfoPanel.tsx**:
- Section headings: add `font-display`
- Run ID: add `font-mono`
- Copy methods button: add `Copy` icon if not present

**PeakCallingInputPanel.tsx**:
- Heading: add `font-display`

**NewPeakCallingWizard.tsx**:
- Line 276: spinner → `<Loader2 ...>`

**PeakCallingTab.tsx**:
- Line 50: spinner → `<Loader2 ...>`

**Verify**: `npm run typecheck`. Peak calling tab renders. QC report with annotation chart works. Settings advanced toggle works.

---

### Batch 5: DiffBind Components
**Files**: `DiffBindResultsPanel.tsx`, `DiffBindFilesPanel.tsx`, `DiffBindInfoPanel.tsx`, `DiffBindInputPanel.tsx`, `DiffBindPlotsPanel.tsx`, `NewDiffBindWizard.tsx`, `DiffBindTab.tsx`

**DiffBindResultsPanel.tsx**:
- Import `{ Download, Loader2 }` from `lucide-react`
- Line 92: spinner → `<Loader2 ...>`
- Summary card numbers (Total Peaks, Significant Peaks): add `font-mono`
- FDR/p-value badges: add `font-mono` to the numeric value
- Download buttons (Results TSV, Normalized Counts): add `<Download className="h-3.5 w-3.5" />`
- Section headings: add `font-display`

**DiffBindPlotsPanel.tsx**:
- Lines 36, 172: spinners → `<Loader2 ...>`
- Download buttons (PNG/SVG for each plot): add `<Download className="h-3.5 w-3.5" />`
- Section headings: add `font-display`

**DiffBindFilesPanel.tsx**:
- Line 154: spinner → `<Loader2 ...>`
- File sizes: add `font-mono`
- Section heading: add `font-display`

**DiffBindInfoPanel.tsx**:
- Section headings: add `font-display`
- Run ID: add `font-mono`
- Copy methods button: add `Copy` icon if not present

**DiffBindInputPanel.tsx**:
- Heading: add `font-display`
- Replicate numbers: add `font-mono`

**NewDiffBindWizard.tsx**:
- Line 347: spinner → `<Loader2 ...>`

**DiffBindTab.tsx**:
- Line 50: spinner → `<Loader2 ...>`

**Verify**: `npm run typecheck`. DiffBind tab renders. Results panel shows. Plots load. Download works.

---

### Batch 6: Custom Heatmap + Pearson Correlation + Roman Normalization
**Files**: `CustomHeatmapPlotsPanel.tsx`, `CustomHeatmapFilesPanel.tsx`, `SelectSamplesStep.tsx`, `PearsonCorrelationPlotsPanel.tsx`, `PearsonCorrelationFilesPanel.tsx`, `PearsonSelectSamplesStep.tsx`, `NormalizationResultsPanel.tsx`, `NormalizationFilesPanel.tsx`, `NormalizationSelectSamplesStep.tsx`, `NewNormalizationWizard.tsx`, `CustomHeatmapTab.tsx`, `PearsonCorrelationTab.tsx`, `NormalizationTab.tsx`

**CustomHeatmapPlotsPanel.tsx**:
- Lines 22, 186: spinners → `<Loader2 ...>`
- Download buttons (Matrix, PNG, SVG): add `<Download className="h-3.5 w-3.5" />`
- Numeric values (bp distances): add `font-mono`
- Section headings: add `font-display`

**CustomHeatmapFilesPanel.tsx**:
- Line 154: spinner → `<Loader2 ...>`
- File sizes: add `font-mono`
- Section heading: add `font-display`

**SelectSamplesStep.tsx** (`frontend/src/components/custom-heatmap/SelectSamplesStep.tsx`):
- Lines 299, 308: `↑`/`↓` → `<ChevronUp className="h-4 w-4" />` / `<ChevronDown className="h-4 w-4" />`
- Section heading: add `font-display`

**PearsonCorrelationPlotsPanel.tsx**:
- Lines 48, 181: spinners → `<Loader2 ...>`
- Download buttons (Correlation CSV, Coverage CSV, PNG, SVG): add `<Download className="h-3.5 w-3.5" />`
- Sample counts: add `font-mono`
- Section headings: add `font-display`

**PearsonCorrelationFilesPanel.tsx**:
- Line 156: spinner → `<Loader2 ...>`
- File sizes: add `font-mono`
- Section heading: add `font-display`

**PearsonSelectSamplesStep.tsx**:
- Lines 146, 155: `↑`/`↓` → `<ChevronUp className="h-4 w-4" />` / `<ChevronDown className="h-4 w-4" />`

**NormalizationResultsPanel.tsx**:
- Lines 46, 207: spinners → `<Loader2 ...>`
- Percentile and normalization factor values: add `font-mono`
- Download button (Factors CSV): add `<Download className="h-3.5 w-3.5" />`
- Section headings: add `font-display`

**NormalizationFilesPanel.tsx**:
- Line 156: spinner → `<Loader2 ...>`
- File sizes: add `font-mono`
- Section heading: add `font-display`

**NormalizationSelectSamplesStep.tsx**:
- Lines 154, 163: `↑`/`↓` → `<ChevronUp className="h-4 w-4" />` / `<ChevronDown className="h-4 w-4" />`

**NewNormalizationWizard.tsx**:
- Line 253: spinner → `<Loader2 ...>`

**Tab pages** (CustomHeatmapTab, PearsonCorrelationTab, NormalizationTab):
- Each has 1 spinner → `<Loader2 ...>`

**Verify**: `npm run typecheck`. All three analysis tabs render. Plots load. Sample reorder buttons work. Downloads work.

---

### Batch 7: IGV + All Files Tab
**Files**: `IGVPanel.tsx`, `AllFilesTab.tsx`

**IGVPanel.tsx** (`frontend/src/components/igv/IGVPanel.tsx`):
- Import `{ RefreshCw, Maximize2, Minimize2 }` from `lucide-react`
- Line 292: `&#8635;` → `<RefreshCw className="h-4 w-4" />`
- "Full Screen" text button → `<Maximize2 className="h-4 w-4" />` (with aria-label)
- Exit full screen → `<Minimize2 className="h-4 w-4" />`

**AllFilesTab.tsx** (`frontend/src/pages/experiment/AllFilesTab.tsx`):
- Import `{ ChevronDown, ChevronRight, Folder, FolderOpen, Loader2, File }` from `lucide-react`
- Line 65: `▼`/`▶` → `<ChevronDown className="h-3.5 w-3.5" />` / `<ChevronRight className="h-3.5 w-3.5" />`
- Lines 67, 216: `📁` → `<FolderOpen className="h-4 w-4 text-gray-400" />` (when expanded) / `<Folder className="h-4 w-4 text-gray-400" />` (when collapsed)
- File entries: add `<File className="h-4 w-4 text-gray-400" />` icon before filename (if not already present)
- Filenames: add `font-mono`
- File sizes: add `font-mono`
- Line 149: spinner → `<Loader2 ...>`
- Title heading: add `font-display`

**Verify**: `npm run typecheck`. IGV renders. Refresh/fullscreen buttons work. File tree expands/collapses. File downloads work.

---

### Batch 8: Remaining Spinners + NotificationPanel + Miscellaneous
**Files**: `ProtectedRoute.tsx`, `AutoPipelineBanner.tsx`, `ChooseBigWigSourceStep.tsx`, `NotificationPanel.tsx`, `ManageMembersModal.tsx`

**ProtectedRoute.tsx** (`frontend/src/components/auth/ProtectedRoute.tsx`):
- Line 11: spinner → `<Loader2 className="h-8 w-8 animate-spin text-primary" />`

**AutoPipelineBanner.tsx** (`frontend/src/components/experiments/AutoPipelineBanner.tsx`):
- Lines 132, 177: spinners → `<Loader2 ...>` (h-4 and h-3 sizes)

**ChooseBigWigSourceStep.tsx** (`frontend/src/components/ui/ChooseBigWigSourceStep.tsx`):
- Line 52: spinner → `<Loader2 ...>`

**NotificationPanel.tsx** (`frontend/src/components/layout/NotificationPanel.tsx`):
- Lines 16-37: 4 inline SVG icons (project invitation, job complete, job error, default) → replace with lucide equivalents:
  - Project invitation: `UserPlus` (h-5 w-5 text-primary)
  - Job complete: `CheckCircle` (h-5 w-5 text-status-complete)
  - Job error: `XCircle` (h-5 w-5 text-status-error)
  - Default: `Bell` (h-5 w-5 text-primary)

**ManageMembersModal.tsx** (`frontend/src/components/projects/ManageMembersModal.tsx`):
- Line 160: Inline SVG (trash/remove icon) → `<Trash2 className="h-4 w-4" />` or `<UserMinus className="h-4 w-4" />`

**Verify**: `npm run typecheck`. Notifications render with icons. Protected route spinner shows. Manage members delete works.

---

## Files NOT Modified

These were reviewed and need no Pass 5 changes:
- `TrimConfigModal.tsx` — uses Modal (inherits Dialog), no SVGs/spinners/Unicode
- `AssignConditionsStep.tsx`, `DiffBindDetailsStep.tsx`, `DiffBindSettingsStep.tsx` — wizard form steps, minimal visual content
- `ChoosePeakCallingStep.tsx`, `ChooseAlignmentStep.tsx`, `ChooseReactionsStep.tsx` — selection steps
- `PeakCallingDetailsStep.tsx`, `AlignmentDetailsStep.tsx` — name/notes inputs
- `SelectReactionsModal.tsx` (IGV) — simple checkbox modal
- `NormalizationSettingsStep.tsx` — read-only display
- `HistoryTab.tsx` — placeholder page
- `DescriptionTab.tsx` — already clean
- `NewPearsonCorrelationWizard.tsx` — wizard shell (check for spinners though)
- `FastqTable.tsx` — not a separate file

## Key Implementation Patterns (Reference)

**Spinner replacement:**
```tsx
// BEFORE
<div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
// AFTER
import { Loader2 } from 'lucide-react';
<Loader2 className="h-8 w-8 animate-spin text-primary" />
```

**Download icon addition:**
```tsx
// BEFORE
<Button variant="outline" size="sm" onClick={handleDownload}>Download CSV</Button>
// AFTER
import { Download } from 'lucide-react';
<Button variant="outline" size="sm" onClick={handleDownload}>
  <Download className="mr-1.5 h-3.5 w-3.5" />
  Download CSV
</Button>
```

**Chevron expand/collapse:**
```tsx
// BEFORE
{showMore ? '▲ Less Fields' : '▼ More Fields'}
// AFTER
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
<ChevronDown className={cn("h-4 w-4 transition-transform", showMore && "rotate-180")} />
{showMore ? 'Less Fields' : 'More Fields'}
```

**font-mono on data values:**
```tsx
// BEFORE
<td className="px-3 py-2 text-sm">{formatNumber(row.totalReads)}</td>
// AFTER
<td className="px-3 py-2 text-sm font-mono">{formatNumber(row.totalReads)}</td>
```

**font-display on headings:**
```tsx
// BEFORE
<h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
// AFTER
<h3 className="font-display text-sm font-semibold uppercase tracking-wide text-gray-500">
```

## Verification

After all 8 batches:
- `npm run typecheck` — zero errors
- `npm run lint` — zero new errors
- `npm run build` — successful
- No frozen files modified (utils.ts, constants.ts, api/, hooks/, contexts/, backend/)
- All experiment tabs render: Description, FASTQs, Reactions, Alignment (5 sub-tabs), Peak Calling (5 sub-tabs), DiffBind (5 sub-tabs), Heatmaps (3 sub-tabs), Correlation (3 sub-tabs), Normalization (3 sub-tabs), History, All Files
- All wizards complete: Alignment (3-step), Peak Calling (4-step), DiffBind (4-step), Heatmap, Correlation, Normalization
- File downloads work, IGV loads, QC reports display
