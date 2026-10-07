"""Fabricated traces check accounting, not live AI speed or accuracy."""
import copy
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("telemetry_tests_impl", Path(__file__).resolve().parents[1] / "scripts/telemetry.py")
t = importlib.util.module_from_spec(spec)
spec.loader.exec_module(t)


def events(outcome="passed", run="r1"):
    kinds = [("start", 0, {}), ("wait_start", 2, {}), ("wait_end", 7, {}), ("tool", 8, {"outcome": "denied"}), ("end", 10, {"outcome": outcome})]
    return [{"event": e, "taskId": "task", "runId": run, "sequence": i, "elapsedMs": ms, **fields} for i, (e, ms, fields) in enumerate(kinds)]


def text(rows):
    return "\n".join(json.dumps(r) for r in rows)


class TelemetryTests(unittest.TestCase):
    def test_overflowing_imported_summary_and_trace_rejected(self):
        report = t.summarize([text(events()), text(events(run="retry"))])
        for run in report["runs"]:
            run.update(wallMs=1e308, waitMs=0, remainderMs=1e308)
        report.update(wallMs=float("inf"), waitMs=0, remainderMs=float("inf"))
        with self.assertRaises(ValueError):
            t.validate_summary(report)
        imported = t.strict_json(json.dumps(report).replace("Infinity", "1e309"))
        with self.assertRaises(ValueError):
            t.validate_summary(imported)
        traces = []
        for run_id in ("first", "retry"):
            rows = events(run=run_id)
            rows[-1]["elapsedMs"] = 1e308
            traces.append(text(rows))
        with self.assertRaises(ValueError):
            t.summarize(traces)

    def test_deep_json_cli_generic_failure_without_private_path(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "private-trace.jsonl"
            source.write_text("[" * 2000 + "0" + "]" * 2000)
            output = Path(directory) / "summary.json"
            error = io.StringIO()
            with contextlib.redirect_stderr(error):
                result = t.main(["summarize", "--trace", str(source), "--output", str(output)])
            self.assertEqual(2, result)
            self.assertIn("Telemetry schema or file error", error.getvalue())
            self.assertNotIn("private-trace", error.getvalue())
            self.assertNotIn("Traceback", error.getvalue())
            self.assertFalse(output.exists())

    def test_golden_provider_accounting(self):
        golden = json.loads((Path(__file__).resolve().parents[1] / "skills/ai-evaluation/references/measurement-golden-cases.json").read_text())
        for case in golden["usage"]:
            rows = events()
            rows.insert(-1, {"event": "usage", "taskId": "task", "runId": "r1", "sequence": 4, "elapsedMs": 9, "usage": case["usage"]})
            rows[-1]["sequence"] = 5
            report = t.summarize([text(rows)])
            self.assertEqual(case["totalTokens"], report["usage"]["fields"]["totalTokens"]["completeTotal"])

    def test_failures_retries_unknown_and_wait_retained(self):
        report = t.summarize([text(events("failed")), text(events("passed", "retry"))])
        self.assertEqual({"passed": 1, "failed": 1, "cancelled": 0}, report["outcomes"])
        self.assertEqual((20, 10, 10, 2), (report["wallMs"], report["waitMs"], report["remainderMs"], report["toolDenials"]))
        self.assertIsNone(report["costUsd"]["completeTotal"])
        self.assertIsNone(report["usage"]["fields"]["totalTokens"]["sumObserved"])
        self.assertEqual(report, t.validate_summary(report))

    def test_content_extra_nested_usage_and_duplicate_json_rejected(self):
        for key in ("prompt", "response", "credential", "toolArguments"):
            rows = events()
            rows[1][key] = "private"
            with self.assertRaises(ValueError):
                t.summarize([text(rows)])
        with self.assertRaises(ValueError):
            t.summarize(['{"event":"start","event":"end"}'])
        rows = events()
        rows[3] = {**rows[3], "event": "usage", "usage": {"provider": "fixture", "model": "fixture", "prompt": "secret"}}
        del rows[3]["outcome"]
        with self.assertRaises(ValueError):
            t.summarize([text(rows)])

    def test_invalid_intervals_order_id_and_terminal(self):
        variants = []
        rows = events(); rows[2]["event"] = "wait_start"; variants.append(rows)
        rows = events(); rows[1]["event"] = "wait_end"; variants.append(rows)
        rows = events(); rows[2]["event"] = "tool"; rows[2]["outcome"] = "passed"; variants.append(rows)
        rows = events(); rows[2]["elapsedMs"] = 1; variants.append(rows)
        rows = events(); rows[2]["sequence"] = 7; variants.append(rows)
        rows = events(); rows[2]["runId"] = "other"; variants.append(rows)
        variants.append(events()[:-1])
        rows = events(); rows[0]["taskId"] = "path/secret"; variants.append(rows)
        for rows in variants:
            with self.assertRaises(ValueError):
                t.summarize([text(rows)])
        with self.assertRaises(ValueError):
            t.summarize([text(events()), text(events())])

    def test_recorder_observes_clock_rejects_before_write_and_preserves_output(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "run.jsonl"
            with patch.object(t.time, "monotonic_ns", side_effect=[1000000, 3000000, 4000000]):
                recorder = t.Recorder(path, "t", "r")
                with self.assertRaises(ValueError):
                    recorder.emit("tool", outcome="passed", prompt="secret")
                recorder.emit("end", outcome="failed")
            report = t.summarize([path.read_text()])
            self.assertEqual(3, report["wallMs"])
            self.assertNotIn("secret", path.read_text())
            with self.assertRaises(FileExistsError):
                t.Recorder(path, "t", "r")

    def test_missing_some_usage_cost_never_complete_zero_is_known(self):
        rows = events()
        rows.insert(-1, {"event": "usage", "taskId": "task", "runId": "r1", "sequence": 4, "elapsedMs": 9, "costUsd": 0, "usage": {"provider": "fixture", "model": "fixture", "accountingConvention": "inclusive", "outputConvention": "inclusive", "inputTokens": 0, "outputTokens": 0}})
        rows[-1]["sequence"] = 5
        report = t.summarize([text(rows), text(events("failed", "retry"))])
        self.assertEqual(0, report["costUsd"]["sumObserved"])
        self.assertIsNone(report["costUsd"]["completeTotal"])
        self.assertEqual(0, report["usage"]["fields"]["totalTokens"]["sumObserved"])
        self.assertIsNone(report["usage"]["fields"]["totalTokens"]["completeTotal"])

    def test_summary_tampering_rejected(self):
        report = t.summarize([text(events())])
        for field, value in (("wallMs", 0), ("outcomes", {"passed": 1, "failed": 99, "cancelled": 0}), ("prompt", "secret")):
            edited = copy.deepcopy(report); edited[field] = value
            with self.assertRaises(ValueError):
                t.validate_summary(edited)

    def test_symlink_output_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory); target = root / "target"; target.mkdir()
            link = root / "link"
            try:
                link.symlink_to(target, target_is_directory=True)
            except OSError:
                self.skipTest("Platform lacks symlink permission")
            with self.assertRaises(ValueError):
                t.Recorder(link / "new", "t", "r")


if __name__ == "__main__":
    unittest.main()
