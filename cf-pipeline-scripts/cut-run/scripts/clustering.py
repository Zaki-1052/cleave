# %%
import os
import json
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from scipy.stats import rankdata
import jenkspy
from scipy.cluster.hierarchy import linkage, fcluster

# %%
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))

INPUT_DIR = os.path.join(CURRENT_DIR, '..', 'example_data', 'input')
OUTPUT_DIR = os.path.join(CURRENT_DIR, '..', 'example_data', 'output')

os.makedirs(OUTPUT_DIR, exist_ok=True)

HISTOGRAMS_DIR = os.path.join(OUTPUT_DIR, 'histograms')
os.makedirs(HISTOGRAMS_DIR, exist_ok=True)

INPUT_FILES = {
    "raw_excel_data": os.path.join(INPUT_DIR, "example_data.xlsx"),
}

OUTPUT_FILES = {
    "final_combined_excel": os.path.join(OUTPUT_DIR, "output.xlsx"),
    "histogram_plots": HISTOGRAMS_DIR 
}

print("Input Files:")
print(INPUT_FILES)
print("\nOutput Files:")
print(OUTPUT_FILES)

# %%
# Average samples

raw_data = pd.read_excel(INPUT_FILES['raw_excel_data'])

averaged_data = pd.DataFrame({"Coordinate": raw_data["Coordinate"]})

modifications = ["H3K27ac", "H3K27me3", "H3K4me1", "H3K4me3", "H3K9ac"]

for mod in modifications:
        rep1_col = f"{mod}CerebellumEarly1"
        rep2_col = f"{mod}CerebellumEarly2"
        avg_col = f"{mod}CerebellumEarlyAVG"

        if avg_col in raw_data.columns:
            averaged_data[avg_col] = raw_data[avg_col]
        elif rep1_col in raw_data.columns and rep2_col in raw_data.columns:
            averaged_data[avg_col] = raw_data[[rep1_col, rep2_col]].mean(axis=1)
        elif rep1_col in raw_data.columns:
            averaged_data[avg_col] = raw_data[rep1_col]
            print(f"Warning: Using only {rep1_col} as the average (no Rep2 found)")
        elif rep2_col in raw_data.columns:
            averaged_data[avg_col] = raw_data[rep2_col]
            print(f"Warning: Using only {rep2_col} as the average (no Rep1 found)")

        rep1_col = f"{mod}CerebellumLate1"
        rep2_col = f"{mod}CerebellumLate2"
        avg_col = f"{mod}CerebellumLateAVG"

        if avg_col in raw_data.columns:
            averaged_data[avg_col] = raw_data[avg_col]
        elif rep1_col in raw_data.columns and rep2_col in raw_data.columns:
            averaged_data[avg_col] = raw_data[[rep1_col, rep2_col]].mean(axis=1)
        elif rep1_col in raw_data.columns:
            averaged_data[avg_col] = raw_data[rep1_col]
            print(f"Warning: Using only {rep1_col} as the average (no Rep2 found)")
        elif rep2_col in raw_data.columns:
            averaged_data[avg_col] = raw_data[rep2_col]
            print(f"Warning: Using only {rep2_col} as the average (no Rep1 found)")

print(averaged_data.head())

# %%
data = averaged_data

print("✅ Data Loaded Successfully")
print(data.head())

print("Column Names:", data.columns.tolist())

print(data.info())

# %%
# Histograms

histone_columns = data.columns[1:]

# Define grid layout (4 columns per row)
num_cols = 4
num_rows = (len(histone_columns) // num_cols) + 1 

# Create figure
plt.figure(figsize=(15, num_rows * 3))

for i, col in enumerate(histone_columns, 1):
    plt.subplot(num_rows, num_cols, i)  # subplots
    sns.histplot(data[col].dropna(), bins=50, kde=True, color="blue")
    plt.title(col, fontsize=8)  # reduce font size for readability
    plt.xlabel("")
    plt.ylabel("")

# Adjust layout to prevent overlapping
plt.tight_layout()
plt.show()

# %%
# Compute non-parametric Z-scores by ranking Early & Late together

def compute_joint_nonparametric_zscore(early_data, late_data):
    combined_values = np.concatenate([early_data, late_data])
    joint_ranks = rankdata(combined_values)
    joint_zscores = (joint_ranks - 0.5) / len(joint_ranks)
    
    return joint_zscores[:len(early_data)], joint_zscores[len(early_data):]

zscore_differences = pd.DataFrame({"Coordinate": data["Coordinate"]})

for mod in modifications:
        early_cols = [col for col in data.columns if mod in col and "Early" in col]
        late_cols = [col for col in data.columns if mod in col and "Late" in col]
        
        if len(early_cols) == len(late_cols) and len(early_cols) > 0:
            for early_col, late_col in zip(early_cols, late_cols):
                replicate_id = early_col.split("Early")[-1]  
                diff_col_name = f"{mod}Cerebellum_Change"
                
                early_zscores, late_zscores = compute_joint_nonparametric_zscore(data[early_col].dropna(), data[late_col].dropna())
                
                zscore_differences[diff_col_name] = late_zscores - early_zscores

# %%
print(zscore_differences.head())

# %%
# Count exact 0s

for mod in modifications:
    mod_cols = [col for col in zscore_differences.columns if f"{mod}" in col and col.endswith("_Change")]
    for col in mod_cols:
        num_zeros = (zscore_differences[col] == 0).sum()
        print(f"Column {col} has {num_zeros} exact zeros.")

# %%
mapped_CAP_scores = zscore_differences.copy()

for col in zscore_differences.columns[1:]:
    values = zscore_differences[col]         
    abs_values = values.abs()               
    nonzero_abs = abs_values[abs_values != 0].values

    # Compute Jenks natural breaks on the nonzero absolute values into 4 classes (5 breakpoints)
    breaks = jenkspy.jenks_breaks(nonzero_abs, n_classes=4)

    formatted_breaks = [f"{b:.4f}" for b in breaks]
    print(f"Jenks breaks for {col}: {formatted_breaks}")

    mag_bins = np.digitize(abs_values, bins=breaks[1:-1], right=True)
    final_bins = np.where(values < 0, -mag_bins, mag_bins)

    cap_col = col.replace("_Change", "_CAP_bin")
    mapped_CAP_scores[cap_col] = final_bins

    fig, axs = plt.subplots(1, 2, figsize=(14, 6))
    
    # Left subplot: histogram of absolute values with breakpoints.
    sns.histplot(abs_values, bins=70, kde=True, color="blue", ax=axs[0])
    axs[0].set_title(f"Absolute Z-Score Diff for {col}")
    axs[0].set_xlabel("Absolute Z-Score Difference")
    axs[0].set_ylabel("Frequency")
    for brk in breaks[1:-1]:
        axs[0].axvline(brk, color='red', linestyle='--')
    annotation_left = "Thresholds:\n" + "\n".join([f"{i}: {b:.4f}" for i, b in enumerate(breaks)])
    axs[0].text(0.95, 0.95, annotation_left, transform=axs[0].transAxes,
                fontsize=10, verticalalignment='top', horizontalalignment='right',
                bbox=dict(facecolor='white', alpha=0.5))
    
    # Right subplot: histogram of signed values with threshold lines.
    sns.histplot(values, bins=100, kde=False, color="blue", ax=axs[1])
    axs[1].set_title(f"Signed Z-Score Diff for {col}")
    axs[1].set_xlabel("Z-Score Difference")
    axs[1].set_ylabel("Frequency")
    for brk in breaks[1:-1]:
        axs[1].axvline(brk, color='red', linestyle='--')
        axs[1].axvline(-brk, color='red', linestyle='--')
    bin_labels = [-3, -2, -1, 0, 1, 2, 3]
    counts = {b: np.sum(final_bins == b) for b in bin_labels}
    annotation_right = "\n".join([f"Bin {b}: {counts[b]}" for b in bin_labels])
    axs[1].text(0.95, 0.95, annotation_right, transform=axs[1].transAxes,
                fontsize=10, verticalalignment='top', horizontalalignment='right',
                bbox=dict(facecolor='white', alpha=0.5))
    
    plt.suptitle(f"Mapping for {col}", fontsize=14)
    plt.tight_layout(rect=[0, 0, 1, 0.93])
    plt.savefig(os.path.join(HISTOGRAMS_DIR, f'{col}.png'), dpi=300, bbox_inches='tight')
    plt.show()

print("Mapped CAP Scores DataFrame:")
print(mapped_CAP_scores.head())

# %%
# Define the order of modifications and the base column (e.g. "Coordinate" or "GeneName")
mods_order = ['H3K4me1', 'H3K4me3', 'H3K9ac', 'H3K27ac', 'H3K27me3']
new_columns = ['Coordinate'] 

for mod in mods_order:
    col_change = f"{mod}Cerebellum_Change"
    col_bin = f"{mod}Cerebellum_CAP_bin"
    if col_change in mapped_CAP_scores.columns:
        new_columns.append(col_change)
    if col_bin in mapped_CAP_scores.columns:
        new_columns.append(col_bin)
        
df_reordered = mapped_CAP_scores[new_columns]

binned_columns = ['Coordinate'] + [col for col in new_columns if col.endswith('_CAP_bin')]
df_binned_only = df_reordered[binned_columns]

# %%
# Set "Coordinate" as the index.
df_cluster = df_binned_only.set_index("Coordinate")

df_cluster = df_cluster.replace([np.inf, -np.inf], np.nan).dropna()

# Hierarchical Clustering: using euclidean distance and Ward's method.
Z = linkage(df_cluster.values, method="ward", metric="euclidean")

# Cut the dendrogram to form 5 clusters.
clusters = fcluster(Z, t=5, criterion="maxclust")

df_cluster['Cluster'] = clusters

unique_clusters = np.unique(clusters)
cluster_palette = dict(zip(unique_clusters, sns.color_palette("Set1", len(unique_clusters))))
row_colors = df_cluster['Cluster'].map(cluster_palette)

df_heatmap = df_cluster.drop("Cluster", axis=1)

cg = sns.clustermap(df_heatmap,
                    row_colors=row_colors,
                    metric="euclidean",
                    method="ward",
                    cmap="bwr",
                    figsize=(12, 10))

plt.suptitle("Hierarchical Clustering Heatmap for CAP Scores", fontsize=16)
plt.savefig(os.path.join(OUTPUT_DIR, "CAP_scores_clustered.png"), dpi=300, bbox_inches='tight')
plt.show()

# %%
# ----- Output Formatting and Merging -----
# ----- Load your primary data (already used in your averaging block) -----
# 'data' holds the raw replicate data and 'averaged_data' holds the computed averages.
raw_data_reps = raw_data.copy().set_index("Coordinate")
avg_data = averaged_data.copy().set_index("Coordinate")

# ----- Merge Data (No Additional Data) -----
merged_raw = raw_data_reps.copy()
merged_avg = avg_data.copy()
print("Merged raw replicate data:")
print(merged_raw.head())
print("Merged averaged data:")
print(merged_avg.head())

# %%
# --- Ensure CAP clustering exists, with "Coordinate" as a string index ---
if 'df_cap_sorted' not in globals():
    df_binned_only["Coordinate"] = df_binned_only["Coordinate"].astype(str)
    df_cap = df_binned_only.copy().set_index("Coordinate")
    df_cap = df_cap.select_dtypes(include=[np.number]).replace([np.inf, -np.inf], np.nan).dropna()
    Z = linkage(df_cap.values, method="ward", metric="euclidean")
    clusters = fcluster(Z, t=5, criterion="maxclust")
    df_cap["Cluster"] = clusters
    df_cap_sorted = df_cap.sort_values("Cluster")
else:
    # throw an error
    if not isinstance(df_cap_sorted, pd.DataFrame) or "Cluster" not in df_cap_sorted.columns:
        raise ValueError("df_cap_sorted must be a DataFrame with a 'Cluster' column.")

for var in ['merged_raw', 'merged_avg', 'zscore_differences']:
    if var not in globals():
        raise NameError(f"{var} is not defined. Please run the merging blocks first.")

zscore_differences["Coordinate"] = zscore_differences["Coordinate"].astype(str)

# --- Create common ordering using df_cap_sorted ---
merged_raw_ordered = df_cap_sorted[['Cluster']].join(merged_raw, how="inner").reset_index()
merged_avg_ordered = df_cap_sorted[['Cluster']].join(merged_avg, how="inner").reset_index()
df_zscore_sorted = df_cap_sorted[['Cluster']].join(zscore_differences.set_index("Coordinate"), how="inner").reset_index()
df_cap_sorted = df_cap_sorted.reset_index()  # CAP scores with "Coordinate" and "Cluster"

# --- Helper functions to reorder columns ---
def reorder_raw(df):
    base = ["Coordinate", "Cluster"]
    others = [c for c in df.columns if c not in base]
    mod_order = ["H3K27me3", "H3K4me3", "H3K27ac", "H3K4me1", "H3K9ac"]
    ordered = []
    for mod in mod_order:
        early = sorted([c for c in others if c.startswith(mod + "CerebellumEarly")])
        late  = sorted([c for c in others if c.startswith(mod + "CerebellumLate")])
        ordered.extend(early + late)
    return df[base + ordered]

def reorder_avg(df):
    base = ["Coordinate", "Cluster"]
    others = [c for c in df.columns if c not in base]
    mod_order = ["H3K27me3", "H3K4me3", "H3K27ac", "H3K4me1", "H3K9ac"]
    ordered = []
    for mod in mod_order:
        early = sorted([c for c in others if c.startswith(mod + "CerebellumEarlyAVG")])
        late  = sorted([c for c in others if c.startswith(mod + "CerebellumLateAVG")])
        ordered.extend(early + late)
    return df[base + ordered]

def reorder_zscore(df):
    base = ["Coordinate", "Cluster"]
    others = [c for c in df.columns if c not in base]
    mod_order = ["H3K27me3", "H3K4me3", "H3K27ac", "H3K4me1", "H3K9ac"]
    ordered = []
    for mod in mod_order:
        change_cols = sorted([c for c in others if c.startswith(mod + "Cerebellum_Change")])
        ordered.extend(change_cols)
    return df[base + ordered]

def filter_cap(df):
    base = ["Coordinate", "Cluster"]
    others = [c for c in df.columns if c not in base and not c.startswith("H2AK119ubCerebellum")]
    return df[base + others]

# --- Reorder each DataFrame ---
raw_final = reorder_raw(merged_raw_ordered)
avg_final = reorder_avg(merged_avg_ordered)
zscore_final = reorder_zscore(df_zscore_sorted)
cap_final = filter_cap(df_cap_sorted.copy())

# Optional previews:
print("Raw final preview:")
print(raw_final.head())
print("Averaged final preview:")
print(avg_final.head())
print("Z-score final preview:")
print(zscore_final.head())
print("CAP final preview:")
print(cap_final.head())

# %%
# Save final data to Excel (4 sheets)

with pd.ExcelWriter(OUTPUT_FILES['final_combined_excel'], engine="openpyxl") as writer:
    raw_final.to_excel(writer, sheet_name="Raw Replicates", index=False)
    avg_final.to_excel(writer, sheet_name="Averaged Data", index=False)
    zscore_final.to_excel(writer, sheet_name="Z Score Differences", index=False)
    cap_final.to_excel(writer, sheet_name="CAP Scores", index=False)

print(f"Saved combined data with 4 sheets to {OUTPUT_FILES['final_combined_excel']}")