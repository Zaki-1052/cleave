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
cd /data2/rs_256/fastq

# Use the find command to search subdirectories for the file
if [ -z "$(find . -type f -name "$FILENAME")" ]; then
  echo "File does not exist on server"
  echo "Upload the fastq file to the server"
  exit 1
fi

# whenever a new file is uploaded to the instance 
cd /home/ubuntu/cutruntools
./create_scripts.py config2.json
if [ ! $? -eq 0 ]; then
	echo
	echo error creating scripts
	echo
	exit 1
fi

if [ -f /data2/rs_256/workdir/$FILENAME ]; then
	echo workdir file found
else
	echo workdir file not found
	exit 1
fi

cd /data2/rs_256/workdir
# first stage of pipeline
# get name of BAM file to see if it exists in aligned.aug10
CHECKBAM=`echo $FILENAME|sed 's/_R.*//'`_aligned_reads.bam
if [ ! -s /data2/rs_256/workdir/aligned.aug10/$CHECKBAM ]
then
    echo ----------------
	echo starting stage 1 for $FILENAME	

    sh ./integrated.sh $FILENAME
	if [ $? -eq 0 ]; then
		echo "BAM successfully created"
	else
		echo "First stage failed"
	fi
fi
cd /data2/rs_256/workdir/aligned.aug10
BAM=`echo $FILENAME|sed 's/_R.*//'`_aligned_reads.bam
if [ -f $BAM ]; then
    echo "BAM found successfully"
else
    echo "First stage failed"
    exit 1
fi

# Create BigWigs
printf  "$BAM\nN\n" | ./create_bams.sh

if [ $? -eq 0 ] && [ -e sorted_${BAM}_norm.bw ]; then
	echo Done Creating BW
else
	echo Failed Creating BW
fi
