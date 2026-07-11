// frontend/src/pages/LandingPage.tsx — the "Field Atlas" landing: a theatrical,
// token-pure identity surface. Poster hero (monumental Fraunces wordmark, pinned
// specimen run cards, self-drawing seismograph) over a living atmosphere (morphing
// contours, parallax aurora, seeded particles); count-up stats; the CUT&RUN pipeline
// as a scroll-drawn vertical spine; polychrome capability cards; the dark ledger band;
// a colophon schematic with a traveling SSE dot. All decoration is aria-hidden and
// reduced-motion-safe; licensed exceptions are documented in crud-app/DESIGN.md
// §Identity surfaces and crud-app/PLAN-landing.md. Cleave keeps its own biology
// content, branding, routes, and license.
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { Check, Dna, FileText, Grid3x3, Mountain, Scale, ScatterChart } from 'lucide-react';
import { GradientBackground } from '@/components/layout/GradientBackground';
import { ContourField } from '@/components/layout/ContourField';
import { CleaveIcon } from '@/components/ui/CleaveIcon';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/cn';
import { ArchitectureDiagram } from '@/components/landing/ArchitectureDiagram';
import { CapabilityCard } from '@/components/landing/CapabilityCard';
import { HeroAtmosphere } from '@/components/landing/HeroAtmosphere';
import { HeroRunCards } from '@/components/landing/HeroRunCards';
import { HeroWordmark } from '@/components/landing/HeroWordmark';
import { Seismograph, TimelineRuler } from '@/components/landing/InstrumentCluster';
import { PipelineSpine, type PipelineStage } from '@/components/landing/PipelineSpine';
import { Reveal } from '@/components/landing/Reveal';
import { Eyebrow, SectionHeader } from '@/components/landing/SectionHeader';
import { StatStrip, type LandingStat } from '@/components/landing/StatStrip';
import { hueAt } from '@/components/landing/theme';
import { useCountUp } from '@/components/landing/hooks/useCountUp';
import { useInViewOnce } from '@/components/landing/hooks/useInViewOnce';
import { useScrolledPast } from '@/components/landing/hooks/useScrolledPast';
import { useScrollSpy } from '@/components/landing/hooks/useScrollSpy';

const GITHUB_URL = 'https://github.com/Zaki-1052/cleave';
const LINKEDIN_URL = 'https://www.linkedin.com/in/zakir-alibhai-541454276/';

const ANCHORS = [
  { label: 'Pipeline', href: '#pipeline', id: 'pipeline' },
  { label: 'Capabilities', href: '#capabilities', id: 'capabilities' },
  { label: 'Compare', href: '#compare', id: 'compare' },
  { label: 'Stack', href: '#stack', id: 'stack' },
] as const;

// Module-level constant — useScrollSpy resubscribes if this identity changes.
const SECTION_IDS = ANCHORS.map((anchor) => anchor.id);

const STATS: readonly LandingStat[] = [
  { value: 500, suffix: '+', label: 'Backend tests passing' },
  { value: 20, label: 'Pipeline capabilities' },
  { value: 10, label: 'New vs CUTANA Cloud' },
  { value: 12, label: 'Implementation phases' },
];

const PIPELINE_STEPS: readonly PipelineStage[] = [
  {
    index: '01',
    title: 'FASTQ Upload',
    desc: 'Resumable tus uploads or direct FTP/SFTP server import — multi-gigabyte reads arrive intact, every time.',
  },
  {
    index: '02',
    title: 'FastQC',
    desc: 'Automated quality assessment runs on every file as it lands, before anything downstream can inherit a problem.',
  },
  {
    index: '03',
    title: 'Trimming',
    desc: 'Parallel Trimmomatic + kseq_test to 42 bp — adapters and low-quality bases removed, with every parameter on the record.',
  },
  {
    index: '04',
    title: 'Alignment',
    desc: 'Parallel Bowtie2 → SAMtools → Picard → deepTools, reporting alignment and spike-in QC stage by stage, live.',
  },
  {
    index: '05',
    title: 'Peak Calling',
    desc: 'MACS2 or SEACR with fragment-size filtering, FRiP scoring, and HOMER annotation — methods you can run side by side.',
  },
  {
    index: '06',
    title: 'Visualization',
    desc: 'IGV.js genome browser, enrichment heatmaps, and a manuscript-ready methods paragraph written for you.',
  },
];

const FEATURES: { icon: LucideIcon; title: string; desc: string; tags: string[] }[] = [
  {
    icon: Mountain,
    title: 'Two Peak Callers',
    desc: 'MACS2 narrow & broad modes and SEACR for sparse enrichment — all with fragment-size filtering, FRiP scoring, and HOMER annotation.',
    tags: ['MACS2', 'SEACR', 'HOMER'],
  },
  {
    icon: ScatterChart,
    title: 'DiffBind Differential Analysis',
    desc: 'Interactive sample-sheet builder, three analysis modes, and MA / volcano / PCA / heatmap plots with dynamic column detection from dba.report().',
    tags: ['DiffBind', 'DESeq2', 'Differential Peaks'],
  },
  {
    icon: Dna,
    title: 'IGV.js Genome Browser',
    desc: 'Embedded genome browser with lazy-loaded bigWig tracks, byte-range serving via NGINX, and reaction-based track selection.',
    tags: ['IGV.js', 'bigWig', 'BAM'],
  },
  {
    icon: Grid3x3,
    title: 'Custom Heatmaps & Correlation',
    desc: 'Reference-point heatmaps from user-provided BED files and Pearson correlation matrices for replicate QC — powered by deepTools.',
    tags: ['deepTools', 'Heatmaps', 'Pearson'],
  },
  {
    icon: Scale,
    title: 'Roman Normalization',
    desc: 'Sample-to-sample normalization for mouse (mm10) with 99th-percentile quantile masking — essential for comparing across conditions.',
    tags: ['Quantile', 'mm10', 'Normalization'],
  },
  {
    icon: FileText,
    title: 'Auto-Generated Methods',
    desc: 'Every analysis job produces copy-paste-ready methods text with exact tool versions and parameters — ready for your manuscript.',
    tags: ['Reproducibility', 'Manuscripts'],
  },
];

// Cleave's real feature comparison. `cloud` = present in EpiCypher's CUTANA Cloud.
const COMPARISON: { feature: string; cloud: boolean }[] = [
  { feature: 'FASTQ Upload + FastQC', cloud: true },
  { feature: 'Bowtie2 Alignment + QC', cloud: true },
  { feature: 'MACS2 Narrow Peaks', cloud: true },
  { feature: 'MACS2 Broad Peaks', cloud: false },
  { feature: 'IgG Control Background Subtraction', cloud: true },
  { feature: 'E. coli Spike-in Normalization', cloud: true },
  { feature: 'SNAP-CUTANA Spike-in QC', cloud: true },
  { feature: 'IGV.js Genome Browser', cloud: true },
  { feature: 'Auto-Generated Methods Text', cloud: true },
  { feature: 'FTP / SFTP Server Import', cloud: true },
  { feature: 'SEACR Peak Calling', cloud: false },
  { feature: 'MACS2 Broad Mode', cloud: false },
  { feature: 'FASTQ Trimming', cloud: false },
  { feature: 'Fragment Size Filter (<120bp)', cloud: false },
  { feature: 'DiffBind Differential Analysis', cloud: false },
  { feature: 'Custom Reference-Point Heatmaps', cloud: false },
  { feature: 'Pearson Correlation Matrices', cloud: false },
  { feature: 'Roman Normalization', cloud: false },
  { feature: 'Parallel Pipeline Processing', cloud: false },
  { feature: 'Training Mode (First-Time Users)', cloud: false },
];

const STACK = [
  { layer: 'Interface', items: ['React 18 + Vite', 'TypeScript', 'Tailwind CSS', 'TanStack Query', 'IGV.js', 'Recharts'] },
  { layer: 'API', items: ['FastAPI', 'Python 3.11', 'SQLAlchemy 2.0', 'Pydantic v2', 'fastapi-users', 'Server-sent events'] },
  { layer: 'Pipeline', items: ['Bowtie2', 'SAMtools · BEDTools', 'Picard · deepTools', 'MACS2 · SEACR', 'HOMER', 'DiffBind (R)'] },
  { layer: 'Infrastructure', items: ['PostgreSQL 15', 'NGINX', 'Docker Compose', 'systemd', 'Single-node EC2'] },
];

// Quiet text link: muted ink that darkens on hover, viridian ring on keyboard focus.
const QUIET_LINK =
  'rounded-sm text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

/** Fixed nav: transparent over the hero atmosphere, paper + hairline once scrolled. */
function LandingNav() {
  const scrolled = useScrolledPast(60);
  const active = useScrollSpy(SECTION_IDS);
  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-40 transition-all duration-300',
        scrolled
          ? 'border-b border-border/70 bg-background/85 shadow-sm backdrop-blur'
          : 'border-b border-transparent bg-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
        <Link
          to="/"
          className="flex items-center gap-2.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <CleaveIcon size={19} />
          </span>
          <span className="font-display text-lg font-semibold text-foreground">Cleave</span>
        </Link>
        <nav className="hidden items-center gap-6 md:flex" aria-label="Sections">
          {ANCHORS.map((anchor) => (
            <a
              key={anchor.id}
              href={anchor.href}
              className={cn(QUIET_LINK, 'relative', active === anchor.id && 'text-foreground')}
            >
              {anchor.label}
              <span
                className={cn(
                  'absolute -bottom-1.5 left-0 h-px w-full origin-left scale-x-0 bg-primary transition-transform duration-300',
                  active === anchor.id && 'scale-x-100',
                )}
              />
            </a>
          ))}
          <Link to="/docs" className={QUIET_LINK}>
            Docs
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Source on GitHub"
            className={cn(QUIET_LINK, 'p-1')}
          >
            <GitHubIcon className="h-[18px] w-[18px]" />
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link to="/login" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'hidden sm:inline-flex')}>
            Sign in
          </Link>
          <Link to="/dashboard" className={buttonVariants({ size: 'sm' })}>
            Launch dashboard
          </Link>
        </div>
      </div>
    </header>
  );
}

/** The dark archive band: staggered ledger rows, pulsing exclusive checks, counted footnote. */
function LedgerSection() {
  const { ref, inView } = useInViewOnce<HTMLDivElement>({ threshold: 0.1 });
  const capabilityCount = useCountUp(20, inView, 1200);
  const exclusiveCount = useCountUp(10, inView, 1200);
  return (
    <section id="compare" className="dark scroll-mt-16 border-y border-border bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
        <Reveal>
          <SectionHeader
            index="03"
            eyebrow="The ledger"
            title={
              <>
                What <em>self-hosting</em> the pipeline buys you.
              </>
            }
            lede="Feature for feature against EpiCypher's CUTANA Cloud — and the column that only fills in when the platform is yours."
          />
        </Reveal>
        <div ref={ref} className="mt-12 overflow-x-auto">
          <table className="w-full min-w-[560px] max-w-3xl text-sm">
            <thead>
              <tr className="border-b-2 border-border">
                <th className="py-3 pr-4 text-left font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Capability
                </th>
                <th className="w-32 px-4 py-3 text-center font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  CUTANA Cloud
                </th>
                <th className="w-32 px-4 py-3 text-center font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-primary">
                  Cleave
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row, i) => (
                <tr
                  key={row.feature}
                  className={cn(
                    'border-b border-border/70 transition-[opacity,transform,background-color] duration-500 ease-emphasized last:border-0 hover:bg-foreground/[0.03]',
                    inView ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
                  )}
                  style={{ transitionDelay: `${i * 40}ms` }}
                >
                  <td className="py-2.5 pr-4 text-foreground/90">
                    {row.feature}
                    {!row.cloud && (
                      <span className="ml-2 rounded-full border border-primary/30 px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.08em] text-primary">
                        new
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {row.cloud ? (
                      <Check className="mx-auto h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Check
                      className={cn(
                        'mx-auto h-4 w-4 text-primary',
                        !row.cloud && 'animate-pulse [animation-duration:3s]',
                      )}
                      aria-hidden="true"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-6 font-mono text-xs tabular-nums text-muted-foreground">
          <span className="text-foreground">{capabilityCount}</span> capabilities ·{' '}
          <span className="text-primary">{exclusiveCount}</span> exclusive to Cleave · audited against
          CUTANA Cloud.
        </p>
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <GradientBackground>
      <LandingNav />

      <main>
        {/* ── Hero: the poster ── */}
        <section className="relative overflow-hidden">
          <HeroAtmosphere />
          <div className="relative z-10 mx-auto max-w-4xl px-6 pb-16 pt-32 text-center md:pt-40">
            <HeroWordmark />
            <p
              className="mx-auto mt-6 max-w-xl animate-hero-rise text-lg leading-relaxed text-muted-foreground"
              style={{ animationDelay: '640ms' }}
            >
              Cleave runs your CUT&RUN / CUT&Tag analysis end to end — staged, observable, and
              reproducible. Upload the raw FASTQs, watch the run stream live, and keep every
              parameter and tool version on the record.
            </p>
            <div
              className="mt-8 flex animate-hero-rise flex-wrap items-center justify-center gap-3"
              style={{ animationDelay: '760ms' }}
            >
              <Link to="/dashboard" className={buttonVariants({ size: 'lg' })}>
                Launch the dashboard
              </Link>
              <Link to="/docs" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
                Read the user guide
              </Link>
            </div>
            <p
              className="mt-7 animate-hero-rise font-mono text-xs text-muted-foreground"
              style={{ animationDelay: '880ms' }}
            >
              $ docker compose up -d
              <span
                className="ml-1 inline-block h-3 w-[7px] translate-y-0.5 animate-cursor-blink bg-ember/80"
                aria-hidden="true"
              />
              <span className="ml-3">· one node is all it takes</span>
            </p>
            <div
              className="mx-auto mt-14 max-w-3xl animate-hero-rise opacity-80"
              style={{ animationDelay: '1000ms' }}
              aria-hidden="true"
            >
              <TimelineRuler />
              <Seismograph className="mt-1" />
            </div>
          </div>
          <HeroRunCards />
        </section>

        {/* ── Stat strip ── */}
        <StatStrip stats={STATS} />

        {/* ── The pipeline: scroll-drawn spine ── */}
        <PipelineSpine
          index="01"
          eyebrow="The pipeline"
          title="Six stages, one unbroken chain."
          lede="Each stage hands a verified artifact to the next. Nothing advances past a failure, and nothing is lost to a retry."
          stages={PIPELINE_STEPS}
        />

        {/* ── Capabilities ── */}
        <section id="capabilities" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-6 pb-20 pt-4 md:pb-24">
            <Reveal>
              <SectionHeader
                index="02"
                eyebrow="Capabilities"
                title={
                  <>
                    Built for <em>your</em> lab, beyond CUTANA Cloud.
                  </>
                }
                lede="Every extension was designed around the Ferguson Lab's actual workflows — provenance, comparison, differential analysis — not generic bioinformatics features."
              />
            </Reveal>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature, i) => (
                <Reveal key={feature.title} delay={(i % 3) * 90} className="h-full">
                  <CapabilityCard
                    icon={feature.icon}
                    title={feature.title}
                    desc={feature.desc}
                    tags={feature.tags}
                    hueIndex={i}
                  />
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── The ledger (dark archive band) ── */}
        <LedgerSection />

        {/* ── Colophon ── */}
        <section id="stack" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
            <Reveal>
              <SectionHeader
                index="04"
                eyebrow="Colophon"
                title={
                  <>
                    Proven tools, <em>on purpose</em>.
                  </>
                }
                lede="Battle-tested pieces on a single EC2 node — chosen so the person operating this in three years has an easy job."
              />
            </Reveal>
            <Reveal className="mt-12" threshold={0.2}>
              <div className="flex justify-center rounded-lg border border-border bg-card/60 p-6 md:p-8">
                <ArchitectureDiagram />
              </div>
            </Reveal>
            <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {STACK.map((group, gi) => (
                <Reveal key={group.layer} delay={gi * 80} direction={gi < 2 ? 'left' : 'right'}>
                  <div className="border-t border-border pt-5">
                    <Eyebrow>{group.layer}</Eyebrow>
                    <span className={cn('mt-2 block h-0.5 w-8 rounded-full', hueAt(gi).bg)} />
                    <ul className="mt-3 space-y-2">
                      {group.items.map((item) => (
                        <li key={item} className="font-mono text-xs text-muted-foreground">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              ))}
            </div>
            <div className="terminal-block mt-12 overflow-x-auto whitespace-nowrap rounded-lg px-5 py-4 font-mono text-xs leading-relaxed">
              <span className="opacity-60">flow ·</span> browser → nginx → api → postgres · worker →
              pipeline → /data/cleave/
            </div>
          </div>
        </section>

        {/* ── Closing invitation ── */}
        <section className="relative overflow-hidden border-t border-border/70">
          <ContourField className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[520px] text-primary/[0.05]" />
          <div className="relative mx-auto max-w-3xl px-6 py-20 text-center md:py-24">
            <Reveal>
              <Eyebrow>Get started</Eyebrow>
              <h2 className="mt-3 font-display text-3xl font-semibold text-foreground md:text-4xl">
                From FASTQ to figure.
              </h2>
              <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
                A project, an upload, and a few minutes. The record starts where the data does.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link to="/dashboard" className={buttonVariants({ size: 'lg' })}>
                  Launch the dashboard
                </Link>
                <Link to="/register" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
                  Create an account
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-border/70">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-[1.6fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <CleaveIcon size={19} />
              </span>
              <span className="font-display text-lg font-semibold text-foreground">Cleave</span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              A self-hosted CUT&RUN / CUT&Tag workbench for the Ferguson Lab at UC San Diego — from
              raw FASTQ to publishable figure.
            </p>
          </div>
          <nav aria-label="Product">
            <Eyebrow>Product</Eyebrow>
            <ul className="mt-3 space-y-2">
              <li>
                <Link to="/dashboard" className={QUIET_LINK}>
                  Dashboard
                </Link>
              </li>
              <li>
                <Link to="/docs" className={QUIET_LINK}>
                  Documentation
                </Link>
              </li>
              <li>
                <Link to="/login" className={QUIET_LINK}>
                  Sign in
                </Link>
              </li>
              <li>
                <Link to="/register" className={QUIET_LINK}>
                  Create an account
                </Link>
              </li>
            </ul>
          </nav>
          <nav aria-label="Project">
            <Eyebrow>Project</Eyebrow>
            <ul className="mt-3 space-y-2">
              <li>
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={QUIET_LINK}>
                  Source on GitHub
                </a>
              </li>
              <li>
                <a href={`${GITHUB_URL}/issues`} target="_blank" rel="noopener noreferrer" className={QUIET_LINK}>
                  Report an issue
                </a>
              </li>
            </ul>
          </nav>
        </div>
        <div className="mx-auto max-w-6xl px-6 opacity-60" aria-hidden="true">
          <TimelineRuler ticks={12} />
        </div>
        <div className="border-t border-border/70">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6 font-mono text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} Cleave · Ferguson Lab, UCSD</p>
            <p>
              Built at UC San Diego by{' '}
              <a
                href={LINKEDIN_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm underline underline-offset-2 transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Zakir Alibhai
              </a>
            </p>
          </div>
        </div>
      </footer>
    </GradientBackground>
  );
}
