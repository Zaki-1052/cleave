#!/usr/bin/env Rscript
# backend/pipelines/scripts/rnaseq_deseq2.R
#
# DESeq2 differential expression via Salmon + tximport.
# Produces: de_results.tsv, normalized_counts.csv, de_summary.json,
#           and 5 plot types (PNG + SVG) in the plots directory.
#
# Usage: Rscript rnaseq_deseq2.R <sample_metadata.csv> <tx2gene.tsv>
#            <results_dir> <plots_dir> <reference_condition>

library(DESeq2)
library(tximport)
library(ggplot2)
library(pheatmap)
library(RColorBrewer)
library(EnhancedVolcano)
library(BiocParallel)
library(jsonlite)

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 5) {
  stop(
    "Usage: Rscript rnaseq_deseq2.R <sample_metadata.csv> <tx2gene.tsv> ",
    "<results_dir> <plots_dir> <reference_condition>"
  )
}

sample_metadata_file <- args[1]
tx2gene_file         <- args[2]
results_dir          <- args[3]
plots_dir            <- args[4]
reference_condition  <- args[5]

for (f in c(sample_metadata_file, tx2gene_file)) {
  if (!file.exists(f)) stop(paste("Error: file not found:", f))
}
dir.create(results_dir, showWarnings = FALSE, recursive = TRUE)
dir.create(plots_dir,   showWarnings = FALSE, recursive = TRUE)

# ---------------------------------------------------------------------------
# Load metadata and tx2gene
# ---------------------------------------------------------------------------

metadata <- read.csv(sample_metadata_file, stringsAsFactors = FALSE)
cat(paste0("Loaded ", nrow(metadata), " samples from metadata\n"))

tx2gene <- read.delim(tx2gene_file, header = TRUE, stringsAsFactors = FALSE)
cat(paste0("Loaded ", nrow(tx2gene), " transcript-to-gene mappings\n"))

# Build named vector of Salmon quant.sf paths
quant_files <- metadata$quant_path
# Append /quant.sf if the path does not already end with it
quant_files <- ifelse(
  grepl("quant\\.sf$", quant_files),
  quant_files,
  file.path(quant_files, "quant.sf")
)
names(quant_files) <- metadata$sample_id

for (qf in quant_files) {
  if (!file.exists(qf)) stop(paste("Error: Salmon quant file not found:", qf))
}

# ---------------------------------------------------------------------------
# tximport — Salmon to gene-level counts
# ---------------------------------------------------------------------------

cat("Running tximport...\n")
txi <- tryCatch({
  tximport(quant_files, type = "salmon", tx2gene = tx2gene[, 1:2],
           ignoreTxVersion = TRUE)
}, error = function(e) {
  stop(paste("tximport failed:", conditionMessage(e)))
})

# ---------------------------------------------------------------------------
# DESeq2
# ---------------------------------------------------------------------------

# Build colData
col_data <- data.frame(
  condition = factor(metadata$condition),
  row.names = metadata$sample_id
)

# Set reference level if specified
if (nchar(reference_condition) > 0 && reference_condition %in% levels(col_data$condition)) {
  col_data$condition <- relevel(col_data$condition, ref = reference_condition)
  cat(paste0("Reference condition set to: ", reference_condition, "\n"))
}

cat("Creating DESeqDataSet from tximport...\n")
dds <- DESeqDataSetFromTximport(txi, colData = col_data, design = ~condition)

# Run DESeq2 with serial fallback for BiocParallel issues
cat("Running DESeq2...\n")
dds <- tryCatch({
  DESeq(dds)
}, error = function(e) {
  cat(paste0("Warning: parallel DESeq() failed (", conditionMessage(e),
             "), retrying with serial backend\n"))
  register(SerialParam())
  DESeq(dds)
})

# Extract results
res <- results(dds, alpha = 0.05)
cat(paste0("DESeq2 complete: ", nrow(res), " genes tested\n"))

# Regularized log transform (reused for PCA, distance, top genes heatmap)
rld <- tryCatch({
  rlog(dds, blind = FALSE)
}, error = function(e) {
  cat(paste0("Warning: rlog failed (", conditionMessage(e),
             "), falling back to varianceStabilizingTransformation\n"))
  varianceStabilizingTransformation(dds, blind = FALSE)
})

# ---------------------------------------------------------------------------
# Build results data frame with gene names
# ---------------------------------------------------------------------------

res_df <- as.data.frame(res)
res_df$gene_id <- rownames(res_df)

# Map gene_id to gene_name via tx2gene (GENEID -> GENENAME)
gene_name_map <- tx2gene[!duplicated(tx2gene[, 2]), c(2, 3)]
colnames(gene_name_map) <- c("gene_id", "gene_name")
idx <- match(res_df$gene_id, gene_name_map$gene_id)
res_df$gene_name <- ifelse(is.na(idx), res_df$gene_id, gene_name_map$gene_name[idx])

# Sort by padj and reorder columns
res_df <- res_df[order(res_df$padj, na.last = TRUE), ]
res_df <- res_df[, c("gene_name", "gene_id", "baseMean", "log2FoldChange",
                      "lfcSE", "stat", "pvalue", "padj")]

# ---------------------------------------------------------------------------
# Write outputs
# ---------------------------------------------------------------------------

# Results TSV
results_path <- file.path(results_dir, "de_results.tsv")
write.table(res_df, file = results_path, sep = "\t", quote = FALSE, row.names = FALSE)
cat(paste0("Wrote results: ", results_path, "\n"))

# Normalized counts CSV
norm_counts <- counts(dds, normalized = TRUE)
norm_counts_df <- data.frame(gene_id = rownames(norm_counts), norm_counts,
                             check.names = FALSE)
counts_path <- file.path(results_dir, "normalized_counts.csv")
write.csv(norm_counts_df, file = counts_path, row.names = FALSE)
cat(paste0("Wrote normalized counts: ", counts_path, "\n"))

# Summary JSON
sig <- res_df[!is.na(res_df$padj) & res_df$padj < 0.05, ]
up_count   <- sum(sig$log2FoldChange > 0, na.rm = TRUE)
down_count <- sum(sig$log2FoldChange < 0, na.rm = TRUE)
summary_data <- list(
  total_genes     = nrow(res_df),
  upregulated     = up_count,
  downregulated   = down_count,
  not_significant = nrow(res_df) - nrow(sig),
  fdr_threshold   = 0.05
)
summary_path <- file.path(results_dir, "de_summary.json")
write(toJSON(summary_data, auto_unbox = TRUE, pretty = TRUE), file = summary_path)
cat(paste0("Wrote summary: ", summary_path, "\n"))

# ---------------------------------------------------------------------------
# Plots — wrapped in safe_plot() to handle failures gracefully
# ---------------------------------------------------------------------------

safe_plot <- function(png_path, svg_path, plot_expr, plot_name) {
  tryCatch({
    png(png_path, width = 800, height = 600)
    eval(plot_expr)
    dev.off()
    svg(svg_path, width = 10, height = 8)
    eval(plot_expr)
    dev.off()
  }, error = function(e) {
    tryCatch(dev.off(), error = function(x) NULL)
    tryCatch(dev.off(), error = function(x) NULL)
    if (file.exists(png_path)) file.remove(png_path)
    if (file.exists(svg_path)) file.remove(svg_path)
    cat(paste0("Warning: ", plot_name, " skipped — ", conditionMessage(e), "\n"))
  })
}

# Volcano plot
cat("Generating volcano plot...\n")
safe_plot(
  file.path(plots_dir, "volcano.png"),
  file.path(plots_dir, "volcano.svg"),
  quote({
    p <- EnhancedVolcano(res_df,
      lab        = res_df$gene_name,
      x          = "log2FoldChange",
      y          = "padj",
      pCutoff    = 0.05,
      FCcutoff   = 1,
      pointSize  = 2.0,
      labSize    = 3.5,
      title      = "Differential Expression",
      subtitle   = paste0("padj < 0.05: ", up_count, " up, ", down_count, " down"),
      selectLab  = head(res_df$gene_name[!is.na(res_df$padj) & res_df$padj < 0.05], 20)
    )
    print(p)
  }),
  "Volcano plot"
)

# MA plot
cat("Generating MA plot...\n")
safe_plot(
  file.path(plots_dir, "ma_plot.png"),
  file.path(plots_dir, "ma_plot.svg"),
  quote(plotMA(res, alpha = 0.05, main = "MA Plot")),
  "MA plot"
)

# PCA plot
cat("Generating PCA plot...\n")
safe_plot(
  file.path(plots_dir, "pca.png"),
  file.path(plots_dir, "pca.svg"),
  quote({
    pca_data <- plotPCA(rld, intgroup = "condition", returnData = TRUE)
    pct_var  <- round(100 * attr(pca_data, "percentVar"))
    p <- ggplot(pca_data, aes(x = PC1, y = PC2, color = condition)) +
      geom_point(size = 4) +
      xlab(paste0("PC1: ", pct_var[1], "% variance")) +
      ylab(paste0("PC2: ", pct_var[2], "% variance")) +
      ggtitle("PCA — rlog-transformed counts") +
      theme_bw(base_size = 14)
    print(p)
  }),
  "PCA plot"
)

# Sample distance heatmap
cat("Generating sample distance heatmap...\n")
safe_plot(
  file.path(plots_dir, "sample_distance.png"),
  file.path(plots_dir, "sample_distance.svg"),
  quote({
    sample_dists <- dist(t(assay(rld)))
    dist_matrix  <- as.matrix(sample_dists)
    colors <- colorRampPalette(rev(brewer.pal(9, "Blues")))(255)
    pheatmap(dist_matrix,
      clustering_distance_rows = as.dist(dist_matrix),
      clustering_distance_cols = as.dist(dist_matrix),
      color = colors,
      main  = "Sample-to-Sample Distances"
    )
  }),
  "Sample distance heatmap"
)

# Top genes heatmap (top 50 by padj)
cat("Generating top genes heatmap...\n")
safe_plot(
  file.path(plots_dir, "top_genes_heatmap.png"),
  file.path(plots_dir, "top_genes_heatmap.svg"),
  quote({
    sig_genes <- res_df[!is.na(res_df$padj) & res_df$padj < 0.05, ]
    top_n <- min(50, nrow(sig_genes))
    if (top_n < 2) {
      stop("Fewer than 2 significant genes — skipping top genes heatmap")
    }
    top_genes <- head(sig_genes$gene_id, top_n)
    mat <- assay(rld)[top_genes, ]
    mat <- mat - rowMeans(mat)
    anno_col <- data.frame(condition = col_data$condition, row.names = rownames(col_data))
    # Use gene_name as row labels when available
    row_labels <- sig_genes$gene_name[match(top_genes, sig_genes$gene_id)]
    row_labels[is.na(row_labels)] <- top_genes[is.na(row_labels)]
    rownames(mat) <- row_labels
    pheatmap(mat,
      annotation_col   = anno_col,
      cluster_rows     = TRUE,
      cluster_cols     = TRUE,
      show_rownames    = top_n <= 50,
      fontsize_row     = 7,
      main             = paste0("Top ", top_n, " DE Genes (padj < 0.05)")
    )
  }),
  "Top genes heatmap"
)

cat(paste0("DESeq2 analysis complete. Results in ", results_dir, " and ", plots_dir, "\n"))
