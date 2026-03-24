import pandas as pd
import sys

def reorder_columns(input_file, output_file):
    # Read the input Excel file
    df = pd.read_excel(input_file)

    # Extract column names
    columns = df.columns.tolist()

    # Identify Early and Late samples based on column names
    coordinate_col = ["Coordinate"]
    early_samples = [col for col in columns if "early" in col]
    late_samples = [col for col in columns if "late" in col]

    # Sort to ensure the correct order (early1, early2, ..., late1, late2, ...)
    early_samples.sort()
    late_samples.sort()

    # Define the new column order
    new_order = coordinate_col + early_samples + late_samples

    # Reorder DataFrame
    df = df[new_order]

    # Save the reordered DataFrame
    df.to_excel(output_file, index=False)
    print(f"Reordered file has been saved to {output_file}")

# If running from command line, allow passing file paths
if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python reorder_columns.py <input_excel_file> <output_excel_file>")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2]
    
    reorder_columns(input_file, output_file)