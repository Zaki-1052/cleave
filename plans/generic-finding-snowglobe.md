# Plan: Create Comprehensive UI Improvement Skill Prompt for Cleave

## Context

Cleave is a bioinformatics web platform (Phases 1-6 complete, 373 tests, ~72 frontend components) that currently has a **functional but visually unpolished** UI. The user wants a comprehensive prompt/skill that can guide a systematic UI improvement pass. The prompt is the deliverable — not code changes.

## What Was Done

### Research Phase
- Launched 3 Explore agents in parallel to inventory:
  1. All 72 components, styling patterns, typography, icon usage, animations, design shortcuts
  2. Visual quality deep-dive on every major component (Navbar, DataTable, Modal, QC reports, IGV, notifications, auth pages)
  3. Configuration foundation (tailwind.config, index.css, constants, types, package.json, App.tsx routing)
- Examined 5 screenshots of the current UI (login, home, project detail, experiment description, FASTQs tab)
- Read Phase 1-6 summaries to understand what exists
- Read all referenced design docs (frontend.md, ui-prompt.md, design.md, cutana-cloud-ui.md)

### Design Phase
- Launched Plan agent to architect the prompt structure and design direction
- Chose "Scientific Clarity" direction — serif headings evoking academic publishing, clean sans-serif body, monospace for data values, border-over-shadow philosophy, information density preserved
- Prioritized improvements by impact/risk ratio
- Structured into 6 sequential passes: Foundation → Components → Layout → Pages → Features → Motion

### Deliverable
Written to: **`.claude/skills/ui-improvement/SKILL.md`** (~500 lines)

The skill prompt includes:
1. **14 absolute constraints** — backend untouchable, no component libraries, no animation libraries, functionality preservation, typecheck verification
2. **Design direction** — "Scientific Clarity" with specific font pairing recommendations (3 curated options), color refinement guidance, data presentation rules, density philosophy
3. **Complete codebase index** — every UI component with line counts, current issues, and file paths
4. **6 implementation passes** with exact files to modify and what to change in each
5. **7 before/after code patterns** for the most common improvements (Unicode→icon, sort indicators, dropdown arrows, breadcrumbs, monospace data, display fonts, loading states)
6. **3 font pairing recommendations** — "The Researcher" (Source family), "The Journal" (Literata + DM Sans), "The Observatory" (IBM Plex + Newsreader)
7. **Comprehensive verification checklist** — 22 workflow verifications + 5 technical checks

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Component library | shadcn/ui (copy-paste, Radix-based) | User approved. Solves Dropdown, Dialog (focus trap), Tabs (keyboard nav), Toast, Tooltip, Collapsible. Components are owned code, not library imports. |
| Icon library | `lucide-react` (bundled with shadcn) | Lightweight, tree-shakeable, MIT, consistent 24px stroke |
| Font approach | Google Fonts `<link>` | Simplest, no build tool changes, `display=swap` for performance |
| Animation approach | `tailwindcss-animate` (bundled with shadcn) | Provides `animate-in`, `fade-in`, `slide-in-from-*` etc.; no custom keyframes needed |
| Design direction | "Scientific Clarity" | Serif headings + sans body + mono data = academic authority meets modern data platform |
| Fonts | Source Serif 4 + Source Sans 3 + Source Code Pro | User selected "The Researcher" pairing. Cohesive Adobe family. |
| Button shape | rounded-md (not pill) | User chose professional over branded. Matches shadcn defaults. |
| Dark mode | In scope | User requested. shadcn CSS variables make this straightforward. Added as Pass 7. |
| Implementation order | Foundation → Components → Layout → Pages → Features → Motion → Dark Mode | 7 passes, each builds on previous; verifiable increments |
| Rigidity | Guided but flexible | Strong recommendations with rationale; implementer can make judgment calls on details |
| Scope exclusions | No form library, no MUI/Chakra/Ant, no structural refactoring | Minimizes regression risk; purely visual pass. shadcn/ui allowed per user approval. |

## Verification
- The prompt is self-contained and can be used as a standalone skill via `/ui-improvement`
- References real file paths verified against the codebase
- Explicitly protects backend and functionality from regressions
- Provides enough specificity to prevent generic AI-slop aesthetics
- Includes complete verification checklist at the end
