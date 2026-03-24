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

export const ASSAY_TYPES = ['CUT&RUN', 'CUT&Tag'] as const;

export const ORGANISMS = ['Human', 'Mouse', 'Drosophila', 'Yeast'] as const;
