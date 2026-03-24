#!/bin/bash
# delete_tab_files.sh
# This script recursively deletes all .tab files within directories that match
# the pattern: /data/rs_256/genomewide_plots/24*ADME*
#
# Use with caution as deleted files cannot be recovered easily.
#
# Usage: ./delete_tab_files.sh

TARGET_PATTERN="/data/rs_256/genomewide_plots/250206*"

# Loop through each item that matches the TARGET_PATTERN
for dir in $TARGET_PATTERN; do
    if [ -d "$dir" ]; then
        echo "Processing directory: $dir"
        # Find and delete .tab files recursively in the directory.
        # The -print option shows each file before deletion.
        find "$dir" -type f -name '*.tab' -print -exec rm -v {} \;
    else
        echo "Skipping $dir (not a directory)"
    fi
done

echo "Deletion of .tab files completed."
