# backend/pipelines/scripts/pearson_matrix.R
# Parameterized port of references/media_pearson_corr/peak_extractor.r
#
# Extracts bigWig coverage into a matrix at 50bp resolution, removes zero-
# coverage bins, applies masking (mouse), and optionally restricts to peaks
# within a BED region.  Core algorithm preserved verbatim from lab script.
#
# Usage:
#   Rscript pearson_matrix.R <sample_sheet.csv> <output_csv> <genome> [mask_bed] [restrict_bed]
#
# sample_sheet.csv columns: SampleName, BigWigPath

library(rtracklayer)

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 3) {
  stop("Usage: Rscript pearson_matrix.R <sample_sheet.csv> <output_csv> <genome> [mask_bed] [restrict_bed]")
}

sample_sheet_path <- args[1]
output_csv        <- args[2]
genome            <- args[3]
mask_bed_path     <- if (length(args) >= 4 && nchar(args[4]) > 0) args[4] else NULL
restrict_bed_path <- if (length(args) >= 5 && nchar(args[5]) > 0) args[5] else NULL

# Select chromosomes based on genome — parameterized from lab's hardcoded chr1-19+chrX
chroms <- switch(genome,
  "mm10" = paste0("chr", c(1:19, "X")),
  "hg38" = paste0("chr", c(1:22, "X")),
  "hg19" = paste0("chr", c(1:22, "X")),
  "dm6"  = c("chr2L", "chr2R", "chr3L", "chr3R", "chr4", "chrX"),
  "sacCer3" = paste0("chr", as.roman(1:16)),
  stop(paste("Unsupported genome:", genome))
)

# Resolution of bigWig files in bp — matches lab script dx=50
dx <- 50

# Read sample sheet
sheet <- read.csv(sample_sheet_path, stringsAsFactors = FALSE)
if (!all(c("SampleName", "BigWigPath") %in% colnames(sheet))) {
  stop("sample_sheet.csv must have columns: SampleName, BigWigPath")
}
samples <- sheet$SampleName
bw_paths <- sheet$BigWigPath

cat("Genome:", genome, "\n")
cat("Resolution:", dx, "bp\n")
cat("Chromosomes:", length(chroms), "\n")
cat("Samples:", length(samples), "\n")

# -----------------------------------------------------------------
# Step 1: Read bigWig files per sample — verbatim from peak_extractor.r
# -----------------------------------------------------------------
samples.list <- list()

cat("organizing chromosome information for each sample\n")
for (idx in seq_along(samples)) {
  s <- samples[idx]
  bw_file <- bw_paths[idx]

  if (!file.exists(bw_file)) {
    stop(paste("bigWig file not found:", bw_file))
  }

  sbw <- import.bw(bw_file)

  sbw.list <- list()
  for (chr in chroms) {
    ychr <- sbw[sbw@seqnames == chr, ]

    if (length(ychr) == 0) {
      cat(s, chr, "0 (skipped)\n")
      next
    }

    # find start and end, scale based on resolution
    x1 <- (start(ychr) - 1) / dx + 1
    y1 <- (end(ychr) - 1) / dx + 1
    chrlen <- tail(y1, 1)

    cat(s, chr, chrlen, "\n")
    sig1 <- rep(0, chrlen)

    q1 <- GRanges(seqnames = chr, ranges = IRanges(start = x1, end = y1))
    q  <- GRanges(seqnames = chr, ranges = IRanges(start = 1:chrlen, end = 1:chrlen))

    u1 <- findOverlaps(q, q1)
    w <- mcols(ychr)$score[u1@to]
    names(w) <- as.character(1:chrlen)
    sbw.list[[chr]] <- w
  }
  samples.list[[s]] <- sbw.list
}

# -----------------------------------------------------------------
# Step 2: Build coverage matrix — verbatim from peak_extractor.r
# -----------------------------------------------------------------
cat("calculating number of bins\n")
u <- unlist(samples.list[[samples[1]]])
lg <- length(u)
cat("number of bins in each sample:", lg, "\n")

cat("creating matrix for all samples\n")
covg <- data.frame(matrix(NA, nrow = lg, ncol = length(samples)))
colnames(covg) <- samples
covg[, 1] <- u
for (i in 2:length(samples)) {
  v <- unlist(samples.list[[samples[i]]])
  covg[, i] <- v
}
rownames(covg) <- names(u)

# -----------------------------------------------------------------
# Step 3: Remove zero-coverage bins — verbatim from peak_extractor.r
# -----------------------------------------------------------------
cat("removing zero-coverage regions\n")
zeros <- rowSums(covg) == 0
cat(round(mean(zeros) * 100, 2), "% loci have zero coverage across all samples combined - ignoring these\n")
covgz <- covg[!zeros, ]

# -----------------------------------------------------------------
# Step 4: Masking — verbatim from peak_extractor.r
# -----------------------------------------------------------------
if (!is.null(mask_bed_path) && file.exists(mask_bed_path)) {
  cat("reading in bed file of regions to mask\n")
  masked <- read.table(mask_bed_path, sep = "\t", header = FALSE, stringsAsFactors = FALSE)
  cat("read in file:", nrow(masked), "masked regions\n")

  # convert to dx units
  masked$V2 <- masked$V2 %/% dx + 1
  masked$V3 <- masked$V3 %/% dx + 1

  # convert rownames of covgz into chr names and bin ids
  chrz <- sapply(strsplit(rownames(covgz), split = "\\."), function(x) x[1])
  posz <- sapply(strsplit(rownames(covgz), split = "\\."), function(x) as.numeric(x[2]))

  cat("determine bins to remove\n")
  remove <- rep(FALSE, dim(covgz)[1])
  for (i in 1:dim(masked)[1]) {
    ch <- masked$V1[i]
    p1 <- masked$V2[i]
    p2 <- masked$V3[i]
    remove <- remove | (chrz == ch & posz >= p1 & posz <= p2)
  }
  cat(sum(remove), "bins will be removed\n")
  covgz <- covgz[!remove, ]
} else {
  if (!is.null(mask_bed_path)) {
    cat("WARNING: mask BED not found:", mask_bed_path, "- skipping masking\n")
  } else {
    cat("No mask BED provided - skipping masking\n")
  }
}

# -----------------------------------------------------------------
# Step 5: Optional BED restriction — verbatim from peak_extractor.r
# -----------------------------------------------------------------
if (!is.null(restrict_bed_path) && file.exists(restrict_bed_path)) {
  cat("reading in bed file of regions to keep\n")
  keep <- read.table(restrict_bed_path, sep = "\t", header = FALSE, stringsAsFactors = FALSE)
  cat("read in file:", nrow(keep), "regions to keep\n")

  keep$V2 <- keep$V2 %/% dx + 1
  keep$V3 <- keep$V3 %/% dx + 1

  chrz <- sapply(strsplit(rownames(covgz), split = "\\."), function(x) x[1])
  posz <- sapply(strsplit(rownames(covgz), split = "\\."), function(x) as.numeric(x[2]))

  cat("determine bins to keep\n")
  keeping <- rep(FALSE, dim(covgz)[1])
  for (i in 1:dim(keep)[1]) {
    ch <- keep$V1[i]
    p1 <- keep$V2[i]
    p2 <- keep$V3[i]
    keeping <- keeping | (chrz == ch & posz >= p1 & posz <= p2)
  }
  cat(sum(keeping), "bins will be kept\n")
  covgz <- covgz[keeping, ]
} else {
  if (!is.null(restrict_bed_path)) {
    cat("WARNING: restrict BED not found:", restrict_bed_path, "- skipping restriction\n")
  }
}

# -----------------------------------------------------------------
# Step 6: Output — verbatim from peak_extractor.r
# -----------------------------------------------------------------
write.csv(covgz, output_csv)
cat("Done outputting to:", output_csv, "\n")
cat("Final matrix dimensions:", nrow(covgz), "bins x", ncol(covgz), "samples\n")
