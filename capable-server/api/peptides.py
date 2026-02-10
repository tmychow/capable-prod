import asyncio
import json
import os
import re

from openai import AsyncOpenAI

from api.database import get_supabase_admin
from api.peptide_sequences import run_backfill_peptide_sequences


EXTRACTION_PROMPT = """\
Extract peptide identifiers from this experiment name. Return a JSON array of peptide name strings.

Peptides are of the form: OXNv3.1 i.e. version number if available. We mostly look at orexin and NPS. Orexins are OXNB if not stated otherwise.

Don't use hyphens and underscores. Keep version numbers attached to compound names with no spaces (e.g. "NPSv2", "OXNv3.1", "aMCHv1", "TAK861").

Additional rules:
- "TAK", "TAK 861", or any TAK variant is always "TAK861"
- "+" ALWAYS separates distinct peptides — split on "+" first, then parse each part independently (e.g. "TAK 861+NPS v5.2" -> ["TAK861", "NPSv5.2"])
- "Orexin" = "OXN", "OXA" = "OXNA", "OXB" = "OXNB"
- "NXN" peptides (e.g. "NXNv6") are NPS/OXN chimeras — keep them as "NXN" (do NOT split into NPS + OXN)
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


def _normalize_peptide_names(value: object) -> list[str]:
    """Normalize peptide arrays for deterministic comparison and storage."""
    if not isinstance(value, list):
        return []
    unique = {item.strip() for item in value if isinstance(item, str) and item.strip()}
    return sorted(unique, key=str.lower)


def _normalize_experiment_links(value: object) -> list[dict[str, str]]:
    """Normalize peptide.experiments into [{experiment_name: experiment_id}] records."""
    if not isinstance(value, list):
        return []

    normalized: list[dict[str, str]] = []
    seen_ids: set[str] = set()

    for entry in value:
        if not isinstance(entry, dict):
            continue
        for exp_name, exp_id_raw in entry.items():
            exp_id = str(exp_id_raw or "").strip()
            name = str(exp_name or "").strip()
            if not exp_id or exp_id in seen_ids:
                continue
            normalized.append({name: exp_id})
            seen_ids.add(exp_id)

    return normalized


def _extract_experiment_ids_from_links(value: object) -> set[str]:
    ids: set[str] = set()
    for entry in _normalize_experiment_links(value):
        ids.update(entry.values())
    return ids


async def _run_experiment_peptides_backfill(
    experiment_ids: list[str] | None = None,
) -> dict[str, int | bool | str]:
    """Recompute experiments.peptides from peptide.experiments links."""
    supabase = get_supabase_admin()

    peptides_result = (
        supabase.table("peptides")
        .select("name, experiments")
        .execute()
    )
    peptide_rows = peptides_result.data or []

    target_ids = (
        sorted({str(exp_id).strip() for exp_id in (experiment_ids or []) if str(exp_id).strip()})
        if experiment_ids is not None
        else None
    )

    experiments_query = supabase.table("experiments").select("id, peptides")
    if target_ids is not None:
        if not target_ids:
            return {
                "success": True,
                "updated_experiments": 0,
                "unchanged_experiments": 0,
                "cleared_experiments": 0,
                "total_experiments": 0,
                "total_peptides": len(peptide_rows),
                "unresolved_links": 0,
                "targeted": True,
                "message": "No target experiment IDs provided",
            }
        experiments_query = experiments_query.in_("id", target_ids)

    experiments_result = experiments_query.execute()
    experiment_rows = experiments_result.data or []

    if not experiment_rows:
        return {
            "success": True,
            "updated_experiments": 0,
            "unchanged_experiments": 0,
            "cleared_experiments": 0,
            "total_experiments": 0,
            "total_peptides": len(peptide_rows),
            "unresolved_links": 0,
            "targeted": target_ids is not None,
            "message": "No experiments found",
        }

    peptides_by_experiment: dict[str, set[str]] = {
        str(row["id"]): set() for row in experiment_rows if row.get("id")
    }
    unresolved_links = 0

    for peptide in peptide_rows:
        peptide_name = str(peptide.get("name") or "").strip()
        if not peptide_name:
            continue

        links = peptide.get("experiments")
        for exp_id in _extract_experiment_ids_from_links(links):
            if exp_id in peptides_by_experiment:
                peptides_by_experiment[exp_id].add(peptide_name)
            elif target_ids is None:
                unresolved_links += 1

    updated_experiments = 0
    unchanged_experiments = 0
    cleared_experiments = 0

    for experiment in experiment_rows:
        exp_id = str(experiment["id"])
        current = _normalize_peptide_names(experiment.get("peptides"))
        expected = sorted(peptides_by_experiment.get(exp_id, set()), key=str.lower)

        if current == expected:
            unchanged_experiments += 1
            continue

        supabase.table("experiments").update(
            {"peptides": expected if expected else None}
        ).eq("id", exp_id).execute()
        updated_experiments += 1
        if not expected:
            cleared_experiments += 1

    return {
        "success": True,
        "updated_experiments": updated_experiments,
        "unchanged_experiments": unchanged_experiments,
        "cleared_experiments": cleared_experiments,
        "total_experiments": len(experiment_rows),
        "total_peptides": len(peptide_rows),
        "unresolved_links": unresolved_links,
        "targeted": target_ids is not None,
    }


async def sync_experiment_peptides_for_experiment_ids(
    experiment_ids: list[str],
) -> dict[str, int | bool | str]:
    """Keep experiments.peptides in sync for a subset of experiment IDs."""
    return await _run_experiment_peptides_backfill(experiment_ids=experiment_ids)


async def run_backfill_experiment_peptides():
    """
    Backfill experiments.peptides using peptide.experiments relationships.

    This is useful when peptide links exist only in the peptides table and
    experiment rows have missing or stale peptides arrays.
    """
    return await _run_experiment_peptides_backfill()


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

    processed_experiment_ids = {
        str(exp["id"]).strip()
        for exp in experiments
        if exp.get("id")
    }

    # 2. Extract peptides from each experiment name — 50 parallel requests
    sem = asyncio.Semaphore(50)

    async def extract_with_limit(exp: dict) -> tuple[dict, list[str]]:
        async with sem:
            peptides = await extract_peptides_from_name(exp["name"])
            return exp, peptides

    results = await asyncio.gather(
        *(extract_with_limit(exp) for exp in experiments)
    )

    # 3. Build peptide map (peptide_name -> {experiment_id: experiment_name})
    peptide_map: dict[str, dict[str, str]] = {}
    for exp, peptides in results:
        exp_id = str(exp["id"]).strip()
        exp_name = str(exp["name"] or "").strip()
        if not exp_id:
            continue
        for pep in peptides:
            pep_name = str(pep).strip()
            if not pep_name:
                continue
            peptide_map.setdefault(pep_name, {})[exp_id] = exp_name

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

    for pep_name, exp_lookup in peptide_map.items():
        exp_list = [
            {exp_name: exp_id}
            for exp_id, exp_name in sorted(exp_lookup.items(), key=lambda item: item[1].lower())
        ]
        if pep_name in existing_by_name:
            row = existing_by_name[pep_name]
            updated_links = exp_list
            if limit is not None:
                # Partial sync should not erase links for experiments outside this run.
                existing_links = _normalize_experiment_links(row.get("experiments"))
                seen_ids = {exp_id for entry in exp_list for exp_id in entry.values()}
                preserved_links = []
                for entry in existing_links:
                    exp_id = next(iter(entry.values()))
                    if exp_id in processed_experiment_ids or exp_id in seen_ids:
                        continue
                    preserved_links.append(entry)
                    seen_ids.add(exp_id)
                updated_links = preserved_links + exp_list
            to_update.append({"id": row["id"], "experiments": updated_links})
        else:
            to_insert.append({
                "name": pep_name,
                "sequence": "",
                "experiments": exp_list,
            })

    created_ids: list[int] = []
    if to_insert:
        insert_result = supabase.table("peptides").insert(to_insert).execute()
        for row in insert_result.data or []:
            try:
                created_ids.append(int(row["id"]))
            except Exception:
                continue

    for row in to_update:
        supabase.table("peptides").update(
            {"experiments": row["experiments"]}
        ).eq("id", row["id"]).execute()

    if created_ids:
        try:
            await run_backfill_peptide_sequences(peptide_ids=created_ids)
        except Exception:
            # Avoid failing peptide sync if sequence backfill fails.
            pass

    # Keep experiments.peptides synchronized for processed experiments.
    backfill_result = await sync_experiment_peptides_for_experiment_ids(
        list(processed_experiment_ids)
    )

    return {
        "success": True,
        "created": len(to_insert),
        "updated": len(to_update),
        "total_peptides": len(peptide_map),
        "updated_experiments": backfill_result.get("updated_experiments", 0),
    }
