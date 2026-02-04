from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Iterable

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


DEFAULT_RANKINGS = [Path("outputs/rankings.csv")]
DEFAULT_TRUNCATION = Path("outputs/nps_truncation_results.csv")
DEFAULT_PLOT = Path("outputs/elo_vs_n_results.png")


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


def read_rankings(
    paths: Iterable[Path],
) -> tuple[list[dict[str, object]], dict[str, str], set[str]]:
    entries: list[dict[str, object]] = []
    invalid_set: set[str] = set()
    edges: list[tuple[str, str]] = []
    sequences: set[str] = set()

    for path in paths:
        if not path.exists():
            raise SystemExit(f"Missing rankings CSV: {path}")
        df = pd.read_csv(path)
        if df.empty:
            continue

        columns = set(df.columns)
        seq_col = next((c for c in ["sequence", "seq", "peptide"] if c in columns), None)
        elo_col = next((c for c in ["elo", "rating"] if c in columns), None)
        invalid_col = "invalid" if "invalid" in columns else None
        removed_col = "removed_for" if "removed_for" in columns else ("removed" if "removed" in columns else None)

        if not seq_col or not elo_col:
            raise SystemExit(f"Missing sequence/elo columns in {path}")

        for _, row in df.iterrows():
            seq = str(row.get(seq_col, "")).strip()
            if not seq:
                continue
            sequences.add(seq)

            removed_for = str(row.get(removed_col, "")).strip() if removed_col else ""
            if removed_for:
                edges.append((seq, removed_for))
                sequences.add(removed_for)

            invalid = bool(invalid_col and parse_bool(row.get(invalid_col) or ""))
            if invalid:
                invalid_set.add(seq)

            raw_elo = str(row.get(elo_col, "")).strip()
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


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Plot Elo vs n_results with baseline sequences as horizontal lines."
    )
    parser.add_argument(
        "--rankings",
        type=Path,
        action="append",
        default=None,
        help="Path to rankings CSV (can be repeated).",
    )
    parser.add_argument("--truncation", type=Path, default=DEFAULT_TRUNCATION)
    parser.add_argument("--plot-out", type=Path, default=DEFAULT_PLOT)
    args = parser.parse_args()

    ranking_paths = args.rankings or DEFAULT_RANKINGS
    entries, canonical_map, invalid_set = read_rankings(ranking_paths)

    invalid_canon = {canonical_map.get(seq, seq) for seq in invalid_set}

    canonical_elos: dict[str, list[float]] = defaultdict(list)
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
        canonical_elos[canonical].append(float(entry["elo"]))

    canonical_avg = {
        seq: float(np.mean(elos)) for seq, elos in canonical_elos.items() if elos
    }

    if not args.truncation.exists():
        raise SystemExit(f"Missing truncation results: {args.truncation}")

    df = pd.read_csv(args.truncation)
    if df.empty:
        raise SystemExit(f"No rows in {args.truncation}")
    required = {"n_results", "parsed_peptides"}
    missing = required.difference(df.columns)
    if missing:
        raise SystemExit(f"Missing columns in {args.truncation}: {sorted(missing)}")

    n_results_values: list[int] = []
    avg_elos: list[float] = []
    baseline_seqs: dict[str, float] = {}

    for _, row in df.iterrows():
        n_results_raw = row.get("n_results", "")
        parsed = str(row.get("parsed_peptides", "")).strip()
        if not parsed:
            continue
        try:
            peptides = json.loads(parsed)
        except json.JSONDecodeError:
            continue
        if not isinstance(peptides, list):
            peptides = [peptides]

        n_results_value = pd.to_numeric(n_results_raw, errors="coerce")
        n_results: int | None = None
        if pd.notna(n_results_value):
            n_results = int(n_results_value)

        for peptide in peptides:
            peptide = str(peptide).strip()
            if not peptide:
                continue
            canonical = canonical_map.get(peptide, peptide)
            if canonical in invalid_canon:
                continue
            avg_elo = canonical_avg.get(canonical)
            if avg_elo is None:
                continue
            if n_results is None:
                baseline_seqs[canonical] = avg_elo
            else:
                n_results_values.append(n_results)
                avg_elos.append(avg_elo)

    if not n_results_values:
        raise SystemExit("No numeric n_results values with Elo found to plot.")

    plot_df = pd.DataFrame({"n_results": n_results_values, "avg_elo": avg_elos})
    plot_summary = plot_df.groupby("n_results", as_index=False)["avg_elo"].mean()
    plot_summary = plot_summary.sort_values("n_results")

    fig, ax = plt.subplots(figsize=(10, 6))
    ax.scatter(
        plot_summary["n_results"].values,
        plot_summary["avg_elo"].values,
        color="#1f1c17",
        s=36,
        zorder=3,
        label="Mean Elo",
    )
    ax.plot(
        plot_summary["n_results"].values,
        plot_summary["avg_elo"].values,
        color="#1f1c17",
        linewidth=2,
        zorder=2,
    )

    if baseline_seqs:
        x_min = float(plot_summary["n_results"].min())
        x_max = float(plot_summary["n_results"].max())
        for seq, elo in sorted(baseline_seqs.items(), key=lambda item: item[1]):
            ax.hlines(
                y=elo,
                xmin=x_min,
                xmax=x_max,
                colors="#9b6b3f",
                linestyles="--",
                linewidth=1.5,
                alpha=0.8,
            )
            ax.text(
                x_max + (x_max - x_min) * 0.02,
                elo,
                seq,
                va="center",
                fontsize=9,
                color="#5a4a3b",
            )

    ax.set_xlabel("n_results")
    ax.set_ylabel("Average Elo")
    ax.set_title("Elo vs n_results with baseline lines")
    ax.grid(True, linestyle=":", linewidth=0.8, alpha=0.6)
    ax.margins(x=0.05)

    args.plot_out.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(args.plot_out, dpi=200)
    print(f"Wrote plot to {args.plot_out}")


if __name__ == "__main__":
    main()
