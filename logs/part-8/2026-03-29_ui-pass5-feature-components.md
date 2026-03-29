# UI Improvement Pass 5: Feature Components

**Date**: 2026-03-29
**Scope**: Systematic icon, font, and spinner replacement across all feature domain components

## What Was Done

### Batch 1 — Reactions (4 files)
- **`ReactionsEditor.tsx`** — Deleted 3 local SVG icon functions (CheckIcon, PencilIcon, TrashIcon), replaced with lucide `Check`, `Pencil`, `Trash2`. Spinner → `Loader2`. `font-display` on heading.
- **`ReactionsTab.tsx`** — Deleted local CheckIcon SVG, replaced with lucide `Check`. Spinner → `Loader2`. `font-display` on heading.
- **`CsvUploadZone.tsx`** — Download SVG → lucide `Download`. Spinner → `Loader2`. `+` placeholder → lucide `Upload` icon.
- **`ReactionFormModal.tsx`** — `▲`/`▼` More/Less Fields → lucide `ChevronDown` with `rotate-180` transition.

### Batch 2 — FASTQs (3 files)
- **`FastqcReportModal.tsx`** — `✕` close → lucide `X`. Download SVG → `Download`. Fullscreen SVG → `Maximize2`/`Minimize2`. Spinner → `Loader2`.
- **`FastqsTab.tsx`** — Warning SVG → lucide `AlertTriangle`. FASTQC icon SVG → `FileText`. Delete SVG → `Trash2`. 2 spinners → `Loader2`. `font-mono` on file sizes and total reads. `font-display` on heading.
- **`FileUploadZone.tsx`** — Already clean from prior work (confirmed `X`, `Upload` icons, `font-mono` on sizes).

### Batch 3 — Alignment (7 files)
- **`AlignmentQCReportPanel.tsx`** (489 lines) — 3 spinners → `Loader2`. 2 `▲`/`▼` toggles → `ChevronDown` with rotation. `Download` icon on CSV button and heatmap PNG downloads. `font-mono` on ALL 9 numeric metric columns. `font-display` on 5 section headings.
- **`AlignmentFilesPanel.tsx`** — Spinner → `Loader2`. `Download` icon. `font-mono` on sizes. `font-display` on heading.
- **`AlignmentInfoPanel.tsx`** — `Copy` icon on methods button. `font-display` on 3 headings. `font-mono` on Run ID.
- **`AlignmentInputPanel.tsx`** — `font-display` on heading.
- **`AlignmentSettingsStep.tsx`** — `▼` → lucide `ChevronDown`.
- **`NewAlignmentWizard.tsx`** — Spinner → `Loader2`.
- **`AlignmentTab.tsx`** — Spinner → `Loader2`.

### Batch 4 — Peak Calling (8 files)
- **`PeakCallingQCReportPanel.tsx`** — Spinner → `Loader2`. `Download` icon on 2 CSV buttons. `font-mono` on 4 numeric columns + FRiP badge. `font-display` on 3 headings.
- **`PeakAnnotationChart.tsx`** — `Download` icon on PNG/CSV buttons. `font-mono` on tooltip percentage. `font-display` on chart title.
- **`PeakCallingSettingsStep.tsx`** — `▼` → `ChevronDown`.
- **`PeakCallingFilesPanel.tsx`** — Spinner → `Loader2`. `Download` icon. `font-mono` on sizes. `font-display`.
- **`PeakCallingInfoPanel.tsx`** — `Copy` icon. `font-display` on 3 headings. `font-mono` on Run ID.
- **`PeakCallingInputPanel.tsx`** — `font-display` on heading.
- **`NewPeakCallingWizard.tsx`** — Spinner → `Loader2`.
- **`PeakCallingTab.tsx`** — Spinner → `Loader2`.

### Batch 5 — DiffBind (7 files)
- **`DiffBindResultsPanel.tsx`** — Spinner → `Loader2`. `font-mono` on all numeric cells (FDR, p-value, fold change, genomic coordinates, concentration columns). `Download` icon on 2 buttons. `font-display` on 5 headings.
- **`DiffBindPlotsPanel.tsx`** — 2 spinners → `Loader2`. `Download` on PNG/SVG buttons. `font-display` on plot labels (kept as mixed-case content titles, not uppercase).
- **`DiffBindFilesPanel.tsx`** — Spinner, `Download`, `font-mono` on sizes, `font-display`.
- **`DiffBindInfoPanel.tsx`** — `Copy` icon, `font-display` on 3 headings, `font-mono` on Run ID.
- **`DiffBindInputPanel.tsx`** — `font-display`, `font-mono` on replicate numbers.
- **`NewDiffBindWizard.tsx`** — Spinner → `Loader2`.
- **`DiffBindTab.tsx`** — Spinner → `Loader2`.

### Batch 6 — Heatmaps + Correlation + Normalization (13 files)
- **Custom Heatmap**: `CustomHeatmapPlotsPanel.tsx` (spinners, Download icons, font-mono on bp values, font-display), `CustomHeatmapFilesPanel.tsx` (spinner, Download, font-mono, font-display), `SelectSamplesStep.tsx` (`↑`/`↓` → `ChevronUp`/`ChevronDown`), `CustomHeatmapTab.tsx` (spinner).
- **Pearson Correlation**: `PearsonCorrelationPlotsPanel.tsx` (spinners, Download icons, font-mono on sample count, font-display), `PearsonCorrelationFilesPanel.tsx` (same pattern), `PearsonSelectSamplesStep.tsx` (arrow icons), `PearsonCorrelationTab.tsx` (spinner).
- **Normalization**: `NormalizationResultsPanel.tsx` (spinners, Download, font-mono on percentile/NF values, font-display), `NormalizationFilesPanel.tsx` (same), `NormalizationSelectSamplesStep.tsx` (arrow icons), `NewNormalizationWizard.tsx` (spinner), `NormalizationTab.tsx` (spinner).

### Batch 7 — IGV + All Files (2 files)
- **`IGVPanel.tsx`** — `&#8635;` refresh → lucide `RefreshCw`. "Full Screen" text → `Maximize2`/`Minimize2` icons + text.
- **`AllFilesTab.tsx`** — `▼`/`▶` → `ChevronDown`/`ChevronRight`. `📁` emoji → `Folder`/`FolderOpen`. `📄` → `File`. Spinner → `Loader2`. `font-mono` on filenames and sizes. `font-display` on headings. `Download` icon on button.

### Batch 8 — Remaining (5 files)
- **`ProtectedRoute.tsx`** — Spinner → `Loader2`.
- **`AutoPipelineBanner.tsx`** — 2 spinners → `Loader2`.
- **`ChooseBigWigSourceStep.tsx`** — Spinner → `Loader2`.
- **`NotificationPanel.tsx`** — 4 inline SVG icon functions → lucide `UserPlus`, `CheckCircle`, `XCircle`, `Bell`.
- **`ManageMembersModal.tsx`** — Inline SVG (X pattern) → lucide `UserMinus`.

## Decisions Made

- **Content titles vs section labels**: Card-level headings naming specific content (plot labels like "Correlation Heatmap", "PCA Plot", "Normalization Factors") get `font-display` but stay mixed-case `text-gray-700`. Section-level category labels ("FILES", "QC REPORT", "REACTIONS") use the full `font-display uppercase tracking-wide text-gray-500` pattern. This preserves a two-tier visual hierarchy.
- **FileUploadZone already clean**: Was updated in a prior session — removed unused `Loader2` import that a previous pass had left.
- **ManageMembersModal icon**: Changed from X-pattern SVG to `UserMinus` since it's a "remove member" action, not a generic close.

## Verification

- `npm run typecheck` — clean (0 errors)
- `npm run lint` — clean (0 errors, 3 pre-existing warnings)
- `npm run build` — successful
- No frozen files modified (`utils.ts`, `constants.ts`, `api/`, `hooks/`, `contexts/`, `backend/`)
- Zero remaining inline SVGs in `components/`
- Zero remaining border-spinner patterns in `src/`
- Zero remaining Unicode arrow/symbol characters in `src/`
