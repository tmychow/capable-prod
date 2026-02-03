from __future__ import annotations

import csv
import io
import json
import os
import re
import subprocess
from pathlib import Path

import modal

APP_NAME = os.getenv("MODAL_APP_NAME", "capable-codex-truncations")
CODEX_SECRET_NAME = os.getenv("MODAL_CODEX_SECRET", "codex-api-key")

CONFIG_PATH = Path(os.getenv("TRUNCATIONS_CONFIG", "pipeline/config/truncation.json"))
DEFAULT_MAX_PARALLEL = int(os.getenv("MAX_PARALLEL", "15"))


def load_config(path: Path) -> dict[str, object]:
    if not path.exists():
        raise SystemExit(f"Missing config file at {path}.")
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def make_seeds(count: int, seed_start: int) -> list[int]:
    return list(range(seed_start, seed_start + count))


def load_csv_rows(csv_path: Path) -> tuple[list[dict[str, str]], list[str]]:
    if not csv_path.exists():
        raise SystemExit(f"Missing input CSV: {csv_path}")
    with csv_path.open("r", newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        fieldnames = reader.fieldnames or []
    if not fieldnames:
        raise SystemExit(f"Missing header in {csv_path}")
    return rows, fieldnames


def format_rows(rows: list[dict[str, str]], fieldnames: list[str]) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(fieldnames)
    for row in rows:
        writer.writerow([row.get(field, "") for field in fieldnames])
    return output.getvalue().strip()


def build_prompt(
    csv_path: str,
    n_results: int,
    seed: int,
    base_prompt: str,
    response_tag: str,
) -> str:
    return (
        f"{base_prompt.strip()}\n\n"
        f"Experimental results (top {n_results} rows, CSV) are in {csv_path}.\n"
        "Read the file contents directly (e.g., cat or python). "
        "Only use information present in that CSV.\n\n"
        f"Random seed: {seed} (use only to break ties between equally good options).\n\n"
        f"Suggest one new peptide to test. Return only an XML tag "
        f"<{response_tag}>...</{response_tag}> with the peptide sequence inside."
    )


def extract_tags(text: str, tag: str) -> list[str]:
    matches = re.findall(
        rf"<{tag}>(.*?)</{tag}>",
        text,
        flags=re.DOTALL | re.IGNORECASE,
    )
    return [match.strip() for match in matches if match.strip()]


def chunked(items: list[dict[str, object]], size: int) -> list[list[dict[str, object]]]:
    return [items[idx : idx + size] for idx in range(0, len(items), size)]


app = modal.App(APP_NAME)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("curl", "ca-certificates")
    .run_commands("curl -fsSL https://deb.nodesource.com/setup_20.x | bash -")
    .run_commands("apt-get install -y nodejs")
    .run_commands("npm install -g @openai/codex")
)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name(CODEX_SECRET_NAME)],
)
def run_codex(job: dict[str, object]) -> dict[str, object]:
    workspace = Path("/repo")
    workspace.mkdir(parents=True, exist_ok=True)
    csv_path = workspace / str(job["csv_path"])
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    csv_path.write_text(str(job["rows_text"]), encoding="utf-8")
    prompt = str(job["prompt"])
    result = subprocess.run(
        ["codex", "exec", "--yolo", "-"],
        cwd=str(workspace),
        capture_output=True,
        text=True,
        input=prompt,
        check=False,
    )
    if csv_path.exists():
        csv_path.unlink()
    if result.returncode != 0:
        raise RuntimeError(
            f"codex exec failed for n_results={job['n_results']} seed={job['seed']}: "
            f"{result.stderr}"
        )
    response_text = result.stdout.strip()
    return {
        "n_results": job["n_results"],
        "seed": job["seed"],
        "response_text": response_text,
        "parsed_peptides": json.dumps(
            extract_tags(response_text, str(job["response_tag"]))
        ),
    }


@app.local_entrypoint()
def main() -> None:
    config = load_config(CONFIG_PATH)
    input_path = Path(str(config.get("input_csv", "")))
    output_path = Path(str(config.get("output_csv", "")))
    row_counts = config.get("row_counts", [])
    seeds_config = config.get("seeds", {})
    base_prompt = str(config.get("base_prompt", "")).strip()
    response_tag = str(config.get("response_tag", "")).strip()
    max_parallel = int(config.get("max_parallel", DEFAULT_MAX_PARALLEL))

    if not input_path:
        raise SystemExit("Config missing input_csv.")
    if not output_path:
        raise SystemExit("Config missing output_csv.")
    if not isinstance(row_counts, list) or not row_counts:
        raise SystemExit("Config row_counts must be a non-empty list.")
    if not isinstance(seeds_config, dict):
        raise SystemExit("Config seeds must be an object with count/start.")
    if not base_prompt:
        raise SystemExit("Config missing base_prompt.")
    if not response_tag:
        raise SystemExit("Config missing response_tag.")

    seed_count = int(seeds_config.get("count", 0))
    seed_start = int(seeds_config.get("start", 0))
    if seed_count <= 0:
        raise SystemExit("Config seeds.count must be > 0.")
    seeds = make_seeds(seed_count, seed_start)
    row_counts = sorted(set(int(value) for value in row_counts))

    rows, fieldnames = load_csv_rows(input_path)

    max_count = max(row_counts)
    if max_count > len(rows):
        raise SystemExit(
            f"Requested {max_count} rows but only {len(rows)} available in {input_path}."
        )

    jobs: list[dict[str, object]] = []
    for n_results in row_counts:
        subset = rows[:n_results]
        rows_text = format_rows(subset, fieldnames)
        for seed in seeds:
            csv_path = f"truncations/trunc_{n_results}_{seed}.csv"
            jobs.append(
                {
                    "n_results": n_results,
                    "seed": seed,
                    "csv_path": csv_path,
                    "rows_text": rows_text,
                    "prompt": build_prompt(
                        csv_path,
                        n_results,
                        seed,
                        base_prompt,
                        response_tag,
                    ),
                    "response_tag": response_tag,
                }
            )

    results: list[dict[str, object]] = []
    for batch in chunked(jobs, max_parallel):
        results.extend(list(run_codex.map(batch)))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["n_results", "seed", "parsed_peptides", "response_text"]
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for result in results:
            writer.writerow(result)

    print(f"Wrote {len(results)} rows to {output_path}")
