#!/bin/bash

echo "Please enter the number of control samples"
read num_controls
echo

echo "Please enter the number of mutant samples"
read num_mutants
echo

declare -a controls
for (( i=0; i<$num_controls; i++ ))
do
	echo "Please enter CONTROL sample (FULL PATH): "
	read control
	controls+=(${control})
	echo
done

declare -a mutants
for (( i=0; i<$num_mutants; i++ ))
do
	echo "Please enter MUTANT sample (FULL PATH): "
	read mutant
	mutants+=(${mutant})
	echo
done

echo "Please enter a summit bed file you would like to use for reference points (FULL PATH): "
read bedFile

echo
echo "Please enter the histone modification of these samples: "
read modification

echo
echo "Please enter the directory you would like the heatmap in: "
read directory

echo ${#mutants[@]}

matrix_string=
heatmap_string=

if [[ ${num_controls} -gt ${num_mutants} ]]
then
	for i in "${!controls[@]}"
	do
		matrix_string="${matrix_string} ${controls[$i]}"
		heatmap_string="${heatmap_string} ${modification}_ctrl"
		if [[ i -lt ${#mutants[@]} ]]
		then
			matrix_string="${matrix_string} ${mutants[$i]}"
			heatmap_string="${heatmap_string} ${modification}_mut"
		fi
	done
else
	
	for i in "${!mutants[@]}"
	do
		if [[ i -lt ${#controls[@]} ]]
		then
			matrix_string="${matrix_string} ${controls[$i]}"
			heatmap_string="${heatmap_string} ${modification}_ctrl"
		fi
		matrix_string="${matrix_string} ${mutants[$i]}"
		heatmap_string="${heatmap_string} ${modification}_mut"
	done
fi

#echo "computeMatrix reference-point --referencePoint center -R ${bedFile} -S${matrix_string} -a 1500 -b 1500 -o ${directory}matrix_${modification}.gz"
#echo "plotHeatmap -m matrix_${modification}.gz --samplesLabel${heatmap_string} -out ${directory}_${modification}.png"

computeMatrix reference-point --referencePoint center -R "${bedFile}" -S"${matrix_string}" -a 1500 -b 1500 -o "${directory}"matrix_"${modification}".gz

plotHeatmap -m matrix_"${modification}".gz --samplesLabel"${heatmap_string}" -out "${directory}${modification}".png
