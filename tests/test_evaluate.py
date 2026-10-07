"""Statistical fixtures are fabricated test data, never evidence of live quality."""
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("evaluate", Path(__file__).resolve().parents[1] / "scripts/evaluate.py")
ev = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ev)


def fixture(n=73):
    dataset = {"id": "fabricated-test-only", "version": "1", "synthetic": False,
               "heldOut": True, "distributionAgreed": True,
               "tasks": [{"id": str(i), "category": "code" if i % 2 else "research", "critical": i == 0}
                         for i in range(n)]}
    rows = [{"taskId": str(i), "runId": "1", "producerId": "producer", "graderId": "grader",
             "passed": True, "integrityPassed": True, "latencyMs": 100, "costUsd": .01,
             "evidence": "fabricated test assertion", "synthetic": False, "heldOut": True,
             "independentGrading": True} for i in range(n)]
    return dataset, rows


def score(dataset, rows, **kwargs):
    return ev.evaluate(json.dumps(dataset).encode(), "\n".join(json.dumps(r) for r in rows), **kwargs)


class EvaluationTests(unittest.TestCase):
    def test_72_insufficient(self):
        self.assertFalse(score(*fixture(72))["accepted"])

    def test_73_statistical_boundary(self):
        report = score(*fixture())
        self.assertTrue(report["accepted"])
        self.assertGreaterEqual(report["wilsonLower"], .95)
        self.assertEqual(report["minimumTasks"], 73)

    def test_99_of_100_not_enough(self):
        dataset, rows = fixture(100)
        rows[-1]["passed"] = False
        self.assertFalse(score(dataset, rows)["accepted"])

    def test_attempts_not_samples(self):
        dataset, rows = fixture(1)
        rows = [dict(rows[0], runId=str(i)) for i in range(100)]
        report = score(dataset, rows)
        self.assertEqual(report["tasks"], 1)
        self.assertFalse(report["accepted"])

    def test_retry_failure_remains(self):
        dataset, rows = fixture()
        rows.append(dict(rows[-1], runId="2", passed=False))
        self.assertEqual(score(dataset, rows)["passedTasks"], 72)

    def test_unknown_task(self):
        dataset, rows = fixture()
        rows.append(dict(rows[0], taskId="secret-unknown"))
        self.assertIn("invalid_results", score(dataset, rows)["reasons"])

    def test_missing_task(self):
        dataset, rows = fixture()
        report = score(dataset, rows[:-1])
        self.assertEqual(report["tasks"], 73)
        self.assertEqual(report["missingTasks"], 1)
        self.assertFalse(report["accepted"])

    def test_duplicate_trial(self):
        dataset, rows = fixture()
        rows.append(rows[0])
        self.assertFalse(score(dataset, rows)["accepted"])

    def test_invalid_record_shapes(self):
        for invalid in (None, [], True, "sensitive payload"):
            dataset, rows = fixture()
            rows.append(invalid)
            self.assertFalse(score(dataset, rows)["accepted"])

    def test_required_fields(self):
        dataset, rows = fixture()
        for key in tuple(rows[0]):
            broken = [dict(r) for r in rows]
            del broken[0][key]
            self.assertFalse(score(dataset, broken)["accepted"], key)

    def test_boolean_and_nonfinite_metrics(self):
        for value in (True, False, -1, None, float("nan"), float("inf"), "1"):
            for key in ("costUsd", "latencyMs"):
                dataset, rows = fixture()
                rows[0][key] = value
                self.assertFalse(score(dataset, rows)["accepted"])

    def test_nullable_flags_rejected(self):
        for key in ("passed", "integrityPassed", "synthetic", "heldOut", "independentGrading"):
            dataset, rows = fixture()
            rows[0][key] = None
            self.assertFalse(score(dataset, rows)["accepted"])

    def test_metric_overflow_fails_safe(self):
        dataset, rows = fixture()
        rows[0]["costUsd"] = 10 ** 400
        self.assertFalse(score(dataset, rows)["accepted"])
        dataset, rows = fixture()
        for row in rows:
            row["costUsd"] = 1e308
        with self.assertRaises(ev.InputError):
            score(dataset, rows)

    def test_synthetic_never_accepts(self):
        dataset, rows = fixture()
        dataset["synthetic"] = True
        self.assertFalse(score(dataset, rows)["accepted"])
        dataset["synthetic"] = False
        rows[0]["synthetic"] = True
        self.assertFalse(score(dataset, rows)["accepted"])

    def test_dataset_provenance(self):
        for key in ("heldOut", "distributionAgreed"):
            dataset, rows = fixture()
            dataset[key] = False
            self.assertFalse(score(dataset, rows)["accepted"])

    def test_independent_provenance(self):
        for change in ({"graderId": " producer "}, {"independentGrading": False}, {"heldOut": False}):
            dataset, rows = fixture()
            rows[0].update(change)
            self.assertFalse(score(dataset, rows)["accepted"])

    def test_integrity_required(self):
        dataset, rows = fixture()
        rows[-1]["integrityPassed"] = False
        self.assertIn("integrity_failure", score(dataset, rows)["reasons"])

    def test_critical_failure_even_high_aggregate(self):
        dataset, rows = fixture(500)
        rows[0]["passed"] = False
        report = score(dataset, rows)
        self.assertGreater(report["wilsonLower"], .95)
        self.assertIn("critical_task_failure", report["reasons"])

    def test_digest_and_no_evidence_exposure(self):
        dataset, rows = fixture()
        rows[0]["evidence"] = "PRIVATE-CREDENTIAL-PAYLOAD"
        raw = json.dumps(dataset).encode()
        report = score(dataset, rows)
        self.assertEqual(report["datasetSha256"], hashlib.sha256(raw).hexdigest())
        self.assertNotIn("PRIVATE-CREDENTIAL", json.dumps(report))

    def test_categories_and_metrics(self):
        report = score(*fixture())
        self.assertEqual(sum(c["tasks"] for c in report["categories"].values()), 73)
        self.assertEqual(report["latencyMs"]["p95"], 100)
        self.assertEqual(report["costUsd"]["count"], 73)

    def test_expected_dataset_digest(self):
        dataset, rows = fixture()
        digest = hashlib.sha256(json.dumps(dataset).encode()).hexdigest()
        self.assertTrue(score(dataset, rows, expected_dataset_sha256=digest.upper())["accepted"])
        for invalid in ("0" * 64, "bad", None, "g" * 64):
            if invalid is None:
                continue
            with self.assertRaises(ev.InputError):
                score(dataset, rows, expected_dataset_sha256=invalid)

    def test_confidence_method(self):
        report = score(*fixture())
        self.assertEqual(report["confidenceMethod"]["name"], "wilson")
        self.assertEqual(report["confidenceMethod"]["sidedness"], "two-sided")
        self.assertAlmostEqual(report["confidenceMethod"]["z"], 1.96, places=3)

    def test_paired_baseline_does_not_change_acceptance(self):
        dataset, candidate = fixture()
        baseline = [dict(row) for row in candidate]
        baseline[1]["passed"] = False
        report = score(dataset, candidate, baseline_results_text="\n".join(json.dumps(r) for r in baseline))
        self.assertTrue(report["accepted"])
        self.assertEqual(report["pairedComparison"]["improved"], 1)
        self.assertEqual(report["pairedComparison"]["regressed"], 0)
        candidate[2]["integrityPassed"] = False
        report = score(dataset, candidate, baseline_results_text="\n".join(json.dumps(r) for r in baseline))
        self.assertFalse(report["accepted"])
        self.assertEqual(report["pairedComparison"]["regressed"], 1)
        self.assertEqual(report["pairedComparison"]["unchanged"], 71)

    def test_invalid_baseline_not_paired(self):
        dataset, candidate = fixture()
        for baseline in (candidate[:-1], candidate + [dict(candidate[0], taskId="unknown")]):
            report = score(dataset, candidate, baseline_results_text="\n".join(json.dumps(r) for r in baseline))
            self.assertTrue(report["accepted"])
            self.assertFalse(report["pairedComparison"]["available"])

    def test_bad_dataset(self):
        for change in ({"tasks": []}, {"heldOut": None}, {"id": ""}):
            dataset, rows = fixture()
            dataset.update(change)
            with self.assertRaises(ev.InputError):
                score(dataset, rows)

    def test_duplicate_dataset_id(self):
        dataset, rows = fixture()
        dataset["tasks"].append(dataset["tasks"][0])
        with self.assertRaises(ev.InputError):
            score(dataset, rows)

    def test_duplicate_properties(self):
        with self.assertRaises(ev.InputError):
            ev.strict_json('{"id":1,"id":2}')

    def test_blank_and_malformed_records(self):
        dataset, rows = fixture()
        raw = json.dumps(dataset).encode()
        for extra in ("\n\n", "\nprivate-invalid-json"):
            report = ev.evaluate(raw, "\n".join(json.dumps(r) for r in rows) + extra)
            self.assertFalse(report["accepted"])

    def test_target_and_minimum(self):
        for target in (True, 0, 1, float("nan")):
            with self.assertRaises(ev.InputError):
                score(*fixture(), target=target)
        self.assertFalse(score(*fixture(), minimum_tasks=100)["accepted"])
        self.assertEqual(score(*fixture(), minimum_tasks=1)["minimumTasks"], 73)

    def test_cli_exit_and_safe_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            data, results, output = [Path(tmp) / n for n in ("dataset.json", "results.jsonl", "report.json")]
            dataset, rows = fixture()
            data.write_text(json.dumps(dataset))
            results.write_text("\n".join(json.dumps(r) for r in rows))
            args = ["--dataset", str(data), "--results", str(results), "--output", str(output)]
            self.assertEqual(ev.main(args), 0)
            dataset["synthetic"] = True
            data.write_text(json.dumps(dataset))
            self.assertEqual(ev.main(args), 1)
            data.write_text("PRIVATE-INVALID-PAYLOAD")
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr):
                self.assertEqual(ev.main(args), 2)
            self.assertNotIn("PRIVATE", stderr.getvalue())

    def test_output_does_not_overwrite_input(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "source.json"
            path.write_text("original")
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(ev.main(["--dataset", str(path), "--results", str(path),
                                          "--output", str(path)]), 2)
            self.assertEqual(path.read_text(), "original")


if __name__ == "__main__":
    unittest.main()
