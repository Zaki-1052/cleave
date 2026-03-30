// frontend/src/lib/docs-content.ts

export type ContentBlock =
  | { type: 'heading'; level: 2 | 3 | 4; text: string; id: string }
  | { type: 'paragraph'; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'steps'; items: { title: string; description: string }[] }
  | { type: 'callout'; variant: 'tip' | 'warning' | 'note'; text: string }
  | { type: 'code'; language: string; content: string }
  | { type: 'separator' };

export type DocsPageData = {
  title: string;
  description: string;
  blocks: ContentBlock[];
};

export const DOCS_CONTENT: Record<string, DocsPageData> = {
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Getting Started
  // ─────────────────────────────────────────────────────────────────────────────
  'getting-started': {
    title: 'Getting Started',
    description:
      'Platform overview, what Cleave does, and how it compares to CUTANA Cloud.',
    blocks: [
      {
        type: 'heading',
        level: 2,
        text: 'Platform Overview',
        id: 'platform-overview',
      },
      {
        type: 'paragraph',
        text: 'Cleave is a self-hosted bioinformatics web platform for CUT&RUN and CUT&Tag data analysis, built for the Ferguson Lab at UCSD. It replicates the core functionality of EpiCypher\'s CUTANA Cloud and extends it with lab-specific features -- FASTQ trimming, SEACR peak calling, MACS2 broad mode, DiffBind differential analysis, custom heatmaps, Pearson correlation, Roman normalization, and one-click auto-pipeline mode.',
      },
      {
        type: 'paragraph',
        text: 'Cleave runs on a single AWS EC2 instance and is designed for ~8-10 lab members. No command-line tools or bioinformatics expertise is required -- the entire workflow is GUI-driven, from FASTQ upload through publication-ready outputs.',
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 2,
        text: 'What Cleave Does',
        id: 'what-cleave-does',
      },
      {
        type: 'paragraph',
        text: 'Upload paired-end FASTQ files, run a validated analysis pipeline, and generate publication-ready outputs -- all from a web browser:',
      },
      {
        type: 'list',
        ordered: true,
        items: [
          '<strong>Upload</strong> FASTQ files (drag-and-drop, resumable uploads, or FTP/SFTP import)',
          '<strong>QC</strong> with automatic FastQC reports',
          '<strong>Trim</strong> adapters and quality-filter reads (Trimmomatic + kseq 42bp fixed-length)',
          '<strong>Align</strong> reads to a reference genome (Bowtie2 + SAMtools + BEDTools + Picard + deepTools)',
          '<strong>Call peaks</strong> using MACS2, SICER2, or SEACR with HOMER annotation',
          '<strong>Visualize</strong> in an embedded genome browser (IGV.js) and enrichment heatmaps',
          '<strong>Extend</strong> with DiffBind differential analysis, custom heatmaps, Pearson correlation, and Roman normalization',
          '<strong>Download</strong> all output files (BAMs, bigWigs, BEDs, QC reports, heatmaps)',
        ],
      },
      {
        type: 'callout',
        variant: 'tip',
        text: '<strong>Auto-pipeline mode</strong> chains steps 2-5 into a single one-click operation.',
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 2,
        text: 'Cleave vs. CUTANA Cloud',
        id: 'cleave-vs-cutana-cloud',
      },
      {
        type: 'paragraph',
        text: 'Cleave includes every feature available in CUTANA Cloud, plus significant lab-specific extensions:',
      },
      {
        type: 'table',
        headers: ['Feature', 'CUTANA Cloud', 'Cleave'],
        rows: [
          ['FASTQ upload + FastQC', 'Yes', 'Yes'],
          ['FTP/SFTP server import', 'Yes', 'Yes'],
          ['Bowtie2 alignment + QC', 'Yes', 'Yes'],
          ['MACS2 narrow peaks', 'Yes', 'Yes'],
          ['SICER2 broad peaks', 'Yes', 'Yes'],
          ['SEACR peak calling', '--', 'Yes'],
          ['MACS2 broad mode', '--', 'Yes'],
          ['FASTQ trimming (Trimmomatic + kseq)', '--', 'Yes'],
          ['Fragment size filter (<120bp)', '--', 'Yes'],
          ['DiffBind differential analysis', '--', 'Yes'],
          ['Custom reference-point heatmaps', '--', 'Yes'],
          ['Pearson correlation matrices', '--', 'Yes'],
          ['Roman normalization (mouse)', '--', 'Yes'],
          ['SNAP-CUTANA spike-in QC', 'Yes', 'Yes'],
          ['E. coli spike-in normalization', 'Yes', 'Yes'],
          ['IGV.js genome browser', 'Yes', 'Yes'],
          ['Auto-generated methods text', 'Yes', 'Yes'],
          ['Parallel pipeline processing', '--', 'Yes'],
          ['Dark mode', '--', 'Yes'],
          ['One-click auto-pipeline', '--', 'Yes'],
          ['Self-hosted (no per-credit cost)', '--', 'Yes'],
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Data Hierarchy
  // ─────────────────────────────────────────────────────────────────────────────
  'data-hierarchy': {
    title: 'Data Hierarchy',
    description:
      'How projects, experiments, files, and analysis results are organized in Cleave.',
    blocks: [
      {
        type: 'heading',
        level: 2,
        text: 'Data Hierarchy',
        id: 'data-hierarchy',
      },
      {
        type: 'paragraph',
        text: 'Cleave organizes data in a hierarchical structure. A <strong>Project</strong> is the top-level container shared among lab members. Each project contains one or more <strong>Experiments</strong>, which hold all sequencing data, metadata, and analysis results for a particular study.',
      },
      {
        type: 'code',
        language: 'text',
        content: `Project (shared workspace with access controls)
└── Experiment (analysis hub for a set of reactions)
    ├── FASTQ Files (paired-end sequencing data)
    ├── Reactions (sample metadata linked to FASTQs)
    ├── Trimming Run(s) (adapter + quality trimming)
    ├── Alignment Run(s) (maps reads to reference genome)
    │   ├── QC Report (alignment stats, spike-in, heatmaps)
    │   ├── Unique BAMs, bigWigs, heatmaps
    │   └── IGV visualization
    ├── Peak Calling Run(s) (identifies enriched regions)
    │   ├── QC Report (FRiP, annotation plots)
    │   ├── BED files, annotation files
    │   └── IGV visualization
    └── Lab Extensions
        ├── DiffBind (differential peak analysis)
        ├── Custom Heatmaps (reference-point heatmaps)
        ├── Pearson Correlation (replicate concordance)
        └── Roman Normalization (mouse bigWig normalization)`,
      },
      {
        type: 'callout',
        variant: 'note',
        text: 'Each experiment is self-contained -- it has its own FASTQ files, reactions, and analysis runs. You can run multiple alignments or peak calling runs within the same experiment to compare different parameters.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Projects
  // ─────────────────────────────────────────────────────────────────────────────
  projects: {
    title: 'Projects',
    description:
      'Creating projects, member roles, and managing collaborators.',
    blocks: [
      {
        type: 'heading',
        level: 2,
        text: 'Projects',
        id: 'projects',
      },
      {
        type: 'paragraph',
        text: 'A <strong>Project</strong> is a shared workspace where authorized lab members manage data analysis across one or more Experiments.',
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Creating a Project',
        id: 'creating-a-project',
      },
      {
        type: 'steps',
        items: [
          {
            title: 'Open the dashboard',
            description:
              'Click <strong>New Project</strong> from the dashboard.',
          },
          {
            title: 'Enter details',
            description:
              'Enter a project name and optional description.',
          },
          {
            title: 'Automatic admin role',
            description:
              'The project creator is automatically assigned the <strong>Admin</strong> role.',
          },
        ],
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Member Roles',
        id: 'member-roles',
      },
      {
        type: 'table',
        headers: ['Role', 'Capabilities'],
        rows: [
          [
            'Admin',
            'Full project control: manage members, edit/delete project, create experiments, run analyses, download files.',
          ],
          [
            'Contributor',
            'Create experiments, upload FASTQs, run analyses, download files. Cannot manage members or delete the project.',
          ],
          [
            'Viewer',
            'Read-only access to all project data and files. Cannot upload, run analyses, or modify anything.',
          ],
        ],
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Managing Members',
        id: 'managing-members',
      },
      {
        type: 'steps',
        items: [
          {
            title: 'Navigate to your project',
            description: "Navigate to your project's detail page.",
          },
          {
            title: 'Open member management',
            description: 'Click <strong>Manage Members</strong>.',
          },
          {
            title: 'Invite users',
            description:
              'Invite users by email address and assign a role (default: Contributor).',
          },
          {
            title: 'Manage existing members',
            description:
              'Admins can change roles or remove members at any time.',
          },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Experiments
  // ─────────────────────────────────────────────────────────────────────────────
  experiments: {
    title: 'Experiments',
    description:
      'Creating experiments, understanding status, and navigating experiment tabs.',
    blocks: [
      {
        type: 'heading',
        level: 2,
        text: 'Experiments',
        id: 'experiments',
      },
      {
        type: 'paragraph',
        text: 'An <strong>Experiment</strong> is the central hub within a Project for conducting a CUT&RUN or CUT&Tag analysis. Each experiment contains its own FASTQ files, reaction metadata, and analysis results.',
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Creating an Experiment',
        id: 'creating-an-experiment',
      },
      {
        type: 'paragraph',
        text: 'A 3-step wizard guides you through experiment creation:',
      },
      {
        type: 'steps',
        items: [
          {
            title: 'Details',
            description:
              'Provide the experiment name (up to 100 characters), select assay type (<strong>CUT&RUN</strong> or <strong>CUT&Tag</strong>), and add an optional description.',
          },
          {
            title: 'FASTQs',
            description: 'Upload or import your sequencing files.',
          },
          {
            title: 'Reactions',
            description:
              'Define sample metadata linking FASTQs to biological conditions.',
          },
        ],
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Experiment Status',
        id: 'experiment-status',
      },
      {
        type: 'table',
        headers: ['Status', 'Meaning'],
        rows: [
          ['New', 'Created but no analyses run yet.'],
          ['In Progress', 'One or more analyses are currently running.'],
          ['Complete', 'All analyses finished successfully.'],
          ['Error', 'One or more analyses encountered an error.'],
          ['Terminated', 'User cancelled an analysis in progress.'],
        ],
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Experiment Tabs',
        id: 'experiment-tabs',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          '<strong>Description</strong> -- Experiment details and metadata',
          '<strong>FASTQs</strong> -- Uploaded sequencing files with FastQC reports',
          '<strong>Reactions</strong> -- Sample metadata sheet',
          '<strong>Alignment</strong> -- Alignment runs with QC reports, files, and IGV browser',
          '<strong>Peak Calling</strong> -- Peak calling runs with QC reports, annotation plots, and IGV',
          '<strong>DiffBind</strong> -- Differential peak analysis results',
          '<strong>Custom Heatmaps</strong> -- Reference-point heatmap results',
          '<strong>Pearson Correlation</strong> -- Correlation matrix results',
          '<strong>Normalization</strong> -- Roman normalization results',
          '<strong>History</strong> -- Audit log of all actions taken on this experiment',
          '<strong>All Files</strong> -- Hierarchical file browser with batch download',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. FASTQ Files
  // ─────────────────────────────────────────────────────────────────────────────
  fastqs: {
    title: 'FASTQ Files',
    description:
      'Sequencing requirements, file naming, upload methods, and FastQC reports.',
    blocks: [
      {
        type: 'heading',
        level: 2,
        text: 'FASTQ Files',
        id: 'fastq-files',
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Sequencing Requirements',
        id: 'sequencing-requirements',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          '<strong>Paired-end sequencing only</strong> -- Cleave requires paired-end data (R1 and R2 files per sample).',
          '<strong>Recommended:</strong> 2x50 bp sequencing for CUT&RUN libraries.',
          'Longer sequencing runs (e.g., 2x150 bp) will contain adapter sequences -- use Cleave\'s built-in trimming step to handle this automatically.',
          'Supported formats: <code>.fastq.gz</code> (gzipped FASTQ).',
        ],
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'File Naming',
        id: 'file-naming',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          'R1 and R2 files must share the same filename except for the R1/R2 designation.',
          'Files should preserve the standard Illumina suffix: <code>..._L001_R1_001.fastq.gz</code> / <code>..._L001_R2_001.fastq.gz</code>.',
          'The <strong>FASTQ Prefix</strong> is the shared portion of the filename between R1 and R2, and is used to link files to reactions.',
        ],
      },
      {
        type: 'callout',
        variant: 'note',
        text: '<strong>Example:</strong> For files <code>230301_ctrl_H3K4me3_S1_L001_R1_001.fastq.gz</code> and <code>230301_ctrl_H3K4me3_S1_L001_R2_001.fastq.gz</code>, the prefix is <code>230301_ctrl_H3K4me3_S1_L001</code>.',
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Upload Methods',
        id: 'upload-methods',
      },
      {
        type: 'heading',
        level: 4,
        text: '1. Local Upload (Browser)',
        id: 'local-upload',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          '<strong>During experiment creation:</strong> Use the drag-and-drop area or Browse button in Step 2.',
          '<strong>After creation:</strong> Navigate to the FASTQs tab and click <strong>+ Add FASTQs</strong>.',
          'Uploads use the <strong>tus protocol</strong> (chunked and resumable) -- if your connection drops during a multi-GB upload, it will resume from where it left off.',
        ],
      },
      {
        type: 'heading',
        level: 4,
        text: '2. FTP/SFTP Server Import',
        id: 'ftp-sftp-import',
      },
      {
        type: 'paragraph',
        text: 'For files on a remote server (e.g., IGM sequencing facility):',
      },
      {
        type: 'steps',
        items: [
          {
            title: 'Open import dialog',
            description:
              'Navigate to the FASTQs tab and click <strong>Import from Server</strong>.',
          },
          {
            title: 'Enter credentials',
            description:
              'Enter the server hostname, port, username, and password.',
          },
          {
            title: 'Save credentials (optional)',
            description:
              'Optionally save the server credentials for future use.',
          },
          {
            title: 'Browse and select',
            description:
              'Browse the remote directory tree and select the FASTQ files to import.',
          },
          {
            title: 'Start import',
            description:
              'Click <strong>Import</strong> -- files transfer in the background with progress tracking.',
          },
        ],
      },
      {
        type: 'callout',
        variant: 'warning',
        text: '<strong>Security:</strong> Cleave blocks connections to private IP ranges, localhost, and AWS metadata endpoints to prevent SSRF attacks. Saved server passwords are encrypted at rest with Fernet (AES-128-CBC).',
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'FastQC Reports',
        id: 'fastqc-reports',
      },
      {
        type: 'paragraph',
        text: 'FastQC reports are automatically generated for each uploaded FASTQ file. Access them via the icon link next to each file in the FASTQs table. Reports include:',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          'Per-base sequence quality',
          'Per-sequence quality scores',
          'Per-base sequence content',
          'GC content distribution',
          'Sequence duplication levels',
          'Adapter content (key indicator for whether trimming is needed)',
          'Overrepresented sequences',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Reactions
  // ─────────────────────────────────────────────────────────────────────────────
  reactions: {
    title: 'Reactions (Sample Metadata)',
    description:
      'Required and optional fields, creation methods, and CSV import.',
    blocks: [
      {
        type: 'heading',
        level: 2,
        text: 'Reactions (Sample Metadata)',
        id: 'reactions',
      },
      {
        type: 'paragraph',
        text: 'A <strong>Reaction</strong> represents a single CUT&RUN or CUT&Tag sample, identified by its FASTQ Prefix.',
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Required Fields',
        id: 'required-fields',
      },
      {
        type: 'table',
        headers: ['Field', 'Description'],
        rows: [
          [
            'FASTQ Prefix',
            'The shared portion of the R1/R2 filenames. Auto-detected from uploaded FASTQs.',
          ],
          [
            'Short Name',
            'A unique label for figures and outputs. Must be unique per organism within the experiment.',
          ],
          [
            'Organism',
            'Reference genome organism: Mouse (mm10), Human (hg38/hg19), Drosophila (dm6), or Yeast (sacCer3).',
          ],
          ['Assay Type', 'CUT&RUN or CUT&Tag.'],
          [
            'CUTANA Spike-in',
            'The SNAP-CUTANA spike-in panel used, or "None". Do not leave blank.',
          ],
          [
            'CUTANA Spike-in Target',
            'The on-target spike-in for this reaction (e.g., "H3K4me3", "Unmodified" for IgG).',
          ],
          [
            'E. coli Spike-in',
            'Whether the reaction contains CUTANA E. coli Spike-in DNA (Yes/No).',
          ],
        ],
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Optional Fields',
        id: 'optional-fields',
      },
      {
        type: 'paragraph',
        text: 'Available via column customization: Cell Type, Cell Number, Sample Prep, Experimental Condition, Antibody Vendor, Antibody Cat No, Antibody Lot No, CUTANA Spike-in 2, CUTANA Spike-in Target 2.',
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Creating Reactions',
        id: 'creating-reactions',
      },
      {
        type: 'paragraph',
        text: 'Three methods:',
      },
      {
        type: 'list',
        ordered: true,
        items: [
          '<strong>Manual entry:</strong> Click <strong>+ Add Reaction</strong> and fill in the fields.',
          '<strong>CSV import:</strong> Download the CSV template, fill it in, and upload. All-or-nothing validation -- if any row has errors, none are imported.',
          '<strong>Bulk create:</strong> Use the JSON bulk creation endpoint for programmatic access.',
        ],
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Auto-Detected Prefixes',
        id: 'auto-detected-prefixes',
      },
      {
        type: 'paragraph',
        text: 'Cleave automatically detects FASTQ prefixes from uploaded files and presents them in a dropdown when creating reactions. This eliminates manual prefix entry errors.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Reference Genomes
  // ─────────────────────────────────────────────────────────────────────────────
  'reference-genomes': {
    title: 'Supported Reference Genomes',
    description:
      'Organisms, genome builds, and feature support per reference genome.',
    blocks: [
      {
        type: 'heading',
        level: 2,
        text: 'Supported Reference Genomes',
        id: 'supported-reference-genomes',
      },
      {
        type: 'paragraph',
        text: 'Cleave supports five reference genomes for alignment and downstream analysis. Feature availability varies by organism:',
      },
      {
        type: 'table',
        headers: [
          'Organism',
          'Build',
          'Alignment',
          'Peak Calling',
          'Heatmaps',
          'Roman Normalization',
        ],
        rows: [
          ['Mouse', 'mm10', 'Yes', 'Yes', 'Yes', 'Yes'],
          ['Human', 'hg38', 'Yes', 'Yes', 'Yes', 'No'],
          ['Human', 'hg19', 'Yes', 'Yes', 'Yes', 'No'],
          ['Drosophila', 'dm6', 'Yes', 'Yes', 'Yes', 'No'],
          ['Yeast', 'sacCer3', 'Yes', 'Yes', 'No', 'No'],
          ['E. coli', 'K12 MG1655', 'Spike-in only', '--', '--', '--'],
        ],
      },
      {
        type: 'callout',
        variant: 'note',
        text: '<strong>Roman normalization</strong> is mouse-only (mm10) because it relies on a curated set of mm10-specific masking regions (158 entries in <code>manual.mask.ultimate.bed</code>).',
      },
      {
        type: 'callout',
        variant: 'note',
        text: '<strong>E. coli K12 MG1655</strong> is used exclusively for spike-in normalization. It is not available as a target reference genome for primary alignment.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. Pipeline -- Trimming
  // ─────────────────────────────────────────────────────────────────────────────
  'pipeline-trimming': {
    title: 'Stage 1: Trimming',
    description:
      'Two-stage trimming with Trimmomatic and kseq -- parameters, outputs, and when to trim.',
    blocks: [
      {
        type: 'heading',
        level: 2,
        text: 'Stage 1: Trimming',
        id: 'trimming',
      },
      {
        type: 'paragraph',
        text: 'Cleave includes a built-in two-stage trimming pipeline -- a key advantage over CUTANA Cloud, which requires pre-trimmed FASTQs.',
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'What Trimming Does',
        id: 'what-trimming-does',
      },
      {
        type: 'list',
        ordered: true,
        items: [
          '<strong>Trimmomatic</strong> (adapter + quality trimming): Removes Illumina adapter sequences and low-quality bases from read ends.',
          '<strong>kseq_test</strong> (fixed-length trimming): Trims all reads to exactly 42bp -- the optimal length for CUT&RUN/CUT&Tag alignment.',
        ],
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'When to Trim',
        id: 'when-to-trim',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          'Always recommended if your reads are longer than 50bp (e.g., 2x150 bp from core facilities).',
          'Check FastQC reports for adapter contamination -- if the "Adapter Content" module shows <strong>warn</strong> or <strong>fail</strong> status, trimming is strongly recommended.',
          'Trimming is built into the auto-pipeline and runs automatically.',
        ],
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Trimming Parameters',
        id: 'trimming-parameters',
      },
      {
        type: 'table',
        headers: ['Parameter', 'Value', 'Description'],
        rows: [
          [
            'Adapter file',
            'TruSeq3.PE.fa',
            'Illumina TruSeq paired-end adapters',
          ],
          [
            'ILLUMINACLIP',
            '2:15:4:4:true',
            'Seed mismatches:palindrome threshold:simple threshold:min adapter length:keep both reads',
          ],
          ['LEADING', '20', 'Remove leading bases below quality 20'],
          ['TRAILING', '20', 'Remove trailing bases below quality 20'],
          [
            'SLIDINGWINDOW',
            '4:15',
            'Cut when average quality in 4-base window drops below 15',
          ],
          ['MINLEN', '25', 'Discard reads shorter than 25bp'],
          ['kseq length', '42', 'Fixed-length trim to 42bp'],
        ],
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Trimming Outputs',
        id: 'trimming-outputs',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          'Trimmed FASTQ files (paired R1/R2)',
          'New FastQC reports generated automatically for trimmed files',
          'Pipeline log',
        ],
      },
      {
        type: 'callout',
        variant: 'tip',
        text: 'Trimmed FASTQs are registered in the system and become available for alignment automatically.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. Pipeline -- Alignment
  // ─────────────────────────────────────────────────────────────────────────────
  'pipeline-alignment': {
    title: 'Stage 2: Alignment',
    description:
      'The 13-step alignment pipeline, configurable settings, and output files.',
    blocks: [
      {
        type: 'heading',
        level: 2,
        text: 'Stage 2: Alignment',
        id: 'alignment',
      },
      {
        type: 'paragraph',
        text: 'Alignment maps paired-end reads to a reference genome, revealing where sequences are enriched across the genome.',
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Launching Alignment',
        id: 'launching-alignment',
      },
      {
        type: 'paragraph',
        text: 'Via the <strong>New Alignment Wizard</strong> (3 steps):',
      },
      {
        type: 'steps',
        items: [
          {
            title: 'Details',
            description:
              'Name the alignment run and add optional notes.',
          },
          {
            title: 'Choose Reactions',
            description: 'Select which reactions to align.',
          },
          {
            title: 'Alignment Settings',
            description:
              'Configure reference genome and advanced options.',
          },
        ],
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'The Alignment Pipeline (13 Steps)',
        id: 'alignment-pipeline-steps',
      },
      {
        type: 'paragraph',
        text: 'For each selected reaction, Cleave runs:',
      },
      {
        type: 'list',
        ordered: true,
        items: [
          '<strong>Bowtie2</strong> alignment to the reference genome (paired-end, dovetail mode, MAPQ filtering)',
          '<strong>SAMtools</strong> SAM-to-BAM conversion',
          '<strong>SAMtools</strong> proper-pair filtering (keep only properly paired reads, MAPQ >= 10)',
          '<strong>BEDTools</strong> ENCODE DAC Exclusion List removal (optional, default ON)',
          '<strong>Picard</strong> coordinate sorting',
          '<strong>Picard</strong> duplicate marking',
          '<strong>SAMtools</strong> duplicate removal (optional, default ON)',
          '<strong>SAMtools</strong> BAM indexing',
          '<strong>deepTools</strong> bamCoverage unsmoothed bigWig (20bp bins, RPKM-normalized)',
          '<strong>deepTools</strong> bamCoverage smoothed bigWig (100bp bins, RPKM-normalized)',
          '<strong>deepTools</strong> computeMatrix + plotHeatmap TSS enrichment heatmap',
          '<strong>deepTools</strong> computeMatrix + plotHeatmap gene body enrichment heatmap',
          'E. coli spike-in alignment + K-MetStat barcode counting (if spike-in enabled)',
        ],
      },
      {
        type: 'callout',
        variant: 'tip',
        text: 'Reactions are processed in parallel using a thread pool for maximum throughput.',
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Configurable Alignment Settings',
        id: 'alignment-settings',
      },
      {
        type: 'table',
        headers: ['Setting', 'Default', 'Description'],
        rows: [
          [
            'Remove Duplicate Reads',
            'On',
            'Filters PCR/optical duplicates via Picard MarkDuplicates.',
          ],
          [
            'Remove ENCODE DAC Exclusion List Regions',
            'On',
            'Filters reads in known false-positive regions via BEDTools.',
          ],
          [
            'Unsmoothed bigWig Bin Size',
            '20 bp',
            'Bin size for heatmap-quality bigWigs.',
          ],
          [
            'Smoothed bigWig Bin Size',
            '100 bp',
            'Bin size for IGV visualization bigWigs.',
          ],
        ],
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Alignment Outputs',
        id: 'alignment-outputs',
      },
      {
        type: 'table',
        headers: ['Output', 'Description'],
        rows: [
          [
            'Methods Text',
            'Auto-generated text with exact software versions and parameters -- copy-paste into manuscripts.',
          ],
          [
            'QC Report',
            'Alignment statistics, spike-in results, heatmap thumbnails. Downloadable as CSV.',
          ],
          [
            'Unique BAM Files',
            'Final high-quality BAMs after all filtering. Primary input for peak calling.',
          ],
          [
            'BAI Index Files',
            'BAM index files for genome browser loading.',
          ],
          [
            'Unsmoothed bigWig Files',
            'RPKM-normalized, 20bp bins. Used for heatmaps and quantitative analysis.',
          ],
          [
            'Smoothed bigWig Files',
            'RPKM-normalized, 100bp bins. Used for IGV visualization.',
          ],
          [
            'TSS Heatmaps',
            'Enrichment around transcription start sites (PNG).',
          ],
          [
            'Gene Body Heatmaps',
            'Enrichment across gene bodies (PNG).',
          ],
          [
            'FastQC Reports',
            'Regenerated per-reaction quality reports.',
          ],
          [
            'Pipeline Logs',
            'Detailed execution logs for troubleshooting.',
          ],
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 10. Pipeline -- Peak Calling
  // ─────────────────────────────────────────────────────────────────────────────
  'pipeline-peaks': {
    title: 'Stage 3: Peak Calling',
    description:
      'Five peak caller modes, fragment size filter, IgG controls, HOMER annotation, and FRiP.',
    blocks: [
      {
        type: 'heading',
        level: 2,
        text: 'Stage 3: Peak Calling',
        id: 'peak-calling',
      },
      {
        type: 'paragraph',
        text: 'Peak calling identifies genomic regions where target signal is significantly enriched above background.',
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Available Peak Callers',
        id: 'available-peak-callers',
      },
      {
        type: 'table',
        headers: [
          'Peak Caller',
          'Mode',
          'Best For',
          'Default Threshold',
          'Description',
        ],
        rows: [
          [
            'MACS2',
            'Narrow',
            'Sharp marks (H3K4me3, CTCF, H3K4me1)',
            'q-value 0.01',
            'Model-based peak calling for punctate enrichment.',
          ],
          [
            'MACS2',
            'Broad',
            'Diffuse marks (methylation CUT&RUNs)',
            'broad-cutoff 0.1',
            'Extended peak regions for broad enrichment.',
          ],
          [
            'SICER2',
            'Broad',
            'Diffuse marks (H3K27me3)',
            'FDR 0.01',
            'Island-based peak calling for broad domains.',
          ],
          [
            'SEACR',
            'Stringent',
            'Most CUT&RUNs (lab default)',
            'Top 1% AUC (0.01)',
            'Signal extraction from sparse data, stringent mode.',
          ],
          [
            'SEACR',
            'Relaxed',
            'Broad exploration',
            'Top 1% AUC (0.01)',
            'SEACR with relaxed thresholds for broader discovery.',
          ],
        ],
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Lab Recommendations',
        id: 'lab-recommendations',
      },
      {
        type: 'table',
        headers: ['Target Type', 'Recommended Peak Caller'],
        rows: [
          ['Most CUT&RUNs (general)', 'SEACR stringent'],
          ['H3K4me1', 'MACS2 narrow'],
          ['ATAC-seq', 'MACS2 narrow'],
          ['Methylation CUT&RUN', 'MACS2 broad'],
          ['Peak summits (for heatmaps)', 'MACS2 narrow'],
        ],
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Fragment Size Filter',
        id: 'fragment-size-filter',
      },
      {
        type: 'paragraph',
        text: 'Cleave includes a fragment size filter (<strong>default ON</strong>) that keeps only fragments smaller than 120bp before peak calling. Sub-nucleosomal fragments are the biologically relevant CUT&RUN signal -- larger fragments are typically background noise. Can be disabled in Advanced Settings.',
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'IgG Control',
        id: 'igg-control',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          'Each target reaction should be paired with an IgG control from the same experimental condition.',
          'Wild-type IgG for wild-type target reactions; drug-treated IgG for treated target reactions.',
          'SEACR can also run in numeric threshold mode (default 0.01, top 1% AUC) without an IgG control.',
        ],
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'SEACR Preprocessing',
        id: 'seacr-preprocessing',
      },
      {
        type: 'paragraph',
        text: 'SEACR peak calling involves a preprocessing chain:',
      },
      {
        type: 'list',
        ordered: true,
        items: [
          'MACS2 generates a bedgraph from the BAM file.',
          '<code>change.bdg.py</code> converts float values to integers (SEACR requirement).',
          'SEACR v1.1 runs on the integer bedgraph.',
        ],
      },
      {
        type: 'callout',
        variant: 'tip',
        text: 'This chain is handled automatically -- no manual intervention required.',
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Peak Calling Outputs',
        id: 'peak-calling-outputs',
      },
      {
        type: 'table',
        headers: ['Output', 'Description'],
        rows: [
          [
            'Methods Text',
            'Auto-generated with exact tool versions and parameters.',
          ],
          [
            'QC Report',
            'Peak statistics, FRiP scores, annotation plots. Downloadable as CSV.',
          ],
          [
            'BED Files',
            'Genomic coordinates of called peaks (blacklist-subtracted).',
          ],
          [
            'FRiP Score Files',
            'Fraction of Reads in Peaks metrics per reaction.',
          ],
          [
            'HOMER Annotation Files',
            'Each peak annotated with nearest genomic feature.',
          ],
          [
            'Annotation Statistics',
            'Summary of peak distribution across genomic features.',
          ],
          [
            'Top Called Peaks',
            'Ranked list of most significant peaks. Downloadable as CSV.',
          ],
          ['Pipeline Logs', 'Detailed execution logs.'],
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 11. Pipeline -- IGV
  // ─────────────────────────────────────────────────────────────────────────────
  'pipeline-igv': {
    title: 'Stage 4: Visualization (IGV.js)',
    description:
      'Embedded genome browser for viewing alignment and peak calling results.',
    blocks: [
      {
        type: 'heading',
        level: 2,
        text: 'Stage 4: Visualization (IGV.js)',
        id: 'igv-visualization',
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Using the Genome Browser',
        id: 'using-the-genome-browser',
      },
      {
        type: 'steps',
        items: [
          {
            title: 'Navigate to a run',
            description:
              'Navigate to an Alignment or Peak Calling run.',
          },
          {
            title: 'Open the IGV tab',
            description: 'Click the <strong>IGV</strong> sub-tab.',
          },
          {
            title: 'Configure tracks',
            description:
              'Select the reference genome and reactions to display.',
          },
          {
            title: 'View tracks',
            description:
              'Tracks load automatically -- bigWig signal tracks for alignment, BED peak tracks for peak calling.',
          },
        ],
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Features',
        id: 'igv-features',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          '<strong>Multi-track display:</strong> Compare multiple samples side-by-side.',
          '<strong>Chromosome navigation:</strong> Jump to any genomic locus by chromosome or coordinates.',
          '<strong>Zoom controls:</strong> Zoom in to base-pair resolution or out to chromosome-wide view.',
          '<strong>Full-screen mode:</strong> Expand the browser to fill the screen.',
          '<strong>Per-track settings:</strong> Customize display range, color, and scale for each track.',
          '<strong>Image export:</strong> Save the current view as a PNG image.',
          '<strong>Track labels:</strong> Format <code>{AlignmentName}-{ShortName}</code> for easy identification.',
          '<strong>Byte-range serving:</strong> BigWig and BAM files are served with HTTP Range headers, so only the visible region is loaded.',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 12. Lab Extensions
  // ─────────────────────────────────────────────────────────────────────────────
  'lab-extensions': {
    title: 'Lab Extension Features',
    description:
      'DiffBind differential analysis, custom heatmaps, Pearson correlation, and Roman normalization.',
    blocks: [
      {
        type: 'heading',
        level: 2,
        text: 'Lab Extension Features',
        id: 'lab-extensions',
      },
      {
        type: 'paragraph',
        text: 'These features are exclusive to Cleave and are not available in CUTANA Cloud. They replicate and automate analyses that the Ferguson Lab previously performed manually on the command line.',
      },
      { type: 'separator' },

      // ── DiffBind ──
      {
        type: 'heading',
        level: 3,
        text: 'DiffBind (Differential Peak Analysis)',
        id: 'diffbind',
      },
      {
        type: 'paragraph',
        text: 'DiffBind identifies genomic regions with statistically significant differences in binding/enrichment between experimental conditions (e.g., wild-type vs. mutant).',
      },
      {
        type: 'heading',
        level: 4,
        text: 'Requirements',
        id: 'diffbind-requirements',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          'At least 2 conditions (e.g., "ctrl" and "mut") with biological replicates.',
          'Completed alignment with sorted BAM files.',
          'Completed peak calling with BED files.',
        ],
      },
      {
        type: 'heading',
        level: 4,
        text: 'Launching DiffBind',
        id: 'launching-diffbind',
      },
      {
        type: 'paragraph',
        text: 'Via the <strong>DiffBind Wizard</strong> (5 steps):',
      },
      {
        type: 'steps',
        items: [
          {
            title: 'Details',
            description: 'Name the analysis.',
          },
          {
            title: 'Choose Alignment',
            description: 'Select the alignment run.',
          },
          {
            title: 'Choose Peak Calling',
            description: 'Select the peak calling run.',
          },
          {
            title: 'Sample Sheet',
            description:
              'Assign conditions (ctrl/mut), replicates, and factors to each reaction.',
          },
          {
            title: 'Settings',
            description: 'Choose analysis mode and parameters.',
          },
        ],
      },
      {
        type: 'heading',
        level: 4,
        text: 'Analysis Modes',
        id: 'diffbind-analysis-modes',
      },
      {
        type: 'table',
        headers: ['Mode', 'Description'],
        rows: [
          [
            'DESeq2 (consensus)',
            'Uses consensus peakset derived from all samples. Standard approach.',
          ],
          [
            'DESeq2 (custom peakset)',
            'Uses a user-supplied BED file as the peakset.',
          ],
          [
            'edgeR (custom peakset)',
            'Uses edgeR with TMM normalization and a user-supplied peakset.',
          ],
        ],
      },
      {
        type: 'heading',
        level: 4,
        text: 'DiffBind Outputs',
        id: 'diffbind-outputs',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          '<strong>Results table:</strong> Genomic coordinates, fold change, p-value, FDR for each differentially bound region.',
          '<strong>Volcano plot:</strong> Log2 fold change vs. -log10(p-value) visualization.',
          '<strong>MA plot:</strong> Log2 fold change vs. mean concentration.',
          '<strong>PCA plot:</strong> Principal component analysis of sample binding profiles.',
          '<strong>Correlation heatmap:</strong> Sample-to-sample correlation based on binding affinity.',
          '<strong>Normalized counts:</strong> Per-region read counts normalized across samples.',
          'All plots downloadable as PNG. Results downloadable as TSV.',
        ],
      },
      { type: 'separator' },

      // ── Custom Heatmaps ──
      {
        type: 'heading',
        level: 3,
        text: 'Custom Heatmaps',
        id: 'custom-heatmaps',
      },
      {
        type: 'paragraph',
        text: 'Generate reference-point heatmaps using your own BED files.',
      },
      {
        type: 'heading',
        level: 4,
        text: 'Use Cases',
        id: 'heatmap-use-cases',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          'Heatmaps centered on peaks from a specific reaction.',
          'Enrichment around A/B compartment boundaries.',
          'Signal at any set of user-defined genomic regions.',
        ],
      },
      {
        type: 'heading',
        level: 4,
        text: 'Launching Custom Heatmaps',
        id: 'launching-custom-heatmaps',
      },
      {
        type: 'steps',
        items: [
          {
            title: 'Upload a BED file',
            description:
              'Upload a BED file to the experiment (via the Files tab).',
          },
          {
            title: 'Launch the wizard',
            description:
              'Launch the <strong>Custom Heatmap Wizard</strong>.',
          },
          {
            title: 'Select inputs',
            description:
              'Select the alignment run (for bigWig files), reactions, and your BED file.',
          },
          {
            title: 'Configure',
            description:
              'Configure: reference point (<strong>center</strong>, <strong>TSS</strong>, or <strong>TES</strong>), upstream/downstream window sizes.',
          },
        ],
      },
      {
        type: 'heading',
        level: 4,
        text: 'Heatmap Outputs',
        id: 'heatmap-outputs',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          'Reference-point heatmap (PNG)',
          'Mean signal profile plot (PNG)',
          'computeMatrix output (downloadable <code>.gz</code> for further analysis)',
        ],
      },
      { type: 'separator' },

      // ── Pearson Correlation ──
      {
        type: 'heading',
        level: 3,
        text: 'Pearson Correlation',
        id: 'pearson-correlation',
      },
      {
        type: 'paragraph',
        text: 'Compute pairwise Pearson correlation coefficients across all selected reactions.',
      },
      {
        type: 'heading',
        level: 4,
        text: 'How It Works',
        id: 'pearson-how-it-works',
      },
      {
        type: 'list',
        ordered: true,
        items: [
          'BigWig files are converted to a coverage matrix at 50bp resolution across all standard chromosomes.',
          'Pairwise Pearson correlations are computed.',
          'Results are displayed as a clustered heatmap.',
        ],
      },
      {
        type: 'heading',
        level: 4,
        text: 'Supported Genomes',
        id: 'pearson-supported-genomes',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          '<strong>mm10:</strong> chr1-19 + chrX (with mm10 mask for problematic regions)',
          '<strong>hg38/hg19:</strong> chr1-22 + chrX',
          '<strong>dm6:</strong> chr2L, 2R, 3L, 3R, 4, X',
        ],
      },
      {
        type: 'heading',
        level: 4,
        text: 'Pearson Outputs',
        id: 'pearson-outputs',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          'Correlation heatmap (PNG)',
          'Correlation matrix (CSV)',
          'Coverage matrix (CSV)',
        ],
      },
      { type: 'separator' },

      // ── Roman Normalization ──
      {
        type: 'heading',
        level: 3,
        text: 'Roman Normalization',
        id: 'roman-normalization',
      },
      {
        type: 'paragraph',
        text: 'Sample-to-sample bigWig normalization using 99th-percentile quantile normalization. <strong>Mouse (mm10) only.</strong>',
      },
      {
        type: 'heading',
        level: 4,
        text: 'How It Works',
        id: 'roman-how-it-works',
      },
      {
        type: 'list',
        ordered: true,
        items: [
          'All selected bigWig files are loaded at base-pair resolution.',
          'Masked regions (158 problematic mm10 regions) are excluded.',
          'The 99th percentile of coverage is computed for each sample.',
          'All samples are normalized to the first sample listed (normalization factor = 1.0).',
          'Normalized bigWig files are generated.',
        ],
      },
      {
        type: 'heading',
        level: 4,
        text: 'When to Use',
        id: 'roman-when-to-use',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          'When comparing signal intensity across samples that may have different sequencing depths or enrichment efficiencies.',
          'Complements E. coli spike-in normalization.',
        ],
      },
      {
        type: 'heading',
        level: 4,
        text: 'Roman Normalization Outputs',
        id: 'roman-outputs',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          'Normalized bigWig files (<code>.rnorm.bw</code>)',
          'Normalization factors CSV',
          'Pipeline log',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 13. Auto-Pipeline
  // ─────────────────────────────────────────────────────────────────────────────
  'auto-pipeline': {
    title: 'Auto-Pipeline Mode',
    description:
      'One-click pipeline chain from FastQC through peak calling, with status tracking.',
    blocks: [
      {
        type: 'heading',
        level: 2,
        text: 'Auto-Pipeline Mode',
        id: 'auto-pipeline',
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Default Chain',
        id: 'default-chain',
      },
      {
        type: 'paragraph',
        text: 'The auto-pipeline chains the following stages automatically:',
      },
      {
        type: 'paragraph',
        text: '<strong>FastQC</strong> &rarr; <strong>Trim</strong> &rarr; <strong>Align</strong> &rarr; <strong>Peak Call</strong>',
      },
      {
        type: 'paragraph',
        text: 'Each step automatically feeds its outputs into the next.',
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'How to Use',
        id: 'auto-pipeline-how-to-use',
      },
      {
        type: 'steps',
        items: [
          {
            title: 'Prepare your experiment',
            description:
              'Navigate to an experiment with uploaded FASTQs and defined reactions.',
          },
          {
            title: 'Launch the pipeline',
            description:
              'Click <strong>Auto-Pipeline</strong> in the experiment toolbar.',
          },
          {
            title: 'Configure settings',
            description:
              'Configure settings for each stage (or accept defaults).',
          },
          {
            title: 'Start',
            description:
              'Click <strong>Start</strong> -- the pipeline runs end-to-end.',
          },
          {
            title: 'Monitor progress',
            description:
              'Monitor progress via the real-time status indicators and notification bell.',
          },
        ],
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Auto-Pipeline Status',
        id: 'auto-pipeline-status',
      },
      {
        type: 'table',
        headers: ['Status', 'Meaning'],
        rows: [
          [
            'Pending FastQC',
            'Waiting for FastQC to complete on uploaded files.',
          ],
          ['Running', 'Pipeline is actively processing a stage.'],
          ['Complete', 'All stages finished successfully.'],
          [
            'Error',
            'A stage failed -- review the error and retry or cancel.',
          ],
          ['Cancelled', 'User cancelled the pipeline.'],
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 14. QC Guide
  // ─────────────────────────────────────────────────────────────────────────────
  'qc-guide': {
    title: 'QC Reports -- Interpretation Guide',
    description:
      'How to interpret alignment QC metrics, peak calling QC, spike-in QC, and heatmaps.',
    blocks: [
      {
        type: 'heading',
        level: 2,
        text: 'QC Reports -- Interpretation Guide',
        id: 'qc-guide',
      },
      { type: 'separator' },

      // ── Alignment QC ──
      {
        type: 'heading',
        level: 3,
        text: 'Alignment QC Metrics',
        id: 'alignment-qc-metrics',
      },
      {
        type: 'table',
        headers: ['Metric', 'Suggested Range', 'Notes'],
        rows: [
          [
            'Total Reads',
            '5-10M per sample (up to ~15M acceptable)',
            'Expect loss of 1-2M reads post-alignment.',
          ],
          [
            'Unique Alignment Rate',
            '70-95% for specific targets',
            'IgG negative control is not expected to align well -- low rate (~29%) is normal for IgG.',
          ],
          [
            'Duplication Rate',
            '<30%',
            'High rates may indicate: low template diversity, over-amplification, over-sequencing.',
          ],
          [
            'E. coli Alignment Rate',
            '<5%',
            'Goal: ~1% (0.2-5%). High rates may indicate incorrect spike-in reconstitution.',
          ],
          [
            'Mitochondrial Read %',
            'Low',
            'Elevated mitochondrial reads indicate sample quality issues.',
          ],
        ],
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Causes of Poor Alignment Quality',
        id: 'poor-alignment-causes',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          'Poor assay yields / low unique templates',
          'High PCR duplicates',
          'Over-sequencing',
          'Incorrect E. coli spike-in reconstitution',
          'Untrimmed adapter sequences in reads longer than 50bp (use Cleave\'s trimming stage)',
        ],
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'SNAP-CUTANA K-MetStat Spike-in QC',
        id: 'spike-in-qc',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          '<strong>IgG antibody control:</strong> Should show <20% recovery across each panel member (no specificity -- expected).',
          '<strong>H3K4me3 antibody:</strong> Should show ~100% specificity for the H3K4me3 barcoded nucleosome and <20% for all others.',
          '<strong>H3K27me3 antibody:</strong> Should show ~100% specificity for H3K27me3 and <20% for all others.',
          'Deviations >20% for off-target members suggest: poor-quality antibody, excessive spike-in amount, or assay issues.',
        ],
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'TSS and Gene Body Heatmaps',
        id: 'tss-gene-body-heatmaps',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          '<strong>H3K4me3</strong> (active mark): Expect a sharp, punctate peak centered on the TSS.',
          '<strong>H3K27me3</strong> (repressive mark): Expect broad enrichment across gene bodies.',
          '<strong>IgG control:</strong> Should show no enrichment pattern (uniform low signal).',
        ],
      },
      { type: 'separator' },

      // ── Peak Calling QC ──
      {
        type: 'heading',
        level: 3,
        text: 'Peak Calling QC',
        id: 'peak-calling-qc',
      },
      {
        type: 'heading',
        level: 4,
        text: 'FRiP (Fraction of Reads in Peaks)',
        id: 'frip',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          'Represents the proportion of uniquely aligned reads that fall within called peaks.',
          'High-quality FRiP: <strong>>0.2</strong> (indicates robust enrichment).',
          'Calculated using BEDTools (reads in peaks) / SAMtools (total reads).',
        ],
      },
      {
        type: 'heading',
        level: 4,
        text: 'Top Called Peaks',
        id: 'top-called-peaks',
      },
      {
        type: 'paragraph',
        text: 'A ranked list with genomic coordinates. Downloadable as CSV. Cross-reference in IGV.',
      },
      {
        type: 'heading',
        level: 4,
        text: 'Peak Annotation Plots',
        id: 'peak-annotation-plots',
      },
      {
        type: 'table',
        headers: ['Category', 'Description'],
        rows: [
          ['Promoter', 'Near transcription start sites'],
          ['Exon', 'Within coding regions'],
          ['Intron', 'Within non-coding gene regions'],
          ['Intergenic', 'Between genes'],
          ["3' UTR", "3' untranslated region"],
          ["5' UTR", "5' untranslated region"],
          ['TTS', 'Transcription termination site'],
          ['ncRNA', 'Non-coding RNA'],
        ],
      },
      {
        type: 'paragraph',
        text: 'Expected distributions:',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          '<strong>Active marks (H3K4me3):</strong> Enrichment at promoters and TSS.',
          '<strong>Repressive marks (H3K27me3):</strong> Broader distribution including intergenic.',
          '<strong>CTCF:</strong> Enrichment at intergenic and intronic insulator elements.',
        ],
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 4,
        text: 'Interpreting Peak Calling Results',
        id: 'interpreting-peak-calling',
      },
      {
        type: 'callout',
        variant: 'note',
        text: 'More peaks does not mean better peak calling.',
      },
      {
        type: 'paragraph',
        text: 'Trustworthiness is multifactorial:',
      },
      {
        type: 'list',
        ordered: true,
        items: [
          'Quality of the input BAM.',
          'Visual comparison of peak locations in IGV.',
          'Strength of FRiP scoring -- higher FRiP = more trustworthy data.',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 15. Tutorials
  // ─────────────────────────────────────────────────────────────────────────────
  tutorials: {
    title: 'Tutorials',
    description:
      'Step-by-step guides for all major workflows in Cleave.',
    blocks: [
      {
        type: 'heading',
        level: 2,
        text: 'Tutorials',
        id: 'tutorials',
      },
      { type: 'separator' },

      // ── Tutorial 1 ──
      {
        type: 'heading',
        level: 3,
        text: 'Tutorial 1: Basic CUT&RUN Analysis',
        id: 'tutorial-1',
      },
      {
        type: 'steps',
        items: [
          {
            title: 'Create a Project',
            description:
              'Log in, click <strong>New Project</strong>, enter name, click Create.',
          },
          {
            title: 'Invite Collaborators (Optional)',
            description:
              'Click <strong>Manage Members</strong>, enter email, select role, click Invite.',
          },
          {
            title: 'Create an Experiment',
            description:
              'Click <strong>New Experiment</strong>, fill in details (name, assay type CUT&RUN), upload FASTQs, create reactions with auto-detected prefixes.',
          },
          {
            title: 'Review FastQC Reports',
            description:
              'Check Adapter Content module (<strong>Pass</strong> = skip trimming, <strong>Warn/Fail</strong> = trim).',
          },
          {
            title: 'Trim FASTQs (If Needed)',
            description:
              'Click <strong>New Trimming</strong>, select reactions, accept defaults, submit.',
          },
          {
            title: 'Run Alignment',
            description:
              'Click <strong>New Alignment</strong>, name it, select reactions, verify genome and settings, submit. Takes 30-90 min.',
          },
          {
            title: 'Review Alignment QC',
            description:
              'Check Unique Alignment Rate (>70% for targets, ~29% for IgG), Duplication Rate (<30%), E. coli Rate (<5%), TSS Heatmaps, SNAP-CUTANA spike-in.',
          },
          {
            title: 'Call Peaks',
            description:
              'Click <strong>New Peak Calling</strong>, select alignment run, select target reactions, choose MACS2 narrow (q-value 0.01) or SEACR stringent, assign IgG controls, submit.',
          },
          {
            title: 'Review Peak Calling Results',
            description:
              'Check FRiP (>0.2 is good), annotation plots, IGV browser.',
          },
          {
            title: 'Download Results',
            description:
              'Go to <strong>All Files</strong> tab, browse tree, select files, download ZIP or individual files. Copy Methods Text from Info tab.',
          },
        ],
      },
      { type: 'separator' },

      // ── Tutorial 2 ──
      {
        type: 'heading',
        level: 3,
        text: 'Tutorial 2: One-Click Auto-Pipeline',
        id: 'tutorial-2',
      },
      {
        type: 'steps',
        items: [
          {
            title: 'Prepare your experiment',
            description:
              'Create experiment with FASTQs and reactions (from Tutorial 1 steps 1-3).',
          },
          {
            title: 'Launch auto-pipeline',
            description:
              'Click <strong>Auto-Pipeline</strong> in experiment toolbar.',
          },
          {
            title: 'Review settings',
            description:
              'Review default settings for each stage.',
          },
          {
            title: 'Start the pipeline',
            description: 'Click <strong>Start</strong>.',
          },
          {
            title: 'Automatic processing',
            description:
              'Cleave runs FastQC, Trim, Align, and Peak Call automatically.',
          },
          {
            title: 'Monitor progress',
            description:
              'Monitor via status indicator and notification bell.',
          },
          {
            title: 'Review results',
            description:
              'Results available in respective tabs when complete.',
          },
        ],
      },
      { type: 'separator' },

      // ── Tutorial 3 ──
      {
        type: 'heading',
        level: 3,
        text: 'Tutorial 3: DiffBind Differential Analysis',
        id: 'tutorial-3',
      },
      {
        type: 'callout',
        variant: 'note',
        text: '<strong>Prerequisites:</strong> Completed alignment with sorted BAMs, completed peak calling with BED files, at least 2 conditions with 2+ replicates each.',
      },
      {
        type: 'steps',
        items: [
          {
            title: 'Launch DiffBind',
            description:
              'Click <strong>New DiffBind</strong> in experiment toolbar.',
          },
          {
            title: 'Name the analysis',
            description:
              'Step 1: Enter a descriptive name for the analysis.',
          },
          {
            title: 'Select alignment run',
            description:
              'Step 2: Select the alignment run containing your BAM files.',
          },
          {
            title: 'Select peak calling run',
            description:
              'Step 3: Select the peak calling run containing your BED files.',
          },
          {
            title: 'Build sample sheet',
            description:
              'Step 4: Assign <strong>Condition</strong> (ctrl/mut), <strong>Replicate</strong> (1, 2, 3...), <strong>Factor</strong> (e.g., H3K4me3) for each reaction.',
          },
          {
            title: 'Choose analysis mode',
            description:
              'Step 5: Choose analysis mode (DESeq2 consensus, DESeq2 custom peakset, or edgeR custom peakset).',
          },
          {
            title: 'Submit and wait',
            description: 'Click <strong>Submit</strong>.',
          },
          {
            title: 'Review results',
            description:
              'Review: <strong>Results tab</strong> (sortable by FDR/fold change), <strong>Plots tab</strong> (volcano, MA, PCA, heatmap), <strong>Files tab</strong> (TSV results, normalized counts, plot images).',
          },
        ],
      },
      { type: 'separator' },

      // ── Tutorial 4 ──
      {
        type: 'heading',
        level: 3,
        text: 'Tutorial 4: Custom Reference-Point Heatmap',
        id: 'tutorial-4',
      },
      {
        type: 'steps',
        items: [
          {
            title: 'Upload BED file',
            description:
              'Upload BED file via <strong>All Files</strong> tab (click Upload BED).',
          },
          {
            title: 'Launch the wizard',
            description:
              'Click <strong>New Custom Heatmap</strong>.',
          },
          {
            title: 'Select alignment run',
            description:
              'Select alignment run (for bigWig files).',
          },
          {
            title: 'Select reactions',
            description: 'Select reactions to include.',
          },
          {
            title: 'Select BED file',
            description:
              'Select your BED file as the regions of interest.',
          },
          {
            title: 'Configure parameters',
            description:
              'Configure reference point (<strong>center/TSS/TES</strong>), upstream window (e.g., 3000bp), downstream window (e.g., 3000bp).',
          },
          {
            title: 'Submit',
            description: 'Click <strong>Submit</strong>.',
          },
          {
            title: 'View results',
            description:
              'View heatmap and profile plot in results tab.',
          },
        ],
      },
      { type: 'separator' },

      // ── Tutorial 5 ──
      {
        type: 'heading',
        level: 3,
        text: 'Tutorial 5: Pearson Correlation Matrix',
        id: 'tutorial-5',
      },
      {
        type: 'steps',
        items: [
          {
            title: 'Launch Pearson Correlation',
            description:
              'Click <strong>New Pearson Correlation</strong>.',
          },
          {
            title: 'Select alignment run',
            description: 'Select alignment run.',
          },
          {
            title: 'Select reactions',
            description:
              'Select reactions (typically all replicates of the same target).',
          },
          {
            title: 'Submit',
            description: 'Click <strong>Submit</strong>.',
          },
          {
            title: 'Review the heatmap',
            description:
              'Biological replicates should show high correlation (>0.9). Different targets show lower correlation. Outliers cluster separately.',
          },
          {
            title: 'Download results',
            description:
              'Download correlation matrix CSV for further analysis.',
          },
        ],
      },
      { type: 'separator' },

      // ── Tutorial 6 ──
      {
        type: 'heading',
        level: 3,
        text: 'Tutorial 6: Roman Normalization (Mouse Only)',
        id: 'tutorial-6',
      },
      {
        type: 'steps',
        items: [
          {
            title: 'Launch normalization',
            description:
              'Click <strong>New Normalization</strong>.',
          },
          {
            title: 'Select alignment run',
            description: 'Select alignment run.',
          },
          {
            title: 'Select reactions',
            description:
              'Select mouse (mm10) reactions to normalize.',
          },
          {
            title: 'Order matters',
            description:
              '<strong>Important:</strong> First reaction listed becomes the reference (NF = 1.0).',
          },
          {
            title: 'Submit',
            description: 'Click <strong>Submit</strong>.',
          },
          {
            title: 'Review results',
            description:
              'When complete: normalized bigWig files (<code>.rnorm.bw</code>) available for download, factors shown in results tab.',
          },
        ],
      },
      { type: 'separator' },

      // ── Tutorial 7 ──
      {
        type: 'heading',
        level: 3,
        text: 'Tutorial 7: Importing FASTQs from an FTP Server',
        id: 'tutorial-7',
      },
      {
        type: 'steps',
        items: [
          {
            title: 'Open import dialog',
            description:
              'Navigate to FASTQs tab, click <strong>Import from Server</strong>.',
          },
          {
            title: 'Enter server details',
            description:
              'Enter: Protocol (FTP/SFTP), Hostname, Port (21 or 22), Username, Password.',
          },
          {
            title: 'Save credentials (optional)',
            description:
              'Optionally save server credentials (encrypted at rest).',
          },
          {
            title: 'Connect',
            description: 'Click <strong>Connect</strong>.',
          },
          {
            title: 'Browse remote files',
            description: 'Browse remote directory tree.',
          },
          {
            title: 'Select files',
            description: 'Select FASTQ files via checkboxes.',
          },
          {
            title: 'Start import',
            description:
              'Click <strong>Import</strong>. Files transfer in background.',
          },
          {
            title: 'Monitor and verify',
            description:
              'Monitor via notification bell. Files appear in FASTQs tab, FastQC runs automatically.',
          },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 16. FAQ (Troubleshooting + Security + Settings + Dark Mode)
  // ─────────────────────────────────────────────────────────────────────────────
  faq: {
    title: 'FAQ & Troubleshooting',
    description:
      'Common issues, security information, account settings, and dark mode.',
    blocks: [
      {
        type: 'heading',
        level: 2,
        text: 'Troubleshooting',
        id: 'troubleshooting',
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Upload Issues',
        id: 'upload-issues',
      },
      {
        type: 'table',
        headers: ['Problem', 'Solution'],
        rows: [
          [
            'Upload stuck at 0%',
            'Check internet connection. tus uploads auto-resume on reconnect.',
          ],
          [
            '"File too large" error',
            'Maximum upload size is configured per-instance (default 5GB per file). Contact admin.',
          ],
          [
            'Upload disappeared',
            'Check FASTQs tab -- partial uploads retained for 48 hours and can be resumed.',
          ],
        ],
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Alignment Issues',
        id: 'alignment-issues',
      },
      {
        type: 'table',
        headers: ['Problem', 'Solution'],
        rows: [
          [
            'Very low alignment rate (<50%) for targets',
            'Check reference genome. Verify FASTQ quality via FastQC. Consider trimming if adapters present.',
          ],
          [
            'Low IgG alignment rate (~29%)',
            'This is expected and normal for IgG negative controls.',
          ],
          [
            'High duplication rate (>30%)',
            'May indicate low template diversity or over-sequencing.',
          ],
          [
            'Job stuck in "running"',
            'Check pipeline log for errors. You can terminate and retry the job.',
          ],
        ],
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'Peak Calling Issues',
        id: 'peak-calling-issues',
      },
      {
        type: 'table',
        headers: ['Problem', 'Solution'],
        rows: [
          [
            'Zero peaks called',
            'Check alignment QC. Try a different peak caller or adjust threshold.',
          ],
          [
            'Very low FRiP (<0.1)',
            'May indicate weak enrichment. Verify antibody quality via spike-in QC.',
          ],
          [
            'Too many peaks (noisy)',
            'Try a more stringent threshold or SEACR stringent mode.',
          ],
        ],
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 3,
        text: 'General Issues',
        id: 'general-issues',
      },
      {
        type: 'table',
        headers: ['Problem', 'Solution'],
        rows: [
          [
            'Page not loading',
            'Clear browser cache and reload. Use a modern browser (Chrome, Firefox, Edge, Safari).',
          ],
          [
            '"401 Unauthorized" errors',
            'Session expired. Log out and log back in. If inactive 7+ days, fresh login needed.',
          ],
          [
            "Can't access a project",
            'Ask the project Admin to verify your membership and role.',
          ],
        ],
      },
      { type: 'separator' },

      // ── Security ──
      {
        type: 'heading',
        level: 2,
        text: 'Security',
        id: 'security',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          '<strong>Passwords:</strong> Hashed with Argon2 (industry-standard). Never stored in plain text.',
          '<strong>Sessions:</strong> JWT access tokens (30-min) stored in memory. Refresh tokens (7-day) in httpOnly cookies.',
          '<strong>Rate limiting:</strong> Login 5/min, registration 3/min per IP.',
          '<strong>File downloads:</strong> Time-limited HMAC-signed tokens (5-min expiry).',
          '<strong>Server import:</strong> SSRF prevention blocks private IPs, localhost, cloud metadata. Saved passwords encrypted with Fernet.',
          '<strong>Path security:</strong> All file operations validate paths stay within project storage directory.',
        ],
      },
      { type: 'separator' },

      // ── Account Settings ──
      {
        type: 'heading',
        level: 2,
        text: 'Account Settings',
        id: 'account-settings',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          '<strong>Profile:</strong> Update first name, last name, and email.',
          '<strong>Password:</strong> Change password (invalidates all existing sessions).',
          '<strong>Notifications:</strong> Configure email notification preferences.',
        ],
      },
      { type: 'separator' },

      // ── Dark Mode ──
      {
        type: 'heading',
        level: 2,
        text: 'Dark Mode',
        id: 'dark-mode',
      },
      {
        type: 'list',
        ordered: true,
        items: [
          'Click the theme toggle (sun/moon icon) in the navigation bar.',
          'Choose <strong>Light</strong>, <strong>Dark</strong>, or <strong>System</strong> (follows OS preference).',
          'Your preference persists across sessions.',
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 17. Glossary
  // ─────────────────────────────────────────────────────────────────────────────
  glossary: {
    title: 'Glossary',
    description:
      'Key terminology and software versions used in Cleave.',
    blocks: [
      {
        type: 'heading',
        level: 2,
        text: 'Key Terminology',
        id: 'key-terminology',
      },
      {
        type: 'table',
        headers: ['Term', 'Definition'],
        rows: [
          [
            'CUT&RUN',
            'Cleavage Under Targets and Release Using Nuclease -- an antibody-directed chromatin profiling method.',
          ],
          [
            'CUT&Tag',
            'Cleavage Under Targets and Tagmentation -- a similar method using Tn5 transposase.',
          ],
          [
            'FASTQ',
            'Standard file format for storing nucleotide sequences and their quality scores from sequencing.',
          ],
          [
            'BAM',
            'Binary Alignment Map -- compressed binary format storing aligned sequencing reads.',
          ],
          [
            'bigWig',
            'Indexed binary format for genome-wide signal data, used for visualization and quantitative analysis.',
          ],
          [
            'BED',
            'Browser Extensible Data -- tab-delimited format for genomic interval data (e.g., peak coordinates).',
          ],
          [
            'Peak',
            'A genomic region where signal is significantly enriched above background, indicating protein-DNA interaction.',
          ],
          [
            'FRiP',
            'Fraction of Reads in Peaks -- proportion of aligned reads falling within called peaks; a measure of enrichment quality.',
          ],
          [
            'IgG Control',
            'Immunoglobulin G negative control -- represents non-specific background binding in CUT&RUN.',
          ],
          [
            'Spike-in',
            'Exogenous DNA (e.g., E. coli, K-MetStat barcodes) added to samples for normalization and QC.',
          ],
          [
            'K-MetStat Panel',
            'SNAP-CUTANA K-MetStat Panel -- 16 barcoded nucleosomes with specific histone modifications for antibody specificity QC.',
          ],
          [
            'RPKM',
            'Reads Per Kilobase per Million mapped reads -- a normalization method for sequencing depth and region length.',
          ],
          [
            'TSS',
            'Transcription Start Site -- the genomic position where transcription of a gene begins.',
          ],
          [
            'DAC Exclusion List',
            'ENCODE Data Analysis Center exclusion list -- genomic regions prone to false-positive signal (formerly "blacklist").',
          ],
          [
            'DiffBind',
            'R/Bioconductor package for differential binding analysis between experimental conditions.',
          ],
          [
            'DESeq2',
            'Statistical method for differential analysis of count data using a negative binomial distribution.',
          ],
          [
            'edgeR',
            'Statistical method for differential analysis using empirical Bayes estimation and TMM normalization.',
          ],
          [
            'Consensus Peakset',
            'A set of peaks derived from overlapping peaks across all samples in a DiffBind analysis.',
          ],
          [
            'Roman Normalization',
            'Sample-to-sample bigWig normalization using 99th-percentile quantile normalization (mm10 only).',
          ],
          [
            'HOMER',
            'Hypergeometric Optimization of Motif EnRichment -- software for peak annotation and motif discovery.',
          ],
          [
            'tus Protocol',
            'Open protocol for resumable file uploads -- handles interrupted connections for multi-GB FASTQ files.',
          ],
          [
            'SSE',
            'Server-Sent Events -- unidirectional server-to-client push for real-time job status updates.',
          ],
          [
            'HMAC',
            'Hash-based Message Authentication Code -- used for time-limited signed download tokens.',
          ],
          [
            'Fernet',
            'Symmetric encryption scheme (AES-128-CBC + HMAC) used to encrypt saved server passwords at rest.',
          ],
        ],
      },
      { type: 'separator' },
      {
        type: 'heading',
        level: 2,
        text: 'Software Versions',
        id: 'software-versions',
      },
      {
        type: 'paragraph',
        text: 'Cleave uses the following bioinformatics tools. Exact versions are included in auto-generated methods text for each analysis run.',
      },
      {
        type: 'table',
        headers: ['Tool', 'Purpose'],
        rows: [
          ['Bowtie2', 'Short-read alignment to reference genomes'],
          ['SAMtools', 'BAM file processing, filtering, indexing, and read counting'],
          ['BEDTools', 'Genomic interval operations, blacklist subtraction, FRiP calculation'],
          ['Picard', 'Coordinate sorting and PCR duplicate marking/removal'],
          ['deepTools', 'bigWig generation (bamCoverage), heatmaps (computeMatrix + plotHeatmap)'],
          ['Trimmomatic', 'Adapter and quality trimming of paired-end reads'],
          ['kseq_test', 'Fixed-length read trimming to 42bp (from CUTRUNTools)'],
          ['MACS2', 'Model-based peak calling (narrow and broad modes)'],
          ['SICER2', 'Island-based broad peak calling'],
          ['SEACR v1.1', 'Sparse Enrichment Analysis for CUT&RUN (stringent and relaxed modes)'],
          ['HOMER', 'Peak annotation with nearest genomic feature classification'],
          ['FastQC', 'Per-file sequencing quality control reports'],
          ['DiffBind', 'R/Bioconductor package for differential binding analysis'],
          ['DESeq2', 'Differential analysis statistical engine (used within DiffBind)'],
          ['edgeR', 'Alternative differential analysis engine with TMM normalization'],
          ['R / rtracklayer', 'bigWig I/O for Pearson correlation and Roman normalization'],
        ],
      },
    ],
  },
};
