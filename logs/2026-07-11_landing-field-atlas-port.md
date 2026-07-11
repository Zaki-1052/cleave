# 2026-07-11 — Landing page: port Fable's "Field Atlas" design into Cleave

## What was done

Back-ported Fable's redesigned landing page ("Field Atlas", built on the sanitized
`crud-app` twin) into Cleave's real `frontend/`, keeping 100% of Cleave's biology content,
branding, routes, and license. The Fieldbook design foundation was already present in Cleave
(committed "frontend port"); the landing page was the one surface still on the old CUTANA
rainbow design. Scoped by diffing crud-app commit `4c5a4548` ("landing page") against parent
`b3a06eeb` — both in Forge vocab, so the diff is pure design.

**Part A — foundation additions (additive, landing-scoped):**
- `frontend/tailwind.config.js`: added `hero-rise` / `particle-float` / `cursor-blink`
  keyframes + animations and `transitionTimingFunction.standard/emphasized` (verbatim from
  crud-app; `Reveal`/ledger rows need `ease-emphasized`, previously absent).
- `frontend/src/index.css`: added the `.hover-tint` utility (licensed decorative gradient via
  `--tint-hue`) and the `@media (prefers-reduced-motion)` backstop for the three landing keyframes.

**Part B — landing kit (new `frontend/src/components/landing/`):**
- Copied 21 files from crud-app (`cp`, then edits): 10 components + `theme.ts` + `particles.ts`
  + 9 hooks. 18 copied verbatim (pure design/motion, props-driven).
- Content edits (3): `HeroWordmark.tsx` (wordmark → **Cleave**, eyebrow → "…CUT&RUN / CUT&Tag
  workbench · est. 0001", tagline → "Where raw **reads** become evidence."), `HeroRunCards.tsx`
  (specimens → Alignment / Peak Calling, "entries" → "reactions"), `ArchitectureDiagram.tsx`
  (`/data/forge` → `/data/cleave` + aria-label). No `ForgeIcon` imports inside the kit.

**Part C — `frontend/src/pages/LandingPage.tsx` rewrite:**
- Replaced the old inline-`C`-palette page wholesale with the Field Atlas structure, injecting
  Cleave's real content: 6-stage pipeline spine (FASTQ→…→Visualization), 6 capability cards
  (lucide icons: Mountain/ScatterChart/Dna/Grid3x3/Scale/FileText), 20-row CUTANA-vs-Cleave
  ledger, real 4-layer stack colophon, `/data/cleave/` flow. Branding: `CleaveIcon`,
  `GITHUB_URL` → cleave repo, footer "© Cleave · Ferguson Lab, UCSD" (**not MIT** — Cleave is
  private), Zakir/LinkedIn kept.

## Decisions
- Landing-only tailwind/index.css additions are safe: additive, no existing token changed, so
  no other Cleave screen is affected.
- Foundation components imported unchanged (`GradientBackground`, `ContourField`, `Card`
  variant="interactive", `StatusBadge`, `buttonVariants`, `ThemeToggle`, `cn`) — all already
  Fieldbook-native in Cleave.
- Ledger footnote count-up hardcoded 20 / 10 to match Cleave's STATS ("10 New vs CUTANA Cloud")
  and the prior landing copy; the 20 comparison rows are reproduced verbatim from Cleave's data.

## Verification (all green)
- `npx tsc -p tsconfig.app.json --noEmit` (root tsconfig is solution-style) → OK
- `npm run lint` → clean · `npm run build` → `✓ built` (igv chunk-size note pre-existing)
- Audit greps: no raw hex, no `chart-${}` templates, no Forge/MIT in touched files
- Compiled-CSS purge check: hero-rise/particle-float/cursor-blink/hover-tint/ease-emphasized +
  chart-hue literal classes + reduced-motion media query all present
- Visual review (both themes) left to user via `cd frontend && npm run dev`

## Key files
- `frontend/tailwind.config.js`, `frontend/src/index.css`
- `frontend/src/components/landing/**` (new, 21 files)
- `frontend/src/pages/LandingPage.tsx` (rewritten)
