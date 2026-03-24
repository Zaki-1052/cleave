# CUT-RUN-pipeline

This repository contains scripts for processing, normalizing, quantifying, and clustering CUT&RUN datasets. The pipeline is structured to facilitate downstream analysis.

## Pipeline Overview

### 1: Data Processing (`main_pipeline.sh`)

Processes paired-end FASTQ files into normalized BigWig files. Can optionally perform peak calling.

Note: This script is currently designed for execution within an AWS EC2 instance environment, using specific remote directory structures and access patterns.

```bash
bash scripts/main_pipeline.sh example_data/input/sample1_R1.fastq.gz \
                         example_data/input/sample2_R1.fastq.gz \
                         example_data/output/
```

### 2: Normalizing bigWigs (bigwig_normalization.r)

This R script requires you to specify the input and output BigWig directories on **line 4**. After setting up, it will interactively prompt you to select the BigWig files you wish to normalize.

```
Rscript scripts/bigwig_normalization.r
```

### 3: Feature quantification (count_features_earlylate.py)

Note: this script assumes that the input directory contains one bed file and one tab file output from the `deepTools`: `computeMatrix` command. This uses the command-line interface to set the input folder.

```
python scripts/count_features_earlylate.py
```

### 4: Hierarchical Clustering (clustering.py)

`scripts/clustering.py` performs hierarchical clustering on your quantified data, generating visual heatmaps for pattern exploration. It is designed in a Jupyter Notebook-style. Dependencies are specified at the top of the script, and users should adjust input file paths directly within the script to match their quantified data.

### Acknowledgements

This pipeline was developed and supported by the Ferguson Lab in the Department of Pathology at UC San Diego. We acknowledge the contributions of Dr. Roman Sasik (Center for Computational Biology and Bioinformatics) and Dr. Kathleen Fisch (Department of Obstetrics, Gynecology and Reproductive Sciences) to this project.

### License

This project is licensed under the MIT License. See the `LICENSE` file for details.