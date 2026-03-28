// frontend/src/components/normalization/NormalizationSettingsStep.tsx
import { Card } from '@/components/layout/Card';
import type { NormalizationSample } from './NormalizationSelectSamplesStep';

interface NormalizationSettingsStepProps {
  genome: string;
  samples: NormalizationSample[];
}

export function NormalizationSettingsStep({
  genome,
  samples,
}: NormalizationSettingsStepProps) {
  const referenceSampleLabel = samples.length > 0 ? samples[0].label : '(none)';

  return (
    <div className="space-y-6">
      {/* Settings card */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold uppercase text-gray-500">
          Normalization Settings
        </h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Reference Genome
            </label>
            <input
              type="text"
              value={genome === 'mm10' ? 'Mouse mm10' : genome}
              readOnly
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
            />
            <p className="mt-1 text-xs text-gray-400">
              Roman normalization is restricted to mouse (mm10) data.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Masking</label>
            <input
              type="text"
              value="Applied (158 masked regions)"
              readOnly
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
            />
            <p className="mt-1 text-xs text-gray-400">
              Manually curated regions with artificially high/low signal are excluded from
              percentile calculation.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Reference Sample
            </label>
            <input
              type="text"
              value={referenceSampleLabel}
              readOnly
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
            />
            <p className="mt-1 text-xs text-gray-400">
              All samples are normalized relative to the first sample (NF = 1.0). Reorder
              samples in the previous step to change the reference.
            </p>
          </div>
        </div>
      </Card>

      {/* Summary card */}
      <Card>
        <h3 className="mb-3 text-sm font-semibold uppercase text-gray-500">Summary</h3>
        <div className="space-y-1 text-sm text-gray-600">
          <p>
            <strong>Genome:</strong> Mouse mm10
          </p>
          <p>
            <strong>Masking:</strong> 158 regions excluded
          </p>
          <p>
            <strong>Reference sample:</strong> {referenceSampleLabel}
          </p>
          <p>
            <strong>Samples ({samples.length}):</strong>{' '}
            {samples.map((s) => s.label).join(', ') || '(none)'}
          </p>
        </div>
      </Card>
    </div>
  );
}
