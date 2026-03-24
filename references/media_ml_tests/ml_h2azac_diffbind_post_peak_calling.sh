#!/bin/bash

PID=13695  # Replace with your actual SEACR PID

echo "Monitoring PID $PID..."

# Wait for the process to finish
while kill -0 $PID 2>/dev/null; do
    echo "Process $PID still running... ($(date))"
    sleep 60
done

echo "Process $PID has completed. Starting DiffBind analysis..."

cd /data2/rs_256/workdir/DPA/

conda activate diffbind

Rscript diffbind_peaklist.R h2azac_late_genotype_peaklist H2AZac_genotype_late_peakset.csv consensus_peaksets/H2AZac_late_genotype.bed

conda deactivate

echo "DiffBind analysis complete!"
