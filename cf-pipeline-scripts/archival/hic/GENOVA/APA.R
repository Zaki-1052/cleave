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
explist <- sync_indices(list("WT" = BAP1_WT, "KO" = BAP1_KO))

#Load loops of interest
#Specify input bed file directoy
Loop_dir <- "/data2/rs_256/hic/GENOVA/regions/loops"
APA_files <- list.files(Loop_dir, pattern = "\\.bedpe$", full.names = TRUE)
out_apa <- "/data2/rs_256/hic/GENOVA/APA/"

for (bedfile in APA_files) {
         # Make a label from the bed filename (drop extensin)
        bedpe_name <- tools::file_path_sans_ext(basename(bedfile))
        bedpe <- read.delim(bedfile, header=FALSE)

        #Aggregate peak analysis
        apa <- APA(explist, dist_thres = c(200e3, Inf), bedpe = bedpe)

        APA_plot <- file.path(out_apa, paste0("APA_", bedpe_name, ".", res, ".png"))
        png(APA_plot)
        p1 <- visualise(apa,
			title = paste0("Hi-C ctrl vs BAP1-KO ", bedpe_name), 
			colour_lim = c(0,40),
			colour_lim_contrast = c(-5,5),
			metric = "diff",
			contrast = 1)
        print(p1)
        dev.off()

		APA_quantify <-  quantify(apa)
		
		apa_boxplot <- file.path(out_apa, paste0("APAquant_", bedpe_name, ".", res, ".png"))
		png(apa_boxplot)
		p2 <- boxplot(split(APA_quantify$per_loop$foldchange,
						f = APA_quantify$per_loop$sample),
						col = c('red', 'darkgrey'), outline = F,
						ylab = paste0('pixel enrichment', bedpe_name))
		print(p2)
		dev.off() 

        message("Processed: ", bedpe_name)

}
cat('APA complete')
