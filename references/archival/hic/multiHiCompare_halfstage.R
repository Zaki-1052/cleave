#!/usr/bin/env Rscript

#Load packages
library(multiHiCcompare)
library(GenomicRanges)
library(BiocParallel)
library(data.table)

setwd('/data2/rs_256/hic')

cat("Enter the hicexp Rdata object:")
RDS <- readLines('stdin', n=1)
cat("Enter the chromosome set as chr#_#:")
chrom_set <- readLines('stdin', n=1)
hicexp <- readRDS(RDS)

numCores <- 20
register(MulticoreParam(workers = numCores), default = TRUE)

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
