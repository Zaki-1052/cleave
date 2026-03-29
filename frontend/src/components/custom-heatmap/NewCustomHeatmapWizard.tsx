// frontend/src/components/custom-heatmap/NewCustomHeatmapWizard.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { WizardModal } from '@/components/ui/WizardModal';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/layout/Card';
import { ChooseBigWigSourceStep } from '@/components/ui/ChooseBigWigSourceStep';
import { useBigWigOutputs } from '@/components/ui/useBigWigOutputs';
import { SelectSamplesStep } from './SelectSamplesStep';
import { useCreateJob, useJobs } from '@/hooks/useJobs';
import { uploadBedFile } from '@/api/jobs';
import { resolveReactionBigwig, type BigWigSourceType } from '@/lib/bigwig-utils';
import type { AnalysisJob, Experiment } from '@/api/types';
import {
  HEATMAP_SORT_ORDERS,
  HEATMAP_COLOR_MAPS,
  HEATMAP_REFERENCE_POINTS,
} from '@/lib/constants';

interface NewCustomHeatmapWizardProps {
  isOpen: boolean;
  onClose: () => void;
  experiment: Experiment;
}

export interface HeatmapSample {
  reactionId: number;
  shortName: string;
  label: string;
  bigwigPath: string;
}

export function NewCustomHeatmapWizard({
  isOpen,
  onClose,
  experiment,
}: NewCustomHeatmapWizardProps) {
  const navigate = useNavigate();
  const createJobMutation = useCreateJob();

  // Fetch all jobs for this experiment
  const { data: jobsData } = useJobs(experiment.id, 1, 100);
  const allJobs: AnalysisJob[] = jobsData?.items ?? [];

  // Step tracking
  const [currentStep, setCurrentStep] = useState(0);

  // Step 1: Details
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');

  // Step 2: Choose BigWig Source (normalization or alignment)
  const [bigwigSource, setBigwigSource] = useState<BigWigSourceType>('alignment');
  const [selectedAlignmentJobId, setSelectedAlignmentJobId] = useState<number | null>(null);
  const [selectedNormalizationJobId, setSelectedNormalizationJobId] = useState<number | null>(null);

  // Step 3: Select Samples & BED
  const [samples, setSamples] = useState<HeatmapSample[]>([]);
  const [bedSource, setBedSource] = useState<'peak_calling' | 'upload'>('peak_calling');
  const [bedPath, setBedPath] = useState('');
  const [bedLabel, setBedLabel] = useState('');
  const [bedOutputId, setBedOutputId] = useState<number | null>(null);
  const [bedUploading, setBedUploading] = useState(false);

  // Step 4: Settings
  const [flankingUpstream, setFlankingUpstream] = useState(1500);
  const [flankingDownstream, setFlankingDownstream] = useState(1500);
  const [referencePoint, setReferencePoint] = useState('center');
  const [sortOrder, setSortOrder] = useState('descend');
  const [colorMap, setColorMap] = useState('');

  // Error
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch bigWig outputs based on selected source
  const { data: bigwigOutputs, fileCategory } = useBigWigOutputs(
    bigwigSource,
    selectedAlignmentJobId,
    selectedNormalizationJobId,
  );

  // Resolve the alignment job for reactions info
  const alignmentJob = allJobs.find(
    (j) => j.id === selectedAlignmentJobId && j.jobType === 'alignment',
  );
  const alignmentReactions: { reaction_id: number; short_name: string }[] =
    (alignmentJob?.params?.reactions as
      | { reaction_id: number; short_name: string }[]
      | undefined) ?? [];

  function resetState() {
    setCurrentStep(0);
    setName('');
    setNotes('');
    setBigwigSource('alignment');
    setSelectedAlignmentJobId(null);
    setSelectedNormalizationJobId(null);
    setSamples([]);
    setBedSource('peak_calling');
    setBedPath('');
    setBedLabel('');
    setBedOutputId(null);
    setBedUploading(false);
    setFlankingUpstream(1500);
    setFlankingDownstream(1500);
    setReferencePoint('center');
    setSortOrder('descend');
    setColorMap('');
    setSubmitError(null);
    createJobMutation.reset();
  }

  function handleClose() {
    resetState();
    onClose();
  }

  function handleSelectSource(
    source: BigWigSourceType,
    jobId: number,
    alignmentJobId: number,
  ) {
    setBigwigSource(source);
    if (source === 'normalization') {
      setSelectedNormalizationJobId(jobId);
      setSelectedAlignmentJobId(alignmentJobId);
    } else {
      setSelectedAlignmentJobId(jobId);
      setSelectedNormalizationJobId(null);
    }
    // Reset downstream state
    setSamples([]);
    setBedPath('');
    setBedLabel('');
    setBedOutputId(null);
  }

  async function handleBedUpload(file: File) {
    setBedUploading(true);
    try {
      const result = await uploadBedFile(experiment.id, file);
      setBedPath(result.path);
      setBedLabel(file.name);
      setBedOutputId(null);
    } catch {
      setSubmitError('Failed to upload BED file.');
    } finally {
      setBedUploading(false);
    }
  }

  function handleNext() {
    setSubmitError(null);

    if (currentStep === 0) {
      if (!name.trim()) return;
      setCurrentStep(1);
      return;
    }

    if (currentStep === 1) {
      if (selectedAlignmentJobId === null) return;
      // Auto-populate samples from alignment reactions
      if (samples.length === 0 && alignmentReactions.length > 0) {
        const bwOutputs = bigwigOutputs ?? [];
        const newSamples = alignmentReactions
          .filter((r) => !r.short_name.toLowerCase().includes('igg'))
          .map((r) => ({
            reactionId: r.reaction_id,
            shortName: r.short_name,
            label: r.short_name,
            bigwigPath: resolveReactionBigwig(r.reaction_id, bwOutputs, fileCategory),
          }));
        setSamples(newSamples);
      }
      setCurrentStep(2);
      return;
    }

    if (currentStep === 2) {
      if (samples.length === 0) return;
      if (!bedPath) return;
      setCurrentStep(3);
    }
  }

  function handleBack() {
    setCurrentStep((prev) => Math.max(0, prev - 1));
    setSubmitError(null);
  }

  function isNextDisabled(): boolean {
    if (currentStep === 0) return !name.trim();
    if (currentStep === 1) return selectedAlignmentJobId === null;
    if (currentStep === 2) return samples.length === 0 || !bedPath;
    return false;
  }

  function isSubmitDisabled(): boolean {
    if (samples.length === 0 || !bedPath) return true;
    if (flankingUpstream < 100 || flankingUpstream > 10000) return true;
    if (flankingDownstream < 100 || flankingDownstream > 10000) return true;
    return createJobMutation.isPending;
  }

  async function handleSubmit() {
    if (isSubmitDisabled()) return;
    setSubmitError(null);

    const parentJobId =
      bigwigSource === 'normalization'
        ? selectedNormalizationJobId
        : selectedAlignmentJobId;

    try {
      const params: Record<string, unknown> = {
        experiment_id: experiment.id,
        project_id: experiment.projectId,
        parent_job_id: parentJobId,
        alignment_job_id: selectedAlignmentJobId,
        bed_source: bedSource,
        bed_path: bedPath,
        bed_output_id: bedOutputId,
        bed_label: bedLabel || 'custom regions',
        samples: samples.map((s) => ({
          reaction_id: s.reactionId,
          short_name: s.shortName,
          label: s.label,
          bigwig_path: s.bigwigPath,
        })),
        flanking_upstream: flankingUpstream,
        flanking_downstream: flankingDownstream,
        reference_point: referencePoint,
        sort_order: sortOrder,
        color_map: colorMap || null,
        z_min: null,
        z_max: null,
      };

      if (bigwigSource === 'normalization' && selectedNormalizationJobId) {
        params.normalization_job_id = selectedNormalizationJobId;
      }

      const job = await createJobMutation.mutateAsync({
        experimentId: experiment.id,
        payload: {
          jobType: 'custom_heatmap',
          name: name.trim(),
          notes: notes.trim() || null,
          params,
          parentJobId: parentJobId,
        },
      });
      toast.success('Heatmap job queued');
      handleClose();
      navigate(`/experiments/${experiment.id}/heatmaps/${job.id}`);
    } catch {
      setSubmitError('Failed to create custom heatmap job. Please try again.');
    }
  }

  // --- Step content ---

  const detailsStep = (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <h3 className="mb-4 text-sm font-semibold uppercase text-gray-500">Heatmap Details</h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Heatmap Name <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 30))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="e.g., H3K4me3 summits heatmap"
              />
              <span className="text-xs text-gray-400">{name.length}/30</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Optional notes about this heatmap..."
            />
          </div>
        </div>
      </Card>
      <Card>
        <h3 className="mb-4 text-sm font-semibold uppercase text-gray-500">About</h3>
        <div className="space-y-3 text-sm text-gray-600">
          <div>
            <h4 className="font-medium text-gray-800">What are Custom Heatmaps?</h4>
            <p>
              Reference-point heatmaps show how signal from bigWig files is distributed around
              specific genomic regions (e.g., peak summits, enhancers, or custom regions of interest).
            </p>
          </div>
          <div>
            <h4 className="font-medium text-gray-800">What Does the Pipeline Do?</h4>
            <p>
              deepTools computeMatrix computes signal around reference points in the BED file,
              and plotHeatmap visualizes the result as a heatmap with one column per sample.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-gray-800">Outputs</h4>
            <p>
              Heatmap images (PNG + SVG), a deepTools matrix file (.gz) for recomputation,
              and a copy of the reference BED file used.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );

  const bigwigSourceStep = (
    <ChooseBigWigSourceStep
      experiment={experiment}
      bigwigSource={bigwigSource}
      selectedAlignmentJobId={selectedAlignmentJobId}
      selectedNormalizationJobId={selectedNormalizationJobId}
      onSelectSource={handleSelectSource}
      showResolutionWarning={true}
      alignmentWarningText="These bigWig files are at 20bp resolution. For best results on mouse, run Roman Normalization first. deepTools will handle any resolution for heatmaps."
    />
  );

  const settingsStep = (
    <div className="space-y-6">
      <Card>
        <h3 className="mb-4 text-sm font-semibold uppercase text-gray-500">
          deepTools Settings
        </h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Upstream Flanking (bp)
            </label>
            <input
              type="number"
              min={100}
              max={10000}
              step={100}
              value={flankingUpstream}
              onChange={(e) => setFlankingUpstream(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1 text-xs text-gray-400">Default: 1500 bp (lab standard)</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Downstream Flanking (bp)
            </label>
            <input
              type="number"
              min={100}
              max={10000}
              step={100}
              value={flankingDownstream}
              onChange={(e) => setFlankingDownstream(Number(e.target.value))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1 text-xs text-gray-400">Default: 1500 bp (lab standard)</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Reference Point</label>
            <select
              value={referencePoint}
              onChange={(e) => setReferencePoint(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {HEATMAP_REFERENCE_POINTS.map((rp) => (
                <option key={rp.value} value={rp.value}>
                  {rp.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Sort Order</label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {HEATMAP_SORT_ORDERS.map((so) => (
                <option key={so.value} value={so.value}>
                  {so.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">Color Map</label>
            <select
              value={colorMap}
              onChange={(e) => setColorMap(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {HEATMAP_COLOR_MAPS.map((cm) => (
                <option key={cm.value} value={cm.value}>
                  {cm.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>
      <Card>
        <h3 className="mb-3 text-sm font-semibold uppercase text-gray-500">Summary</h3>
        <div className="space-y-1 text-sm text-gray-600">
          <p><strong>BED:</strong> {bedLabel || '(none)'}</p>
          <p><strong>Samples:</strong> {samples.length}</p>
          <p>
            <strong>Labels:</strong>{' '}
            {samples.map((s) => s.label).join(', ') || '(none)'}
          </p>
          <p>
            <strong>Window:</strong> {flankingUpstream} bp upstream, {flankingDownstream} bp downstream
          </p>
        </div>
      </Card>
    </div>
  );

  const steps = [
    { label: 'Details', content: detailsStep },
    { label: 'BigWig Source', content: bigwigSourceStep },
    {
      label: 'Samples & BED',
      content: (
        <SelectSamplesStep
          experiment={experiment}
          alignmentJobId={selectedAlignmentJobId}
          reactions={alignmentReactions}
          alignmentOutputs={bigwigOutputs ?? []}
          samples={samples}
          setSamples={setSamples}
          bedSource={bedSource}
          setBedSource={setBedSource}
          bedPath={bedPath}
          setBedPath={setBedPath}
          bedLabel={bedLabel}
          setBedLabel={setBedLabel}
          bedOutputId={bedOutputId}
          setBedOutputId={setBedOutputId}
          bedUploading={bedUploading}
          onBedUpload={handleBedUpload}
          fileCategory={fileCategory}
        />
      ),
    },
    { label: 'Settings', content: settingsStep },
  ];

  return (
    <WizardModal
      isOpen={isOpen}
      onClose={handleClose}
      title="New Custom Heatmap"
      steps={steps}
      currentStep={currentStep}
      onNext={handleNext}
      onBack={handleBack}
      onSubmit={handleSubmit}
      submitLabel="Start Heatmap"
      maxWidth="max-w-5xl"
      renderFooter={({ currentStep: step, onClose: close, onBack: back }) => (
        <div className="flex flex-col border-t">
          {submitError && (
            <div className="bg-red-50 px-6 py-2 text-sm text-red-600">{submitError}</div>
          )}
          <div className="flex items-center justify-between px-6 py-4">
            <button onClick={close} className="text-sm text-gray-500 hover:text-gray-700">
              Cancel
            </button>
            <div className="flex gap-3">
              {step > 0 && (
                <Button variant="outlined" onClick={back}>
                  Back
                </Button>
              )}
              {step === 3 ? (
                <Button onClick={handleSubmit} disabled={isSubmitDisabled()}>
                  {createJobMutation.isPending ? 'Starting...' : 'Start Heatmap'}
                </Button>
              ) : (
                <Button onClick={handleNext} disabled={isNextDisabled()}>
                  Next
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    />
  );
}
