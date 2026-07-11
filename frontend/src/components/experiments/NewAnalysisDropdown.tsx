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
  onRnaseqAlignmentClick?: () => void;
  onFeatureCountsClick?: () => void;
  onDeseq2Click?: () => void;
  onRnaseqQCClick?: () => void;
  onPathwayClick?: () => void;
}

export function NewAnalysisDropdown({
  assayType,
  onAlignmentClick,
  onPeakCallingClick,
  onDiffBindClick,
  onCustomHeatmapClick,
  onPearsonCorrelationClick,
  onNormalizationClick,
  onRnaseqAlignmentClick,
  onFeatureCountsClick,
  onDeseq2Click,
  onRnaseqQCClick,
  onPathwayClick,
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
            <DropdownMenuItem onSelect={onRnaseqAlignmentClick} disabled={!onRnaseqAlignmentClick}>
              <AlignLeft className="h-4 w-4 text-muted-foreground" />
              Alignment (STAR)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onFeatureCountsClick} disabled={!onFeatureCountsClick}>
              <ListOrdered className="h-4 w-4 text-muted-foreground" />
              featureCounts
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDeseq2Click} disabled={!onDeseq2Click}>
              <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
              DE Analysis
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onRnaseqQCClick} disabled={!onRnaseqQCClick}>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              QC Dashboard
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onPathwayClick} disabled={!onPathwayClick}>
              <Share2 className="h-4 w-4 text-muted-foreground" />
              Pathway Analysis
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem onSelect={onAlignmentClick}>
              <Dna className="h-4 w-4 text-muted-foreground" />
              Alignment
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onPeakCallingClick}>
              <Mountain className="h-4 w-4 text-muted-foreground" />
              Peak Calling
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDiffBindClick}>
              <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
              DiffBind
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onNormalizationClick}>
              <Scale className="h-4 w-4 text-muted-foreground" />
              Normalization
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onCustomHeatmapClick}>
              <Grid3x3 className="h-4 w-4 text-muted-foreground" />
              Custom Heatmap
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onPearsonCorrelationClick}>
              <ScatterChart className="h-4 w-4 text-muted-foreground" />
              Correlation
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
