from __future__ import annotations

import argparse
from collections import defaultdict
from pathlib import Path
from typing import Iterable

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


DEFAULT_RANKINGS = [Path("outputs/rankings_isaak_4r.csv"), Path("outputs/rankings_noah_4r.csv")]
DEFAULT_N_RESULTS = Path("outputs/n_results_peptides.csv")
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
) -> tuple[dict[str, list[dict[str, object]]], dict[str, str], set[str]]:
    entries_by_source: dict[str, list[dict[str, object]]] = defaultdict(list)
    invalid_set: set[str] = set()
    edges: list[tuple[str, str]] = []
    sequences: set[str] = set()

    for path in paths:
        if not path.exists():
            raise SystemExit(f"Missing rankings CSV: {path}")
        source = path.stem
        df = pd.read_csv(path, dtype=str, encoding="utf-8-sig")
        if df.empty:
            continue

        df.columns = [str(col).lstrip("\ufeff") for col in df.columns]
        columns = set(df.columns)
        seq_col = next((c for c in ["sequence", "seq", "peptide"] if c in columns), None)
        elo_col = next((c for c in ["elo", "rating"] if c in columns), None)
        invalid_col = "invalid" if "invalid" in columns else None
        removed_col = "removed_for" if "removed_for" in columns else ("removed" if "removed" in columns else None)

        if not seq_col or not elo_col:
            raise SystemExit(f"Missing sequence/elo columns in {path}")

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

            entries_by_source[source].append(
                {
                    "seq": seq,
                    "elo": elo,
                    "invalid": invalid,
                    "removed_for": removed_for,
                    "source": source,
                }
            )

    canonical_map = build_canonical_map(sequences, edges) if sequences else {}
    return entries_by_source, canonical_map, invalid_set


def build_canonical_avg(
    entries: Iterable[dict[str, object]],
    canonical_map: dict[str, str],
    invalid_canon: set[str],
) -> dict[str, float]:
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
    return {seq: float(np.mean(elos)) for seq, elos in canonical_elos.items() if elos}


def build_plot_data(
    rows: list[tuple[str, int | None]],
    canonical_map: dict[str, str],
    invalid_canon: set[str],
    avg_map: dict[str, float],
    track_missing: bool = False,
) -> tuple[list[int], list[float], dict[str, float], dict[str, object]]:
    n_results_values: list[int] = []
    avg_elos: list[float] = []
    baseline_seqs: dict[str, float] = {}
    numeric_rows = 0
    numeric_peptides = 0
    numeric_with_elo = 0
    missing_examples: list[tuple[str, str]] = []
    missing_by_canonical: dict[str, int] = defaultdict(int)
    missing_total = 0

    for peptide, n_results in rows:
        if not peptide:
            continue
        if n_results is not None:
            numeric_rows += 1
        canonical = canonical_map.get(peptide, peptide)
        if canonical in invalid_canon:
            continue
        if n_results is not None:
            numeric_peptides += 1
        avg_elo = avg_map.get(canonical)
        if avg_elo is None:
            missing_total += 1
            if track_missing:
                missing_by_canonical[canonical] += 1
                if len(missing_examples) < 10:
                    missing_examples.append((peptide, canonical))
            continue
        if n_results is None:
            baseline_seqs[canonical] = avg_elo
        else:
            n_results_values.append(n_results)
            avg_elos.append(avg_elo)
            numeric_with_elo += 1

    diagnostics = {
        "numeric_rows": numeric_rows,
        "numeric_peptides": numeric_peptides,
        "numeric_with_elo": numeric_with_elo,
        "missing_total": missing_total,
        "missing_examples": missing_examples,
        "missing_by_canonical": missing_by_canonical,
    }
    return n_results_values, avg_elos, baseline_seqs, diagnostics


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
    parser.add_argument("--n-results", type=Path, default=DEFAULT_N_RESULTS)
    parser.add_argument("--plot-out", type=Path, default=DEFAULT_PLOT)
    args = parser.parse_args()

    ranking_paths = args.rankings or DEFAULT_RANKINGS
    entries_by_source, canonical_map, invalid_set = read_rankings(ranking_paths)

    invalid_canon = {canonical_map.get(seq, seq) for seq in invalid_set}

    per_judge_avg: dict[str, dict[str, float]] = {}
    for source, entries in entries_by_source.items():
        per_judge_avg[source] = build_canonical_avg(entries, canonical_map, invalid_canon)

    combined_elos: dict[str, list[float]] = defaultdict(list)
    for avg_map in per_judge_avg.values():
        for seq, avg in avg_map.items():
            combined_elos[seq].append(avg)
    combined_avg = {seq: float(np.mean(values)) for seq, values in combined_elos.items() if values}

    if not args.n_results.exists():
        raise SystemExit(f"Missing n_results peptides CSV: {args.n_results}")

    df = pd.read_csv(args.n_results, dtype=str)
    if df.empty:
        raise SystemExit(f"No rows in {args.n_results}")
    required = {"n_results", "peptide"}
    missing = required.difference(df.columns)
    if missing:
        raise SystemExit(f"Missing columns in {args.n_results}: {sorted(missing)}")

    rows: list[tuple[str, int | None]] = []
    for _, row in df.iterrows():
        n_results_raw = row.get("n_results", "")
        peptide = str(row.get("peptide", "")).strip()
        if not peptide:
            continue
        n_results_value = pd.to_numeric(n_results_raw, errors="coerce")
        n_results: int | None = None
        if pd.notna(n_results_value):
            n_results = int(n_results_value)
        rows.append((peptide, n_results))

    n_results_values, avg_elos, baseline_seqs, diagnostics = build_plot_data(
        rows,
        canonical_map,
        invalid_canon,
        combined_avg,
        track_missing=True,
    )

    if not n_results_values:
        raise SystemExit(
            "No numeric n_results values with Elo found to plot. "
            f"Numeric rows: {diagnostics['numeric_rows']}, "
            f"numeric peptides: {diagnostics['numeric_peptides']}, "
            f"numeric peptides with Elo: {diagnostics['numeric_with_elo']}."
        )

    if diagnostics["missing_total"]:
        top_missing = sorted(
            diagnostics["missing_by_canonical"].items(),
            key=lambda item: item[1],
            reverse=True,
        )[:10]
        print(f"Missing Elo for {diagnostics['missing_total']} peptides (showing 10 examples):")
        for peptide, canonical in diagnostics["missing_examples"]:
            print(f"  peptide='{peptide}' canonical='{canonical}'")
        print("Top missing canonicals:")
        for canonical, count in top_missing:
            print(f"  {canonical} -> {count}")

    def plot_panel(
        ax: plt.Axes,
        n_results_vals: list[int],
        elo_vals: list[float],
        baseline: dict[str, float],
        title: str,
    ) -> None:
        plot_df = pd.DataFrame({"n_results": n_results_vals, "avg_elo": elo_vals})
        plot_summary = plot_df.groupby("n_results", as_index=False)["avg_elo"].mean()
        plot_summary = plot_summary.sort_values("n_results")

        ax.scatter(
            plot_df["n_results"].values,
            plot_df["avg_elo"].values,
            facecolors="none",
            edgecolors="#1f4aa8",
            s=22,
            alpha=0.7,
            zorder=2,
            label="Peptides",
        )
        ax.scatter(
            plot_summary["n_results"].values,
            plot_summary["avg_elo"].values,
            marker="^",
            facecolors="#1f4aa8",
            edgecolors="#1f4aa8",
            s=64,
            zorder=3,
            label="Mean by n_results",
        )
        if len(plot_df) >= 2:
            x = plot_df["n_results"].values.astype(float)
            y = plot_df["avg_elo"].values.astype(float)
            coeff = np.polyfit(x, y, 1)
            trend = np.poly1d(coeff)
            x_line = np.linspace(x.min(), x.max(), 100)
            y_line = trend(x_line)
            ax.plot(
                x_line,
                y_line,
                color="#d62728",
                linewidth=2,
                label="Trendline",
                zorder=1,
            )

        if baseline:
            x_min = float(plot_summary["n_results"].min())
            x_max = float(plot_summary["n_results"].max())
            for seq, elo in sorted(baseline.items(), key=lambda item: item[1]):
                ax.hlines(
                    y=elo,
                    xmin=x_min,
                    xmax=x_max,
                    colors="#2ca02c",
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
                    color="#2ca02c",
                )

        ax.set_xlabel("n_results")
        ax.set_ylabel("Average Elo")
        ax.set_title(title)
        ax.grid(True, linestyle=":", linewidth=0.8, alpha=0.6)
        ax.margins(x=0.05)

    judge_sources = [path.stem for path in ranking_paths if path.stem in per_judge_avg]
    judge_panels: list[tuple[str, list[int], list[float], dict[str, float]]] = []
    for source in judge_sources:
        avg_map = per_judge_avg.get(source, {})
        if not avg_map:
            continue
        judge_n, judge_elos, judge_baseline, _ = build_plot_data(
            rows,
            canonical_map,
            invalid_canon,
            avg_map,
            track_missing=False,
        )
        if not judge_n:
            continue
        judge_panels.append((source, judge_n, judge_elos, judge_baseline))

    total_panels = 1 + len(judge_panels)
    fig, axes = plt.subplots(
        nrows=total_panels,
        ncols=1,
        figsize=(10, 6 + 4 * (total_panels - 1)),
        squeeze=False,
    )

    plot_panel(
        axes[0][0],
        n_results_values,
        avg_elos,
        baseline_seqs,
        "Combined Elo vs n_results",
    )

    if judge_panels:
        row_index = 1
        for source, judge_n, judge_elos, judge_baseline in judge_panels:
            plot_panel(
                axes[row_index][0],
                judge_n,
                judge_elos,
                judge_baseline,
                f"{source} Elo vs n_results",
            )
            row_index += 1

    args.plot_out.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(args.plot_out, dpi=200)
    print(f"Wrote plot to {args.plot_out}")


if __name__ == "__main__":
    main()
