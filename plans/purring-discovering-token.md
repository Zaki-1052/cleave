# Pass 2: Experiment View & Selectors (Navigation Polish)

## Context

All 7 visual polish passes from `docs/ui-improvement.md` are complete (foundation, core components, layout, page polish, feature components, motion, dark mode). This session implements **Pass 2 from `UI-POLISH-TODO.md`** — navigation polish for the experiment view sidebar, job selectors, sub-tabs, and queue page filters. These are the most frequently interacted-with navigation elements in the app; upgrading them from native `<select>` to shadcn Select and adding visual affordances significantly improves the daily UX for researchers.

---

## Implementation Order: 2a -> 2c -> 2b -> 2d

CSS-only changes first (lowest risk), then structural changes.

---

### Step 1: ExperimentView sidebar active tab accent bar (2a)

**File**: `frontend/src/pages/ExperimentView.tsx` (lines 146-150)

**Change**: Edit the className string on the sidebar `<Link>` elements.

```
CURRENT active:  'bg-card font-semibold text-primary'
TARGET  active:  'border-l-2 border-primary bg-primary/5 dark:bg-primary/10 font-semibold text-primary'

CURRENT inactive: 'text-muted-foreground hover:bg-card/50'
TARGET  inactive: 'border-l-2 border-transparent text-muted-foreground hover:bg-card/50 hover:text-foreground'
```

- Replaces `bg-card` with `bg-primary/5` (subtle tint) + left accent bar
- Inactive gets `border-l-2 border-transparent` to prevent layout shift
- Inactive gains `hover:text-foreground` for better hover feedback
- No import changes

---

### Step 2: Sub-tab background tint (2c) — 6 files

Apply identical CSS change to the sub-tab `<button>` className in all 6 files:

| File | Approx lines |
|------|-------------|
| `frontend/src/pages/experiment/AlignmentTab.tsx` | 103-106 |
| `frontend/src/pages/experiment/PeakCallingTab.tsx` | ~same pattern |
| `frontend/src/pages/experiment/DiffBindTab.tsx` | ~same pattern |
| `frontend/src/pages/experiment/CustomHeatmapTab.tsx` | ~same pattern |
| `frontend/src/pages/experiment/NormalizationTab.tsx` | ~same pattern |
| `frontend/src/pages/experiment/PearsonCorrelationTab.tsx` | ~same pattern |

**Change**: Add `bg-primary/5 rounded-t-md` to active, `rounded-t-md hover:bg-muted/50` to inactive.

```
CURRENT active:   'border-b-2 border-primary text-primary'
TARGET  active:   'border-b-2 border-primary text-primary bg-primary/5 rounded-t-md'

CURRENT inactive: 'text-muted-foreground hover:text-foreground'
TARGET  inactive: 'text-muted-foreground hover:text-foreground rounded-t-md hover:bg-muted/50'
```

- No import changes

**Checkpoint**: `npm run typecheck` (CSS-only changes so far)

---

### Step 3: Job selector replacement (2b) — 6 files

Replace native `<select>` with shadcn `<Select>` in all 6 experiment tab files.

**Per-file changes (3 edits each):**

**A. Add import** (group with other `@/components/ui/` imports):
```tsx
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
```

**B. Remove `handleJobChange` function** — e.g. in AlignmentTab:
```tsx
// DELETE this:
function handleJobChange(e: React.ChangeEvent<HTMLSelectElement>) {
  const selectedId = e.target.value;
  navigate(`/experiments/${id}/alignment/${selectedId}`);
}
```

**C. Replace `<label>` + `<select>` block** — example for AlignmentTab:

```tsx
// FROM:
<label htmlFor="alignment-job-select" className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
  Alignments
</label>
<select
  id="alignment-job-select"
  value={activeJobId ?? ''}
  onChange={handleJobChange}
  className="rounded-md border border-border px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
>
  {alignmentJobs.map((j) => (
    <option key={j.id} value={j.id}>
      {j.name}
    </option>
  ))}
</select>

// TO:
<span className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
  Alignments
</span>
<Select value={String(activeJobId ?? '')} onValueChange={(val) => navigate(`/experiments/${id}/alignment/${val}`)}>
  <SelectTrigger className="w-[220px]">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {alignmentJobs.map((j) => (
      <SelectItem key={j.id} value={String(j.id)}>{j.name}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

**Per-file specifics:**

| File | Label text | Jobs var | Navigate path |
|------|-----------|----------|--------------|
| AlignmentTab.tsx | "Alignments" | `alignmentJobs` | `alignment/${val}` |
| PeakCallingTab.tsx | "Peak Calling" | `peakCallingJobs` | `peaks/${val}` |
| DiffBindTab.tsx | "DiffBind" | `diffBindJobs` | `diffbind/${val}` |
| CustomHeatmapTab.tsx | "Heatmaps" | `heatmapJobs` | `heatmaps/${val}` |
| NormalizationTab.tsx | "Normalizations" | `normalizationJobs` | `normalization/${val}` |
| PearsonCorrelationTab.tsx | "Correlations" | `correlationJobs` | `correlations/${val}` |

Note: CustomHeatmapTab, NormalizationTab, PearsonCorrelationTab use explicit `(j: AnalysisJob)` typing in `.map()` — preserve this.

**Checkpoint**: `npm run typecheck`

---

### Step 4: AnalysisQueuePage filter selectors (2d)

**File**: `frontend/src/pages/AnalysisQueuePage.tsx`

**A. Add import:**
```tsx
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
```

**B. Replace both `<select>` elements** (lines 153-179) with shadcn Select.

**CRITICAL GOTCHA**: `STATUS_OPTIONS` and `JOB_TYPE_OPTIONS` have `{ value: '', label: 'All ...' }` as their first option. Radix Select does NOT allow empty string `""` as a `SelectItem` value. Use sentinel values:

```tsx
// Job type filter:
<Select
  value={jobTypeFilter || '__all'}
  onValueChange={(val) => { setJobTypeFilter(val === '__all' ? '' : val); setPage(1); }}
>
  <SelectTrigger className="w-[160px]">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {JOB_TYPE_OPTIONS.map((opt) => (
      <SelectItem key={opt.value || '__all'} value={opt.value || '__all'}>
        {opt.label}
      </SelectItem>
    ))}
  </SelectContent>
</Select>

// Status filter:
<Select
  value={statusFilter || '__all'}
  onValueChange={(val) => { setStatusFilter(val === '__all' ? '' : val); setPage(1); }}
>
  <SelectTrigger className="w-[160px]">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    {STATUS_OPTIONS.map((opt) => (
      <SelectItem key={opt.value || '__all'} value={opt.value || '__all'}>
        {opt.label}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

**Final checkpoint**: `npm run typecheck` + `npm run build`

---

## Key Gotchas

1. **Radix Select rejects empty string `""` as `SelectItem` value** — use `'__all'` sentinel for AnalysisQueuePage "All" options, map back to `''` in `onValueChange`
2. **`htmlFor` on labels** — native `<select>` had `id` + `<label htmlFor>`. Radix Select manages its own ARIA. Change `<label>` to `<span>` to avoid broken association.
3. **`activeJobId` is `number | null`** — wrap with `String()` since Radix requires string values. The `<Select>` only renders after the early-return guard (when jobs exist), so `activeJobId` will always be a valid number at that point.
4. **Explicit type annotations** — 3 files (CustomHeatmap, Normalization, PearsonCorrelation) use `(j: AnalysisJob)` in `.map()` callbacks. Preserve these.
5. **`SelectTrigger` already has `[&>span]:line-clamp-1`** in the shadcn component — long job names will truncate gracefully at `w-[220px]`.
6. **`w-[160px]` for queue filters** — verify "Peak Calling" fits. If not, bump to `w-[180px]`.

## Files Modified (8 total)

1. `frontend/src/pages/ExperimentView.tsx` — sidebar accent bar
2. `frontend/src/pages/experiment/AlignmentTab.tsx` — select + sub-tabs
3. `frontend/src/pages/experiment/PeakCallingTab.tsx` — select + sub-tabs
4. `frontend/src/pages/experiment/DiffBindTab.tsx` — select + sub-tabs
5. `frontend/src/pages/experiment/CustomHeatmapTab.tsx` — select + sub-tabs
6. `frontend/src/pages/experiment/NormalizationTab.tsx` — select + sub-tabs
7. `frontend/src/pages/experiment/PearsonCorrelationTab.tsx` — select + sub-tabs
8. `frontend/src/pages/AnalysisQueuePage.tsx` — filter selects

## Verification

- [ ] `npm run typecheck` — zero errors
- [ ] `npm run build` — succeeds
- [ ] Sidebar active tab has left accent bar with primary tint
- [ ] Sidebar inactive tabs: no layout shift, hover shows text color change
- [ ] Dark mode: active tab uses `bg-primary/10`
- [ ] All 6 job selectors render as Radix popover dropdowns
- [ ] Selecting a different job navigates to correct URL
- [ ] Sub-tabs have rounded top corners and active tint
- [ ] Hovering inactive sub-tabs shows muted background
- [ ] Queue page filters render as Radix dropdowns
- [ ] "All Types" / "All Statuses" clears the filter correctly
- [ ] Filter selection resets pagination to page 1
- [ ] `grep -r '<select' frontend/src/pages/experiment/` returns zero matches
- [ ] `grep -r 'handleJobChange' frontend/src/pages/experiment/` returns zero matches
