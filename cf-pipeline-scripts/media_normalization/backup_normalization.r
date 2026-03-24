library(rtracklayer)

# directory with bw files
dir<-"/media/rs_256/normalization/"
cat("workdir: ", dir, "\n")

# sample prefix and chromosome name list
samples<-c("sorted_260117_Index_5_Bap1ctrl_H3K36me3_AM_S9_L002_aligned_reads.bam_norm","sorted_260117_Index_6_Bap1mut_H3K36me3_AM_S10_L002_aligned_reads.bam_norm")
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

#read bed file of masked regions
cat("reading in bed file of regions to mask\n")
masked<-read.table("manual.mask.ultimate.bed",sep="\t",header=FALSE,stringsAsFactors=FALSE) # the regions we want to avoid
#convert to dx units
masked$V2<-masked$V2 %/% dx + 1
masked$V3<-masked$V3 %/% dx + 1

#convert rownames of covgz into chr names and bin ids
chrz<-sapply(strsplit(rownames(covgz),split="\\."),function(x) x[1])
posz<-sapply(strsplit(rownames(covgz),split="\\."),function(x) as.numeric(x[2])) #in dx units

#this takes a while
#mask
cat("determine bins to mask\n")
remove<-rep(FALSE,dim(covgz)[1])
for (i in 1:dim(masked)[1]) {
  ch<-masked$V1[i] # get each masked value
  p1<-masked$V2[i]
  p2<-masked$V3[i]
  remove<-remove | (chrz==ch & posz>=p1 & posz<=p2) # remove if correct chr and in correct interval
}

cat(sum(remove), " bins will  be masked\n")

# remove the bins we want to mask
covgf<-covgz[!remove,]

# gives csv file of non-normalized peak height
#write.csv(covgf,file="/media/rs_256/normalization/raw_15_7_H2AK119ub_IgG.csv", row.names=TRUE)

#make scatterplots of raw, non-normalized data
#cat("plotting before normalization\n")
#pdf(paste0(dir,"scatterplots_H2AK119ub_4samples_norm.pdf"))
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
#and iterate with a new cutoff, save as manual.mask2.bed, unite with manual.mask.bed, into manual.mask.ultimate.bed

cat("finding 99th percentile\n")
#finding 99%-iles
#apply takes df or vector input and outputs vector
z<-apply(covgf,2,function(x) quantile(x,.99))
cat(z)

cat("finding normalization factor\n")
nf<-z/z[1]
cat(nf)

cat("normalizing coverage matrix\n")
covgfn<-t(t(covgf)/nf)

# gives csv file of normalized peak height
#write.csv(covgfn,file="/media/rs_256/normalization/normalized.15_7_H2AK119ub_IgG.csv", row.names=TRUE)

#scatterplots after 99%-ile normalization
#cat("plotting after normalization\n")
#pdf(paste0(dir,"scatterplots_H2AK119ub_4samples_norm.pdf"))
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
cat("generating normalized bigwigs for IGV visualization\n")
for (s in samples) {
  #get sample bigwig
  cat("filename", s,"\n")
  sbw<-import.bw(paste0(dir,s,".bw"))

  sbw@elementMetadata$score<-round(mcols(sbw)$score / nf[s],2) #two-step normalization!
  export.bw(sbw,paste0(dir, s,"_rnorm.bw"))
}
print("Done generating normalized bigwigs for IGV visualization")
