#!/usr/bin/env Rscript

#Load packages
library(GENOVA)
library(data.table)

#Load ctrl and mut balanced cool files
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

#Specify input bed file directoy
TAD_dir <- "/data2/rs_256/hic/GENOVA/regions/TAD_analyze"
TAD_files <- list.files(TAD_dir, pattern = "\\.bed$", full.names = TRUE)
out_ata <- "/data2/rs_256/hic/GENOVA/ATA/"

for (bedfile in TAD_files) {
	 # Make a label from the bed filename (drop extensin)
  	bed_name <- tools::file_path_sans_ext(basename(bedfile))
	bed <- read.delim(bedfile, header=FALSE)	

	#Aggregate TAD analysis
	ata <- ATA(explist, bed = bed)

	ATA_plot <- file.path(out_ata, paste0("ATA_", bed_name, ".", res, ".png"))
	png(ATA_plot)
	p1 <- visualise(ata)
	print(p1)
	dev.off()

	message("Processed: ", bed_name)

}

cat('TAD analysis complete')
