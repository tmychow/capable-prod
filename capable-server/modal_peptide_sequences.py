from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path

import modal

APP_NAME = os.getenv("MODAL_SEQUENCE_APP_NAME", "capable-peptide-sequences")
CODEX_SECRET_NAME = os.getenv("MODAL_CODEX_SECRET", "codex-api-key")
DATA_LAKE_VOLUME_NAME = os.getenv("DATA_LAKE_VOLUME_NAME", "capable-data-lake")

DATA_LAKE_VOLUME = modal.Volume.from_name(
    DATA_LAKE_VOLUME_NAME,
    create_if_missing=True,
)

app = modal.App(APP_NAME)

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("curl", "ca-certificates")
    .run_commands("curl -fsSL https://deb.nodesource.com/setup_20.x | bash -")
    .run_commands("apt-get install -y nodejs")
    .run_commands("npm install -g @openai/codex")
)


def build_prompt(peptide_name: str) -> str:
    return f"""You are in /repo and can read /repo/datalake.

Given peptide name: {peptide_name}

Task:
Find and return the peptide full sequence from data in /repo/datalake.
Do not invent sequences.

Formatting rules for full_sequence (strict):
- Preserve explicit termini if present (H-, Ac-, -NH2, -OH). Do not add termini.
- No spaces. Parentheses only. No brackets.
- Standard L-amino acids use one-letter uppercase codes.
- Backbone substitutions or nonstandard residues: format as "-(TOKEN)-" between flanking residues.
  Examples: M-(N-Me-Lys)-T, K-(Dab)-T, F-(beta-homo-Arg)-N, A-(Aib)-G, K-(D-Ser)-S.
- Side-chain modifications: attach directly to the residue in parentheses with NO dashes.
  Examples: R(N-omega-Me), K(gamma-E-C16).
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

Inference rules:
- Use only evidence in /repo/datalake.
- If multiple candidates exist, prefer the most direct peptide match.
- For truncation names like NPS(1-10), derive from base sequence and slice the indicated range.

Output:
Return exactly one XML tag and nothing else:
<sequence>...</sequence>
If unknown:
<sequence></sequence>
"""


def parse_sequence_tag(text: str) -> str:
    match = re.search(r"<sequence>(.*?)</sequence>", text, flags=re.DOTALL | re.IGNORECASE)
    if not match:
        return ""
    sequence = match.group(1).strip()
    return re.sub(r"\s+", "", sequence)


def build_notes_prompt(peptide_name: str) -> str:
    return f"""You are in /repo and can read /repo/datalake. Please look through the folder and find all the information relating to {peptide_name}.
    
Do not include information that is about variants or related molecules. Look at the peptides notion and the breakdown studies folder.

Output:
Return exactly one XML tag and nothing else:
<notes>...</notes>
If no useful information is found:
<notes></notes>
"""


def parse_notes_tag(text: str) -> str:
    match = re.search(r"<notes>(.*?)</notes>", text, flags=re.DOTALL | re.IGNORECASE)
    if not match:
        return ""
    return match.group(1).strip()


@app.function(
    image=image,
    secrets=[modal.Secret.from_name(CODEX_SECRET_NAME)],
    volumes={"/repo/datalake": DATA_LAKE_VOLUME.read_only()},
)
def run_codex_for_peptide(job: dict[str, object]) -> dict[str, object]:
    peptide_id = int(job["peptide_id"])
    peptide_name = str(job["name"] or "").strip()
    workspace = Path("/repo")
    workspace.mkdir(parents=True, exist_ok=True)

    if not peptide_name:
        return {
            "peptide_id": peptide_id,
            "sequence": "",
            "status": "failed",
            "error": "Missing peptide name",
        }

    prompt = build_prompt(peptide_name)
    result = subprocess.run(
        ["codex", "exec", "--yolo", "-"],
        cwd=str(workspace),
        capture_output=True,
        text=True,
        input=prompt,
        check=False,
    )
    if result.returncode != 0:
        return {
            "peptide_id": peptide_id,
            "sequence": "",
            "status": "failed",
            "error": (result.stderr or "codex exec failed").strip(),
        }

    raw_output = (result.stdout or "").strip()
    sequence = parse_sequence_tag(raw_output)
    return {
        "peptide_id": peptide_id,
        "sequence": sequence,
        "status": "ok",
        "raw_output": raw_output,
    }


@app.function(
    image=image,
    secrets=[modal.Secret.from_name(CODEX_SECRET_NAME)],
    volumes={"/repo/datalake": DATA_LAKE_VOLUME.read_only()},
)
def run_codex_for_peptide_notes(job: dict[str, object]) -> dict[str, object]:
    peptide_id = int(job["peptide_id"])
    peptide_name = str(job["name"] or "").strip()
    workspace = Path("/repo")
    workspace.mkdir(parents=True, exist_ok=True)

    if not peptide_name:
        return {
            "peptide_id": peptide_id,
            "notes": "",
            "status": "failed",
            "error": "Missing peptide name",
        }

    prompt = build_notes_prompt(peptide_name)
    result = subprocess.run(
        ["codex", "exec", "--yolo", "-"],
        cwd=str(workspace),
        capture_output=True,
        text=True,
        input=prompt,
        check=False,
    )
    if result.returncode != 0:
        return {
            "peptide_id": peptide_id,
            "notes": "",
            "status": "failed",
            "error": (result.stderr or "codex exec failed").strip(),
        }

    raw_output = (result.stdout or "").strip()
    notes = parse_notes_tag(raw_output)
    return {
        "peptide_id": peptide_id,
        "notes": notes,
        "status": "ok",
        "raw_output": raw_output,
    }


@app.local_entrypoint()
def main(peptide_id: int, peptide_name: str) -> None:
    result = run_codex_for_peptide.remote(
        {"peptide_id": peptide_id, "name": peptide_name}
    )
    print(json.dumps(result, indent=2))
