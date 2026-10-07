#!/usr/bin/env python3
"""Bind a predeclared offline benchmark to supplied, human-reviewed records.

No model calls. Hashes and declarations cannot prove held-out or honest grading.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sys

from evaluate import InputError, evaluate, strict_json as evaluator_json, TOKEN_FIELDS

PLAN_KEYS = {"schemaVersion", "createdAt", "datasetSha256", "rubricSha256",
             "modelConfigId", "campaignId", "producerId", "graderId",
             "humanCalibrationId", "expectedTrials", "target", "minimumTasks"}
IDENTITIES = ("modelConfigId", "campaignId", "producerId", "graderId", "humanCalibrationId")
BINDINGS = ("datasetSha256", "rubricSha256") + IDENTITIES
ROW_KEYS = {"taskId", "runId", "producerId", "graderId", "evidence", "passed",
            "integrityPassed", "synthetic", "heldOut", "independentGrading",
            "latencyMs", "costUsd", "usage", "humanReviewed"} | set(BINDINGS)
USAGE_KEYS = {"provider", "model", "accountingConvention", "outputConvention"} | set(TOKEN_FIELDS)


def strict_json(text):
    value = evaluator_json(text)
    pending = [value]
    while pending:
        item = pending.pop()
        if isinstance(item, dict):
            pending.extend(item.values())
        elif isinstance(item, list):
            pending.extend(item)
        elif isinstance(item, float) and not math.isfinite(item):
            raise InputError("Nonfinite JSON number")
    return value


def identity(value):
    # Opaque identifiers, not arbitrary content or personal account information.
    return isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}", value) is not None


def digest(data):
    return hashlib.sha256(data).hexdigest()


def validate_rubric(data):
    rubric = strict_json(data.decode("utf-8"))
    if (not isinstance(rubric, dict) or set(rubric) != {"id", "version", "criteria"}
            or not identity(rubric["id"]) or not identity(rubric["version"])
            or not isinstance(rubric["criteria"], list) or not rubric["criteria"]):
        raise InputError("Invalid rubric")
    seen = set()
    for criterion in rubric["criteria"]:
        if (not isinstance(criterion, dict) or set(criterion) != {"id", "description", "required"}
                or not identity(criterion["id"]) or criterion["id"] in seen
                or not isinstance(criterion["description"], str) or not criterion["description"].strip()
                or type(criterion["required"]) is not bool):
            raise InputError("Invalid criterion")
        seen.add(criterion["id"])


def validate_plan(plan):
    if (not isinstance(plan, dict) or set(plan) != PLAN_KEYS
            or type(plan["schemaVersion"]) is not int or plan["schemaVersion"] != 1
            or not all(identity(plan[k]) for k in IDENTITIES)
            or plan["producerId"] == plan["graderId"]
            or any(not isinstance(plan[k], str) or re.fullmatch(r"[0-9a-f]{64}", plan[k]) is None
                   for k in ("datasetSha256", "rubricSha256"))
            or type(plan["expectedTrials"]) is not int or plan["expectedTrials"] < 1
            or type(plan["minimumTasks"]) is not int or plan["minimumTasks"] < 1
            or type(plan["target"]) not in (int, float) or not 0 < plan["target"] < 1
            or not math.isfinite(plan["target"])
            or not isinstance(plan["createdAt"], str)):
        raise InputError("Invalid plan")
    try:
        stamp = datetime.fromisoformat(plan["createdAt"])
        if stamp.tzinfo is None or stamp.utcoffset().total_seconds() != 0:
            raise ValueError
    except (ValueError, OverflowError):
        raise InputError("Invalid plan timestamp") from None


def prepare(dataset_bytes, rubric_bytes, *, model_config_id, campaign_id, producer_id,
            grader_id, human_calibration_id, expected_trials=1, target=.95, minimum_tasks=73):
    plan = {"schemaVersion": 1, "createdAt": datetime.now(timezone.utc).isoformat(),
            "datasetSha256": digest(dataset_bytes), "rubricSha256": digest(rubric_bytes),
            "modelConfigId": model_config_id, "campaignId": campaign_id,
            "producerId": producer_id, "graderId": grader_id,
            "humanCalibrationId": human_calibration_id, "expectedTrials": expected_trials,
            "target": target, "minimumTasks": minimum_tasks}
    validate_plan(plan)
    validate_rubric(rubric_bytes)
    strict_json(dataset_bytes.decode("utf-8"))
    # Use the canonical validator; empty records do not certify anything.
    evaluate(dataset_bytes, "", target=target, minimum_tasks=minimum_tasks)
    return plan


def finalize(plan, dataset_bytes, rubric_bytes, results_text):
    validate_plan(plan)
    validate_rubric(rubric_bytes)
    if digest(dataset_bytes) != plan["datasetSha256"] or digest(rubric_bytes) != plan["rubricSha256"]:
        raise InputError("Changed benchmark inputs")
    dataset = strict_json(dataset_bytes.decode("utf-8"))
    report = evaluate(dataset_bytes, results_text, target=plan["target"],
                      minimum_tasks=plan["minimumTasks"], expected_dataset_sha256=plan["datasetSha256"])
    counts = {task["id"]: 0 for task in dataset["tasks"]}
    binding_errors = []
    for number, line in enumerate(results_text.splitlines(), 1):
        try:
            row = strict_json(line)
            if (not isinstance(row, dict) or set(row) - ROW_KEYS
                    or any(row.get(k) != plan[k] for k in BINDINGS)
                    or row.get("humanReviewed") is not True
                    or not isinstance(row.get("taskId"), str) or row["taskId"] not in counts
                    or ("usage" in row and (not isinstance(row["usage"], dict)
                                           or set(row["usage"]) - USAGE_KEYS))):
                raise InputError("Invalid binding")
            counts[row["taskId"]] += 1
        except (ValueError, TypeError):
            binding_errors.append({"line": number, "reason": "Invalid benchmark binding or schema"})
    exact = all(count == plan["expectedTrials"] for count in counts.values())
    if binding_errors:
        report["reasons"].append("benchmark_binding_invalid")
    if not exact:
        report["reasons"].append("predeclared_trial_count_mismatch")
    report["accepted"] = not report["reasons"]
    report["benchmark"] = {"schemaVersion": 1, "bindings": {k: plan[k] for k in BINDINGS},
                           "expectedTrialsPerTask": plan["expectedTrials"],
                           "exactTrialCounts": exact, "bindingErrors": binding_errors,
                           "resultsSha256": digest(results_text.encode("utf-8")),
                           "planSha256": digest(json.dumps(plan, sort_keys=True, separators=(",", ":"),
                                                            allow_nan=False).encode("utf-8")),
                           "humanReview": "Self-reported review and calibration; externally verify.",
                           "predeclaration": "Plan timestamp and hashes do not prove when it was created or held-out provenance."}
    report["aggregation"] = "Exactly predeclared trials per task; every trial must pass and preserve integrity."
    return report


def fresh_output(path, value, inputs):
    """Exclusive creation; reject aliases and existing outputs, including links."""
    absolute = path.absolute()
    if absolute.resolve() in {p.resolve() for p in inputs}:
        raise InputError("Output aliases input")
    for component in (absolute, *absolute.parents):
        if component.is_symlink() or (hasattr(component, "is_junction") and component.is_junction()):
            raise InputError("Output path uses link")
    serialized = (json.dumps(value, indent=2, allow_nan=False) + "\n").encode("utf-8")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    descriptor = None
    directories = []
    try:
        if os.name == "posix":
            # Open each parent with no-follow, anchoring against ancestor swaps.
            directory = os.open(absolute.anchor, os.O_RDONLY | os.O_DIRECTORY)
            directories.append(directory)
            for name in absolute.parts[1:-1]:
                directory = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
                directories.append(directory)
            descriptor = os.open(absolute.name, flags, 0o600, dir_fd=directory)
        else:
            descriptor = os.open(absolute, flags | getattr(os, "O_BINARY", 0), 0o600)
        with os.fdopen(descriptor, "wb") as output:
            descriptor = None
            output.write(serialized)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        for directory in reversed(directories):
            os.close(directory)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    start = commands.add_parser("prepare")
    finish = commands.add_parser("finalize")
    for command in (start, finish):
        for option in ("dataset", "rubric", "output"):
            command.add_argument("--" + option, type=Path, required=True)
    for option in ("model-config-id", "campaign-id", "producer-id", "grader-id", "human-calibration-id"):
        start.add_argument("--" + option, required=True)
    start.add_argument("--expected-trials", type=int, default=1)
    start.add_argument("--target", type=float, default=.95)
    start.add_argument("--minimum-tasks", type=int, default=73)
    finish.add_argument("--plan", type=Path, required=True)
    finish.add_argument("--results", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        dataset, rubric = args.dataset.read_bytes(), args.rubric.read_bytes()
        inputs = [args.dataset, args.rubric]
        if args.command == "prepare":
            result = prepare(dataset, rubric, model_config_id=args.model_config_id,
                             campaign_id=args.campaign_id, producer_id=args.producer_id,
                             grader_id=args.grader_id, human_calibration_id=args.human_calibration_id,
                             expected_trials=args.expected_trials, target=args.target,
                             minimum_tasks=args.minimum_tasks)
        else:
            inputs.extend([args.plan, args.results])
            result = finalize(strict_json(args.plan.read_text(encoding="utf-8")), dataset, rubric,
                              args.results.read_bytes().decode("utf-8"))
        fresh_output(args.output, result, inputs)
        return 0 if args.command == "prepare" or result["accepted"] else 1
    except (OSError, ValueError, UnicodeError, OverflowError, RecursionError):
        print("Benchmark input or output error; check files and schema.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
