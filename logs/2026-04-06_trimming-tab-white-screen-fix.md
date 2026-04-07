# 2026-04-06 — Fix White Screen on Trimming Job Navigation + New TrimmingTab

## What was done

- **Diagnosed white screen bug**: Clicking a trimming job in the analysis queue navigated to `/experiments/{id}/fastqs/{jobId}`, but no `fastqs/:jid` route existed in App.tsx. React Router rendered nothing.
- **Created dedicated TrimmingTab** with Info and Files sub-tabs, modeled after NormalizationTab pattern
- **Created TrimmingFilesPanel** for browsing/downloading trimmed FASTQ outputs
- **Fixed queue navigation mapping**: `trimming: 'fastqs'` → `trimming: 'trimming'`
- **Added `trimming/:jid` route** in App.tsx
- **Added Trimming sidebar entry** in ExperimentView between Reactions and Alignment (Scissors icon)
- **Added `TRIMMING_FILE_CATEGORIES`** to constants.ts

## Decisions made

- Followed NormalizationTab as the template (simplest tab model) — only 2 sub-tabs (Info + Files) since trimming has no QC report or IGV
- Info panel shows: Run ID, Created By, Created Date, Status, Pairs Trimmed, Adapter File, plus methods text and editable notes
- Trimming launch UI stays in FastqsTab (adapter detection banner + TrimConfigModal) — TrimmingTab is for viewing job details
- Not added to NewAnalysisDropdown since trimming is contextually launched from FastqsTab

## Files created/modified

- `frontend/src/pages/experiment/TrimmingTab.tsx` (new)
- `frontend/src/components/trimming/TrimmingFilesPanel.tsx` (new)
- `frontend/src/App.tsx` (added import + route)
- `frontend/src/pages/AnalysisQueuePage.tsx` (fixed JOB_TYPE_TO_TAB mapping)
- `frontend/src/pages/ExperimentView.tsx` (added Scissors icon + sidebar tab)
- `frontend/src/lib/constants.ts` (added TRIMMING_FILE_CATEGORIES)

## Open items

- None — `npx tsc --noEmit` and `npm run build` both pass clean
