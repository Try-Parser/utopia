"""Install the local Agent World lifecycle reporter into a Codex user profile."""
import argparse
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path


EVENTS = ("SessionStart", "UserPromptSubmit", "PreToolUse", "SubagentStart", "SubagentStop", "Stop", "Interrupt", "SessionEnd")
BRIDGE_NAME = "agent_world_codex_hook.py"


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")
        temp = Path(stream.name)
    os.replace(temp, path)


def install(home, port):
    if not 1 <= port <= 65535:
        raise ValueError("port must be between 1 and 65535")
    home = Path(home).resolve()
    config_path = home / "hooks.json"
    config = json.loads(config_path.read_text(encoding="utf-8")) if config_path.exists() else {}
    if not isinstance(config, dict) or not isinstance(config.get("hooks", {}), dict):
        raise ValueError("Existing hooks.json has an unsupported structure")
    hooks = config.setdefault("hooks", {})
    destination = home / "hooks" / BRIDGE_NAME
    source = Path(__file__).with_name(BRIDGE_NAME)
    command = f'"{sys.executable}" "{destination}"'
    for event in EVENTS:
        groups = hooks.setdefault(event, [])
        if not isinstance(groups, list):
            raise ValueError(f"Existing {event} hooks have an unsupported structure")
        kept = []
        for group in groups:
            if not isinstance(group, dict) or not isinstance(group.get("hooks", []), list):
                raise ValueError(f"Existing {event} hooks have an unsupported structure")
            handlers = [handler for handler in group["hooks"] if not (isinstance(handler, dict) and BRIDGE_NAME in str(handler.get("command", "")))]
            if handlers:
                kept.append({**group, "hooks": handlers})
        kept.append({"hooks": [{"type": "command", "command": command, "commandWindows": command, "timeout": 2}]})
        hooks[event] = kept
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)
    write_json(destination.with_suffix(".json"), {"port": port})
    write_json(config_path, config)
    return config_path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--codex-home", type=Path, default=Path.home() / ".codex")
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()
    print(f"Installed Agent World Codex hooks in {install(args.codex_home, args.port)}")
    print("Open /hooks in Codex to review and trust these hooks, then start or resume a session.")


if __name__ == "__main__":
    main()
