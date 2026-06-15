// frontend/src/components/rnaseq-pathway/NewPathwayWizard.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { WizardModal } from '@/components/ui/WizardModal';
import { Spinner } from '@/components/ui/Spinner';
import { Input } from '@/components/ui/Input';
import { PATHWAY_GENE_LIST_OPTIONS } from '@/lib/constants';
import { useCreateJob, useJobs, useJobOutputs } from '@/hooks/useJobs';
import type { AnalysisJob, Experiment } from '@/api/types';

interface NewPathwayWizardProps {
  isOpen: boolean;
  onClose: () => void;
  experiment: Experiment;
  isTrainingProject?: boolean;
}

export function NewPathwayWizard({
  isOpen,
  onClose,
  experiment,
  isTrainingProject = false,
}: NewPathwayWizardProps) {
  const navigate = useNavigate();
  const createJobMutation = useCreateJob();

  const { data: jobsData, isLoading: jobsLoading } = useJobs(experiment.id, 1, 100);
  const deJobs = (jobsData?.items ?? []).filter(
    (j: AnalysisJob) => j.jobType === 'rnaseq_de' && j.status === 'complete',
  );

  const [currentStep, setCurrentStep] = useState(0);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedDeJobId, setSelectedDeJobId] = useState<number | null>(null);
  const selectedDeJob = deJobs.find((j: AnalysisJob) => j.id === selectedDeJobId);
  const [geneListSource, setGeneListSource] = useState(isTrainingProject ? '' : 'both');
  const [fdrThreshold, setFdrThreshold] = useState(0.05);
  const [enableGsea, setEnableGsea] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: deOutputs } = useJobOutputs(selectedDeJobId);
  const referenceGenome = String(selectedDeJob?.params?.reference_genome ?? '');

  function handleClose() {
    setCurrentStep(0);
    setName('');
    setNotes('');
    setSelectedDeJobId(null);
    setGeneListSource(isTrainingProject ? '' : 'both');
    setFdrThreshold(0.05);
    setEnableGsea(false);
    setSubmitError(null);
    onClose();
  }

  function handleNext() {
    setSubmitError(null);
    if (currentStep === 0) {
      if (!name.trim()) return;
      setCurrentStep(1);
      return;
    }
    if (currentStep === 1) {
      if (selectedDeJobId === null) return;
      setCurrentStep(2);
    }
  }

  function handleBack() {
    setCurrentStep((prev) => Math.max(0, prev - 1));
    setSubmitError(null);
  }

  async function handleSubmit() {
    if (selectedDeJobId === null) {
      setSubmitError('Please select a DE analysis job.');
      return;
    }
    if (!geneListSource) {
      setSubmitError('Please select a gene list source.');
      return;
    }

    const deResultsOutput = (deOutputs ?? []).find(
      (o) => o.fileCategory === 'de_results',
    );
    if (!deResultsOutput?.filePath) {
      setSubmitError('Could not resolve DE results path from selected job.');
      return;
    }

    setSubmitError(null);
    try {
      const job = await createJobMutation.mutateAsync({
        experimentId: experiment.id,
        payload: {
          jobType: 'rnaseq_pathway',
          name: name.trim(),
          notes: notes.trim() || null,
          params: {
            experiment_id: experiment.id,
            project_id: experiment.projectId,
            de_job_id: selectedDeJobId,
            reference_genome: referenceGenome,
            gene_list_source: geneListSource,
            fdr_threshold: fdrThreshold,
            enable_gsea: enableGsea,
            de_results_path: deResultsOutput.filePath,
          },
          parentJobId: selectedDeJobId,
        },
      });
      toast.success('Pathway analysis job queued');
      handleClose();
      navigate(`/experiments/${experiment.id}/pathway/${job.id}`);
    } catch {
      setSubmitError('Failed to create pathway analysis job. Please try again.');
    }
  }

  const steps = [
    {
      label: 'Details',
      content: (
        <div className="space-y-4">
          <Input
            label="Analysis Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Pathway analysis — ctrl vs mut"
            maxLength={30}
          />
          <div>
            <label htmlFor="pathway-notes" className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notes
            </label>
            <textarea
              id="pathway-notes"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes..."
            />
          </div>
          <div className="rounded-md border border-border bg-muted/50 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground mb-1">About Pathway Analysis</p>
            <p>
              Gene ontology (GO) enrichment and KEGG pathway analysis using clusterProfiler.
              Identifies biological processes, molecular functions, cellular components, and
              signaling pathways enriched in your differentially expressed genes. Requires a
              completed DE Analysis (DESeq2) job.
            </p>
          </div>
        </div>
      ),
    },
    {
      label: 'Choose DE Analysis',
      content: jobsLoading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : deJobs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No completed DE analysis jobs found. Run a DESeq2 analysis first.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground mb-3">
            Select the DE analysis whose results will be used for pathway enrichment.
          </p>
          <div className="space-y-1">
            {deJobs.map((job: AnalysisJob) => (
              <label
                key={job.id}
                className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                  selectedDeJobId === job.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/30'
                }`}
              >
                <input
                  type="radio"
                  name="de-job"
                  checked={selectedDeJobId === job.id}
                  onChange={() => setSelectedDeJobId(job.id)}
                  className="accent-primary"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{job.name}</div>
                  <div className="text-xs text-muted-foreground">
                    ID: {job.id} · Genome: {String(job.params?.reference_genome ?? '—')} ·{' '}
                    Source: {String(job.params?.quantification_source ?? 'salmon')}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      ),
    },
    {
      label: 'Settings',
      content: (
        <div className="space-y-5">
          {submitError && (
            <p className="text-sm text-red-600 dark:text-red-400">{submitError}</p>
          )}
          <div>
            <label className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gene List</label>
            <div className="mt-1 space-y-1">
              {PATHWAY_GENE_LIST_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer transition-colors ${
                    geneListSource === opt.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  <input
                    type="radio"
                    name="gene-list"
                    value={opt.value}
                    checked={geneListSource === opt.value}
                    onChange={(e) => setGeneListSource(e.target.value)}
                    className="accent-primary"
                  />
                  <span className="text-sm">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <Input
            label="FDR Threshold"
            type="number"
            step={0.01}
            min={0.001}
            max={1}
            value={fdrThreshold}
            onChange={(e) => setFdrThreshold(parseFloat(e.target.value) || 0.05)}
            className="w-32"
          />

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={enableGsea}
              onChange={(e) => setEnableGsea(e.target.checked)}
              className="accent-primary"
            />
            <span className="text-sm">Enable Gene Set Enrichment Analysis (GSEA)</span>
          </label>
          {enableGsea && (
            <p className="text-xs text-muted-foreground ml-6 -mt-3">
              GSEA uses the full ranked gene list (by log2 fold change), not just significant genes.
            </p>
          )}

          {referenceGenome && (
            <div className="rounded-md border border-border bg-muted/50 p-3">
              <table className="w-full text-sm">
                <tbody>
                  <tr>
                    <td className="text-muted-foreground py-1 pr-4">DE Analysis</td>
                    <td className="font-medium">{selectedDeJob?.name ?? '—'}</td>
                  </tr>
                  <tr>
                    <td className="text-muted-foreground py-1 pr-4">Genome</td>
                    <td className="font-medium">{referenceGenome}</td>
                  </tr>
                  <tr>
                    <td className="text-muted-foreground py-1 pr-4">GSEA</td>
                    <td className="font-medium">{enableGsea ? 'Enabled' : 'Disabled'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <WizardModal
      isOpen={isOpen}
      onClose={handleClose}
      title="New Pathway Analysis"
      steps={steps}
      currentStep={currentStep}
      onNext={handleNext}
      onBack={handleBack}
      onSubmit={handleSubmit}
    />
  );
}
