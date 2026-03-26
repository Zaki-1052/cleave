// frontend/src/lib/constants.ts

export const STATUS_COLORS: Record<string, string> = {
  new: 'bg-status-new',
  in_progress: 'bg-status-in-progress',
  complete: 'bg-status-complete',
  error: 'bg-status-error',
  terminated: 'bg-status-terminated',
  queued: 'bg-status-new',
  running: 'bg-status-in-progress',
};

export const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  in_progress: 'In Progress',
  complete: 'Complete',
  error: 'Error',
  terminated: 'Terminated',
  queued: 'Queued',
  running: 'Running',
};

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  contributor: 'Contributor',
  viewer: 'Viewer',
};

export const EMAIL_NOTIFICATION_OPTIONS = [
  { value: 'always', label: 'Always' },
  { value: 'on_error', label: 'On Error' },
  { value: 'never', label: 'Never' },
] as const;

export const ASSAY_TYPES = ['CUT&RUN', 'CUT&Tag'] as const;

export const ORGANISMS = ['Human', 'Mouse', 'Drosophila', 'Yeast'] as const;

export const CUTANA_SPIKE_IN_OPTIONS = ['None', 'KMetStat'] as const;

export const CUTANA_SPIKE_IN_TARGETS = [
  'Unmodified',
  'H3K4me1',
  'H3K4me2',
  'H3K4me3',
  'H3K9me1',
  'H3K9me2',
  'H3K9me3',
  'H3K27me1',
  'H3K27me2',
  'H3K27me3',
  'H3K36me1',
  'H3K36me2',
  'H3K36me3',
  'H4K20me1',
  'H4K20me2',
  'H4K20me3',
] as const;
