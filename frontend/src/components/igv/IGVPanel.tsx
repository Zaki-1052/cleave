// frontend/src/components/igv/IGVPanel.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import type { AnalysisJob, JobOutput, Reaction } from '@/api/types';
import { Card } from '@/components/layout/Card';
import { SelectReactionsModal } from '@/components/igv/SelectReactionsModal';
import { useJobOutputs } from '@/hooks/useJobs';
import { useReactions } from '@/hooks/useReactions';
import { useIGVTracks } from '@/hooks/useIGVTracks';
import { GENOME_DISPLAY_NAMES } from '@/lib/constants';
import type { Browser } from 'igv';

const TRACK_COLORS = [
  'rgb(70, 130, 180)',
  'rgb(60, 179, 113)',
  'rgb(186, 85, 211)',
  'rgb(255, 140, 0)',
  'rgb(220, 20, 60)',
  'rgb(0, 128, 128)',
  'rgb(139, 69, 19)',
  'rgb(75, 0, 130)',
];

interface IGVPanelProps {
  job: AnalysisJob;
  experimentId: number;
  mode: 'alignment' | 'peak_calling';
}

function getPeakTrackFormat(job: AnalysisJob): string {
  const peakCaller = job.params.peak_caller as string;
  const peakSize = job.params.peak_size as string;
  if (peakCaller === 'MACS2') {
    return peakSize === 'narrow' ? 'narrowPeak' : 'broadPeak';
  }
  return 'bed';
}

export function IGVPanel({ job, experimentId, mode }: IGVPanelProps) {
  const [selectedReactionIds, setSelectedReactionIds] = useState<Set<number>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const browserRef = useRef<Browser | null>(null);
  const prevTokensRef = useRef<string>('');

  const genome = job.params.reference_genome as string;

  // Fetch reactions for this experiment
  const { data: reactionsData } = useReactions(experimentId);
  const reactionsItems = reactionsData?.items;
  const allReactions = useMemo(() => reactionsItems ?? [], [reactionsItems]);

  // Fetch bigWig outputs — for alignment mode from this job, for peak calling from parent
  const bigWigJobId = mode === 'peak_calling' ? job.parentJobId : job.id;
  const { data: bigWigOutputs } = useJobOutputs(bigWigJobId, 'smoothed_bigwig');

  // Fetch BED outputs — only for peak calling mode
  const { data: bedOutputs } = useJobOutputs(
    mode === 'peak_calling' ? job.id : null,
    'bed',
  );

  // Only show reactions that have output files
  const availableReactions = useMemo(() => {
    if (!bigWigOutputs) return [];
    const reactionIdsWithOutputs = new Set(
      bigWigOutputs.filter((o) => o.reactionId !== null).map((o) => o.reactionId!),
    );
    return allReactions.filter((r) => reactionIdsWithOutputs.has(r.id));
  }, [allReactions, bigWigOutputs]);

  // Build the list of output IDs to request tokens for
  const selectedOutputIds = useMemo(() => {
    if (selectedReactionIds.size === 0) return [];
    const ids: number[] = [];
    if (bigWigOutputs) {
      for (const o of bigWigOutputs) {
        if (o.reactionId !== null && selectedReactionIds.has(o.reactionId)) {
          ids.push(o.id);
        }
      }
    }
    if (bedOutputs) {
      for (const o of bedOutputs) {
        if (o.reactionId !== null && selectedReactionIds.has(o.reactionId)) {
          ids.push(o.id);
        }
      }
    }
    return ids;
  }, [selectedReactionIds, bigWigOutputs, bedOutputs]);

  // Fetch signed URLs for selected outputs
  const tokenJobId = selectedOutputIds.length > 0 ? job.id : null;
  const { data: tokens, refetch: refetchTokens } = useIGVTracks(tokenJobId, selectedOutputIds);

  // Build track configs from tokens and outputs
  const buildTracks = useCallback(() => {
    if (!tokens || !bigWigOutputs) return [];

    const reactionMap = new Map<number, Reaction>();
    for (const r of allReactions) {
      reactionMap.set(r.id, r);
    }

    const outputMap = new Map<number, JobOutput>();
    if (bigWigOutputs) {
      for (const o of bigWigOutputs) outputMap.set(o.id, o);
    }
    if (bedOutputs) {
      for (const o of bedOutputs) outputMap.set(o.id, o);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tracks: any[] = [];
    let colorIdx = 0;

    // Signal tracks (smoothed bigWigs)
    for (const [outputIdStr, url] of Object.entries(tokens)) {
      const outputId = Number(outputIdStr);
      const output = outputMap.get(outputId);
      if (!output || output.fileCategory !== 'smoothed_bigwig') continue;
      const reaction = output.reactionId ? reactionMap.get(output.reactionId) : null;
      const label = reaction ? `${job.name}-${reaction.shortName}` : output.filename;

      tracks.push({
        name: label,
        url,
        type: 'wig',
        format: 'bigwig',
        height: 100,
        autoscale: true,
        autoscaleGroup: 'signal',
        color: TRACK_COLORS[colorIdx % TRACK_COLORS.length],
      });
      colorIdx++;
    }

    // Peak tracks (BED files, peak calling mode only)
    if (mode === 'peak_calling') {
      for (const [outputIdStr, url] of Object.entries(tokens)) {
        const outputId = Number(outputIdStr);
        const output = outputMap.get(outputId);
        if (!output || output.fileCategory !== 'bed') continue;
        const reaction = output.reactionId ? reactionMap.get(output.reactionId) : null;
        const label = reaction
          ? `${job.name}-${reaction.shortName} Peaks`
          : `${output.filename} Peaks`;

        tracks.push({
          name: label,
          url,
          type: 'annotation',
          format: getPeakTrackFormat(job),
          displayMode: 'EXPANDED',
          height: 40,
          color: 'rgb(150, 0, 0)',
        });
      }
    }

    return tracks;
  }, [tokens, bigWigOutputs, bedOutputs, allReactions, job, mode]);

  // IGV.js browser lifecycle
  useEffect(() => {
    if (!containerRef.current || !tokens || selectedReactionIds.size === 0) return;

    const tokensKey = JSON.stringify(tokens);
    // Skip if tokens haven't changed (prevents unnecessary recreation)
    if (tokensKey === prevTokensRef.current && browserRef.current) return;
    prevTokensRef.current = tokensKey;

    let cancelled = false;

    async function initBrowser() {
      // Dynamic import keeps igv.js out of the main bundle
      const { default: igv } = await import('igv');

      if (cancelled || !containerRef.current) return;

      // Remove existing browser
      if (browserRef.current) {
        igv.removeBrowser(browserRef.current);
        browserRef.current = null;
      }

      const tracks = buildTracks();
      if (tracks.length === 0) return;

      const browser = await igv.createBrowser(containerRef.current, {
        genome,
        tracks,
        showNavigation: true,
      });

      if (cancelled) {
        igv.removeBrowser(browser);
        return;
      }

      browserRef.current = browser;
    }

    void initBrowser();

    return () => {
      cancelled = true;
    };
  }, [tokens, selectedReactionIds, genome, buildTracks]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (browserRef.current) {
        import('igv').then(({ default: igv }) => {
          if (browserRef.current) {
            igv.removeBrowser(browserRef.current);
            browserRef.current = null;
          }
        });
      }
    };
  }, []);

  // Full screen change handler
  useEffect(() => {
    function onFullScreenChange() {
      setIsFullScreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', onFullScreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullScreenChange);
  }, []);

  function handleRefresh() {
    prevTokensRef.current = ''; // Force recreation
    void refetchTokens();
  }

  function handleFullScreen() {
    if (!wrapperRef.current) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void wrapperRef.current.requestFullscreen();
    }
  }

  const genomeLabel = GENOME_DISPLAY_NAMES[genome] ?? genome;
  const hasSelections = selectedReactionIds.size > 0;

  return (
    <div ref={wrapperRef} className={isFullScreen ? 'bg-white p-4' : ''}>
      <Card>
        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {/* Reference Genome (read-only) */}
          <div className="flex items-center gap-2">
            <label className="font-display text-xs font-semibold uppercase tracking-wide text-gray-500">
              Reference Genome
            </label>
            <span className="rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700">
              {genomeLabel}
            </span>
          </div>

          <div className="flex-1" />

          {/* Select Reactions */}
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-primary px-4 py-1.5 text-sm font-medium text-primary hover:bg-primary/5"
          >
            + Select Reactions
            {hasSelections && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-white">
                {selectedReactionIds.size}
              </span>
            )}
          </button>

          {/* Refresh */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={!hasSelections}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>

          {/* Full Screen */}
          <button
            type="button"
            onClick={handleFullScreen}
            disabled={!hasSelections}
            className="flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            title="Full Screen"
          >
            {isFullScreen ? <Minimize2 className="mr-1.5 h-4 w-4" /> : <Maximize2 className="mr-1.5 h-4 w-4" />}
            {isFullScreen ? 'Exit Full Screen' : 'Full Screen'}
          </button>
        </div>

        {/* IGV Browser or Placeholder */}
        {hasSelections ? (
          <div ref={containerRef} className="min-h-[400px] rounded border border-gray-200" />
        ) : (
          <div className="flex items-center justify-center rounded border border-dashed border-gray-300 py-20">
            <p className="text-sm text-gray-400">
              Please select Reference Genome and Reactions to render IGV...
            </p>
          </div>
        )}
      </Card>

      <SelectReactionsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        reactions={availableReactions}
        selectedIds={selectedReactionIds}
        onApply={setSelectedReactionIds}
      />
    </div>
  );
}
