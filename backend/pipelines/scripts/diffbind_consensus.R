#!/usr/bin/env Rscript
# backend/pipelines/scripts/diffbind_consensus.R
#
# DiffBind differential peak analysis — consensus peakset mode (DESeq2).
# Fixed version of references/DPA/diffbind.R with 3 bug corrections:
#   1. Missing closing ) on write.csv()
#   2. Malformed cat() completion message
#   3. Missing dev.off() between PNG and SVG device opens

library(DiffBind)
library(tidyverse)
library(rtracklayer)
library(GenomicRanges)
library(BiocParallel)

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 2) {
  stop("Error: Please provide an experiment name and a sample table CSV file.\nUsage: Rscript diffbind_consensus.R <experiment_name> <sample_table.csv>")
}

experiment_name <- args[1]
results_dir <- paste0(experiment_name, "/")
dir.create(results_dir, showWarnings = FALSE)
sample_table_file <- args[2]

if (!file.exists(sample_table_file)) {
  stop(paste("Error: Sample table file", sample_table_file, "not found!"))
}

samples <- read_csv(sample_table_file)

# Create DiffBind object and count reads in consensus peakset
dbObj <- dba(sampleSheet = samples)
dbObj <- tryCatch({
  dba.count(dbObj)
}, error = function(e) {
  cat(paste0("Warning: parallel dba.count() failed (", conditionMessage(e), "), retrying with serial backend\n"))
  register(SerialParam())
  dba.count(dbObj)
})

# Differential analysis via DESeq2 (default)
dbObj <- dba.contrast(dbObj, categories = DBA_CONDITION, minMembers = 2)
dbAnalyze <- dba.analyze(dbObj)

# Retrieve all peaks (significant and non-significant, th=1)
diffResults <- dba.report(dbAnalyze, contrast=1, th=1)
out <- as.data.frame(diffResults)
out_file <- file.path(results_dir, paste0(experiment_name, "_diffbind_results.txt"))
write.table(out, file = out_file, sep = "\t", quote=F, row.names=F)

# --- Plots (wrapped in tryCatch to handle zero significant sites gracefully) ---

# Helper: save a plot as both PNG and SVG, skipping gracefully on error
safe_plot <- function(png_path, svg_path, plot_expr, plot_name) {
  tryCatch({
    png(png_path)
    eval(plot_expr)
    dev.off()
    svg(svg_path, width=10, height=10)
    eval(plot_expr)
    dev.off()
  }, error = function(e) {
    # Close any open graphics devices from failed attempts
    tryCatch(dev.off(), error = function(x) NULL)
    tryCatch(dev.off(), error = function(x) NULL)
    # Remove partial files
    if (file.exists(png_path)) file.remove(png_path)
    if (file.exists(svg_path)) file.remove(svg_path)
    cat(paste0("Warning: ", plot_name, " skipped — ", conditionMessage(e), "\n"))
  })
}

# PCA plot
safe_plot(
  file.path(results_dir, paste0(experiment_name, "_PCA_plot.png")),
  file.path(results_dir, paste0(experiment_name, "_PCA_plot.svg")),
  quote(dba.plotPCA(dbAnalyze, contrast = 1)),
  "PCA plot"
)

# Heatmap (group correlation)
safe_plot(
  file.path(results_dir, paste0(experiment_name, "_heatmapgroup_plot.png")),
  file.path(results_dir, paste0(experiment_name, "_heatmapgroup_plot.svg")),
  quote(dba.plotHeatmap(dbAnalyze, contrast=1)),
  "Group heatmap"
)

# Heatmap (condition)
safe_plot(
  file.path(results_dir, paste0(experiment_name, "_heatmapcondition_plot.png")),
  file.path(results_dir, paste0(experiment_name, "_heatmapcondition_plot.svg")),
  quote(dba.plotHeatmap(dbAnalyze, ColAttributes = DBA_CONDITION, contrast=1, correlations=FALSE)),
  "Condition heatmap"
)

# MA plot
safe_plot(
  file.path(results_dir, paste0(experiment_name, "_MA_plot.png")),
  file.path(results_dir, paste0(experiment_name, "_MA_plot.svg")),
  quote(dba.plotMA(dbAnalyze)),
  "MA plot"
)

# Volcano plot
safe_plot(
  file.path(results_dir, paste0(experiment_name, "_volcano_plot.png")),
  file.path(results_dir, paste0(experiment_name, "_volcano_plot.svg")),
  quote(dba.plotVolcano(dbAnalyze)),
  "Volcano plot"
)

# Save normalized counts (Bug 1 fixed: closing parenthesis)
normalized_counts <- file.path(results_dir, paste0(experiment_name, "_normalized_counts.csv"))
write.csv(dba.peakset(dbAnalyze, bRetrieve = TRUE), file = normalized_counts)

# Completion message (Bug 2 fixed: comma before results_dir, balanced parens)
cat(paste("DiffBind analysis complete. Export txt file for functional analysis. Results are in", results_dir))
