# All remote commands
cd /data/rs_256/workdir/
if [[ -s /media/rs_256/ap_tests/ap_TODO.txt ]]; then
    echo "ap_TODO.txt file exists on server."
    cat /media/rs_256/ap_tests/ap_TODO.txt

    files=$(sed 's/ /\n/g' /media/rs_256/ap_tests/ap_TODO.txt)
    files_array=($files)

    # initialize conda environment
    source /home/ubuntu/miniconda3/bin/activate && conda activate
    echo "conda activated"

    for ((i = 0; i < ${#files_array[@]}; i += 2)); do
        file1=${files_array[$i]}
        file2=${files_array[$i+1]}

        echo "Processing file pair: $file1 and $file2"
        echo "--------------"

        ap_test_dir=/media/rs_256/ap_tests
        aligned_dir=/data/rs_256/workdir/aligned.aug10

        BAM1=$(echo $file1 | sed 's/_R.*//')_aligned_reads.bam
        BAM2=$(echo $file2 | sed 's/_R.*//')_aligned_reads.bam

        [[ -s ${aligned_dir}/sorted_${BAM1} ]] && BAM1="sorted_${BAM1}" || BAM1="${BAM1}"
		[[ -s ${aligned_dir}/sorted_${BAM2} ]] && BAM2="sorted_${BAM2}" || BAM2="${BAM2}"
		echo "BAM1 = ${BAM1}"
        echo "BAM2 = ${BAM2}"

        # Stage 1: Check and process BAM files
        if { [[ -s ${aligned_dir}/${BAM1} ]] || [[ -s ${aligned_dir}/sorted_*${BAM1} ]]; } \
   			&& { [[ -s ${aligned_dir}/${BAM2} ]] || [[ -s ${aligned_dir}/sorted_*${BAM2} ]]; }
		then
			echo Both BAM files exist so no need to process stage 1
            echo 0 > ${ap_test_dir}/${file1}.out
            echo 0 > ${ap_test_dir}/exit_status${file1}
            echo 0 > ${ap_test_dir}/${file2}.out
            echo 0 > ${ap_test_dir}/exit_status${file2}

        elif [[ -s ${aligned_dir}/${BAM1} ]] && [[ ! -s ${aligned_dir}/${BAM2} ]]; then
            echo BAM 1 found, processing BAM 2
            echo Running stage one of the pipeline: debug @ ${ap_test_dir}/${file2}.out
            echo "Started stage one at $(date -u)"
            time nohup bash ${ap_test_dir}/ap_generate_bw.sh $file2 > ${ap_test_dir}/${file2}.out 2>&1; echo $? > ${ap_test_dir}/exit_status${file2}
            echo 0 > ${ap_test_dir}/${file1}.out
            echo 0 > ${ap_test_dir}/exit_status${file1}

        elif [[ ! -s ${aligned_dir}/${BAM1} ]] && [[ -s ${aligned_dir}/${BAM2} ]]; then
            echo BAM 2 found, creating BAM 1
            echo Running stage one of the pipeline: debug @ ${ap_test_dir}/${file1}.out
            echo "Started stage one at $(date -u)"
            time nohup bash ${ap_test_dir}/ap_generate_bw.sh $file1 > ${ap_test_dir}/${file1}.out 2>&1; echo $? > ${ap_test_dir}/exit_status${file1}
            echo 0 > ${ap_test_dir}/${file2}.out
            echo 0 > ${ap_test_dir}/exit_status${file2}

        else
            echo none of the BAM files found
            echo processing both BAM files
            echo Running stage one of the pipeline: debug @ ${ap_test_dir}/${file1}.out ${ap_test_dir}/${file2}.out
            echo "Started stage one at $(date -u)"
            (time nohup bash ${ap_test_dir}/ap_generate_bw.sh $file1 > ${ap_test_dir}/${file1}.out 2>&1; echo $? > ${ap_test_dir}/exit_status${file1}) & PID1=$!
            (time nohup bash ${ap_test_dir}/ap_generate_bw.sh $file2 > ${ap_test_dir}/${file2}.out 2>&1; echo $? > ${ap_test_dir}/exit_status${file2}) & PID2=$!

            # Wait for both processes to finish
            wait $PID1
            wait $PID2
        fi

        # Verify BAM files
        if [[ ! -s ${aligned_dir}/${BAM1} ]]; then
            echo "Error: BAM1 (${BAM1}) creation failed."
            continue
        fi
        if [[ ! -s ${aligned_dir}/${BAM2} ]]; then
            echo "Error: BAM2 (${BAM2}) creation failed."
            continue
        fi

        # Stage 2: Check and process BigWig files
        BIGWIG1="sorted_${BAM1}_norm.bw"
        BIGWIG2="sorted_${BAM2}_norm.bw"

        if [[ -s ${aligned_dir}/${BIGWIG1} ]] && [[ -s ${aligned_dir}/${BIGWIG2} ]]; then
            echo Both BigWig files exist so no need to process
            echo 0 > ${ap_test_dir}/${BIGWIG1}.out
            echo 0 > ${ap_test_dir}/exit_status_${BIGWIG1}
            echo 0 > ${ap_test_dir}/${BIGWIG2}.out
            echo 0 > ${ap_test_dir}/exit_status_${BIGWIG2}

        elif [[ -s ${aligned_dir}/${BIGWIG1} ]] && [[ ! -s ${aligned_dir}/${BIGWIG2} ]]; then
            echo BigWig 1 found, processing BigWig 2
            echo Running stage two of the pipeline: debug @ ${ap_test_dir}/${BIGWIG2}.out
            echo "Started stage two at $(date -u)"
            time nohup bash ${ap_test_dir}/ap_master_bw.sh ${BAM2} > ${ap_test_dir}/${BIGWIG2}.out 2>&1; echo $? > ${ap_test_dir}/exit_status_${BIGWIG2}
            echo 0 > ${ap_test_dir}/${BIGWIG1}.out
            echo 0 > ${ap_test_dir}/exit_status_${BIGWIG1}

        elif [[ ! -s ${aligned_dir}/${BIGWIG1} ]] && [[ -s ${aligned_dir}/${BIGWIG2} ]]; then
            echo BigWig 2 found, processing BigWig 1
            echo Running stage two of the pipeline: debug @ ${ap_test_dir}/${BIGWIG1}.out
            echo "Started stage two at $(date -u)"
            time nohup bash ${ap_test_dir}/ap_master_bw.sh ${BAM1} > ${ap_test_dir}/${BIGWIG1}.out 2>&1; echo $? > ${ap_test_dir}/exit_status_${BIGWIG1}
            echo 0 > ${ap_test_dir}/${BIGWIG2}.out
            echo 0 > ${ap_test_dir}/exit_status_${BIGWIG2}

        else
            echo none of the BigWig files found
            echo processing both BigWig files
            echo Running stage two of the pipeline: debug @ ${ap_test_dir}/${BIGWIG1}.out ${ap_test_dir}/${BIGWIG2}.out
            echo "Started stage two at $(date -u)"
            (time nohup bash ${ap_test_dir}/ap_master_bw.sh ${BAM1} > ${ap_test_dir}/${BIGWIG1}.out 2>&1; echo $? > ${ap_test_dir}/exit_status_${BIGWIG1}) & PID1=$!
            (time nohup bash ${ap_test_dir}/ap_master_bw.sh ${BAM2} > ${ap_test_dir}/${BIGWIG2}.out 2>&1; echo $? > ${ap_test_dir}/exit_status_${BIGWIG2}) & PID2=$!

            # Wait for both processes to finish
            wait $PID1
            wait $PID2
        fi

        # Verify BigWig files
        if [[ -s ${aligned_dir}/${BIGWIG1} ]]; then
            echo "BigWig1 exists: ${BIGWIG1} ."
        else
            echo "Error: BigWig1 (${BIGWIG1}) creation failed."
            continue
        fi
        if [[ -s ${aligned_dir}/${BIGWIG2} ]]; then
            echo "BigWig2 exists: (${BIGWIG2}) ."
        else
            echo "Error: BigWig2 (${BIGWIG2}) creation failed."
            continue
        fi

        # STAGE 2: BED file processing 
        
        #outfile1=$(echo "${BAM1}" | sed 's/\.bam$//')_treat.stringent.sort.bed
        #outfile2=$(echo "${BAM2}" | sed 's/\.bam$//')_treat.stringent.sort.bed

        #echo "BED 1 = $outfile1"
        #echo "BED 2 = $outfile2"

        #cd ${aligned_dir}

        #if [[ -s ../seacr.aug12.all.frag/$outfile1 ]] && [[ -s ../seacr.aug12.all.frag/$outfile2 ]]; then
        #    echo "Both BED files exist so no need to process."
        #elif [[ -s ../seacr.aug12.all.frag/$outfile1 ]] && [[ ! -s ../seacr.aug12.all.frag/$outfile2 ]]; then
        #    echo "Sorted BED 1 found, processing BED 2."
        #    echo "Running stage two of the pipeline: debug @ ${ap_test_dir}/${file2}.out"
        #    echo "Started stage two at $(date -u)"
        #    time nohup ./ap_integrated.step2.sh ${BAM2} > ${ap_test_dir}/${file2}.out 2>&1; echo $? > ${ap_test_dir}/exit_status${file2}
        #elif [[ ! -s ../seacr.aug12.all.frag/$outfile1 ]] && [[ -s ../seacr.aug12.all.frag/$outfile2 ]]; then
        #    echo "Sorted BED 2 found, creating BED 1."
        #    echo "Running stage two of the pipeline: debug @ ${ap_test_dir}/${file1}.out"
        #    echo "Started stage two at $(date -u)"
        #    time nohup ./ap_integrated.step2.sh ${BAM1} > ${ap_test_dir}/${file1}.out 2>&1; echo $? > ${ap_test_dir}/exit_status${file1}
        #else
        #    echo "None of the BED files found. Processing both BED files."
        #    echo "Running stage two of the pipeline: debug @ ${ap_test_dir}/${file1}.out ${ap_test_dir}/${file2}.out"
        #    echo "Started stage two at $(date -u)"
        #    (time nohup ./ap_integrated.step2.sh ${BAM1} > ${ap_test_dir}/${file1}.out 2>&1; echo $? > ${ap_test_dir}/exit_status${file1}) &
        #    (time nohup ./ap_integrated.step2.sh ${BAM2} > ${ap_test_dir}/${file2}.out 2>&1; echo $? > ${ap_test_dir}/exit_status${file2}) &
        #    wait
        #fi

        #if [ -s ${ap_test_dir}/exit_status${file1} ] && [ -s ${ap_test_dir}/exit_status${file2} ]; then
        #    EXIT_STATUS1=$(cat ${ap_test_dir}/exit_status${file1})
        #    EXIT_STATUS2=$(cat ${ap_test_dir}/exit_status${file2})
        #fi            

        #echo "Finished stage two at $(date -u)"

        ## Check if both processes were successful
        #if [ $EXIT_STATUS1 -eq 0 ] && [ $EXIT_STATUS2 -eq 0 ]; then
        #    if [ -s ../seacr.aug12.all.frag/$outfile1 ] && [ -s ../seacr.aug12.all.frag/$outfile2 ]; then
        #        echo "Done creating both BED files ${outfile1} and ${outfile2}"
        #   else
        #       echo "BED files were not created successfully."
        #        exit 1
        #    fi
        #else
        #    echo "One or both of the processes failed."
        #    exit 1
        #fi

        # Clean up temporary files
        #rm ${ap_test_dir}/exit_status${file1} ${ap_test_dir}/exit_status${file2}

        echo "Finished processing file pair: $file1 and $file2"
		bash ${ap_test_dir}/ap_remove_files.sh $file1
		bash ${ap_test_dir}/ap_remove_files.sh $file2
		rm /data/rs_256/workdir/trimmed/*
		rm /data/rs_256/workdir/trimmed3/*
    done

    # # Normalize BigWig files
    # echo "--------------"
    # echo "Starting normalization step..."

    # cd ${aligned_dir}

    # # Read ap_TODO.txt to get the list of FASTQ files
    # files=$(cat /media/rs_256/ap_tests/ap_TODO.txt)

    # # Generate the list of BigWig files to normalize
    # bigwig_files=()
    # for file in $files; do
    #     bam_name=$(echo $file | sed 's/_R.*//')_aligned_reads.bam
    #     bigwig_name=sorted_${bam_name}_norm.bw
    #     bigwig_files+=($bigwig_name)
    # done

    # # Count the number of BigWig files
    # num_bigwig_files=${#bigwig_files[@]}
    # echo "Number of BigWig files to normalize: $num_bigwig_files"

    # if [[ $num_bigwig_files -eq 0 ]]; then
    #     echo "No BigWig files found for normalization. Skipping step."
    # else
    #     # Deactivate Conda before running the R script
    #     conda deactivate
    #     echo "conda deactivated to generate BW"

    #     # Define the log file for the R script
    #     r_log_file="/media/rs_256/ap_tests/normalization.log"

    #     # Run the R normalization script with nohup and redirect output to the log file
    #     echo "Running normalization script (log: $r_log_file)..."
    #     nohup Rscript /media/rs_256/normalization/master_files/ap_master_normalization_v2.r "${bigwig_files[@]/%.bw/}" > $r_log_file 2>&1 &
    #     r_pid=$!

    #     # Wait for the R script to complete
    #     wait $r_pid

    #     # Check the exit status of the R script
    #     if [[ $? -eq 0 ]]; then
    #         echo "Normalization script completed successfully. Log saved to $r_log_file."
    #     else
    #         echo "Normalization script failed. Check the log file: $r_log_file."
    #     fi
    # fi
    else
    echo "ap_TODO.txt file not found on server."
fi
