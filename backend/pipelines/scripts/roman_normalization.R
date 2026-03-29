# backend/pipelines/scripts/roman_normalization.R
# Parameterized port of references/media_normalization/normalization.r
#
# 99th-percentile quantile normalization (Roman normalization) for
# sample-to-sample bigWig signal comparison.  Mouse only (chr1-19, chrX).
# Core algorithm preserved verbatim from lab reference script.
#
# Usage:
#   Rscript roman_normalization.R <sample_sheet.csv> <output_dir> <mask_bed_path>
#
# sample_sheet.csv columns: SampleName, BigWigPath

library(rtracklayer)

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 3) {
  stop("Usage: Rscript roman_normalization.R <sample_sheet.csv> <output_dir> <mask_bed_path>")
}

sample_sheet_path <- args[1]
output_dir <- args[2]
mask_bed_path <- args[3]

# Read sample sheet
sheet <- read.csv(sample_sheet_path, stringsAsFactors = FALSE)
samples <- sheet$SampleName
bw_paths <- sheet$BigWigPath

if (length(samples) < 2) {
  stop("At least 2 samples are required for normalization")
}

# Mouse only: chr1-19 + chrX (matches lab reference exactly)
chroms <- paste0("chr", c(1:19, "X"))

# Resolution of bigWig files in bp (matches lab reference: dx <- 50)
dx <- 50

# ---------------------------------------------------------------------------
# Step 1: Import bigWigs and organise chromosome information per sample
# (reference lines 24-56)
# ---------------------------------------------------------------------------
samples.list <- list()

cat("organizing chromosome information for each sample\n")
for (idx in seq_along(samples)) {
  s <- samples[idx]
  sbw <- import.bw(bw_paths[idx])

  sbw.list <- list()
  for (chr in chroms) {
    ychr <- sbw[sbw@seqnames == chr, ]

    if (length(ychr) == 0) {
      cat(s, chr, "0 (skipped)\n")
      next
    }

    x1 <- (start(ychr) - 1) / dx + 1
    y1 <- (end(ychr) - 1) / dx + 1
    chrlen <- tail(y1, 1)

    cat(s, chr, chrlen, "\n")

    q1 <- GRanges(seqnames = chr, ranges = IRanges(start = x1, end = y1))
    q  <- GRanges(seqnames = chr, ranges = IRanges(start = 1:chrlen, end = 1:chrlen))

    u1 <- findOverlaps(q, q1)
    w <- mcols(ychr)$score[u1@to]
    names(w) <- as.character(1:chrlen)
    sbw.list[[chr]] <- w
  }
  samples.list[[s]] <- sbw.list
}

# ---------------------------------------------------------------------------
# Step 2: Build coverage matrix
# (reference lines 58-72)
# ---------------------------------------------------------------------------
cat("finding bins common to all samples\n")
all_unlisted <- lapply(samples.list, function(sl) unlist(sl))
all_bin_names <- lapply(all_unlisted, names)
common_bins <- Reduce(intersect, all_bin_names)
cat("bins per sample:", paste(sapply(all_bin_names, length), collapse = ", "), "\n")
cat("common bins across all samples:", length(common_bins), "\n")

cat("creating matrix for all samples\n")
lg <- length(common_bins)
covg <- data.frame(matrix(NA, nrow = lg, ncol = length(samples)))
colnames(covg) <- samples
for (i in seq_along(samples)) {
  covg[, i] <- all_unlisted[[i]][common_bins]
}
rownames(covg) <- common_bins

# ---------------------------------------------------------------------------
# Step 3: Remove zero-coverage bins
# (reference lines 74-77)
# ---------------------------------------------------------------------------
cat("replacing NA/NaN values with 0\n")
na_count <- sum(is.na(covg))
if (na_count > 0) cat("WARNING:", na_count, "NA values found in matrix, replacing with 0\n")
covg[is.na(covg)] <- 0

cat("removing zero-coverage regions\n")
zeros <- rowSums(covg) == 0
cat(round(mean(zeros) * 100, 2), "% loci have zero coverage across all samples combined - ignoring these\n")
covgz <- covg[!zeros, ]

# ---------------------------------------------------------------------------
# Step 4: Apply masking from BED file
# (reference lines 79-104)
# ---------------------------------------------------------------------------
cat("reading in bed file of regions to mask\n")
masked <- read.table(mask_bed_path, sep = "\t", header = FALSE, stringsAsFactors = FALSE)
masked$V2 <- masked$V2 %/% dx + 1
masked$V3 <- masked$V3 %/% dx + 1

chrz <- sapply(strsplit(rownames(covgz), split = "\\."), function(x) x[1])
posz <- sapply(strsplit(rownames(covgz), split = "\\."), function(x) as.numeric(x[2]))

cat("determine bins to mask\n")
remove <- rep(FALSE, dim(covgz)[1])
for (i in 1:dim(masked)[1]) {
  ch <- masked$V1[i]
  p1 <- masked$V2[i]
  p2 <- masked$V3[i]
  remove <- remove | (chrz == ch & posz >= p1 & posz <= p2)
}
# NA in posz propagates to remove — treat unparseable bins as "don't remove"
remove[is.na(remove)] <- FALSE

cat(sum(remove), " bins will be masked\n")
covgf <- covgz[!remove, ]

# ---------------------------------------------------------------------------
# Step 5: Compute 99th percentile and normalization factors
# (reference lines 128-136)
# ---------------------------------------------------------------------------
cat("finding 99th percentile\n")
z <- apply(covgf, 2, function(x) quantile(x, .99, na.rm = TRUE))
cat(z, "\n")

cat("finding normalization factor\n")
nf <- z / z[1]
cat(nf, "\n")

# ---------------------------------------------------------------------------
# New: Write normalization factors CSV (not in reference — added for
# transparency and results display in the web UI)
# ---------------------------------------------------------------------------
factors_df <- data.frame(
  SampleName = samples,
  Percentile99 = as.numeric(z),
  NormalizationFactor = as.numeric(nf),
  stringsAsFactors = FALSE
)
factors_path <- file.path(output_dir, "normalization_factors.csv")
write.csv(factors_df, file = factors_path, row.names = FALSE)
cat("Saved normalization factors to", factors_path, "\n")

# ---------------------------------------------------------------------------
# Step 6: Export normalized bigWig files
# (reference lines 162-171)
# ---------------------------------------------------------------------------
cat("generating normalized bigwigs for IGV visualization\n")
for (idx in seq_along(samples)) {
  s <- samples[idx]
  cat("filename", s, "\n")
  sbw <- import.bw(bw_paths[idx])

  sbw@elementMetadata$score <- round(mcols(sbw)$score / nf[s], 2)
  export.bw(sbw, file.path(output_dir, paste0(s, "_rnorm.bw")))
}
print("Done generating normalized bigwigs for IGV visualization")
