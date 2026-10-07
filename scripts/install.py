#!/usr/bin/env python3
"""Install portable workflow assets. Dry-run by default; never edit account settings."""
import argparse
from contextlib import contextmanager, nullcontext
import errno
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import sys
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
STATE = ".ai-department"
MANIFEST = STATE + "/manifest.json"
LOCK = STATE + "/install.lock"
ADAPTERS = {"claude": ".claude", "codex": ".agents"}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def safe_path(target, relative):
    """Reject lexical escapes and every symlink component, including target parents."""
    rel = PurePosixPath(relative)
    if (not isinstance(relative, str) or not relative or "\\" in relative
            or ":" in relative or rel.is_absolute()
            or any(part in ("", ".", "..") for part in relative.split("/"))):
        raise ValueError("Unsafe path in installation: " + str(relative))
    path = target.joinpath(*rel.parts)
    for component in (path, *path.parents):
        if component.is_symlink():
            raise ValueError("Symlink traversal refused: " + str(component))
        # Windows directory junctions are not is_symlink() on older Python.
        # Resolve catches those reparse-point escapes as well.
        if os.path.normcase(str(component.resolve())) != os.path.normcase(str(component.absolute())):
            raise ValueError("Symlink traversal or path escape refused: " + str(component))
    if path.exists() and not path.is_file():
        raise ValueError("Expected a regular file: " + str(path))
    return path


def allowed_path(owner, relative):
    if owner == "claude":
        return (relative.startswith(".claude/skills/")
                or relative.startswith(".claude/agents/")
                or relative == ".claude/ai-department.md")
    return relative.startswith(".agents/skills/") or relative == ".codex/ai-department.md"


def read_manifest(target):
    path = safe_path(target, MANIFEST)
    if not path.exists():
        return {"version": 1, "files": {}}
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("version") != 1 or not isinstance(manifest.get("files"), dict):
        raise ValueError("Unsupported or invalid ownership manifest")
    for relative, entry in manifest["files"].items():
        safe_path(target, relative)
        if not isinstance(entry, dict) or entry.get("assistant") not in ADAPTERS:
            raise ValueError("Invalid manifest owner")
        if not allowed_path(entry["assistant"], relative):
            raise ValueError("Manifest path outside adapter assets: " + relative)
        if not isinstance(entry.get("sha256"), str) or len(entry["sha256"]) != 64:
            raise ValueError("Invalid manifest digest")
        backup = entry.get("backup")
        if backup is not None:
            if not isinstance(backup, str) or not backup.startswith(STATE + "/backups/"):
                raise ValueError("Invalid backup path")
            safe_path(target, backup)
            if not isinstance(entry.get("backup_sha256"), str):
                raise ValueError("Missing backup digest")
    return manifest


def source_files(directory):
    if not directory.is_dir():
        raise ValueError("Missing source directory: " + str(directory))
    for path in sorted(directory.rglob("*")):
        relative = path.relative_to(directory).as_posix()
        # Junctions can look like ordinary directories on Windows. Validate
        # resolved ancestors before reading any enumerated external content.
        safe_path(directory, relative + "/.source-path-check" if path.is_dir() else relative)
        if path.is_file() and "__pycache__" not in path.parts and path.suffix != ".pyc":
            yield path.relative_to(directory).as_posix(), path.read_bytes()


@contextmanager
def target_lock(target, timeout=1.0):
    """Serialize CLI writers across adapters; OS releases the lock after a crash.

    The lock file persists so waiters always lock the same inode. Never unlink
    or replace it while installation commands may be running.
    """
    path = safe_path(target, LOCK)
    path.parent.mkdir(parents=True, exist_ok=True)
    safe_path(target, LOCK)
    descriptor = os.open(path, os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0), 0o600)
    locked = False
    try:
        if os.fstat(descriptor).st_size == 0:
            os.write(descriptor, b"\0")
        deadline = time.monotonic() + timeout
        while True:
            try:
                os.lseek(descriptor, 0, os.SEEK_SET)
                if os.name == "nt":
                    import msvcrt
                    msvcrt.locking(descriptor, msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
                locked = True
                break
            except OSError as error:
                if error.errno not in (errno.EACCES, errno.EAGAIN, errno.EDEADLK):
                    raise
                if time.monotonic() >= deadline:
                    raise ValueError("Another installer owns the target lock; retry when it finishes") from None
                time.sleep(0.05)
        yield
    finally:
        if locked:
            os.lseek(descriptor, 0, os.SEEK_SET)
            if os.name == "nt":
                msvcrt.locking(descriptor, msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(descriptor, fcntl.LOCK_UN)
        os.close(descriptor)


def assets(assistants, source):
    # Validate source directory ancestors too, not just enumerated leaf files.
    safe_path(source, "skills/.source-path-check")
    safe_path(source, "agents/.source-path-check")
    skills = list(source_files(source / "skills"))
    agents = list(source_files(source / "agents"))
    if not skills or not agents:
        raise ValueError("Source must contain skills and agents")
    # Role references travel inside the skill for both assistants; canonical agents
    # stay in one place in the distribution.
    generated = [("autonomous-development/references/agents/" + name, data)
                 for name, data in agents if name.endswith(".md")]
    if any(name == "ai-evaluation/SKILL.md" for name, _ in skills):
        scorer = safe_path(source, "scripts/evaluate.py").read_bytes()
        generated.append(("ai-evaluation/scripts/evaluate.py", scorer))
    names = {name for name, _ in skills}
    if any(name in names for name, _ in generated):
        raise ValueError("Generated asset conflicts with canonical skill")
    guidance = safe_path(source, "templates/global-CLAUDE.md").read_bytes()
    result = {}
    for assistant in assistants:
        prefix = ADAPTERS[assistant] + "/skills/"
        for relative, data in skills + generated:
            result[prefix + relative] = (assistant, data)
        if assistant == "claude":
            for relative, data in agents:
                result[".claude/agents/" + relative] = (assistant, data)
        result[(".claude" if assistant == "claude" else ".codex")
               + "/ai-department.md"] = (assistant, guidance)
    return result


def atomic_write(path, data):
    handle, name = tempfile.mkstemp(prefix=".ai-department-", dir=path.parent)
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def apply_changes(target, changes):
    """Commit a preflighted batch, rolling back bytes and created directories on error."""
    originals = {}
    created_dirs = []
    touched = []
    try:
        for relative, data in changes.items():
            path = safe_path(target, relative)
            originals[relative] = path.read_bytes() if path.exists() else None
            missing = []
            parent = path.parent
            while not parent.exists():
                missing.append(parent)
                parent = parent.parent
            for directory in reversed(missing):
                directory.mkdir()
                created_dirs.append(directory)
            touched.append(relative)
            if data is None:
                if path.exists():
                    path.unlink()
            else:
                atomic_write(path, data)
    except BaseException:
        for relative in reversed(touched):
            path = safe_path(target, relative)
            original = originals[relative]
            if original is None:
                if path.exists():
                    path.unlink()
            else:
                atomic_write(path, original)
        for directory in reversed(created_dirs):
            directory.rmdir()
        raise


def verified_original(target, entry):
    backup = entry.get("backup")
    if backup is None:
        return None
    path = safe_path(target, backup)
    if not path.exists():
        raise ValueError("Missing original backup: " + backup)
    data = path.read_bytes()
    if digest(data) != entry["backup_sha256"]:
        raise ValueError("Original backup has changed: " + backup)
    return data


def plan(action, target, assistants, replace=False, source=ROOT):
    manifest = read_manifest(target)
    files = manifest["files"]
    changes = {}
    selected = {name: entry for name, entry in files.items()
                if entry["assistant"] in assistants}
    # Verify the entire selected ownership set before constructing any mutation.
    for relative, entry in selected.items():
        path = safe_path(target, relative)
        if not path.exists() or digest(path.read_bytes()) != entry["sha256"]:
            raise ValueError("Installed file changed or missing: " + relative)
        verified_original(target, entry)
    desired = assets(assistants, source) if action == "install" else {}
    for relative, entry in selected.items():
        if relative not in desired:
            changes[relative] = verified_original(target, entry)
            if entry.get("backup"):
                changes[entry["backup"]] = None
            del files[relative]
    backup_id = uuid.uuid4().hex
    for relative, (assistant, data) in desired.items():
        path = safe_path(target, relative)
        entry = files.get(relative)
        if entry is None:
            entry = {"assistant": assistant}
            if path.exists():
                if not replace:
                    raise ValueError("Existing file conflicts; use --replace to back it up: " + relative)
                original = path.read_bytes()
                backup = STATE + "/backups/" + backup_id + "/" + relative
                safe_path(target, backup)
                changes[backup] = original
                entry.update(backup=backup, backup_sha256=digest(original))
        entry["sha256"] = digest(data)
        files[relative] = entry
        if not path.exists() or path.read_bytes() != data:
            changes[relative] = data
    if not changes:
        return {}
    if files:
        changes[MANIFEST] = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()
    else:
        changes[MANIFEST] = None
    return changes


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("install", "uninstall"))
    parser.add_argument("--assistant", choices=("claude", "codex", "both"), required=True)
    parser.add_argument("--scope", choices=("project", "user"), required=True,
                        help="Target is the project root or user's home directory")
    parser.add_argument("--target", type=Path, required=True,
                        help="Explicit project root or user home; no implicit account selection")
    parser.add_argument("--apply", action="store_true", help="Apply changes; default is dry-run")
    parser.add_argument("--replace", action="store_true", help="Back up and replace conflicting assets")
    args = parser.parse_args(argv)
    # absolute() intentionally preserves symlinks so safe_path can reject them.
    target = args.target.absolute()
    assistants = list(ADAPTERS) if args.assistant == "both" else [args.assistant]
    try:
        with target_lock(target) if args.apply else nullcontext():
            changes = plan(args.action, target, assistants, args.replace)
            for relative, data in changes.items():
                print(("remove " if data is None else "write  ") + relative)
            if args.apply:
                apply_changes(target, changes)
        print(("Applied" if args.apply else "Dry-run:") + " " + str(len(changes)) + " file changes")
        if args.action == "install":
            print("Manually include ai-department.md in your assistant instructions; account settings are untouched.")
        return 0
    except (OSError, ValueError, TypeError, KeyError) as error:
        print("Installation refused: " + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
