from __future__ import annotations

import asyncio
import concurrent.futures
import os

import modal

from api.database import get_supabase

MODAL_NOTES_APP_NAME = os.getenv(
    "MODAL_NOTES_APP_NAME",
    os.getenv("MODAL_SEQUENCE_APP_NAME", "capable-peptide-sequences"),
)
MODAL_NOTES_FUNCTION_NAME = os.getenv(
    "MODAL_NOTES_FUNCTION_NAME",
    "run_codex_for_peptide_notes",
)
NOTES_BACKFILL_MAX_PARALLEL = max(
    1,
    int(os.getenv("NOTES_BACKFILL_MAX_PARALLEL", "25")),
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
    return sorted(normalized_set)


def _run_backfill_peptide_notes_sync(
    peptide_ids: list[int] | None = None,
) -> dict[str, int | bool | str]:
    supabase = get_supabase()
    target_ids = _normalize_target_ids(peptide_ids)

    query = supabase.table("peptides").select("id, name, notes")
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

        if str(row.get("notes") or "").strip():
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
            MODAL_NOTES_APP_NAME,
            MODAL_NOTES_FUNCTION_NAME,
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

    def process_one_result(result: dict[str, object]) -> None:
        nonlocal updated, skipped, failed, first_error

        try:
            peptide_id = int(result.get("peptide_id"))
        except Exception:
            failed += 1
            if not first_error:
                first_error = "Malformed Modal result payload"
            return

        if str(result.get("status") or "") != "ok":
            failed += 1
            error_text = str(result.get("error") or "Modal worker failed")
            if not first_error:
                first_error = error_text
            return

        notes = str(result.get("notes") or "").strip()
        if not notes:
            skipped += 1
            return

        try:
            write_result = (
                supabase.table("peptides")
                .update({"notes": notes})
                .eq("id", peptide_id)
                .execute()
            )
            if write_result.data:
                updated += 1
            else:
                failed += 1
                message = f"DB update returned no row for peptide {peptide_id}"
                if not first_error:
                    first_error = message
        except Exception:
            failed += 1
            message = f"DB update failed for peptide {peptide_id}"
            if not first_error:
                first_error = message

    max_workers = min(NOTES_BACKFILL_MAX_PARALLEL, len(jobs))
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_job = {
            executor.submit(fn.remote, job): job
            for job in jobs
        }

        for future in concurrent.futures.as_completed(future_to_job):
            job = future_to_job[future]
            try:
                result = future.result()
            except Exception as exc:
                failed += 1
                if not first_error:
                    peptide_id = job.get("peptide_id")
                    first_error = (
                        f"Modal call failed for peptide {peptide_id}: {exc}"
                    )
                continue
            process_one_result(result)

    if failed > 0 and updated == 0 and skipped == 0:
        return {
            "success": False,
            "updated": updated,
            "skipped": skipped,
            "failed": failed,
            "total_considered": len(rows),
            "total_submitted": len(jobs),
            "error": first_error or "All peptide notes jobs failed",
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


async def run_backfill_peptide_notes(
    peptide_ids: list[int] | None = None,
) -> dict[str, int | bool | str]:
    return await asyncio.to_thread(
        _run_backfill_peptide_notes_sync,
        peptide_ids,
    )
