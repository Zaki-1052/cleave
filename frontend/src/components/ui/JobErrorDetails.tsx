// frontend/src/components/ui/JobErrorDetails.tsx — error surface for a failed job:
// message block plus an on-demand pipeline-log tail (terminal-styled in both themes).
import { useState } from 'react';
import { AlertCircle, ChevronRight, Copy } from 'lucide-react';
import type { AnalysisJob } from '@/api/types';
import { useJobLogTail } from '@/hooks/useJobs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './collapsible';
import { Spinner } from './Spinner';
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
    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4">
      <div className="mb-2 flex items-center gap-2">
        <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
        <h4 className="text-sm font-semibold text-destructive">Error Details</h4>
      </div>

      {job.errorMessage && (
        <div className="mb-3">
          <div className="flex items-start justify-between gap-2">
            <pre className="max-h-40 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md border border-destructive/20 bg-card/60 p-3 font-mono text-xs text-destructive">
              {job.errorMessage}
            </pre>
            <button
              type="button"
              onClick={() => copyText(job.errorMessage!)}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-destructive transition-colors duration-150 hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="Copy error message"
            >
              <Copy className="h-3 w-3" />
              Copy
            </button>
          </div>
        </div>
      )}

      <Collapsible open={showLog} onOpenChange={setShowLog}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-destructive transition-colors duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', showLog && 'rotate-90')} />
          {showLog ? 'Hide Pipeline Log' : 'Show Pipeline Log (last 50 lines)'}
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-2">
            {logLoading && (
              <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                <Spinner size="sm" />
                Loading log…
              </div>
            )}
            {logData && logData.logTail ? (
              <div className="flex items-start justify-between gap-2">
                <pre className="terminal-block max-h-64 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md p-3 font-mono text-xs">
                  {logData.logTail}
                </pre>
                <button
                  type="button"
                  onClick={() => copyText(logData.logTail)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-destructive transition-colors duration-150 hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
