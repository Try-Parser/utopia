#!/usr/bin/env python3
"""Offline, conservative scoring of supplied benchmark evidence; no model calls.

Provenance declarations are self-reported, not proof of an independent live run.
Acceptance describes this dataset only and never promises global reliability.
"""
import argparse
import hashlib
import json
import math
import statistics
import sys
from pathlib import Path

Z = 1.959963984540054


class InputError(ValueError):
    pass


def strict_json(text):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise InputError("Duplicate JSON property")
            result[key] = value
        return result
    def constant(_):
        raise InputError("Nonfinite JSON constant")
    return json.loads(text, object_pairs_hook=pairs, parse_constant=constant)


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def metric(value):
    try:
        return type(value) in (int, float) and math.isfinite(value) and value >= 0
    except OverflowError:
        return False


def wilson_lower(passed, total):
    if not total:
        return 0.0
    rate = passed / total
    z2 = Z * Z
    return (rate + z2 / (2 * total) - Z * math.sqrt(
        rate * (1 - rate) / total + z2 / (4 * total * total))) / (1 + z2 / total)


def summary(values):
    if not values:
        return {"count": 0, "total": 0, "p50": None, "p95": None}
    ordered = sorted(values)
    total = sum(values)
    if not metric(total):
        raise InputError("Metric aggregate overflow")
    return {"count": len(values), "total": total,
            "p50": statistics.median(values),
            "p95": ordered[math.ceil(.95 * len(values)) - 1]}


TOKEN_FIELDS = ("inputTokens", "outputTokens", "cachedInputTokens",
                "cacheWriteInputTokens", "reasoningOutputTokens")


def normalized_usage(row):
    """Normalize declared provider counters without inventing missing counts."""
    usage = row.get("usage")
    if "usage" not in row:
        return {}
    if (not isinstance(usage, dict) or not all(nonempty(usage.get(k)) for k in ("provider", "model"))
            or usage.get("accountingConvention") not in ("inclusive", "exclusive")
            or usage.get("outputConvention") not in ("inclusive", "exclusive")):
        raise InputError("Invalid usage declaration")
    values = {}
    for key in TOKEN_FIELDS:
        value = usage.get(key)
        if key in usage and (type(value) is not int or value < 0 or not metric(value)):
            raise InputError("Usage counts must be observed nonnegative integers")
        values[key] = value
    input_count = values["inputTokens"]
    cached, written = values["cachedInputTokens"], values["cacheWriteInputTokens"]
    if usage["accountingConvention"] == "exclusive":
        values["inputTokens"] = (input_count + cached + written
                                 if all(v is not None for v in (input_count, cached, written)) else None)
    elif input_count is not None:
        if any(v is not None and v > input_count for v in (cached, written)):
            raise InputError("Cache subset exceeds inclusive input")
        if cached is not None and written is not None and cached + written > input_count:
            raise InputError("Combined cache subsets exceed inclusive input")
    output_count, reasoning = values["outputTokens"], values["reasoningOutputTokens"]
    if usage["outputConvention"] == "exclusive":
        output_count = output_count + reasoning if output_count is not None and reasoning is not None else None
        values["outputTokens"] = output_count
    elif reasoning is not None and output_count is not None and reasoning > output_count:
        raise InputError("Reasoning subset exceeds output")
    values["totalTokens"] = (values["inputTokens"] + output_count
                             if values["inputTokens"] is not None and output_count is not None else None)
    return values


def usage_summary(observed, valid_trials):
    result = {}
    for field in (*TOKEN_FIELDS, "totalTokens"):
        values = [r[field] for r in observed if r.get(field) is not None]
        stats = summary(values)
        result[field] = {"observedTrials": len(values), "missingTrials": valid_trials - len(values),
                         "sumObserved": stats["total"] if values else None,
                         "completeTotal": stats["total"] if values and len(values) == valid_trials else None}
    return {"validTrials": valid_trials, "fields": result,
            "scope": "Submitted counters only; input normalized to total, reasoning/cache are subsets, no price calculation."}


def evaluate(dataset_bytes, results_text, target=.95, minimum_tasks=73,
             expected_dataset_sha256=None, baseline_results_text=None):
    if not metric(target) or not 0 < target < 1:
        raise InputError("Target must be between zero and one")
    if type(minimum_tasks) is not int or minimum_tasks < 1:
        raise InputError("Minimum tasks must be a positive integer")
    digest = hashlib.sha256(dataset_bytes).hexdigest()
    if expected_dataset_sha256 is not None:
        if (not isinstance(expected_dataset_sha256, str)
                or len(expected_dataset_sha256) != 64
                or any(c not in "0123456789abcdefABCDEF" for c in expected_dataset_sha256)
                or expected_dataset_sha256.lower() != digest):
            raise InputError("Expected dataset SHA-256 mismatch or invalid digest")
    dataset = strict_json(dataset_bytes.decode("utf-8"))
    if not isinstance(dataset, dict) or not all(nonempty(dataset.get(k)) for k in ("id", "version")):
        raise InputError("Dataset requires id and version")
    if any(type(dataset.get(k)) is not bool for k in ("synthetic", "heldOut", "distributionAgreed")):
        raise InputError("Dataset provenance flags must be explicit booleans")
    if not isinstance(dataset.get("tasks"), list) or not dataset["tasks"]:
        raise InputError("Dataset requires nonempty tasks")
    tasks = {}
    for task in dataset["tasks"]:
        if (not isinstance(task, dict) or not nonempty(task.get("id"))
                or not nonempty(task.get("category")) or type(task.get("critical")) is not bool):
            raise InputError("Each task requires id, category and boolean critical")
        if task["id"] in tasks:
            raise InputError("Duplicate dataset task ID")
        tasks[task["id"]] = task
    trials = {task_id: [] for task_id in tasks}
    invalid = []
    identities = set()
    latency, costs = [], []
    usage_rows = []
    provenance_ok = True
    for line_number, line in enumerate(results_text.splitlines(), 1):
        if not line.strip():
            invalid.append({"line": line_number, "reason": "Blank result record"})
            continue
        try:
            row = strict_json(line)
        except (ValueError, TypeError):
            invalid.append({"line": line_number, "reason": "Invalid JSON record"})
            continue
        if not isinstance(row, dict):
            invalid.append({"line": line_number, "reason": "Result must be an object"})
            continue
        task_id = row.get("taskId")
        known = isinstance(task_id, str) and task_id in tasks
        valid = (known and all(nonempty(row.get(k)) for k in
                 ("runId", "producerId", "graderId", "evidence"))
                 and all(type(row.get(k)) is bool for k in
                         ("passed", "integrityPassed", "synthetic", "heldOut", "independentGrading"))
                 and all(metric(row.get(k)) for k in ("latencyMs", "costUsd")))
        normalized = {}
        if valid:
            try:
                normalized = normalized_usage(row)
            except InputError:
                valid = False
        identity = (task_id, row.get("runId")) if valid else None
        if valid and identity in identities:
            valid = False
        if identity is not None:
            identities.add(identity)
        if not valid:
            invalid.append({"line": line_number, "reason": "Unknown, duplicate or invalid trial"})
            if known:
                trials[task_id].append(False)
            continue
        independent = row["producerId"].strip() != row["graderId"].strip()
        genuine = not row["synthetic"] and row["heldOut"] and row["independentGrading"] and independent
        provenance_ok = provenance_ok and genuine
        trials[task_id].append(row)
        latency.append(row["latencyMs"])
        costs.append(row["costUsd"])
        usage_rows.append(normalized)
    def task_pass(task_id):
        return bool(trials[task_id]) and all(isinstance(r, dict) and r["passed"] for r in trials[task_id])
    def integrity_pass(task_id):
        return bool(trials[task_id]) and all(isinstance(r, dict) and r["integrityPassed"] for r in trials[task_id])
    total = len(tasks)
    passed = sum(task_pass(t) for t in tasks)
    integrity = sum(integrity_pass(t) for t in tasks)
    missing = sum(not trials[t] for t in tasks)
    observed = sum(bool(trials[t]) for t in tasks)
    minimum = max(minimum_tasks, math.ceil(Z * Z * target / (1 - target)))
    lower = wilson_lower(passed, total)
    reasons = []
    if invalid:
        reasons.append("invalid_results")
    if missing:
        reasons.append("missing_tasks")
    if observed < minimum:
        reasons.append("insufficient_distinct_tasks")
    if lower < target:
        reasons.append("wilson_lower_bound_below_target")
    if integrity != total:
        reasons.append("integrity_failure")
    if any(not task_pass(t) or not integrity_pass(t) for t in tasks if tasks[t]["critical"]):
        reasons.append("critical_task_failure")
    if dataset["synthetic"] or not dataset["heldOut"] or not dataset["distributionAgreed"] or not provenance_ok:
        reasons.append("noncertifying_provenance")
    categories = {}
    for category in sorted({t["category"] for t in tasks.values()}):
        ids = [t for t in tasks if tasks[t]["category"] == category]
        count = sum(task_pass(t) for t in ids)
        categories[category] = {"tasks": len(ids), "passed": count, "pointRate": count / len(ids)}
    report = {"accepted": not reasons, "reasons": reasons,
            "scope": "Provided dataset and self-reported evidence only; no global reliability guarantee.",
            "limitations": ["Tasks may be correlated; externally verify representative sampling and independence.",
                            "Externally verify held-out provenance, grader independence and grading calibration."],
            "datasetSha256": digest,
            "confidenceMethod": {"name": "wilson", "sidedness": "two-sided", "z": Z},
            "aggregation": "All supplied trials must pass per task (conservative pass^k); no mandatory trial count.",
            "target": target, "confidence": .95, "minimumTasks": minimum,
            "tasks": total, "observedTasks": observed, "missingTasks": missing,
            "passedTasks": passed, "pointRate": passed / total, "wilsonLower": lower,
            "integrityPassedTasks": integrity, "categories": categories,
            "invalidRecords": invalid, "latencyMs": summary(latency), "costUsd": summary(costs),
            "usage": usage_summary(usage_rows, len(usage_rows))}
    if baseline_results_text is not None:
        baseline = evaluate(dataset_bytes, baseline_results_text, target, minimum_tasks,
                            expected_dataset_sha256)
        # Pairing is only meaningful when both record sets are valid and complete.
        if invalid or missing or baseline["invalidRecords"] or baseline["missingTasks"]:
            report["pairedComparison"] = {"available": False,
                                          "reason": "Candidate and baseline require valid complete task records"}
        else:
            baseline_rows = {task_id: [] for task_id in tasks}
            for line in baseline_results_text.splitlines():
                row = strict_json(line)
                baseline_rows[row["taskId"]].append(row)
            improved = regressed = unchanged = 0
            for task_id in tasks:
                old = all(row["passed"] and row["integrityPassed"] for row in baseline_rows[task_id])
                new = task_pass(task_id) and integrity_pass(task_id)
                improved += new and not old
                regressed += old and not new
                unchanged += old == new
            report["pairedComparison"] = {"available": True, "datasetSha256": digest,
                                          "tasks": total, "improved": improved,
                                          "regressed": regressed, "unchanged": unchanged,
                                          "scope": "Descriptive paired task outcomes only; not a significance claim."}
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--results", required=True, type=Path)
    parser.add_argument("--target", type=float, default=.95)
    parser.add_argument("--minimum-tasks", type=int, default=73)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--expected-dataset-sha256")
    parser.add_argument("--baseline-results", type=Path)
    args = parser.parse_args(argv)
    try:
        inputs = [args.dataset.resolve(), args.results.resolve()]
        if args.baseline_results:
            inputs.append(args.baseline_results.resolve())
        if args.output and args.output.resolve() in inputs:
            raise InputError("Output must not overwrite inputs")
        report = evaluate(args.dataset.read_bytes(), args.results.read_text(encoding="utf-8"),
                          args.target, args.minimum_tasks, args.expected_dataset_sha256,
                          args.baseline_results.read_text(encoding="utf-8") if args.baseline_results else None)
        serialized = json.dumps(report, indent=2, allow_nan=False) + "\n"
        if args.output:
            args.output.write_text(serialized, encoding="utf-8")
        else:
            sys.stdout.write(serialized)
        return 0 if report["accepted"] else 1
    except (OSError, ValueError, UnicodeError, OverflowError):
        # Do not echo raw records, paths, evidence or exception payloads.
        print("Evaluation input or output error; check files and schema.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
