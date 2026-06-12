# Cleave — TODO

> Outstanding issues, feature gaps, and deployment tasks as of 2026-03-30.

---

## Deployment-Specific

- [ ] **`coleferguson.com` domain switch** — Origin Certificate + Full (strict) documented but not yet executed
- [ ] **Stale security group rule** — port 80 still open on wrong SG (`sg-04ad5578923262b6b`); should be removed
- [ ] **Reference project incomplete** — only `jobs/` and `fastqc/` transferred; trimmed FASTQs skipped due to size (~16GB)
- [ ] **SES sandbox mode** — AWS account needs production access or verified recipient emails for job completion emails to work
- [ ] **Frontend rebuild workflow** — must build locally on Mac and `scp` to EC2 (Node 18+ can't run on Ubuntu 18.04's glibc 2.27)
- [ ] **Docker rebuild** — `docker compose up -d --build api` needed to pick up aioftp/asyncssh if running Docker locally

## Feature Gaps / Tech Debt

- [ ] **Parallelize FastQC on trimmed files** — `run_fastqc_for_files` processes files sequentially; 4 files × ~4 min each = 16 min blocking the worker before auto-pipeline chains to alignment. Use `asyncio.gather` or `ThreadPoolExecutor` to run concurrently
- [ ] **Heatmap/Pearson/Normalization tabs lack Terminate/Retry buttons** — only available via the Analysis Queue page
- [ ] **Per-project storage quotas** — global quota only; no per-project limit
- [ ] **DiffBind custom peakset upload** — currently only selects BED from existing peak calling outputs; can't upload a new one directly in the wizard
- [ ] **DiffBind consensus peakset export** — not exported as a downloadable file
- [ ] **kseq_test binary** — must be compiled per-platform (arm64 local vs x86_64 EC2); not committed to git
- [ ] **Real FTP/SFTP testing** — only mock mode validated; no actual server connection tests
- [ ] **Chart colors not dark-mode themed** — `ANNOTATION_COLORS` and `TRACK_COLORS` are static hex, not adapted for dark mode
- [ ] **`App3.tsx` at repo root** — stale file, superseded by `LandingPage.tsx`; can be deleted
- [ ] **Legacy multipart upload endpoint** — kept alongside tus; could be removed
- [ ] **NotificationPanel** — still uses custom click-outside handler instead of shadcn DropdownMenu
- [ ] **Large directory lazy-loading** — tree scan is fine at current scale but may need pagination for very large experiments

## Monitor After Deploy

- [ ] **m5.8xlarge under parallel load** (32 vCPU) — untested with real concurrent alignment jobs
- [ ] **Memory pressure** — lab's scripts request 32GB via Slurm; m5.8xlarge (32GB) should be fine, but watch alignment memory usage
- [ ] **`CLEANUP_ENABLED=false`** — nothing auto-deletes; disk will fill over time if not toggled on or manually managed
