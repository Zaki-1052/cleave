
Currently, if you export from cool to hic converted files, the chr column will be as "chr1" instead of "1", the latter of which is necessary for multiHiCompare. I will fix this later and write it into the split contacts code, but for now, the text can be run below in each of the split contacts directory to overwrite as so.

For some reason, the straw-converted hic files from juicer work like magic, and here we're messing around, so tbh, I don't really know. I am finneagling around and will update once I figure out how to format.

...okay it finally works when you just put your files into a list before feeding it into makehicexp under the data_list option, but begeez isn't it just quite like the job that codes that magically work the first time magically don't work the second time. Ain't that just the thing

for file in *.txt; do
    awk '{gsub(/^chr/, "", $1); if($1=="X") $1=23; if($1=="Y") $1=24; if($1=="M") $1=25; print}' "$file" > "${file}.tmp" \
    && mv "${file}.tmp" "$file"
    echo "Overwrote $file"
done
