#!/usr/bin/env python3
"""Content-free observed traces. CLI: summarize --trace FILE [--trace FILE] --output NEW_JSON.

Recorder(path, task_id, run_id) starts an observed run; emit(event, **fields)
supports usage, tool, wait_start, wait_end and end. Imports are submitted evidence.
Opaque IDs and provider/model labels must never encode private content.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
import time

_spec = importlib.util.spec_from_file_location("_telemetry_evaluate", Path(__file__).with_name("evaluate.py"))
_ev = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ev)
InputError = _ev.InputError
strict_json = _ev.strict_json
ID = re.compile(r"[A-Za-z0-9_-]{1,64}\Z")
LABEL = re.compile(r"[A-Za-z0-9_.:-]{1,128}\Z")
BASE = {"event", "taskId", "runId", "sequence", "elapsedMs"}
EXTRA = {"start": set(), "usage": {"usage", "costUsd"}, "tool": {"outcome"},
         "wait_start": set(), "wait_end": set(), "end": {"outcome"}}
SCOPE = "Submitted content-free traces only; no automatic assistant instrumentation or savings claim."


def opaque(value):
    return isinstance(value, str) and ID.fullmatch(value) is not None


def fresh_file(path):
    """Create exclusively; refuse symlink parents and aliases to existing files."""
    path = Path(path).absolute()
    if any(p.is_symlink() or (hasattr(p, "is_junction") and p.is_junction()) for p in (path, *path.parents)):
        raise InputError("Output symlink denied")
    directories = []
    descriptor = None
    try:
        if os.name == "posix":
            directory = os.open(path.anchor, os.O_RDONLY | os.O_DIRECTORY)
            directories.append(directory)
            for part in path.parts[1:-1]:
                directory = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
                directories.append(directory)
            descriptor = os.open(path.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
        else:
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0), 0o600)
        output = os.fdopen(descriptor, "w", encoding="utf-8", newline="\n")
        descriptor = None
        return output
    finally:
        if descriptor is not None:
            os.close(descriptor)
        for directory in reversed(directories):
            os.close(directory)


def validate_events(events, complete=True):
    if not events:
        raise InputError("Empty trace")
    identity = None
    previous = 0
    waiting = None
    ended = False
    waited = 0
    usages, costs = [], []
    tools = {"passed": 0, "error": 0, "denied": 0}
    for index, row in enumerate(events):
        if not isinstance(row, dict) or row.get("event") not in EXTRA:
            raise InputError("Invalid event")
        event = row["event"]
        allowed = BASE | EXTRA[event]
        required = allowed - ({"costUsd"} if event == "usage" else set())
        if set(row) - allowed or required - set(row):
            raise InputError("Unexpected or missing event fields")
        if not all(opaque(row[k]) for k in ("taskId", "runId")):
            raise InputError("Invalid opaque identity")
        current = (row["taskId"], row["runId"])
        if identity is None:
            identity = current
        if (current != identity or type(row["sequence"]) is not int or row["sequence"] != index
                or not _ev.metric(row["elapsedMs"]) or row["elapsedMs"] < previous or ended):
            raise InputError("Invalid event ordering")
        previous = row["elapsedMs"]
        if (index == 0 and (event != "start" or previous != 0)) or (index > 0 and event == "start"):
            raise InputError("Invalid start event")
        if event == "usage":
            usage = row["usage"]
            allowed_usage = set(_ev.TOKEN_FIELDS) | {"provider", "model", "accountingConvention", "outputConvention"}
            if (not isinstance(usage, dict) or set(usage) - allowed_usage
                    or not all(isinstance(usage.get(k), str) and LABEL.fullmatch(usage[k]) for k in ("provider", "model"))):
                raise InputError("Invalid usage fields")
            usages.append(_ev.normalized_usage(row))
            cost = row.get("costUsd")
            if "costUsd" in row and not _ev.metric(cost):
                raise InputError("Invalid observed cost")
            costs.append(cost)
        elif event == "tool":
            if row["outcome"] not in tools:
                raise InputError("Invalid tool outcome")
            tools[row["outcome"]] += 1
        elif event == "wait_start":
            if waiting is not None:
                raise InputError("Overlapping wait")
            waiting = previous
        elif event == "wait_end":
            if waiting is None:
                raise InputError("Wait end without start")
            waited += previous - waiting
            waiting = None
        elif event == "end":
            if waiting is not None or row["outcome"] not in ("passed", "failed", "cancelled"):
                raise InputError("Invalid terminal event")
            ended = True
    if complete and (not ended or waiting is not None):
        raise InputError("Incomplete trace")
    totals = {}
    for field in (*_ev.TOKEN_FIELDS, "totalTokens"):
        vals = [u.get(field) for u in usages]
        totals[field] = sum(vals) if vals and all(v is not None for v in vals) else None
        if totals[field] is not None and not _ev.metric(totals[field]):
            raise InputError("Usage overflow")
    cost = sum(costs) if costs and all(v is not None for v in costs) else None
    if cost is not None and not _ev.metric(cost):
        raise InputError("Cost overflow")
    return {"taskId": identity[0], "runId": identity[1], "outcome": events[-1].get("outcome") if ended else None,
            "wallMs": previous, "waitMs": waited, "remainderMs": previous - waited,
            "toolCalls": sum(tools.values()), "toolErrors": tools["error"], "toolDenials": tools["denied"],
            "usage": totals, "costUsd": cost}


class Recorder:
    def __init__(self, path, task_id, run_id):
        self.task_id, self.run_id = task_id, run_id
        start = {"event": "start", "taskId": task_id, "runId": run_id, "sequence": 0, "elapsedMs": 0}
        validate_events([start], complete=False)
        self.events = [start]
        self._file = fresh_file(path)
        self._clock = time.monotonic_ns()
        self._write(start)

    def _write(self, row):
        self._file.write(json.dumps(row, allow_nan=False, separators=(",", ":")) + "\n")
        self._file.flush()

    def emit(self, event, **fields):
        row = {"event": event, "taskId": self.task_id, "runId": self.run_id,
               "sequence": len(self.events), "elapsedMs": (time.monotonic_ns() - self._clock) / 1_000_000}
        if set(fields) & BASE:
            raise InputError("Event metadata cannot be overridden")
        row.update(fields)
        validate_events([*self.events, row], complete=event == "end")
        self._write(row)
        self.events.append(row)
        if event == "end":
            self._file.close()

    def close(self):
        """Close an incomplete trace without inventing terminal evidence."""
        self._file.close()

    def __enter__(self):
        return self

    def __exit__(self, kind, value, traceback):
        try:
            if self.events[-1]["event"] != "end":
                self.emit("end", outcome="failed" if kind else "passed")
        finally:
            self.close()


def summarize(texts):
    runs = []
    identities = set()
    for text in texts:
        lines = text.splitlines()
        if any(not line.strip() for line in lines):
            raise InputError("Blank trace record")
        run = validate_events([strict_json(line) for line in lines])
        key = (run["taskId"], run["runId"])
        if key in identities:
            raise InputError("Duplicate run")
        identities.add(key)
        runs.append(run)
    if not runs:
        raise InputError("No traces")
    result = {"version": 1, "scope": SCOPE, "runs": runs,
              "outcomes": {o: sum(r["outcome"] == o for r in runs) for o in ("passed", "failed", "cancelled")}}
    for field in ("wallMs", "waitMs", "remainderMs", "toolCalls", "toolErrors", "toolDenials"):
        result[field] = sum(r[field] for r in runs)
        if not _ev.metric(result[field]):
            raise InputError("Aggregate overflow")
    result["usage"] = _ev.usage_summary([r["usage"] for r in runs], len(runs))
    known = [r["costUsd"] for r in runs if r["costUsd"] is not None]
    result["costUsd"] = {"observedRuns": len(known), "missingRuns": len(runs) - len(known),
                         "sumObserved": sum(known) if known else None,
                         "completeTotal": sum(known) if len(known) == len(runs) else None}
    if known and not _ev.metric(sum(known)):
        raise InputError("Cost overflow")
    return result


def validate_summary(report):
    """Reject ambiguous or injected summaries; rederive totals from canonical runs."""
    fields = {"version", "scope", "runs", "outcomes", "wallMs", "waitMs", "remainderMs", "toolCalls", "toolErrors", "toolDenials", "usage", "costUsd"}
    if not isinstance(report, dict) or set(report) != fields or type(report["version"]) is not int or report["version"] != 1 or report["scope"] != SCOPE:
        raise InputError("Invalid summary schema")
    runs = report["runs"]
    if not isinstance(runs, list) or not runs:
        raise InputError("Missing summary runs")
    run_fields = {"taskId", "runId", "outcome", "wallMs", "waitMs", "remainderMs", "toolCalls", "toolErrors", "toolDenials", "usage", "costUsd"}
    for r in runs:
        if not isinstance(r, dict) or set(r) != run_fields or not all(opaque(r[k]) for k in ("taskId", "runId")):
            raise InputError("Invalid summary run")
        if not all(_ev.metric(r[k]) for k in ("wallMs", "waitMs", "remainderMs")) or r["waitMs"] > r["wallMs"] or r["remainderMs"] != r["wallMs"] - r["waitMs"]:
            raise InputError("Invalid summary time")
        if not all(type(r[k]) is int and 0 <= r[k] <= 1_000_000 for k in ("toolCalls", "toolErrors", "toolDenials")) or r["toolErrors"] + r["toolDenials"] > r["toolCalls"]:
            raise InputError("Invalid summary tool counts")
        if r["outcome"] not in ("passed", "failed", "cancelled"):
            raise InputError("Invalid summary outcome")
        keys = {*_ev.TOKEN_FIELDS, "totalTokens"}
        if not isinstance(r["usage"], dict) or set(r["usage"]) != keys or any(v is not None and (type(v) is not int or not _ev.metric(v)) for v in r["usage"].values()):
            raise InputError("Invalid summary usage")
        a, b = r["usage"]["inputTokens"], r["usage"]["outputTokens"]
        if r["usage"]["totalTokens"] != (a + b if a is not None and b is not None else None):
            raise InputError("Invalid summary token total")
        _ev.normalized_usage({"usage": {"provider": "summary", "model": "summary", "accountingConvention": "inclusive", "outputConvention": "inclusive",
                                       **{k: r["usage"][k] for k in _ev.TOKEN_FIELDS if r["usage"][k] is not None}}})
        if r["costUsd"] is not None and not _ev.metric(r["costUsd"]):
            raise InputError("Invalid summary cost")
    expected = {"passed": sum(r["outcome"] == "passed" for r in runs), "failed": sum(r["outcome"] == "failed" for r in runs), "cancelled": sum(r["outcome"] == "cancelled" for r in runs)}
    def same(actual, expected):
        return json.dumps(actual, sort_keys=True, allow_nan=False) == json.dumps(expected, sort_keys=True, allow_nan=False)
    if not same(report["outcomes"], expected):
        raise InputError("Summary outcome mismatch")
    identities = {(r["taskId"], r["runId"]) for r in runs}
    if len(identities) != len(runs):
        raise InputError("Duplicate summary run")
    for key in ("wallMs", "waitMs", "remainderMs", "toolCalls", "toolErrors", "toolDenials"):
        total = sum(r[key] for r in runs)
        if not _ev.metric(report[key]) or not _ev.metric(total) or report[key] != total:
            raise InputError("Summary aggregate mismatch")
    if not same(report["usage"], _ev.usage_summary([r["usage"] for r in runs], len(runs))):
        raise InputError("Summary usage mismatch")
    costs = [r["costUsd"] for r in runs if r["costUsd"] is not None]
    expected_cost = {"observedRuns": len(costs), "missingRuns": len(runs) - len(costs), "sumObserved": sum(costs) if costs else None, "completeTotal": sum(costs) if len(costs) == len(runs) else None}
    if not same(report["costUsd"], expected_cost):
        raise InputError("Summary cost mismatch")
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["summarize"])
    parser.add_argument("--trace", action="append", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        report = summarize([p.read_text(encoding="utf-8") for p in args.trace])
        with fresh_file(args.output) as output:
            output.write(json.dumps(report, indent=2, allow_nan=False) + "\n")
        return 0
    except (OSError, ValueError, TypeError, UnicodeError, OverflowError, RecursionError):
        print("Telemetry schema or file error; no private content printed.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
