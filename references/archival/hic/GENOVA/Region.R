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

#Specify input bed file directory
bed_dir <- "/data2/rs_256/hic/GENOVA/regions/analyze"
bed_files <- list.files(bed_dir, pattern = "\\.bed$", full.names = TRUE)

#Specify output directory
out_region <- '/data2/rs_256/hic/GENOVA/Region_Analysis'

#Tornado insulation plot
options(datatable.allow.cartesian=TRUE)

Bap1_insulation <- insulation_score(explist, window = 25)

for (bedfile in bed_files) {
	 # Make a label from the bed filename (drop extensin)
  	bed_name <- tools::file_path_sans_ext(basename(bedfile))
	bed <- read.delim(bedfile, header=FALSE)
	
	# Generate tornado insulation plot
	tornado_insul_plot <- file.path('Region_Analysis/', paste0("TornadoInsul", bed_name, ".", res,  ".png"))
	png(tornado_insul_plot)
	p1 <- tornado_insulation(Bap1_insulation, bed = bed, bed_pos = 'start')
	print(p1)
	dev.off()

	#Aggregate region analysis
	ara <- ARA(explist, bed)
	ARA_plot <- file.path('Region_Analysis/', paste0("ARA_", bed_name, ".", res, ".png"))
	png(ARA_plot)
	p2 <- visualise(ara)
	print(p2)
	dev.off()

	message("Processed: ", bed_name)

}

cat('Region analysis complete')
