import os
import pandas as pd

def process_tab_file(folder_path):
    # Find the .tab file in the folder
    tab_files = [f for f in os.listdir(folder_path) if f.endswith('.tab')]
    
    if len(tab_files) != 1:
        raise ValueError("There should be exactly one .tab file in the folder.")

    file_path = os.path.join(folder_path, tab_files[0])

    # Read the .tab file, skip the first two header rows
    df = pd.read_csv(file_path, sep='\t', header=2)

    # Extract unique column names from the 3rd row (now treated as column headers)
    column_names = df.columns
    normalized_column_names = [col.split('.')[0] for col in column_names]
    unique_column_names = pd.Index(normalized_column_names[1:]).unique()
    print(unique_column_names)

    # Initialize a dictionary to store the aggregated results
    aggregated_data = {}
    
    start_idx = 0
    chunk_count = 0
    # Iterate over chunks of 2000 columns
    for idx, unique_name in enumerate(unique_column_names):
        end_idx = min(start_idx + 2001, len(df.columns))

        chunk_columns = df.columns[start_idx:end_idx]
 
        start_header = df.columns[start_idx] if start_idx < len(df.columns) else "N/A"
        end_header = df.columns[end_idx - 1] if end_idx - 1 < len(df.columns) else "N/A"
        second_header = df.columns[start_idx + 1]
        print(f"Start: {start_idx}, End: {end_idx}, Start Header: {start_header}, Second Header: {second_header}, End Header: {end_header}")
 
        column_label = unique_column_names[chunk_count]
        aggregated_data[column_label] = df[chunk_columns].sum(axis=1)
        start_idx = end_idx - 1
        chunk_count += 1

    # Create a DataFrame from the aggregated data
    aggregated_df = pd.DataFrame(aggregated_data)

    print(aggregated_df.head())

    # Save the result to a new Excel file
    output_file = os.path.join(folder_path, 'tallied_signal.xlsx')
    aggregated_df.to_excel(output_file, index=False)

    print("Aggregated data has been saved to {}".format(output_file))
    return output_file

def merge_with_bed_file(folder_path, output_file):
    bed_files = [f for f in os.listdir(folder_path) if f.endswith('.bed')]

    if len(bed_files) != 1:
        raise ValueError("There should be exactly one .bed file in the folder.")

    bed_file = os.path.join(folder_path, bed_files[0])

    # Read the output file from the script
    output_df = pd.read_excel(output_file)

    # Read the BED file (assumes tab-separated with at least three columns for constructing 'Coordinate')
    bed_df = pd.read_csv(bed_file, sep='\t', header=0)

    coordinate_df = bed_df.iloc[:, [0, 1, 2]].copy()
    coordinate_df['Coordinate'] = (
        coordinate_df.iloc[:, 0] + ":" + 
        (coordinate_df.iloc[:, 1]).astype(str) + "-" + 
        coordinate_df.iloc[:, 2].astype(str)
    )

    print(coordinate_df.head())

    # Add the 'Coordinate' column to the output DataFrame
    output_df['Coordinate'] = coordinate_df['Coordinate'].values

    columns = output_df.columns.tolist()
    columns = ['Coordinate'] + sorted(controls) + sorted(mutants)

    output_df = output_df[columns]
	output_df = output_df[['Coordinate'] + [col for col in output_df.columns if col != 'Coordinate']]
    # Save the merged DataFrame
    #merged_file = os.path.join(folder_path, 'tallied_signal_with_coordinates.xlsx')
    merged_file = os.path.join(folder_path, f"{os.path.basename(folder_path.rstrip('/'))}.xlsx")
    output_df.to_excel(merged_file, index=False)
    print(output_df.head())
    print(f"Merged file has been saved to {merged_file}")

folder_path = input("Enter the folder path containing the .tab and .bed files: ")
output_file = process_tab_file(folder_path)
merge_with_bed_file(folder_path, output_file)
