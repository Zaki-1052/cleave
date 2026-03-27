// frontend/src/components/fastqs/FastqcReportModal.tsx
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { getFastqcReportUrl } from '@/api/fastqs';
import { useFastqcSummary } from '@/hooks/useFastqs';

interface FastqcReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  experimentId: number;
  fastqId: number | null;
  filename: string;
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'pass') {
    return (
      <svg className="h-4 w-4 shrink-0 text-status-complete" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  if (status === 'fail') {
    return (
      <svg className="h-4 w-4 shrink-0 text-status-error" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function FastqcReportModal({
  isOpen,
  onClose,
  experimentId,
  fastqId,
  filename,
}: FastqcReportModalProps) {
  const { data: summary, isLoading } = useFastqcSummary(experimentId, fastqId);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  if (!isOpen || fastqId === null) return null;

  const reportUrl = getFastqcReportUrl(experimentId, fastqId);

  function handleModuleClick(index: number) {
    try {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.location.hash = `#M${index}`;
      }
    } catch {
      // Cross-origin fallback: reload with fragment
      if (iframeRef.current) {
        iframeRef.current.src = `${reportUrl}#M${index}`;
      }
    }
  }

  function handleDownload() {
    window.open(reportUrl, '_blank');
  }

  const modalSizeClasses = isFullScreen
    ? 'h-screen w-screen max-w-none rounded-none'
    : 'h-[90vh] w-[95vw] max-w-7xl rounded-lg';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      <div className={`relative z-10 flex flex-col bg-white shadow-xl ${modalSizeClasses}`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-primary px-6 py-4">
          <h2 className="text-lg font-semibold text-white">FASTQC Report</h2>
          <button onClick={onClose} className="text-white hover:text-gray-200">
            ✕
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 border-b px-4 py-2">
          <Button variant="outlined" onClick={handleDownload}>
            <span className="flex items-center gap-1">
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
              Download Report
            </span>
          </Button>
          <Button
            variant="outlined"
            onClick={() => setIsFullScreen((prev) => !prev)}
          >
            <span className="flex items-center gap-1">
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 110-2h4a1 1 0 011 1v4a1 1 0 11-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 112 0v1.586l2.293-2.293a1 1 0 011.414 1.414L6.414 15H8a1 1 0 110 2H4a1 1 0 01-1-1v-4zm13 3a1 1 0 01-1 1h-4a1 1 0 110-2h1.586l-2.293-2.293a1 1 0 011.414-1.414L15 13.586V12a1 1 0 112 0v4z"
                  clipRule="evenodd"
                />
              </svg>
              {isFullScreen ? 'Exit Full Screen' : 'Full Screen'}
            </span>
          </Button>
          <span className="ml-auto text-xs text-gray-400 truncate max-w-xs" title={filename}>
            {filename}
          </span>
        </div>

        {/* Main content: sidebar + iframe */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-56 shrink-0 overflow-y-auto border-r bg-gray-50 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Summary
            </h3>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 11 }).map((_, i) => (
                  <div key={i} className="h-5 animate-pulse rounded bg-gray-200" />
                ))}
              </div>
            ) : (
              <ul className="space-y-0.5">
                {summary?.moduleSummaries.map((mod, index) => (
                  <li key={mod.name}>
                    <button
                      type="button"
                      onClick={() => handleModuleClick(index)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-gray-100"
                    >
                      <StatusIcon status={mod.status} />
                      <span className="truncate">{mod.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Report iframe */}
          <iframe
            ref={iframeRef}
            src={reportUrl}
            title={`FastQC Report for ${filename}`}
            className="flex-1 border-0"
            sandbox="allow-same-origin"
          />
        </div>
      </div>
    </div>
  );
}
