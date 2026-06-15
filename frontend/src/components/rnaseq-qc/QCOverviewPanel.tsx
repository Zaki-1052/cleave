// frontend/src/components/rnaseq-qc/QCOverviewPanel.tsx
import { useEffect, useState } from 'react';
import { Download, Maximize2, Minimize2 } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/layout/Card';
import { getOutputSignedUrl } from '@/api/jobs';
import { useRnaseqQCDashboardReport } from '@/hooks/useJobs';

interface QCOverviewPanelProps {
  jobId: number;
}

export function QCOverviewPanel({ jobId }: QCOverviewPanelProps) {
  const { data: report, isLoading: reportLoading } = useRnaseqQCDashboardReport(jobId);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [urlLoading, setUrlLoading] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const multiqcOutputId = report?.multiqcOutputId ?? null;

  useEffect(() => {
    if (multiqcOutputId === null) return;
    setUrlLoading(true);
    setSignedUrl(null);
    getOutputSignedUrl(jobId, multiqcOutputId)
      .then((resp) => setSignedUrl(resp.url))
      .catch(() => setSignedUrl(null))
      .finally(() => setUrlLoading(false));
  }, [jobId, multiqcOutputId]);

  if (reportLoading) {
    return (
      <Card>
        <div className="flex h-40 items-center justify-center">
          <Spinner size="lg" />
        </div>
      </Card>
    );
  }

  if (multiqcOutputId === null) {
    return (
      <Card>
        <p className="text-sm text-muted-foreground">
          MultiQC report not available for this job.
        </p>
      </Card>
    );
  }

  function handleDownload() {
    if (signedUrl) window.open(signedUrl, '_blank');
  }

  if (isFullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-card">
        <div className="flex items-center gap-3 border-b px-4 py-2">
          <span className="font-display text-sm font-semibold">MultiQC Report</span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outlined" onClick={handleDownload} disabled={!signedUrl}>
              <Download className="mr-1.5 h-4 w-4" />
              Download
            </Button>
            <Button variant="outlined" onClick={() => setIsFullScreen(false)}>
              <Minimize2 className="mr-1.5 h-4 w-4" />
              Exit Full Screen
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {signedUrl ? (
            <iframe
              src={`${signedUrl}&display=inline`}
              title="MultiQC Report"
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
    );
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold uppercase text-muted-foreground">
          MultiQC Report
        </h3>
        <div className="flex items-center gap-2">
          <Button variant="outlined" onClick={handleDownload} disabled={!signedUrl} className="text-xs">
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download
          </Button>
          <Button variant="outlined" onClick={() => setIsFullScreen(true)} className="text-xs">
            <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
            Full Screen
          </Button>
        </div>
      </div>
      <div className="h-[600px] overflow-hidden rounded-md border border-border">
        {urlLoading || !signedUrl ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <iframe
            src={`${signedUrl}&display=inline`}
            title="MultiQC Report"
            className="h-full w-full border-0"
            sandbox="allow-same-origin allow-scripts"
          />
        )}
      </div>
    </Card>
  );
}
