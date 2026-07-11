// frontend/src/components/trimming/FastpReportModal.tsx
import { useEffect, useRef, useState } from 'react';
import { Download, Maximize2, Minimize2, X } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { getOutputSignedUrl } from '@/api/jobs';

interface FastpReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: number;
  outputId: number | null;
  filename: string;
}

export function FastpReportModal({
  isOpen,
  onClose,
  jobId,
  outputId,
  filename,
}: FastpReportModalProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!isOpen || outputId === null) return;
    setSignedUrl(null);
    getOutputSignedUrl(jobId, outputId)
      .then((resp) => setSignedUrl(resp.url))
      .catch(() => setSignedUrl(null));
  }, [isOpen, jobId, outputId]);

  if (!isOpen || outputId === null) return null;

  function handleDownload() {
    if (signedUrl) window.open(signedUrl, '_blank');
  }

  const modalSizeClasses = isFullScreen
    ? 'h-screen w-screen max-w-none rounded-none'
    : 'h-[90vh] w-[95vw] max-w-7xl rounded-lg';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-overlay/60" onClick={onClose} />

      <div className={`relative z-10 flex flex-col bg-card shadow-xl ${modalSizeClasses}`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-4">
          <h2 className="font-display text-xl font-semibold text-foreground">fastp Report</h2>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-2">
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
          <span className="ml-auto max-w-xs truncate font-mono text-xs text-muted-foreground" title={filename}>
            {filename}
          </span>
        </div>

        {/* Report iframe */}
        <div className="flex-1 overflow-hidden">
          {signedUrl ? (
            <iframe
              ref={iframeRef}
              src={`${signedUrl}&display=inline`}
              title={`fastp Report for ${filename}`}
              className="h-full w-full border-0"
              sandbox="allow-same-origin allow-scripts"
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
