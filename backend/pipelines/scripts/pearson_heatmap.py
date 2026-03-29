# backend/pipelines/scripts/pearson_heatmap.py
# Parameterized port of references/media_pearson_corr/pearson.py
#
# Reads a coverage CSV matrix (from pearson_matrix.R), computes pairwise
# Pearson correlation, generates an annotated heatmap, and saves the
# correlation coefficient matrix.  Core algorithm preserved verbatim.
#
# Usage:
#   python3 pearson_heatmap.py <input_csv> <output_png> <output_svg> <correlation_csv>

import sys  # isort:skip_file

import matplotlib

matplotlib.use("Agg")  # non-interactive backend for server use
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402
import seaborn as sns  # noqa: E402

if len(sys.argv) < 5:
    print(
        "Usage: python3 pearson_heatmap.py <input_csv> <output_png> <output_svg> <correlation_csv>",
        file=sys.stderr,
    )
    sys.exit(1)

input_csv = sys.argv[1]
output_png = sys.argv[2]
output_svg = sys.argv[3]
correlation_csv = sys.argv[4]

# Read coverage matrix — matches lab: pd.read_csv(variable+'.csv')
df = pd.read_csv(input_csv)

# Drop first column (R's row index) — matches lab: df.iloc[:,1:]
df_notitle = df.iloc[:, 1:]

# Compute Pearson correlation — matches lab: df_notitle.corr()
correlation_mat = df_notitle.corr()
print(correlation_mat)

# Save correlation matrix as downloadable CSV
correlation_mat.to_csv(correlation_csv)
print(f"Saved correlation matrix to {correlation_csv}")

# Generate heatmap — matches lab parameters exactly:
# figsize=(15,15), cmap="Blues", annot=True, annot_kws={"size":25}, fmt='.2f'
plt.figure(figsize=(15, 15))

# Scale annotation font size based on number of samples for readability
n_samples = len(correlation_mat.columns)
annot_size = 25 if n_samples <= 6 else max(8, 25 - (n_samples - 6) * 2)

ax = sns.heatmap(
    correlation_mat,
    cmap="Blues",
    annot=True,
    annot_kws={"size": annot_size},
    fmt=".2f",
    vmin=0,
    vmax=1,
    square=True,
)
plt.tight_layout()

# Save PNG — matches lab: .get_figure().savefig(variable+'.png')
fig = ax.get_figure()
fig.savefig(output_png, dpi=150, bbox_inches="tight")
print(f"Saved heatmap PNG to {output_png}")

# Save SVG — added beyond lab script (same pattern as Custom Heatmap)
fig.savefig(output_svg, format="svg", bbox_inches="tight")
print(f"Saved heatmap SVG to {output_svg}")

print("done")
