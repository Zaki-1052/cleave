# Phase 2.7: Experiment Creation Wizard — Complete

## Context

The current experiment creation flow is a single-step `CreateExperimentModal` that only captures Step 1 (name, assay type, description). Per PLAN.md §2.7, we need to extend this to a 3-step wizard matching CUTANA Cloud's pattern (cutana-cloud-ui.md §2b + §6c + §6e): **Details → FASTQs → Reactions**. The `FileUploadZone` from Phase 2.2 and `ReactionsEditor` from Phase 2.6 are ready to embed as Steps 2 and 3.

## Key Architectural Decision

**Create experiment on Step 1 "Next"** — Both `FileUploadZone` and `ReactionsEditor` require a real `experimentId` (they call API endpoints like `POST /experiments/{id}/fastqs/upload` and `GET /experiments/{id}/reactions`). Rather than reworking those components to defer creation, we create the experiment when the user advances past Step 1. This matches CUTANA Cloud's behavior and lets us reuse both components with zero modifications.

An empty experiment (status `"new"`) is harmless — users see it in their experiments list and can delete it or continue later.

## Implementation Steps

### Step 1: Add `renderFooter` and `maxWidth` props to WizardModal

**File**: `frontend/src/components/ui/WizardModal.tsx` (modify)

Add two optional props to `WizardModalProps`:
- `renderFooter?: (args: { currentStep: number; isLastStep: boolean; onClose: () => void; onBack: () => void; onNext: () => void; onSubmit: () => void }) => ReactNode` — when provided, replaces the default footer for all steps
- `maxWidth?: string` — defaults to `'max-w-4xl'`; wizard passes `'max-w-6xl'`

In the JSX:
- Replace hardcoded `max-w-4xl` in the container div with the `maxWidth` prop
- In the footer section: `if (renderFooter) { return renderFooter({...}); } else { /* existing default footer */ }`

This is fully backward-compatible — existing consumers pass neither prop and get current behavior.

### Step 2: Add `useUpdateExperiment` hook

**File**: `frontend/src/hooks/useExperiments.ts` (modify)

Add a new hook following the existing `useCreateExperiment` pattern:

```typescript
export function useUpdateExperiment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: {
      id: number;
      updates: { name?: string; description?: string; assayType?: string };
    }) => experimentsApi.updateExperiment(id, updates),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['experiments'] });
      void queryClient.invalidateQueries({ queryKey: ['experiments', data.id] });
    },
  });
}
```

This is needed for the case where a user goes Back to Step 1 from Step 2 and edits details — we call `updateExperiment` instead of `createExperiment` on re-advancing.

### Step 3: Create `ExperimentDetailsStep` component

**File**: `frontend/src/components/experiments/ExperimentDetailsStep.tsx` (create)

A controlled form fragment (no `<form>` wrapper) extracted from the current `CreateExperimentModal`. Receives props:

```typescript
interface ExperimentDetailsStepProps {
  name: string;
  setName: (v: string) => void;
  assayType: string;
  setAssayType: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  error: string | null;
}
```

Contains:
- Name input (required, maxLength 100, character counter) — identical to `CreateExperimentModal` line 56-70
- Assay type select (required, ASSAY_TYPES dropdown) — line 73-93
- Description textarea (optional) — line 95-106
- Error display if `error` is non-null

### Step 4: Create `CreateExperimentWizard` component

**File**: `frontend/src/components/experiments/CreateExperimentWizard.tsx` (create)

**Props** (same as `CreateExperimentModal` for drop-in replacement):
```typescript
interface CreateExperimentWizardProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  onCreated: (experiment: Experiment) => void;
}
```

**State**:
- `currentStep: number` (0, 1, 2)
- `name, assayType, description: string` — Step 1 form values
- `createdExperiment: Experiment | null` — set after API creation
- `createError: string | null` — error from create/update calls

**Hooks**: `useCreateExperiment()`, `useUpdateExperiment()`

**`handleNext` logic**:
- **Step 0 → 1**: Validate `name.trim()` and `assayType` are non-empty. If `createdExperiment` exists (user went back and re-advanced), call `updateExperiment` to apply any edits. If null, call `createExperiment`. On success, store experiment and advance. On error, set `createError`.
- **Step 1 → 2**: Advance immediately (FASTQs are optional).

**`handleBack`**: Decrement step. No special logic — Step 1 form fields remain populated, `FileUploadZone` retains its state.

**`handleClose`**: Reset all state, call `onClose()`.

**Steps array**:
```typescript
const steps = [
  { label: 'Details', content: <ExperimentDetailsStep ... /> },
  { label: 'FASTQs', content: <FileUploadZone experimentId={createdExperiment!.id} onUploadComplete={() => {}} /> },
  { label: 'Reactions', content: <ReactionsEditor experimentId={createdExperiment!.id} assayType={createdExperiment!.assayType} /> },
];
```

Steps 2 and 3 content only renders when `createdExperiment` is non-null (guaranteed by `handleNext` gating).

**Custom footer** via `renderFooter`:
- Steps 0 and 1: Standard Cancel / Back / Next pattern (Back hidden on step 0)
- Step 2 (last): Cancel / Back / Save (outlined) / Update Experiment (primary)
  - "Save" = close wizard without navigating (reactions are already saved via immediate mutations)
  - "Update Experiment" = call `onCreated(createdExperiment)` which triggers navigation to `/experiments/{id}`

Passed to `WizardModal` with `maxWidth="max-w-6xl"` to accommodate the ReactionsEditor DataTable width.

### Step 5: Update ProjectDetailPage

**File**: `frontend/src/pages/ProjectDetailPage.tsx` (modify)

- Replace import: `CreateExperimentModal` → `CreateExperimentWizard`
- Replace JSX: `<CreateExperimentModal ... />` → `<CreateExperimentWizard ... />`
- Props are identical (`isOpen`, `onClose`, `projectId`, `onCreated`) — drop-in replacement

### Step 6: Delete CreateExperimentModal

**File**: `frontend/src/components/experiments/CreateExperimentModal.tsx` (delete)

Only imported in `ProjectDetailPage.tsx` (verified via grep). The wizard replaces it completely.

## Files Summary

| File | Action | Lines (~) |
|------|--------|-----------|
| `frontend/src/components/ui/WizardModal.tsx` | Modify | +15 |
| `frontend/src/hooks/useExperiments.ts` | Modify | +12 |
| `frontend/src/components/experiments/ExperimentDetailsStep.tsx` | Create | ~70 |
| `frontend/src/components/experiments/CreateExperimentWizard.tsx` | Create | ~170 |
| `frontend/src/pages/ProjectDetailPage.tsx` | Modify | ~4 lines changed |
| `frontend/src/components/experiments/CreateExperimentModal.tsx` | Delete | -129 |

**Zero backend changes. Zero modifications to FileUploadZone, ReactionsEditor, or their children.**

## Existing Functions/Utilities to Reuse

- `WizardModal` — `frontend/src/components/ui/WizardModal.tsx` (enhanced with new props)
- `FileUploadZone` — `frontend/src/components/fastqs/FileUploadZone.tsx` (as-is)
- `ReactionsEditor` — `frontend/src/components/reactions/ReactionsEditor.tsx` (as-is)
- `Button` — `frontend/src/components/ui/Button.tsx` (for footer buttons)
- `useCreateExperiment` — `frontend/src/hooks/useExperiments.ts`
- `updateExperiment` API — `frontend/src/api/experiments.ts` (already exists, just needs hook)
- `ASSAY_TYPES` constant — `frontend/src/lib/constants.ts`

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Cancel before Step 1 "Next" | No experiment created. Clean close. |
| Cancel after Step 1 (experiment exists) | Experiment remains with status "new", zero files. User can delete from project page. |
| Back from Step 2 → edit Step 1 → Next | `updateExperiment` called with new values. |
| Step 1 API error (e.g., duplicate name) | Error displayed below form. User stays on Step 1. |
| Upload fails on Step 2 | `FileUploadZone` shows its own error banner. User can retry or skip. |
| Browser closes mid-wizard | Same as cancel — experiment may exist in "new" state. |

## Verification

1. Navigate to project detail page → click "+ Create Experiment"
2. **Step 1**: Enter name + assay type → click Next → verify POST request creates experiment
3. **Step 2**: Upload test FASTQs → progress bar → files appear → click Next
4. **Step 3**: Add reactions via CSV or manually → verify they appear in table
5. Click "Update Experiment" → navigate to `/experiments/{id}` → verify FASTQs tab shows files, Reactions tab shows reactions
6. Click "Save" instead → wizard closes, no navigation → reopen experiment from project list → data persists
7. Test Back navigation between all steps → verify state preserved
8. Run `npx tsc --noEmit` → passes cleanly
