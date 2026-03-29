// frontend/src/components/fastqs/FastqcReportModal.tsx
import { useEffect, useRef, useState } from 'react';
import { Download, Maximize2, Minimize2, X } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
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

      <div className={`relative z-10 flex flex-col bg-card shadow-xl ${modalSizeClasses}`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b bg-primary px-6 py-4">
          <h2 className="text-lg font-semibold text-white">FASTQC Report</h2>
          <button onClick={onClose} className="text-white hover:text-gray-200" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 border-b px-4 py-2">
          <Button variant="outlined" onClick={handleDownload}>
            <Download className="mr-1.5 h-4 w-4" />
            Download Report
          </Button>
          <Button
            variant="outlined"
            onClick={() => setIsFullScreen((prev) => !prev)}
          >
            {isFullScreen ? (
              <Minimize2 className="mr-1.5 h-4 w-4" />
            ) : (
              <Maximize2 className="mr-1.5 h-4 w-4" />
            )}
            {isFullScreen ? 'Exit Full Screen' : 'Full Screen'}
          </Button>
          <span className="ml-auto text-xs text-muted-foreground truncate max-w-xs" title={filename}>
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
              <Spinner size="lg" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
