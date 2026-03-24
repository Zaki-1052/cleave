# usage : bash ap_remove_bed.sh <FILENAME only common part>
if [ $# -ne 1 ] 
then
    echo "Not enough arguments"
    exit 1
fi
file=$1
folders=('seacr.aug12' 'seacr.aug12.all.frag' 'seacr.aug12.all.frag.dedup' 'seacr.aug12.dedup' 'macs2.broad.all.frag.aug18' 'macs2.broad.all.frag.aug18.dedup' 'macs2.broad.aug18' 'macs2.broad.aug18.dedup' 'macs2.narrow.all.frag.aug18' 'macs2.narrow.all.frag.aug18.dedup' 'macs2.narrow.aug18' 'macs2.narrow.aug18.dedup')
for folder in "${folders[@]}"
do
    cd /data/rs_256/workdir/$folder
    rm $file*
done
