"""Standalone script to download Notion pages and upload to Modal volume.

Usage:
    NOTION_API_KEY=secret NOTION_PAGE_IDS=id1,id2 python sync_notion_to_modal.py

Or with arguments:
    python sync_notion_to_modal.py --api-key secret --page-ids id1 id2 id3

Run on a loop (e.g. every hour in tmux):
    python sync_notion_to_modal.py --api-key secret --page-ids id1 id2 --loop 3600
"""

from __future__ import annotations

import argparse
import os
import re
import tempfile
import time
from datetime import datetime
from pathlib import Path

import httpx
import modal

NOTION_API_BASE = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"
REQUEST_DELAY = 0.35
MAX_RECURSION_DEPTH = 6


def _headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def _extract_rich_text(rich_text: list[dict]) -> str:
    parts: list[str] = []
    for rt in rich_text:
        text = rt.get("plain_text", "")
        annotations = rt.get("annotations", {})
        if annotations.get("code"):
            text = f"`{text}`"
        if annotations.get("bold"):
            text = f"**{text}**"
        if annotations.get("italic"):
            text = f"_{text}_"
        if annotations.get("strikethrough"):
            text = f"~~{text}~~"
        href = rt.get("href")
        if href:
            text = f"[{text}]({href})"
        parts.append(text)
    return "".join(parts)


def _block_to_markdown(block: dict, indent: int = 0) -> list[str]:
    btype = block.get("type", "")
    data = block.get(btype, {})
    prefix = "  " * indent
    lines: list[str] = []

    rich = data.get("rich_text", [])
    text = _extract_rich_text(rich) if rich else ""

    if btype in ("paragraph",):
        lines.append(f"{prefix}{text}")
    elif btype == "heading_1":
        lines.append(f"# {text}")
    elif btype == "heading_2":
        lines.append(f"## {text}")
    elif btype == "heading_3":
        lines.append(f"### {text}")
    elif btype == "bulleted_list_item":
        lines.append(f"{prefix}- {text}")
    elif btype == "numbered_list_item":
        lines.append(f"{prefix}1. {text}")
    elif btype == "to_do":
        checked = data.get("checked", False)
        marker = "[x]" if checked else "[ ]"
        lines.append(f"{prefix}- {marker} {text}")
    elif btype == "code":
        lang = data.get("language", "")
        lines.append(f"{prefix}```{lang}")
        lines.append(f"{prefix}{text}")
        lines.append(f"{prefix}```")
    elif btype == "quote":
        for line in text.split("\n"):
            lines.append(f"{prefix}> {line}")
    elif btype == "callout":
        icon = data.get("icon", {}).get("emoji", "")
        lines.append(f"{prefix}> {icon} {text}")
    elif btype == "divider":
        lines.append(f"{prefix}---")
    elif btype == "image":
        img = data.get("file", {}) or data.get("external", {})
        url = img.get("url", "")
        caption = _extract_rich_text(data.get("caption", []))
        lines.append(f"{prefix}![{caption}]({url})")
    elif btype == "table_row":
        cells = data.get("cells", [])
        row = " | ".join(_extract_rich_text(cell) for cell in cells)
        lines.append(f"{prefix}| {row} |")
    elif btype == "child_page":
        title = data.get("title", "Untitled")
        lines.append(f"{prefix}## {title}")
    else:
        if text:
            lines.append(f"{prefix}{text}")

    children = block.get("_children", [])
    for child in children:
        child_indent = indent + 1 if btype in ("bulleted_list_item", "numbered_list_item", "toggle") else indent
        lines.extend(_block_to_markdown(child, child_indent))

    return lines


def fetch_blocks_recursive(
    client: httpx.Client, api_key: str, block_id: str, depth: int = 0
) -> list[dict]:
    if depth > MAX_RECURSION_DEPTH:
        return []

    blocks: list[dict] = []
    cursor: str | None = None

    while True:
        params: dict[str, str] = {"page_size": "100"}
        if cursor:
            params["start_cursor"] = cursor

        time.sleep(REQUEST_DELAY)
        resp = client.get(
            f"{NOTION_API_BASE}/blocks/{block_id}/children",
            headers=_headers(api_key),
            params=params,
        )
        if resp.status_code != 200:
            print(f"  Warning: failed to fetch blocks for {block_id}: {resp.status_code}")
            break

        data = resp.json()
        for block in data.get("results", []):
            if block.get("has_children"):
                block["_children"] = fetch_blocks_recursive(
                    client, api_key, block["id"], depth + 1
                )
            blocks.append(block)

        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")

    return blocks


def fetch_page_title(client: httpx.Client, api_key: str, page_id: str) -> str:
    time.sleep(REQUEST_DELAY)
    resp = client.get(
        f"{NOTION_API_BASE}/pages/{page_id}",
        headers=_headers(api_key),
    )
    if resp.status_code != 200:
        return page_id

    props = resp.json().get("properties", {})
    for prop in props.values():
        if prop.get("type") == "title":
            title_parts = prop.get("title", [])
            return _extract_rich_text(title_parts) or page_id
    return page_id


def sanitize_filename(name: str) -> str:
    name = re.sub(r"[^\w\s\-]", "", name)
    name = re.sub(r"\s+", "_", name.strip())
    return name[:80] if name else "untitled"


def blocks_to_markdown(title: str, blocks: list[dict]) -> str:
    lines = [f"# {title}", ""]
    for block in blocks:
        lines.extend(_block_to_markdown(block))
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download Notion pages and upload as markdown to a Modal volume."
    )
    parser.add_argument(
        "--api-key",
        type=str,
        default=os.getenv("NOTION_API_KEY", ""),
        help="Notion API integration token (or set NOTION_API_KEY env var).",
    )
    parser.add_argument(
        "--page-ids",
        nargs="+",
        default=None,
        help="Notion page IDs to download (or set NOTION_PAGE_IDS env var, comma-separated).",
    )
    parser.add_argument(
        "--volume-name",
        type=str,
        default=os.getenv("DATA_LAKE_VOLUME_NAME", "capable-data-lake"),
        help="Modal volume name.",
    )
    parser.add_argument(
        "--loop",
        type=int,
        default=0,
        help="Run repeatedly with this interval in seconds (e.g. 3600 for hourly). 0 = run once.",
    )
    args = parser.parse_args()

    api_key = args.api_key
    if not api_key:
        raise SystemExit("Notion API key required. Use --api-key or set NOTION_API_KEY.")

    page_ids = args.page_ids
    if not page_ids:
        raw = os.getenv("NOTION_PAGE_IDS", "")
        page_ids = [pid.strip() for pid in raw.split(",") if pid.strip()]
    if not page_ids:
        raise SystemExit("No page IDs provided. Use --page-ids or set NOTION_PAGE_IDS.")

    def sync_once() -> None:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"\n[{now}] Syncing {len(page_ids)} Notion page(s) to Modal volume '{args.volume_name}'...")

        with tempfile.TemporaryDirectory() as tmp_dir:
            file_pairs: list[tuple[str, str]] = []

            with httpx.Client(timeout=30) as client:
                for page_id in page_ids:
                    print(f"  Fetching page {page_id}...")
                    try:
                        title = fetch_page_title(client, api_key, page_id)
                        print(f"    Title: {title}")
                        blocks = fetch_blocks_recursive(client, api_key, page_id)
                        print(f"    Blocks: {len(blocks)}")
                        md = blocks_to_markdown(title, blocks)

                        filename = f"{sanitize_filename(title)}_{page_id[:8]}.md"
                        local_path = str(Path(tmp_dir) / filename)
                        with open(local_path, "w") as f:
                            f.write(md)

                        file_pairs.append((local_path, f"/notion/{filename}"))
                    except Exception as e:
                        print(f"    Error: {e}")

            if not file_pairs:
                print("No pages downloaded successfully.")
                return

            print(f"Uploading {len(file_pairs)} file(s) to Modal volume...")
            volume = modal.Volume.from_name(args.volume_name, create_if_missing=True)
            with volume.batch_upload(force=True) as batch:
                for local_path, remote_path in file_pairs:
                    batch.put_file(local_path, remote_path)

            print(f"Done. Uploaded {len(file_pairs)} file(s).")

    sync_once()

    if args.loop > 0:
        print(f"\nLooping every {args.loop}s. Press Ctrl+C to stop.")
        while True:
            time.sleep(args.loop)
            try:
                sync_once()
            except Exception as e:
                print(f"Error during sync: {e}")


if __name__ == "__main__":
    main()
