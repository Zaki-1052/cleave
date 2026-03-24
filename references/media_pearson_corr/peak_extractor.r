

library(rtracklayer)

# directory with bw files
dir<-"/media/rs_256/pearson_corr/SLC_bw_rnorm/"
cat("workdir: ", dir, "\n")

###################
## MODIFY #########
files <- c(
  "brainH3K4me3EARLY1.bw",        "brainH3K27acEARLY1.bw",
  "brainH3K27acEARLY2.bw",        "brainH3K27acLATE1.bw",
  "brainH3K27acLATE2.bw",         "brainH3K27me3EARLY1.bw",
  "brainH3K27me3EARLY2.bw",       "brainH3K27me3LATE1.bw",
  "brainH3K27me3LATE2.bw",        "brainH3K4me3EARLY1.bw",
  "brainH3K4me3EARLY2.bw",        "brainH3K4me3LATE1.bw",
  "brainH3K4me3LATE2.bw",         "brainH3K9acEARLY1.bw",
  "brainH3K9acEARLY2.bw",         "brainH3K9acLATE1.bw",
  "brainH3K9acLATE2.bw",
  "kidneyH3K27acEARLY1_rnorm.bw", "kidneyH3K27acEARLY2_rnorm.bw",
  "kidneyH3K27acLATE1_rnorm.bw",  "kidneyH3K27acLATE2_rnorm.bw",
  "kidneyH3K27me3EARLY1_rnorm.bw","kidneyH3K27me3EARLY2_rnorm.bw",
  "kidneyH3K27me3LATE1_rnorm.bw", "kidneyH3K27me3LATE2_rnorm.bw",
  "kidneyH3K4me3EARLY1_rnorm.bw", "kidneyH3K4me3EARLY2_rnorm.bw",
  "kidneyH3K4me3LATE1_rnorm.bw",  "kidneyH3K4me3LATE2_rnorm.bw",
  "kidneyH3K9acEARLY1_rnorm.bw",  "kidneyH3K9acEARLY2_rnorm.bw",
  "kidneyH3K9acLATE1_rnorm.bw",   "kidneyH3K9acLATE2_rnorm.bw",
  "liverH3K27acEARLY1_rnorm.bw",  "liverH3K27acEARLY2_rnorm.bw",
  "liverH3K27acLATE1_rnorm.bw",   "liverH3K27acLATE2_rnorm.bw",
  "liverH3K27me3EARLY1_rnorm.bw", "liverH3K27me3EARLY2_rnorm.bw",
  "liverH3K27me3LATE1_rnorm.bw",  "liverH3K27me3LATE2_rnorm.bw",
  "liverH3K4me3EARLY1_rnorm.bw",  "liverH3K4me3EARLY2_rnorm.bw",
  "liverH3K4me3LATE1_rnorm.bw",   "liverH3K4me3LATE2_rnorm.bw",
  "liverH3K9acEARLY1_rnorm.bw",   "liverH3K9acEARLY2_rnorm.bw",
  "liverH3K9acLATE1_rnorm.bw",    "liverH3K9acLATE2_rnorm.bw"
)

samples <- sub("\\.bw$", "",
               files[grepl("1(_rnorm)?\\.bw$", files)])

#samples<-c("kidneyH3K4me3EARLYavg", "kidneyH3K4me3LATEavg", "kidneyH3K9acEARLYavg", "kidneyH3K9acLATEavg", "kidneyH3K27acEARLYavg", "kidneyH3K27acLATEavg", "kidneyH3K27me3EARLYavg", "kidneyH3K27me3LATEavg" ) # sample names
#samples<-c("kidneyH3K4me3EARLY2_rnorm", "kidneyH3K4me3LATE2_rnorm", "kidneyH3K9acEARLY2_rnorm", "kidneyH3K9acLATE2_rnorm", "kidneyH3K27acEARLY2_rnorm", "kidneyH3K27acLATE2_rnorm", "kidneyH3K27me3EARLY2_rnorm", "kidneyH3K27me3LATE2_rnorm" ) # sample names  

#samples<-c("liverH3K4me3EARLY1_rnorm", "liverH3K4me3LATE1_rnorm", "liverH3K9acEARLY1_rnorm", "liverH3K9acLATE1_rnorm", "liverH3K27acEARLY1_rnorm", "liverH3K27acLATE1_rnorm", "liverH3K27me3EARLY1_rnorm", "liverH3K27me3LATE1_rnorm" )
bedfile = "masked_regions.bed" # bedfile
csv_out = "AP_ADME_HM_H3K4me3_rep1.csv" # change this to the name of your pearson csv file (this will be input into pearson.py
# make sure the format of the filename starts with "pearson_df_" and ends with .csv
###################
###################

chroms<-c("chr1","chr2","chr3","chr4","chr5","chr6","chr7","chr8","chr9","chr10","chr11","chr12","chr13","chr14","chr15","chr16","chr17","chr18","chr19","chrX")

# resolution of Cole's bw files in bp
dx<-50

#create a list of lists
samples.list<-list() #there will be one entry per sample

cat("organizing chromosome information for each sample\n")
for (s in samples) {
  #read sample bigwigs. Modify the directory as appropriate
  sbw<-import.bw(paste0(dir,s,".bw"))

  sbw.list<-list() #there will be one entry per chromosome
  for (chr in chroms) {
    ychr<-sbw[sbw@seqnames==chr,] #retrieving rows with the chromosome we want

    # find start and end, scale based on resolution
    x1<-(start(ychr)-1)/dx + 1 #1-based
    y1<-(end(ychr)-1)/dx + 1 #1-based
    chrlen<-tail(y1,1) # 50bp resolution

    cat(s, chr, chrlen, "\n") # to screen
    sig1<-rep(0,chrlen) #signal from ychr

    # container for genomic locations: https://www.rdocumentation.org/packages/GenomicRanges/versions/1.24.1/topics/GRanges-class
    # https://bioconductor.org/packages/release/bioc/manuals/GenomicRanges/man/GenomicRanges.pdf
    q1 <- GRanges(seqnames=chr, ranges=IRanges(start=x1, end=y1))
    q <- GRanges(seqnames=chr, ranges=IRanges(start=1:chrlen, end=1:chrlen))

    u1<-findOverlaps(q,q1) #find overlapping intervals #a segment with index i in q is inside segment with index u@to[i] in q1.
    #so signal from q1 translates into q as mcols(yc1_chr1)$score[u@to]
    # get metadata for current chr and get score (from original table?)
    w<-mcols(ychr)$score[u1@to]
    names(w)<-as.character(1:chrlen)
    sbw.list[[chr]]<-w
  }
  samples.list[[s]]<-sbw.list
}

#combine controls and find local maxima
cat("calculating number of bins\n")
u<-unlist(samples.list[[samples[1]]]) # unravelling first sample only
lg<-length(u)
cat("number of bins in each sample: ", lg, "\n")

cat("creating matrix for all samples\n")
covg<-data.frame(matrix(NA,nrow=lg,ncol=length(samples)))
colnames(covg)<-samples
covg[,1]<-u # adding values
for (i in 2:length(samples)) {
  v<-unlist(samples.list[[samples[i]]])
  covg[,i]<-v
}
rownames(covg)<-names(u)

cat("removing zero-coverage regions\n")
zeros<-rowSums(covg)==0 # which loci have zero coverage?
cat(round(mean(zeros)*100, 2), "% loci have zero coverage across all sample combined - ignoring these\n")
covgz<-covg[!zeros,] #remove bins that are 0 across replicates

#write.csv(covgz, "no_zeroes_h3k27ac")

###################################################################
#read bed file of regions to overlap
cat("reading in bed file of regions to keepi\n")
keep<-read.table("allTissueH3K4me3.bed",sep='\t',header=FALSE,stringsAsFactors=FALSE)
cat("read in file\n")
# convert to dx units
keep$V2<-keep$V2 %/% dx + 1
keep$V3<-keep$V3 %/% dx + 1
##################################################################

#read bed file of masked regions
cat("reading in bed file of regions to mask\n")
masked<-read.table(bedfile,sep="\t",header=FALSE,stringsAsFactors=FALSE) # the regions we want to avoid
cat("read in file\n")
#convert to dx units
masked$V2<-masked$V2 %/% dx + 1
masked$V3<-masked$V3 %/% dx + 1

#convert rownames of covgz into chr names and bin ids
chrz<-sapply(strsplit(rownames(covgz),split="\\."),function(x) x[1])
posz<-sapply(strsplit(rownames(covgz),split="\\."),function(x) as.numeric(x[2])) #in dx units

#this takes a while
#mask
cat("determine bins to remove\n")
remove<-rep(FALSE,dim(covgz)[1])
for (i in 1:dim(masked)[1]) {
  ch<-masked$V1[i] # get each masked value
  p1<-masked$V2[i]
  p2<-masked$V3[i]
  remove<-remove | (chrz==ch & posz>=p1 & posz<=p2) # remove if correct chr and in correct interval
}
cat(sum(remove), " bins will  be removed\n")
# remove the bins we want to mask
covgf<-covgz[!remove,] #if masking

#################################################################
chrz<-sapply(strsplit(rownames(covgf),split="\\."),function(x) x[1])
posz<-sapply(strsplit(rownames(covgf),split="\\."),function(x) as.numeric(x[2])) #in dx units
cat("determine bins to keep\n")
keeping<-rep(FALSE,dim(covgf)[1])
for (i in 1:dim(keep)[1]) {
  ch<-keep$V1[i] # get each masked value
  p1<-keep$V2[i]
  p2<-keep$V3[i]
  keeping<-keeping | (chrz==ch & posz>=p1 & posz<=p2) # remove if correct chr and in correct interval
}
cat(sum(keeping), " bins will  be kept\n")
# remove the bins we want to mask
covgfk<-covgf[keeping,]
################################################################

write.csv(covgf, csv_out)
cat("Done outputting to :", csv_out, "\n")

#make scatterplots of raw, non-normalized data
#cat("plotting before normalization\n")
#pdf(paste0(dir,"scatterplots_H2AK119ub_37_38_39_40.pdf"))
#smoothScatter(log10(covgf[,1]),log10(covgf[,2]),pch=19,cex=0.25,xlim=c(0.5,2.5),ylim=c(0.5,2.5),nrpoints=500,transformation = function(x) x^.25,nbin=512,main="regions masked",xlab=samples[1],ylab=samples[2])
#abline(0,1)
#smoothScatter(log10(covgf[,1]),log10(covgf[,3]),pch=19,cex=0.25,xlim=c(0.5,2.5),ylim=c(0.5,2.5),nrpoints=500,transformation = function(x) x^.25,nbin=512,main="regions masked",xlab=samples[1],ylab=samples[3])
#abline(0,1)
#smoothScatter(log10(covgf[,1]),log10(covgf[,4]),pch=19,cex=0.25,xlim=c(0.5,2.5),ylim=c(0.5,2.5),nrpoints=500,transformation = function(x) x^.25,nbin=512,main="regions masked",xlab=samples[1],ylab=samples[4])
#abline(0,1)

#smoothScatter(log10(covgf[,2]),log10(covgf[,3]),pch=19,cex=0.25,xlim=c(0.5,2.5),ylim=c(0.5,2.5),nrpoints=500,transformation = function(x) x^.25,nbin=512,main="regions masked",xlab=samples[2],ylab=samples[3])
#abline(0,1)
#smoothScatter(log10(covgf[,2]),log10(covgf[,4]),pch=19,cex=0.25,xlim=c(0.5,2.5),ylim=c(0.5,2.5),nrpoints=500,transformation = function(x) x^.25,nbin=512,main="regions masked",xlab=samples[2],ylab=samples[4])
#abline(0,1)
#smoothScatter(log10(covgf[,3]),log10(covgf[,4]),pch=19,cex=0.25,xlim=c(0.5,2.5),ylim=c(0.5,2.5),nrpoints=500,transformation = function(x) x^.25,nbin=512,main="regions masked",xlab=samples[3],ylab=samples[4])
#abline(0,1)
#dev.off()
##and iterate with a new cutoff, save as manual.mask2.bed, unite with manual.mask.bed, into manual.mask.ultimate.bed

#cat("finding 99th percentile\n")
#finding 99%-iles
#apply takes df or vector input and outputs vector
#z<-apply(covgf,2,function(x) quantile(x,.99))
#cat(z)

#cat("finding normalization factor\n")
#nf<-z/z[1]
#cat(nf)

#cat("normalizing coverage matrix\n")
#covgfn<-t(t(covgf)/nf)

#scatterplots after 99%-ile normalization
#cat("plotting after normalization\n")
#pdf(paste0(dir,"scatterplots_H2AK119ub_37_38_39_40_norm.pdf"))
#smoothScatter(log10(covgfn[,1]),log10(covgfn[,2]),pch=19,cex=0.25,xlim=c(0.5,2.5),ylim=c(0.5,2.5),nrpoints=500,transformation = function(x) x^.25,nbin=512,main="regions masked",xlab=samples[1],ylab=samples[2])
#abline(0,1)
#smoothScatter(log10(covgfn[,1]),log10(covgfn[,3]),pch=19,cex=0.25,xlim=c(0.5,2.5),ylim=c(0.5,2.5),nrpoints=500,transformation = function(x) x^.25,nbin=512,main="regions masked",xlab=samples[1],ylab=samples[3])
#abline(0,1)
#smoothScatter(log10(covgfn[,1]),log10(covgfn[,4]),pch=19,cex=0.25,xlim=c(0.5,2.5),ylim=c(0.5,2.5),nrpoints=500,transformation = function(x) x^.25,nbin=512,main="regions masked",xlab=samples[1],ylab=samples[4])
#abline(0,1)

#smoothScatter(log10(covgfn[,2]),log10(covgfn[,3]),pch=19,cex=0.25,xlim=c(0.5,2.5),ylim=c(0.5,2.5),nrpoints=500,transformation = function(x) x^.25,nbin=512,main="regions masked",xlab=samples[2],ylab=samples[3])
#abline(0,1)
#smoothScatter(log10(covgfn[,2]),log10(covgfn[,4]),pch=19,cex=0.25,xlim=c(0.5,2.5),ylim=c(0.5,2.5),nrpoints=500,transformation = function(x) x^.25,nbin=512,main="regions masked",xlab=samples[2],ylab=samples[4])
#abline(0,1)
#smoothScatter(log10(covgfn[,3]),log10(covgfn[,4]),pch=19,cex=0.25,xlim=c(0.5,2.5),ylim=c(0.5,2.5),nrpoints=500,transformation = function(x) x^.25,nbin=512,main="regions masked",xlab=samples[3],ylab=samples[4])
#abline(0,1)
#dev.off()

#save normalized tracks for viewing in IGV
#cat("generating normalized bigwigs for IGV visualization\n")
#for (s in samples) {
#  #get sample bigwig
#  cat("filename", s,"\n")
#  sbw<-import.bw(paste0(dir,s,".bw"))
#
#  sbw@elementMetadata$score<-round(mcols(sbw)$score / nf[s],2) #two-step normalization!
#  export.bw(sbw,paste0(dir, s,"_rnorm.bw"))
#}
