// frontend/src/lib/docs-navigation.ts
import {
  BookOpen, GitBranch, FolderKanban, FlaskConical, Dna, FlaskRound,
  Globe, Scissors, AlignLeft, Mountain, Monitor, Beaker, Zap,
  ClipboardCheck, GraduationCap, HelpCircle, BookA,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type DocsNavItem = {
  slug: string;
  label: string;
  icon: LucideIcon;
};

export type DocsNavGroup = {
  group: string;
  items: DocsNavItem[];
};

export const DOCS_NAV: DocsNavGroup[] = [
  {
    group: 'Getting Started',
    items: [
      { slug: 'getting-started', label: 'Overview', icon: BookOpen },
      { slug: 'data-hierarchy', label: 'Data Hierarchy', icon: GitBranch },
    ],
  },
  {
    group: 'Core Workflow',
    items: [
      { slug: 'projects', label: 'Projects', icon: FolderKanban },
      { slug: 'experiments', label: 'Experiments', icon: FlaskConical },
      { slug: 'fastqs', label: 'FASTQ Files', icon: Dna },
      { slug: 'reactions', label: 'Reactions', icon: FlaskRound },
      { slug: 'reference-genomes', label: 'Reference Genomes', icon: Globe },
    ],
  },
  {
    group: 'Pipeline',
    items: [
      { slug: 'pipeline-trimming', label: 'Trimming', icon: Scissors },
      { slug: 'pipeline-alignment', label: 'Alignment', icon: AlignLeft },
      { slug: 'pipeline-peaks', label: 'Peak Calling', icon: Mountain },
      { slug: 'pipeline-igv', label: 'Visualization (IGV)', icon: Monitor },
      { slug: 'auto-pipeline', label: 'Auto-Pipeline', icon: Zap },
    ],
  },
  {
    group: 'Lab Extensions',
    items: [
      { slug: 'lab-extensions', label: 'DiffBind & More', icon: Beaker },
    ],
  },
  {
    group: 'Reference',
    items: [
      { slug: 'qc-guide', label: 'QC Interpretation', icon: ClipboardCheck },
      { slug: 'tutorials', label: 'Tutorials', icon: GraduationCap },
      { slug: 'faq', label: 'FAQ & Troubleshooting', icon: HelpCircle },
      { slug: 'glossary', label: 'Glossary', icon: BookA },
    ],
  },
];

export function getAllSlugs(): string[] {
  return DOCS_NAV.flatMap((g) => g.items.map((i) => i.slug));
}

export function findNavItem(slug: string): DocsNavItem | undefined {
  for (const group of DOCS_NAV) {
    const found = group.items.find((i) => i.slug === slug);
    if (found) return found;
  }
  return undefined;
}

export function getPrevNext(slug: string): { prev: DocsNavItem | null; next: DocsNavItem | null } {
  const all = DOCS_NAV.flatMap((g) => g.items);
  const idx = all.findIndex((i) => i.slug === slug);
  return {
    prev: idx > 0 ? (all[idx - 1] ?? null) : null,
    next: idx < all.length - 1 ? (all[idx + 1] ?? null) : null,
  };
}
