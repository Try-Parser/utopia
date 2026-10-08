"""Panel input fixtures are synthetic; no live assistant connection exists."""
import importlib.util
import copy
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("panel_tests_impl", Path(__file__).resolve().parents[1] / "scripts/control_panel.py")
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


def summary():
    rows = [{"event": "start", "taskId": "task", "runId": "r", "sequence": 0, "elapsedMs": 0}, {"event": "end", "taskId": "task", "runId": "r", "sequence": 1, "elapsedMs": 5, "outcome": "failed"}]
    return p.telemetry.summarize(["\n".join(json.dumps(r) for r in rows)])


class ControlPanelTests(unittest.TestCase):
    def test_empty_endpoint_and_undersized_benchmark_rejected(self):
        dataset = {"id": "fixture", "version": "1", "synthetic": True, "heldOut": False, "distributionAgreed": False,
                   "tasks": [{"id": "one", "category": "fixture", "critical": False}]}
        valid = p.telemetry._ev.evaluate(json.dumps(dataset).encode(), "")
        p.render(summary(), valid)
        empty = copy.deepcopy(valid)
        for key in ("tasks", "observedTasks", "missingTasks", "passedTasks", "integrityPassedTasks", "minimumTasks", "target", "pointRate", "wilsonLower"):
            empty[key] = 0
        empty.update(accepted=True, allTasksPassed=True, reasons=[], categories={})
        invalid = [empty]
        for target in (0, 1):
            edited = copy.deepcopy(valid); edited["target"] = target; invalid.append(edited)
        edited = copy.deepcopy(valid); edited["minimumTasks"] = 380; invalid.append(edited)
        for report in invalid:
            with self.assertRaises(ValueError):
                p.render(summary(), report)
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "summary.json"; source.write_text(json.dumps(summary()))
            benchmark = Path(directory) / "benchmark.json"; benchmark.write_text(json.dumps(empty))
            output = Path(directory) / "panel.html"
            with contextlib.redirect_stderr(io.StringIO()):
                result = p.main(["--telemetry", str(source), "--benchmark", str(benchmark), "--output", str(output)])
            self.assertEqual(2, result)
            self.assertFalse(output.exists())

    def test_infinite_aggregate_import_cli_refuses_panel(self):
        report = summary()
        report["runs"].append(copy.deepcopy(report["runs"][0]))
        report["runs"][1]["runId"] = "retry"
        for run in report["runs"]:
            run.update(wallMs=1e308, waitMs=0, remainderMs=1e308)
        report.update(wallMs=float("inf"), waitMs=0, remainderMs=float("inf"), outcomes={"passed": 0, "failed": 2, "cancelled": 0})
        report["usage"] = p.telemetry._ev.usage_summary([r["usage"] for r in report["runs"]], 2)
        report["costUsd"]["missingRuns"] = 2
        with self.assertRaises(ValueError):
            p.render(report)
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "summary.json"
            source.write_text(json.dumps(report).replace("Infinity", "1e309"))
            output = Path(directory) / "panel.html"
            error = io.StringIO()
            with contextlib.redirect_stderr(error):
                result = p.main(["--telemetry", str(source), "--output", str(output)])
            self.assertEqual(2, result)
            self.assertFalse(output.exists())
            self.assertNotIn("Traceback", error.getvalue())

    def test_deep_json_cli_generic_failure_without_private_path(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "private-summary.json"
            source.write_text("[" * 2000 + "0" + "]" * 2000)
            output = Path(directory) / "panel.html"
            error = io.StringIO()
            with contextlib.redirect_stderr(error):
                result = p.main(["--telemetry", str(source), "--output", str(output)])
            self.assertEqual(2, result)
            self.assertIn("Control panel schema or file error", error.getvalue())
            self.assertNotIn("private-summary", error.getvalue())
            self.assertNotIn("Traceback", error.getvalue())
            self.assertFalse(output.exists())

    def test_contradictory_accepted_headline_rejected(self):
        dataset = {"id": "fabricated-test-only", "version": "1", "synthetic": False, "heldOut": True, "distributionAgreed": True,
                   "tasks": [{"id": str(i), "category": "fixture", "critical": False} for i in range(381)]}
        rows = [{"taskId": str(i), "runId": "r", "producerId": "p", "graderId": "g", "evidence": "fabricated fixture",
                 "passed": True, "integrityPassed": True, "latencyMs": 0, "costUsd": 0, "synthetic": False, "heldOut": True, "independentGrading": True} for i in range(381)]
        report = p.telemetry._ev.evaluate(json.dumps(dataset).encode(), "\n".join(json.dumps(r) for r in rows))
        self.assertTrue(report["accepted"])
        self.assertIn("Accepted for submitted dataset", p.render(summary(), report))
        for key, value in (("passedTasks", 380), ("missingTasks", 1), ("integrityPassedTasks", 380), ("reasons", ["task_failure"]), ("wilsonLower", 1)):
            changed = copy.deepcopy(report); changed[key] = value
            with self.assertRaises(ValueError):
                p.render(summary(), changed)
        report["benchmark"] = {"schemaVersion": 1, "bindings": {"datasetSha256": report["datasetSha256"], "rubricSha256": "a" * 64, "modelConfigId": "m", "campaignId": "c", "producerId": "p", "graderId": "g", "humanCalibrationId": "h"},
                               "expectedTrialsPerTask": 1, "exactTrialCounts": True, "bindingErrors": [], "resultsSha256": "a" * 64, "planSha256": "b" * 64, "humanReview": "Self-reported", "predeclaration": "Self-reported"}
        p.render(summary(), report)
        for key, value in (("exactTrialCounts", False), ("bindingErrors", [{"line": 1, "reason": "invalid"}])):
            changed = copy.deepcopy(report); changed["benchmark"][key] = value
            with self.assertRaises(ValueError):
                p.render(summary(), changed)
        changed = copy.deepcopy(report); changed["benchmark"]["bindings"]["producerId"] = "g"
        with self.assertRaises(ValueError):
            p.render(summary(), changed)

    def test_benchmark_scope_is_escaped_and_verdict_is_scoped(self):
        dataset = {"id": "fixture", "version": "1", "synthetic": True, "heldOut": False, "distributionAgreed": False,
                   "tasks": [{"id": "one", "category": "fixture", "critical": False}]}
        report = p.telemetry._ev.evaluate(json.dumps(dataset).encode(), "")
        report["scope"] = '<script>alert("private")</script>'
        page = p.render(summary(), report)
        self.assertIn("Blocked for submitted dataset", page)
        self.assertIn("&lt;script&gt;", page)
        self.assertNotIn('<script>', page)
        report["usage"]["rawPrompt"] = "secret"
        with self.assertRaises(ValueError):
            p.render(summary(), report)

    def test_offline_unknown_failure_and_scope_visible(self):
        page = p.render(summary())
        for expected in ("Unknown", "failed", "no live status", "No benchmark imported", "100% of required checks", "not calendar duration", "AI quality is unmeasured"):
            self.assertIn(expected, page)
        self.assertNotIn("<script", page)
        self.assertNotIn("https://", page)

    def test_html_escaping(self):
        self.assertEqual("&lt;script&gt;&amp;&quot;", p.escaped('<script>&"'))
        report = summary(); report["runs"][0]["taskId"] = "<img-onerror>"
        with self.assertRaises(ValueError):
            p.render(report)

    def test_schema_and_metric_tampering_rejected(self):
        report = summary(); report["scope"] = "<script>private</script>"
        with self.assertRaises(ValueError):
            p.render(report)
        with self.assertRaises(ValueError):
            p.render(summary(), {"accepted": True})

    def test_cli_fresh_output_alias_preservation(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "summary.json"
            source.write_text(json.dumps(summary()))
            output = Path(directory) / "panel.html"
            self.assertEqual(0, p.main(["--telemetry", str(source), "--output", str(output)]))
            previous = source.read_text()
            self.assertEqual(2, p.main(["--telemetry", str(source), "--output", str(source)]))
            self.assertEqual(previous, source.read_text())
            self.assertEqual(2, p.main(["--telemetry", str(source), "--output", str(output)]))


if __name__ == "__main__":
    unittest.main()
