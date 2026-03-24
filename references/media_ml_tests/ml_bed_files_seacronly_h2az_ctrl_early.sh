# Only need to pass in R1
# Assumes ssh-ed in successfully

bam_files=(/data/rs_256/workdir/aligned.aug10/H2AZ_ctrl_early_sorted_2/*.bam)

cd /data/rs_256/workdir/aligned.aug10/

# FileName is the first Command Line Input
for FILENAME in "${bam_files[@]}"; do
	CHECKBAM=`echo $FILENAME|sed 's/_R.*//'` 

	if [ -f $CHECKBAM ]; then
		echo "BAM $CHECKBAM found successfully"
	else
		echo "$CHECKBAM DNE"
		exit 1
	fi

	# Second stage of pipeline
	bash ap_integrated.step2.sh $CHECKBAM
	if [ $? -eq 0 ]; then
		echo Done Creating bed files: $CHECKBAM
	else
		echo Failed bed stage: $CHECKBAM
	fi
done
