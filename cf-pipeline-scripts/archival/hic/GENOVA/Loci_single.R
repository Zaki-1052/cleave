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
cat("Enter the chromosome as 'chr#' :")
chr <- readLines('stdin', n=1)
cat("Enter the start site:")
left <- as.integer(readLines('stdin', n=1))
cat("Enter the end site:")
right <- as.integer(readLines('stdin', n=1))

BAP1_WT <- readRDS(ctrl)
BAP1_KO <- readRDS(mut)

#Sync indices to run on the rest of the code
explist <- sync_indices(list("Ctrl" = BAP1_WT, "Mut" = BAP1_KO))
pyr_dir <- '/data2/rs_256/hic/GENOVA/Pyramids'
insul_dir <- '/data2/rs_256/hic/GENOVA/Insulation'

#Generate differential pyramid plot
pyr_diff_plot <- file.path(pyr_dir, paste0("Bap1_", chr, ":", left/1e6, "-", right/1e6, "_diffpyr_plot.png"))
png(pyr_diff_plot)
p1 <- pyramid_difference(BAP1_WT, BAP1_KO, chrom=chr, start=left, end=right)
print(p1)
dev.off()

#Generate side-by-side pyramid plot
wt_pyramid <- pyramid(
  BAP1_WT,
  chr = chr, start = left, end = right,
  crop_y = c(0, 1.e7),
  colour = c(0, 50)
) + ggplot2::ggtitle("Control")

ko_pyramid <- pyramid(
  BAP1_KO,
  chr = chr, start = left, end = right,
  crop_y = c(0, 1e7),
  colour = c(0, 50)
) + ggplot2::ggtitle("Mutant")

pyr_stack_plot <- file.path(pyr_dir, paste0("Bap1_", chr, ":", left/1e6, "-", right/1e6, "_stackedpyr_plot.png"))
png(pyr_stack_plot)
p2 <- ko_pyramid / wt_pyramid + plot_layout(guides = "collect")
print(p2)
dev.off()

##Generate insulation plots
#Run this options line if working with cool
options(datatable.allow.cartesian=TRUE)

Bap1_insulation <- insulation_score(explist, window = 25)
insul_plot <- file.path(insul_dir, paste0("Bap1_", chr, ":", left/1e6, "-", right/1e6, "_insulation_plot.png"))
png(insul_plot)
p3 <- visualise(Bap1_insulation, 
          chr = chr, start = left, end = right, 
          contrast = 1)
print(p3)
dev.off()

cat('Visualization plots generated')
