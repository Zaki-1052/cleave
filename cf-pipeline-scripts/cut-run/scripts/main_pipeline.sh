#!/bin/bash

# Setup Specific
PIPELINE_AUTOMATION_DIR="~/fergusonLab/code/"

# Instance Constants
WORKDIR="/media/rs_256/ap_tests"
FASTQDIR="/data/rs_256/fastq"
BWDIR="/data/rs_256/workdir/aligned.aug10"
PEM_FILE="~/fergusonLab/210323.pem"
REMOTE_USER="ubuntu"


print_usage() {
    echo "USAGE: bash $0 <EC2_instance> <fastq_file1> <fastq_file2>"
    echo "NOTE: for FASTQ files, input only R1 files"
}

upload_files() {
    local EC="$1"
    local DEST_DIR="$2"
    shift 2
    local FILES=("$@")

    echo "Uploading files to $EC:$DEST_DIR"
    for FILE in "${FILES[@]}"; do
        if [ ! -s "$FILE" ]; then
            echo "File $FILE does not exist or is empty."
            continue
        fi

        # Execute SCP and capture the error message and exit code
        OUTPUT=$(scp -r -i "$PEM_FILE" "$FILE" "${REMOTE_USER}@${EC}:${DEST_DIR}" 2>&1)
        EXIT_CODE=$?

        if [ $EXIT_CODE -ne 0 ]; then
            echo "Error uploading $FILE:"
            echo "$OUTPUT"

            # Detect specific errors
            if [[ "$OUTPUT" == *"Connection timed out"* ]]; then
                echo "Connection timed out. Check the EC2 address: $EC"
                return 2
            elif [[ "$OUTPUT" == *"Name or service not known"* ]]; then
                echo "Invalid EC2 address: $EC"
                return 3
            elif [[ "$OUTPUT" == *"Permission denied"* ]]; then
                echo "Permission denied. Check your PEM file and permissions."
                return 4
            fi

            # Handle other SCP errors
            echo "SCP failed with exit code $EXIT_CODE. See the error above."
            return $EXIT_CODE
        fi
    done
    echo "Done uploading files."
}

save_bed_files() {
    local EC="$1"
    local DEST_DIR="$2"
    shift 2
    local ALLFASTQ=("$@")

    echo "Saving BED files to $DEST_DIR:"

    # Directory to check for files
    local SOURCE_DIR="ubuntu@${EC}:/data/rs_256/workdir/seacr.aug12.all.frag"

    for R1FILE in "${ALLFASTQ[@]}"; do
        # Generate the common prefix from the R1 file name
        local common=$(echo "$R1FILE" | sed 's/_R.*//')
        local BED_FILE="${common}_aligned_reads_treat.stringent.sort.bed"
        local FILE_PATH="${SOURCE_DIR}/${BED_FILE}"
        
        if [ ! -s "${DEST_DIR}/${BED_FILE}" ]; then
            echo "Copying $BED_FILE from $EC..."
            scp -r -i "$PEM_FILE" "$FILE_PATH" "${DEST_DIR}/${BED_FILE}"
        else
            echo "File $BED_FILE already exists locally and is not empty."
        fi
    done

    echo "Done saving BED files."
}

save_bigwig_files() {
    local EC="$1"
    local DEST_DIR="$2"
    shift 2
    local ALLFASTQ=("$@")

    echo "Saving BigWig files to $DEST_DIR:"

    # Ensure destination directory exists
    mkdir -p "$DEST_DIR/bw"

    for FASTQ in "${ALLFASTQ[@]}"; do
        # Generate the BigWig filename using the common prefix
        local BW="sorted_$(echo "$FASTQ" | sed 's/_R.*//')_aligned_reads.bam_norm_rnorm.bw"
        local FILE_PATH="ubuntu@${EC}:${BWDIR}/${BW}"

        if [ ! -s "${DEST_DIR}/bw/${BW}" ]; then
            echo "Copying $BW from $EC..."
            scp -r -i "$PEM_FILE" "$FILE_PATH" "${DEST_DIR}/bw/${BW}"
        else
            echo "File $BW already exists locally and is not empty."
        fi
    done

    echo "Done saving BigWig files."
}


process_fastq_files() {
    local EC="$1"
    shift
    local ALLFASTQ_WITH_PATH=("$@")

    for R1FILE_WITH_PATH in "${ALLFASTQ_WITH_PATH[@]}"; do
        local R1FILE=$(basename "$R1FILE_WITH_PATH")
        local R2FILE=$(echo "$R1FILE" | sed 's/_R1/_R2/')
        echo "Checking existence of $R1FILE and $R2FILE on the server"

        if ssh -i "$PEM_FILE" "${REMOTE_USER}@${EC}" "[ -s ${FASTQDIR}/${R1FILE} ] && [ -s ${FASTQDIR}/${R2FILE} ]"; then
            echo "Files exist on the server."
        else
            echo "Copying $R1FILE and $R2FILE to the server"
            upload_files "$EC" "$FASTQDIR" "$R1FILE_WITH_PATH" "${R1FILE_WITH_PATH/_R1/_R2}"
        fi
    done
    echo
    execute_remote_processing "$EC"
}

execute_remote_processing() {
    local EC="$1"
    echo "Remote processing on $EC :"
    echo
    ssh -i "$PEM_FILE" "${REMOTE_USER}@${EC}" 'bash -s' <<'ENDSSH'
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

                echo "BAM1 = ${BAM1}"
                echo "BAM2 = ${BAM2}"

                # Stage 1: Check and process BAM files
                if [[ -s ${aligned_dir}/${BAM1} ]] && [[ -s ${aligned_dir}/${BAM2} ]]; then
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
                
                outfile1=$(echo "${BAM1}" | sed 's/\.bam$//')_treat.stringent.sort.bed
                outfile2=$(echo "${BAM2}" | sed 's/\.bam$//')_treat.stringent.sort.bed

                echo "BED 1 = $outfile1"
                echo "BED 2 = $outfile2"

                cd ${aligned_dir}

                if [[ -s ../seacr.aug12.all.frag/$outfile1 ]] && [[ -s ../seacr.aug12.all.frag/$outfile2 ]]; then
                    echo "Both BED files exist so no need to process."
                elif [[ -s ../seacr.aug12.all.frag/$outfile1 ]] && [[ ! -s ../seacr.aug12.all.frag/$outfile2 ]]; then
                    echo "Sorted BED 1 found, processing BED 2."
                    echo "Running stage two of the pipeline: debug @ ${ap_test_dir}/${file2}.out"
                    echo "Started stage two at $(date -u)"
                    time nohup ./ap_integrated.step2.sh ${BAM2} > ${ap_test_dir}/${file2}.out 2>&1; echo $? > ${ap_test_dir}/exit_status${file2}
                elif [[ ! -s ../seacr.aug12.all.frag/$outfile1 ]] && [[ -s ../seacr.aug12.all.frag/$outfile2 ]]; then
                    echo "Sorted BED 2 found, creating BED 1."
                    echo "Running stage two of the pipeline: debug @ ${ap_test_dir}/${file1}.out"
                    echo "Started stage two at $(date -u)"
                    time nohup ./ap_integrated.step2.sh ${BAM1} > ${ap_test_dir}/${file1}.out 2>&1; echo $? > ${ap_test_dir}/exit_status${file1}
                else
                    echo "None of the BED files found. Processing both BED files."
                    echo "Running stage two of the pipeline: debug @ ${ap_test_dir}/${file1}.out ${ap_test_dir}/${file2}.out"
                    echo "Started stage two at $(date -u)"
                    (time nohup ./ap_integrated.step2.sh ${BAM1} > ${ap_test_dir}/${file1}.out 2>&1; echo $? > ${ap_test_dir}/exit_status${file1}) &
                    (time nohup ./ap_integrated.step2.sh ${BAM2} > ${ap_test_dir}/${file2}.out 2>&1; echo $? > ${ap_test_dir}/exit_status${file2}) &
                    wait
                fi

                if [ -s ${ap_test_dir}/exit_status${file1} ] && [ -s ${ap_test_dir}/exit_status${file2} ]; then
                    EXIT_STATUS1=$(cat ${ap_test_dir}/exit_status${file1})
                    EXIT_STATUS2=$(cat ${ap_test_dir}/exit_status${file2})
                fi            

                echo "Finished stage two at $(date -u)"

                # Check if both processes were successful
                if [ $EXIT_STATUS1 -eq 0 ] && [ $EXIT_STATUS2 -eq 0 ]; then
                    if [ -s ../seacr.aug12.all.frag/$outfile1 ] && [ -s ../seacr.aug12.all.frag/$outfile2 ]; then
                        echo "Done creating both BED files ${outfile1} and ${outfile2}"
                    else
                        echo "BED files were not created successfully."
                        exit 1
                    fi
                else
                    echo "One or both of the processes failed."
                    exit 1
                fi

                # Clean up temporary files
                rm ${ap_test_dir}/exit_status${file1} ${ap_test_dir}/exit_status${file2}

                echo "Finished processing file pair: $file1 and $file2"
            done

            # Normalize BigWig files
            echo "--------------"
            echo "Starting normalization step..."

            cd ${aligned_dir}

            # Read ap_TODO.txt to get the list of FASTQ files
            files=$(cat /media/rs_256/ap_tests/ap_TODO.txt)

            # Generate the list of BigWig files to normalize
            bigwig_files=()
            for file in $files; do
                bam_name=$(echo $file | sed 's/_R.*//')_aligned_reads.bam
                bigwig_name=sorted_${bam_name}_norm.bw
                bigwig_files+=($bigwig_name)
            done

            # Count the number of BigWig files
            num_bigwig_files=${#bigwig_files[@]}
            echo "Number of BigWig files to normalize: $num_bigwig_files"

            if [[ $num_bigwig_files -eq 0 ]]; then
                echo "No BigWig files found for normalization. Skipping step."
            else
                # Deactivate Conda before running the R script
                conda deactivate
                echo "conda deactivated to generate BW"

                # Define the log file for the R script
                r_log_file="/media/rs_256/ap_tests/normalization.log"

                # Run the R normalization script with nohup and redirect output to the log file
                echo "Running normalization script (log: $r_log_file)..."
                nohup Rscript /media/rs_256/normalization/master_files/ap_master_normalization_v2.r "${bigwig_files[@]/%.bw/}" > $r_log_file 2>&1 &
                r_pid=$!

                # Wait for the R script to complete
                wait $r_pid

                # Check the exit status of the R script
                if [[ $? -eq 0 ]]; then
                    echo "Normalization script completed successfully. Log saved to $r_log_file."
                else
                    echo "Normalization script failed. Check the log file: $r_log_file."
                fi
            fi
        else
            echo "ap_TODO.txt file not found on server."
        fi
ENDSSH
    echo
    echo "Remote processing complete."
}

# Main script execution
if [ $# -lt 2 ]; then
    echo "Error: Not enough arguments."
    print_usage
    exit 1
fi

EC="$1"
shift
ALLFASTQ_WITH_PATH=("$@")
ALLFASTQ=($(basename -a "${ALLFASTQ_WITH_PATH[@]}"))

# Upload ap_TODO.txt
echo "${ALLFASTQ[@]}" > ap_TODO.txt
echo
upload_files "$EC" "$WORKDIR" "ap_TODO.txt"

# Process and upload FASTQ files
echo
process_fastq_files "$EC" "${ALLFASTQ_WITH_PATH[@]}"

# Save BED files
echo
save_bed_files "$EC" "." "${ALLFASTQ[@]}"

# Save BigWig files
echo
save_bigwig_files "$EC" "." "${ALLFASTQ[@]}"