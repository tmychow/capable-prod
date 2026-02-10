from __future__ import annotations

import asyncio
import os

import modal

from api.database import get_supabase_admin

MODAL_SEQUENCE_APP_NAME = os.getenv(
    "MODAL_SEQUENCE_APP_NAME",
    "capable-peptide-sequences",
)
MODAL_SEQUENCE_FUNCTION_NAME = os.getenv(
    "MODAL_SEQUENCE_FUNCTION_NAME",
    "run_codex_for_peptide",
)


def _normalize_target_ids(peptide_ids: list[int] | None) -> list[int] | None:
    if peptide_ids is None:
        return None
    normalized_set: set[int] = set()
    for peptide_id in peptide_ids:
        try:
            value = int(peptide_id)
        except Exception:
            continue
        if value > 0:
            normalized_set.add(value)
    normalized = sorted(normalized_set)
    return normalized


def _run_backfill_peptide_sequences_sync(
    peptide_ids: list[int] | None = None,
) -> dict[str, int | bool | str]:
    supabase = get_supabase_admin()
    target_ids = _normalize_target_ids(peptide_ids)

    query = supabase.table("peptides").select("id, name, sequence")
    if target_ids is not None:
        if not target_ids:
            return {
                "success": True,
                "updated": 0,
                "skipped": 0,
                "failed": 0,
                "total_considered": 0,
                "total_submitted": 0,
                "message": "No peptide IDs provided",
            }
        query = query.in_("id", target_ids)

    rows = query.execute().data or []
    if not rows:
        return {
            "success": True,
            "updated": 0,
            "skipped": 0,
            "failed": 0,
            "total_considered": 0,
            "total_submitted": 0,
            "message": "No peptides found",
        }

    updated = 0
    skipped = 0
    failed = 0
    first_error = ""
    jobs: list[dict[str, object]] = []

    for row in rows:
        peptide_id_raw = row.get("id")
        peptide_name = str(row.get("name") or "").strip()
        if peptide_id_raw is None:
            failed += 1
            continue
        peptide_id = int(peptide_id_raw)

        if str(row.get("sequence") or "").strip():
            skipped += 1
            continue
        if not peptide_name:
            failed += 1
            continue

        jobs.append({"peptide_id": peptide_id, "name": peptide_name})

    if not jobs:
        return {
            "success": True,
            "updated": updated,
            "skipped": skipped,
            "failed": failed,
            "total_considered": len(rows),
            "total_submitted": 0,
        }

    try:
        fn = modal.Function.from_name(
            MODAL_SEQUENCE_APP_NAME,
            MODAL_SEQUENCE_FUNCTION_NAME,
        )
    except Exception as exc:
        return {
            "success": False,
            "updated": updated,
            "skipped": skipped,
            "failed": failed + len(jobs),
            "total_considered": len(rows),
            "total_submitted": len(jobs),
            "error": str(exc),
        }

    for job in jobs:
        try:
            result = fn.remote(job)
        except Exception as exc:
            failed += 1
            if not first_error:
                first_error = str(exc)
            continue

        try:
            peptide_id = int(result.get("peptide_id"))
        except Exception:
            failed += 1
            if not first_error:
                first_error = "Malformed Modal result payload"
            continue

        if str(result.get("status") or "") != "ok":
            failed += 1
            if not first_error:
                first_error = str(result.get("error") or "Modal worker failed")
            continue

        sequence = str(result.get("sequence") or "").strip()
        if not sequence:
            skipped += 1
            continue

        try:
            write_result = (
                supabase.table("peptides")
                .update({"sequence": sequence})
                .eq("id", peptide_id)
                .execute()
            )
            if write_result.data:
                updated += 1
            else:
                failed += 1
                if not first_error:
                    first_error = f"DB update returned no row for peptide {peptide_id}"
        except Exception:
            failed += 1
            if not first_error:
                first_error = f"DB update failed for peptide {peptide_id}"

    if failed > 0 and updated == 0 and skipped == 0:
        return {
            "success": False,
            "updated": updated,
            "skipped": skipped,
            "failed": failed,
            "total_considered": len(rows),
            "total_submitted": len(jobs),
            "error": first_error or "All peptide sequence jobs failed",
        }

    return {
        "success": True,
        "updated": updated,
        "skipped": skipped,
        "failed": failed,
        "total_considered": len(rows),
        "total_submitted": len(jobs),
        "error": first_error or None,
    }


async def run_backfill_peptide_sequences(
    peptide_ids: list[int] | None = None,
) -> dict[str, int | bool | str]:
    return await asyncio.to_thread(
        _run_backfill_peptide_sequences_sync,
        peptide_ids,
    )
