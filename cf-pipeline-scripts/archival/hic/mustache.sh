#!/bin/bash

Sample_name=$1
Sample_dir='/data2/rs_256/hic/cool'
Sample=${Sample_dir}/${Sample_name}.25000_balanced.cool
Res=25kb
Output_dir='/data2/rs_256/hic'

python3 mustache/mustache/mustache.py -f ${Sample} \
	-r $Res \
	-pt 0.05 \
	-o ${Output_dir}/${Sample_name}_${Res}_005pt.tsv
