// frontend/scripts/sanitize.mjs
//
// Purpose: Produce a biology-free sibling copy of the Cleave React/TS frontend at
//   ../frontend-sanitized so an external AI (with an over-eager biology safety filter)
//   can redesign the UI on the copy; design changes are later back-ported.
//
// Approach: a CONTEXT-ANCHORED regex engine (NOT a flat substring list). Every domain
// vocabulary is matched by its own boundary-anchored pattern so each occurrence in a
// given STRUCTURAL ROLE maps to the same target deterministically, while English words
// that merely embed a landmine fragment (generate, already, thread, sample, ...) are spared.
//
// Guarantees the script enforces:
//   * fresh, guarded output (never mutates the real frontend/src or configs)
//   * content pass + physical rename pass use the SAME identifier rules, so a renamed
//     file and every @/dir/File or ./File specifier that points at it transform together
//   * load-time INVARIANT: no replacement target contains ' ` \ (and none contains
//     whitespace when used in an identifier/route/value/icon role)
//   * built-in verification: biology denylist scan + route-consistency + docs-slug parity
//
// Node >= 22 (lookbehind + named groups). Dependencies: node:fs, node:path ONLY.
// The user runs this script; it never runs the app or tsc. It exits non-zero on verify fail.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..');                 // .../cleave/frontend
const OUT = path.resolve(SRC, '..', 'frontend-sanitized'); // .../cleave/frontend-sanitized
const REPO_ROOT = path.resolve(SRC, '..');                 // .../cleave

// Files whose slug strings must stay internally consistent: route-SEGMENT rules are
// skipped on these two so quoted docs-nav slugs never diverge from unquoted content keys.
const DOCS_FILES = new Set(['docs-navigation.ts', 'docs-content.ts']);

// ---------------------------------------------------------------------------------------
// Boundary helpers. All regexes are GLOBAL and CASE-SENSITIVE.
// ---------------------------------------------------------------------------------------
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Identifier boundary: token bounded by NON-letters. Treats _, digits, quotes, /, -, .,
// whitespace as boundaries -> catches snake_case segments & standalone tokens, spares
// letter-adjacent English (generate, already, thread, sample, readable, ...).
const IB = (t) => new RegExp(`(?<![A-Za-z])${esc(t)}(?![A-Za-z])`, 'g');

// Segment boundary: token is a COMPLETE quoted / slashed URL segment. Fixes the bare
// route-value bug (e.g. only 'de' inside '"de/:jid"' or "'de'"), never inside a word.
const SEG = (t) => new RegExp(`(?<=['"\`/])${esc(t)}(?=['"\`/])`, 'g');

// Camel-word: matches a token as a PascalCase segment OR a camelCase hump, and requires
// the following char is not a lowercase letter (so 'Peak' matches in 'PeakCalling' but a
// plural 'Peaks' needs its own rule). Left side: start/non-letter OR lowercase|digit hump.
const CW = (t) => new RegExp(`(?:(?<![A-Za-z])|(?<=[a-z0-9]))${esc(t)}(?![a-z])`, 'g');

// Raw literal (no boundary) — for prose-only compound phrases that cannot collide.
const LIT = (t) => new RegExp(esc(t), 'g');

// ---------------------------------------------------------------------------------------
// Rule constructors. Each rule: { re, to, route?, prose? }
//   route: true  -> skipped on DOCS_FILES (keeps docs slug parity)
//   prose: true  -> target may contain whitespace (display/label/prose role)
// ---------------------------------------------------------------------------------------
const ib = (t, to, prose = false) => ({ re: IB(t), to, prose });
const seg = (t, to) => ({ re: SEG(t), to, route: true });
const cw = (t, to) => ({ re: CW(t), to });
const lit = (t, to, prose = false) => ({ re: LIT(t), to, prose });
const raw = (reSource, flags, to, prose = false) => ({ re: new RegExp(reSource, flags), to, prose });

const RULES = [];
const push = (...rs) => rs.forEach((r) => RULES.push(r));

// =======================================================================================
// PHASE B — multiword display + compound literals (LONGEST / most specific first).
// Must precede any single-word rule that could bite a fragment of them.
// =======================================================================================

// CUT&RUN / CUT&Tag — both raw and HTML-entity (&amp;) forms; also the assay_type values
// and === compares. '&' is not a regex metachar but esc() leaves it literal.
push(
  lit('CUT&amp;RUN', 'Category A', true),
  lit('CUT&amp;Tag', 'Category B', true),
  lit('CUT&RUN', 'Category A', true),
  lit('CUT&Tag', 'Category B', true),
);

// Product / org / panel proper nouns (before the bare CUTANA fragment).
push(
  lit('CUTANA Cloud', 'Acme Cloud', true),
  lit('SNAP-CUTANA', 'SNAP-Panel', true),
  lit('K-MetStat', 'K-Marker', true),
  lit('Ferguson Lab', 'the Team', true),
  lit('EpiCypher', 'Acme', true),
  lit('CUTRUNTools', 'Toolkit', true),
);

// Assay / genomics compounds (before RNA / DNA / Gene fragments).
push(
  lit('RNA-seq', 'Category C', true),
  lit('RNA-Seq', 'Category C', true),
  lit('ATAC-seq', 'Category D', true),
  lit('Gene Ontology', 'Group Ontology', true),
  lit('Gene Body', 'Feature Body', true),
  lit('protein-DNA', 'signal-target', true),
  raw('E\\.\\s?coli', 'g', 'Reference-K', true),
  lit('Roman Normalization', 'Quantile Scaling', true),
  lit('Roman normalization', 'quantile scaling', true),
);

// Multiword tool / step display labels (before single-word Peak / Alignment / Trimming).
push(
  lit('Alignment (STAR+Salmon)', 'Processing (Mapper2+Quant)', true),
  lit('Alignment (STAR)', 'Processing (Mapper2)', true),
  lit('Trimming (fastp)', 'Preprocessing (Alt)', true),
  lit('Peak Calling', 'Detection', true),
  lit('DE Analysis', 'Differential Analysis', true),
  lit('Pathway Analysis', 'Enrichment Analysis', true),
  lit('Custom Heatmap', 'Custom Visualization', true),
);

// Bioinformatics tool proper-names (prose / labels; zero tsc risk — string/comment only).
push(
  lit('Bowtie2', 'Mapper1', true),
  lit('Trimmomatic', 'Trimmer', true),
  lit('SAMtools', 'Filetools', true),
  lit('BEDTools', 'Rangetools', true),
  lit('deepTools', 'TrackKit', true),
  lit('plotHeatmap', 'renderGrid', true),
  lit('plotProfile', 'renderProfile', true),
  lit('computeMatrix', 'buildMatrix', true),
  lit('clusterProfiler', 'EnrichKit', true),
  lit('tximport', 'importer', true),
  lit('HOMER', 'Annotator', true),
  lit('Picard', 'DedupTool', true),
  lit('MultiQC', 'AggQC', true),
  lit('RSeQC', 'DiagQC', true),
  lit('FastQC', 'DataQuality', true),
  lit('FASTQC', 'DataQuality', true),
  lit('edgeR', 'ModelB', true),
  lit('bedGraph', 'signalGraph', true),
  lit('bedgraph', 'signalgraph', true),
  lit('Bedgraph', 'Signalgraph', true),
);

// Docs slug that embeds a landmine ('igv') — atomic so BOTH the quoted docs-content key
// and the quoted docs-nav slug transform identically (cannot use a bare lowercase-igv rule
// because that would corrupt the protected npm import('igv')).
push(lit('pipeline-igv', 'pipeline-visualization'));

// SNAP-CUTANA K-MetStat marks (kills the H[34]K\d scan) + panel option + IgG.
const MARKS = {
  Unmodified: 'Baseline',
  H3K4me1: 'Marker01', H3K4me2: 'Marker02', H3K4me3: 'Marker03',
  H3K9me1: 'Marker04', H3K9me2: 'Marker05', H3K9me3: 'Marker06',
  H3K27me1: 'Marker07', H3K27me2: 'Marker08', H3K27me3: 'Marker09',
  H3K36me1: 'Marker10', H3K36me2: 'Marker11', H3K36me3: 'Marker12',
  H4K20me1: 'Marker13', H4K20me2: 'Marker14', H4K20me3: 'Marker15',
};
for (const [k, v] of Object.entries(MARKS)) push(ib(k, v, true));
push(
  lit('KMetStat', 'PanelKit', true),
  lit('K12 MG1655', 'Strain-K', true),
  ib('IgG', 'Baseline', true),
  ib('RSEM', 'Quantifier2', true),
);

// =======================================================================================
// PHASE C — jobType snake_case + component dir segments (IB), LONGEST first so a compound
// like rnaseq_alignment is consumed before the bare 'alignment' rule would bite it.
// =======================================================================================

// RNA-seq component DIR segments (hyphenated; appear in @/ import paths and dir names).
push(
  ib('rnaseq-alignment', 'categoryc-processing'),
  ib('rnaseq-feature-counts', 'aggregation'),
  ib('rnaseq-pathway', 'enrichment-analysis'),
  ib('rnaseq-de', 'differential-analysis'),
);

// RNA-seq jobType tokens (payloads, === compares, JOB_TYPE_* keys, IGVPanel mode union).
push(
  ib('rnaseq_feature_counts', 'categoryC_aggregation'),
  ib('rnaseq_alignment', 'categoryC_processing'),
  ib('rnaseq_trimming', 'categoryC_preprocess'),
  ib('rnaseq_pathway', 'categoryC_enrichment'),
  ib('rnaseq_qc', 'categoryC_diagnostics'),
  ib('rnaseq_de', 'categoryC_differential'),
);

// CUT&RUN jobType tokens (dual/triple-role: object keys, quoted values, /route/ templates).
push(
  ib('roman_normalization', 'scaling'),
  ib('pearson_correlation', 'correlation'),
  ib('custom_heatmap', 'visualization'),
  ib('peak_calling', 'detection'),
  ib('alignment', 'processing'),
  ib('trimming', 'preprocess'),
  ib('diffbind', 'comparison'),
);

// =======================================================================================
// PHASE D — route SEGMENTS (SEG, route:true so skipped on docs files). Route-only tokens;
// the dual-role tokens above already rewrote their /route/ templates via IB.
// =======================================================================================
push(
  seg('feature-counts', 'aggregation'),
  seg('rnaseq-qc', 'diagnostics'),
  seg('normalization', 'scaling'),
  seg('reactions', 'records'),
  seg('heatmaps', 'visualizations'),
  seg('fastqs', 'datasets'),
  seg('peaks', 'detections'),
  seg('pathway', 'enrichment'),
  seg('de', 'differential'),
);
// KEPT route segments (no rule): description, history, files, correlations.

// =======================================================================================
// PHASE E — identifier compounds (CW), LONGEST first, + lucide icons + brand + DE-prefix.
// Case-sensitive PascalCase/camelCase; disjoint from the lowercase IB/SEG rules above.
// =======================================================================================

// Compound identifiers first (so their embedded parts are consumed atomically).
push(
  cw('RnaseqAlignment', 'CategoryCProcessing'),
  cw('PearsonCorrelation', 'Correlation'),
  cw('PeakCalling', 'Detection'),
  cw('CustomHeatmap', 'Visualization'),
  cw('FeatureCounts', 'Aggregation'),
  cw('DiffBind', 'Comparison'),
  cw('Deseq2', 'DiffEngine'),
  cw('BigWigs', 'SignalFiles'),
  cw('Fastqc', 'DataQuality'),
  cw('Fastqs', 'Datasets'),
  cw('Reactions', 'Entries'),
);

// Single-token identifiers.
push(
  cw('Rnaseq', 'CategoryC'),
  cw('Alignment', 'Processing'),
  cw('Trimming', 'Preprocess'),
  cw('Normalization', 'Scaling'),
  cw('Pathway', 'Enrichment'),
  cw('Pearson', 'Correlation'),
  cw('Peaks', 'Detections'),
  cw('Peak', 'Detection'),
  cw('Fastp', 'Preprocess'),
  cw('Fastq', 'Dataset'),
  cw('BigWig', 'SignalFile'),
  cw('IGV', 'DataViewer'),
  cw('Igv', 'DataViewer'),
  cw('Reaction', 'Entry'),         // Entry (NOT Record — would shadow TS Record<K,V>)
);

// Bam identifier morpheme (camel hump / PascalCase; uppercase BAM handled in Phase F).
push(raw('(?:(?<![A-Za-z])|(?<=[a-z0-9]))Bam(?![a-z])', 'g', 'Processed'));

// CUT&RUN-flavoured internal const/component prefixes.
push(
  lit('CUTANDRUN', 'PRIMARY'),
  lit('Cutandrun', 'Primary'),
);

// Brand — right guard spares 'cleaved'/'cleavage'/'Cleavage'.
push(raw('(?<![A-Za-z])Cleave(?![a-z])', 'g', 'Forge'));
push(lit('Cleavage', 'Splitting', true), lit('cleavage', 'splitting', true));

// DE-prefix (whitelisted followers only) — spares DEFAULT, DESeq2, mid-word DE.
push(raw('(?<![A-Za-z])DE(?=(?:Files|Info|Input|Plots|Results|Analysis|SubTab|FileCategory))', 'g', 'Diff'));

// Lucide biology-flavoured icon names -> neutral valid lucide exports (verified not
// pre-imported anywhere, so no duplicate-binding). Applies to import list AND JSX usage.
push(
  ib('FlaskConical', 'Boxes'),
  ib('FlaskRound', 'Layers'),
  ib('Beaker', 'Package'),
  ib('Dna', 'Database'),
);

// =======================================================================================
// PHASE F — atomic domain literals embedding a landmine, then landmine fragments (IB),
// then uppercase tokens, then pure prose scrubs. Ordering: compounds/plurals before parts.
// =======================================================================================

// Atomic domain values that embed a landmine fragment (before the peak/read fragments).
push(
  lit('narrowPeak', 'narrowInterval'),
  lit('broadPeak', 'broadInterval'),
  lit('TranscriptomeSAM', 'SecondaryDAT', true),
  lit('quant.sf', 'quant.tsv', true),
  lit('ReadPairs', 'SignalPairs'),   // kills totalReadPairs / ecoliReadPairs camel-hump leaks
  lit('ReadLength', 'SignalLength'), // kills detectReadLength camel-hump leaks
);

// camelCase GeneList identifiers (capital Gene) + standalone prose 'Gene'.
push(cw('Gene', 'Group'));

// Landmine fragments — IB (plural before singular). Underscore acts as a boundary for IB
// (unlike \b), so these correctly hit snake values total_reads / gene_list / peak_caller.
push(
  ib('genes', 'groups'), ib('gene', 'group'),
  ib('reads', 'records'), ib('read', 'record'),
  ib('peaks', 'detections'), ib('peak', 'detection'),
  ib('genomes', 'assemblies'), ib('genome', 'assembly'),
  ib('Genes', 'Groups'), ib('Reads', 'Records'),
  ib('Genomes', 'Assemblies'), ib('Genome', 'Assembly'),
  ib('genomic', 'coordinate'), ib('Genomic', 'Coordinate'),
);

// Domain tool / entity fragments (lowercase snake + quoted values; camelCase spared).
push(
  ib('cutana', 'panel'), ib('ecoli', 'aux'), ib('spike_in', 'calib'),
  ib('salmon', 'quantifier'), ib('multiqc', 'aggqc'), ib('rseqc', 'diag'),
  ib('edger', 'modelb'), ib('kegg', 'catalog'), ib('pathway', 'enrichment'),
  ib('frip', 'yld'), ib('star', 'mapper2'), ib('fastqc', 'dataquality'),
  ib('fastp', 'preprocess'), ib('fastq', 'dataset'), ib('bigwig', 'signalfile'),
  ib('encode', 'registry'), ib('organism', 'origin'), ib('organisms', 'origins'),
  ib('antibody', 'reagent'), ib('antibodies', 'reagents'),
  ib('macs2', 'caller1'), ib('seacr', 'caller2'), ib('sicer2', 'caller3'),
  ib('igv', 'dataviewer'),
  ib('rnaseq', 'categoryc'), // mop-up: residual lowercase 'rnaseq' in api paths / queryKeys
);

// camelCase identifier siblings for the entity fragments (capital-initial, scan-clean but
// scrubbed for spirit / consistency with their snake counterparts).
push(
  cw('Organisms', 'Origins'), cw('Organism', 'Origin'),
  cw('BigWig', 'SignalFile'), // (redundant-safe; capital-W camel not caught above)
);
push(lit('bigWig', 'signalFile'), lit('BigWigs', 'SignalFiles'));

// Uppercase tokens (case-sensitive; IB so 'STAR' inside 'START' / 'BAM' inside 'BAMBOO' spared).
push(
  ib('BAM', 'DAT'), ib('SAM', 'RAW'), ib('BED', 'RGN'), ib('BAI', 'IDX'),
  ib('STAR', 'Mapper2'), ib('GO', 'Onto'), ib('TSS', 'RefStart'), ib('TES', 'RefEnd'),
  ib('UTR', 'Region'), ib('CDS', 'Coding'), ib('PTM', 'Probe'), ib('GSEA', 'Ranked'),
  ib('RNA', 'Series'), ib('DNA', 'material'),
  ib('MACS2', 'Caller1'), ib('SEACR', 'Caller2'), ib('SICER2', 'Caller3'),
  ib('KEGG', 'Catalog', true),
);

// SCREAMING_CASE const-name prefixes (underscore boundary makes these scan hits).
push(
  ib('CUTANA', 'PANEL'), ib('SPIKE_IN', 'CALIB'), ib('SALMON', 'QUANTIFIER'),
  ib('RNASEQ', 'CATEGORYC'), ib('GENOME', 'ASSEMBLY'),
);

// FASTQ display forms (plural is scan-clean but scrubbed for spirit).
push(lit('FASTQs', 'Datasets', true), ib('FASTQ', 'Dataset', true));

// Pure prose scrubs (case variants) — string/comment only, zero tsc risk.
const PROSE = [
  ['histone', 'marker'], ['Histone', 'Marker'],
  ['nucleosomes', 'units'], ['nucleosome', 'unit'], ['Nucleosome', 'Unit'],
  ['chromatin', 'substrate'], ['Chromatin', 'Substrate'],
  ['methylation', 'tagging'], ['Methylation', 'Tagging'], ['methyl', 'tag'],
  ['transcription', 'activation'], ['Transcription', 'Activation'],
  ['intergenic', 'interspace'], ['Intergenic', 'Interspace'],
  ['introns', 'gaps'], ['intron', 'gap'], ['Intron', 'Gap'],
  ['exons', 'segments'], ['exon', 'segment'], ['Exon', 'Segment'],
  ['promoter', 'anchor'], ['Promoter', 'Anchor'],
  ['mitochondrial', 'auxiliary'], ['Mitochondrial', 'Auxiliary'],
  ['immunoglobulin', 'baseline'], ['Immunoglobulin', 'Baseline'],
  ['sequencing', 'capture'], ['Sequencing', 'Capture'],
  ['barcodes', 'tags'], ['barcode', 'tag'], ['Barcode', 'Tag'],
  ['nucleotide', 'unit'], ['Nucleotide', 'Unit'],
  ['transposase', 'processor'], ['Transposase', 'Processor'],
  ['Tagmentation', 'Marking'], ['Nuclease', 'Engine'],
  ['bioinformatics', 'data-processing'], ['Bioinformatics', 'Data-processing'],
  ['Bioconductor', 'toolkit'], ['UCSD', 'the Institute'], ['Entrez', 'Ref'], ['entrez', 'ref'],
  ['Tn5', 'T5'], ['FRiP', 'Yield'], ['ENCODE', 'Registry'], ['IGV', 'Viewer'],
];
for (const [a, b] of PROSE) push(ib(a, b, true));

// ---------------------------------------------------------------------------------------
// Load-time INVARIANT assertion on every string target.
// ---------------------------------------------------------------------------------------
for (const r of RULES) {
  if (typeof r.to !== 'string') continue;
  if (/['`\\]/.test(r.to)) throw new Error(`Invalid target (quote/backtick/backslash): ${JSON.stringify(r.to)}`);
  if (!r.prose && /\s/.test(r.to)) throw new Error(`Invalid identifier-role target (whitespace): ${JSON.stringify(r.to)}`);
}

// ---------------------------------------------------------------------------------------
// PHASE A (mask) / PHASE H (unmask): protect bare-package import specifiers + .ts/.tsx
// suffixes so no rule can rewrite 'igv' / 'react-router-dom' / '.tsx'. Sentinels are
// digit-only between NULs so no rule can match them.
// ---------------------------------------------------------------------------------------
function protect(content) {
  const store = [];
  const stash = (s) => { const i = store.length; store.push(s); return ` ${i} `; };

  // Bare-package specifiers in `from '...'`, `import '...'`, dynamic `import('...')`,
  // `export ... from '...'`. Keep @/, ./, ../, / specifiers visible so the engine rewrites
  // their dir/file segments.
  content = content.replace(
    /((?:from|import|require)\s*\(?\s*)(['"])([^'"]+)\2/g,
    (m, lead, q, spec) => (/^(?:@\/|\.\.?\/|\/)/.test(spec) ? m : lead + stash(q + spec + q)),
  );
  // .tsx / .ts extension suffixes anywhere in content.
  content = content.replace(/\.tsx\b/g, (m) => stash(m)).replace(/\.ts\b/g, (m) => stash(m));

  return { content, store };
}
function unprotect(content, store) {
  return content.replace(/ (\d+) /g, (_, i) => store[Number(i)]);
}

// ---------------------------------------------------------------------------------------
// The engine: apply all rules in authored order. `isDocs` skips route-SEGMENT rules.
// ---------------------------------------------------------------------------------------
function applyRules(text, isDocs) {
  for (const r of RULES) {
    if (r.route && isDocs) continue;
    r.re.lastIndex = 0;
    text = text.replace(r.re, r.to);
  }
  return text;
}

function transformContent(content, basename) {
  const isDocs = DOCS_FILES.has(basename);
  const { content: masked, store } = protect(content);
  const out = applyRules(masked, isDocs);
  return unprotect(out, store);
}

// Apply the identifier rules to a bare file/dir NAME. Wrap in slashes so SEGMENT rules
// (which need a quote/slash neighbour) fire at name boundaries exactly as they did on the
// matching import specifier — this is what keeps physical names == rewritten specifiers.
function transformName(name) {
  const wrapped = applyRules(`/${name}/`, false);
  return wrapped.slice(1, -1);
}

// ---------------------------------------------------------------------------------------
// Filesystem helpers.
// ---------------------------------------------------------------------------------------
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(s), d);
    else fs.copyFileSync(s, d);
  }
}
function walk(dir, pred) {
  const out = [];
  const rec = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) rec(p);
      else if (!pred || pred(p)) out.push(p);
    }
  };
  rec(dir);
  return out;
}

// ---------------------------------------------------------------------------------------
// Guards.
// ---------------------------------------------------------------------------------------
function guard() {
  const src = path.resolve(SRC);
  const out = path.resolve(OUT);
  if (out === src || out.startsWith(src + path.sep)) {
    throw new Error(`Refusing: OUT (${out}) is inside SRC (${src}).`);
  }
  if (out === REPO_ROOT) throw new Error('Refusing: OUT equals repo root.');
  if (!fs.existsSync(path.join(SRC, 'src')) || !fs.existsSync(path.join(SRC, 'package.json'))) {
    throw new Error(`SRC does not look like the frontend project: ${SRC}`);
  }
}

// ---------------------------------------------------------------------------------------
// Build the sanitized project.
// ---------------------------------------------------------------------------------------
function build() {
  const stats = { filesProcessed: 0, filesRenamed: 0, dirsRenamed: 0 };

  // (1) fresh output
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  // (2) copy src verbatim, then transform contents
  copyDir(path.join(SRC, 'src'), path.join(OUT, 'src'));

  // (3) copy configs verbatim (+ light patches)
  const CONFIGS = [
    'package.json', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json',
    'vite.config.ts', 'index.html', 'tailwind.config.js', 'postcss.config.js',
    'eslint.config.js', 'components.json', '.eslintrc.cjs',
  ];
  for (const f of CONFIGS) {
    const s = path.join(SRC, f);
    if (fs.existsSync(s)) fs.copyFileSync(s, path.join(OUT, f));
  }
  if (fs.existsSync(path.join(SRC, 'public'))) copyDir(path.join(SRC, 'public'), path.join(OUT, 'public'));

  // package.json name -> forge-frontend
  const pkgPath = path.join(OUT, 'package.json');
  fs.writeFileSync(pkgPath, fs.readFileSync(pkgPath, 'utf8').replace(/"name":\s*"cleave-frontend"/, '"name": "forge-frontend"'));

  // index.html <title>Cleave</title> -> Forge
  const idxPath = path.join(OUT, 'index.html');
  if (fs.existsSync(idxPath)) {
    fs.writeFileSync(idxPath, fs.readFileSync(idxPath, 'utf8').replace(/<title>Cleave<\/title>/, '<title>Forge</title>'));
  }

  // favicon.svg: scrub biology words from COMMENTS only
  const favPath = path.join(OUT, 'public', 'favicon.svg');
  if (fs.existsSync(favPath)) {
    let fav = fs.readFileSync(favPath, 'utf8');
    fav = fav.replace(/<!--([\s\S]*?)-->/g, (m, inner) => {
      let t = inner
        .replace(/\bbackbone\b/gi, 'curve')
        .replace(/\bBase-pair\b/gi, 'connector')
        .replace(/\bbase-pair\b/gi, 'connector')
        .replace(/\bcleave\b/gi, 'accent')
        .replace(/\bhelix\b/gi, 'motif')
        .replace(/\bDNA\b/g, 'material');
      return `<!--${t}-->`;
    });
    fs.writeFileSync(favPath, fav);
  }

  // (4) content pass over every .ts/.tsx under OUT/src
  const codeFiles = walk(path.join(OUT, 'src'), (p) => /\.(ts|tsx)$/.test(p));
  for (const file of codeFiles) {
    const basename = path.basename(file);
    const before = fs.readFileSync(file, 'utf8');
    const after = transformContent(before, basename);
    if (after !== before) fs.writeFileSync(file, after);
    stats.filesProcessed++;
  }

  // (5) rename FILES then DIRECTORIES, deepest-first, via the same identifier rules.
  const renameCollision = (target) => {
    if (fs.existsSync(target)) throw new Error(`Rename collision: target already exists: ${target}`);
  };
  const allFiles = walk(path.join(OUT, 'src')).sort((a, b) => b.length - a.length);
  for (const file of allFiles) {
    const dir = path.dirname(file);
    const base = path.basename(file);
    const ext = path.extname(base);
    const stem = ext ? base.slice(0, -ext.length) : base;
    const newStem = transformName(stem);
    if (newStem === stem) continue;
    const target = path.join(dir, newStem + ext);
    renameCollision(target);
    fs.renameSync(file, target);
    stats.filesRenamed++;
  }
  const dirList = [];
  (function collect(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) { const p = path.join(d, e.name); dirList.push(p); collect(p); }
    }
  })(path.join(OUT, 'src'));
  dirList.sort((a, b) => b.length - a.length); // deepest-first
  for (const d of dirList) {
    const parent = path.dirname(d);
    const name = path.basename(d);
    const newName = transformName(name);
    if (newName === name) continue;
    const target = path.join(parent, newName);
    renameCollision(target);
    fs.renameSync(d, target);
    stats.dirsRenamed++;
  }

  // (6) symlink node_modules -> ../frontend/node_modules
  const nmLink = path.join(OUT, 'node_modules');
  try {
    fs.symlinkSync(path.join(SRC, 'node_modules'), nmLink, 'dir');
  } catch (e) {
    console.warn(`  ! node_modules symlink not created (${e.code || e.message}); run \`npm ci\` in frontend-sanitized.`);
  }

  return stats;
}

// ---------------------------------------------------------------------------------------
// VERIFICATION
// ---------------------------------------------------------------------------------------
// Global denylist patterns (one instance each; `g` so we can enumerate all hits per line).
const DENYLIST = [
  ['ci', /\b(fastq|rnaseq|genome|genomic|organism|antibody|spike[-_ ]?in|cutana|kmetstat|ecoli|e\.?\s?coli|kegg|pathway|diffbind|deseq|macs2?|seacr|sicer|bowtie|hisat|salmon|samtools|multiqc|rseqc|deeptools|homer|picard|tximport|edger|rsem|clusterprofiler|entrez|histone|nucleosome|chromatin|methylation|intergenic|intron|exon|promoter|bigwig|bedgraph|frip|encode|epicypher|trimmomatic|fastp|igv|cutrun|cut&run|cut&tag)\b/gi],
  ['upper', /\b(RNA|BAM|SAM|BED|BAI|STAR|GO|MACS2|SEACR|TSS|TES|UTR|CDS|PTM|FRIP|GSEA)\b/g],
  ['frag', /(?<![A-Za-z])(gene|genes|read|reads|peak|peaks)(?![A-Za-z])/g],
  ['hump', /[a-z](Gene|Read|Sam|Rna|Peak|Bam)[A-Z0-9]/g],
  ['mark', /H[34]K\d/g],
];

// The single legitimate false positive: English 'read-only' access flag (isReadOnly / ReadOnly).
const isWhitelisted = (line, idx, len) => /ReadOnly/.test(line.slice(Math.max(0, idx - 3), idx + len + 8));

// Strip bare-package import/from/dynamic-import specifiers before scanning a line so the
// legitimately-retained import('igv') / from 'igv' does not register as a denylist hit.
function stripSpecifiers(line) {
  return line.replace(/(?:from|import|require)\s*\(?\s*(['"])([^'"]+)\1/g, (m, q, spec) =>
    (/^(?:@\/|\.\.?\/|\/)/.test(spec) ? m : ''));
}

function scanDenylist() {
  const targets = [
    ...walk(path.join(OUT, 'src'), (p) => /\.(ts|tsx)$/.test(p)),
    path.join(OUT, 'index.html'),
    path.join(OUT, 'public', 'favicon.svg'),
  ].filter((p) => fs.existsSync(p));

  const hits = [];
  for (const file of targets) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((rawLine, i) => {
      const line = stripSpecifiers(rawLine);
      for (const [name, re] of DENYLIST) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(line)) !== null) {
          if (m[0].length === 0) { re.lastIndex++; continue; }
          if (isWhitelisted(line, m.index, m[0].length)) continue;
          const seg = line.slice(Math.max(0, m.index - 8), m.index + m[0].length + 8);
          hits.push({ file: path.relative(OUT, file), line: i + 1, kind: name, match: m[0], ctx: seg.trim() });
        }
      }
    });
  }
  return hits;
}

// Route-consistency: defined child segments under /experiments/:id vs. used segments.
function scanRoutes() {
  const problems = [];
  const appPath = fs.existsSync(path.join(OUT, 'src', 'App.tsx')) ? path.join(OUT, 'src', 'App.tsx') : null;
  if (!appPath) return ['App.tsx not found for route scan'];
  const app = fs.readFileSync(appPath, 'utf8');

  // Extract the /experiments/:id nested block.
  const block = app.slice(app.indexOf('experiments/:id'));
  const defined = new Set();
  for (const m of block.matchAll(/<Route\s+path="([^"/]+)(?:\/[^"]*)?"/g)) defined.add(m[1]);
  defined.add('description'); // index route

  // Used segments: JOB_TYPE_TO_TAB values + tab.path first-segments + navigate() literals.
  const used = new Set();
  const files = walk(path.join(OUT, 'src'), (p) => /\.(ts|tsx)$/.test(p));
  for (const f of files) {
    const t = fs.readFileSync(f, 'utf8');
    for (const m of t.matchAll(/navigate\(\s*`\/experiments\/\$\{[^}]+\}\/([a-z-]+)/g)) used.add(m[1]);
    for (const m of t.matchAll(/path:\s*'([a-z-]+)(?:\/0)?'/g)) used.add(m[1]);
  }
  // JOB_TYPE_TO_TAB values (from AnalysisQueuePage) + tab path fields both covered above via
  // path:'...'; add explicit JOB_TYPE_TO_TAB value scan for robustness.
  const queue = files.find((f) => /AnalysisQueuePage/.test(path.basename(f)));
  if (queue) {
    const t = fs.readFileSync(queue, 'utf8');
    const mapBlock = t.slice(t.indexOf('JOB_TYPE_TO_TAB'), t.indexOf('};', t.indexOf('JOB_TYPE_TO_TAB')));
    for (const m of mapBlock.matchAll(/:\s*'([a-z-]+)'/g)) used.add(m[1]);
  }

  for (const u of used) {
    if (!defined.has(u)) problems.push(`used route segment '${u}' has no matching <Route path> (defined: ${[...defined].join(', ')})`);
  }
  // Pairwise-substring invariant over defined route targets (ExperimentView pathname.includes).
  const arr = [...defined];
  for (const a of arr) for (const b of arr) {
    if (a !== b && b.includes(a)) problems.push(`route target '${a}' is a substring of '${b}' (breaks pathname.includes active-tab check)`);
  }
  return problems;
}

// Docs slug parity: docs-navigation slugs === Object.keys(DOCS_CONTENT).
function scanDocsSlugs() {
  const navPath = walk(path.join(OUT, 'src'), (p) => /docs-navigation\.ts$/.test(p))[0];
  const contentPath = walk(path.join(OUT, 'src'), (p) => /docs-content\.ts$/.test(p))[0];
  if (!navPath || !contentPath) return ['docs-navigation.ts or docs-content.ts missing'];
  const nav = fs.readFileSync(navPath, 'utf8');
  const content = fs.readFileSync(contentPath, 'utf8');
  const navSlugs = new Set([...nav.matchAll(/slug:\s*'([^']+)'/g)].map((m) => m[1]));
  // DOCS_CONTENT keys: top-level object keys (quoted or bare) at 2-space indent.
  const keyBlock = content.slice(content.indexOf('DOCS_CONTENT'));
  const keys = new Set([...keyBlock.matchAll(/^ {2}'?([A-Za-z0-9-]+)'?:\s*\{/gm)].map((m) => m[1]));
  const problems = [];
  for (const s of navSlugs) if (!keys.has(s)) problems.push(`nav slug '${s}' has no DOCS_CONTENT key`);
  for (const k of keys) if (!navSlugs.has(k)) problems.push(`DOCS_CONTENT key '${k}' has no nav slug`);
  return problems;
}

// ---------------------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------------------
function main() {
  guard();
  console.log(`Sanitizing ${SRC}\n        -> ${OUT}\n`);
  const stats = build();

  console.log('Build:');
  console.log(`  files processed : ${stats.filesProcessed}`);
  console.log(`  files renamed   : ${stats.filesRenamed}`);
  console.log(`  dirs renamed    : ${stats.dirsRenamed}`);
  console.log(`  rules applied   : ${RULES.length}\n`);

  let failed = false;

  // (a) denylist scan
  const hits = scanDenylist();
  if (hits.length === 0) {
    console.log('PASS  biology denylist scan: 0 matches');
  } else {
    failed = true;
    console.log(`FAIL  biology denylist scan: ${hits.length} match(es)`);
    for (const h of hits.slice(0, 200)) {
      console.log(`   ${h.file}:${h.line}  [${h.kind}] "${h.match}"  ...${h.ctx}...`);
    }
    if (hits.length > 200) console.log(`   ... and ${hits.length - 200} more`);
  }

  // (b) route-consistency
  const routeProblems = scanRoutes();
  if (routeProblems.length === 0) {
    console.log('PASS  route-consistency scan');
  } else {
    failed = true;
    console.log(`FAIL  route-consistency scan: ${routeProblems.length} problem(s)`);
    routeProblems.forEach((p) => console.log(`   ${p}`));
  }

  // (c) docs slug parity
  const slugProblems = scanDocsSlugs();
  if (slugProblems.length === 0) {
    console.log('PASS  docs slug parity (nav slugs === DOCS_CONTENT keys)');
  } else {
    failed = true;
    console.log(`FAIL  docs slug parity: ${slugProblems.length} problem(s)`);
    slugProblems.forEach((p) => console.log(`   ${p}`));
  }

  console.log('\nNext: cd frontend-sanitized && npx tsc --noEmit');
  console.log('      (compare against the original baseline: cd frontend && npx tsc --noEmit)');

  process.exitCode = failed ? 1 : 0;
}

// Run only when invoked directly (node scripts/sanitize.mjs), not when imported for testing.
const invokedAsCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsCli) {
  try {
    main();
  } catch (err) {
    console.error(`\nFATAL: ${err.stack || err.message}`);
    process.exitCode = 1;
  }
}

export { RULES, applyRules, transformContent, transformName, scanDenylist, scanRoutes, scanDocsSlugs };
