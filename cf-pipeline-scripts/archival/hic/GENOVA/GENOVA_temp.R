#!/usr/bin/env Rscript

#Load packages
library(GENOVA)

cat ("Enter the path/to/file of the control RDS object:")
cond1 <- readLines("stdin", n=1)
cat ("Enter the path/to/file of the mutant RDS object:")
cond2 <- readLines("stdin", n=1)
cat ("Enter the resolution:")
res <- readLines("stdin", n=1)

BAP1_WT <- readRDS(cond1)
BAP1_KO <- readRDS(cond2)

#Sync indices to run on the rest of the code
explist <- sync_indices(list("Ctrl" = BAP1_WT, "Mut" = BAP1_KO))
base_out <- "/data2/rs_256/hic/GENOVA/initial_outs"

rm(BAP1_WT)
rm(BAP1_KO)

#Generate chromosome matrix
chr_mat <- chromosome_matrix(explist)
chr_mat_file <- file.path(base_out, paste0("chrmat_", res, ".png"))
png(chr_mat_file)
p1 <-visualise(chr_mat)
print(p1)
dev.off()

#Tad + n analysis
Bap1_insulation <- insulation_score(explist, window = 25)
TADcalls <- call_TAD_insulation(Bap1_insulation)

TAD_N <- intra_inter_TAD(explist,
                        tad_bed = TADcalls$Ctrl, 
                        max_neighbour = 10)

TAD_N_plot <- file.path(base_out, paste0("Tad+n_jitter_", res, ".png"))
png(TAD_N_plot)
p2 <-visualise(TAD_N, geom = 'jitter')
print(p2)
dev.off()

P60_SE <- read.delim('/data2/rs_256/hic/GENOVA/regions/analyze/Superenhancers_P60.bed', header=FALSE)

#PE-SCan analysis
WT_PE_OUT = PESCAn(explist, bed = P60_SE)
PESCAn_plot <- file.path(base_out, paste0(res, "_PESCAn_P60SE.png"))
png(PESCAn_plot)
p3 <-visualise(WT_PE_OUT)
print(p3)
dev.off()

persp_plot <- file.path(base_out, paste0(res, "_Perspective_P60SE.png"))
png(persp_plot)
p4 <-persp(WT_PE_OUT, border = NA,
      cex.axis = 0.6, cex.lab = 0.6)
print(p4)
dev.off()
