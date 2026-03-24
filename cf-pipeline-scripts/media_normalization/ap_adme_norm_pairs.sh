#!/usr/bin/env bash
set -euo pipefail

# Paths relative to this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

OLD_DIR="$ROOT_DIR/ap_adme_bw"
NEW_DIR="$ROOT_DIR/ap_adme_new_2rep_bw"
R_SCRIPT="$SCRIPT_DIR/ap_cli_normalization.r"

echo "old_dir: $OLD_DIR"
echo "new_dir: $NEW_DIR"
echo "r:       $R_SCRIPT"

tissues=(brain kidney liver)
mods=(H3K4me3 H3K9ac H3K27ac H3K27me3)

for t in "${tissues[@]}"; do
  for m in "${mods[@]}"; do
    pattern="${t}${m}"
    echo "=== ${pattern} ==="
    Rscript "$R_SCRIPT" "$pattern" "$OLD_DIR" "$NEW_DIR"
  done
done
