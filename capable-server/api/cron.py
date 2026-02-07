import os
import re
import html
import asyncio
import hashlib
import httpx
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import unquote

from api.database import get_supabase_admin

OLDEN_LABS_BASE_URL = "https://oldenlabs.com:8000"
OLDEN_LABS_EMAIL = os.getenv("OLDEN_LABS_EMAIL", "")
OLDEN_LABS_PASSWORD = os.getenv("OLDEN_LABS_PASSWORD", "")
MODAL_UPLOAD_URL = os.getenv("MODAL_UPLOAD_URL", "")
MODAL_DOWNLOAD_URL = os.getenv("MODAL_DOWNLOAD_URL", "")
MODAL_STORAGE_KEY = os.getenv("MODAL_STORAGE_KEY", "")


def hash_link(link: str) -> str:
    return hashlib.sha256(link.encode()).hexdigest()


@dataclass
class ParsedNotification:
    study_name: str | None
    s3_url: str | None
    interval_from: str | None
    interval_to: str | None
    bin_time: str | None


def parse_notification(text: str) -> ParsedNotification:
    """
    Parse an Olden Labs notification string.

    Example input:
      Dear Helena, The Excel data for Study NPSv9.36
      dose-response (10, 30, 100, 300 ug IN) you requested
      is now ready for download. Interval: 02/04/2026 23:01
      - 02/06/2026 16:33. Bin time: 1 hour. You can access
      the download link sent to your email or click on
      <a href='https://olden-user-downloads.s3.amazonaws.com/
      downloads/NPSv9.36_...xlsx?AWSAccessKeyId=...&...'>
    """
    # Study name: between "Study " and " you requested"
    name_match = re.search(
        r"Study\s+(.+?)\s+you requested", text, re.IGNORECASE
    )
    study_name = name_match.group(1).strip() if name_match else None

    # S3 URL: inside href='...' of <a> tag
    # html.unescape handles &amp; -> & in case the URL is HTML-encoded
    href_match = re.search(r"href=['\"]([^'\"]+)['\"]", text)
    s3_url = html.unescape(href_match.group(1)) if href_match else None

    # Interval: "Interval: MM/DD/YYYY HH:MM - MM/DD/YYYY HH:MM"
    interval_match = re.search(
        r"Interval:\s*(\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2})"
        r"\s*-\s*"
        r"(\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2})",
        text,
    )
    interval_from = interval_match.group(1) if interval_match else None
    interval_to = interval_match.group(2) if interval_match else None

    # Bin time: "Bin time: <value>."
    bin_match = re.search(r"Bin time:\s*([^.]+)", text, re.IGNORECASE)
    bin_time = bin_match.group(1).strip() if bin_match else None

    return ParsedNotification(
        study_name=study_name,
        s3_url=s3_url,
        interval_from=interval_from,
        interval_to=interval_to,
        bin_time=bin_time,
    )


def build_label(parsed: ParsedNotification) -> str:
    """Build a human-readable label from parsed notification data.

    Example output: "Jan 3 - Feb 6, 1 hour bin time, 34 days"
    """
    parts = []
    duration_str = ""
    if parsed.interval_from and parsed.interval_to:
        try:
            dt_from = datetime.strptime(parsed.interval_from, "%m/%d/%Y %H:%M")
            dt_to = datetime.strptime(parsed.interval_to, "%m/%d/%Y %H:%M")
            parts.append(
                f"{dt_from.strftime('%b %-d, %Y')} - "
                f"{dt_to.strftime('%b %-d, %Y')}"
            )
            delta = dt_to - dt_from
            total_hours = delta.total_seconds() / 3600
            if total_hours >= 24:
                days = round(total_hours / 24)
                duration_str = f"{days} day{'s' if days != 1 else ''}"
            else:
                hours = round(total_hours)
                duration_str = f"{hours} hour{'s' if hours != 1 else ''}"
        except ValueError:
            parts.append(f"{parsed.interval_from} - {parsed.interval_to}")
    if parsed.bin_time:
        parts.append(f"{parsed.bin_time} bin time")
    if duration_str:
        parts.append(duration_str)
    if parts:
        return ", ".join(parts)
    return "Data Export"


def filename_from_s3_url(s3_url: str) -> str:
    path = s3_url.split("?")[0]
    name = unquote(path.split("/")[-1])
    if not name or "." not in name:
        return "export.xlsx"
    # Sanitize: replace chars that may cause storage issues
    name = re.sub(r"[(),]", "_", name)
    name = re.sub(r"__+", "_", name)  # collapse multiple underscores
    return name


async def run_sync_studies_cron():
    """
    Cron: fetch all studies from Olden Labs, compare against existing
    experiments, and create new experiments for any unsynced studies.
    """
    if not OLDEN_LABS_EMAIL or not OLDEN_LABS_PASSWORD:
        return {
            "success": False,
            "error": "OLDEN_LABS_EMAIL/PASSWORD not configured",
        }

    supabase = get_supabase_admin()

    async with httpx.AsyncClient(timeout=30) as client:
        # 1. Login to Olden Labs
        login_res = await client.post(
            f"{OLDEN_LABS_BASE_URL}/user/login",
            json={"email": OLDEN_LABS_EMAIL, "password": OLDEN_LABS_PASSWORD},
        )
        if login_res.status_code != 200:
            return {
                "success": False,
                "error": f"OL login failed: {login_res.status_code}",
            }
        token = login_res.json().get("data", {}).get("accessToken")
        if not token:
            return {"success": False, "error": "OL login returned no token"}

        ol_headers = {"Cookie": f"olden_labs={token}"}

        # 2. Fetch all studies
        studies_res = await client.get(
            f"{OLDEN_LABS_BASE_URL}/study-monitoring/ol-study-list",
            headers=ol_headers,
        )
        if studies_res.status_code != 200:
            return {
                "success": False,
                "error": f"OL studies fetch failed: {studies_res.status_code}",
            }

        studies = studies_res.json()
        if not isinstance(studies, list) or not studies:
            return {
                "success": True,
                "created": 0,
                "message": "No studies found",
            }

        # 3. Load existing experiments to find already-imported study IDs
        experiments_result = (
            supabase.table("experiments")
            .select("id, olden_labs_study_id")
            .execute()
        )
        existing_study_ids = {
            exp["olden_labs_study_id"]
            for exp in (experiments_result.data or [])
            if exp.get("olden_labs_study_id") is not None
        }

        new_studies = [
            s for s in studies if s.get("id") not in existing_study_ids
        ]
        if not new_studies:
            return {
                "success": True,
                "created": 0,
                "message": "All studies already synced",
            }

        created = []
        errors = []

        for study in new_studies:
            try:
                study_id = study["id"]
                groups = None

                # Fetch groups and cages for this study
                try:
                    detail_res, cages_res = await asyncio.gather(
                        client.get(
                            f"{OLDEN_LABS_BASE_URL}/study-monitoring/{study_id}/with-group-list",
                            headers=ol_headers,
                        ),
                        client.get(
                            f"{OLDEN_LABS_BASE_URL}/study-monitoring/ol-group-list-with-cages-by-study-id/{study_id}",
                            headers=ol_headers,
                        ),
                    )

                    if (
                        detail_res.status_code == 200
                        and cages_res.status_code == 200
                    ):
                        study_data = detail_res.json()
                        cages_data = cages_res.json()

                        # Build cage map: group id -> device UIDs
                        cages_by_group = {}
                        for cg in (
                            cages_data if isinstance(cages_data, list) else []
                        ):
                            cages_by_group[cg["id"]] = [
                                c["device_uid"]
                                for c in (cg.get("cage_list") or [])
                                if c.get("device_uid")
                            ]

                        group_list = study_data.get("groupList") or []
                        # Fall back to cages endpoint when groupList is empty
                        if not group_list and isinstance(cages_data, list):
                            group_list = cages_data
                        groups = [
                            {
                                "name": g.get("name", ""),
                                "group_id": str(g.get("id", "")),
                                "group_name": g.get("code", ""),
                                "num_cages": g.get("number_of_cages"),
                                "num_animals": g.get("number_of_mice"),
                                "cage_ids": cages_by_group.get(g["id"], []),
                                "treatment": g.get("treatment", ""),
                                "species": g.get("species", ""),
                                "strain": g.get("strain", ""),
                                "dob": g.get("date_of_birth", ""),
                                "sex": g.get("sex", ""),
                            }
                            for g in group_list
                        ]
                except Exception:
                    pass  # Continue without groups

                # Format experiment_start from study create_date
                create_date = study.get("create_date") or ""
                experiment_start = create_date[:16] if create_date else None

                study_name = study.get("name") or f"Study {study_id}"
                exp_data = {
                    "name": study_name,
                    "olden_labs_original_name": study_name,
                    "description": study.get("description"),
                    "organism_type": "Mice",
                    "olden_labs_study_id": study_id,
                }
                if experiment_start:
                    exp_data["experiment_start"] = experiment_start
                if groups:
                    exp_data["groups"] = groups

                supabase.table("experiments").insert(exp_data).execute()
                created.append(exp_data["name"])

            except Exception as e:
                errors.append(
                    f"Failed to create study {study.get('name', '?')}: {e}"
                )

    return {
        "success": True,
        "created": len(created),
        "created_names": created,
        "errors": errors if errors else None,
    }


async def run_pickup_cron():
    """
    Cron: fetch OL notifications, deduplicate via hashed_links,
    download new Excel files, upload to Modal persistent storage,
    and update experiment generated_links.
    """
    if not OLDEN_LABS_EMAIL or not OLDEN_LABS_PASSWORD:
        return {
            "success": False,
            "error": "OLDEN_LABS_EMAIL/PASSWORD not configured",
        }

    if not MODAL_UPLOAD_URL or not MODAL_DOWNLOAD_URL or not MODAL_STORAGE_KEY:
        return {
            "success": False,
            "error": "MODAL_UPLOAD_URL/DOWNLOAD_URL/STORAGE_KEY not configured",
        }

    supabase = get_supabase_admin()

    async with httpx.AsyncClient(timeout=30) as client:
        # 1. Login to Olden Labs to get a fresh token
        login_res = await client.post(
            f"{OLDEN_LABS_BASE_URL}/user/login",
            json={"email": OLDEN_LABS_EMAIL, "password": OLDEN_LABS_PASSWORD},
        )
        if login_res.status_code != 200:
            return {
                "success": False,
                "error": f"OL login failed: {login_res.status_code}",
            }
        token = login_res.json().get("data", {}).get("accessToken")
        if not token:
            return {"success": False, "error": "OL login returned no token"}

        # 2. Fetch notifications
        res = await client.get(
            f"{OLDEN_LABS_BASE_URL}/notification/all",
            headers={"Cookie": f"olden_labs={token}"},
        )
        if res.status_code != 200:
            return {
                "success": False,
                "error": f"OL notification fetch failed: {res.status_code}",
            }

        notifications = res.json()
        if not isinstance(notifications, list) or not notifications:
            return {
                "success": True,
                "processed": 0,
                "message": "No notifications",
            }

        # 2. Load experiments for name matching
        experiments_result = (
            supabase.table("experiments")
            .select("id, name, olden_labs_original_name, generated_links")
            .execute()
        )
        exp_by_name = {}
        exp_by_original_name = {}
        for exp in experiments_result.data or []:
            exp_by_name[exp["name"].lower().strip()] = exp
            original = exp.get("olden_labs_original_name")
            if original:
                exp_by_original_name[original.lower().strip()] = exp

        processed = 0
        errors = []

        for notification in notifications:
            try:
                # Notifications are JSON objects with a "message" field
                if isinstance(notification, dict):
                    text = notification.get("message", "")
                elif isinstance(notification, str):
                    text = notification
                else:
                    continue
                if not text:
                    continue

                parsed = parse_notification(text)
                if not parsed.s3_url or not parsed.study_name:
                    continue

                # 3. Deduplicate via hashed_links table
                link_hash = hash_link(parsed.s3_url)
                existing = (
                    supabase.table("hashed-links")
                    .select("id")
                    .eq("link", link_hash)
                    .execute()
                )
                if existing.data:
                    continue

                # 4. Match to experiment by name, fall back to original OL name
                study_key = parsed.study_name.lower().strip()
                exp = exp_by_name.get(study_key) or exp_by_original_name.get(study_key)
                if not exp:
                    continue

                experiment_id = exp["id"]

                # 5. Download Excel from S3
                file_res = await client.get(parsed.s3_url, timeout=120)
                if file_res.status_code != 200:
                    # Record hash so we don't retry expired links every cron run
                    supabase.table("hashed-links").insert(
                        {
                            "link": link_hash,
                            "experiment_id": experiment_id,
                            "s3_url": parsed.s3_url,
                            "created_at": datetime.now(
                                timezone.utc
                            ).isoformat(),
                        }
                    ).execute()
                    errors.append(f"S3 download failed for {parsed.study_name}")
                    continue

                filename = filename_from_s3_url(parsed.s3_url)
                storage_path = f"{experiment_id}/{filename}"

                # 6. Upload to Modal persistent storage
                upload_res = await client.post(
                    MODAL_UPLOAD_URL,
                    params={"path": storage_path},
                    content=file_res.content,
                    headers={
                        "Content-Type": (
                            "application/vnd.openxmlformats-"
                            "officedocument.spreadsheetml.sheet"
                        ),
                        "Authorization": f"Bearer {MODAL_STORAGE_KEY}",
                    },
                    timeout=120,
                )
                if upload_res.status_code != 200:
                    errors.append(
                        f"Modal upload failed for {parsed.study_name}: "
                        f"{upload_res.status_code}"
                    )
                    continue

                public_url = f"/api/files?path={storage_path}"

                # 7. Append to generated_links on experiment row
                # Re-read to avoid stale data if multiple notifications
                # match the same experiment in one cron run
                fresh = (
                    supabase.table("experiments")
                    .select("generated_links")
                    .eq("id", experiment_id)
                    .execute()
                )
                current_links = (
                    fresh.data[0].get("generated_links") or []
                    if fresh.data
                    else []
                )
                label = build_label(parsed)
                updated_links = current_links + [{label: public_url}]

                supabase.table("experiments").update(
                    {"generated_links": updated_links}
                ).eq("id", experiment_id).execute()

                # 8. Record hash so we don't reprocess
                supabase.table("hashed-links").insert(
                    {
                        "link": link_hash,
                        "experiment_id": experiment_id,
                        "s3_url": parsed.s3_url,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    }
                ).execute()

                processed += 1

            except Exception as e:
                errors.append(str(e))

    return {
        "success": True,
        "processed": processed,
        "errors": errors if errors else None,
    }
