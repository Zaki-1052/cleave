// frontend/src/components/diffbind/AssignConditionsStep.tsx
import { useEffect, useRef } from 'react';

interface PeakCallingReaction {
  reaction_id: number;
  short_name: string;
}

export interface SampleAssignment {
  condition: string;
  replicate: number;
}

interface AssignConditionsStepProps {
  reactions: PeakCallingReaction[];
  selectedIds: Set<number>;
  assignments: Map<number, SampleAssignment>;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
  onUpdateAssignment: (reactionId: number, assignment: SampleAssignment) => void;
}

/** Count unique conditions across selected reactions that have non-empty condition strings. */
function getUniqueConditions(
  selectedIds: Set<number>,
  assignments: Map<number, SampleAssignment>,
): string[] {
  const conditions = new Set<string>();
  for (const id of selectedIds) {
    const a = assignments.get(id);
    if (a && a.condition.trim()) {
      conditions.add(a.condition.trim());
    }
  }
  return [...conditions];
}

/** Validate the sample assignments and return validation messages. */
function validate(
  selectedIds: Set<number>,
  assignments: Map<number, SampleAssignment>,
): string[] {
  const messages: string[] = [];

  if (selectedIds.size < 4) {
    messages.push(`Select at least 4 reactions (currently ${selectedIds.size}).`);
  }

  const conditions = getUniqueConditions(selectedIds, assignments);
  if (conditions.length < 2) {
    messages.push(`Assign at least 2 different conditions (currently ${conditions.length}).`);
  }

  // Check each condition has at least 2 replicates
  for (const cond of conditions) {
    let repCount = 0;
    for (const id of selectedIds) {
      const a = assignments.get(id);
      if (a && a.condition.trim() === cond) {
        repCount++;
      }
    }
    if (repCount < 2) {
      messages.push(`Condition "${cond}" needs at least 2 replicates (currently ${repCount}).`);
    }
  }

  // Check for missing conditions on selected reactions
  for (const id of selectedIds) {
    const a = assignments.get(id);
    if (!a || !a.condition.trim()) {
      messages.push('All selected reactions must have a condition assigned.');
      break;
    }
  }

  return messages;
}

export function AssignConditionsStep({
  reactions,
  selectedIds,
  assignments,
  onToggle,
  onToggleAll,
  onUpdateAssignment,
}: AssignConditionsStepProps) {
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  const allChecked = reactions.length > 0 && selectedIds.size === reactions.length;
  const someChecked = selectedIds.size > 0 && !allChecked;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someChecked;
    }
  }, [someChecked]);

  const validationMessages = validate(selectedIds, assignments);

  /** Auto-increment replicate number based on existing assignments with the same condition. */
  function getNextReplicate(condition: string, excludeId: number): number {
    let max = 0;
    for (const id of selectedIds) {
      if (id === excludeId) continue;
      const a = assignments.get(id);
      if (a && a.condition.trim() === condition.trim() && a.replicate > max) {
        max = a.replicate;
      }
    }
    return max + 1;
  }

  function handleConditionChange(reactionId: number, newCondition: string) {
    const existing = assignments.get(reactionId);
    const replicate =
      newCondition.trim()
        ? getNextReplicate(newCondition, reactionId)
        : existing?.replicate ?? 1;
    onUpdateAssignment(reactionId, {
      condition: newCondition,
      replicate,
    });
  }

  function handleReplicateChange(reactionId: number, newReplicate: number) {
    const existing = assignments.get(reactionId);
    onUpdateAssignment(reactionId, {
      condition: existing?.condition ?? '',
      replicate: newReplicate,
    });
  }

  if (reactions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <h3 className="text-sm font-medium text-muted-foreground">No reactions available</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          The selected peak calling run has no reactions.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        Select reactions and assign experimental conditions and replicate numbers for DiffBind
        analysis. Each condition needs at least 2 biological replicates.
      </p>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-primary/10">
              <th className="w-10 px-3 py-2">
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  checked={allChecked}
                  onChange={onToggleAll}
                  aria-label="Select all reactions"
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
              </th>
              <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Short Name
              </th>
              <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Condition <span className="text-red-500">*</span>
              </th>
              <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Replicate <span className="text-red-500">*</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {reactions.map((rxn) => {
              const isSelected = selectedIds.has(rxn.reaction_id);
              const assignment = assignments.get(rxn.reaction_id);
              return (
                <tr
                  key={rxn.reaction_id}
                  className={`border-b transition-colors ${
                    isSelected ? 'bg-primary/5' : 'hover:bg-muted'
                  }`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggle(rxn.reaction_id)}
                      aria-label={`Select ${rxn.short_name}`}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-foreground">{rxn.short_name}</td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={assignment?.condition ?? ''}
                      onChange={(e) => handleConditionChange(rxn.reaction_id, e.target.value)}
                      disabled={!isSelected}
                      placeholder="e.g. ctrl, mut"
                      className="w-full rounded-md border border-border px-2 py-1 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:bg-muted disabled:text-muted-foreground"
                    />
                  </td>
                  <td className="w-24 px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      value={assignment?.replicate ?? 1}
                      onChange={(e) =>
                        handleReplicateChange(rxn.reaction_id, Number(e.target.value) || 1)
                      }
                      disabled={!isSelected}
                      className="w-full rounded-md border border-border px-2 py-1 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:bg-muted disabled:text-muted-foreground"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-start justify-between">
        <p className="text-xs text-muted-foreground">
          {selectedIds.size} of {reactions.length} reaction{reactions.length !== 1 ? 's' : ''}{' '}
          selected
        </p>
        {validationMessages.length > 0 && (
          <div className="ml-4 space-y-0.5">
            {validationMessages.map((msg, i) => (
              <p key={i} className="text-xs text-amber-600">
                {msg}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
