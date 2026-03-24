#!/usr/bin/env Rscript

#Load packages
library(GENOVA)
library(patchwork)

#Load ctrl and mut balanced cool files
cat ("Enter the path/to/file of the control RDS object:")
ctrl <- readLines("stdin", n=1)
cat ("Enter the path/to/file of the mutant RDS object:")
mut <- readLines("stdin", n=1)

# Specify regions
# Read loci (multiple)
cat("Enter loci as 'chr start end' (one per line, i.e chr2 114e6 116e6). Finish with an empty line:\n")
loci_input <- character()
repeat {
  line <- readLines("stdin", n=1)
  if (line == "") break
  loci_input <- c(loci_input, line)
}
loci <- do.call(rbind, strsplit(loci_input, "\\s+"))
colnames(loci) <- c("chr", "start", "end")
loci <- as.data.frame(loci, stringsAsFactors = FALSE)
loci$start <- as.integer(loci$start)
loci$end   <- as.integer(loci$end)

cat("Reading and syncing RDS files\n")
BAP1_WT <- readRDS(ctrl)
BAP1_KO <- readRDS(mut)

#Sync indices to run on the rest of the code
explist <- sync_indices(list("Ctrl" = BAP1_WT, "Mut" = BAP1_KO))
pyr_dir <- '/data2/rs_256/hic/GENOVA/Pyramids'
insul_dir <- '/data2/rs_256/hic/GENOVA/Insulation'

# Precompute insulation for insulation plots
options(datatable.allow.cartesian=TRUE)
Bap1_insulation <- insulation_score(explist, window = 25)

# Loop over loci
for (i in seq_len(nrow(loci))) {
  chr <- loci$chr[i]
  left <- loci$start[i]
  right <- loci$end[i]
	
	# --- Differential pyramid plot ---
  pyr_diff_plot <- file.path(
    pyr_dir, paste0("Bap1_", chr, ":", left/1e6, "-", right/1e6, "_diffpyr_plot.png")
  )
  png(pyr_diff_plot)
  p1 <- pyramid_difference(BAP1_WT, BAP1_KO, chrom=chr, start=left, end=right)
  print(p1)
  dev.off()


	# Compute locus width for stakced pyramid plots
  region_width <- right - left

	# --- Side-by-side pyramid plot ---
  wt_pyramid <- pyramid(
  BAP1_WT,
  chr = chr, start = left, end = right,
  crop_y = c(0, region_width),
  colour = c(0, 50)
  ) + ggplot2::ggtitle("Control")

  ko_pyramid <- pyramid(
  BAP1_KO,
  chr = chr, start = left, end = right,
  crop_y = c(0, region_width),
  colour = c(0, 50)
  ) + ggplot2::ggtitle("Mutant")

  pyr_stack_plot <- file.path(
    pyr_dir, paste0("Bap1_", chr, ":", left/1e6, "-", right/1e6, "_stackedpyr_plot.png")
  )
  png(pyr_stack_plot)
  p2 <- ko_pyramid / wt_pyramid + plot_layout(guides = "collect")
  print(p2)
  dev.off()

	# --- Insulation plot ---
  insul_plot <- file.path(
    insul_dir, paste0("Bap1_", chr, ":", left/1e6, "-", right/1e6, "_insulation_plot.png")
  )
  png(insul_plot)
  p3 <- visualise(Bap1_insulation,
            chr = chr, start = left, end = right,
            contrast = 1)
  print(p3)
  dev.off()

cat("Visualization plots generated for", paste0(chr, ":", left/1e6, "-", right/1e6),"\n")
}

cat('Visualization plots generated for all loci\n')
