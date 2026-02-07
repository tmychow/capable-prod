import asyncio
import json
import os
import re

from openai import AsyncOpenAI

from api.database import get_supabase_admin


EXTRACTION_PROMPT = """\
Extract peptide identifiers from this experiment name. Return a JSON array of peptide name strings.

Peptides are of the form: OXNv3.1 i.e. version number if available. We mostly look at orexin and NPS. Orexins are OXNB if not stated otherwise.

Don't use hyphens and underscores. Keep version numbers attached to compound names with no spaces (e.g. "NPSv2", "OXNv3.1", "aMCHv1", "TAK861").

Additional rules:
- "TAK", "TAK 861", or any TAK variant is always "TAK861"
- "+" ALWAYS separates distinct peptides — split on "+" first, then parse each part independently (e.g. "TAK 861+NPS v5.2" -> ["TAK861", "NPSv5.2"])
- "Orexin" = "OXN", "OXA" = "OXNA", "OXB" = "OXNB"
- "+" separates distinct peptides
- Preserve case for peptide base (e.g. "aMCH" stays "aMCH")
- Strip dosages/units (e.g. "NPSv1-20/50/200nmol" -> "NPSv1")
- Ignore non-peptides: Placebo, Vehicle, Saline, Caffeine, PBS, TMC
- Skip purely descriptive names with no peptides (e.g. "Baseline Study")
- Compound names like "NPSv1-proKKv1" -> "NPSv1proKKv1"
- If a bare name like "NPS" appears alongside versioned forms, use the versioned form
- Freely floating numbers after a peptide name are version numbers, not doses (e.g. "OXN 2" -> "OXNv2", "NPS 3" -> "NPSv3"). This does NOT apply when the number has dosing units (e.g. "OXN 50nmol" — the 50 is a dose, not a version)
- "NPSVv1" is NOT a valid peptide — the correct name is "NPSv1"
- Return an empty array [] if no peptides are found
- Return ONLY the JSON array, nothing else"""


_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=os.environ.get("OPENAI_API_KEY", ""),
        )
    return _client


async def extract_peptides_from_name(experiment_name: str) -> list[str]:
    """Extract peptide identifiers from an experiment name using OpenAI."""
    client = _get_client()

    response = await client.chat.completions.create(
        model="gpt-5.2",
        max_completion_tokens=256,
        temperature=0,
        messages=[
            {
                "role": "user",
                "content": f"{EXTRACTION_PROMPT}\n\nExperiment name: {experiment_name}",
            }
        ],
    )

    text = (response.choices[0].message.content or "").strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    try:
        result = json.loads(text)
        if isinstance(result, list):
            return [str(p) for p in result if isinstance(p, str) and p.strip()]
    except json.JSONDecodeError:
        pass

    return []


async def run_sync_peptides_cron(limit: int | None = None):
    """
    Cron: call OpenAI to extract peptide identifiers from each experiment name
    (50 parallel requests), then batch upsert results to the peptides table.

    If limit is set, only process the N most recently started experiments.
    """
    supabase = get_supabase_admin()

    # 1. Fetch experiments
    query = supabase.table("experiments").select("id, name, experiment_start")
    if limit:
        query = query.order("experiment_start", desc=True).limit(limit)
    experiments_result = query.execute()
    experiments = experiments_result.data or []

    if not experiments:
        return {"success": True, "created": 0, "updated": 0, "message": "No experiments"}

    # 2. Extract peptides from each experiment name — 50 parallel requests
    sem = asyncio.Semaphore(50)

    async def extract_with_limit(exp: dict) -> tuple[dict, list[str]]:
        async with sem:
            peptides = await extract_peptides_from_name(exp["name"])
            return exp, peptides

    results = await asyncio.gather(
        *(extract_with_limit(exp) for exp in experiments)
    )

    # 3. Build peptide map
    peptide_map: dict[str, list[dict[str, str]]] = {}
    for exp, peptides in results:
        exp_id = exp["id"]
        exp_name = exp["name"]
        for pep in peptides:
            if pep not in peptide_map:
                peptide_map[pep] = []
            if not any(exp_id in entry.values() for entry in peptide_map[pep]):
                peptide_map[pep].append({exp_name: exp_id})

    if not peptide_map:
        return {"success": True, "created": 0, "updated": 0, "message": "No peptides found"}

    # 4. Fetch existing peptides
    existing_result = (
        supabase.table("peptides")
        .select("id, name, sequence, experiments")
        .execute()
    )
    existing_by_name = {row["name"]: row for row in (existing_result.data or [])}

    # 5. Single batch push: insert new, update existing
    to_insert = []
    to_update = []

    for pep_name, exp_list in peptide_map.items():
        if pep_name in existing_by_name:
            row = existing_by_name[pep_name]
            to_update.append({"id": row["id"], "experiments": exp_list})
        else:
            to_insert.append({
                "name": pep_name,
                "sequence": "",
                "experiments": exp_list,
            })

    if to_insert:
        supabase.table("peptides").insert(to_insert).execute()

    for row in to_update:
        supabase.table("peptides").update(
            {"experiments": row["experiments"]}
        ).eq("id", row["id"]).execute()

    return {
        "success": True,
        "created": len(to_insert),
        "updated": len(to_update),
        "total_peptides": len(peptide_map),
    }
