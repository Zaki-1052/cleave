// frontend/src/components/experiments/NewAnalysisDropdown.tsx
import { Button } from '@/components/ui/Button';
import {
  ChevronDown,
  Dna,
  Mountain,
  ArrowLeftRight,
  Grid3x3,
  ScatterChart,
  Scale,
  AlignLeft,
  ListOrdered,
  BarChart3,
  Share2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

interface NewAnalysisDropdownProps {
  assayType: string;
  onAlignmentClick: () => void;
  onPeakCallingClick: () => void;
  onDiffBindClick: () => void;
  onCustomHeatmapClick: () => void;
  onPearsonCorrelationClick: () => void;
  onNormalizationClick: () => void;
}

export function NewAnalysisDropdown({
  assayType,
  onAlignmentClick,
  onPeakCallingClick,
  onDiffBindClick,
  onCustomHeatmapClick,
  onPearsonCorrelationClick,
  onNormalizationClick,
}: NewAnalysisDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          New Analysis
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {assayType === 'RNA-seq' ? (
          <>
            <DropdownMenuItem disabled>
              <AlignLeft className="h-4 w-4" />
              Alignment (STAR)
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <ListOrdered className="h-4 w-4" />
              featureCounts
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <ArrowLeftRight className="h-4 w-4" />
              DE Analysis
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <BarChart3 className="h-4 w-4" />
              QC Dashboard
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <Share2 className="h-4 w-4" />
              Pathway Analysis
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem onSelect={onAlignmentClick}>
              <Dna className="h-4 w-4" />
              Alignment
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onPeakCallingClick}>
              <Mountain className="h-4 w-4" />
              Peak Calling
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDiffBindClick}>
              <ArrowLeftRight className="h-4 w-4" />
              DiffBind
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onNormalizationClick}>
              <Scale className="h-4 w-4" />
              Normalization
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onCustomHeatmapClick}>
              <Grid3x3 className="h-4 w-4" />
              Custom Heatmap
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onPearsonCorrelationClick}>
              <ScatterChart className="h-4 w-4" />
              Correlation
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
