#!/usr/bin/env Rscript
# backend/pipelines/scripts/diffbind_peaklist.R
#
# DiffBind differential peak analysis — custom peakset mode (DESeq2).
# Fixed version of references/DPA/diffbind_peaklist.R with 3 bug corrections:
#   1. Missing closing ) on write.csv()
#   2. Malformed print() completion message
#   3. Missing dev.off() between PNG and SVG device opens

library(DiffBind)
library(tidyverse)
library(rtracklayer)
library(GenomicRanges)

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 3) {
  stop("Error: Please provide an experiment name, a sample table CSV file, and a peakset.\nUsage: Rscript diffbind_peaklist.R <experiment_name> <sample_table.csv> <peakset>")
}

experiment_name <- args[1]
results_dir <- paste0(experiment_name, "/")
dir.create(results_dir, showWarnings = FALSE)
sample_table_file <- args[2]
peakset <- read.table(args[3], header = FALSE, sep = "\t", stringsAsFactors=FALSE, quote = "")

if (!file.exists(sample_table_file)) {
  stop(paste("Error: Sample table file", sample_table_file, "not found!"))
}

samples <- read_csv(sample_table_file)

# Create DiffBind object and count reads using external peakset
dbObj <- dba(sampleSheet = samples)
dbObj <- dba.count(dbObj, peaks=peakset, summits=200, filter=0)

# Differential analysis via DESeq2 (default)
dbObj <- dba.contrast(dbObj, categories = DBA_CONDITION, minMembers = 2)
dbAnalyze <- dba.analyze(dbObj)

# Retrieve all peaks (significant and non-significant, th=1)
diffResults <- dba.report(dbAnalyze, contrast=1, th=1)
out <- as.data.frame(diffResults)
out_file <- file.path(results_dir, paste0(experiment_name, "_diffbind_results.txt"))
write.table(out, file = out_file, sep = "\t", quote=F, row.names=F)

# --- Plots (Bug 3 fixed: dev.off() after each PNG before each SVG) ---

# PCA plot
pca_plot_file <- file.path(results_dir, paste0(experiment_name, "_PCA_plot.png"))
pca_plot_svg <- file.path(results_dir, paste0(experiment_name, "_PCA_plot.svg"))
png(pca_plot_file)
dba.plotPCA(dbAnalyze, contrast = 1)
dev.off()
svg(pca_plot_svg, width=10, height=10)
dba.plotPCA(dbAnalyze, contrast = 1)
dev.off()

# Heatmap (group correlation)
HMg_plot_file <- file.path(results_dir, paste0(experiment_name, "_heatmapgroup_plot.png"))
HMg_plot_svg <- file.path(results_dir, paste0(experiment_name, "_heatmapgroup_plot.svg"))
png(HMg_plot_file)
dba.plotHeatmap(dbAnalyze, contrast=1)
dev.off()
svg(HMg_plot_svg, width=10, height=10)
dba.plotHeatmap(dbAnalyze, contrast=1)
dev.off()

# Heatmap (condition)
HMc_plot_file <- file.path(results_dir, paste0(experiment_name, "_heatmapcondition_plot.png"))
HMc_plot_svg <- file.path(results_dir, paste0(experiment_name, "_heatmapcondition_plot.svg"))
png(HMc_plot_file)
dba.plotHeatmap(dbAnalyze, ColAttributes = DBA_CONDITION, contrast=1, correlations=FALSE)
dev.off()
svg(HMc_plot_svg, width=10, height=10)
dba.plotHeatmap(dbAnalyze, ColAttributes = DBA_CONDITION, contrast=1, correlations=FALSE)
dev.off()

# MA plot
ma_plot_file <- file.path(results_dir, paste0(experiment_name, "_MA_plot.png"))
ma_plot_svg <- file.path(results_dir, paste0(experiment_name, "_MA_plot.svg"))
png(ma_plot_file)
dba.plotMA(dbAnalyze)
dev.off()
svg(ma_plot_svg, width=10, height=10)
dba.plotMA(dbAnalyze)
dev.off()

# Volcano plot
volcano_plot_file <- file.path(results_dir, paste0(experiment_name, "_volcano_plot.png"))
volcano_plot_svg <- file.path(results_dir, paste0(experiment_name, "_volcano_plot.svg"))
png(volcano_plot_file)
dba.plotVolcano(dbAnalyze)
dev.off()
svg(volcano_plot_svg, width=10, height=10)
dba.plotVolcano(dbAnalyze)
dev.off()

# Save normalized counts (Bug 1 fixed: closing parenthesis)
normalized_counts <- file.path(results_dir, paste0(experiment_name, "_normalized_counts.csv"))
write.csv(dba.peakset(dbAnalyze, bRetrieve = TRUE), file = normalized_counts)

# Completion message (Bug 2 fixed: comma before results_dir, balanced parens)
print(paste("DiffBind analysis complete. Export txt file for functional analysis. Results are in", results_dir))
