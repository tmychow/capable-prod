from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


DEFAULT_INPUT = Path("outputs/nps_truncation_results.csv")
DEFAULT_OUTPUT = Path("outputs/n_results_peptides.csv")
DEFAULT_COLUMN = "parsed_peptides"
DEFAULT_N_RESULTS_COLUMN = "n_results"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract unique peptide sequences from a CSV column."
    )
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--column", type=str, default=DEFAULT_COLUMN)
    parser.add_argument("--n-results-column", type=str, default=DEFAULT_N_RESULTS_COLUMN)
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"Missing input CSV: {args.input}")

    with args.input.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise SystemExit(f"Missing header in {args.input}")
        if args.column not in reader.fieldnames:
            raise SystemExit(f"Missing column '{args.column}' in {args.input}")
        if args.n_results_column not in reader.fieldnames:
            raise SystemExit(
                f"Missing column '{args.n_results_column}' in {args.input}"
            )

        rows_written = 0

        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("w", encoding="utf-8", newline="") as out_handle:
            writer = csv.writer(out_handle)
            writer.writerow(["peptide", "n_results"])

            for row in reader:
                raw = (row.get(args.column) or "").strip()
                if not raw:
                    continue
                n_results_raw = (row.get(args.n_results_column) or "").strip()
                if not n_results_raw:
                    continue
                try:
                    n_results = int(float(n_results_raw))
                except ValueError:
                    continue

                try:
                    values = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                if isinstance(values, list):
                    for value in values:
                        value = str(value).strip()
                        if value:
                            writer.writerow([value, n_results])
                            rows_written += 1
                else:
                    value = str(values).strip()
                    if value:
                        writer.writerow([value, n_results])
                        rows_written += 1

    print(f"Wrote {rows_written} peptide/n_results rows to {args.output}")


if __name__ == "__main__":
    main()
