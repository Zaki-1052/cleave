#!/usr/bin/env Rscript

#Load packages
library(regioneReloaded)
library(rtracklayer)
library(GenomicRanges)
library(GenomeInfoDb)
library(BSgenome.Mmusculus.UCSC.mm10)

setwd('/data2/rs_256/workdir/overlap/')

# Point to your bed files. Put all the folders in the bed file that you would like to run a crosswise perm test
bed_dir <- 'diffpeaks/regions/'
bed_files <- list.files(bed_dir, pattern = "\\.bed(\\.gz)?$", full.names = TRUE)

# Helper to read a BED as mm10 GRanges with UCSC-style seqnames (chr1, …)
read_bed_mm10 <- function(path){
  gr <- rtracklayer::import(path, format = "BED")
  seqlevelsStyle(gr) <- "UCSC"
  gr <- keepStandardChromosomes(gr, pruning.mode = "coarse")
  gr <- sort(gr)
  gr
} 

# Build a *named* list of GRanges. Names become rows/cols in the heatmap.
# Example names (auto from file names): "H3K27ac_unreg", "H3K27ac_down", "H3K4me3_unreg", ...
rs_list <- setNames(lapply(bed_files, read_bed_mm10),
                    tools::file_path_sans_ext(basename(bed_files)))

# Define the mm10 genome (for permutation sampling)
mm10 <- BSgenome.Mmusculus.UCSC.mm10
seql <- seqlengths(mm10)
seql <- seql[grepl("^chr[0-9XYM]+$", names(seql))]          # keep standard chr only

genome_mm10 <- toGRanges(data.frame(
  chr   = names(seql),
  start = 1L,
  end   = as.numeric(seql)
))

# Define a “universe” restricting where peaks can randomize -
# Using all unique regions across your sets is often a good, conservative choice.
universe <- createUniverse(rs_list)  # joins all unique input regions

# Run pairwise permutation tests across *all* region sets
# ntimes: increase to ~1000–5000 for publication; start small to test.
set.seed(42)
cw <- crosswisePermTest(
  rs_list,
  genome = genome_mm10,
  ntimes = 10000,                   # <- adjust to your needs
  universe = universe,             # keeps permutations within your “peak space”
  evFUN = 'numOverlaps',  
  mc.cores = 10  # parallel if available
)

# Build association matrices (normalized z-scores, adj.p, correlations)
cw_mx <- makeCrosswiseMatrix(cw)   # stores matrices inside the genoMatriXeR object

# Access specific matrices if you want to export them:
mevs <- getMultiEvaluation(cw_mx)
mtx <- getMatrix(cw_mx)


# ---- Plot & save ----------------------------------------------------------
# Heatmap of associations (z-scores by default via makeCrosswiseMatrix settings)
modX <- getHClust(cw_mx,hctype = "rows")
modY <- getHClust(cw_mx,hctype = "cols")
X<-modX$labels[modX$order]
Y<-modY$labels[modX$order]
ord<-list(X=X,Y=Y)

p1 <- plotCrosswiseMatrix(cw_mx, matrix_type = "association", ord_mat=ord,  main = "regioneReloaded: Associations")
ggplot2::ggsave("regioneReloaded_associations_mm10.pdf", p1, width = 8, height = 7)

# (Optional) “correlation of rows/cols” view
p2 <- plotCrosswiseMatrix(cw_mx, matrix_type = "correlation", main = "Correlation of association profiles")
ggplot2::ggsave("regioneReloaded_correlations_mm10.pdf", p2, width = 8, height = 7)

# (Optional) 2D embedding (PCA/UMAP/tSNE) based on association structure
p3 <- plotCrosswiseDimRed(cw_mx, type = "UMAP")
ggplot2::ggsave("regioneReloaded_umap_mm10.pdf", p3, width = 7, height = 6)

# ---- Export matrices to files --------------------------------------------
write.csv(mevs,  file = "regioneReloaded_multi_mm10.csv")
write.csv(mtx, file = "regioneReloaded_matrix_mm10.csv")
