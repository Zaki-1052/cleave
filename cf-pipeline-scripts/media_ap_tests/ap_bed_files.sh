# Only need to pass in R1
# Assumes ssh-ed in successfully

# if no command line arguments provided
if [ $# -ne 1 ]; then
    echo "Incorrect Number of Arguments"
	echo
	echo "Proper Usage - bash ap_bed_files.sh <full FASTQ file name>"
    exit 1
fi
# FileName is the first Command Line Input
FILENAME=$1

# Check if the fastq file exists
cd /data/rs_256/fastq
if [ ! -f $FILENAME ]; then
    echo "File does not exist on server"
    echo "Upload the fastq file to the server"
    exit 1
fi

# whenever a new file is uploaded to the instance 
cd /home/ubuntu/cutruntools
./create_scripts.py config2.json
echo scripts created
cd /data/rs_256/workdir
# first stage of pipeline
# get name of BAM file to see if it exists in aligned.aug10
CHECKBAM=`echo $FILENAME|sed 's/_R.*//'`_aligned_reads.bam
if [ ! -f /data/rs_256/workdir/aligned.aug10/$CHECKBAM ]
then
  echo starting stage 1	
  sh ./integrated.sh $FILENAME 
  # TODO - maybe check output.txt for potential failure
  if [ $? -eq 0 ]; then
      echo "BAM successfully created"
  else
      echo "First stage failed"
      exit 1
  fi
fi
cd /data/rs_256/workdir/aligned.aug10
BAM=`echo $FILENAME|sed 's/_R.*//'`_aligned_reads.bam
# BAM=`find `echo $FILENAME | sed 's/_R.*//'` ` | head -n 1
if [ -f $BAM ]; then
    echo "BAM found successfully"
else
    echo "First stage failed"
    exit 1
fi

# Second stage of pipeline
./integrated.step2.sh $BAM
if [ $? -eq 0 ]; then
	echo Done Creating bed files
else
	echo Failed creating bed files
fi
