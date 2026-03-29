// frontend/src/components/ui/JobErrorDetails.tsx
import { useState } from 'react';
import { AlertCircle, ChevronRight, Copy } from 'lucide-react';
import type { AnalysisJob } from '@/api/types';
import { useJobLogTail } from '@/hooks/useJobs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './collapsible';
import { cn } from '@/lib/cn';

interface Props {
  job: AnalysisJob;
}

export default function JobErrorDetails({ job }: Props) {
  const [showLog, setShowLog] = useState(false);
  const { data: logData, isLoading: logLoading } = useJobLogTail(
    job.id,
    showLog,
  );

  if (job.status !== 'error' && !job.errorMessage) return null;

  const copyText = (text: string) => {
    void navigator.clipboard.writeText(text);
  };

  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
      <div className="mb-2 flex items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
        <h4 className="text-sm font-semibold text-red-800 dark:text-red-200">Error Details</h4>
      </div>

      {job.errorMessage && (
        <div className="mb-3">
          <div className="flex items-start justify-between gap-2">
            <pre className="max-h-40 flex-1 overflow-auto whitespace-pre-wrap break-words rounded bg-red-100 p-3 font-mono text-xs text-red-900 dark:bg-red-900/30 dark:text-red-200">
              {job.errorMessage}
            </pre>
            <button
              type="button"
              onClick={() => copyText(job.errorMessage!)}
              className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/30"
              title="Copy error message"
            >
              <Copy className="h-3 w-3" />
              Copy
            </button>
          </div>
        </div>
      )}

      <Collapsible open={showLog} onOpenChange={setShowLog}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-900 dark:text-red-300 dark:hover:text-red-100">
          <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', showLog && 'rotate-90')} />
          {showLog ? 'Hide Pipeline Log' : 'Show Pipeline Log (last 50 lines)'}
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-2">
            {logLoading && (
              <p className="text-xs text-muted-foreground">Loading log...</p>
            )}
            {logData && logData.logTail ? (
              <div className="flex items-start justify-between gap-2">
                <pre className="max-h-64 flex-1 overflow-auto whitespace-pre-wrap break-words rounded bg-gray-900 p-3 font-mono text-xs text-gray-200">
                  {logData.logTail}
                </pre>
                <button
                  type="button"
                  onClick={() => copyText(logData.logTail)}
                  className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/30"
                  title="Copy log"
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </button>
              </div>
            ) : (
              !logLoading && (
                <p className="text-xs text-muted-foreground">No pipeline log available.</p>
              )
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
