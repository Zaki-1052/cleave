// frontend/src/components/fastqs/FastqcReportModal.tsx
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { getFastqcSignedUrl } from '@/api/fastqs';

interface FastqcReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  experimentId: number;
  fastqId: number | null;
  filename: string;
}

export function FastqcReportModal({
  isOpen,
  onClose,
  experimentId,
  fastqId,
  filename,
}: FastqcReportModalProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!isOpen || fastqId === null) return;
    setSignedUrl(null);
    getFastqcSignedUrl(experimentId, fastqId)
      .then(setSignedUrl)
      .catch(() => setSignedUrl(null));
  }, [isOpen, experimentId, fastqId]);

  if (!isOpen || fastqId === null) return null;

  function handleDownload() {
    if (signedUrl) window.open(signedUrl, '_blank');
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

        {/* Report iframe */}
        <div className="flex-1 overflow-hidden">
          {signedUrl ? (
            <iframe
              ref={iframeRef}
              src={`${signedUrl}&display=inline`}
              title={`FastQC Report for ${filename}`}
              className="h-full w-full border-0"
              sandbox="allow-same-origin"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
