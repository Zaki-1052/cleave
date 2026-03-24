#!/usr/bin/env Rscript

# Load required libraries
library(DiffBind)
library(tidyverse)
library(rtracklayer)
library(GenomicRanges)

# Read command-line argument for directory name and sample sheet csv
args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 2) {
  stop("Error: Please provide an experiment name and a sample table CSV file.\nUsage: Rscript diffbind_analysis.R <experiment_name> <sample_table.csv>")
}

# Set experiment name based on input argument
experiment_name <- args[1]
results_dir <- paste0(experiment_name, "/")
dir.create(results_dir, showWarnings = FALSE)
sample_table_file <- args[2]

# Check if sample table exists
if (!file.exists(sample_table_file)) {
  stop(paste("Error: Sample table file", sample_table_file, "not found!"))
}

# Read sample table
samples <- read_csv(sample_table_file)

# Create a DiffBind object
dbObj <- dba(sampleSheet = samples)

# Count reads in peaks for differential analysis, define consensus peakset
dbObj <- dba.count(dbObj)

# Perform differential analysis
dbObj <- dba.contrast(dbObj, categories = DBA_CONDITION, minMembers = 2)
dbAnalyze <- dba.analyze(dbObj)

# Retrieve differentially(both significant and non-sig)  bound sites and save as CSV
diffResults <- dba.report(dbAnalyze, contrast=1, th=1)
out <- as.data.frame(diffResults)
out_file <- file.path(results_dir, paste0(experiment_name, "_diffbind_results.txt"))
write.table(out, file = out_file, sep = "\t", quote=F, row.names=F)

# Generate plots and save to results directory
pca_plot_file <- file.path(results_dir, paste0(experiment_name, "_PCA_plot.png"))
pca_plot_svg <- file.path(results_dir, paste0(experiment_name, "_PCA_plot.svg"))
png(pca_plot_file)
dba.plotPCA(dbAnalyze, contrast = 1)
svg(pca_plot_svg, width=10, height=10)
dba.plotPCA(dbAnalyze, contrast = 1)
dev.off()

HMg_plot_file <- file.path(results_dir, paste0(experiment_name, "_heatmapgroup_plot.png"))
HMg_plot_svg <- file.path(results_dir, paste0(experiment_name, "_heatmapgroup_plot.svg"))
png(HMg_plot_file)
dba.plotHeatmap(dbAnalyze, contrast=1)
svg(HMg_plot_svg, width=10, height=10)
dba.plotHeatmap(dbAnalyze, contrast=1)
dev.off()

HMc_plot_file <- file.path(results_dir, paste0(experiment_name, "_heatmapcondition_plot.png"))
HMc_plot_svg <- file.path(results_dir, paste0(experiment_name, "_heatmapcondition_plot.svg"))                
png(HMc_plot_file)
dba.plotHeatmap(dbAnalyze, ColAttributes = DBA_CONDITION, contrast=1, correlations=FALSE)
svg(HMc_plot_svg)
dba.plotHeatmap(dbAnalyze, ColAttributes = DBA_CONDITION, contrast=1, correlations=FALSE)
dev.off()

ma_plot_file <- file.path(results_dir, paste0(experiment_name, "_MA_plot.png"))
ma_plot_svg <- file.path(results_dir, paste0(experiment_name, "_MA_plot.svg"))
png(ma_plot_file)
dba.plotMA(dbAnalyze)
svg(ma_plot_svg)
dba.plotMA(dbAnalyze)
dev.off()

volcano_plot_file <- file.path(results_dir, paste0(experiment_name, "_volcano_plot.png"))
volcano_plot_svg <- file.path(results_dir, paste0(experiment_name, "_volcano_plot.svg"))
png(volcano_plot_file)
dba.plotVolcano(dbAnalyze)
svg(volcano_plot_svg)
dba.plotVolcano(dbAnalyze)
dev.off()

# Save normalized counts
normalized_counts <- file.path(results_dir, paste0(experiment_name, "_normalized_counts.csv"))
write.csv(dba.peakset(dbAnalyze, bRetrieve = TRUE), file = normalized_counts

# Completion message
cat(paste("DiffBind analysis complete. Export txt file for functional analysis. Results are in") results_dir))
