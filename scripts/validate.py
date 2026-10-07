"""Validate canonical assets and shared-source hygiene; never scan account stores."""
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_SKILLS = {"autonomous-development", "craftsman", "frank", "commit-pr-standard",
                   "research-workflow", "design-workflow", "ai-evaluation"}
EXPECTED_AGENTS = {"frank-coder", "frank-reviewer", "frank-qa", "frank-security",
                   "frank-debugger", "frank-scribe"}

# Report locations/categories only, never candidate values.
PATTERNS = {
    "private-key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "token": re.compile(r"(?:sk-[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{24,})"),
    "user-path": re.compile(r"(?:[A-Za-z]:[\\/]Users[\\/][A-Za-z0-9_.-]+|/home/[A-Za-z0-9_.-]+/)"),
    "email": re.compile(r"[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
    "internal-host": re.compile(r"(?:https?://)?[A-Za-z0-9.-]+\.(?:internal|local|legalmatch\.com)\b"),
    "session-export": re.compile(r'"(?:session_id|sessionId)"\s*:'),
}


def findings(text):
    results = []
    for number, line in enumerate(text.splitlines(), 1):
        allowed = re.search(r"ai-department-allow:\s*([a-z-]+)", line)
        for category, pattern in PATTERNS.items():
            if pattern.search(line) and not (allowed and allowed.group(1) == category):
                results.append((number, category))
    return results


def metadata(path):
    """Canonical frontmatter uses only plain or quoted one-line scalar fields."""
    text = path.read_text(encoding="utf-8")
    match = re.match(r"\A---\n(.*?)\n---(?:\n|$)", text, re.S)
    if not match:
        raise ValueError("Missing canonical scalar frontmatter")
    result = {}
    for line in match.group(1).splitlines():
        key, separator, value = line.partition(":")
        if not separator or not re.fullmatch(r"[a-z-]+", key) or not value.strip():
            raise ValueError("Invalid canonical scalar frontmatter")
        if key in result:
            raise ValueError("Duplicate frontmatter field")
        result[key] = value.strip().strip('"').strip("'")
    if not result.get("name") or not result.get("description"):
        raise ValueError("Name and description required")
    return result


def validate(root=ROOT):
    problems = []
    skills = root / "skills"
    agents = root / "agents"
    if {p.name for p in skills.iterdir() if p.is_dir()} != EXPECTED_SKILLS:
        problems.append("Canonical skill inventory differs")
    if {p.stem for p in agents.glob("*.md")} != EXPECTED_AGENTS:
        problems.append("Canonical agent inventory differs")
    paths = [p / "SKILL.md" for p in skills.iterdir() if p.is_dir()] + list(agents.glob("*.md"))
    for path in paths:
        try:
            fields = metadata(path)
            expected = path.parent.name if path.name == "SKILL.md" else path.stem
            if fields["name"] != expected:
                problems.append(str(path.relative_to(root)) + ": inconsistent name")
            if path.parent == agents and fields.get("model") != "inherit":
                problems.append(str(path.relative_to(root)) + ": model must inherit")
        except (ValueError, OSError):
            problems.append(str(path.relative_to(root)) + ": invalid metadata")
    result = subprocess.run(["git", "-C", str(root), "ls-files", "--cached", "--others",
                             "--exclude-standard", "-z"], capture_output=True)
    if result.returncode:
        problems.append("Git source inventory unavailable")
        return problems
    for name in set(filter(None, result.stdout.decode("utf-8").split("\0"))):
        path = root / name
        if not path.is_file():
            continue
        if path.is_symlink():
            problems.append(name + ": source symlink not supported")
            continue
        if path.suffix not in {".md", ".py", ".json", ".jsonl", ".yml", ".yaml", ".toml", ".txt"}:
            continue
        try:
            text = path.read_text(encoding="utf-8")
            if path.suffix == ".py":
                compile(text, name, "exec")
            for number, category in findings(text):
                problems.append(f"{name}:{number}: {category}")
            if path.suffix == ".md":
                for link in re.findall(r"\[[^\]]*\]\(([^)]+)\)", text):
                    if ":" in link or link.startswith("#"):
                        continue
                    reference = link.split("#")[0]
                    if not (path.parent / reference).exists():
                        problems.append(name + ": unresolved relative reference")
        except (UnicodeError, OSError, SyntaxError):
            problems.append(name + ": unreadable source or invalid Python")
    return problems


def main():
    try:
        problems = validate()
    except (OSError, ValueError):
        problems = ["Canonical inventory unavailable"]
    for problem in problems:
        print(problem, file=sys.stderr)
    if not problems:
        print("Canonical assets, references, Python syntax and source-hygiene checks passed.")
    return bool(problems)


if __name__ == "__main__":
    sys.exit(main())
