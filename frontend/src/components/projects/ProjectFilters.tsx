// frontend/src/components/projects/ProjectFilters.tsx
import { useState, useMemo } from 'react';
import { CalendarIcon, ChevronDown, Search } from 'lucide-react';
import { startOfDay, endOfDay, startOfWeek, format } from 'date-fns';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/constants';
import { cn } from '@/lib/cn';
import { useFilterMembers } from '@/hooks/useProjects';
import type { ProjectFilters as ProjectFiltersType } from '@/api/projects';
import type { MemberUser } from '@/api/types';

const PROJECT_STATUSES = ['new', 'in_progress', 'complete', 'error', 'terminated'] as const;

type DateMode = '' | 'today' | 'this_week' | 'custom';

interface ProjectFiltersProps {
  initialFilters?: ProjectFiltersType;
  onApply: (filters: ProjectFiltersType) => void;
  onClear: () => void;
}

function displayName(member: MemberUser): string {
  if (member.firstName && member.lastName) return `${member.firstName} ${member.lastName}`;
  if (member.firstName) return member.firstName;
  return member.email;
}

export function ProjectFilters({ initialFilters, onApply, onClear }: ProjectFiltersProps) {
  const { data: fellowMembers } = useFilterMembers();

  // Staged filter state — only applied on "Apply Filter"
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(
    () => new Set(initialFilters?.statuses ?? []),
  );
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<number>>(
    () => new Set(initialFilters?.memberIds ?? []),
  );
  const [memberSearch, setMemberSearch] = useState('');
  const [dateMode, setDateMode] = useState<DateMode>(() => {
    if (initialFilters?.createdAfter || initialFilters?.createdBefore) return 'custom';
    return '';
  });
  const [customStart, setCustomStart] = useState<Date | undefined>(
    () => (initialFilters?.createdAfter ? new Date(initialFilters.createdAfter) : undefined),
  );
  const [customEnd, setCustomEnd] = useState<Date | undefined>(
    () => (initialFilters?.createdBefore ? new Date(initialFilters.createdBefore) : undefined),
  );

  const filteredMembers = useMemo(() => {
    if (!fellowMembers) return [];
    if (!memberSearch.trim()) return fellowMembers;
    const q = memberSearch.toLowerCase();
    return fellowMembers.filter((m) => displayName(m).toLowerCase().includes(q));
  }, [fellowMembers, memberSearch]);

  function toggleStatus(status: string) {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  function toggleMember(id: number) {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleApply() {
    const filters: ProjectFiltersType = {};

    if (selectedStatuses.size > 0) {
      filters.statuses = [...selectedStatuses];
    }

    if (selectedMemberIds.size > 0) {
      filters.memberIds = [...selectedMemberIds];
    }

    const now = new Date();
    if (dateMode === 'today') {
      filters.createdAfter = startOfDay(now).toISOString();
      filters.createdBefore = endOfDay(now).toISOString();
    } else if (dateMode === 'this_week') {
      filters.createdAfter = startOfWeek(now, { weekStartsOn: 0 }).toISOString();
      filters.createdBefore = endOfDay(now).toISOString();
    } else if (dateMode === 'custom') {
      if (customStart) filters.createdAfter = startOfDay(customStart).toISOString();
      if (customEnd) filters.createdBefore = endOfDay(customEnd).toISOString();
    }

    onApply(filters);
  }

  function handleClear() {
    setSelectedStatuses(new Set());
    setSelectedMemberIds(new Set());
    setMemberSearch('');
    setDateMode('');
    setCustomStart(undefined);
    setCustomEnd(undefined);
    onClear();
  }

  const hasFilters =
    selectedStatuses.size > 0 ||
    selectedMemberIds.size > 0 ||
    dateMode !== '';

  return (
    <Card>
      <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Projects Filters
      </h2>

      {/* Status Filter */}
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold uppercase tracking-wide text-foreground">
          Status
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 space-y-2">
            {PROJECT_STATUSES.map((status) => (
              <label key={status} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={selectedStatuses.has(status)}
                  onCheckedChange={() => toggleStatus(status)}
                />
                <span
                  className={cn('inline-block h-2 w-2 rounded-full', STATUS_COLORS[status])}
                />
                <span className="text-foreground">{STATUS_LABELS[status]}</span>
              </label>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Separator className="my-3" />

      {/* Members Filter */}
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold uppercase tracking-wide text-foreground">
          Members
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2">
            <div className="relative mb-2">
              <input
                type="text"
                placeholder="Search members..."
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="w-full rounded-md border border-input bg-background py-1.5 pl-7 pr-2 text-xs text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            </div>
            <ScrollArea className="max-h-36">
              <div className="space-y-2">
                {filteredMembers.map((member) => (
                  <label
                    key={member.id}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={selectedMemberIds.has(member.id)}
                      onCheckedChange={() => toggleMember(member.id)}
                    />
                    <span className="truncate text-foreground">{displayName(member)}</span>
                  </label>
                ))}
                {fellowMembers && fellowMembers.length === 0 && (
                  <span className="text-xs text-muted-foreground">No members found</span>
                )}
              </div>
            </ScrollArea>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Separator className="my-3" />

      {/* Created Filter */}
      <Collapsible defaultOpen>
        <CollapsibleTrigger className="flex w-full items-center justify-between py-1 text-xs font-semibold uppercase tracking-wide text-foreground">
          Created
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform [[data-state=open]>&]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 space-y-2">
            {(['today', 'this_week', 'custom'] as const).map((mode) => (
              <label key={mode} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="created-filter"
                  checked={dateMode === mode}
                  onChange={() => setDateMode(dateMode === mode ? '' : mode)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                <span className="text-foreground">
                  {mode === 'today' ? 'Today' : mode === 'this_week' ? 'This Week' : 'Custom'}
                </span>
              </label>
            ))}
            {dateMode === 'custom' && (
              <div className="mt-1 space-y-2 pl-5">
                <DatePickerField label="From" value={customStart} onChange={setCustomStart} />
                <DatePickerField label="To" value={customEnd} onChange={setCustomEnd} />
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Separator className="my-3" />

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={handleClear} disabled={!hasFilters}>
          Clear
        </Button>
        <Button size="sm" className="flex-1" onClick={handleApply} disabled={!hasFilters}>
          Apply
        </Button>
      </div>
    </Card>
  );
}

function DatePickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center justify-between rounded-md border border-input bg-background px-2 py-1.5 text-xs transition-colors hover:bg-muted/50',
            value ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {value ? format(value, 'MMM d, yyyy') : label}
          <CalendarIcon className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
