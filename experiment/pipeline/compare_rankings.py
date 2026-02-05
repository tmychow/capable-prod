from __future__ import annotations

import argparse
from collections import defaultdict
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


DEFAULT_RANKINGS_A = Path("outputs/rankings_noah_4r.csv")
DEFAULT_RANKINGS_B = Path("outputs/rankings_isaak_4r.csv")
DEFAULT_PLOT = Path("outputs/rankings_agreement.png")


def parse_bool(value: str) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "y"}


def build_canonical_map(sequences: set[str], edges: list[tuple[str, str]]) -> dict[str, str]:
    parent = {seq: seq for seq in sequences}
    rank: dict[str, int] = {}

    def find(value: str) -> str:
        root = value
        while parent[root] != root:
            root = parent[root]
        while parent[value] != value:
            next_value = parent[value]
            parent[value] = root
            value = next_value
        return root

    def union(a: str, b: str) -> None:
        root_a = find(a)
        root_b = find(b)
        if root_a == root_b:
            return
        rank_a = rank.get(root_a, 0)
        rank_b = rank.get(root_b, 0)
        if rank_a < rank_b:
            parent[root_a] = root_b
        elif rank_a > rank_b:
            parent[root_b] = root_a
        else:
            parent[root_b] = root_a
            rank[root_a] = rank_a + 1

    for left, right in edges:
        union(left, right)

    components: dict[str, list[str]] = defaultdict(list)
    for seq in sequences:
        components[find(seq)].append(seq)

    removed_sources = {left for left, _ in edges}
    canonical_by_root: dict[str, str] = {}
    for root, members in components.items():
        candidates = [seq for seq in members if seq not in removed_sources]
        if not candidates:
            candidates = members
        canonical_by_root[root] = sorted(candidates)[0]

    return {seq: canonical_by_root[find(seq)] for seq in sequences}


def read_rankings(path: Path) -> tuple[list[dict[str, object]], dict[str, str], set[str]]:
    if not path.exists():
        raise SystemExit(f"Missing rankings CSV: {path}")
    df = pd.read_csv(path, dtype=str, encoding="utf-8-sig")
    if df.empty:
        raise SystemExit(f"No rows in {path}")

    df.columns = [str(col).lstrip("\ufeff") for col in df.columns]
    columns = set(df.columns)
    seq_col = next((c for c in ["sequence", "seq", "peptide"] if c in columns), None)
    elo_col = next((c for c in ["elo", "rating"] if c in columns), None)
    invalid_col = "invalid" if "invalid" in columns else None
    removed_col = "removed_for" if "removed_for" in columns else ("removed" if "removed" in columns else None)

    if not seq_col or not elo_col:
        raise SystemExit(f"Missing sequence/elo columns in {path}")

    entries: list[dict[str, object]] = []
    invalid_set: set[str] = set()
    edges: list[tuple[str, str]] = []
    sequences: set[str] = set()

    for _, row in df.iterrows():
        seq_value = row.get(seq_col, "")
        if pd.isna(seq_value):
            seq_value = ""
        seq = str(seq_value).strip()
        if not seq:
            continue
        sequences.add(seq)

        removed_value = row.get(removed_col, "") if removed_col else ""
        if pd.isna(removed_value):
            removed_value = ""
        removed_for = str(removed_value).strip()
        if removed_for.lower() in {"nan", "none"}:
            removed_for = ""
        if removed_for:
            edges.append((seq, removed_for))
            sequences.add(removed_for)

        invalid_value = row.get(invalid_col, "") if invalid_col else ""
        if pd.isna(invalid_value):
            invalid_value = ""
        invalid = bool(invalid_col and parse_bool(invalid_value))
        if invalid:
            invalid_set.add(seq)

        elo_value = row.get(elo_col, "")
        if pd.isna(elo_value):
            elo_value = ""
        raw_elo = str(elo_value).strip()
        if not raw_elo:
            continue
        try:
            elo = float(raw_elo)
        except ValueError:
            continue

        entries.append(
            {
                "seq": seq,
                "elo": elo,
                "invalid": invalid,
                "removed_for": removed_for,
            }
        )

    canonical_map = build_canonical_map(sequences, edges) if sequences else {}
    return entries, canonical_map, invalid_set


def canonical_avg(
    entries: list[dict[str, object]],
    canonical_map: dict[str, str],
    invalid_canon: set[str],
) -> dict[str, float]:
    elos_by_canonical: dict[str, list[float]] = defaultdict(list)
    for entry in entries:
        if entry.get("invalid"):
            continue
        if entry.get("removed_for"):
            continue
        seq = str(entry.get("seq") or "").strip()
        if not seq:
            continue
        canonical = canonical_map.get(seq, seq)
        if canonical in invalid_canon:
            continue
        elos_by_canonical[canonical].append(float(entry["elo"]))
    return {seq: float(np.mean(values)) for seq, values in elos_by_canonical.items() if values}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compare two rankings and plot Elo agreement."
    )
    parser.add_argument(
        "--rankings-a",
        type=Path,
        default=DEFAULT_RANKINGS_A,
        help="First rankings CSV.",
    )
    parser.add_argument(
        "--rankings-b",
        type=Path,
        default=DEFAULT_RANKINGS_B,
        help="Second rankings CSV.",
    )
    parser.add_argument("--plot-out", type=Path, default=DEFAULT_PLOT)
    parser.add_argument("--label-a", type=str, default=None)
    parser.add_argument("--label-b", type=str, default=None)
    args = parser.parse_args()

    entries_a, canonical_map_a, invalid_a = read_rankings(args.rankings_a)
    entries_b, canonical_map_b, invalid_b = read_rankings(args.rankings_b)

    invalid_canon_a = {canonical_map_a.get(seq, seq) for seq in invalid_a}
    invalid_canon_b = {canonical_map_b.get(seq, seq) for seq in invalid_b}

    avg_a = canonical_avg(entries_a, canonical_map_a, invalid_canon_a)
    avg_b = canonical_avg(entries_b, canonical_map_b, invalid_canon_b)

    shared = sorted(set(avg_a) & set(avg_b))
    if not shared:
        raise SystemExit("No shared sequences after canonicalization.")

    df = pd.DataFrame(
        {
            "sequence": shared,
            "elo_a": [avg_a[s] for s in shared],
            "elo_b": [avg_b[s] for s in shared],
        }
    )

    pearson = df["elo_a"].corr(df["elo_b"], method="pearson")
    spearman = df["elo_a"].corr(df["elo_b"], method="spearman")

    label_a = args.label_a or args.rankings_a.stem
    label_b = args.label_b or args.rankings_b.stem

    fig, ax = plt.subplots(figsize=(7.5, 6))
    ax.scatter(
        df["elo_a"],
        df["elo_b"],
        facecolors="none",
        edgecolors="#1f4aa8",
        s=36,
        alpha=0.8,
    )
    min_val = float(min(df["elo_a"].min(), df["elo_b"].min()))
    max_val = float(max(df["elo_a"].max(), df["elo_b"].max()))
    pad = (max_val - min_val) * 0.05 if max_val > min_val else 1.0
    ax.plot(
        [min_val - pad, max_val + pad],
        [min_val - pad, max_val + pad],
        color="#d62728",
        linewidth=1.5,
        label="y = x",
    )

    coeff = np.polyfit(df["elo_a"].values, df["elo_b"].values, 1)
    trend = np.poly1d(coeff)
    x_line = np.linspace(min_val - pad, max_val + pad, 100)
    ax.plot(
        x_line,
        trend(x_line),
        color="#2ca02c",
        linewidth=1.5,
        label="Best fit",
    )

    ax.set_xlabel(f"Elo ({label_a})")
    ax.set_ylabel(f"Elo ({label_b})")
    ax.set_title("Ranking agreement")
    ax.grid(True, linestyle=":", linewidth=0.8, alpha=0.6)
    ax.legend(loc="best")
    ax.text(
        0.02,
        0.98,
        f"Shared: {len(shared)}\nPearson: {pearson:.3f}\nSpearman: {spearman:.3f}",
        transform=ax.transAxes,
        va="top",
        ha="left",
        fontsize=10,
        bbox=dict(boxstyle="round,pad=0.3", facecolor="white", alpha=0.8, edgecolor="#ddd"),
    )

    args.plot_out.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(args.plot_out, dpi=200)
    print(
        f"Shared sequences: {len(shared)} | Pearson={pearson:.4f} | Spearman={spearman:.4f}"
    )
    print(f"Wrote plot to {args.plot_out}")


if __name__ == "__main__":
    main()
