# 2026-03-28 — UI Improvement Skill Prompt

## What was done

Created a comprehensive UI improvement skill prompt at `.claude/skills/ui-improvement/SKILL.md` (650 lines) to guide a systematic frontend polish pass across the entire Cleave platform.

### Research
- Launched 3 parallel Explore agents to inventory all 72 frontend components, styling patterns, visual quality issues, and design infrastructure
- Examined 5 screenshots of the current UI
- Read all Phase 1-6 summaries and design reference docs
- Launched Plan agent to architect the prompt structure and design direction

### Deliverable
- **`.claude/skills/ui-improvement/SKILL.md`** — Self-contained skill prompt with 7 implementation passes, codebase index, before/after patterns, verification checklist

## Decisions made

| Decision | Choice |
|----------|--------|
| Component library | shadcn/ui (user-approved) |
| Icon library | lucide-react (bundled with shadcn) |
| Fonts | Source Serif 4 + Source Sans 3 + Source Code Pro |
| Button shape | rounded-md (switching from pill/rounded-full) |
| Dark mode | In scope (Pass 7) |
| Design direction | "Scientific Clarity" — serif headings, mono data, borders over shadows |
| Prompt rigidity | Guided but flexible |

## Open items
- The prompt is ready to execute but no code changes have been made yet
- Implementation is structured as 7 sequential passes

## Key file paths
- `.claude/skills/ui-improvement/SKILL.md` — the skill prompt (created)
