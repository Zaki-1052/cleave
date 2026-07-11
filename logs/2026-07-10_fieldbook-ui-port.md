# 2026-07-10 — Fieldbook UI Port (crud-app → frontend)

Ported Fable's "Fieldbook" design language from the sanitized `crud-app/` clone back into
Cleave's real `frontend/` (per `opus-port-design-prompt.md`). Frontend-only, design-only re-skin;
100% of biology content, routes, API/type contracts, and branding preserved.

## What was done
- **Foundation** (lead, sequential): `index.html` fonts (Fraunces/Hanken Grotesk/IBM Plex Mono);
  `src/index.css` full Fieldbook token sheet (warm paper + viridian, `success/warning/info`,
  `status-*`, `ember`, `overlay`, `chart-1..6`, motion vars, `.bg-grain`/`.terminal-block`);
  `tailwind.config.js` (var-driven colors, 15px ~1.2 type scale, `fade-rise`); `constants.ts`
  STATUS_COLORS; new `lib/chart-theme.ts`; `main.tsx` `defaultTheme="system"`.
- **UI primitives** (`components/ui/`): 6 new (`Skeleton, ConfirmDialog, Pagination, PageHeader,
  Field, ChartTooltip`); redesigned (`button-variants` flat + `outlined` alias, `Modal`/`WizardModal`
  outside-click guard, `DataTable` pagination fix + additive props, `StatusBadge`); token retints
  of the rest. `JobActions` window.confirm → ConfirmDialog.
- **Layout shell**: `Card`, `GradientBackground`→flat paper Surface (name kept), new `ContourField`
  + `AuthLayout`, `Navbar` (unified nav + responsive), `NotificationPanel` (Radix Popover, no-props),
  `ErrorBoundary`, `App.tsx` (PageHeader auto-breadcrumb + outer ErrorBoundary + fade-rise; all routes
  verbatim). Deleted `Breadcrumbs.tsx` + `PlaceholderTab.tsx`.
- **Exemplar**: `HomePage.tsx` rebuilt as north-star.
- **Fan-out** (Workflow, 24 disjoint packets, general-purpose agents): every feature screen restyled
  by deriving the design from the crud-app within-repo diff (`f42f905f`→`d9af08d1`) and applying it in
  Cleave vocabulary. 24/24 done, 0 errors. 10-category peak-annotation chart → `extendChartPalette`;
  all chart hex → `chart-theme` hooks; all `window.confirm` → ConfirmDialog.
- **Identity surfaces** (lead): 4 auth pages via `AuthLayout`; 8 docs files token/typography retint
  (`docs-content`/`docs-navigation` untouched); `index.html` meta/OG (Cleave wording); `CleaveIcon`
  kept; `LandingPage` **hybrid** — type system swapped, bespoke content + animations + aesthetic kept.
- **Sweep**: retinted overlooked `ChooseBigWigSourceStep.tsx`; deleted legacy `primary.dark`/
  `accent.teal`/`accent.gold` shims (0 usages).

## Decisions
- LandingPage = **hybrid** (user choice): kept off-system by design → **exempt from audit greps**.
- Checkpoint after foundation before fan-out (user reviewed).
- `outlined` button variant kept as alias (zero call-site churn). `GradientBackground` export name kept.
- `ChooseBigWigSourceStep`/`useBigWigOutputs` left in `ui/` (not moved to `shared/`).

## Verification (all green)
- `npx tsc -p tsconfig.app.json --noEmit` → clean · `npm run lint` → clean · `npm run build` → ✓
- Audit greps (excl LandingPage/CleaveIcon): raw-palette 0, hex/rgb 0, gradients/hover-scale 0,
  legacy shims 0, real `window.confirm` 0.

## Open items / notes
- LandingPage retains gradients/inline-hex by design (hybrid); the `duration-[900ms]` Tailwind
  ambiguity warning originates there and is benign.
- Chunk-size (igv/main bundle) warning is pre-existing, unrelated.
- Visual review by user pending (both themes).

## Key paths
`frontend/{index.html,tailwind.config.js}`, `frontend/src/{index.css,App.tsx,main.tsx}`,
`frontend/src/lib/{chart-theme.ts,constants.ts}`, `frontend/src/components/ui/*` (6 new + retints),
`frontend/src/components/layout/*` (AuthLayout, ContourField new), `frontend/src/pages/*` +
`pages/experiment/*` + `components/<feature>/*` (~90 files, fan-out), `frontend/src/components/docs/*`.
