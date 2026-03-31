# UI Pass 4: Page-Level Polish — Implementation Plan

## Context

Passes 1-3 established the design system foundation (shadcn/ui, Source fonts, CSS variables), upgraded shared primitives (Button, Modal, WizardModal, DataTable, Card, StatusBadge), and polished layout/navigation (Navbar DropdownMenu, Breadcrumbs ChevronRight, NewAnalysisDropdown icons, ExperimentView tab icons). Pass 4 applies these patterns to the remaining page-level components: auth pages, HomePage, ProjectDetailPage, AnalysisQueuePage, and SettingsPage.

## Implementation Order

**4b (auth pages) → 4a (HomePage) → 4c (ProjectDetailPage) → 4d (AnalysisQueuePage) → 4e (SettingsPage)**

Simplest/most isolated first, increasing complexity. Each file independently verifiable.

---

## 4b. Auth Pages (4 files)

All four auth pages share identical structure: `GradientBackground > centered div > Card > heading + form`. Apply the same pattern to each.

### LoginPage.tsx (67 lines)

**Changes:**
1. Insert Cleave wordmark block before the Card (inside the centering div):
   ```tsx
   <div className="mb-8 text-center">
     <h2 className="font-display text-3xl font-bold text-white">Cleave</h2>
     <p className="mt-1 text-sm text-white/70">CUT&RUN Analysis Platform</p>
   </div>
   ```
2. Add `border border-white/50` to Card className (Card internally uses `cn()`, so `twMerge` will replace `border-border` with `border-white/50` — desired behavior)
3. Add `font-display` to the `<h1>` heading

**No new imports needed.**

### RegisterPage.tsx (74 lines)

Same 3 changes as LoginPage — wordmark, card border, heading font-display.

### ForgotPasswordPage.tsx (72 lines)

Same 3 changes. Additionally:
- Replace `disabled={loading}` / `{loading ? 'Sending...' : 'Send Reset Link'}` with `loading={loading}` prop on Button (Pass 2 convention)

### ResetPasswordPage.tsx (103 lines)

Same 3 changes. Additionally:
- Replace inline-styled success `<Link>` (line 60-65, `rounded-full bg-primary px-6 py-2...`) with `<Button asChild><Link to="/login">Sign In</Link></Button>` for component consistency
- Replace `disabled={loading}` / ternary text with `loading={loading}` prop on submit Button

---

## 4a. HomePage.tsx (68 lines)

**New imports:** `Loader2, Clock, FolderPlus` from `lucide-react`

**Changes:**
1. **Filter sidebar** (line 21): Replace `"Not yet implemented"` with muted placeholder:
   ```tsx
   <div className="flex items-center gap-2 text-sm text-muted-foreground">
     <Clock className="h-4 w-4" />
     <span>Coming soon</span>
   </div>
   ```
2. **"Projects" heading** (line 27): Add `font-display`
3. **Loading spinner** (line 33): Replace `<div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />` with `<Loader2 className="h-8 w-8 animate-spin text-primary" />`
4. **Empty state** (lines 36-38): Replace plain text with icon + message:
   ```tsx
   <Card>
     <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
       <FolderPlus className="mb-2 h-10 w-10" />
       <p className="text-sm">No projects yet. Create one to get started.</p>
     </div>
   </Card>
   ```
5. **Project card hover** (line 43): Change `transition-colors` to `transition-all duration-150` and add `hover:-translate-y-0.5 hover:shadow-md`
6. **Storage size** (line 47): Wrap `formatBytes(project.storageBytes)` in `<span className="font-mono">`

---

## 4c. ProjectDetailPage.tsx (158 lines)

**New imports:** `Loader2, UserPlus` from `lucide-react`

**Changes:**
1. **Loading spinner** (line 68): Replace border spinner with `<Loader2 className="h-8 w-8 animate-spin text-primary" />`
2. **Project name** (line 85): Add `font-display` to heading
3. **Member avatars** (line 103): Add `ring-2 ring-white shadow-sm` to avatar circles
4. **"Manage Members" link** (lines 116-121): Replace `+ Manage Members` text with `<UserPlus className="h-4 w-4" /> Manage Members` (add `inline-flex items-center gap-1.5` to button class, remove the `+` prefix)
5. **"Experiments" heading** (line 143): Add `font-display` for consistency with other section headings

---

## 4d. AnalysisQueuePage.tsx (243 lines)

**New imports:** `Search, Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight` from `lucide-react`

**Changes:**
1. **Heading** (line 139): Add `font-display`
2. **Search icon** (lines 149-161): Replace entire inline `<svg>` with `<Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />`
3. **Loading state** (line 195): Replace text `Loading...` with `<Loader2 className="h-8 w-8 animate-spin text-primary" />` in centered div
4. **Duration/date columns** — wrap cell return values with `<span className="font-mono">`:
   - `startedAt` column (line 81): wrap `formatDateTime(v)` in `<span className="font-mono">`
   - `durationSeconds` column (line 89): wrap `formatDuration(v)` in `<span className="font-mono">`
5. **Pagination buttons** (lines 209-236): Replace HTML entities with lucide icons:
   - `|‹` → `<ChevronsLeft className="h-4 w-4" />`
   - `‹` → `<ChevronLeft className="h-4 w-4" />`
   - `›` → `<ChevronRight className="h-4 w-4" />`
   - `›|` → `<ChevronsRight className="h-4 w-4" />`
   - Update button classes from `px-1 py-0.5` to `p-1` for icon button sizing

---

## 4e. SettingsPage.tsx (155 lines)

**New imports:**
- `Separator` from `@/components/ui/separator`
- `Select, SelectTrigger, SelectValue, SelectContent, SelectItem` from `@/components/ui/select`

**Changes:**
1. **Heading** (line 68): Add `font-display`
2. **Section divider**: Add `<Separator />` between Account Information section (ends ~line 96) and Email section (starts ~line 99)
3. **Native `<select>`** (lines 112-126): Replace with shadcn Select:
   ```tsx
   <Select value={emailNotifications} onValueChange={(value) => { setEmailNotifications(value); setSaveSuccess(false); }}>
     <SelectTrigger className="w-full">
       <SelectValue />
     </SelectTrigger>
     <SelectContent>
       {EMAIL_NOTIFICATION_OPTIONS.map((opt) => (
         <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
       ))}
     </SelectContent>
   </Select>
   ```
   - Remove `htmlFor="email-notifications"` from the label (shadcn Select manages its own labeling)
   - Note: `onValueChange` provides value directly as string (not `e.target.value`)
4. **Save button** (lines 147-149): Replace `disabled={!hasChanges || isSaving}` / ternary text with `loading={isSaving} disabled={!hasChanges}` (Pass 2 Button loading convention)

---

## Risk Areas

| Risk | Mitigation |
|------|------------|
| Card `border-white/50` overriding `border-border` | Expected behavior via `twMerge` — Card uses `cn()` internally, outer class wins |
| shadcn Select `onValueChange` vs native `onChange` | `onValueChange` provides string directly, not event — handler signature changes |
| Pagination icon sizing after removing text | Use `p-1` padding for consistent icon button click targets |
| `font-display` on headings that use `text-gray-800` | Works fine — font-display is the font family, text-gray-800 is color, no conflict |

## Files Modified (8 total)

| File | Icons Added | shadcn Components Added |
|------|-------------|------------------------|
| `LoginPage.tsx` | — | — |
| `RegisterPage.tsx` | — | — |
| `ForgotPasswordPage.tsx` | — | — |
| `ResetPasswordPage.tsx` | — | — |
| `HomePage.tsx` | Loader2, Clock, FolderPlus | — |
| `ProjectDetailPage.tsx` | Loader2, UserPlus | — |
| `AnalysisQueuePage.tsx` | Search, Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight | — |
| `SettingsPage.tsx` | — | Separator, Select (5 imports) |

**No new files created. No backend/API/hooks/contexts/constants modified.**

## Verification

After each file:
1. `npm run typecheck` — zero errors
2. `npm run lint` — no new errors

After all files:
1. `npm run build` — successful production build
2. Visual verification at: `/login`, `/register`, `/forgot-password`, `/`, `/projects/:id`, `/queue`, `/settings`
3. Workflow check: login → create project → create experiment wizard → navigate to queue → update settings
