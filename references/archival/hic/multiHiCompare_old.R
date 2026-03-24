#!/usr/bin/env Rscript

#Load packages
library(multiHiCcompare)
library(GenomicRanges)
library(BiocParallel)
library(data.table)

setwd('/data2/rs_256/hic')

numCores <- 20
register(MulticoreParam(workers = numCores), default = TRUE)

# Helper function to read miatrix files
read_matrix <- function(file) {
  matrix <- fread(file, col.names = c("chr", "region1", "region2", "IF"), 
			nThread = parallel::detectCores())
  return(matrix)
}

# Load and format blacklisted peak regions
blklist <- read.table('/data2/rs_256/workdir/Func_annotation_v2/250123blacklist.bed', header = FALSE, stringsAsFactors = FALSE)
colnames(blklist)[1:3] <- c('chr', 'start', 'end')
blklist <- as(blklist, "GRanges")

# Load and format sample files
ctrl_M1 <- read_matrix('straw/ctrl1_chr1_10.txt')
ctrl_M2 <- read_matrix('straw/ctrl2_chr1_10.txt')
ctrl_M3 <- read_matrix('straw/ctrl3_chr1_10.txt')
mut_M1 <- read_matrix('straw/mut1_chr1_10.txt')
mut_M2 <- read_matrix('straw/mut2_chr1_10.txt')
mut_M3 <- read_matrix('straw/mut3_chr1_10.txt')

# Make hicexp object 
hicexp <- make_hicexp(ctrl_M1, ctrl_M2, ctrl_M3, mut_M1, mut_M2, mut_M3,
			groups = c(0, 0, 0, 1, 1, 1),
			zero.p = 0.8, A.min = 5, filter = TRUE,
			remove.regions = blklist)

#Cyclic loess between-sample normalization
hicexp1 <- cyclic_loess(hicexp, verbose = FALSE, 
                        parallel = FALSE)

#diff analysis
hicexp2 <- hic_exactTest(hicexp1, p.method = 'fdr', 
                         parallel = FALSE)

#retrieve diff analysis results and save as CSV
diffResults <- results(hicexp2)
out <- as.data.frame(diffResults)
out_file <- file.path ("straw/", paste0("multihicompare_results.txt"))
write.table (out, file = out_file, sep = "\t", quote = F, row.names=F, col.names=F)

# plot results
MD_plot_file <- file.path("straw/", paste0("MD_plot_diff.png"))
png(MD_plot_file)
MD_composite(hicexp2)
dev.off()

manhattan_file <- file.path("straw/", paste0("manhattan_plot.png"))
png(manhattan_file)
manhattan_hicexp(hicexp2, p.adj_cutoff = "standard")
dev.off()
