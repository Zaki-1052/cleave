// frontend/src/components/rnaseq-qc/NewRnaseqQCWizard.tsx
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Info } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { WizardModal } from '@/components/ui/WizardModal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/layout/Card';
import { useCreateJob, useJobs, useJob, useJobOutputs } from '@/hooks/useJobs';
import type { Experiment, AnalysisJob } from '@/api/types';

interface NewRnaseqQCWizardProps {
  isOpen: boolean;
  onClose: () => void;
  experiment: Experiment;
}

export function NewRnaseqQCWizard({
  isOpen,
  onClose,
  experiment,
}: NewRnaseqQCWizardProps) {
  const navigate = useNavigate();
  const createJobMutation = useCreateJob();

  const { data: jobsData, isLoading: jobsLoading } = useJobs(experiment.id, 1, 100);
  const completedAlignments = useMemo(
    () =>
      (jobsData?.items ?? []).filter(
        (j) => j.jobType === 'rnaseq_alignment' && j.status === 'complete',
      ),
    [jobsData],
  );

  const [currentStep, setCurrentStep] = useState(0);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedAlignmentJobId, setSelectedAlignmentJobId] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: selectedJob } = useJob(selectedAlignmentJobId);
  const { data: bamOutputs } = useJobOutputs(selectedAlignmentJobId, 'sorted_bam');

  const reactions = useMemo(() => {
    if (!selectedJob || !bamOutputs) return [];
    const bamMap = new Map(
      bamOutputs.map((o) => [o.reactionId, o.filePath]),
    );
    const alignReactions = (selectedJob.params as Record<string, unknown>)?.reactions;
    if (!Array.isArray(alignReactions)) return [];
    return alignReactions.map((rxn: Record<string, unknown>) => ({
      reaction_id: rxn.reaction_id as number,
      short_name: rxn.short_name as string,
      bam_path: bamMap.get(rxn.reaction_id as number) ?? '',
    }));
  }, [selectedJob, bamOutputs]);

  const referenceGenome =
    ((selectedJob?.params as Record<string, unknown>)?.reference_genome as string) ?? '';

  function resetState() {
    setCurrentStep(0);
    setName('');
    setNotes('');
    setSelectedAlignmentJobId(null);
    setSubmitError(null);
    createJobMutation.reset();
  }

  function handleClose() {
    resetState();
    onClose();
  }

  function handleNext() {
    if (currentStep === 0) {
      if (!name.trim() || selectedAlignmentJobId === null) return;
      setCurrentStep(1);
    }
  }

  function handleBack() {
    setCurrentStep(0);
    setSubmitError(null);
  }

  function handleSelectAlignment(job: AnalysisJob) {
    setSelectedAlignmentJobId(job.id);
  }

  async function handleSubmit() {
    if (reactions.length === 0) {
      setSubmitError('No reactions found from the selected alignment job.');
      return;
    }
    if (reactions.some((r) => !r.bam_path)) {
      setSubmitError('Could not resolve BAM paths for all reactions.');
      return;
    }

    setSubmitError(null);
    try {
      const params = {
        experiment_id: experiment.id,
        project_id: experiment.projectId,
        reference_genome: referenceGenome,
        alignment_job_id: selectedAlignmentJobId,
        reactions,
      };
      const job = await createJobMutation.mutateAsync({
        experimentId: experiment.id,
        payload: {
          jobType: 'rnaseq_qc',
          name: name.trim(),
          notes: notes.trim() || null,
          params,
          parentJobId: selectedAlignmentJobId,
        },
      });
      toast.success('RSeQC + MultiQC job queued');
      handleClose();
      navigate(`/experiments/${experiment.id}/rnaseq-qc/${job.id}`);
    } catch {
      setSubmitError('Failed to create QC Dashboard job. Please try again.');
    }
  }

  const steps = [
    {
      label: 'Details & Alignment',
      content: jobsLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-4">
            <div>
              <Input
                id="qc-name"
                label="Run Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., QC-Dashboard-v1"
                maxLength={30}
              />
            </div>
            <div>
              <label
                htmlFor="qc-notes"
                className="font-display text-sm font-medium text-foreground"
              >
                Notes <span className="text-muted-foreground">(optional)</span>
              </label>
              <textarea
                id="qc-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                rows={2}
              />
            </div>
          </div>

          <Card className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950">
            <div className="flex gap-3">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
              <div className="text-sm text-blue-900 dark:text-blue-100">
                <p className="font-semibold">About RSeQC + MultiQC</p>
                <p className="mt-1 text-blue-700 dark:text-blue-300">
                  Runs 5 RSeQC modules per reaction: strandedness inference, read distribution
                  across genomic features, gene body coverage uniformity, fragment size distribution,
                  and splice junction saturation. MultiQC then aggregates all QC from fastp, STAR,
                  Salmon, and RSeQC into a single interactive HTML report.
                </p>
              </div>
            </div>
          </Card>

          <div>
            <h3 className="mb-2 font-display text-sm font-semibold text-foreground">
              Choose Alignment Run
            </h3>
            {completedAlignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No completed RNA-seq alignment runs available. Run a STAR alignment first.
              </p>
            ) : (
              <div className="space-y-2">
                {completedAlignments.map((j) => (
                  <label
                    key={j.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      selectedAlignmentJobId === j.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="alignment-job"
                      checked={selectedAlignmentJobId === j.id}
                      onChange={() => handleSelectAlignment(j)}
                      className="accent-primary"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-foreground">{j.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">#{j.id}</span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      label: 'Review',
      content: (
        <div className="space-y-5">
          <Card>
            <h3 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
              Configuration
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reference Genome</span>
                <span className="font-medium font-mono">{referenceGenome || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Alignment Job</span>
                <span className="font-medium">
                  {selectedJob?.name ?? '—'}
                  {selectedJob && (
                    <span className="ml-1 text-xs text-muted-foreground">#{selectedJob.id}</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reactions</span>
                <span className="font-medium">{reactions.length}</span>
              </div>
            </div>
          </Card>

          {reactions.length > 0 && (
            <Card>
              <h3 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
                Reactions
              </h3>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs font-medium uppercase text-muted-foreground">
                      <th className="pb-2 pr-3">Short Name</th>
                      <th className="pb-2">BAM File</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reactions.map((r) => (
                      <tr key={r.reaction_id} className="border-b border-border/50">
                        <td className="py-1.5 pr-3 font-medium">{r.short_name}</td>
                        <td className="py-1.5 font-mono text-xs text-muted-foreground truncate max-w-xs">
                          {r.bam_path.split('/').pop() ?? r.bam_path}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card className="border-muted bg-muted/30">
            <p className="text-sm text-muted-foreground">
              5 RSeQC modules will run per reaction, then MultiQC will aggregate all prior
              QC outputs into a single interactive report.
            </p>
          </Card>
        </div>
      ),
    },
  ];

  return (
    <WizardModal
      isOpen={isOpen}
      onClose={handleClose}
      title="New QC Dashboard Run"
      steps={steps}
      currentStep={currentStep}
      onNext={handleNext}
      onBack={handleBack}
      onSubmit={handleSubmit}
      submitLabel="Start QC Dashboard"
      maxWidth="max-w-3xl"
      renderFooter={({ currentStep: step, onClose: close, onBack: back }) => (
        <div className="flex flex-col border-t">
          {submitError && (
            <div className="bg-red-50 dark:bg-red-950 px-6 py-2 text-sm text-red-600 dark:text-red-400">
              {submitError}
            </div>
          )}
          <div className="flex items-center justify-between px-6 py-4">
            <button
              onClick={close}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <div className="flex gap-3">
              {step > 0 && (
                <Button variant="outlined" onClick={back}>
                  Back
                </Button>
              )}
              {step === 1 ? (
                <Button
                  onClick={handleSubmit}
                  disabled={reactions.length === 0 || createJobMutation.isPending}
                >
                  {createJobMutation.isPending ? 'Starting...' : 'Start QC Dashboard'}
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  disabled={!name.trim() || selectedAlignmentJobId === null}
                >
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
