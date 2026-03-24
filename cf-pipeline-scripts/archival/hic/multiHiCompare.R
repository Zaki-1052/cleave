#!/usr/bin/env Rscript

#Load packages
library(multiHiCcompare)
library(GenomicRanges)
library(BiocParallel)
library(data.table)

#Cmd line input should be the chromosome sub-folder where divided contacts are
args <- commandArgs(trailingOnly = TRUE)
chrom_set <- args[1]

setwd('/data2/rs_256/hic')

numCores <- 20
register(MulticoreParam(workers = numCores), default = TRUE)

# Helper function to read matrix files
read_matrix <- function(file) {
   matrix <- fread(file, col.names = c("chr", "region1", "region2", "IF"),
             nThread = parallel::detectCores())
   matrix$IF <- as.integer(matrix$IF)
	
	return(matrix)
 }

# Load and format blacklisted peak regions
blklist <- read.table('/data2/rs_256/workdir/Func_annotation_v2/250123blacklist.bed', header = FALSE, stringsAsFactors = FALSE)
colnames(blklist)[1:3] <- c('chr', 'start', 'end')
blklist <- as(blklist, "GRanges")

# Load and format sample files
ctrl_M1 <- read_matrix(list.files(file.path("straw", chrom_set), pattern = "ctrl_M1", full.names = TRUE))
ctrl_M2 <- read_matrix(list.files(file.path("straw", chrom_set), pattern = "ctrl_M2", full.names = TRUE))
ctrl_M3 <- read_matrix(list.files(file.path("straw", chrom_set), pattern = "ctrl_M3", full.names = TRUE))

mut_M1  <- read_matrix(list.files(file.path("straw", chrom_set), pattern = "mut_M1", full.names = TRUE))
mut_M2  <- read_matrix(list.files(file.path("straw", chrom_set), pattern = "mut_M2", full.names = TRUE))
mut_M3  <- read_matrix(list.files(file.path("straw", chrom_set), pattern = "mut_M3", full.names = TRUE))

hic_list <- list(ctrl_M1, ctrl_M2, ctrl_M3, mut_M1, mut_M2, mut_M3)

# Make hicexp object 
hicexp <- make_hicexp(data_list = hic_list,
			groups = c(0, 0, 0, 1, 1, 1),
			zero.p = 0.8, A.min = 5, filter = TRUE,
			remove.regions = blklist, parallel = TRUE)

saveRDS(hicexp, file = paste0(chrom_set, "hicexp.RData"))

rm(ctrl_M1, ctrl_M2, ctrl_M3, mut_M1, mut_M2, mut_M3)
rm(hic_list)

#fastlo between-sample normalization
hicexp1 <- fastlo(hicexp, verbose = TRUE, 
                        parallel = TRUE)

rm(hicexp)

#diff analysis
hicexp2 <- hic_exactTest(hicexp1, p.method = 'fdr', 
                         parallel = TRUE)

#retrieve diff analysis results and save as CSV
diffResults <- results(hicexp2)
out <- as.data.frame(diffResults)
out_file <- file.path ("straw", chrom_set, paste0("multihicompare_results.txt"))
write.table (out, file = out_file, sep = "\t", quote = F, row.names=F, col.names=F)

# plot results
MD_plot_svg <- file.path("straw", chrom_set, paste0("MD_plot_diff.svg"))
MD_plot_file <- file.path("straw", chrom_set, paste0("MD_plot_diff.png"))
png(MD_plot_file)
p1 <- MD_composite(hicexp2)
print(p1)
dev.off()
svg(MD_plot_svg)
MD_composite(hicexp2)
dev.off()

manhattan_svg <- file.path("straw", chrom_set, paste0("manhattan_plot.svg"))
manhattan_file <- file.path("straw", chrom_set, paste0("manhattan_plot.png"))
png(manhattan_file)
p2 <- manhattan_hicexp(hicexp2, p.adj_cutoff = "standard")
print(p2)
dev.off()
svg(manhattan_svg)
manhattan_hicexp(hicexp2, p.adj_cutoff = "standard")
dev.off()
