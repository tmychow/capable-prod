from __future__ import annotations

import argparse
from pathlib import Path

import modal


def iter_files(root: Path) -> list[Path]:
    return [path for path in root.rglob("*") if path.is_file()]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="One-off upload of local_datalake to a Modal volume."
    )
    parser.add_argument(
        "--source",
        type=Path,
        default=Path("local_datalake"),
        help="Local data lake directory to upload.",
    )
    parser.add_argument(
        "--volume-name",
        type=str,
        default="capable-data-lake",
        help="Modal volume name.",
    )
    args = parser.parse_args()

    source = args.source.resolve()
    if not source.exists() or not source.is_dir():
        raise SystemExit(f"Source directory not found: {source}")

    volume = modal.Volume.from_name(args.volume_name, create_if_missing=True)
    files = iter_files(source)
    if not files:
        raise SystemExit(f"No files found under {source}")

    with volume.batch_upload(force=True) as batch:
        for local_path in files:
            relative = local_path.relative_to(source).as_posix()
            batch.put_file(str(local_path), f"/{relative}")

    print(
        f"Uploaded {len(files)} files from {source} to Modal volume "
        f"'{args.volume_name}'."
    )


if __name__ == "__main__":
    main()
