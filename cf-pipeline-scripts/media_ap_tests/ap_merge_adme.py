import pandas as pd



# Path to the master BED file
master_bed_file = "/data/rs_256/genomewide_plots/250113_AP_all_tissues_all_mods_peaks.bed"

# Tissue-specific Excel files
tissue_files = {
    "brain": [
        "/data/rs_256/genomewide_plots/250125_ADME_peaksum_brainH3K4me3/250125_ADME_peaksum_brainH3K4me3.xlsx",
        "/data/rs_256/genomewide_plots/250125_ADME_peaksum_brainH3K9ac/250125_ADME_peaksum_brainH3K9ac.xlsx",
        "/data/rs_256/genomewide_plots/250125_ADME_peaksum_brainH3K27ac/250125_ADME_peaksum_brainH3K27ac.xlsx",
        "/data/rs_256/genomewide_plots/250125_ADME_peaksum_brainH3K27me3/250125_ADME_peaksum_brainH3K27me3.xlsx"
    ],
    "kidney": [
        "/data/rs_256/genomewide_plots/250125_ADME_peaksum_kidneyH3K4me3/250125_ADME_peaksum_kidneyH3K4me3.xlsx",
        "/data/rs_256/genomewide_plots/250125_ADME_peaksum_kidneyH3K9ac/250125_ADME_peaksum_kidneyH3K9ac.xlsx",
        "/data/rs_256/genomewide_plots/250125_ADME_peaksum_kidneyH3K27ac/250125_ADME_peaksum_kidneyH3K27ac.xlsx",
        "/data/rs_256/genomewide_plots/250125_ADME_peaksum_kidneyH3K27me3/250125_ADME_peaksum_kidneyH3K27me3.xlsx"
    ],
    "liver": [
        "/data/rs_256/genomewide_plots/250125_ADME_peaksum_liverH3K4me3/250125_ADME_peaksum_liverH3K4me3.xlsx",
        "/data/rs_256/genomewide_plots/ADME/250125_ADME_peaksum_liverH3K9ac/250125_ADME_peaksum_liverH3K9ac.xlsx",
        "/data/rs_256/genomewide_plots/ADME/250125_ADME_peaksum_liverH3K27ac/250125_ADME_peaksum_liverH3K27ac.xlsx",
        "/data/rs_256/genomewide_plots/ADME/250125_ADME_peaksum_liverH3K27me3/250125_ADME_peaksum_liverH3K27me3.xlsx"
    ]
}

# Load the master BED file (use only the first 3 columns)
master_df = pd.read_csv(master_bed_file, sep="\t", header=None, usecols=[0, 1, 2], names=["Chromosome", "Start", "End"])

# Construct the 'Coordinate' column in the required format
master_df['Coordinate'] = master_df['Chromosome'] + ":" + master_df['Start'].astype(str) + "-" + master_df['End'].astype(str)

# Create a master template with just the 'Coordinate' column
master_template = master_df[['Coordinate']]

# Function to merge tissue data into the master template
def merge_tissue_data(master_df, tissue_name, files):
    print(f"Processing tissue: {tissue_name}")
    for file in files:
        try:
            print(f"Loading file: {file}")
            # Load the dataset
            df = pd.read_excel(file)
            
            # Clean the 'Coordinate' column
            df['Coordinate'] = df['Coordinate'].str.strip()
            
            # Merge with the master template on 'Coordinate'
            master_df = pd.merge(master_df, df, on='Coordinate', how='left')
            print(master_df.head())
        except FileNotFoundError:
            print(f"File not found: {file}")
        except Exception as e:
            print(f"Error processing {file}: {e}")
    return master_df

# Merge all tissue data into the master template
final_df = master_template.copy()
for tissue, files in tissue_files.items():
    final_df = merge_tissue_data(final_df, tissue, files)

# Save the final merged DataFrame
final_output_file = "250125_AP_ADME_peaksum_final.xlsx"
final_df.to_excel(final_output_file, index=False)
print(f"Final combined data saved to {final_output_file}")

