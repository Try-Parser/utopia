"""Bind independent review evidence to an unchanged Git worktree.

This validates evidence structure, not whether an agent actually performed a check.
Ignored files are outside Git scope; keep evidence artifacts outside reviewed repos.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys


class EvidenceError(ValueError):
    pass


def git(repository, *arguments):
    result = subprocess.run(
        ["git", "-C", str(repository), *arguments], capture_output=True, check=False
    )
    if result.returncode:
        raise EvidenceError("Git inspection failed; verify repository access and HEAD")
    return result.stdout


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def repository_state(repository):
    repository = Path(repository).resolve(strict=True)
    root = Path(os.fsdecode(git(repository, "rev-parse", "--show-toplevel")).strip()).resolve()
    if root != repository:
        raise EvidenceError("Scope must name repository roots, not subdirectories")
    for entry in filter(None, git(root, "ls-files", "-v", "-z").split(b"\0")):
        marker = entry[:1]
        if marker == b"S" or marker.islower():
            raise EvidenceError("Tracked files have assume-unchanged or skip-worktree flags; exact review is unavailable")
    for entry in filter(None, git(root, "ls-files", "--stage", "-z").split(b"\0")):
        if entry.startswith(b"160000 "):
            raise EvidenceError("Submodule gitlinks need separate content verification; this snapshot does not support them")
    content = hashlib.sha256()
    names = git(root, "ls-files", "-z") + git(root, "ls-files", "--others", "--exclude-standard", "-z")
    if names:
        attributes = subprocess.run(["git", "-C", str(root), "check-attr", "-z", "--stdin", "filter"],
                                    input=names, capture_output=True, check=False)
        if attributes.returncode:
            raise EvidenceError("Unable to inspect content filters")
        values = attributes.stdout.split(b"\0")
        if any(value not in (b"unspecified", b"unset", b"") for value in values[2::3]):
            raise EvidenceError("Active content filters (including LFS) require separate verification")

    def add(value):
        content.update(len(value).to_bytes(8, "big"))
        content.update(value)

    head = git(root, "rev-parse", "--verify", "HEAD").decode().strip()
    branch = git(root, "rev-parse", "--abbrev-ref", "HEAD").decode().strip()
    staged_tree = git(root, "write-tree").decode().strip()
    frozen = not git(root, "diff", "--name-only", "-z") and not git(root, "ls-files", "--others", "--exclude-standard", "-z")
    for value in (os.fsencode(root), head.encode(), branch.encode()):
        add(value)
    for arguments in (("diff", "--no-ext-diff", "--no-textconv", "--binary", "--cached", "HEAD"),
                      ("diff", "--no-ext-diff", "--no-textconv", "--binary")):
        add(git(root, *arguments))
    for name in sorted(filter(None, git(root, "ls-files", "--others", "--exclude-standard", "-z").split(b"\0"))):
        add(name)
        path = root / os.fsdecode(name)
        mode = path.lstat().st_mode
        add(str(stat.S_IMODE(mode)).encode())
        if stat.S_ISLNK(mode):
            add(os.fsencode(os.readlink(path)))
        elif stat.S_ISREG(mode):
            add(path.read_bytes())
        else:
            raise EvidenceError("Unsupported untracked file type in scope")
    return {"path": str(root), "head": head, "branch": branch, "digest": content.hexdigest(),
            "stagedTree": staged_tree, "frozen": frozen}


def snapshot(repositories):
    if not repositories:
        raise EvidenceError("At least one repository is required")
    first = sorted((repository_state(path) for path in repositories), key=lambda item: item["path"])
    if len({item["path"] for item in first}) != len(first):
        raise EvidenceError("Duplicate repositories are not allowed")
    # Detect ordinary concurrent edits. This is not a filesystem lock: any later edit
    # invalidates readiness and requires another gate immediately before delivery.
    second = sorted((repository_state(path) for path in repositories), key=lambda item: item["path"])
    if first != second:
        raise EvidenceError("Repository changed during snapshot; stop writers and retry")
    result = {"version": 1, "repositories": first}
    result["snapshotId"] = digest(result)
    return result


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def validate_snapshot(saved):
    if not isinstance(saved, dict) or saved.get("version") != 1 or not isinstance(saved.get("repositories"), list) or not saved["repositories"]:
        raise EvidenceError("Malformed snapshot")
    expected = {"version": saved["version"], "repositories": saved["repositories"]}
    if saved.get("snapshotId") != digest(expected):
        raise EvidenceError("Malformed snapshot identity")
    paths = []
    for item in saved["repositories"]:
        if not isinstance(item, dict) or not all(nonempty(item.get(key)) for key in ("path", "head", "branch", "digest", "stagedTree")) or type(item.get("frozen")) is not bool:
            raise EvidenceError("Malformed repository scope")
        paths.append(item["path"])
    if len(set(paths)) != len(paths):
        raise EvidenceError("Duplicate repositories are not allowed")
    return paths


def outside_repositories(path, repositories):
    output = Path(path).resolve()
    if any(output.is_relative_to(Path(root).resolve()) for root in repositories):
        raise EvidenceError("Evidence files must be outside every reviewed repository")


def postcommit(saved):
    validate_snapshot(saved)
    commits = []
    for item in saved["repositories"]:
        if not item["frozen"]:
            raise EvidenceError("Reviewed work must be fully staged before snapshot")
        current = repository_state(item["path"])
        if current["branch"] != item["branch"]:
            raise EvidenceError("Branch changed after review")
        if git(item["path"], "status", "--porcelain=v1", "--untracked-files=all"):
            raise EvidenceError("Worktree changed after commit")
        if current["head"] == item["head"]:
            if current["stagedTree"] != item["stagedTree"]:
                raise EvidenceError("Uncommitted reviewed work remains")
            # Unchanged repositories in a multi-repository scope need no empty commit.
            if git(item["path"], "rev-parse", "HEAD^{tree}").decode().strip() != item["stagedTree"]:
                raise EvidenceError("Reviewed work was not committed")
        else:
            parents = git(item["path"], "rev-list", "--parents", "-n", "1", "HEAD").decode().split()[1:]
            tree = git(item["path"], "rev-parse", "HEAD^{tree}").decode().strip()
            if parents != [item["head"]] or tree != item["stagedTree"]:
                raise EvidenceError("Commit differs from reviewed tree or direct parent")
        commits.append({"path": item["path"], "commit": current["head"]})
    # Detect ordinary concurrent writers, as in the precommit gate.
    for item, commit in zip(saved["repositories"], commits):
        if git(item["path"], "rev-parse", "HEAD").decode().strip() != commit["commit"] or git(item["path"], "status", "--porcelain=v1", "--untracked-files=all"):
            raise EvidenceError("Repository changed during postcommit verification")
    return {"status": "passed", "snapshotId": saved["snapshotId"], "commits": commits}


def gate(saved, reviews):
    validate_snapshot(saved)
    if not isinstance(saved, dict) or saved.get("version") != 1 or not isinstance(saved.get("repositories"), list):
        raise EvidenceError("Malformed snapshot")
    try:
        paths = [item["path"] for item in saved["repositories"]]
    except (KeyError, TypeError):
        raise EvidenceError("Malformed repository scope") from None
    if snapshot(paths) != saved:
        raise EvidenceError("Snapshot changed or was malformed; rerun all reviews")
    if not isinstance(reviews, dict):
        raise EvidenceError("Reviews must be an object")
    identities = set()
    for lens in ("correctness", "coverage", "security"):
        review = reviews.get(lens)
        if not isinstance(review, dict) or not nonempty(review.get("agentId")):
            raise EvidenceError(lens + ": missing independent agent")
        identity = review["agentId"].strip()
        if identity in identities:
            raise EvidenceError("Each review must have a distinct agentId")
        identities.add(identity)
        result = review.get("result")
        if not isinstance(result, dict) or result.get("status") != "passed" or result.get("blockers") != []:
            raise EvidenceError(lens + ": missing or unsuccessful review")
        if result.get("snapshotId") != saved["snapshotId"] or not nonempty(result.get("verdict")):
            raise EvidenceError(lens + ": missing verdict or mismatched snapshotId")
        evidence = result.get("evidence")
        if not isinstance(evidence, list) or not evidence or not all(nonempty(item) for item in evidence):
            raise EvidenceError(lens + ": evidence is required")
        if lens == "coverage":
            checks = result.get("checks")
            if not isinstance(checks, list) or not checks:
                raise EvidenceError("coverage: executed checks are required")
            for check in checks:
                if (not isinstance(check, dict)
                    or not all(nonempty(check.get(key)) for key in ("command", "container", "evidence"))
                    or type(check.get("exitCode")) is not int or check["exitCode"] != 0
                    or check.get("performed") is not True):
                    raise EvidenceError("coverage: every required check must have successful execution evidence")
    if snapshot(paths) != saved:
        raise EvidenceError("Repository changed during gate")
    return {"status": "passed", "snapshotId": saved["snapshotId"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    capture = commands.add_parser("snapshot")
    capture.add_argument("--repo", action="append", required=True)
    capture.add_argument("--output", type=Path, required=True)
    validate = commands.add_parser("gate")
    validate.add_argument("--snapshot", type=Path, required=True)
    validate.add_argument("--reviews", type=Path, required=True)
    committed = commands.add_parser("postcommit")
    committed.add_argument("--snapshot", type=Path, required=True)
    import task_state
    task_state.add_parser(commands)
    arguments = parser.parse_args()
    try:
        if arguments.command == "snapshot":
            outside_repositories(arguments.output, arguments.repo)
            result = snapshot(arguments.repo)
            arguments.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
            print(json.dumps({"snapshotId": result["snapshotId"],
                              "repositories": [item["path"] for item in result["repositories"]]}))
        elif arguments.command == "gate":
            print(json.dumps(gate(json.loads(arguments.snapshot.read_text(encoding="utf-8")),
                                  json.loads(arguments.reviews.read_text(encoding="utf-8")))))
        elif arguments.command == "postcommit":
            print(json.dumps(postcommit(json.loads(arguments.snapshot.read_text(encoding="utf-8")))))
        else:
            print(json.dumps(task_state.run(arguments)))
    except (EvidenceError, OSError, ValueError, TypeError) as error:
        # Never echo file contents, command output or invalid JSON (possibly secrets).
        print("Evidence gate failed: " + (str(error) if isinstance(error, (EvidenceError, task_state.StateError))
              else "unable to read or validate evidence inputs"), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
