// frontend/src/components/reactions/ReactionFormModal.tsx
import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import { useCreateReaction, useUpdateReaction } from '@/hooks/useReactions';
import { ORGANISMS, CUTANA_SPIKE_IN_OPTIONS, CUTANA_SPIKE_IN_TARGETS } from '@/lib/constants';
import type { ApiError, PrefixInfo, Reaction } from '@/api/types';

interface ReactionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  experimentId: number;
  prefixes: PrefixInfo[];
  assayType: string;
  existingReaction?: Reaction;
}

const selectClass =
  'w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors duration-150 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25';
const inputClass = selectClass;

export function ReactionFormModal({
  isOpen,
  onClose,
  experimentId,
  prefixes,
  assayType,
  existingReaction,
}: ReactionFormModalProps) {
  const isEdit = !!existingReaction;
  const createMutation = useCreateReaction();
  const updateMutation = useUpdateReaction();
  const [error, setError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);

  // Form state
  const [fastqPrefix, setFastqPrefix] = useState('');
  const [shortName, setShortName] = useState('');
  const [organism, setOrganism] = useState<string>(ORGANISMS[1]); // Mouse default
  const [cutanaSpikeIn, setCutanaSpikeIn] = useState('None');
  const [cutanaSpikeInTarget, setCutanaSpikeInTarget] = useState<string>('');
  const [ecoliSpikeIn, setEcoliSpikeIn] = useState(false);
  // Optional fields (shared)
  const [cellType, setCellType] = useState('');
  const [cellNumber, setCellNumber] = useState('');
  const [samplePrep, setSamplePrep] = useState('');
  const [experimentalCondition, setExperimentalCondition] = useState('');
  // Optional fields (CUT&RUN/CUT&Tag only)
  const [antibodyVendor, setAntibodyVendor] = useState('');
  const [antibodyCatNo, setAntibodyCatNo] = useState('');
  const [antibodyLotNo, setAntibodyLotNo] = useState('');
  const [cutanaSpikeIn2, setCutanaSpikeIn2] = useState('');
  const [cutanaSpikeInTarget2, setCutanaSpikeInTarget2] = useState('');
  // Optional fields (RNA-seq only)
  const [treatment, setTreatment] = useState('');
  const [timepoint, setTimepoint] = useState('');
  const [genotype, setGenotype] = useState('');
  const [replicateNumber, setReplicateNumber] = useState('');
  const isRnaseq = assayType === 'RNA-seq';

  // Reset form when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setShowMore(false);
    if (existingReaction) {
      setFastqPrefix(existingReaction.fastqPrefix);
      setShortName(existingReaction.shortName);
      setOrganism(existingReaction.organism);
      setCutanaSpikeIn(existingReaction.cutanaSpikeIn);
      setCutanaSpikeInTarget(existingReaction.cutanaSpikeInTarget ?? '');
      setEcoliSpikeIn(existingReaction.ecoliSpikeIn);
      setCellType(existingReaction.cellType ?? '');
      setCellNumber(existingReaction.cellNumber ?? '');
      setSamplePrep(existingReaction.samplePrep ?? '');
      setExperimentalCondition(existingReaction.experimentalCondition ?? '');
      setAntibodyVendor(existingReaction.antibodyVendor ?? '');
      setAntibodyCatNo(existingReaction.antibodyCatNo ?? '');
      setAntibodyLotNo(existingReaction.antibodyLotNo ?? '');
      setCutanaSpikeIn2(existingReaction.cutanaSpikeIn2 ?? '');
      setCutanaSpikeInTarget2(existingReaction.cutanaSpikeInTarget2 ?? '');
      setTreatment(existingReaction.treatment ?? '');
      setTimepoint(existingReaction.timepoint ?? '');
      setGenotype(existingReaction.genotype ?? '');
      setReplicateNumber(existingReaction.replicateNumber != null ? String(existingReaction.replicateNumber) : '');
      // Show "More Fields" section if any optional fields are populated
      const hasOptional = existingReaction.cellType || existingReaction.cellNumber ||
        existingReaction.samplePrep || existingReaction.experimentalCondition ||
        existingReaction.antibodyVendor || existingReaction.antibodyCatNo ||
        existingReaction.antibodyLotNo || existingReaction.cutanaSpikeIn2 ||
        existingReaction.cutanaSpikeInTarget2 || existingReaction.treatment ||
        existingReaction.timepoint || existingReaction.genotype ||
        existingReaction.replicateNumber != null;
      if (hasOptional) setShowMore(true);
    } else {
      setFastqPrefix(prefixes[0]?.prefix ?? '');
      setShortName('');
      setOrganism(ORGANISMS[1]);
      setCutanaSpikeIn('None');
      setCutanaSpikeInTarget('');
      setEcoliSpikeIn(false);
      setCellType('');
      setCellNumber('');
      setSamplePrep('');
      setExperimentalCondition('');
      setAntibodyVendor('');
      setAntibodyCatNo('');
      setAntibodyLotNo('');
      setCutanaSpikeIn2('');
      setCutanaSpikeInTarget2('');
      setTreatment('');
      setTimepoint('');
      setGenotype('');
      setReplicateNumber('');
    }
  }, [isOpen, existingReaction, prefixes]);

  function buildPayload() {
    return {
      fastqPrefix,
      shortName,
      organism,
      assayType,
      cutanaSpikeIn: isRnaseq ? 'None' : cutanaSpikeIn,
      cutanaSpikeInTarget: isRnaseq ? null : (cutanaSpikeIn === 'None' ? null : (cutanaSpikeInTarget || null)),
      ecoliSpikeIn: isRnaseq ? false : ecoliSpikeIn,
      cellType: cellType || null,
      cellNumber: cellNumber || null,
      samplePrep: samplePrep || null,
      experimentalCondition: experimentalCondition || null,
      antibodyVendor: isRnaseq ? null : (antibodyVendor || null),
      antibodyCatNo: isRnaseq ? null : (antibodyCatNo || null),
      antibodyLotNo: isRnaseq ? null : (antibodyLotNo || null),
      cutanaSpikeIn2: isRnaseq ? null : (cutanaSpikeIn2 || null),
      cutanaSpikeInTarget2: isRnaseq ? null : (cutanaSpikeInTarget2 || null),
      treatment: treatment || null,
      timepoint: timepoint || null,
      genotype: genotype || null,
      replicateNumber: replicateNumber ? parseInt(replicateNumber, 10) : null,
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!fastqPrefix || !shortName || !organism) {
      setError('FASTQ Prefix, Short Name, and Organism are required.');
      return;
    }

    try {
      if (isEdit && existingReaction) {
        await updateMutation.mutateAsync({
          experimentId,
          reactionId: existingReaction.id,
          data: buildPayload(),
        });
      } else {
        await createMutation.mutateAsync({
          experimentId,
          data: buildPayload(),
        });
      }
      onClose();
    } catch (err) {
      const apiErr = err as { response?: { data?: ApiError }; message?: string };
      const detail = apiErr.response?.data?.detail ?? apiErr.response?.data?.error ?? apiErr.message ?? 'Failed to save reaction';
      setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Reaction' : 'Add Reaction'}
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Field label="FASTQ Prefix" htmlFor="rxn-fastq-prefix" required>
          {prefixes.length > 0 ? (
            <select
              id="rxn-fastq-prefix"
              required
              value={fastqPrefix}
              onChange={(e) => setFastqPrefix(e.target.value)}
              className={`${selectClass} font-mono`}
            >
              <option value="" disabled>Select prefix</option>
              {prefixes.map((p) => (
                <option key={p.prefix} value={p.prefix}>
                  {p.prefix} {p.hasR1 && p.hasR2 ? '(R1+R2)' : p.hasR1 ? '(R1 only)' : p.hasR2 ? '(R2 only)' : ''}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-muted-foreground">
              Upload FASTQ files first to populate prefix options.
            </p>
          )}
        </Field>

        <Field
          label="Short Name"
          htmlFor="rxn-short-name"
          required
          help="Reactions with the same Organism must have unique Short Names."
        >
          <input
            id="rxn-short-name"
            type="text"
            required
            value={shortName}
            onChange={(e) => setShortName(e.target.value)}
            placeholder="e.g., K4me3_ctrl1"
            className={inputClass}
          />
        </Field>

        <Field label="Organism" htmlFor="rxn-organism" required>
          <select
            id="rxn-organism"
            required
            value={organism}
            onChange={(e) => setOrganism(e.target.value)}
            className={selectClass}
          >
            {ORGANISMS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </Field>

        {!isRnaseq && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Field label="CUTANA Spike in" htmlFor="rxn-cutana-spike">
                <select
                  id="rxn-cutana-spike"
                  value={cutanaSpikeIn}
                  onChange={(e) => {
                    setCutanaSpikeIn(e.target.value);
                    if (e.target.value === 'None') setCutanaSpikeInTarget('');
                  }}
                  className={selectClass}
                >
                  {CUTANA_SPIKE_IN_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </Field>

              <Field label="CUTANA Spike in Target" htmlFor="rxn-cutana-target">
                <select
                  id="rxn-cutana-target"
                  value={cutanaSpikeInTarget}
                  onChange={(e) => setCutanaSpikeInTarget(e.target.value)}
                  disabled={cutanaSpikeIn === 'None'}
                  className={`${selectClass} ${cutanaSpikeIn === 'None' ? 'bg-muted text-muted-foreground' : ''}`}
                >
                  <option value="">Select target</option>
                  {CUTANA_SPIKE_IN_TARGETS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="E.coli Spike in" htmlFor="rxn-ecoli-spike">
              <select
                id="rxn-ecoli-spike"
                value={ecoliSpikeIn ? 'Yes' : 'No'}
                onChange={(e) => setEcoliSpikeIn(e.target.value === 'Yes')}
                className={selectClass}
              >
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </Field>
          </>
        )}

        <div>
          <button
            type="button"
            onClick={() => setShowMore(!showMore)}
            className="flex items-center gap-1 rounded-md text-sm font-medium text-primary transition-colors duration-150 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform duration-150', showMore && 'rotate-180')} />
            {showMore ? 'Less Fields' : 'More Fields'}
          </button>
        </div>

        {showMore && (
          <div className="space-y-4 border-t pt-4">
            {isRnaseq && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Treatment" htmlFor="rxn-treatment">
                    <input id="rxn-treatment" type="text" value={treatment} onChange={(e) => setTreatment(e.target.value)} placeholder="e.g., DMSO, Drug_1uM" className={inputClass} />
                  </Field>
                  <Field label="Timepoint" htmlFor="rxn-timepoint">
                    <input id="rxn-timepoint" type="text" value={timepoint} onChange={(e) => setTimepoint(e.target.value)} placeholder="e.g., 0h, 24h, 7d" className={inputClass} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Genotype" htmlFor="rxn-genotype">
                    <input id="rxn-genotype" type="text" value={genotype} onChange={(e) => setGenotype(e.target.value)} placeholder="e.g., WT, KO, Het" className={inputClass} />
                  </Field>
                  <Field label="Replicate Number" htmlFor="rxn-replicate-number">
                    <input id="rxn-replicate-number" type="number" min="1" value={replicateNumber} onChange={(e) => setReplicateNumber(e.target.value)} placeholder="e.g., 1, 2, 3" className={inputClass} />
                  </Field>
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Cell Type" htmlFor="rxn-cell-type">
                <input id="rxn-cell-type" type="text" value={cellType} onChange={(e) => setCellType(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Cell Number" htmlFor="rxn-cell-number">
                <input id="rxn-cell-number" type="text" value={cellNumber} onChange={(e) => setCellNumber(e.target.value)} className={inputClass} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Sample Prep" htmlFor="rxn-sample-prep">
                <input id="rxn-sample-prep" type="text" value={samplePrep} onChange={(e) => setSamplePrep(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Experimental Condition" htmlFor="rxn-exp-condition">
                <input id="rxn-exp-condition" type="text" value={experimentalCondition} onChange={(e) => setExperimentalCondition(e.target.value)} className={inputClass} />
              </Field>
            </div>
            {!isRnaseq && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Antibody Vendor" htmlFor="rxn-ab-vendor">
                    <input id="rxn-ab-vendor" type="text" value={antibodyVendor} onChange={(e) => setAntibodyVendor(e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Antibody Cat No" htmlFor="rxn-ab-cat">
                    <input id="rxn-ab-cat" type="text" value={antibodyCatNo} onChange={(e) => setAntibodyCatNo(e.target.value)} className={inputClass} />
                  </Field>
                  <Field label="Antibody Lot No" htmlFor="rxn-ab-lot">
                    <input id="rxn-ab-lot" type="text" value={antibodyLotNo} onChange={(e) => setAntibodyLotNo(e.target.value)} className={inputClass} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="CUTANA Spike in 2" htmlFor="rxn-cutana-spike2">
                    <select id="rxn-cutana-spike2" value={cutanaSpikeIn2} onChange={(e) => setCutanaSpikeIn2(e.target.value)} className={selectClass}>
                      <option value="">None</option>
                      {CUTANA_SPIKE_IN_OPTIONS.filter((o) => o !== 'None').map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="CUTANA Spike in Target 2" htmlFor="rxn-cutana-target2">
                    <select id="rxn-cutana-target2" value={cutanaSpikeInTarget2} onChange={(e) => setCutanaSpikeInTarget2(e.target.value)} className={selectClass}>
                      <option value="">Select target</option>
                      {CUTANA_SPIKE_IN_TARGETS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={isPending}>
            {isEdit ? 'Save Changes' : 'Create Reaction'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
