"""Reproduce deterministic verification with offline integration demonstrations.

Write private execution logs and a shareable summary outside the source tree.
This exercises tools; it never invokes an AI model or certifies live accuracy.
"""
import argparse
from contextlib import redirect_stdout
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import tempfile
import time
import unittest

_spec = importlib.util.spec_from_file_location("_proof_evaluate", Path(__file__).with_name("evaluate.py"))
_ev = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ev)
DEFAULT_MINIMUM_TASKS = _ev.DEFAULT_MINIMUM_TASKS
DEFAULT_TARGET = _ev.DEFAULT_TARGET

ROOT = Path(__file__).resolve().parents[1]


class RecordedResult(unittest.TextTestResult):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.cases = {}

    def startTest(self, test):
        super().startTest(test)
        self.cases[test.id()] = "running"

    def addSuccess(self, test):
        super().addSuccess(test)
        self.cases[test.id()] = "passed"

    def addFailure(self, test, err):
        super().addFailure(test, err)
        self.cases[test.id()] = "failed"

    def addError(self, test, err):
        super().addError(test, err)
        self.cases[test.id()] = "error"

    def addSkip(self, test, reason):
        super().addSkip(test, reason)
        self.cases[test.id()] = "skipped"

    def addSubTest(self, test, subtest, err):
        super().addSubTest(test, subtest, err)
        if err is not None:
            self.cases[test.id()] = "failed"


def source_identity():
    """Bind tested inputs, excluding generated reports and private Git metadata."""
    roots = ("scripts", "tests", "skills", "agents", "templates", "examples")
    paths = [ROOT / name for name in ("Dockerfile", "compose.yaml")]
    for name in roots:
        paths.extend(p for p in (ROOT / name).rglob("*")
                     if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc")
    files = {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in sorted(paths)}
    digest = hashlib.sha256(json.dumps(files, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return {"sha256": digest, "files": files}


def invoke(arguments, log, expected=0):
    result = subprocess.run(arguments, cwd=ROOT, capture_output=True, text=True,
                            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}, timeout=120)
    log.write("COMMAND: " + " ".join(map(str, arguments)) + "\n")
    log.write(result.stdout + result.stderr)
    log.flush()
    if result.returncode != expected:
        raise RuntimeError("Unexpected command exit; inspect private execution log")
    return result


def inventory(target):
    return {p.relative_to(target).as_posix(): p.read_bytes()
            for p in target.rglob("*") if p.is_file()
            and p.relative_to(target).as_posix() != ".ai-department/install.lock"}


def installer_demo(log):
    with tempfile.TemporaryDirectory() as scratch:
        target = Path(scratch) / "recipient project with spaces"
        target.mkdir()
        protected = ("CLAUDE.md", "AGENTS.md", ".claude/settings.json", ".codex/config.toml")
        for name in protected:
            path = target / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"recipient-owned fixture\r\n")
        original = inventory(target)
        common = ["--assistant", "both", "--scope", "project", "--target", str(target)]
        command = [sys.executable, str(ROOT / "scripts/install.py")]
        invoke(command + ["install", *common], log)
        if inventory(target) != original:
            raise RuntimeError("Dry-run modified recipient files")
        invoke(command + ["install", *common, "--apply"], log)
        for adapter in (".claude", ".agents"):
            if len(list((target / adapter / "skills").glob("*/SKILL.md"))) != 7:
                raise RuntimeError("Incomplete installed skill inventory")
            roles = target / adapter / "skills/autonomous-development/references/agents"
            expected_roles = {path.name: path.read_bytes() for path in (ROOT / "agents").glob("*.md")}
            installed_roles = {path.name: path.read_bytes() for path in roles.glob("*.md")}
            if installed_roles != expected_roles:
                raise RuntimeError("Installed role references differ from canonical source")
            if adapter == ".claude":
                native_roles = {path.name: path.read_bytes()
                                for path in (target / adapter / "agents").glob("*.md")}
                if native_roles != expected_roles:
                    raise RuntimeError("Installed native roles differ from canonical source")
            for skill, names in {
                "ai-evaluation": ("evaluate.py", "benchmark.py", "telemetry.py", "control_panel.py"),
                "autonomous-development": ("safe_tools.py", "sandbox_worker.py"),
            }.items():
                for name in names:
                    helper = target / adapter / "skills" / skill / "scripts" / name
                    if helper.read_bytes() != (ROOT / "scripts" / name).read_bytes():
                        raise RuntimeError("Installed helper differs from canonical source")
                    if name != "sandbox_worker.py":
                        invoke([sys.executable, str(helper), "--help"], log)
        for name in protected:
            if (target / name).read_bytes() != original[name]:
                raise RuntimeError("Recipient account instructions changed")
        changed = target / ".claude/agents/frank-coder.md"
        installed = changed.read_bytes()
        changed.write_bytes(b"recipient edit\n")
        modified = inventory(target)
        invoke(command + ["uninstall", *common, "--apply"], log, expected=1)
        if inventory(target) != modified:
            raise RuntimeError("Refused uninstall modified owned or recipient files")
        changed.write_bytes(installed)
        invoke(command + ["uninstall", *common, "--apply"], log)
        if inventory(target) != original:
            raise RuntimeError("Uninstall did not preserve recipient files")
    return {"passed": True, "checks": ["dry-run preserves files", "seven skills in each adapter",
            "complete canonical role references and Claude native roles copied exactly", "six canonical helpers copied exactly and public CLI imports exercised",
            "four recipient instruction/account files preserved", "modified-file uninstall refused atomically",
            "uninstall restores original recipient inventory"]}


def evaluation_demo(log):
    with tempfile.TemporaryDirectory() as scratch:
        base = Path(scratch)
        scenarios = []
        for count, failures in ((380, 0), (381, 0), (500, 1), (1000, 1)):
            dataset = {"id": "synthetic-boundary-demo", "version": "1", "synthetic": True,
                       "heldOut": False, "distributionAgreed": True,
                       "tasks": [{"id": str(i), "category": "demo", "critical": False} for i in range(count)]}
            rows = [{"taskId": str(i), "runId": "demo", "producerId": "fixture",
                     "graderId": "fixture-grader", "passed": i >= failures, "integrityPassed": True,
                     "latencyMs": 0, "costUsd": 0, "evidence": "synthetic-fixture",
                     "synthetic": True, "heldOut": False, "independentGrading": False} for i in range(count)]
            dataset_path, results_path = base / "dataset.json", base / "results.jsonl"
            dataset_path.write_text(json.dumps(dataset), encoding="utf-8")
            results_path.write_text("\n".join(json.dumps(r) for r in rows) + "\n", encoding="utf-8")
            result = invoke([sys.executable, str(ROOT / "scripts/evaluate.py"), "--dataset",
                             str(dataset_path), "--results", str(results_path)], log, expected=1)
            report = json.loads(result.stdout)
            if report["accepted"] or "noncertifying_provenance" not in report["reasons"]:
                raise RuntimeError("Synthetic data wrongly certified")
            expected_statistical = count in (381, 1000)
            if (report["wilsonLower"] >= DEFAULT_TARGET) != expected_statistical:
                raise RuntimeError("Unexpected confidence boundary")
            if (report["target"] != DEFAULT_TARGET
                    or report["minimumTasks"] != DEFAULT_MINIMUM_TASKS
                    or report["confidence"] != .95
                    or (failures and "task_failure" not in report["reasons"])):
                raise RuntimeError("Unexpected default target or required-check gate")
            scenarios.append({"label": f"{count - failures}/{count}", "synthetic": True,
                              "wilsonLower": report["wilsonLower"], "accepted": report["accepted"],
                              "statisticalThresholdMet": expected_statistical})
        return {"passed": True, "scenarios": scenarios,
                "meaning": "Synthetic arithmetic and refusal demonstrations; no live quality measurement."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    output = args.output_dir.resolve()
    if output.is_relative_to(ROOT):
        parser.error("Use an external output directory; publish selected results after review")
    if (output / "results.json").exists():
        parser.error("Use a fresh output directory; an earlier result must not appear current")
    output.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    identity = source_identity()
    with (output / "execution.log").open("w", encoding="utf-8") as log:
        invoke([sys.executable, "scripts/validate.py"], log)
        suites = [unittest.TestLoader().discover(str(ROOT / "tests")),
                  unittest.TestLoader().discover(str(ROOT / "skills/autonomous-development/scripts"))]
        with redirect_stdout(log):
            result = unittest.TextTestRunner(stream=log, verbosity=2,
                                            resultclass=RecordedResult).run(unittest.TestSuite(suites))
        installer = installer_demo(log)
        evaluation = evaluation_demo(log)
    if identity != source_identity():
        raise RuntimeError("Tested inputs changed during execution")
    groups = {}
    for case, status in result.cases.items():
        group = case.split(".")[0].removeprefix("test_")
        counts = groups.setdefault(group, {"passed": 0, "failed": 0, "error": 0, "skipped": 0})
        if status not in counts:
            raise RuntimeError("Incomplete recorded test outcome")
        counts[status] += 1
    report = {"schemaVersion": 1, "recordedAtUtc": datetime.now(timezone.utc).isoformat(),
              "baseCommit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT).decode().strip(),
              "testedInputs": identity, "environment": {"python": platform.python_version(),
              "os": platform.system(), "git": subprocess.check_output(["git", "--version"]).decode().strip()},
              "passed": result.wasSuccessful(), "testsRun": result.testsRun,
              "groups": groups, "tests": result.cases, "installerDemo": installer,
              "evaluationDemo": evaluation, "durationSeconds": round(time.monotonic() - started, 2),
              "limitations": ["No live Claude/Codex model execution or measured AI accuracy.",
                              "No browser/deployment or remote Bitbucket CI verification.",
                              "Synthetic evaluator scenarios cannot certify live quality."]}
    (output / "results.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"passed": report["passed"], "testsRun": result.testsRun,
                      "groups": groups, "installerDemo": installer, "evaluationDemo": evaluation,
                      "durationSeconds": report["durationSeconds"]}, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
