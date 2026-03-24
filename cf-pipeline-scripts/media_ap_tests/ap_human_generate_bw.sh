#!/usr/bin/env bash
# Only need to pass in R1
# Assumes ssh-ed in successfully

# if no command line arguments provided
if [ $# -ne 1 ]
  then
    echo "Not enough arguments supplied"
	echo
	echo "Proper Usage - bash ap_generate_bw.sh <full FASTQ file name>"   
	exit 1
fi
# FileName is the first Command Line Input
FILENAME=$1

# Check if the fastq file exists
cd /data/rs_256/human_fastq/
if [ ! -f $FILENAME ] 
  then
    echo "File does not exist on server"
    echo "Upload the fastq file to the server"
    exit 1
fi

# whenever a new file is uploaded to the instance 
cd /home/ubuntu/cutruntools
./create_scripts.py config_human.json
if [ ! $? -eq 0 ]; then
	echo
	echo error creating scripts
	echo
	exit 1
fi

cd /data/rs_256/human_workdir/
# first stage of pipeline
# get name of BAM file to see if it exists in aligned.aug10
CHECKBAM=`echo $FILENAME|sed 's/_R.*//'`_aligned_reads.bam
if [ ! -f /data/rs_256/human_workdir/aligned.aug10/$CHECKBAM ]
then
    echo starting stage 1	

    sh ./integrated.sh $FILENAME
	if [ $? -eq 0 ]; then
		echo "BAM successfully created"
	else
		echo "First stage failed"
	fi
fi
cd /data/rs_256/human_workdir/aligned.aug10
BAM=`echo $FILENAME|sed 's/_R.*//'`_aligned_reads.bam
if [ -f $BAM ]; then
    echo "BAM found successfully"
else
    echo "First stage failed"
    exit 1
fi

# Create BigWigs
printf  "$BAM\nN\n" | ./create_bams.sh
if [ $? -eq 0 ]; then
	echo Done Creating BW
else
	echo Failed Creating BW
fi
