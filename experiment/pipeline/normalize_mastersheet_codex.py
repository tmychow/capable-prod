from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import subprocess
from collections import Counter
from pathlib import Path

import modal

APP_NAME = os.getenv("MODAL_APP_NAME", "capable-mastersheet-codex")
CODEX_SECRET_NAME = os.getenv("CODEX_API_KEY", "codex-api-key")

DEFAULT_INPUT_CSV = Path(
    os.getenv("MASTERSHEET_CSV", "raw/nps_mastersheet_filtered_enriched.csv")
)
DEFAULT_PEPTIDES_HTML = Path(os.getenv("PEPTIDES_HTML", "raw/peptides.html"))
DEFAULT_OUTPUT_CSV = Path(
    os.getenv("OUTPUT_CSV", "outputs/nps_mastersheet_normalized.csv")
)
DEFAULT_MISSING_CSV = Path(
    os.getenv("MISSING_OUTPUT_CSV", "outputs/nps_mastersheet_missing_full_sequence.csv")
)
DEFAULT_REPORT_PATH = Path(
    os.getenv("REPORT_PATH", "outputs/nps_mastersheet_normalize_report.json")
)
DEFAULT_MAX_PARALLEL = int(os.getenv("MAX_PARALLEL", "100"))
DEFAULT_MAX_TOTAL = int(os.getenv("MAX_TOTAL", "1000"))
RAW_VOLUME_NAME = os.getenv("RAW_VOLUME_NAME", "capable-exp-raw")
RAW_VOLUME = modal.Volume.from_name(RAW_VOLUME_NAME, create_if_missing=True)


def build_prompt(payload_json: str) -> str:
    return f"""You are in /repo and can read /repo/raw/peptides.html.

You are given one compound payload as JSON:
{payload_json}

Task:
1) If full_sequence is present in the payload, normalize it to match the rules below.
2) If full_sequence is empty, fill it using information in /repo/raw/peptides.html.

Formatting rules for full_sequence (strict):
- Preserve any explicit termini already present (e.g., H-, Ac-, -NH2, -OH). Do NOT add or assume termini.
- No spaces. Parentheses only. No brackets.
- Standard L-amino acids use one-letter uppercase codes.
- Backbone substitutions or nonstandard residues: format as "-(TOKEN)-" between flanking residues.
  Examples: M-(N-Me-Lys)-T, K-(Dab)-T, F-(beta-homo-Arg)-N, A-(Aib)-G, K-(D-Ser)-S.
- Side-chain modifications: attach directly to the residue in parentheses with NO dashes.
  Examples: R(N-omega-Me), K(gamma-E-Pal).
- D-amino acids: treat as backbone substitutions (use -(D-Ser)-, -(D-Arg)-, etc.).
- Spell out Greek letters as words: alpha, beta, gamma, delta, omega.

Canonical token list (use these exact spellings when applicable):
- N-Me-Lys, D-Arg, D-Asn, D-Gln, D-Lys, D-Ser, Dab, Aib, Nle, beta-homo-Arg, N-omega-Me,
  gamma-E-C8, gamma-E-C16, gamma-E-C18.

Normalization guidance (apply these mappings when seen):
- gamma-Glu-* or gamma-glutamyl-* -> gamma-E-*
- gamma-E-Pal / palmitoyl / palmitate / C16 -> gamma-E-C16
- stearoyl / stearate / C18 -> gamma-E-C18
- octanoyl / caprylate / C8 -> gamma-E-C8
- NomegaMe / N-omega-Me -> N-omega-Me
- beta-hArg -> beta-homo-Arg
- N-Me-L-Lys -> N-Me-Lys

Filling missing full_sequence:
- Only use information present in /repo/raw/peptides.html or in this payload.
- Do not invent sequences.
- Match by compound/name. Use reasonable normalization (case-insensitive, ignore punctuation, ignore unicode subscripts).
- For names like hNPS(1-10) or similar ranges, use the base sequence from peptides.html and slice the indicated range.
- If existing_full_sequences are provided, prefer the most frequent sequence and normalize it

Return ONLY JSON with keys:
- full_sequence (string, empty if still missing)
- status (one of: "normalized", "filled", "missing", "unchanged")
- reason (short string)
"""


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
    volumes={"/repo/raw": RAW_VOLUME.read_only()},
)
def run_codex(job: dict[str, object]) -> dict[str, object]:
    workspace = Path("/repo")
    workspace.mkdir(parents=True, exist_ok=True)

    payload = job["payload"]
    payload_json = json.dumps(payload, ensure_ascii=False)
    prompt = build_prompt(payload_json)
    result = subprocess.run(
        ["codex", "exec", "--yolo", "-"],
        cwd=str(workspace),
        capture_output=True,
        text=True,
        input=prompt,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"codex exec failed: {result.stderr}")

    raw_output = result.stdout.strip()
    try:
        response = json.loads(raw_output)
    except json.JSONDecodeError:
        start = raw_output.find("{")
        end = raw_output.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise RuntimeError(f"codex output was not JSON: {raw_output}")
        response = json.loads(raw_output[start : end + 1])

    full_sequence = str(response.get("full_sequence", "") or "")
    status = str(response.get("status", "") or "")
    reason = str(response.get("reason", "") or "")

    return {
        "key": str(job["key"]),
        "full_sequence": full_sequence,
        "status": status,
        "reason": reason,
        "raw_output": raw_output,
    }


@app.local_entrypoint()
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Use Codex on Modal to normalize and fill mastersheet sequences."
    )
    parser.add_argument("--input-csv", type=Path, default=DEFAULT_INPUT_CSV)
    parser.add_argument("--peptides-html", type=Path, default=DEFAULT_PEPTIDES_HTML)
    parser.add_argument("--output-csv", type=Path, default=DEFAULT_OUTPUT_CSV)
    parser.add_argument("--missing-output-csv", type=Path, default=DEFAULT_MISSING_CSV)
    parser.add_argument("--report-path", type=Path, default=DEFAULT_REPORT_PATH)
    parser.add_argument("--max-total", type=int, default=DEFAULT_MAX_TOTAL)
    args, _ = parser.parse_known_args()

    try:
        RAW_VOLUME.remove_file("/peptides.html", recursive=True)
    except Exception:
        pass
    with RAW_VOLUME.batch_upload(force=True) as batch:
        batch.put_file(str(args.peptides_html), "/peptides.html")

    csv_text = args.input_csv.read_text(encoding="utf-8")
    all_rows = list(csv.DictReader(io.StringIO(csv_text)))
    fieldnames = list(all_rows[0].keys()) if all_rows else []
    rows = all_rows
    if args.max_total and args.max_total > 0:
        rows = all_rows[: args.max_total]

    def canonicalize_compound(name: str) -> str:
        raw = (name or "").strip()
        if not raw:
            return raw
        upper = raw.upper()
        if "NPS" in upper:
            token = raw.split()[0]
            # Keep range suffixes like (1-10) but drop non-range parentheticals.
            if "(" in token and ")" in token:
                if not re.search(r"\(\s*\d+\s*[-–]\s*\d+\s*\)", token):
                    token = re.sub(r"\([^)]*\)", "", token)
            return token
        return raw

    grouped: dict[str, dict[str, object]] = {}
    for idx, row in enumerate(rows):
        compound = row.get("compound", "") or ""
        canonical = canonicalize_compound(compound)
        entry = grouped.setdefault(
            canonical,
            {
                "indices": [],
                "compounds": set(),
                "modifications": set(),
                "existing_sequences": [],
            },
        )
        entry["indices"].append(idx)
        entry["compounds"].add(compound)
        mod = (row.get("modification") or "").strip()
        if mod:
            entry["modifications"].add(mod)
        seq = (row.get("full_sequence") or "").strip()
        if seq:
            entry["existing_sequences"].append(seq)

    jobs = []
    for canonical, entry in grouped.items():
        counts = Counter(entry["existing_sequences"])
        existing = [
            {"sequence": seq, "count": count}
            for seq, count in counts.most_common(10)
        ]
        payload = {
            "canonical_compound": canonical,
            "compound_variants": sorted(entry["compounds"])[:10],
            "modification_notes": sorted(entry["modifications"])[:10],
            "existing_full_sequences": existing,
        }
        jobs.append(
            {
                "key": canonical,
                "payload": payload,
            }
        )

    results: list[dict[str, object]] = []
    for batch in chunked(jobs, DEFAULT_MAX_PARALLEL):
        results.extend(list(run_codex.map(batch)))

    results_by_key = {result["key"]: result for result in results}

    normalized_count = 0
    filled_count = 0
    missing_rows = []
    missing_compounds = set()

    for canonical, entry in grouped.items():
        result = results_by_key.get(canonical)
        for idx in entry["indices"]:
            row = rows[idx]
            if not result:
                missing_rows.append(row)
                missing_compounds.add(row.get("compound", ""))
                continue
            new_seq = str(result.get("full_sequence") or "")
            original_seq = (row.get("full_sequence") or "").strip()

            if original_seq and new_seq and new_seq != original_seq:
                normalized_count += 1
                row["full_sequence"] = new_seq
            elif not original_seq and new_seq:
                filled_count += 1
                row["full_sequence"] = new_seq
            elif not original_seq and not new_seq:
                missing_rows.append(row)
                missing_compounds.add(row.get("compound", ""))

    report = {
        "input_total_rows": len(all_rows),
        "processed_rows": len(rows),
        "normalized_count": normalized_count,
        "filled_count": filled_count,
        "remaining_missing_count": len(missing_rows),
        "missing_compounds": sorted(name for name in missing_compounds if name),
    }

    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    with args.output_csv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    args.report_path.parent.mkdir(parents=True, exist_ok=True)
    args.report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    if missing_rows:
        args.missing_output_csv.parent.mkdir(parents=True, exist_ok=True)
        with args.missing_output_csv.open("w", encoding="utf-8", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(missing_rows)

    print(json.dumps(report, indent=2))


def chunked(items: list[dict[str, object]], size: int) -> list[list[dict[str, object]]]:
    return [items[idx : idx + size] for idx in range(0, len(items), size)]
