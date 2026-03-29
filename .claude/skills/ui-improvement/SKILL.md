---
name: ui-improvement
description: Systematic visual polish pass for the Cleave bioinformatics platform frontend. Upgrades typography, icons, components, motion, and layout without touching backend or breaking functionality.
---

# Cleave UI Improvement Pass

You are a senior frontend designer-developer improving the visual quality of **Cleave**, a CUT&RUN/CUT&Tag bioinformatics web platform. The app is functionally complete (Phases 1-6 done, 373 backend tests passing) but needs a design polish pass to look professional and distinctive rather than prototyped.

**Your job is purely visual/UX improvement.** You are not adding features, fixing bugs, or refactoring architecture. You are making what exists look and feel significantly better.

---

## ABSOLUTE CONSTRAINTS — READ FIRST

These are non-negotiable. Violating any of these invalidates your work.

1. **DO NOT modify any file under `backend/`** — zero backend changes, period
2. **DO NOT modify `frontend/src/api/`** — API client, endpoints, and type definitions are frozen
3. **DO NOT modify `frontend/src/hooks/`** — data fetching logic is frozen
4. **DO NOT modify `frontend/src/contexts/`** — auth context is frozen
5. **DO NOT modify `frontend/src/lib/constants.ts` or `frontend/src/lib/utils.ts`** — shared constants are frozen
6. **DO NOT change TypeScript interfaces/types** that cross component boundaries (props interfaces can gain optional fields, never lose or rename existing ones)
7. **Allowed UI additions**: `shadcn/ui` (copy-paste components built on Radix + Tailwind — you own the code), `lucide-react` (icon library, installed automatically with shadcn), and Google Fonts via `<link>` tag. **DO NOT add** MUI, Chakra, Ant Design, Mantine, or any other heavy component library. shadcn components land in `components/ui/` as owned files you can edit.
8. **DO NOT add animation libraries** — no Framer Motion, React Spring, GSAP. CSS transitions and `@keyframes` in Tailwind are sufficient
9. **DO NOT change the Tailwind color names** (`primary`, `status-*`, `accent-*`) — they are referenced across 70+ files
10. **DO NOT change the router configuration** in `App.tsx`
11. **Dark mode is in scope** — use shadcn's CSS variable theming to support both light and dark modes. shadcn components get this nearly for free. Toggle via a theme switcher in the Navbar (user preference, persisted to localStorage). The gradient background is a light-mode brand element — in dark mode, replace it with a subtle dark gradient or solid dark background
12. **DO NOT change how data flows** from hooks → components → rendering. Only change how things look, not what they do
13. **Every existing user workflow must continue working identically** — project creation, experiment wizards, FASTQ upload, alignment/peak-calling/DiffBind/heatmap/correlation/normalization launch, QC report viewing, IGV browser, file download, member management, notifications
14. **Run `npm run typecheck` after every batch of changes.** If it fails, fix before continuing.

---

## DESIGN DIRECTION: "Scientific Clarity"

The aesthetic of a well-typeset research paper meets a modern data observatory. NOT generic SaaS. NOT consumer app. NOT AI slop. Clean, dense, confident, and quietly distinctive.

This platform is used by ~8-10 researchers who spend hours analyzing CUT&RUN/CUT&Tag data. They value **information density** over whitespace, **precision** over playfulness, and **trustworthiness** over trendiness. Think Nature journal meets a Bloomberg terminal, not Notion meets Dribbble.

### Typography — "The Researcher" (Source Family)

The font pairing is decided: the **Source** family by Adobe, designed as a cohesive system. Serif headings evoke academic publishing, sans body is clean and readable, mono is industry-standard for code.

- **Display/heading font**: **Source Serif 4** (weights 600, 700) — for page titles, section headings, card titles, the "Cleave" wordmark
- **Body/UI font**: **Source Sans 3** (weights 400, 500, 600) — for all body text, labels, buttons, form inputs, table cells
- **Monospace font**: **Source Code Pro** (weights 400, 500) — for filenames, file sizes, read counts, genomic coordinates, pipeline parameters, FRiP scores, alignment rates, log output

Load via Google Fonts `<link>` in `frontend/index.html`. Set in `frontend/tailwind.config.js` under `fontFamily: { display, body, mono }`. Apply `font-body` as the base, `font-display` on headings and page titles, `font-mono` on filenames, sizes, read counts, genomic coordinates, and pipeline parameters.

If the Source family doesn't feel right after rendering, alternative pairings to try: Literata + DM Sans + JetBrains Mono ("The Journal"), or Newsreader + IBM Plex Sans + IBM Plex Mono ("The Observatory"). But start with Source.

### Color Refinement

Keep the existing palette but refine:
- **Background whites**: Not pure `#FFFFFF`. Use `#FAFBFC` or `#F8F9FA` as the page background behind cards. Cards stay white.
- **Gradient background**: Keep it as the brand element but consider softening the lime→gold transition (it can read as "construction warning"). Reduce saturation slightly in the 50-75% range.
- **Border philosophy**: Lean toward subtle borders (`border-gray-200`) over shadows for card boundaries. Shadows for floating elements (dropdowns, modals, tooltips). Borders for inline containers (cards, panels, table cells).
- **Status colors**: Already well-defined. Keep exactly as-is.

### Data Presentation

- Numbers, file sizes, read counts, percentages: render in `font-mono`
- Tables should feel like well-formatted data tables in a published paper — clean ruled lines, not chunky bordered boxes
- FRiP scores, alignment rates, p-values: use the monospace font with appropriate color coding
- Genomic coordinates (`chr1:55,053,483-55,056,567`): always monospace

### Density

Scientists work with data-dense interfaces. Do NOT increase padding or make things spacious. The current spacing is mostly good. If anything, some areas could be tightened. The data must be the star, not the chrome.

---

## CODEBASE INDEX

Before making changes, understand what exists. Use Explore agents to read the actual files and verify this index, but here is the complete inventory:

### UI Primitives (`frontend/src/components/ui/`)

| File | Lines | Current State | Key Issues |
|------|-------|--------------|------------|
| `Button.tsx` | 22 | 3 variants (primary/secondary/outlined), rounded-full | No loading state, no icon support, no size variants, no focus ring, no `cursor-not-allowed` on disabled |
| `Input.tsx` | 25 | Label + error state + focus ring | No size variants, no prefix/suffix icon slots, no description/hint text |
| `Modal.tsx` | 29 | Overlay + header (primary bg) + body | Close button is Unicode `✕` character, no entrance animation, no size variants |
| `WizardModal.tsx` | 109 | Multi-step wizard with numbered indicators | Close is Unicode `✕`, completed steps show number not checkmark, no step transition animation |
| `DataTable.tsx` | 83 | TanStack Table with sort + pagination | Sort indicators are Unicode `▲`/`▼`, no empty state, no column resize, no sticky header |
| `StatusBadge.tsx` | 18 | Colored dot + text label | No background tint, no pill shape |
| `StorageGauge.tsx` | 35 | Progress bar with dynamic color | Functional, minor polish only |
| `DetailRow.tsx` | 8 | Label/value pair with border | Minimal, functional |
| `JobActions.tsx` | 56 | Terminate/retry buttons | Inline styled, not using Button component consistently |
| `JobErrorDetails.tsx` | 86 | Expandable error with log viewer | Expand/collapse uses Unicode `▸`/`▾` |

### Layout (`frontend/src/components/layout/`)

| File | Lines | Key Issues |
|------|-------|------------|
| `Navbar.tsx` | 118 | User dropdown arrow is Unicode `▼`, dropdown is hand-built (not reusable), notification bell is inline SVG (fine) |
| `Card.tsx` | 15 | Just `rounded-lg bg-white p-6 shadow-sm`. No border, no variants, no header slot |
| `GradientBackground.tsx` | 13 | CSS variable gradient — functional, could refine colors |
| `Breadcrumbs.tsx` | 42 | Uses `>` character as separator |
| `NotificationPanel.tsx` | 152 | Has proper inline SVG icons for notification types, functional |

### Pages (`frontend/src/pages/`)

| File | Key Issues |
|------|------------|
| `HomePage.tsx` | Filter sidebar says "Not yet implemented", project cards are minimal, no empty state |
| `ProjectDetailPage.tsx` | Functional but flat, member avatars are basic teal circles |
| `ExperimentView.tsx` | 11 sidebar tabs with NO icons (just text labels), manually built tab navigation |
| `AnalysisQueuePage.tsx` | Pagination uses HTML entities (`&lsaquo;` etc.), filter bar is basic |
| `SettingsPage.tsx` | Minimal form layout, no visual hierarchy |
| `LoginPage.tsx` | Clean gradient + card, but card is plain, no logo/branding |
| `RegisterPage.tsx` | Same as login |
| `ForgotPasswordPage.tsx` | Same pattern |

### Feature Components (by domain)

| Domain | Dir | Files | Key Issues |
|--------|-----|-------|------------|
| Alignment | `components/alignment/` | 8 (~1,148 lines) | QC report panel (488 lines) is the largest — uses `▲`/`▼` for expand, info panel styling could improve |
| Peak Calling | `components/peak-calling/` | 7 (~1,348 lines) | PeakAnnotationChart uses Recharts (good), settings step has Unicode `▼` |
| DiffBind | `components/diffbind/` | 8 (~1,377 lines) | Complex wizard, AssignConditionsStep is the most intricate form |
| Custom Heatmaps | `components/custom-heatmap/` | 5 (~941 lines) | Functional wizard + plot display |
| Pearson Correlation | `components/pearson-correlation/` | 6 (~1,063 lines) | Sample reorder arrows, plot display |
| Roman Normalization | `components/normalization/` | 5 (~816 lines) | Results with bar chart image |
| FASTQs | `components/fastqs/` | 4 (~579 lines) | FileUploadZone (297 lines) has tus integration, uses `✕` for cancel |
| IGV | `components/igv/` | 2 (~477 lines) | IGVPanel uses `&#8635;` for refresh, text "Full Screen" button |
| Reactions | `components/reactions/` | 3 (~696 lines) | ReactionFormModal uses `▼`/`▲` for sections |
| Experiments | `components/experiments/` | 3 (~368 lines) | NewAnalysisDropdown uses `▼` |
| Projects | `components/projects/` | 2 (~178+ lines) | ManageMembersModal functional |

### Experiment Sub-Tab Pages (`frontend/src/pages/experiment/`)

| File | Description |
|------|-------------|
| `DescriptionTab.tsx` | Details card + Description card side-by-side |
| `FastqsTab.tsx` | FASTQ table + upload zone + trim banners |
| `ReactionsTab.tsx` | Reactions table with edit mode |
| `AlignmentTab.tsx` | Job selector dropdown + 5 sub-tabs (Info/Input/QC/Files/IGV) |
| `PeakCallingTab.tsx` | Same pattern as alignment |
| `DiffBindTab.tsx` | Job selector + 5 sub-tabs (Info/Input/Results/Plots/Files) |
| `CustomHeatmapTab.tsx` | Job selector + 3 sub-tabs (Info/Plot/Files) |
| `PearsonCorrelationTab.tsx` | Job selector + 3 sub-tabs (Info/Plot/Files) |
| `NormalizationTab.tsx` | Job selector + 3 sub-tabs (Info/Results/Files) |
| `HistoryTab.tsx` | Placeholder |
| `AllFilesTab.tsx` | Dual-panel file browser with tree + table, uses `▼`/`▶`/`📁` |

### Repeated Patterns to Standardize

These patterns appear across many files and should be addressed systematically:

- **Label class** `text-xs font-semibold uppercase tracking-wide text-gray-500` — appears ~20+ times across forms and detail panels
- **Loading spinner** `h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent` — appears in ~15 files
- **Unicode close** `✕` — appears in Modal, WizardModal, FastqcReportModal, FileUploadZone, TrimConfigModal
- **Unicode arrows** `▼`/`▲` — appears in Navbar, NewAnalysisDropdown, ReactionFormModal, AlignmentQCReportPanel, DataTable, AllFilesTab, JobErrorDetails
- **Unicode expand** `▸`/`▾`/`▶` — appears in JobErrorDetails, AllFilesTab, AlignmentQCReportPanel

---

## IMPLEMENTATION PASSES

Work through these in order. Each pass builds on the previous one. Verify after each pass.

### Pass 1: Foundation (Infrastructure Only)

**Goal**: Install shadcn/ui, icon library, fonts, and extend the Tailwind theme. No page-level component changes yet.

**Steps:**

1. **Initialize shadcn/ui** — Run `npx shadcn@latest init` in `frontend/`. This will:
   - Install `lucide-react`, `tailwindcss-animate`, `class-variance-authority`, `clsx`, `tailwind-merge`
   - Create a `cn()` utility (Tailwind class merging helper)
   - Configure path aliases and CSS variables for theming
   - When prompted: use the "New York" style (denser, more professional than "Default"), choose your primary/accent colors matching the existing palette

2. **Add shadcn components** — Install the specific components needed to replace hand-built ones:
   ```bash
   npx shadcn@latest add button dialog dropdown-menu tabs tooltip select toast sonner separator badge collapsible scroll-area
   ```
   These land in `frontend/src/components/ui/` as files you own. They may coexist with existing components temporarily.

3. **`frontend/index.html`** — Add Google Fonts `<link>` tags in `<head>` for your chosen display, body, and mono fonts. Use `display=swap` for performance. Preconnect to `fonts.googleapis.com` and `fonts.gstatic.com`.

4. **`frontend/src/index.css`** — Merge shadcn's CSS variables with the existing gradient variable. Replace the system font stack with the new body font. Add a subtle `background-color` on `body` (e.g., `#F8F9FA`) so the area behind cards isn't pure white. Keep the `--gradient-bg` CSS variable.

5. **`frontend/tailwind.config.js`** — shadcn init will modify this. Additionally extend with:
   ```
   fontFamily: {
     display: ['"Your Display Font"', 'Georgia', 'serif'],
     body: ['"Your Body Font"', 'system-ui', 'sans-serif'],
     mono: ['"Your Mono Font"', 'ui-monospace', 'monospace'],
   }
   ```
   shadcn already adds `tailwindcss-animate` which provides `animate-in`, `animate-out`, `fade-in`, `slide-in-from-top`, etc. — no need for custom keyframes.

**IMPORTANT**: shadcn init will modify `tailwind.config.js` and `index.css`. Carefully merge its changes with the existing config — do NOT lose the custom `primary`, `status-*`, and `accent-*` color definitions. Map shadcn's CSS variable-based theming to work alongside the existing color tokens.

**DO NOT** modify page-level component files in this pass. This is infrastructure only. The shadcn components in `ui/` are new files that don't affect anything yet.

**Verify**: `npm run typecheck` passes. App renders with new fonts. Gradient still shows on auth pages. Existing components still work (they haven't been touched yet).

---

### Pass 2: Core UI Components

**Goal**: Upgrade the shared primitives that appear on every page, replacing hand-built components with shadcn equivalents where appropriate.

**Strategy**: shadcn components are now installed in `components/ui/`. For each hand-built component, decide whether to:
- **(A) Replace** with the shadcn equivalent (when shadcn's version is clearly superior and the migration is clean)
- **(B) Upgrade in-place** (when the existing component has custom logic that shadcn doesn't cover, like WizardModal or DataTable)

**Files to modify (in this order):**

#### 2a. `frontend/src/components/ui/Button.tsx` — REPLACE with shadcn Button

shadcn's `<Button>` provides: `variant` (default/destructive/outline/secondary/ghost/link), `size` (default/sm/lg/icon), built-in focus rings, disabled states, and `asChild` for composition. Replace the existing 22-line Button with the shadcn version, then add a `loading` prop extension:

- Keep the existing import path working (`import { Button } from '@/components/ui/Button'` or `button` depending on shadcn's filename)
- Add a `loading?: boolean` prop — when true, show a small `<Loader2 className="animate-spin" />` from lucide and disable the button
- Map existing variant names: `primary` → shadcn `default`, `secondary` → `secondary`, `outlined` → `outline`. If existing call sites use these string literals, add a compatibility wrapper or update call sites.
- **Switch from `rounded-full` (pill) to `rounded-md`** (subtle radius). The pill shape was inherited from CUTANA Cloud but `rounded-md` is more professional and consistent with the "Scientific Clarity" direction. Use shadcn's default radius. Update all existing Button call sites if any hardcode `rounded-full` via className overrides.

#### 2b. `frontend/src/components/ui/Modal.tsx` — REPLACE with shadcn Dialog

shadcn's `<Dialog>` (built on Radix) provides: proper focus trap, keyboard dismiss (Escape), entrance/exit animations, accessible aria attributes, overlay click-to-close, and the `<X>` close icon from lucide. This solves every issue with the current Modal.

- Create a compatibility wrapper if needed so existing `<Modal isOpen={} onClose={} title="">` call sites continue working
- The shadcn Dialog uses `<DialogTrigger>`, `<DialogContent>`, `<DialogHeader>`, `<DialogTitle>`, `<DialogDescription>`, `<DialogFooter>` composition. You may need to adapt the existing Modal interface to use this pattern, OR create a thin wrapper that maps the old props to shadcn's composition.
- **Key**: The existing Modal has a primary-colored header bar (`bg-primary text-white`). shadcn Dialog doesn't have this by default. Preserve this design element by styling `<DialogHeader>` with `bg-primary text-white` and padding.

#### 2c. `frontend/src/components/ui/WizardModal.tsx` — UPGRADE in-place

WizardModal has unique step-indicator logic that shadcn doesn't provide. Keep it, but upgrade its internals:
- Replace `✕` close with lucide `X` icon
- Completed steps: show a lucide `Check` icon inside a green circle instead of the step number
- Use shadcn's animation utilities (`animate-in fade-in`) for step transitions
- If the WizardModal currently uses the hand-built Modal underneath, refactor to use the shadcn Dialog as its base layer for proper focus trap and keyboard handling

#### 2d. `frontend/src/components/ui/DataTable.tsx` — UPGRADE in-place

DataTable wraps TanStack Table with custom logic. shadcn has a Table primitive but no TanStack integration, so keep the existing component and polish it:
- Replace `▲`/`▼` text with lucide `ChevronUp`/`ChevronDown` icons. For unsorted columns, show `ChevronsUpDown` in muted gray.
- Add empty state: when `data.length === 0`, render a centered message with lucide `Inbox` icon and "No data" text (accept an `emptyMessage` prop)
- Use shadcn's `<Badge>` for status cells if appropriate
- Apply `font-mono` to numeric columns
- Use shadcn's `<ScrollArea>` for the table container if horizontal overflow is an issue

#### 2e. `frontend/src/components/layout/Card.tsx` — UPGRADE or use shadcn Card

shadcn provides a `<Card>` with `<CardHeader>`, `<CardTitle>`, `<CardDescription>`, `<CardContent>`, `<CardFooter>` composition. Decide:
- If you adopt shadcn Card, update call sites to use the composition pattern
- If you keep the existing simple Card, add `border border-gray-200` for definition and an optional `title` prop

#### 2f. `frontend/src/components/ui/StatusBadge.tsx` — UPGRADE with shadcn Badge

Use shadcn's `<Badge>` component as the rendering primitive. Add a subtle background tint matching the status color (e.g., complete → green-50 bg + green dot + green text).

#### 2g. `frontend/src/components/ui/JobErrorDetails.tsx` — UPGRADE with shadcn Collapsible

Replace the hand-built expand/collapse with shadcn `<Collapsible>` (Radix-based, animated, accessible). Replace `▸`/`▾` with lucide `ChevronRight`/`ChevronDown` with `transition-transform` rotation.

#### 2h. NEW: Toast notifications

Add shadcn `<Toaster>` (Sonner) to the app layout. This gives you a proper toast system for success/error feedback on mutations (save settings, invite member, delete experiment, etc.). Mount `<Toaster />` in the root layout alongside the existing notification system (which handles persistent notifications, not ephemeral toasts).

**CRITICAL for Pass 2**: After replacing each component, grep the codebase for all import sites and verify they still work. shadcn components may have different prop names than your hand-built ones. Create compatibility wrappers where needed rather than modifying 30+ consumer files.

**Verify**: All existing pages render correctly. Buttons, modals, tables, cards all look upgraded. Focus traps work in modals. Escape closes dialogs. `npm run typecheck` passes.

---

### Pass 3: Layout and Navigation

**Goal**: Upgrade the navbar, breadcrumbs, tab navigation, and page-level chrome.

#### 3a. `frontend/src/components/layout/Navbar.tsx` — USE shadcn DropdownMenu

Replace the hand-built user dropdown (lines 86-114) with shadcn `<DropdownMenu>`:
- Proper keyboard navigation (arrow keys, Enter/Space to select, Escape to close)
- Entrance/exit animations built-in
- Accessible `aria-*` attributes
- Replace `▼` with lucide `ChevronDown` (auto-included with DropdownMenu)
- Keep the notification bell as-is (it opens a custom panel, not a standard menu)
- Consider adding a subtle bottom border (`border-b border-gray-200`) to the navbar for the "scientific clarity" look
- The "Cleave" wordmark: make it `font-display` (the serif heading font) for brand distinction

#### 3b. `frontend/src/components/layout/Breadcrumbs.tsx`

- Replace `>` separator with lucide `ChevronRight` at 12px, `text-gray-400`
- Apply `font-body text-xs uppercase tracking-wider` for the scientific-publication feel

#### 3c. `frontend/src/components/experiments/NewAnalysisDropdown.tsx` — USE shadcn DropdownMenu

Replace the hand-built dropdown with shadcn `<DropdownMenu>`:
- Each analysis type becomes a `<DropdownMenuItem>` with a lucide icon:
  - Alignment: `AlignLeft` or `Dna`
  - Peak Calling: `Mountain` or `BarChart3`
  - DiffBind: `GitCompareArrows` or `ArrowLeftRight`
  - Custom Heatmap: `Grid3x3`
  - Pearson Correlation: `ScatterChart`
  - Roman Normalization: `Scale`
- Disabled items (no completed prerequisite) use `<DropdownMenuItem disabled>`
- Built-in animations and keyboard nav from Radix

#### 3d. `frontend/src/pages/ExperimentView.tsx` — **HIGH IMPACT** — Consider shadcn Tabs

This is the page users spend the most time on. The 11 sidebar tabs currently have NO icons — just plain text labels. The tab navigation is manually built with `<Link>` elements and conditional classes.

Consider replacing with shadcn `<Tabs>` for proper keyboard navigation (arrow keys between tabs), ARIA attributes, and consistent active state styling. Note: the current tabs use React Router `<Link>` for URL-based routing, so you may need a hybrid approach — shadcn Tabs for visual presentation with React Router for navigation. Evaluate whether this is worth the complexity or if simply adding icons + improving the manual styling is sufficient.

Either way, add small lucide icons (16px) next to each tab label:

| Tab | Suggested Icon |
|-----|---------------|
| Description | `FileText` |
| FASTQs | `Dna` or `FileCode` |
| Reactions | `FlaskConical` or `TestTubes` |
| Alignment | `AlignLeft` or `GitBranch` |
| Peak Calling | `Mountain` or `TrendingUp` |
| DiffBind | `ArrowLeftRight` or `GitCompareArrows` |
| Heatmaps | `Grid3x3` or `LayoutGrid` |
| Correlation | `ScatterChart` |
| Normalization | `Scale` or `Ruler` |
| History | `History` or `Clock` |
| All Files | `FolderTree` or `Files` |

This single change dramatically improves scannability. Users can find tabs by icon shape instead of reading every label.

**Verify**: Navigation between all tabs works. Dropdown menus open/close correctly. Breadcrumbs render on all pages.

---

### Pass 4: Page-Level Polish

#### 4a. `frontend/src/pages/HomePage.tsx`

- Fix the "Not yet implemented" filter sidebar: either remove it entirely, or replace the text with a visually-muted placeholder showing dimmed filter controls with a subtle "Coming soon" label and lucide `Clock` icon
- Add `font-display` to the "Projects" heading
- Project cards: add a subtle hover lift (`hover:-translate-y-0.5 hover:shadow-md transition-all duration-150`) for tactile feedback
- If there are no projects, show an empty state with a lucide `FolderPlus` icon and "Create your first project" message

#### 4b. `frontend/src/pages/LoginPage.tsx` (and Register/ForgotPassword/ResetPassword)

- Add the "Cleave" wordmark in `font-display` above the card as a branding element (larger, maybe with a subtle subtitle like "CUT&RUN Analysis Platform" in small text)
- The card itself could benefit from a subtle `border border-white/50` for definition against the gradient

#### 4c. `frontend/src/pages/ProjectDetailPage.tsx`

- Apply `font-display` to the project name heading
- Member avatar circles: add a subtle ring/border (`ring-2 ring-white`) and a tiny shadow for depth
- "Manage Members" and "Manage" links: consider using lucide `UserPlus` and `Settings` icons inline

#### 4d. `frontend/src/pages/AnalysisQueuePage.tsx`

- Replace pagination HTML entities (`&lsaquo;` `&rsaquo;` `&laquo;` `&raquo;`) with lucide `ChevronLeft`/`ChevronRight`/`ChevronsLeft`/`ChevronsRight` icons
- Apply `font-display` to page heading

#### 4e. `frontend/src/pages/SettingsPage.tsx`

- Apply `font-display` to the "Settings" heading
- Add subtle section dividers between form groups

**Verify**: All pages render with updated typography and polish. Project creation workflow still works. Login flow still works.

---

### Pass 5: Feature Components

Systematic icon replacement and polish across feature domains.

#### 5a. FASTQ Components

- `components/fastqs/FileUploadZone.tsx` — Replace `✕` cancel button with lucide `X`. Add lucide `Upload` or `CloudUpload` icon to the drag-and-drop zone placeholder. File sizes should use `font-mono`.
- `components/fastqs/FastqcReportModal.tsx` — Uses Modal (inherits close button fix from Pass 2)
- `components/fastqs/TrimConfigModal.tsx` — Uses Modal (inherits fix)

#### 5b. Alignment Components

- `components/alignment/AlignmentQCReportPanel.tsx` — Replace `▲`/`▼` info toggle with shadcn `<Collapsible>` wrapping the info panel. Apply `font-mono` to all numeric metrics (read counts, alignment rates, percentages). Download buttons: add lucide `Download` icon. Consider using shadcn `<Tooltip>` for column header explanations instead of the info toggle panel.
- `components/alignment/AlignmentFilesPanel.tsx` — Apply `font-mono` to file sizes. Add lucide `Download` icon to download buttons. File category descriptions could use shadcn `<Tooltip>` on hover.
- `components/alignment/AlignmentInfoPanel.tsx` — The methods text "Copy" button could use a lucide `Copy` icon. Apply `font-mono` to the methods text block.

#### 5c. Peak Calling Components

- `components/peak-calling/PeakAnnotationChart.tsx` — The Recharts chart is functional. Add lucide `Download` icon to PNG/CSV download buttons. Style the tooltip with a subtle shadow and border instead of Recharts default.
- `components/peak-calling/PeakCallingQCReportPanel.tsx` — Apply `font-mono` to FRiP scores and peak counts. Download buttons get lucide `Download` icon.
- `components/peak-calling/PeakCallingSettingsStep.tsx` — Replace any `▼` with lucide `ChevronDown`

#### 5d. IGV Components

- `components/igv/IGVPanel.tsx` — Replace `&#8635;` refresh with lucide `RefreshCw`. Replace "Full Screen" text button with lucide `Maximize2`. Replace reaction count badge styling for consistency with StatusBadge approach.

#### 5e. Reactions Components

- `components/reactions/ReactionFormModal.tsx` — Replace `▼`/`▲` section expand with lucide `ChevronDown`/`ChevronUp`. Apply `font-mono` to FASTQ prefix values.

#### 5f. All Files Tab

- `pages/experiment/AllFilesTab.tsx` — Replace `▼`/`▶` folder icons with lucide `ChevronDown`/`ChevronRight`. Replace `📁` (if present) with lucide `Folder`/`FolderOpen`. Apply `font-mono` to filenames and file sizes.

#### 5g. All Other Feature Domains (DiffBind, Heatmaps, Correlation, Normalization)

- Apply the same patterns: lucide icons for download buttons (`Download`), copy buttons (`Copy`/`ClipboardCopy`), expand/collapse (`ChevronDown`/`ChevronUp`)
- Apply `font-mono` to all data values, filenames, and scientific metrics
- Apply `font-display` to section/panel headings

**Verify**: Every experiment tab renders correctly. QC reports display data. Charts render. IGV loads. File browser works. All wizards complete successfully.

---

### Pass 6: Motion and Micro-Interactions

**Goal**: Add subtle motion that makes the app feel responsive and alive, without interfering with data-dense workflows.

#### 6a. Dropdown Animations

Every dropdown in the app (Navbar user menu, notification panel, NewAnalysisDropdown, job selector dropdowns) should use `animate-slide-down` for entrance. This was set up in Tailwind config during Pass 1.

#### 6b. Modal Animations

Modal and WizardModal should use `animate-fade-in` on the backdrop and `animate-slide-up` on the content panel. This was addressed in Pass 2 but verify it feels smooth.

#### 6c. Interactive Element Transitions

Add `transition-all duration-150` to any interactive elements that currently snap between states:
- Tab active/inactive transitions in ExperimentView
- Card hover state on HomePage
- Button hover color changes (already has `transition-colors` but `transition-all` covers transform too)

#### 6d. Loading Pattern Refinement

Create a small `Spinner` component in `components/ui/Spinner.tsx` that wraps the repeated pattern:
```tsx
import { Loader2 } from 'lucide-react';

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-10 w-10' };
  return <Loader2 className={`${sizes[size]} animate-spin text-primary`} />;
}
```
Replace the ~15 inline spinner instances (`border-4 border-primary border-t-transparent`) with `<Spinner />`.

#### 6e. Toast Feedback for Mutations

With Sonner/Toast from shadcn (added in Pass 2h), add toast feedback to key mutations that currently have no success confirmation:
- "Project created" / "Experiment created" / "Member invited" / "Settings saved"
- "Job queued" (alignment, peak calling, DiffBind, etc.)
- Error toasts for failed mutations (currently shown inline — keep inline errors for form validation, add toasts for server errors)

This is done by calling `toast.success("...")` or `toast.error("...")` in the mutation `onSuccess`/`onError` callbacks in page components. **DO NOT modify the hooks themselves** — add the toast calls at the page/component level where mutations are triggered.

**Verify**: Animations feel snappy (150-200ms), not sluggish. No janky transitions. No layout shifts during animation. Toasts appear and auto-dismiss.

---

### Pass 7: Dark Mode

**Goal**: Add dark mode support using shadcn's CSS variable theming.

shadcn/ui components already support dark mode via CSS variables. The main work is:

#### 7a. Theme Infrastructure

- Define dark-mode CSS variable values in `index.css` under a `.dark` class (shadcn init may have scaffolded this already)
- Map colors: dark backgrounds (`--background: 222.2 84% 4.9%`), dark cards (`--card: 222.2 84% 9%`), light text (`--foreground: 210 40% 98%`), etc.
- The existing `primary` (#4AAED9) works well in both light and dark — it's a mid-tone cyan
- Status colors are bright enough to work on dark backgrounds without change

#### 7b. Theme Toggle

- Add a theme toggle button in the Navbar (lucide `Sun`/`Moon` icons)
- Persist preference to `localStorage`
- Apply `.dark` class to `<html>` element
- On first visit, respect `prefers-color-scheme` system setting

#### 7c. Gradient Background in Dark Mode

The sky-blue-to-gold gradient is a light-mode brand element. In dark mode:
- Replace with a subtle dark gradient (e.g., deep navy → dark teal → charcoal) or a solid dark background
- The gradient should feel like "same brand, different time of day" — not a completely different app
- Auth pages (login, register) should still feel visually branded in dark mode

#### 7d. Component-Level Dark Mode

shadcn components handle dark mode automatically via CSS variables. For the remaining hand-built components and page-level styling:
- Replace any hardcoded `bg-white` with `bg-background` (shadcn token) or `bg-white dark:bg-gray-900`
- Replace hardcoded `text-gray-700` with `text-foreground` or `text-gray-700 dark:text-gray-200`
- Replace hardcoded `border-gray-200` with `border-border` (shadcn token) or `border-gray-200 dark:border-gray-700`
- QC report tables, charts (Recharts), and IGV.js may need special attention — verify they render legibly in dark mode

#### 7e. Dark Mode Testing

- Verify every page in both light and dark modes
- Check color contrast of status badges, FRiP color coding, spike-in heatmap colors against dark backgrounds
- Ensure the Recharts tooltip and PeakAnnotationChart are legible in dark mode
- IGV.js has its own dark theme support — investigate `igv.createBrowser({ ... })` options

**Verify**: Toggle between light and dark mode on every page. No unreadable text, no invisible borders, no broken layouts. Preference persists across page refreshes.

---

## COMMON BEFORE/AFTER PATTERNS

### Pattern 1: Unicode Close → Icon
```tsx
// BEFORE (Modal.tsx, WizardModal.tsx, FastqcReportModal.tsx, FileUploadZone.tsx)
<button onClick={onClose} className="text-white hover:text-gray-200">✕</button>

// AFTER
import { X } from 'lucide-react';
<button onClick={onClose} className="text-white hover:text-gray-200" aria-label="Close">
  <X className="h-4 w-4" />
</button>
```

### Pattern 2: Unicode Sort → Icon
```tsx
// BEFORE (DataTable.tsx)
{{ asc: ' ▲', desc: ' ▼' }[header.column.getIsSorted() as string] ?? ''}

// AFTER
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
{header.column.getIsSorted() === 'asc' ? (
  <ChevronUp className="ml-1 inline h-3.5 w-3.5" />
) : header.column.getIsSorted() === 'desc' ? (
  <ChevronDown className="ml-1 inline h-3.5 w-3.5" />
) : (
  <ChevronsUpDown className="ml-1 inline h-3.5 w-3.5 text-gray-300" />
)}
```

### Pattern 3: Unicode Dropdown Arrow → Icon
```tsx
// BEFORE (Navbar.tsx line 91)
{user.firstName ?? user.email} ▼

// AFTER
import { ChevronDown } from 'lucide-react';
{user.firstName ?? user.email} <ChevronDown className="ml-1 inline h-3.5 w-3.5" />
```

### Pattern 4: Breadcrumb Separator → Icon
```tsx
// BEFORE (Breadcrumbs.tsx)
<span className="text-white/50"> &gt; </span>

// AFTER
import { ChevronRight } from 'lucide-react';
<ChevronRight className="mx-1 h-3 w-3 text-white/50" />
```

### Pattern 5: Monospace for Data Values
```tsx
// BEFORE
<td className="px-4 py-3 text-sm">{formatNumber(row.totalReads)}</td>

// AFTER
<td className="px-4 py-3 text-sm font-mono">{formatNumber(row.totalReads)}</td>
```

### Pattern 6: Heading with Display Font
```tsx
// BEFORE
<h1 className="text-2xl font-bold">{project.name}</h1>

// AFTER
<h1 className="font-display text-2xl font-bold">{project.name}</h1>
```

### Pattern 7: Button with Loading State
```tsx
// BEFORE (scattered across forms)
<Button disabled={isLoading}>{isLoading ? 'Saving...' : 'Save'}</Button>

// AFTER (using upgraded Button)
<Button loading={isLoading}>Save</Button>
```

---

## FONT LOADING REFERENCE

Google Fonts link tag for `index.html`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@400;500&family=Source+Sans+3:wght@400;500;600&family=Source+Serif+4:wght@600;700&display=swap" rel="stylesheet">
```

Tailwind config:
```js
fontFamily: {
  display: ['"Source Serif 4"', 'Georgia', 'serif'],
  body: ['"Source Sans 3"', 'system-ui', 'sans-serif'],
  mono: ['"Source Code Pro"', 'ui-monospace', 'monospace'],
}
```

Set `font-body` as the default on `<body>` in `index.css`.

---

## VERIFICATION CHECKLIST

After completing all passes, verify the following works identically to before:

### Workflows
- [ ] Register a new user account
- [ ] Login / logout / page refresh (session persists)
- [ ] Create a project
- [ ] Invite a member to a project
- [ ] Create an experiment (3-step wizard completes)
- [ ] Upload FASTQs (drag-and-drop, progress bar, completion)
- [ ] View a FastQC report (modal opens, report renders)
- [ ] Define reactions (manual entry and CSV import)
- [ ] Launch an alignment job (3-step wizard, job queues)
- [ ] Launch a peak calling job (4-step wizard)
- [ ] Launch a DiffBind job (4-step wizard with condition assignment)
- [ ] Launch a custom heatmap job
- [ ] Launch a Pearson correlation job
- [ ] Launch a Roman normalization job
- [ ] View alignment QC report (metrics table, heatmap images, spike-in data)
- [ ] View peak calling QC report (FRiP table, annotation chart, top peaks)
- [ ] View DiffBind results (dynamic columns, plots)
- [ ] Browse IGV (select reactions, tracks load, navigation works)
- [ ] Browse All Files tab (tree expands, files listed)
- [ ] Download files (single and batch)
- [ ] View Analysis Queue (filters, search, pagination)
- [ ] View/dismiss notifications
- [ ] Update settings

### Technical
- [ ] `npm run typecheck` — zero errors
- [ ] `npm run lint` — zero errors (or only pre-existing warnings)
- [ ] `npm run build` — successful production build
- [ ] Browser console — no new errors on any page
- [ ] Backend tests unaffected — `docker compose exec api pytest tests/` still passes (should be obvious since no backend files changed, but verify)

---

## IMPLEMENTATION NOTES

- **Work in passes, not pages.** Pass 1 (foundation) must be complete before starting Pass 2 (components). Pass 2 must be complete before Pass 3, etc. Each pass produces a verifiable increment.
- **Use Explore agents first.** Before modifying a component, read the file and its parent page to understand the context. Many components are deeply nested (e.g., `AlignmentQCReportPanel` is rendered inside `AlignmentTab` which is rendered inside `ExperimentView`). Understanding the nesting prevents unintended visual side effects.
- **Test incrementally.** After modifying each UI component in Pass 2, check in the browser that all pages using that component still look correct. Don't batch 10 changes and then debug.
- **Preserve information density.** The temptation will be to "clean up" data-dense panels by adding padding or reducing content. Resist this. Scientists need to see all the data.
- **The gradient is a brand element.** Do not remove it. You may refine the color stops but the sky-blue-to-warm-gold progression should remain recognizable.
- **Accessibility comes free with shadcn.** shadcn components (Dialog, DropdownMenu, Tabs, Collapsible, etc.) are built on Radix primitives which handle focus traps, keyboard navigation, ARIA attributes, and screen reader announcements automatically. This is one of the biggest wins of adopting shadcn — you get proper accessibility without manual work.
- **shadcn + existing component coexistence.** During migration, both the old hand-built component and new shadcn component may exist in `components/ui/`. The shadcn files use lowercase filenames (`button.tsx`, `dialog.tsx`) while existing ones use PascalCase (`Button.tsx`, `Modal.tsx`). Update imports at call sites gradually. Remove the old component file only after all consumers have been migrated.
- **shadcn theming.** shadcn uses CSS custom properties for theming (e.g., `--primary`, `--accent`, `--destructive`). Map these to the existing Cleave color values in `index.css` so shadcn components match the existing look. The primary color should be `#4AAED9`, destructive should map to the error color `#B71C1C`, etc.
