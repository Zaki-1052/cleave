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
cd /data/rs_256/fastq

# Use the find command to search subdirectories for the file
if [ -z "$(find . -type f -name "$FILENAME")" ]; then
  echo "Remote BAM: File does not exist on server"
  echo "Remote BAM: Upload the fastq file to the server"
  exit 1
fi

# whenever a new file is uploaded to the instance 
cd /home/ubuntu/cutruntools
./create_scripts.py config2.json
if [ ! $? -eq 0 ]; then
	echo
	echo Remote BAM: error creating scripts
	echo
	exit 1
fi

if [ ! -s /data/rs_256/workdir/$FILENAME ]; then
	echo Remote BAM: workdir file not found
	exit 1
fi

cd /data/rs_256/workdir
# first stage of pipeline
# get name of BAM file to see if it exists in aligned.aug10
CHECKBAM=`echo $FILENAME|sed 's/_R.*//'`_aligned_reads.bam
if [ ! -f /data/rs_256/workdir/aligned.aug10/$CHECKBAM ]
then
    echo ----------------
	echo Remote BAM: starting stage 1 for $FILENAME	

    sh ./integrated.sh $FILENAME
	if [ $? -eq 0 ]; then
		echo "Remote BAM: BAM successfully created"
	else
		echo "Remote BAM: First stage failed"
	fi
fi
cd /data/rs_256/workdir/aligned.aug10
BAM=`echo $FILENAME|sed 's/_R.*//'`_aligned_reads.bam
if [ -f $BAM ]; then
    echo "Remote BAM: BAM found successfully"
	printf  "$BAM\nN\n" | ./ap_create_bams_without_bw.sh
	exit 0
else
    echo "Remote BAM: First stage failed"
    exit 1
fi
