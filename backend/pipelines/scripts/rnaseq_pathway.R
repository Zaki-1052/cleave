#!/usr/bin/env Rscript
# backend/pipelines/scripts/rnaseq_pathway.R
#
# GO enrichment + KEGG pathway analysis via clusterProfiler.
# Produces: go_results.csv, kegg_results.csv, pathway_summary.json,
#           and dot plots (PNG only) in the plots directory.
#
# Usage: Rscript rnaseq_pathway.R <gene_list.tsv> <organism_code>
#            <org_db> <results_dir> <plots_dir> <fdr_threshold>
#            <enable_gsea>

library(clusterProfiler)
library(ggplot2)
library(jsonlite)
library(DOSE)

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------

args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 7) {
  stop(
    "Usage: Rscript rnaseq_pathway.R <gene_list.tsv> <organism_code> ",
    "<org_db> <results_dir> <plots_dir> <fdr_threshold> <enable_gsea>"
  )
}

gene_list_file  <- args[1]
organism_code   <- args[2]  # "mmu" or "hsa"
org_db_name     <- args[3]  # "org.Mm.eg.db" or "org.Hs.eg.db"
results_dir     <- args[4]
plots_dir       <- args[5]
fdr_threshold   <- as.numeric(args[6])
enable_gsea     <- tolower(args[7]) == "true"

if (!file.exists(gene_list_file)) {
  stop(paste("Error: gene list file not found:", gene_list_file))
}
dir.create(results_dir, showWarnings = FALSE, recursive = TRUE)
dir.create(plots_dir,   showWarnings = FALSE, recursive = TRUE)

# Load organism annotation database
library(org_db_name, character.only = TRUE)
org_db_obj <- get(org_db_name)

# ---------------------------------------------------------------------------
# safe_plot — resilient plot generation (PNG only for pathway)
# ---------------------------------------------------------------------------

safe_plot <- function(png_path, plot_expr, plot_name) {
  tryCatch({
    png(png_path, width = 900, height = 700)
    eval(plot_expr)
    dev.off()
  }, error = function(e) {
    tryCatch(dev.off(), error = function(x) NULL)
    if (file.exists(png_path)) file.remove(png_path)
    cat(paste0("Warning: ", plot_name, " skipped — ", conditionMessage(e), "\n"))
  })
}

# ---------------------------------------------------------------------------
# Load gene list and convert IDs
# ---------------------------------------------------------------------------

genes <- read.delim(gene_list_file, header = TRUE, stringsAsFactors = FALSE)
cat(paste0("Loaded ", nrow(genes), " genes from input list\n"))

# Strip Ensembl version suffixes (e.g., ENSMUSG00000022346.10 -> ENSMUSG00000022346)
gene_ids <- gsub("\\.[0-9]+$", "", genes$gene_id)
gene_ids <- unique(gene_ids)

# Convert Ensembl to Entrez IDs
cat("Converting Ensembl to Entrez IDs via bitr()...\n")
gene_map <- tryCatch({
  bitr(gene_ids, fromType = "ENSEMBL", toType = "ENTREZID", OrgDb = org_db_obj)
}, error = function(e) {
  cat(paste0("Warning: bitr() failed — ", conditionMessage(e), "\n"))
  data.frame(ENSEMBL = character(0), ENTREZID = character(0))
})

mapped_count   <- nrow(gene_map)
unmapped_count <- length(gene_ids) - mapped_count
cat(paste0("Mapped ", mapped_count, " / ", length(gene_ids),
           " genes to Entrez IDs (", unmapped_count, " unmapped)\n"))

entrez_ids <- unique(gene_map$ENTREZID)

# If zero IDs converted, write empty results and exit
if (length(entrez_ids) == 0) {
  cat("Warning: No gene IDs could be mapped to Entrez. Writing empty results.\n")
  writeLines("ID\tDescription\tGeneRatio\tBgRatio\tpvalue\tp.adjust\tqvalue\tgeneID\tCount\tontology",
             file.path(results_dir, "go_results.csv"))
  writeLines("ID\tDescription\tGeneRatio\tBgRatio\tpvalue\tp.adjust\tqvalue\tgeneID\tCount",
             file.path(results_dir, "kegg_results.csv"))
  summary_data <- list(
    total_input_genes   = length(gene_ids),
    mapped_entrez_genes = 0L,
    unmapped_genes      = unmapped_count,
    go_bp_terms         = 0L,
    go_mf_terms         = 0L,
    go_cc_terms         = 0L,
    kegg_pathways       = 0L,
    gsea_enabled        = enable_gsea,
    gsea_terms          = 0L
  )
  write(toJSON(summary_data, auto_unbox = TRUE, pretty = TRUE),
        file.path(results_dir, "pathway_summary.json"))
  cat("Empty results written. Exiting.\n")
  quit(save = "no", status = 0)
}

# ---------------------------------------------------------------------------
# GO enrichment — BP, MF, CC
# ---------------------------------------------------------------------------

run_go <- function(ont_name) {
  cat(paste0("Running enrichGO for ", ont_name, "...\n"))
  tryCatch({
    ego <- enrichGO(
      gene          = entrez_ids,
      OrgDb         = org_db_obj,
      ont           = ont_name,
      pAdjustMethod = "BH",
      pvalueCutoff  = fdr_threshold,
      readable      = TRUE
    )
    ego
  }, error = function(e) {
    cat(paste0("Warning: enrichGO(", ont_name, ") failed — ", conditionMessage(e), "\n"))
    NULL
  })
}

ego_bp <- run_go("BP")
ego_mf <- run_go("MF")
ego_cc <- run_go("CC")

bp_count <- if (!is.null(ego_bp)) nrow(as.data.frame(ego_bp)) else 0L
mf_count <- if (!is.null(ego_mf)) nrow(as.data.frame(ego_mf)) else 0L
cc_count <- if (!is.null(ego_cc)) nrow(as.data.frame(ego_cc)) else 0L
cat(paste0("GO results: BP=", bp_count, " MF=", mf_count, " CC=", cc_count, "\n"))

# Combine GO results into a single CSV with ontology column
go_frames <- list()
if (!is.null(ego_bp) && bp_count > 0) {
  df <- as.data.frame(ego_bp)
  df$ontology <- "BP"
  go_frames[[length(go_frames) + 1]] <- df
}
if (!is.null(ego_mf) && mf_count > 0) {
  df <- as.data.frame(ego_mf)
  df$ontology <- "MF"
  go_frames[[length(go_frames) + 1]] <- df
}
if (!is.null(ego_cc) && cc_count > 0) {
  df <- as.data.frame(ego_cc)
  df$ontology <- "CC"
  go_frames[[length(go_frames) + 1]] <- df
}

if (length(go_frames) > 0) {
  go_combined <- do.call(rbind, go_frames)
} else {
  go_combined <- data.frame(
    ID = character(0), Description = character(0),
    GeneRatio = character(0), BgRatio = character(0),
    pvalue = numeric(0), p.adjust = numeric(0), qvalue = numeric(0),
    geneID = character(0), Count = integer(0), ontology = character(0)
  )
}
go_path <- file.path(results_dir, "go_results.csv")
write.table(go_combined, file = go_path, sep = "\t", quote = FALSE, row.names = FALSE)
cat(paste0("Wrote GO results: ", go_path, " (", nrow(go_combined), " terms)\n"))

# ---------------------------------------------------------------------------
# GO dot plots
# ---------------------------------------------------------------------------

if (!is.null(ego_bp) && bp_count > 0) {
  cat("Generating GO BP dot plot...\n")
  safe_plot(
    file.path(plots_dir, "go_bp.png"),
    quote({
      p <- dotplot(ego_bp, showCategory = 20, title = "GO — Biological Process")
      print(p)
    }),
    "GO BP dot plot"
  )
}

if (!is.null(ego_mf) && mf_count > 0) {
  cat("Generating GO MF dot plot...\n")
  safe_plot(
    file.path(plots_dir, "go_mf.png"),
    quote({
      p <- dotplot(ego_mf, showCategory = 20, title = "GO — Molecular Function")
      print(p)
    }),
    "GO MF dot plot"
  )
}

if (!is.null(ego_cc) && cc_count > 0) {
  cat("Generating GO CC dot plot...\n")
  safe_plot(
    file.path(plots_dir, "go_cc.png"),
    quote({
      p <- dotplot(ego_cc, showCategory = 20, title = "GO — Cellular Component")
      print(p)
    }),
    "GO CC dot plot"
  )
}

# ---------------------------------------------------------------------------
# KEGG pathway enrichment (wrapped in tryCatch — API can be unreachable)
# ---------------------------------------------------------------------------

cat("Running enrichKEGG...\n")
ekegg <- tryCatch({
  enrichKEGG(
    gene          = entrez_ids,
    organism      = organism_code,
    pAdjustMethod = "BH",
    pvalueCutoff  = fdr_threshold
  )
}, error = function(e) {
  cat(paste0("Warning: enrichKEGG failed (KEGG API may be unavailable) — ",
             conditionMessage(e), "\n"))
  NULL
})

kegg_count <- if (!is.null(ekegg)) nrow(as.data.frame(ekegg)) else 0L
cat(paste0("KEGG results: ", kegg_count, " pathways\n"))

if (!is.null(ekegg) && kegg_count > 0) {
  kegg_df <- as.data.frame(ekegg)
} else {
  kegg_df <- data.frame(
    ID = character(0), Description = character(0),
    GeneRatio = character(0), BgRatio = character(0),
    pvalue = numeric(0), p.adjust = numeric(0), qvalue = numeric(0),
    geneID = character(0), Count = integer(0)
  )
}
kegg_path <- file.path(results_dir, "kegg_results.csv")
write.table(kegg_df, file = kegg_path, sep = "\t", quote = FALSE, row.names = FALSE)
cat(paste0("Wrote KEGG results: ", kegg_path, "\n"))

# KEGG dot plot
if (!is.null(ekegg) && kegg_count > 0) {
  cat("Generating KEGG dot plot...\n")
  safe_plot(
    file.path(plots_dir, "kegg.png"),
    quote({
      p <- dotplot(ekegg, showCategory = 20, title = "KEGG Pathway Enrichment")
      print(p)
    }),
    "KEGG dot plot"
  )
}

# ---------------------------------------------------------------------------
# GSEA (optional)
# ---------------------------------------------------------------------------

gsea_terms <- 0L
if (enable_gsea) {
  cat("Running GSEA (gseGO)...\n")

  # Build ranked gene list: log2FoldChange named by Entrez ID
  ranked_df <- merge(genes, gene_map, by.x = "gene_id", by.y = "ENSEMBL")
  ranked_df <- ranked_df[!duplicated(ranked_df$ENTREZID), ]
  ranked_list <- sort(setNames(ranked_df$log2FoldChange, ranked_df$ENTREZID),
                      decreasing = TRUE)

  gsea_result <- tryCatch({
    gseGO(
      geneList     = ranked_list,
      OrgDb        = org_db_obj,
      ont          = "BP",
      pvalueCutoff = fdr_threshold,
      verbose      = FALSE
    )
  }, error = function(e) {
    cat(paste0("Warning: gseGO failed — ", conditionMessage(e), "\n"))
    NULL
  })

  if (!is.null(gsea_result)) {
    gsea_terms <- nrow(as.data.frame(gsea_result))
    cat(paste0("GSEA: ", gsea_terms, " enriched gene sets\n"))

    if (gsea_terms > 0) {
      cat("Generating GSEA plot...\n")
      safe_plot(
        file.path(plots_dir, "gsea_plot.png"),
        quote({
          p <- dotplot(gsea_result, showCategory = 20, title = "GSEA — Biological Process")
          print(p)
        }),
        "GSEA plot"
      )
    }
  }
}

# ---------------------------------------------------------------------------
# Summary JSON
# ---------------------------------------------------------------------------

summary_data <- list(
  total_input_genes   = length(gene_ids),
  mapped_entrez_genes = as.integer(mapped_count),
  unmapped_genes      = as.integer(unmapped_count),
  go_bp_terms         = as.integer(bp_count),
  go_mf_terms         = as.integer(mf_count),
  go_cc_terms         = as.integer(cc_count),
  kegg_pathways       = as.integer(kegg_count),
  gsea_enabled        = enable_gsea,
  gsea_terms          = as.integer(gsea_terms)
)
summary_path <- file.path(results_dir, "pathway_summary.json")
write(toJSON(summary_data, auto_unbox = TRUE, pretty = TRUE), file = summary_path)
cat(paste0("Wrote summary: ", summary_path, "\n"))

cat("Pathway analysis complete.\n")
