# CUTANA™ Cloud: Complete UI Reference

## Purpose

CUTANA Cloud is EpiCypher's web-based bioinformatics platform for analyzing CUT&RUN and CUT&Tag sequencing data. It targets experimental scientists who need to go from raw FASTQs to peaks and QC without command-line tools or bioinformatics support.

---

## Visual Design Language

### Overall Aesthetic

The platform uses a distinctive **gradient background** that flows vertically across the entire viewport: starting with a soft **sky blue** at the top, transitioning through a **seafoam/teal green** in the middle, shifting to a **lime/chartreuse green**, and finally ending in a warm **golden yellow/amber** at the bottom. This gradient is present on every page and gives the app a recognizable branded look. All content sits on top of this gradient in **white card containers** with subtle rounded corners and light drop shadows.

### Color Palette

- **Primary blue** (`~#4AAED9`): Used for the EpiCypher logo, nav links, table headers, action buttons, and interactive text links throughout the UI.
- **Dark navy/charcoal**: Used for primary body text and headings.
- **Light gray** (`~#F5F7FA`): Card backgrounds and table row alternating stripes.
- **Status green** (`~#4CAF50`): "Complete" status indicators (filled circle).
- **Status blue (dark)** (`~#3F51B5`): "New" status.
- **Status cyan** (`~#00BCD4`): "In Progress" status.
- **Status red** (`~#B71C1C`): "Error" status.
- **Status gray** (`~#9E9E9E`): "Terminated" status.
- **Gold/amber** (`~#F5A623`): Crown icons on featured/reference projects, and the orange-gold card border highlight that appears on selected or hovered project cards.
- **Teal accent** (`~#2BBCC4`): Member avatar circles.

### Typography & Layout

- Clean sans-serif font (appears to be a system font or similar to Open Sans/Roboto).
- Section headings are **bold, uppercase** for labels (e.g., "EXPERIMENT ID", "CREATED BY") and **sentence case** for page titles.
- Tables use a **light blue header bar** with white text for primary tables, or a lighter blue header row for sub-tables.
- The interface is responsive but clearly designed for desktop/laptop use — data tables are wide and information-dense.

### Shared UI Components

- **Top navigation bar**: Persistent across all pages. White background, sits above the gradient. Contains: EpiCypher logo (left), "Home" and "Analysis Queue" text nav links (the active page has a colored underline — blue for Home, green for Analysis Queue), a bell icon for notifications, a circled question mark for help, and a user identity dropdown (e.g., "Zakir Alibhai ▼") on the far right.
- **Breadcrumb trail**: Appears directly below the nav bar in a semi-transparent blue banner bar. Shows hierarchical navigation path in uppercase (e.g., `HOME > FERGUSON-TEST-CNR > H3K4ME3`). Each segment is a clickable link.
- **Card containers**: All content sections are wrapped in white rounded-corner cards with subtle box-shadows. Cards are the primary layout unit.
- **Tables**: Consistent table design throughout — column headers are clickable/sortable with small funnel filter icons (▼) next to each column name. Tables have "Records per page" dropdowns, pagination controls, and often "Full Screen", "Download", "Customize Columns", and "Search" action buttons in a toolbar row above the table.
- **Buttons**: Primary actions use a **rounded pill shape** with a solid fill (blue for main actions like "NEW ANALYSIS", "Apply Filter", "Update Experiment"; outlined/white for secondary like "Cancel", "Back", "Save"). Destructive or terminal actions don't appear in the screenshots.
- **Status pills/indicators**: A small filled circle of the appropriate color followed by the status text (e.g., 🟢 Complete).
- **Multi-step wizard modals**: Used for experiment creation, alignment, and peak calling. Full-viewport modal overlay with semi-transparent dark backdrop. Numbered step indicators across the top connected by lines, with the active step highlighted. Close button (✕) top-right. Navigation buttons at the bottom: Cancel (text link), Back (outlined pill), Next/Start (solid blue pill).
- **Help icons** (ⓘ): Small circled question marks that appear next to configurable parameters and column headers, providing contextual tooltips/explanations on hover or click.

---

## Page-by-Page UI & Functionality Reference

### 1. Home Page (Projects Dashboard)

**URL path**: `/` or `/home`
**Breadcrumb**: `HOME`
**Nav state**: "Home" link active with blue underline.

#### Layout

The Home page is a **project browser** divided into two regions:

1. **Left sidebar** — "Projects Filters" panel (~20% width)
2. **Main content area** — project card grid (~80% width)

#### Projects Filters Sidebar

A collapsible filter panel with three filter categories, each with a **chevron toggle** (▲ when expanded, ▼ when collapsed):

**Status Filter**
- Presents **checkbox** options, each with a colored status dot:
  - 🔵 New
  - 🔵 In Progress (cyan)
  - 🟢 Complete
  - 🔴 Error
  - ⚪ Terminated (gray)
- Multiple statuses can be selected simultaneously (checkboxes, not radio buttons).

**Members Filter**
- Contains a **search text field** with a magnifying glass icon for looking up members by name.
- Below the search, a list of **checkboxes** with member names (e.g., "Cole Ferguson").
- A "View All" link (blue text) to expand the full member list if it exceeds the default display count.

**Created Filter**
- **Radio button** options (mutually exclusive): "Today", "This Week", "Custom".
- When "Custom" is selected (or always visible), two date fields appear: "From" and "To", each with a **calendar picker icon** on the right side of the input.

**Filter Action Buttons**
- At the bottom of the sidebar: "Clear Filter" (outlined, no fill) and "Apply Filter" (solid blue pill button) sit side by side.

#### Project Cards Grid

Projects are displayed as **rectangular cards** in a horizontal grid layout (appears to be 2–3 cards per row depending on viewport). Each card contains:

- **Project name** (bold, large text) at the top left.
- An **icon** to the left of the name — a small badge/star icon. Reference/gold-standard projects have a filled star/pin icon; user-created projects have an outlined star.
- A **crown icon** (gold) in the top right corner for featured/reference projects (e.g., "Gold Standard Data").
- **"MODIFIED"** label with a date (e.g., `09/02/2025`) below the project name.
- A **status indicator** to the right of the modified date for non-reference projects (e.g., 🟢 Complete).
- A **description** text block below the date (optional — reference projects include a description; user projects may leave this blank).
- A **Members** section at the bottom right showing circular **avatar badges** with initials (e.g., "CF", "ZA") in a teal color.

**Card interaction**: Cards appear to have a subtle **orange/gold border highlight** on hover or selection. The Gold Standard Data card has a dashed gold border; the user's project card has a solid border. Clicking a card navigates to the **Project Detail Page** (see Section 2).

**Pagination**: Below the card grid, a "Records per page" dropdown (default 21) and page navigation controls (`|< < > >|`) with "1-1 of 1" display.

#### Gold Standard Data Project

This is a **read-only reference project** provided by EpiCypher. It is visually distinguished by:
- A crown (👑) icon in the top-right of the card.
- A filled pin/star icon next to the name.
- A description: "Reference datasets highlighting the capabilities and outputs of the CUTANA Cloud CUT&RUN/Tag analysis pipelines."
- No members section shown (it's a platform-wide reference).
- Last modified 09/02/2025.

This project allows new users to explore the platform's outputs (alignment QC, peak calling, visualizations) using pre-loaded validated data without needing to upload their own FASTQs.

---

### 2. Project Detail Page

**URL path**: `/projects/{project-slug}` or similar.
**Breadcrumb**: `HOME > FERGUSON-TEST-CNR`
**Nav state**: Neither Home nor Analysis Queue is actively underlined — navigation context is handled by the breadcrumb.

#### Layout

The Project Detail page is divided into two regions:

1. **Left sidebar** — project metadata and members (~25% width)
2. **Main content area** — experiments table (~75% width)

#### Left Sidebar — Project Info

**Project Header**
- **Project name** in large bold text (e.g., "Ferguson-Test-CnR").
- A **settings/link icon** (⚙ or external link) to the right of the project name.
- **PROJECT SIZE** label with total storage consumption displayed below the name (e.g., "53.2 GB").

**Manage Link**
- A "✏ Manage" link (pencil icon + blue text) for editing project metadata (name, description, etc.).

**Members Section**
- A count header: "2 Members".
- A list of all members, each displayed as:
  - A circular **avatar badge** with initials in teal (e.g., "CF", "ZA").
  - Full name (e.g., "Cole Ferguson").
  - Role label to the right (e.g., "Admin").

**Manage Members Link**
- A "⊕ Manage Members" link (plus icon + blue text) at the bottom of the sidebar. Opens the Manage Members modal (see Section 2a).

#### Main Content — Experiments Table

A single card with a blue header bar labeled "Experiments" and a toolbar containing: "🔍 Search", "⚙ Customize Columns", and **"+ Create Experiment"** button.

**Table Columns**

| Column | Description |
|--------|-------------|
| **Name** | The experiment's name (e.g., "H3K27ac", "H3K4me3"). Has a filter icon. Clickable — navigates to the Experiment View. |
| **Modified** | Timestamp of last modification (e.g., "2026-03-05 11:35:03"). Has a sort toggle (▲/▼) and filter icon. Default sort appears to be by Modified descending. |
| **Assay** | The assay type (e.g., "CUT&RUN"). Has a filter icon. |
| **Last Job** | The most recently completed or running pipeline step (e.g., "Peak Calling", "None"). Has a filter icon. "None" indicates no analysis has been run yet. |
| **Status** | Current experiment status (e.g., "New", "Complete"). Has a filter icon. |

**Observed Experiments**

| Name | Modified | Assay | Last Job | Status |
|------|----------|-------|----------|--------|
| H3K27ac | 2026-03-05 11:35:03 | CUT&RUN | None | New |
| H3K4me3 | 2026-03-05 03:51:01 | CUT&RUN | Peak Calling | Complete |
| 230301-PUM1 | 2026-03-04 08:58:37 | CUT&RUN | None | New |

This demonstrates the project hierarchy: a project contains multiple experiments, each of which can be at different stages of the analysis workflow. The H3K27ac and 230301-PUM1 experiments have been created (FASTQs possibly uploaded) but no analysis has been launched yet ("None" / "New"), while H3K4me3 has completed the full pipeline through peak calling.

**Pagination**: "Records per page: 25", "1-3 of 3".

Clicking "+ Create Experiment" opens the **New Experiment Wizard** (see Section 2b).

---

### 2a. Manage Members Modal

**Trigger**: Clicking "⊕ Manage Members" on the Project Detail page.
**Presentation**: A centered modal overlay with a blue header bar labeled "Manage Members" and a close button (✕).

#### Add Member Section

A single row with:
- **"Add Member"** label.
- A text input field with placeholder: "User Id or Email Address".
- **"Access"** label followed by a **dropdown** defaulting to "Contributor".
- **"Invite"** button (solid blue/coral pill).

This allows project admins to invite new users by entering their platform user ID or email address and assigning an initial role.

#### Existing Members List

Below the add section, a "Members" heading (blue text) and a list of current members:

- Each member row shows: **Full name** (left) and a **role dropdown** (right).
- Admins can change another member's role via the dropdown (e.g., Cole Ferguson shows "Admin" in an active dropdown).
- The **current user's own role** is displayed but **grayed out/disabled** — you cannot change your own role. (Zakir Alibhai shows "Admin" in a non-interactive, dashed-border display.)

**Observed Roles**:
- **Admin** — full project control including managing members and settings.
- **Contributor** — the default role for new invitees; likely can create experiments and run analyses but not manage members.

#### Action Buttons

- "Cancel" (outlined pill) at the bottom center.

---

### 2b. New Experiment Wizard

**Trigger**: Clicking "+ Create Experiment" on the Project Detail page.
**Presentation**: Full-viewport modal overlay, same wizard pattern as other multi-step flows.

**Title**: "New Experiment"
**Steps**: ① Details → ② FASTQs → ③ Reactions

#### Step 1: Details — Experiment Details

A single card with form fields:

- **EXPERIMENT NAME** * — Required text input with a **100-character limit** displayed as a counter on the right side of the field (e.g., "| 100"). This is the primary identifier for the experiment.
- **ASSAY TYPE** * — Required dropdown selector. Observed options:
  - **CUT&RUN**
  - **CUT&Tag**
  These are the only two supported assay types, confirming the platform's exclusive focus on these epigenomic protocols.
- A **description/notes textarea** below the assay type dropdown (large text area, appears to be optional).

**Navigation**: Cancel (text link) and Next (solid blue pill).

Steps 2 (FASTQs) and 3 (Reactions) are described in Sections 6c and 6e respectively.

---

### 3. Notifications Panel

**Trigger**: Clicking the **bell icon** (🔔) in the top navigation bar.
**Presentation**: A **dropdown panel** that overlays the page content, anchored to the bell icon in the top-right area.

#### Content

The panel header reads "🔔 Notifications".

Notifications are listed in **reverse chronological order** (newest first). Each notification entry contains:

- An **icon** on the left: a green checkmark circle (✅) for completed jobs, a briefcase icon for project invitations.
- A **bold title** line: either "Job/Analysis Done" or "Project Invitation".
- A **description line** with details. For job completions: `"[Job Name]" in experiment "[Experiment Name]" has completed successfully.` For project invitations: `[User Name] has made you a [Role] in project "[Project Name]".`
- **Linked text**: Job names, experiment names, and project names appear as **clickable blue links** within the notification text.
- A **date and time** on the bottom of each entry (e.g., "Mar 4, 2026   7:51 PM").

At the bottom of the list: "No more recent notifications to show" in gray text.

#### Observed Notification Types

1. **Job/Analysis Done** — Fired when an alignment or peak calling job finishes. Includes the job/sample name and experiment name.
2. **Project Invitation** — Fired when another user adds you to a project with a specific role. Includes the inviting user's name and the assigned role (e.g., "Admin").

---

### 4. Account Settings (General)

**URL path**: Likely `/settings/general` or similar.
**Breadcrumb**: `HOME > GENERAL`
**Nav state**: Neither Home nor Analysis Queue appears active — this is accessed via the user dropdown menu.

#### Layout

A single white card containing two sections:

**Account Information**
- **User Name**: Displayed as read-only text (e.g., `zalibhai@ucsd.edu`). This is the login identifier and is not editable from this page.
- **First Name**: Editable text field with a **pencil/edit icon** (✏️) on the far right. Displays current value (e.g., "Zakir").
- **Last Name**: Same editable pattern. Displays current value (e.g., "Alibhai").

**Email**
- **Account Email**: Read-only display of the account's email address (same as username in this case: `zalibhai@ucsd.edu`).
- **Job Email Notification**: A labeled dropdown with the description "Get an email notification when a job finishes running." The dropdown options include at minimum "Always" (which is the currently selected value). Likely also includes "Never" or "On Error" options, though not visible in the screenshot.

**Action Buttons**: "Cancel" (outlined) and "Save" (solid blue pill) at the bottom center of the card.

---

### 5. Analysis Queue

**URL path**: `/analysis-queue` or similar.
**Breadcrumb**: `ANALYSIS QUEUE`
**Nav state**: "Analysis Queue" active with **green underline** (notably different color from the blue underline on Home).

#### Layout

A single wide card containing a table with a blue header bar labeled "Analysis Queue" and a "🔍 Search" button and "⚙ Customize Columns" button in the header toolbar.

#### Table Columns

| Column | Description |
|--------|-------------|
| **Name** | The name of the job/sample (e.g., "H3K4me3"). Has a filter icon. |
| **Project** | The parent project name (e.g., "Ferguson-Test-CnR"). Has a filter icon. |
| **Experiment** | The parent experiment name (e.g., "H3K4me3"). Has a filter icon. |
| **Executable** | The pipeline step that ran. Observed values: `runtag_peak_calling`, `runtag_alignment`. Has a filter icon. |
| **Launched By** | The user who initiated the job (e.g., "Zakir Alibhai"). Has a filter icon. |
| **Started Running** | Timestamp of when the job began (e.g., "03/05/26 03:33 AM"). |
| **Duration** | Elapsed wall-clock time (e.g., "17m", "1h 45m"). |
| **Cost** | Credit cost of the job (integer). Alignment cost 5 credits in this example; peak calling cost 0 (free). |
| **Status** | Status indicator with colored dot + text (e.g., 🟢 Complete). Has a filter icon. |

#### Observed Behavior

- Jobs appear in reverse chronological order (most recently started first).
- Each column header has a **funnel/filter icon** (🔽) that likely opens per-column filtering.
- Pagination: "Records per page: 25" dropdown with "1-2 of 2" display.
- The two jobs shown represent the complete CUT&RUN analysis workflow: alignment ran first (01:39 AM, 1h 45m, 5 credits), then peak calling ran after (03:33 AM, 17m, 0 credits). This confirms that **alignment must complete before peak calling can begin** and that **peak calling is free** (0 credits).

---

### 6. Experiment View

**URL path**: Likely `/projects/{project-slug}/experiments/{experiment-slug}` or `/experiments/{id}`.
**Breadcrumb**: `HOME > FERGUSON-TEST-CNR > H3K4ME3`
**Entry point**: Clicking an experiment name on the Project Detail page (Section 2).

#### Experiment Header

A prominent header bar at the top of the experiment view (below breadcrumb, above tab content) containing:

- **Experiment name** in large bold text (e.g., "H3K4me3").
- **Last Job** label: Shows the most recently completed pipeline step (e.g., "Peak Calling").
- **Status**: Colored dot + status text (e.g., 🟢 Complete).
- **Manage** link (pencil icon + "Manage" text, blue) — likely opens experiment settings or metadata editing.
- **"NEW ANALYSIS"** button: A large dark blue pill-shaped button with a dropdown chevron (▼) on the far right. This is the primary CTA for launching new alignment or peak calling jobs on this experiment. The dropdown contains options: "Alignment" (opens the New Alignment Wizard — see Section 7) and "Peak Calling" (opens the New Peak Calling Wizard — see Section 8).

#### Left Sidebar Navigation (Experiment Tabs)

A **vertical tab bar** on the left side of the content area. Each tab is a text label on a colored background strip that matches the gradient. The active tab has a **white/light background highlight** and bold text. Tabs from top to bottom:

1. **Description** — Experiment metadata and details.
2. **FASTQs** — Uploaded sequencing files.
3. **Reactions** — Sample/reaction definitions and metadata.
4. **Alignment** — Alignment run results, QC, files, and browser.
5. **Peak Calling** — Peak calling run results, QC, files, and browser.
6. **History** — Likely a log of all actions/jobs on this experiment (not shown in screenshots).
7. **All Files** — Full file tree browser for all experiment data.

---

### 6a. Description Tab

**Active tab**: Description (first tab, highlighted).

#### Content

Two side-by-side cards:

**Details Card** (left, ~40% width)
A key-value table with the following fields:
| Field | Value |
|-------|-------|
| EXPERIMENT ID | 253 |
| CREATED BY | Zakir Alibhai |
| CREATED DATE | 2026-03-05 |
| STATUS | Complete |
| SIZE | 21.58 GB |

Labels are in **uppercase small caps** with a muted gray color. Values are in regular weight dark text.

**Description Card** (right, ~60% width)
A free-text area labeled "Description" at the top. In this example, the description is empty. This is likely an editable text field for users to add notes about the experiment's purpose, conditions, etc.

---

### 6b. FASTQs Tab

**Active tab**: FASTQs.

#### Content

A single card containing the "FASTQ Files" table with a toolbar row:
- **"FASTQ Files"** title (blue text, left-aligned).
- **"⬇ Download"** button — presumably downloads selected FASTQ files.
- **"⛶ Full Screen"** button — expands the table to fill the viewport.
- **"+ Add FASTQs"** button — opens the FASTQ upload/import wizard (see Section 6c).

#### Table Columns

| Column | Description |
|--------|-------------|
| ☐ (Checkbox) | Row selection for batch operations (download, delete, etc.). |
| **Name** | Full filename of the FASTQ file. Has a filter icon. Files follow Illumina naming conventions: `{date}_{index/sample}_{condition}_{library}_{mark}_trimmed_{lane}_R{read}_001.fastq.gz`. |
| **Size** | File size in MB (e.g., "451.18 MB", "463.16 MB"). |
| **Uploaded** | Upload date (e.g., "2026-03-05"). |
| **FASTQC** | An icon link (small document icon) that opens the FastQC quality report for that file in a modal (see Section 6b-i). |
| **Total Reads** | Total number of sequencing reads in the file (e.g., "9519486"). |

#### Observed Data

10 FASTQ files total (shown as "1-10 of 10"), representing **5 paired-end samples** (each with R1 and R2 files):

| Sample Index | Condition | Short Name | R1 Reads | R2 Reads | R1 Size | R2 Size |
|-------------|-----------|------------|----------|----------|---------|---------|
| IgG | IgG control | IgG | — | — | — | — |
| index_25 | ctrl_1 | K4me3_ctrl1 | 9,519,486 | 9,519,486 | 451.18 MB | 463.16 MB |
| index_26 | mut_1 | K4me3_mut1 | 6,507,915 | 6,507,915 | 314.27 MB | 326.46 MB |
| index_27 | ctrl_2 | K4me3_ctrl2 | 7,698,717 | 7,698,717 | 365.47 MB | 377.17 MB |
| index_28 | mut_2 | K4me3_mut2 | 7,480,471 | 7,480,471 | 356.95 MB | — |

Note: R1 and R2 files for the same sample always have **identical Total Reads counts**, as expected for properly paired FASTQ files. The IgG control files are present but scrolled above the visible portion — their reads can be inferred from the QC Report (23,538,581 total read pairs).

Files are gzipped (`.fastq.gz`), pre-trimmed (filename includes "trimmed"), and the naming convention encodes: sequencing date (230301), demultiplexing index, condition (ctrl/mut), replicate number, library prep info (old_PUM1), target mark (H3K4me3), trim status, lane (L001), and read direction (R1/R2).

---

### 6b-i. FastQC Report Modal

**Trigger**: Clicking the FASTQC icon (📄) next to a FASTQ file in the FASTQs table.
**Presentation**: A large modal overlay with a blue header bar labeled "FASTQC Report" and a close button (✕).

#### Toolbar
- **"⬇ Download Report"** button.
- **"⛶ Full Screen"** button.

#### Content

The modal renders a standard **FastQC HTML report** (produced by FastQC version 0.12.1) directly within the modal. The report includes:

**Header area**: Date of report generation (e.g., "Thu 5 Mar 2026") and the filename analyzed.

**Left sidebar — Summary**
A list of all FastQC analysis modules, each with a pass/fail/warning icon:
- ✅ (green checkmark) = Pass
- ❌ (red X) = Fail
- ⚠️ (yellow triangle) = Warning

Each module name is a **clickable link** that scrolls the right panel to that section.

Observed modules and their statuses for a representative K4me3_ctrl1 R1 file:
| Module | Status |
|--------|--------|
| Basic Statistics | ✅ Pass |
| Per base sequence quality | ✅ Pass |
| Per tile sequence quality | ✅ Pass |
| Per sequence quality scores | ✅ Pass |
| Per base sequence content | ❌ Fail |
| Per sequence GC content | ✅ Pass |
| Per base N content | ✅ Pass |
| Sequence Length Distribution | ⚠️ Warning |
| Sequence Duplication Levels | ✅ Pass |
| Overrepresented sequences | ✅ Pass |
| Adapter Content | ✅ Pass |

Note: The "Per base sequence content" failure is typical for CUT&RUN/CUT&Tag data due to the enzymatic cleavage bias at fragment ends — this is expected and not a quality concern.

**Right panel — Detailed Results**

Starts with **Basic Statistics** table:

| Measure | Value |
|---------|-------|
| Filename | 230301_index_25_ctrl_1_old_PUM1_H3K4me3_trimmed_L001_R1_001.fastq |
| File type | Conventional base calls |
| Encoding | Sanger / Illumina 1.9 |
| Total Sequences | 9519486 |
| Total Bases | 933.1 Mbp |
| Sequences flagged as poor quality | 0 |
| Sequence length | 20-101 |
| %GC | 53 |

Below that, interactive plots for each module (e.g., **Per base sequence quality** box-and-whisker chart showing quality scores across all base positions, with scores consistently high at ~36–38).

---

### 6c. FASTQs Upload/Import Wizard

**Trigger**: Clicking "+ Add FASTQs" on the FASTQs tab, or advancing from Step 1 (Details) during initial experiment creation.
**Presentation**: Full-viewport **modal overlay** with a semi-transparent dark backdrop.

#### Wizard Header

- Title: "Edit Experiment" (if editing existing) or "New Experiment" (if creating new).
- **3-step progress indicator** across the top: ① Details → ② FASTQs (active/current) → ③ Reactions. Steps are connected by lines; the active step is highlighted.
- A close button (✕) in the top-right corner.

#### Step 2: FASTQs — Add Data

A "⚠ FASTQ Requirements" link (yellow warning triangle + blue text) — likely opens documentation about supported FASTQ formats, naming conventions, or size limits.

The content area is split into two panels separated by an "OR" divider:

**Left Panel — Upload FASTQ Files**
- A **drag-and-drop zone** with a dashed blue border, containing a ⊕ icon and the text "Drag & Drop or **Browse**" (Browse is a blue link that opens a file picker).
- Below the drop zone: an "Upload" button (outlined, not yet active until files are staged).
- This is for direct browser-based file upload from the user's local machine.

**Right Panel — Import FASTQ Files**
Four import source options, each as a clickable card/button with an icon and label:

1. **BaseSpace Importer** — Import from Illumina BaseSpace Sequence Hub. Icon: "B" badge (BaseSpace logo).
2. **Amazon Web Services** — Import from an S3 bucket or similar. Icon: AWS logo.
3. **From Server** — Import from an FTP/SFTP server. Icon: server icon.
4. **From Another Experiment** — Copy FASTQs from an existing experiment on the platform. Icon: copy/clone icon.

#### Navigation Buttons

- "Cancel" (text link, leftmost)
- "Back" (outlined pill button)
- "Next" (solid blue pill button, rightmost)

---

### 6d. Reactions Tab

**Active tab**: Reactions.

#### Content

A single card containing the "Reactions" table. The toolbar includes: "⚙ Customize Columns", "⛶ Full Screen", and "✏ Edit" buttons.

#### Table Columns (Default View)

| Column | Description |
|--------|-------------|
| **FASTQ Prefix** | The base filename prefix that links a reaction to its FASTQ files (dropdown indicates this column is sortable/filterable). Shows the common prefix shared by R1 and R2 files. |
| **R1 File** | Green checkmark (✅) indicating an R1 file is linked. |
| **R2 File** | Green checkmark (✅) indicating an R2 file is linked. |
| **Short Name** | A user-defined short identifier for the reaction (e.g., "IgG", "K4me3_ctrl1"). Must be unique per organism. |
| **Assay Type** | The assay protocol used (e.g., "CUT&RUN"). All reactions in this experiment use CUT&RUN. |
| **Organism** | The source organism (e.g., "Mouse"). |

All columns have filter icons (🔽).

#### Observed Reactions

| FASTQ Prefix | Short Name | Assay Type | Organism |
|-------------|------------|------------|----------|
| 230301_IgG_old_PUM1_trimmed_L001 | IgG | CUT&RUN | Mouse |
| 230301_index_25_ctrl_1_old_PUM1_H3K4me3_trimmed_L001 | K4me3_ctrl1 | CUT&RUN | Mouse |
| 230301_index_26_mut_1_old_PUM1_H3K4me3_trimmed_L001 | K4me3_mut1 | CUT&RUN | Mouse |
| 230301_index_27_ctrl_2_old_PUM1_H3K4me3_trimmed_L001 | K4me3_ctrl2 | CUT&RUN | Mouse |
| 230301_index_28_mut_2_old_PUM1_H3K4me3_trimmed_L001 | K4me3_mut2 | CUT&RUN | Mouse |

This represents a typical CUT&RUN experimental design: 1 IgG negative control + 4 H3K4me3 target samples (2 conditions × 2 biological replicates: ctrl_1, ctrl_2, mut_1, mut_2).

---

### 6e. Reactions Edit Wizard (Step 3)

**Trigger**: Clicking "Edit" on the Reactions tab, or progressing from FASTQs step in the experiment wizard.
**Presentation**: Same modal overlay as the FASTQ wizard, now on Step 3: Reactions.

#### Layout

**Upload Reaction Sheet** (top section)
- Header bar: "Upload Reaction Sheet" with note "Supported formats: .csv" and a "⬇ Download Template" link and a help (?) icon.
- A drag-and-drop zone for CSV upload.
- This allows bulk metadata entry by uploading a pre-formatted CSV file (template downloadable from the platform).

**"OR" Divider**

**Manual Reactions Table** (bottom section)
An editable table where users can directly fill in reaction metadata. The toolbar includes "⬇ Download Data", "⛶ Full Screen", and "⚙ Customize Columns".

#### Editable Columns

Required fields are marked with a red asterisk (*):

| Column | Required | Description |
|--------|----------|-------------|
| **FASTQ Prefix** * | Yes | Auto-populated from uploaded FASTQs. Dropdown selector. |
| **Short Name** *, † | Yes | User-defined unique identifier. † Note: "Reactions with the same Organism must have unique Short Names." |
| **Organism** * | Yes | Dropdown (e.g., "Mouse"). |
| **CUTANA Spike in** | No | Whether CUTANA spike-in nucleosomes were used (e.g., "None", "KMetStat"). |
| **CUTANA Spike in Target** | No | The target for spike-in QC if applicable (e.g., "Unmodified", "H3K4me3", "H3K27me3"). |

Additional columns available via "Customize Columns":

| Column | Description |
|--------|-------------|
| E.coli Spike in | Whether E. coli carry-over DNA spike-in was used (Yes/No). |
| Cell Type | The cell type used in the experiment (e.g., "K562"). |
| Cell Number | Number of cells per reaction (e.g., "500k"). |
| Sample Prep | Sample preparation method (e.g., "Frozen native cells"). |
| Experimental Condition | Experimental condition label (e.g., "Untreated"). |
| Antibody Vendor | Antibody manufacturer (e.g., "EpiCypher"). |
| Antibody Cat No | Antibody catalog number (e.g., "13-0042"). |
| Antibody Lot No | Antibody lot number (e.g., "23152006-81"). |
| CUTANA Spike in 2 | Secondary spike-in panel (for dual spike-in experiments). |
| CUTANA Spike in Target 2 | Target for the secondary spike-in. |

The Customize Columns panel presents these as a list of **toggle switches** (blue when on, gray when off), each with an **✕ button** to remove the column. Note: the CSV template column "Cell Prep" maps to the UI column "Sample Prep".

#### Reaction Sheet CSV Format

The platform supports bulk reaction metadata upload via CSV. The template includes all possible columns:

```
FASTQ Prefix,Short Name,Organism,CUTANA Spike in,CUTANA Spike in Target,E.coli Spike in,Cell Type,Cell Number,Sample Prep,Experimental Condition,Antibody Vendor,Antibody Cat No,Antibody Lot No,CUTANA Spike in 2,CUTANA Spike in Target 2
```

**Example 1 — Minimal (Mouse CUT&RUN, no CUTANA spike-in)**:
```csv
230301_IgG_old_PUM1_trimmed_L001,IgG,Mouse,None,,Yes,,,,,,,,,
230301_index_25_ctrl_1_old_PUM1_H3K4me3_trimmed_L001,K4me3_ctrl1,Mouse,None,,Yes,,,,,,,,,
```

**Example 2 — Fully annotated (Human CUT&RUN, KMetStat spike-in, antibody metadata)**:
```csv
22AA001_IgG_C_K562_500K_K-Met_S81_L001,IgG,Human,KMetStat,Unmodified,Yes,K562,500k,Frozen native cells,Untreated,EpiCypher,13-0042,23152006-81,,
22AA003_H3K4me3_C_K562_500K_K-Met_S83_L001,H3K4me3,Human,KMetStat,H3K4me3,Yes,K562,500k,Frozen native cells,Untreated,EpiCypher,13-0060,24008001-82,,
22AA005_H3K27me3_C_K562_500K_K-Met_S85_L001,H3K27me3,Human,KMetStat,H3K27me3,Yes,K562,500k,Frozen native cells,Untreated,EpiCypher,13-0055,23072002-91,,
22AA007_CTCF_C_K562_500K_None_S87_L001,CTCF,Human,None,,Yes,K562,500k,Frozen native cells,Untreated,EpiCypher,13-2014,22222002-81,,
```

The fully annotated example demonstrates: Human organism support, K562 cell line, SNAP-CUTANA KMetStat Panel spike-in with per-reaction target assignment (IgG → Unmodified control, H3K4me3 → H3K4me3, H3K27me3 → H3K27me3, CTCF → None), antibody tracking with vendor/catalog/lot, and the fact that non-histone targets like CTCF are also supported.

#### Action Buttons

- "Cancel" (text link)
- "Back" (outlined pill)
- "Save" (outlined pill) — saves without running analysis.
- "Update Experiment" (solid blue pill) — saves and presumably triggers or queues analysis.

---

### 6f. Alignment Tab

**Active tab**: Alignment.

The Alignment tab has its own **sub-navigation** system. At the top of the content area:
- A **dropdown selector** labeled "Alignments" showing the current alignment run name (e.g., "H3K4me3"). This implies that multiple alignment runs can exist per experiment and you can switch between them.
- A **horizontal tab bar** with 5 sub-tabs: **Info**, **Input**, **QC Report**, **Files**, **IGV**. The active tab has a colored underline (blue for Info, green for others).
- **Status indicator** on the far right: 🟢 Complete.

---

#### 6f-i. Alignment > Info Sub-tab

Two side-by-side cards and a third card:

**Details Card** (left)
| Field | Value |
|-------|-------|
| RUN ID | 2508 |
| CREATED BY | Zakir Alibhai |
| CREATED DATE | 2026-03-05 |
| STATUS | Complete |

**Run Methods Card** (center)
Contains a detailed, auto-generated **methods paragraph** describing the exact pipeline and software versions used. This is designed to be copy-pasteable into a manuscript's Methods section. The observed text describes:

- Platform: CUTANA Cloud by EpiCypher
- App: CUTANA™ CUT&RUN/Tag Alignment app version 1.0.5
- Aligner: Bowtie2 (version 2.2.9) aligned to Mouse mm10
- Post-alignment processing:
  - SAMtools (version 1.13): removal of multi-aligned reads
  - BEDTools (version 2.30.0): removal of reads in ENCODE DAC Exclusion List regions
  - Picard (version 2.27.1): duplicate read filtering
- Signal tracks: RPKM-normalized bigWigs generated via deepTools (version 3.5.1) with `--binsize 20`
- Enrichment analysis: `computeMatrix` (deepTools 3.5.1) for target enrichment at transcription start sites (reference-point mode) and annotated gene bodies (scale-regions mode), with heatmaps generated via `plotHeatmap`

**Notes Card** (right)
An empty notes area with a "✏ Manage" link for adding user annotations.

---

#### 6f-ii. Alignment > Input Sub-tab

A single card containing a "Reactions" table showing the **input parameters** used for this alignment run.

| Column | Description |
|--------|-------------|
| **Short Name** | Reaction identifier. |
| **Assay Type** | Protocol (CUT&RUN). |
| **Organism** | Source organism (Mouse). |
| **Reference Genome** | Genome build used (Mouse mm10). |
| **CUTANA Spike in** | Spike-in status (None in this run). |
| **E.coli Spike in** | E. coli spike-in status (Yes for all reactions). |

Toolbar: Customize Columns, Full Screen, Search.

All 5 reactions are shown with identical parameters except Short Name: IgG, K4me3_ctrl1, K4me3_mut1, K4me3_ctrl2, K4me3_mut2. All used CUT&RUN assay on Mouse with mm10 reference, no CUTANA spike-in, and Yes for E. coli spike-in.

---

#### 6f-iii. Alignment > QC Report Sub-tab

This is a critical data quality assessment view.

**Top Controls**
- **Reference Genome** dropdown (set to "Mouse mm10").
- "QC Report" label.
- "⛶ Full Screen" button.

**Seq Stats and Alignment Metrics Table**

The main table, with toolbar: "⬇ Download Data as CSV", "⛶ Full Screen", "⚙ Customize Columns".

| Short Name | Total Read Pairs | Aligned Read Pairs | Uniquely Aligned Read Pairs | Unique Alignment Rate (%) |
|------------|-----------------|--------------------|-----------------------------|--------------------------|
| IgG | 23,538,581 | 9,906,793 | 6,856,185 | 29.13 |
| K4me3_ctrl1 | 9,519,486 | 9,120,700 | 7,630,846 | 80.16 |
| K4me3_mut1 | 6,507,915 | 6,184,644 | 5,324,032 | 81.81 |
| K4me3_ctrl2 | 7,698,717 | 7,247,507 | 6,063,454 | 78.76 |
| K4me3_mut2 | 7,480,471 | 7,276,517 | 6,279,247 | 83.94 |

**Right-side Info Panel**: "About Seq Stats & Alignment Metrics" — a contextual help box that explains the metrics:
- **Total_Read_Pairs**: Total sequencing reads/read pairs generated after merging R1 and R2 files from paired-end data. These are aligned to the selected reference genome.
- **Aligned_Read_Pairs**: (description continues but is cut off in the screenshot — likely explains the number of reads that successfully mapped to the reference.)

**Key observations from the QC data**:
- The IgG control has a very low unique alignment rate (29.13%), which is expected — IgG is a negative control that shouldn't specifically enrich any genomic region, and much of its signal is non-specific or maps to E. coli spike-in DNA. The high total read count (23.5M) but low alignment rate is characteristic.
- The H3K4me3 target samples have high unique alignment rates (78–84%), indicating good enrichment and library quality.
- Total read pairs for target samples range from ~6.5M to ~9.5M, which is within the typical range for CUT&RUN experiments.

---

#### 6f-iv. Alignment > Files Sub-tab

**Top Controls**
- **Files dropdown** — a dropdown to select which file category to view. Options (from dropdown):
  1. **Unique BAM** (default) — Final filtered BAM files with multi-mappers, duplicates, and DAC exclusion list reads removed.
  2. **bigWig** — RPKM-normalized signal tracks (unsmoothed, `--binsize 20`).
  3. **smoothed bigWig** — Smoothed signal tracks (`--binsize 100`) for IGV visualization.
  4. **TSS Heatmaps** — Heatmap images of enrichment around transcription start sites.
  5. **Gene Body Heatmaps** — Heatmap images of enrichment across scaled gene bodies.
  6. **FASTQC** — FastQC reports for the input FASTQ files.

- **Description text** (left side): Explains the currently selected file type. For Unique BAM: "A BAM file is a compressed output from Alignment representing each sequencing read and where they align to the reference genome. The Unique BAM is the final version that has been filtered for reads that align to multiple locations on the genome, are duplicates, or map to DAC Exclusion List Regions."

**Files Table**

| Column | Description |
|--------|-------------|
| ☐ (Checkbox) | Row selection for batch download. |
| **Filename** | Full filename with sort toggle (▼). |
| **Type** | File extension/type (bam, bai). |
| **Size** | File size (e.g., "930.62 MB", "1.53 MB"). |

Toolbar: "⬇ Download" button, "⛶ Full Screen" button.

The observed files for just the IgG sample show multiple BAM file stages:
- `*_exclusion_list_filtered_uniq.bam` + `.bai` (930.62 MB + 1.53 MB) — Final filtered unique BAM.
- `*_final.bam` + `.bai` (844.89 MB + 1.52 MB) — Intermediate alignment.
- `*_uniq.bam` + `.bai` (1.03 GB + ~1.5 MB) — Unique reads before exclusion list filtering.

With 5 reactions × multiple file types, total file count is 30 ("1-25 of 30"), and pagination is needed.

---

#### 6f-v. Alignment > IGV Sub-tab

An **embedded genome browser** (IGV.js integration) for visualizing alignment data directly in the browser.

**Top Controls**
- **Reference Genome** dropdown: "Mouse mm10".
- Help icon (?).
- **"+ Select Reactions"** button — opens a selector to choose which reactions/tracks to display. When reactions are selected, a **blue badge** with the count appears on the button (e.g., "5" when all 5 reactions are loaded).
- Refresh button (🔄).
- "⛶ Full Screen" button.

**Initial State (No Reactions Selected)**
A placeholder message: "Please select Reference Genome and Reactions to render IGV..." — The IGV viewer requires the user to first select a genome and reactions before rendering tracks. This lazy-loading approach avoids loading heavy genomic data until explicitly requested.

**Active State (Reactions Selected)**
When reactions are selected and loaded, the full IGV.js interface renders:

**IGV Toolbar**
- IGV logo and genome label ("mm10").
- **Chromosome dropdown** (e.g., "chr1").
- **Coordinate input field** showing the current genomic locus (e.g., `chr1:55,053,483-55,056,567`). Users can type a coordinate or gene name to navigate.
- **Span indicator** showing the visible window size (e.g., "🔍 3,085 bp").
- **Toggle buttons**: "Select Tracks", "Crosshairs", "Center Line", "Track Labels" (highlighted when active), "Save Image" (exports current view as a static image).
- **Zoom slider** with −/+ buttons for fine zoom control.

**Genome Overview Bar**
A full-chromosome ideogram/overview bar at the top, with a red indicator marking the currently viewed region. Users can click anywhere on this bar to jump to a different region.

**Coordinate Axis**
Genomic position labels along the top of the track area (e.g., "55,054,000 bp", "55,054,500 bp", etc.).

**Gene/Annotation Track**
A colorful track showing genomic features (gene models, exons, regulatory elements) from the reference genome annotation. Uses the standard IGV color coding.

**Signal Tracks**
One track per selected reaction, showing coverage/signal data as a filled area chart:
- Track labels follow the format `{AlignmentName}-{ShortName}` (e.g., "H3K4me3-K4me3_mut2").
- Each track has a **Y-axis scale** on the left showing the maximum signal value (e.g., "185", "143", "179").
- Each track has a **settings gear icon** (⚙) on the right for per-track configuration (color, scale, display mode, etc.).
- Signal is displayed as a smooth area fill in a muted blue/gray color.

In the observed view, three H3K4me3 target tracks are visible (K4me3_mut2, K4me3_ctrl2, K4me3_mut1), showing enrichment peaks at a promoter region on chr1. The consistent peak pattern across replicates and conditions confirms good data quality and reproducibility.

---

### 6g. Peak Calling Tab

**Active tab**: Peak Calling.

Same sub-navigation structure as Alignment: a dropdown selector (showing "H3K4me3") and sub-tabs: **Info**, **Input**, **QC Report**, **Files**, **IGV**.

---

#### 6g-i. Peak Calling > Info Sub-tab

Same layout as Alignment Info: three cards side by side.

**Details Card**
| Field | Value |
|-------|-------|
| RUN ID | 2509 |
| CREATED BY | Zakir Alibhai |
| CREATED DATE | 2026-03-05 |
| STATUS | Complete |

Note: Run ID 2509 follows Run ID 2508 (alignment), confirming sequential execution.

**Run Methods Card**
Auto-generated methods text describing:
- Platform: EpiCypher CUTANA™ Cloud Platform
- App: CUTANA CUT&RUN/Tag Peak Calling App version 1.0.5
- Peak caller: MACS2 (version 2.2.9.1)
  - Automatically determined bin size based on each input file
  - Significance threshold: q-value of 0.05
- FRiP calculation: BEDTools (version 2.30.0) for reads-in-peaks count ÷ SAMtools (version 1.13) for total read count
- Peak annotation: HOMER (version 4.11.1)

**Notes Card**: Empty, with "✏ Manage" link.

---

#### 6g-ii. Peak Calling > Input Sub-tab

A "Reactions" table showing peak calling input configuration.

| Column | Description |
|--------|-------------|
| **FASTQ Prefix** | The reaction's FASTQ prefix identifier. |
| **IgG Control FASTQ Prefix** | The FASTQ prefix of the IgG control used as background for this reaction. All target reactions reference the same IgG control. |
| **Reference Genome** | Genome build (Mouse mm10). |
| **Peak Caller** | Algorithm used (MACS2). |
| **Peak Size** | Peak width mode (Narrow). |

All 5 reactions are shown. The IgG reaction is listed but uses itself as its own IgG control prefix (it appears in the table for completeness). The 4 target reactions (K4me3_ctrl1, K4me3_mut1, K4me3_ctrl2, K4me3_mut2) all use `230301_IgG_old_PUM1_trimmed_L001` as their IgG control. All use MACS2 with Narrow peak calling mode, appropriate for H3K4me3 (a sharp/narrow histone mark at promoters).

---

#### 6g-iii. Peak Calling > QC Report Sub-tab

**Top Controls**
- **Reference Genome** dropdown (set to "Mouse mm10").
- "QC Report" label.
- "⛶ Full Screen" button.

**Peak Annotation Plots Section**

A card containing the genomic feature distribution visualization.

Toolbar:
- **"⬇ Download Image as PNG"** — exports the plot as a static image.
- **"⬇ Download Data as CSV"** — exports the underlying data.

**Mouse mm10 Feature Distribution Chart**
A **stacked horizontal bar chart** showing the proportion of peaks falling into different genomic feature categories for each reaction:

- **Y-axis**: Reaction short names (IgG, K4me3_ctrl1, K4me3_mut1, etc.).
- **X-axis**: Proportion (implicit, bars fill to 100%).
- **Annotation legend** with color-coded categories:
  - 3UTR (purple)
  - miRNA (dark purple)
  - ncRNA (dark red)
  - TTS (light purple/lilac)
  - pseudo (orange)
  - Exon (green)
  - Intron (blue)
  - (Likely additional categories not fully visible: Promoter, Intergenic, 5UTR)

**Key observations**:
- The **IgG control** shows a large block of intergenic/intron signal (mostly green/blue) — expected for a negative control with no specific enrichment.
- The **H3K4me3 target samples** (K4me3_ctrl1, K4me3_mut1) show a dramatically different distribution with prominent promoter enrichment, smaller intron/intergenic fractions, and visible exon signal — consistent with H3K4me3's known localization at active promoters.
- The pattern is consistent across replicates, confirming reproducibility.

**Right-side Info Panel**: "About Peak Annotation Plots" — explains that this is a "Visual breakdown of where peaks fall relative to genomic features (e.g., promoters, exons, intergenic). Helps contextualize your peaks biologically and is useful for qualitative assessments of replicate datasets." Includes a "See Less" toggle link.

---

#### 6g-iv. Peak Calling > Files Sub-tab

Same layout as Alignment Files, but with a different set of file categories in the **Files dropdown**:

1. **BED Files** (default) — Peak coordinate files in BED format.
2. **FRiP Score** — Fraction of Reads in Peaks metrics/files.
3. **Peak Annotation** — HOMER peak annotation output files.
4. **Peak Annotation Stats** — Summary statistics from HOMER annotation.

Each category shows a table of downloadable files with Filename, Type, and Size columns.

---

### 6h. All Files Tab

**Active tab**: All Files (last tab in the sidebar).

#### Layout

A **dual-panel file browser**:

**Left Panel — Directory Tree**
A hierarchical, expandable folder tree showing the complete file organization for the experiment. Observed structure:
```
Root/
├── Input/
├── Output/
│   └── FastQC/
├── H3K4me3/
│   ├── Alignments job-J6.../
│   │   └── Mouse mm10/
│   └── FASTQs/
│       ├── FASTQC/
│       └── Uploaded_FAST.../
```

Folders are expandable/collapsible with triangle toggles (▶/▼). Clicking a folder in the tree updates the right panel to show its contents.

**Right Panel — Folder Contents**
A table showing the contents of the currently selected folder. When "Root" is selected:

| Column | Description |
|--------|-------------|
| ☐ (Checkbox) | Row selection. |
| **Name** | Folder or file name (clickable link for navigation). Sort toggle (▼). |
| **Type/Class** | "folder" for directories, file type for files. |
| **Size** | File size (blank for folders). |

Shows two folders at root level: "Input" and "Output".

**Toolbar**: "⬇ Download" button (top right), "🔍 Search", "⚙ Customize Columns".

Pagination: "Records per page: 25", "1-2 of 2".

This tab provides a unified view of all files generated across the entire experiment — uploads, intermediate outputs, final results, and QC data — organized in a logical directory hierarchy.

---

### 7. New Alignment Wizard

**Trigger**: Selecting "Alignment" from the "NEW ANALYSIS" dropdown on the Experiment View header.
**Presentation**: Full-viewport modal overlay with wizard pattern.

**Title**: "New Alignment"
**Steps**: ① Details → ② Choose Reactions → ③ Alignment Settings

---

#### 7a. Step 1: Details

Two side-by-side cards:

**Alignment Details Card** (left)
- **ALIGNMENT NAME** * — Required text input with a **30-character limit** counter.
- **NOTES** — Optional multi-line textarea for user notes about this alignment run.

**About Card** (right)
An informational panel with three sections explaining the alignment pipeline:

**WHAT IS ALIGNMENT?**
"Alignment maps paired-end CUT&RUN or CUT&Tag sequencing files to a reference genome, revealing where sequences are enriched across the genome."

**WHAT DOES THE PIPELINE DO?**
"The CUT&RUN/Tag Alignment Pipeline automates the mapping of raw sequences to a reference genome and removes reads that align to more than one location (multi-aligned reads), those from known false positive regions (ENCODE DAC Exclusion List), and duplicate reads by default. A detailed QC Report is generated, including key quality metrics such as SNAP-CUTANA Spike-in nucleosome analysis, E. coli spike-in read depth, and mitochondrial read percentages."

**OUTPUTS**
"Interactive QC report (sequencing stats, spike-in analysis, heatmaps), unique BAMs, bigWigs (smoothed for IGV and unsmoothed for heatmaps), raw/filtered BAMs, and supporting logs."

**Navigation**: Cancel (text link), Next (solid blue pill).

---

#### 7b. Step 2: Choose Reactions

Not directly screenshotted, but this step allows users to select which reactions from the experiment to include in the alignment run. Likely presents a checkbox list or selectable table of all reactions defined in the experiment.

---

#### 7c. Step 3: Alignment Settings

**Reactions Table** (top)
Shows the selected reactions with their parameters. Columns: FastQ Prefix (dropdown), Short Name, Organism, Reference Genome * (dropdown, e.g., "Mouse mm10"). The Reference Genome column is marked as required (*), meaning users must select a genome build for each reaction.

**Advanced Settings** (collapsible section)
An expandable section labeled "Advanced settings" with a chevron toggle (▲ expanded, ▼ collapsed). When expanded, shows:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| **Remove Duplicate Reads** * | Checkbox | ☑ Checked | Whether to remove PCR/optical duplicate reads (via Picard). Has a help icon (ⓘ). |
| **Remove ENCODE DAC Exclusion List regions** * | Checkbox | ☑ Checked | Whether to filter reads mapping to known problematic genomic regions. Has a help icon (ⓘ). |
| **BAM COVERAGE BIN SIZE** * | Numeric input | 20 | Bin size in base pairs for the unsmoothed bigWig coverage track (used for heatmaps). Has a help icon (ⓘ). |
| **SMOOTHED BAM COVERAGE BIN SIZE** * | Numeric input | 100 | Bin size in base pairs for the smoothed bigWig coverage track (used for IGV visualization). Has a help icon (ⓘ). |

Both checkboxes are checked by default, reflecting best-practice pipeline defaults. The bin sizes (20 and 100) match the values observed in the Run Methods text.

**Navigation**: Cancel (text link), Back (outlined pill), **"Start Alignment"** (solid blue pill — the terminal action button that launches the job).

---

### 8. New Peak Calling Wizard

**Trigger**: Selecting "Peak Calling" from the "NEW ANALYSIS" dropdown on the Experiment View header.
**Presentation**: Full-viewport modal overlay with wizard pattern.

**Title**: "New Peak Calling"
**Steps**: ① Details → ② Choose Alignment → ③ Choose Reactions → ④ Peak Calling Settings

Note: The peak calling wizard has **4 steps** (one more than alignment), because it requires selecting a prior alignment run as input before choosing reactions.

---

#### 8a. Step 1: Details

Two side-by-side cards (same layout as alignment):

**Peak Calling Details Card** (left)
- **PEAK CALLING NAME** * — Required text input with a **30-character limit** counter.
- **NOTES** — Optional multi-line textarea.

**About Card** (right)
An informational panel:

**WHAT IS PEAK CALLING?**
"Peak calling pinpoints genomic regions where aligned reads are significantly enriched over background, defining protein or histone mark-containing domains."

**WHAT DOES THE PIPELINE DO?**
"The CUTANA CUT&RUN/Tag Peak Calling Pipeline calls peaks with MACS2 or SICER2 and annotates the nearest genomic feature with HOMER. It is recommended that users designate an IgG control to subtract background signal. All metrics, including number of peaks, FRiP scores, and reads in peaks are compiled into a comprehensive QC Report. HOMER is used to annotate peaks to the nearest genomic feature, applies q-value 0.05 (MACS2) or FDR 0.01 (SICER2) thresholds, and outputs BED peaks. BEDTools + SAMtools compute reads-in-peaks for FRiP (fraction of reads in peaks), while HOMER annotates peaks to genes and genomic features. All metrics are compiled into a concise QC report."

**OUTPUTS**
"QC report (peak stats, FRiP, annotation plots), BED files, FRiP tables, HOMER annotation files & stats, and supporting logs ready for review in IGV and downstream tertiary analysis."

Key revelations from the About text:
- **SICER2** is a second peak calling algorithm option alongside MACS2, designed for **broad/diffuse marks** (like H3K27me3). SICER2 uses an FDR threshold of 0.01 (vs. MACS2's q-value 0.05).
- The pipeline explicitly recommends an IgG control for background subtraction.

**Navigation**: Cancel (text link), Next (solid blue pill).

---

#### 8b. Step 2: Choose Alignment

Not directly screenshotted. This step allows users to select which prior alignment run to use as input for peak calling. Only completed alignment runs would be available for selection. This confirms the dependency: **alignment must be completed before peak calling can begin**.

---

#### 8c. Step 3: Choose Reactions

Not directly screenshotted. This step allows users to select which reactions (from the chosen alignment) to include in peak calling.

---

#### 8d. Step 4: Peak Calling Settings

**Reactions Table** (top)
Shows the selected reactions with their peak calling parameters. Columns:

| Column | Description |
|--------|-------------|
| **FastQ Prefix** | The reaction identifier (dropdown, sortable). |
| **IgG Control FASTQ Prefix** | Dropdown to assign an IgG control for background subtraction. Has both a filter icon and a help icon (ⓘ). |
| **Reference Genome** | Genome build (read-only, inherited from alignment). |
| **Peak Caller** | Dropdown to select the peak calling algorithm. Has filter and help icons. Observed options: **MACS2** (for narrow/sharp marks) and likely **SICER2** (for broad/diffuse marks). |
| **Peak Size** | Dropdown to select peak width mode. Has filter and help icons. Observed options: **Narrow** (for MACS2 with sharp marks like H3K4me3) and likely **Broad** (for SICER2 with diffuse marks like H3K27me3). |

**Advanced Settings** (collapsible section)
Labeled "Advanced settings" with a chevron toggle (▼ collapsed in the screenshot). When expanded, likely contains additional MACS2/SICER2 parameters such as q-value threshold, FDR cutoff, etc.

**Pagination**: "Records per page: All", "1-1 of 1" (showing only the IgG control reaction in this partial view — the other reactions would be shown on scroll or with different pagination).

**Navigation**: Cancel (text link), Back (outlined pill), **"Start Peak Calling"** (solid blue pill — the terminal action button that launches the job).

---

