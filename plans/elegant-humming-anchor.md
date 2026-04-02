# Training Wheels Mode for First-Time Users

## Context

The graduate mentor believes Cleave's UI makes bioinformatics too easy — wet lab members don't learn what the parameters mean when defaults are pre-filled and auto-pipeline runs everything in one click. The compromise: the **first project** a user creates gets "training wheels" — auto-pipeline is disabled and all scientifically meaningful defaults are cleared, forcing users to actively choose each parameter. All subsequent projects work normally.

## Approach

Add an `is_training` boolean flag to the `projects` table. When a user creates their first project (zero prior created projects), the flag is set to `True`. The frontend reads this flag and:
1. Hides auto-pipeline entirely (button + wizard step)
2. Clears defaults on analysis wizard settings (peak caller, reference genome, duplicate removal, DAC exclusion, fragment filter, blacklist, DiffBind method)
3. Shows educational hint callouts explaining each parameter
4. Adds a persistent "Training Project" banner on the experiment view

Backend also guards the auto-pipeline endpoint to reject requests for training projects.

---

## Files to Modify

### Backend (5 files + 1 new migration)

1. **`backend/models/project.py`** — Add `is_training` column (line 19, after `is_reference`)
2. **`backend/migrations/versions/<new>_add_is_training_to_projects.py`** — New migration (`down_revision = 'c5d8f3a10b64'`)
3. **`backend/schemas/project.py`** — Add `is_training: bool = False` to `ProjectRead` (line 26)
4. **`backend/services/project_service.py`** — In `create_project()`, count existing projects by creator; if 0, set `is_training=True`
5. **`backend/routers/experiments.py`** — Guard `start_auto_pipeline_endpoint` against training projects (403)

### Frontend (10 files + 1 new component)

6. **`frontend/src/api/types.ts`** — Add `isTraining: boolean` to `Project` interface
7. **`frontend/src/components/ui/TrainingHint.tsx`** — **NEW** reusable educational callout component
8. **`frontend/src/pages/ExperimentView.tsx`** — Derive `isTrainingProject`, hide "Run Full Pipeline" button, pass flag to wizards and outlet context
9. **`frontend/src/pages/ProjectDetailPage.tsx`** — Pass `isTrainingProject` to `CreateExperimentWizard`
10. **`frontend/src/components/experiments/CreateExperimentWizard.tsx`** — Accept `isTrainingProject`, conditionally hide Pipeline step
11. **`frontend/src/components/alignment/NewAlignmentWizard.tsx`** — Accept `isTrainingProject`, clear defaults, disable genome auto-detection, add validation
12. **`frontend/src/components/alignment/AlignmentSettingsStep.tsx`** — Accept `isTrainingProject`, show `TrainingHint` callouts for genome, duplicates, DAC exclusion; force Advanced Settings open in training mode
13. **`frontend/src/components/peak-calling/NewPeakCallingWizard.tsx`** — Accept `isTrainingProject`, clear peak caller/size defaults, add validation
14. **`frontend/src/components/peak-calling/PeakCallingSettingsStep.tsx`** — Accept `isTrainingProject`, add placeholder option to peak caller/size selects, show `TrainingHint` callouts; force Advanced Settings open in training mode
15. **`frontend/src/components/diffbind/NewDiffBindWizard.tsx`** — Accept `isTrainingProject`, clear `analysisMethod` default
16. **`frontend/src/components/diffbind/DiffBindSettingsStep.tsx`** — Accept `isTrainingProject`, add placeholder option, show `TrainingHint` callout

---

## Detailed Changes

### 1. Backend Model (`backend/models/project.py`)

Add after `is_reference` (line 18):
```python
is_training: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
```

### 2. Alembic Migration

New file following `c5d8f3a10b64` pattern:
```python
def upgrade() -> None:
    op.add_column('projects', sa.Column('is_training', sa.Boolean(), nullable=False, server_default='false'))

def downgrade() -> None:
    op.drop_column('projects', 'is_training')
```

### 3. Backend Schema (`backend/schemas/project.py`)

Add to `ProjectRead` after `is_reference` (line 25):
```python
is_training: bool = False
```

### 4. Backend Service (`backend/services/project_service.py`)

Modify `create_project` (line 22-32):
```python
async def create_project(db: AsyncSession, data: ProjectCreate, creator_id: int) -> Project:
    # Training wheels: first project a user creates gets training mode
    count_result = await db.execute(
        select(func.count()).where(Project.created_by == creator_id)
    )
    existing_count = count_result.scalar_one()
    is_training = existing_count == 0

    project = Project(
        name=data.name, description=data.description,
        created_by=creator_id, is_training=is_training,
    )
    # ... rest unchanged
```

### 5. Backend Guard (`backend/routers/experiments.py`)

In `start_auto_pipeline_endpoint` (after line 125), add:
```python
# Block auto-pipeline on training projects
project_result = await db.execute(select(Project).where(Project.id == exp.project_id))
proj = project_result.scalar_one_or_none()
if proj and proj.is_training:
    raise HTTPException(
        status_code=403,
        detail="Auto-pipeline is disabled on your first project. Run each step manually to learn the parameters.",
    )
```

### 6. Frontend Type (`frontend/src/api/types.ts`)

Add to `Project` interface after `isReference`:
```typescript
isTraining: boolean;
```

### 7. TrainingHint Component (NEW: `frontend/src/components/ui/TrainingHint.tsx`)

A conditional educational callout with a `Lightbulb` icon, teal-colored background, and descriptive text. Only renders when `visible` prop is true. Compact design that doesn't overwhelm the form.

### 8. ExperimentView Changes

- Derive `isTrainingProject = parentProject?.isTraining ?? false`
- Add `&& !isTrainingProject` to the "Run Full Pipeline" button condition (line 109)
- Pass `isTrainingProject` to all 6 wizard components as a prop
- Pass through outlet context: `{ experiment, isReadOnly, isTrainingProject }`
- Show a teal "Training Project" banner (with `GraduationCap` icon) below the header when `isTrainingProject`

### 9-10. CreateExperimentWizard + ProjectDetailPage

- `ProjectDetailPage` passes `isTrainingProject={project?.isTraining ?? false}` to wizard
- `CreateExperimentWizard` accepts `isTrainingProject` prop
- When `isTrainingProject`, the Pipeline step (index 3) is excluded from the `steps` array entirely

### 11-12. Alignment Wizard + Settings Step

**Defaults cleared in training mode:**
| Parameter | Normal Default | Training Default |
|-----------|---------------|-----------------|
| `referenceGenome` | auto-detected | `''` (must choose) |
| `removeDuplicates` | `true` | `null` (must choose) |
| `removeDacExclusion` | `true` | `null` (must choose) |

- Alignment wizard: `isTrainingProject` prop; conditional initial state; skip auto-detection in `handleNext` when training; validate non-null booleans on submit
- Settings step: `isTrainingProject` prop; checkboxes show "Choose" state when null (indeterminate); force Advanced Settings open; add 3 `TrainingHint` callouts:
  - **Reference Genome**: "The reference genome must match your organism. Mouse uses mm10, human uses hg38 or hg19. Aligning to the wrong genome produces misleading results."
  - **Remove Duplicates**: "PCR duplicates are identical read pairs from amplification, not biology. Removing them prevents artificial signal inflation. Recommended for CUT&RUN/CUT&Tag."
  - **DAC Exclusion**: "The ENCODE DAC exclusion list contains genomic regions with anomalous signal in any experiment. Removing reads here reduces false peaks."

### 13-14. Peak Calling Wizard + Settings Step

**Defaults cleared in training mode:**
| Parameter | Normal Default | Training Default |
|-----------|---------------|-----------------|
| `peakCaller` | `'SEACR'` | `''` (must choose) |
| `peakSize` | `'stringent'` | `''` (must choose) |
| `fragmentFilter` | `true` | `null` (must choose) |
| `blacklist` | `'both'` | `''` (must choose) |

- Peak calling wizard: `isTrainingProject` prop; conditional initial state; validate all required before submit
- Settings step: `isTrainingProject` prop; add empty placeholder `<option>` to peak caller and peak size selects; force Advanced Settings open; add 4 `TrainingHint` callouts:
  - **Peak Caller**: "SEACR is designed for CUT&RUN's low background. MACS2 is the most widely published caller. SICER2 specializes in broad histone marks like H3K27me3."
  - **Peak Size**: "Narrow peaks suit sharp marks (H3K4me3, CTCF). Broad peaks suit diffuse marks (H3K27me3). SEACR uses stringent (fewer, high-confidence) vs relaxed (more, exploratory)."
  - **Fragment Filter**: "CUT&RUN produces sub-nucleosomal fragments (<120bp) that represent true binding. Filtering to these enriches signal and improves peak calling."
  - **Blacklist**: "Blacklist regions are known artifact loci. ENCODE DAC is the standard set. The lab custom list adds 255 mm10-specific regions."

### 15-16. DiffBind Wizard + Settings Step

**Defaults cleared:**
| Parameter | Normal Default | Training Default |
|-----------|---------------|-----------------|
| `analysisMethod` | `'deseq2_consensus'` | `''` (must choose) |

- DiffBind wizard: `isTrainingProject` prop; conditional initial state; validate non-empty on submit
- Settings step: `isTrainingProject` prop; add empty placeholder to method select; add `TrainingHint`:
  - **Analysis Method**: "DiffBind compares binding between conditions. DESeq2 with consensus peakset is standard — it builds peaks from all samples. edgeR uses TMM normalization. Custom peakset lets you supply your own regions."

---

## Edge Cases

- **User invited to someone else's project first**: Does NOT affect their first-created project. Query counts `Project.created_by == creator_id`, not memberships.
- **Reference projects**: Created by admin/seed script. Already have `is_reference=True` which makes them read-only. The `is_training` flag is harmless on them.
- **User deletes their training project then creates new one**: Count will be 0 again, new project becomes training. This is correct — they chose to start over.
- **Existing users after migration**: All existing projects get `is_training=false` via `server_default`. Existing users with projects won't get training mode on new projects since count > 0.

---

## Verification

1. **Backend**: Run relevant tests (`docker compose exec api pytest tests/test_projects.py tests/test_experiments.py -v`)
2. **Frontend**: `npm run build` (TypeScript check + build), manual testing:
   - Register new user → create first project → verify training banner, no auto-pipeline, empty defaults, hints visible
   - Create second project → verify normal behavior, auto-pipeline available, defaults pre-filled, no hints
3. **API guard**: Try `POST /experiments/:id/auto-pipeline` on training project → expect 403
