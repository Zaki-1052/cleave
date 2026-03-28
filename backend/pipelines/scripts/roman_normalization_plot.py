# backend/pipelines/scripts/roman_normalization_plot.py
# Generates a bar chart of Roman normalization factors per sample.
#
# Usage:
#   python3 roman_normalization_plot.py <factors_csv> <output_png> <output_svg>

import sys  # isort:skip_file

import matplotlib
matplotlib.use("Agg")  # non-interactive backend for server use
import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402

if len(sys.argv) < 4:
    print(
        "Usage: python3 roman_normalization_plot.py "
        "<factors_csv> <output_png> <output_svg>",
        file=sys.stderr,
    )
    sys.exit(1)

factors_csv = sys.argv[1]
output_png = sys.argv[2]
output_svg = sys.argv[3]

# Read normalization factors
df = pd.read_csv(factors_csv)
print(df)

n_samples = len(df)

# Bar colours: reference sample (first, NF=1.0) distinct, others graded
colours = ["#2196F3"] + ["#90CAF9"] * (n_samples - 1)

fig, ax = plt.subplots(figsize=(max(8, n_samples * 1.2), max(5, n_samples * 0.6)))

bars = ax.barh(
    df["SampleName"],
    df["NormalizationFactor"],
    color=colours,
    edgecolor="white",
    height=0.6,
)

# Reference line at NF = 1.0
ax.axvline(x=1.0, color="#333333", linestyle="--", linewidth=1, alpha=0.7)

# Annotate bars with NF values
for bar, nf_val in zip(bars, df["NormalizationFactor"]):
    ax.text(
        bar.get_width() + 0.01,
        bar.get_y() + bar.get_height() / 2,
        f"{nf_val:.4f}",
        va="center",
        fontsize=10,
    )

ax.set_xlabel("Normalization Factor", fontsize=12)
ax.set_title("Roman Normalization Factors (99th Percentile)", fontsize=14)
ax.invert_yaxis()
plt.tight_layout()

# Save PNG
fig.savefig(output_png, dpi=150, bbox_inches="tight")
print(f"Saved normalization plot PNG to {output_png}")

# Save SVG
fig.savefig(output_svg, format="svg", bbox_inches="tight")
print(f"Saved normalization plot SVG to {output_svg}")

print("done")
