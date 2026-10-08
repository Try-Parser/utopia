#!/usr/bin/env python3
"""Build a self-contained plugin from canonical assets; check drift by default."""
import argparse
import importlib.util
import json
import re
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("plugin_installer", ROOT / "scripts/install.py")
installer = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(installer)
DESTINATION = "plugins/ai-department"
METADATA_FIELDS = ("name", "version", "description", "author", "homepage",
                   "repository", "license", "keywords")
FIXED_SOURCES = {"templates/global-CLAUDE.md", "templates/plugin.json",
                 "templates/plugin-setup/SKILL.md", "docs/plugin.md"} | {
    "scripts/" + helper for helpers in installer.GENERATED_HELPERS.values() for helper in helpers}


def _object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate plugin metadata key: " + key)
        result[key] = value
    return result


def json_bytes(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def source_inventory(source):
    """Preflight the reviewed source paths before reading any bundled content."""
    inventory = json.loads(installer.safe_path(source, "templates/plugin-files.json").read_bytes())
    if not isinstance(inventory, list) or not inventory:
        raise ValueError("Plugin source inventory must be a nonempty path list")
    approved = set()
    for relative in inventory:
        if not isinstance(relative, str):
            raise ValueError("Plugin inventory paths must be strings")
        path = installer.safe_path(source, relative)
        if relative in approved:
            raise ValueError("Duplicate plugin inventory path: " + relative)
        if (relative not in FIXED_SOURCES
                and not relative.startswith(("skills/", "agents/"))):
            raise ValueError("Plugin inventory path outside canonical assets: " + relative)
        if "__pycache__" in path.parts or path.suffix == ".pyc":
            raise ValueError("Cache files cannot enter the plugin source inventory")
        if not path.is_file():
            raise ValueError("Missing plugin inventory source: " + relative)
        approved.add(relative)
    if not FIXED_SOURCES <= approved:
        raise ValueError("Plugin inventory omits required shared resources")
    directories = {parent.as_posix() for name in approved
                   for parent in Path(name).parents if parent.as_posix() != "."}
    found = set()
    pending = [source / "skills", source / "agents"]
    while pending:
        directory = pending.pop()
        installer.safe_path(source, directory.relative_to(source).as_posix() + "/.source-path-check")
        for path in sorted(directory.iterdir()):
            relative = path.relative_to(source).as_posix()
            installer.safe_path(source, relative + "/.source-path-check"
                                if path.is_dir() else relative)
            if path.is_dir():
                if path.name == "__pycache__":
                    continue
                if relative not in directories:
                    raise ValueError("Unexpected plugin source directory: " + relative)
                pending.append(path)
            elif path.suffix == ".pyc":
                continue
            elif relative not in approved:
                raise ValueError("Unexpected plugin source file: " + relative)
            else:
                found.add(relative)
    if found != {name for name in approved if name.startswith(("skills/", "agents/"))}:
        raise ValueError("Plugin source inventory does not match canonical resources")
    return approved


def payload(source=ROOT):
    """No home/config discovery: only the repository's canonical distribution."""
    approved = source_inventory(source)
    portable = installer.safe_path(source, "templates/plugin.json").read_bytes()
    manifest = json.loads(portable, object_pairs_hook=_object)
    if (not isinstance(manifest, dict) or manifest.get("name") != "ai-department"
            or not isinstance(manifest.get("version"), str)
            or not re.fullmatch(r"\d+\.\d+\.\d+", manifest["version"])
            or not isinstance(manifest.get("description"), str)
            or not manifest["description"].strip()):
        raise ValueError("Invalid plugin identity metadata")
    interface = manifest.get("extensions", {}).get("com.openai", {}).get("interface", {})
    if not isinstance(interface, dict):
        raise ValueError("Invalid plugin interface metadata")
    metadata = {key: manifest[key] for key in METADATA_FIELDS if key in manifest}
    result = {"plugin.json": portable,
              ".claude-plugin/plugin.json": json_bytes(metadata),
              ".codex-plugin/plugin.json": json_bytes({**metadata, "skills": "./skills/",
                                                       "interface": interface})}
    assets = installer.assets(["claude"], source)
    expected_assets = {".claude/" + name for name in approved
                       if name.startswith(("skills/", "agents/"))}
    expected_assets.add(".claude/ai-department.md")
    expected_assets.update(".claude/skills/autonomous-development/references/agents/"
                           + name[len("agents/"):] for name in approved
                           if name.startswith("agents/") and name.endswith(".md"))
    for skill, helpers in installer.GENERATED_HELPERS.items():
        if "skills/" + skill + "/SKILL.md" in approved:
            expected_assets.update(".claude/skills/" + skill + "/scripts/" + helper
                                   for helper in helpers)
    if set(assets) != expected_assets:
        raise ValueError("Installer asset set differs from reviewed plugin inventory")
    for relative, (_, data) in assets.items():
        if relative.startswith(".claude/skills/"):
            destination = "skills/" + relative[len(".claude/skills/"):]
        elif relative.startswith(".claude/agents/"):
            destination = "agents/" + relative[len(".claude/agents/"):]
        elif relative == ".claude/ai-department.md":
            destination = "skills/setup/references/global-guidance.md"
        else:
            raise ValueError("Unsupported canonical plugin asset: " + relative)
        if destination in result:
            raise ValueError("Duplicate plugin asset: " + destination)
        result[destination] = data
    for destination, relative in {
        "skills/setup/SKILL.md": "templates/plugin-setup/SKILL.md",
        "README.md": "docs/plugin.md",
    }.items():
        if destination in result:
            raise ValueError("Plugin-only asset conflicts with canonical skill: " + destination)
        result[destination] = installer.safe_path(source, relative).read_bytes()
    return result


def existing_files(target, expected):
    """Reject unexpected directories before descending; never read their contents."""
    installer.safe_path(target, ".plugin-path-check")
    if not target.exists():
        return set()
    if not target.is_dir():
        raise ValueError("Plugin target must be a directory")
    directories = {parent.as_posix() for name in expected
                   for parent in Path(name).parents if parent.as_posix() != "."}
    found = set()
    pending = [target]
    while pending:
        directory = pending.pop()
        for path in sorted(directory.iterdir()):
            relative = path.relative_to(target).as_posix()
            # Validate links/junctions before trusting directory/file type.
            installer.safe_path(target, relative + "/.plugin-path-check"
                                if path.is_dir() else relative)
            if path.is_dir():
                if relative not in directories:
                    raise ValueError("Unexpected plugin directory: " + relative)
                pending.append(path)
            elif relative not in expected:
                raise ValueError("Unexpected plugin file: " + relative)
            elif not path.is_file():
                raise ValueError("Plugin assets must be regular files: " + relative)
            else:
                found.add(relative)
    return found


def check(target, expected):
    found = existing_files(target, expected)
    missing = sorted(set(expected) - found)
    changed = sorted(name for name in found
                     if installer.safe_path(target, name).read_bytes() != expected[name])
    if missing or changed:
        details = []
        if missing:
            details.append("missing: " + ", ".join(missing))
        if changed:
            details.append("changed: " + ", ".join(changed))
        raise ValueError("Plugin package drift (" + "; ".join(details) + ")")


def write(target, expected, fresh=False):
    installer.safe_path(target, ".plugin-path-check")
    if fresh and target.exists():
        raise ValueError("Export destination already exists; choose a fresh directory")
    existing_files(target, expected)
    changes = {name: data for name, data in expected.items()
               if not installer.safe_path(target, name).exists()
               or installer.safe_path(target, name).read_bytes() != data}
    installer.apply_changes(target, changes)
    check(target, expected)
    return len(changes)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="Verify committed package (default)")
    mode.add_argument("--write", action="store_true", help="Refresh committed generated assets")
    mode.add_argument("--output", type=Path, help="Export to a fresh directory; refuse overwrite")
    args = parser.parse_args(argv)
    try:
        expected = payload()
        target = args.output.absolute() if args.output else ROOT / DESTINATION
        if args.write or args.output:
            count = write(target, expected, fresh=bool(args.output))
            print(f"Plugin package written: {count} files; {len(expected)} verified assets")
        else:
            check(target, expected)
            print(f"Plugin package matches canonical sources: {len(expected)} assets")
        return 0
    except (OSError, ValueError, TypeError, KeyError, AttributeError) as error:
        print("Plugin packaging refused: " + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
