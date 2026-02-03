from __future__ import annotations

import csv
import json
from pathlib import Path

RESULTS_PATH = Path("outputs/nps_truncation_results.csv")
MASTER_PATH = Path("raw/nps_mastersheet_filtered_enriched.csv")
OUTPUT_PATH = Path("outputs/nps_truncation_postcheck.csv")


def load_master_sequences(path: Path) -> list[str]:
    if not path.exists():
        raise SystemExit(f"Missing mastersheet at {path}.")
    with path.open("r", newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise SystemExit(f"Missing header in {path}.")
        if "full_sequence" not in reader.fieldnames:
            raise SystemExit("Expected 'full_sequence' column in mastersheet.")
        return [row.get("full_sequence", "") for row in reader]


def load_truncation_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        raise SystemExit(f"Missing truncation results at {path}.")
    with path.open("r", newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise SystemExit(f"Missing header in {path}.")
        required = {"n_results", "seed", "parsed_peptides"}
        missing = required.difference(reader.fieldnames)
        if missing:
            raise SystemExit(f"Missing columns in truncation results: {sorted(missing)}")
        return list(reader)


def parse_peptides(raw: str) -> list[str]:
    try:
        peptides = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Failed to parse parsed_peptides JSON: {exc}") from exc
    if not isinstance(peptides, list):
        raise SystemExit("parsed_peptides must be a JSON list.")
    return [str(peptide) for peptide in peptides if str(peptide)]


def normalize_sequence(sequence: str) -> str:
    drop_chars = set("[](){}- \t\r\n")
    return "".join(char for char in sequence if char not in drop_chars)


def main() -> None:
    sequences = load_master_sequences(MASTER_PATH)
    truncation_rows = load_truncation_rows(RESULTS_PATH)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "n_results",
        "seed",
        "parsed_peptides_count",
        "matches_after_n_results_count",
        "matched_peptides",
    ]

    with OUTPUT_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in truncation_rows:
            n_results = int(row["n_results"])
            peptides = parse_peptides(row["parsed_peptides"])
            tail_sequences = {seq for seq in sequences[n_results:] if seq}
            tail_normalized = {normalize_sequence(seq) for seq in tail_sequences}
            matches = [
                peptide
                for peptide in peptides
                if normalize_sequence(peptide) in tail_normalized
            ]
            writer.writerow(
                {
                    "n_results": n_results,
                    "seed": row["seed"],
                    "parsed_peptides_count": len(peptides),
                    "matches_after_n_results_count": len(matches),
                    "matched_peptides": json.dumps(matches),
                }
            )

    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
