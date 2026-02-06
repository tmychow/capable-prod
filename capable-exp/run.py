from __future__ import annotations

import argparse
import importlib.util
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

import yaml  # type: ignore

ROOT = Path(__file__).resolve().parent
RUNS = ROOT / "runs"


def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def slug(text: str) -> str:
    s = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "-" for ch in text.strip())
    return s.strip("-_") or "run"


def read_config(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def read_state(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_state(path: Path, state: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")


def make_run_id(cli_run_id: str | None, config: dict) -> str:
    if cli_run_id:
        return str(cli_run_id)
    run_name = str(config["run_name"])
    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M")
    return f"{ts}-{slug(run_name)}"


def build_initial_state(run_id: str) -> dict:
    return {
        "run_id": run_id,
        "created_at": now(),
        "updated_at": now(),
        "ended_at": None,
        "last_stage_completed": None,
        "error": None,
    }


def save_state(state: dict, state_path: Path) -> None:
    state["updated_at"] = now()
    write_state(state_path, state)


def load_or_create_run(args: argparse.Namespace, run_id: str, cli_config: dict) -> tuple[Path, dict, dict, Path]:
    RUNS.mkdir(parents=True, exist_ok=True)
    run_dir = RUNS / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    config_path = run_dir / "config.yaml"
    state_path = run_dir / "run.json"

    if state_path.exists():
        state = read_state(state_path)
        run_config = read_config(config_path)
        print(f"Resuming run: {run_id}")
        return run_dir, run_config, state, state_path

    shutil.copyfile(args.config, config_path)
    run_config = cli_config
    state = build_initial_state(run_id)
    write_state(state_path, state)
    print(f"Created run: {run_id}")
    return run_dir, run_config, state, state_path


def stage_enabled(config: dict, stage_name: str) -> bool:
    return bool(config["stages"][stage_name]["enabled"])


def next_stages_to_run(state: dict, stage_names: list[str]) -> list[str]:
    last = state.get("last_stage_completed")
    if last in stage_names:
        return stage_names[stage_names.index(last) + 1 :]
    return stage_names


def load_stage_fn(stage_name: str):
    stage_file = ROOT / "pipeline" / f"{stage_name}.py"
    spec = importlib.util.spec_from_file_location(f"capable_exp_{stage_name}", stage_file)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return getattr(mod, "run", None) or getattr(mod, "main", None)


def run_stage(stage_name: str, run_id: str, state_path: Path, config: dict, state: dict) -> None:
    if not stage_enabled(config, stage_name):
        state["last_stage_completed"] = stage_name
        state["error"] = None
        save_state(state, state_path)
        print(f"[{stage_name}] skipped (disabled)")
        return

    print(f"[{stage_name}] running")
    try:
        fn = load_stage_fn(stage_name)
        stage_config = config[stage_name]
        ctx = {
            "run_id": run_id,
            "config": stage_config,
        }
        fn(ctx)
        state["last_stage_completed"] = stage_name
        state["error"] = None
        save_state(state, state_path)
        print(f"[{stage_name}] completed")
    except Exception as exc:
        state["ended_at"] = None
        state["error"] = f"{stage_name}: {exc}"
        save_state(state, state_path)
        print(f"[{stage_name}] failed: {exc}")
        raise SystemExit(1) from exc


def main() -> None:
    parser = argparse.ArgumentParser(description="Run capable-exp staged pipeline.")
    parser.add_argument("--config", type=Path, default=ROOT / "config" / "default.yaml")
    parser.add_argument("--run-id", type=str, default=None)
    args = parser.parse_args()

    cli_config = read_config(args.config)
    run_id = make_run_id(args.run_id, cli_config)
    run_dir, config, state, state_path = load_or_create_run(args, run_id, cli_config)
    stage_names = list(config["stages"].keys())

    stages_to_run = next_stages_to_run(state, stage_names)
    if not stages_to_run:
        state["error"] = None
        if state.get("ended_at") is None:
            state["ended_at"] = now()
        save_state(state, state_path)
        print("No stages selected to run.")
        return

    print(f"Stages: {', '.join(stages_to_run)}")
    print(f"Run directory: {run_dir}")

    state["ended_at"] = None
    state["error"] = None
    save_state(state, state_path)

    for stage_name in stages_to_run:
        run_stage(stage_name, run_id, state_path, config, state)

    state["ended_at"] = now()
    state["error"] = None
    save_state(state, state_path)
    print(f"Run {run_id} finished")


if __name__ == "__main__":
    main()
