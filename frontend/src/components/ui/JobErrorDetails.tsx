// frontend/src/components/ui/JobErrorDetails.tsx
import { useState } from 'react';
import type { AnalysisJob } from '@/api/types';
import { useJobLogTail } from '@/hooks/useJobs';

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
    <div className="rounded-md border border-red-200 bg-red-50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
        <h4 className="text-sm font-semibold text-red-800">Error Details</h4>
      </div>

      {job.errorMessage && (
        <div className="mb-3">
          <div className="flex items-start justify-between gap-2">
            <pre className="max-h-40 flex-1 overflow-auto whitespace-pre-wrap break-words rounded bg-red-100 p-3 font-mono text-xs text-red-900">
              {job.errorMessage}
            </pre>
            <button
              type="button"
              onClick={() => copyText(job.errorMessage!)}
              className="shrink-0 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-100"
              title="Copy error message"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setShowLog(!showLog)}
          className="text-xs font-medium text-red-700 hover:text-red-900"
        >
          {showLog ? '▾ Hide Pipeline Log' : '▸ Show Pipeline Log (last 50 lines)'}
        </button>

        {showLog && (
          <div className="mt-2">
            {logLoading && (
              <p className="text-xs text-gray-500">Loading log...</p>
            )}
            {logData && logData.logTail ? (
              <div className="flex items-start justify-between gap-2">
                <pre className="max-h-64 flex-1 overflow-auto whitespace-pre-wrap break-words rounded bg-gray-900 p-3 font-mono text-xs text-gray-200">
                  {logData.logTail}
                </pre>
                <button
                  type="button"
                  onClick={() => copyText(logData.logTail)}
                  className="shrink-0 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-100"
                  title="Copy log"
                >
                  Copy
                </button>
              </div>
            ) : (
              !logLoading && (
                <p className="text-xs text-gray-500">No pipeline log available.</p>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
