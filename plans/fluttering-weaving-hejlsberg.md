# Plan: Add Documentation Section to Cleave Website

## Context

Cleave has comprehensive documentation in `docs/cleave-user-guide.md` (46KB, 1059 lines) but no way for users to access it from the web UI. CUTANA Cloud had a help link (question mark icon) in the navbar that opened a docs section. We need to add the same — a public, browsable documentation section with sidebar navigation, organized into logical pages derived from the user guide content.

## Architecture

### Approach: Hardcoded TSX content + shared renderer components

- **No markdown parser dependency** — content is stored as structured TypeScript data objects in a single `docs-content.ts` file
- **Shared renderer components** (`DocSection`, `DocTable`, `DocCallout`, etc.) render content blocks consistently
- **Single generic `DocsPage.tsx`** reads `:slug` from URL params, looks up content, renders it
- **Public routes** — no auth required (same as LandingPage)
- **Dedicated `DocsLayout`** — reuses `GradientBackground` but has its own simplified navbar (no auth dependency) + sidebar

### Route Structure

```
/docs                        → DocsLandingPage (overview cards grid)
/docs/:slug                  → DocsPage (generic, content looked up by slug)
```

Slugs:
- `getting-started` — Platform overview, what Cleave does, Cleave vs CUTANA Cloud comparison
- `data-hierarchy` — Project → Experiment → FASTQs/Reactions/Jobs hierarchy
- `projects` — Creating projects, member roles, managing members
- `experiments` — Creating experiments, status, tabs overview
- `fastqs` — Sequencing requirements, naming, upload methods, FastQC
- `reactions` — Required/optional fields, creation methods, CSV import
- `reference-genomes` — Organisms, builds, feature support matrix
- `pipeline-trimming` — Trimmomatic + kseq, parameters, outputs
- `pipeline-alignment` — 13-step pipeline, settings, outputs
- `pipeline-peaks` — 5 peak caller modes, fragment filter, IgG, HOMER, FRiP
- `pipeline-igv` — IGV.js genome browser usage
- `lab-extensions` — DiffBind, Custom Heatmaps, Pearson Correlation, Roman Normalization (single page, 4 sections)
- `auto-pipeline` — One-click pipeline chain, status tracking
- `qc-guide` — Alignment QC interpretation, Peak Calling QC, spike-in QC, heatmap interpretation
- `tutorials` — All 7 step-by-step tutorials (collapsible sections)
- `faq` — Troubleshooting (upload/alignment/peaks/general), security, account settings, dark mode
- `glossary` — Key terminology table + software versions

Total: 17 pages (manageable for ~8-10 users, no search needed).

## File Structure

```
frontend/src/
├── lib/
│   ├── docs-content.ts              # All page content as structured TS objects
│   └── docs-navigation.ts           # Sidebar nav groups + items + slugs + icons
├── components/
│   └── docs/
│       ├── DocsLayout.tsx            # GradientBackground + DocsNavbar + Sidebar + <Outlet />
│       ├── DocsNavbar.tsx            # Simplified navbar (logo, "Documentation", theme toggle, dashboard link)
│       ├── DocsSidebar.tsx           # Desktop sidebar (w-56, sticky, collapsible groups)
│       ├── DocsPageRenderer.tsx      # Iterates content blocks → renders sub-components
│       ├── DocSection.tsx            # Section heading + children
│       ├── DocTable.tsx              # Static table from header/row arrays
│       ├── DocCallout.tsx            # Tip/Warning/Note callout box
│       ├── DocStepList.tsx           # Numbered step-by-step instructions
│       ├── DocCodeBlock.tsx          # Styled command/code display
│       └── DocPrevNext.tsx           # Previous/Next page navigation footer
└── pages/
    └── docs/
        ├── DocsLandingPage.tsx       # Card grid with section links + brief overview
        └── DocsPage.tsx              # Generic page: useParams().slug → content lookup → renderer
```

## Critical Files to Modify

| File | Change |
|------|--------|
| `frontend/src/App.tsx` | Add `/docs` route group (4 lines) |
| `frontend/src/components/layout/Navbar.tsx` | Add `BookOpen` icon link to `/docs` between notifications and theme toggle |
| `frontend/src/pages/LandingPage.tsx` | Add "Docs" link to the landing page fixed navbar |

## Component Details

### `docs-navigation.ts`
```typescript
type DocsNavItem = { slug: string; label: string; icon: LucideIcon };
type DocsNavGroup = { group: string; items: DocsNavItem[] };
```

Groups:
- **Getting Started**: Overview, Data Hierarchy
- **Core Workflow**: Projects, Experiments, FASTQs, Reactions, Reference Genomes
- **Pipeline**: Trimming, Alignment, Peak Calling, IGV, Auto-Pipeline
- **Lab Extensions**: DiffBind, Heatmaps, Correlation, Normalization (→ single page)
- **Reference**: QC Guide, Tutorials, FAQ, Glossary

### `docs-content.ts`
```typescript
type ContentBlock =
  | { type: 'heading'; level: 2 | 3 | 4; text: string; id: string }
  | { type: 'paragraph'; text: string }         // inline HTML for bold/links
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'steps'; items: { title: string; description: string }[] }
  | { type: 'callout'; variant: 'tip' | 'warning' | 'note'; text: string }
  | { type: 'code'; language: string; content: string }
  | { type: 'separator' };

type DocsPageData = { title: string; description: string; blocks: ContentBlock[] };

export const DOCS_CONTENT: Record<string, DocsPageData> = { ... };
```

Content migrated section-by-section from `docs/cleave-user-guide.md`.

### `DocsLayout.tsx`
```
<GradientBackground>
  <DocsNavbar />
  <div className="mx-auto max-w-7xl px-4 py-6 flex gap-6">
    <DocsSidebar />           <!-- desktop: w-56 sticky top-20, mobile: sheet overlay -->
    <main className="flex-1 min-w-0">
      <Outlet />
    </main>
  </div>
</GradientBackground>
```

### `DocsNavbar.tsx`
Simplified version of `Navbar.tsx` without auth dependencies:
- Cleave logo (link to `/`)
- "Documentation" label
- `ThemeToggle` (already works without auth)
- "Launch Dashboard" link (to `/dashboard`)
- Mobile: hamburger button to open sidebar as sheet overlay

### `DocsSidebar.tsx`
Mirrors the ExperimentView sidebar pattern exactly:
- `Card` with `p-0`
- `Link` elements with `border-l-2 border-primary bg-primary/5` active state
- Groups use existing `Collapsible` component (already installed)
- Wrapped in `ScrollArea` (already installed)
- Active state determined by matching `useLocation().pathname` against `/docs/${slug}`
- On mobile: rendered inside a Sheet (from shadcn) triggered by hamburger in DocsNavbar

### `DocsLandingPage.tsx`
Grid of interactive `Card` components grouped by navigation group. Each card shows:
- Icon + title
- Brief description (from `DocsPageData.description`)
- Link to `/docs/${slug}`

### `DocsPage.tsx`
```typescript
const { slug } = useParams();
const content = DOCS_CONTENT[slug];
if (!content) return <NotFound />;
return <DocsPageRenderer data={content} />;
```

Plus `DocPrevNext` footer using `docs-navigation.ts` for sequential navigation.

### FAQ Page
Built from the user guide's Troubleshooting section (already in Problem/Solution table format) plus derived Q&As from:
- QC interpretation ("What's a normal IgG alignment rate?" → ~29%)
- Security features
- Account/settings questions
- Dark mode usage

Each category rendered as a collapsible section using existing `Collapsible` component.

### Navbar.tsx Change
Add between the notification bell `<div>` and `<ThemeToggle />`:
```tsx
<Link to="/docs" className="rounded-md p-2 text-foreground/60 transition-colors hover:text-primary" aria-label="Documentation">
  <BookOpen className="h-5 w-5" />
</Link>
```

### LandingPage.tsx Change
Add a "Docs" entry to the fixed navbar's anchor links (around line 430, alongside Pipeline/Features/Compare/Architecture).

## Implementation Order

### Phase 1: Skeleton (layout + routing)
1. Create `docs-navigation.ts` with full nav structure
2. Create `DocsNavbar.tsx`
3. Create `DocsSidebar.tsx` (desktop + mobile sheet)
4. Create `DocsLayout.tsx`
5. Create placeholder `DocsLandingPage.tsx` and `DocsPage.tsx`
6. Add routes to `App.tsx`
7. Add BookOpen icon link to `Navbar.tsx`
8. Add "Docs" link to `LandingPage.tsx` navbar

### Phase 2: Content renderer components
1. Create `DocSection.tsx`, `DocTable.tsx`, `DocCallout.tsx`, `DocStepList.tsx`, `DocCodeBlock.tsx`
2. Create `DocsPageRenderer.tsx` (dispatches to sub-components by block type)
3. Create `DocPrevNext.tsx` (prev/next page links)

### Phase 3: Content migration (largest phase)
1. Create `docs-content.ts` and populate all 17 pages from `cleave-user-guide.md`
2. Start with small pages (data-hierarchy, reference-genomes, auto-pipeline) to validate renderer
3. Migrate medium pages (projects, experiments, reactions, fastqs, pipeline-igv)
4. Migrate large pages (pipeline-alignment, pipeline-peaks, lab-extensions, qc-guide)
5. Build tutorials page (7 tutorials with collapsible sections)
6. Build FAQ page (troubleshooting + derived Q&As)
7. Build glossary page

### Phase 4: Polish
1. DocsLandingPage card grid with descriptions and icons
2. Responsive testing (mobile sidebar sheet)
3. Dark mode verification across all content components
4. In-page anchor links for long pages (heading `id` attributes)

## No New Dependencies

Everything built with existing installed components:
- shadcn/ui: `Collapsible`, `ScrollArea`, `Separator`, `Badge`, `Card`
- lucide-react: `BookOpen`, `ChevronRight`, `ExternalLink`, etc.
- Tailwind CSS: all styling
- React Router: `useParams`, `Link`, `Outlet`

## Verification

1. Navigate to `/docs` — should show landing page with card grid
2. Click through each of the 17 pages — content renders correctly
3. Sidebar highlights active page, prev/next navigation works
4. Mobile: hamburger opens sidebar as overlay sheet
5. Dark mode: toggle theme, verify all docs pages render correctly
6. Navbar: BookOpen icon visible on authenticated pages, links to `/docs`
7. LandingPage: "Docs" link visible in fixed navbar
8. `npm run build` — no TypeScript errors
9. `npx tsc --noEmit` — type checking passes
