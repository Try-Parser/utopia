#!/usr/bin/env python3
"""Build an offline, content-free control panel from actual submitted metrics.

CLI: --telemetry SUMMARY_JSON [--benchmark REPORT_JSON] --output NEW_HTML.
The panel is a static report, not a live assistant or a tool permission grant.
"""
import argparse
import html
import importlib.util
import json
import math
from pathlib import Path
import re
import sys

_spec = importlib.util.spec_from_file_location("_panel_telemetry", Path(__file__).with_name("telemetry.py"))
telemetry = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(telemetry)


def escaped(value):
    return html.escape(str(value), quote=True)


def number(value, suffix=""):
    return "Unknown" if value is None else escaped(f"{value:g}{suffix}")


def validate_benchmark(report):
    if not isinstance(report, dict):
        raise telemetry.InputError("Invalid benchmark report")
    required = {"accepted", "reasons", "scope", "limitations", "datasetSha256", "confidenceMethod", "aggregation", "target", "confidence", "minimumTasks", "requiredTaskPassRate", "allTasksPassed", "tasks", "observedTasks", "missingTasks", "passedTasks", "pointRate", "wilsonLower", "integrityPassedTasks", "categories", "invalidRecords", "latencyMs", "costUsd", "usage"}
    optional = {"benchmark"}
    if required - set(report) or set(report) - required - optional:
        raise telemetry.InputError("Unexpected benchmark fields")
    if "benchmark" in report:
        declaration = report["benchmark"]
        keys = {"schemaVersion", "bindings", "expectedTrialsPerTask", "exactTrialCounts", "bindingErrors", "resultsSha256", "planSha256", "humanReview", "predeclaration"}
        bindings = {"datasetSha256", "rubricSha256", "modelConfigId", "campaignId", "producerId", "graderId", "humanCalibrationId"}
        if (not isinstance(declaration, dict) or set(declaration) != keys
                or not isinstance(declaration["bindings"], dict) or set(declaration["bindings"]) != bindings
                or type(declaration["schemaVersion"]) is not int or declaration["schemaVersion"] != 1
                or type(declaration["expectedTrialsPerTask"]) is not int or declaration["expectedTrialsPerTask"] < 1
                or type(declaration["exactTrialCounts"]) is not bool
                or not isinstance(declaration["bindingErrors"], list)
                or not all(isinstance(e, dict) and set(e) == {"line", "reason"} and type(e["line"]) is int and isinstance(e["reason"], str) for e in declaration["bindingErrors"])
                or not all(isinstance(declaration[k], str) for k in ("humanReview", "predeclaration"))
                or not all(isinstance(declaration[k], str) and re.fullmatch(r"[a-f0-9]{64}", declaration[k]) for k in ("resultsSha256", "planSha256"))):
            raise telemetry.InputError("Invalid benchmark declaration")
    if not isinstance(report["datasetSha256"], str) or not re.fullmatch(r"[a-f0-9]{64}", report["datasetSha256"]):
        raise telemetry.InputError("Invalid dataset digest")
    if not isinstance(report["confidenceMethod"], dict) or set(report["confidenceMethod"]) != {"name", "sidedness", "z"} or not telemetry._ev.metric(report["confidenceMethod"]["z"]):
        raise telemetry.InputError("Invalid confidence method")
    if not isinstance(report["aggregation"], str):
        raise telemetry.InputError("Invalid aggregation")
    if not isinstance(report["categories"], dict) or any(not isinstance(v, dict) or set(v) != {"tasks", "passed", "pointRate"} for v in report["categories"].values()):
        raise telemetry.InputError("Invalid categories")
    if not isinstance(report["invalidRecords"], list) or any(not isinstance(v, dict) or set(v) != {"line", "reason"} for v in report["invalidRecords"]):
        raise telemetry.InputError("Invalid records schema")
    for key in ("latencyMs", "costUsd"):
        if not isinstance(report[key], dict) or set(report[key]) != {"count", "total", "p50", "p95"} or any(v is not None and not telemetry._ev.metric(v) for v in report[key].values()):
            raise telemetry.InputError("Invalid benchmark metrics")
    usage = report["usage"]
    if (not isinstance(usage, dict) or set(usage) != {"validTrials", "fields", "scope"}
            or type(usage["validTrials"]) is not int or usage["validTrials"] < 0
            or not isinstance(usage["fields"], dict) or set(usage["fields"]) != {*telemetry._ev.TOKEN_FIELDS, "totalTokens"}
            or any(not isinstance(v, dict) or set(v) != {"observedTrials", "missingTrials", "sumObserved", "completeTotal"} or any(n is not None and not telemetry._ev.metric(n) for n in v.values()) for v in usage["fields"].values())):
        raise telemetry.InputError("Invalid benchmark usage")
    if type(report["accepted"]) is not bool or type(report["allTasksPassed"]) is not bool:
        raise telemetry.InputError("Invalid benchmark verdict")
    for key in ("tasks", "observedTasks", "missingTasks", "passedTasks", "integrityPassedTasks", "minimumTasks"):
        if type(report[key]) is not int or report[key] < 0:
            raise telemetry.InputError("Invalid benchmark count")
    for key in ("pointRate", "wilsonLower", "target", "confidence", "requiredTaskPassRate"):
        if not telemetry._ev.metric(report[key]) or report[key] > 1:
            raise telemetry.InputError("Invalid benchmark rate")
    if report["tasks"] < 1 or report["minimumTasks"] < 1 or not 0 < report["target"] < 1:
        raise telemetry.InputError("Invalid benchmark sample or target")
    statistical_minimum = math.ceil(telemetry._ev.Z ** 2 * report["target"] / (1 - report["target"]))
    if report["minimumTasks"] < statistical_minimum:
        raise telemetry.InputError("Benchmark sample minimum below statistical requirement")
    for key in ("reasons", "limitations"):
        if not isinstance(report[key], list) or not all(isinstance(v, str) and len(v) <= 1000 for v in report[key]):
            raise telemetry.InputError("Invalid benchmark text")
    if not isinstance(report["scope"], str) or len(report["scope"]) > 2000:
        raise telemetry.InputError("Invalid benchmark scope")
    if (report["observedTasks"] + report["missingTasks"] != report["tasks"]
            or report["passedTasks"] > report["observedTasks"]
            or report["integrityPassedTasks"] > report["observedTasks"]
            or report["allTasksPassed"] != (report["passedTasks"] == report["tasks"])
            or (report["tasks"] and report["pointRate"] != report["passedTasks"] / report["tasks"])
            or (report["accepted"] and (report["reasons"] or report["invalidRecords"] or report["missingTasks"]
                or not report["allTasksPassed"] or report["integrityPassedTasks"] != report["tasks"]
                or report["observedTasks"] < report["minimumTasks"] or report["wilsonLower"] < report["target"]))):
        raise telemetry.InputError("Inconsistent benchmark verdict")
    if report["accepted"]:
        method = report["confidenceMethod"]
        if (report["requiredTaskPassRate"] != 1 or report["confidence"] != .95
                or method != {"name": "wilson", "sidedness": "two-sided", "z": telemetry._ev.Z}
                or report["wilsonLower"] != telemetry._ev.wilson_lower(report["passedTasks"], report["tasks"])):
            raise telemetry.InputError("Inconsistent confidence declaration")
        if "benchmark" in report:
            declaration = report["benchmark"]
            binding = declaration["bindings"]
            if (not declaration["exactTrialCounts"] or declaration["bindingErrors"]
                    or binding["datasetSha256"] != report["datasetSha256"]
                    or not all(isinstance(v, str) and v.strip() for v in binding.values())
                    or binding["producerId"].strip() == binding["graderId"].strip()):
                raise telemetry.InputError("Inconsistent campaign binding")
    return report


def render(summary, benchmark=None):
    telemetry.validate_summary(summary)
    if benchmark is not None:
        validate_benchmark(benchmark)
    def card(label, value):
        return f'<article class="card"><h3>{escaped(label)}</h3><p class="value">{value}</p></article>'
    tokens = summary["usage"]["fields"]["totalTokens"]
    cost = summary["costUsd"]
    cards = [card("Recorded runs", str(len(summary["runs"]))), card("Failed / cancelled runs", str(summary["outcomes"]["failed"] + summary["outcomes"]["cancelled"])),
             card("Token total · complete coverage", number(tokens["completeTotal"])), card("Cost · complete coverage", number(cost["completeTotal"], " USD")),
             card("Tool calls", str(summary["toolCalls"])), card("Tool errors / denials", f'{summary["toolErrors"]} / {summary["toolDenials"]}')]
    wall = summary["wallMs"]
    waits = summary["waitMs"]
    width = waits / wall * 100 if wall else 0
    benchmark_html = '<p>No benchmark imported. AI quality is unmeasured here.</p>'
    if benchmark is not None:
        reasons = ''.join(f'<li>{escaped(v)}</li>' for v in benchmark["reasons"])
        limitations = ''.join(f'<li>{escaped(v)}</li>' for v in benchmark["limitations"])
        benchmark_html = f'<p class="value">{"Accepted for submitted dataset" if benchmark["accepted"] else "Blocked for submitted dataset"}</p><p>{benchmark["passedTasks"]} / {benchmark["tasks"]} tasks passed; Wilson lower bound {benchmark["wilsonLower"]:.4f}; statistical target {benchmark["target"]:.4f}.</p><p>{escaped(benchmark["scope"])}</p><ul>{reasons}{limitations}</ul><p>Imported declarations do not prove independent grading or held-out provenance.</p>'
    rows = ''.join(f'<tr><td>{escaped(r["taskId"])}</td><td>{escaped(r["runId"])}</td><td>{escaped(r["outcome"])}</td><td>{number(r["wallMs"])}</td><td>{number(r["waitMs"])}</td><td>{number(r["usage"]["totalTokens"])}</td><td>{number(r["costUsd"])}</td></tr>' for r in summary["runs"])
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>AI Department · measured control panel</title>
<style>body{{margin:0;background:#091523;color:#e7f1ff;font:16px/1.5 system-ui,sans-serif}}main{{max-width:1100px;margin:auto;padding:32px}}h1,h2,h3{{color:#b8eaff}}h1{{font-size:2rem}}h3{{font-size:1rem;margin:0}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}}.card,section{{background:#14263a;border:1px solid #50718c;border-radius:12px;padding:20px;margin-bottom:20px}}.value{{font-size:1.6rem;font-weight:700;margin:10px 0}}.bar{{height:26px;background:#778ca3;border-radius:6px;overflow:hidden}}.wait{{height:100%;background:#55d6e5;width:{width:.6f}%}}table{{border-collapse:collapse;width:100%}}th,td{{padding:10px;text-align:left;border-bottom:1px solid #50718c}}.table{{overflow-x:auto}}.note{{color:#c6d4e5}}@media(prefers-reduced-motion:no-preference){{}}</style></head>
<body><main><h1>AI Department · measured control panel</h1><p class="note">Offline imported evidence · no live status · no model or network calls</p><div class="grid">{''.join(cards)}</div>
<section><h2>Time and usage coverage</h2><p>Summed run wall time: {number(wall, " ms")}. Recorded waiting: {number(waits, " ms")}. Remainder: {number(summary["remainderMs"], " ms")}.</p><div class="bar" role="img" aria-label="Recorded waiting proportion {width:.2f} percent"><div class="wait"></div></div><p>Blue: recorded waiting; gray: remainder. Summed wall time is not calendar duration for parallel runs. Remainder is not measured CPU or productive time.</p><p>Tokens observed for {tokens["observedTrials"]} of {len(summary["runs"])} runs; costs observed for {cost["observedRuns"]} of {len(summary["runs"])}. Unknown remains distinct from zero. Failed and retried runs remain included.</p></section>
<section><h2>Benchmark verdict</h2>{benchmark_html}</section><section><h2>Recorded runs</h2><div class="table"><table><thead><tr><th>Task</th><th>Run</th><th>Outcome</th><th>Wall ms</th><th>Wait ms</th><th>Tokens</th><th>USD</th></tr></thead><tbody>{rows}</tbody></table></div></section>
<section><h2>Limits and security boundary</h2><p>{escaped(summary["scope"])}</p><p>100% of required checks must pass. No global AI accuracy, savings, speed or attack-resistance guarantee. Tool denial counts describe routed calls only; this panel grants no permissions and does not enforce a sandbox.</p></section></main></body></html>'''


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--telemetry", type=Path, required=True)
    parser.add_argument("--benchmark", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        summary = telemetry.strict_json(args.telemetry.read_text(encoding="utf-8"))
        benchmark = telemetry.strict_json(args.benchmark.read_text(encoding="utf-8")) if args.benchmark else None
        page = render(summary, benchmark)
        with telemetry.fresh_file(args.output) as output:
            output.write(page)
        return 0
    except (OSError, ValueError, TypeError, UnicodeError, OverflowError, RecursionError):
        print("Control panel schema or file error; no private content printed.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
