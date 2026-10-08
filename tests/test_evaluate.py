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


def fixture(n=381):
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
    def test_usage_inclusive_subsets_not_counted_twice(self):
        dataset, rows = fixture(1)
        rows[0]["usage"] = {"provider": "openai", "model": "documented-shape-fixture",
                            "accountingConvention": "inclusive", "outputConvention": "inclusive", "inputTokens": 1000,
                            "cachedInputTokens": 600, "cacheWriteInputTokens": 200,
                            "outputTokens": 100, "reasoningOutputTokens": 40}
        usage = score(dataset, rows)["usage"]["fields"]
        self.assertEqual(1000, usage["inputTokens"]["completeTotal"])
        self.assertEqual(1100, usage["totalTokens"]["completeTotal"])

    def test_usage_exclusive_reads_larger_than_uncached_input(self):
        dataset, rows = fixture(1)
        rows[0]["usage"] = {"provider": "anthropic", "model": "documented-shape-fixture",
                            "accountingConvention": "exclusive", "outputConvention": "inclusive", "inputTokens": 10,
                            "cachedInputTokens": 2000, "cacheWriteInputTokens": 100,
                            "outputTokens": 100}
        report = score(dataset, rows)
        self.assertEqual([], report["invalidRecords"])
        self.assertEqual(2110, report["usage"]["fields"]["inputTokens"]["completeTotal"])
        self.assertEqual(2210, report["usage"]["fields"]["totalTokens"]["completeTotal"])

    def test_usage_missing_not_zero_and_complete_totals_require_coverage(self):
        dataset, rows = fixture(2)
        rows[0]["usage"] = {"provider": "fixture", "model": "fixture", "accountingConvention": "exclusive", "outputConvention": "inclusive",
                            "inputTokens": 10, "cachedInputTokens": 2000, "outputTokens": 0}
        fields = score(dataset, rows)["usage"]["fields"]
        self.assertIsNone(fields["inputTokens"]["sumObserved"])
        self.assertEqual(0, fields["outputTokens"]["sumObserved"])
        self.assertIsNone(fields["outputTokens"]["completeTotal"])
        self.assertEqual(1, fields["outputTokens"]["missingTrials"])
        self.assertIsNone(fields["totalTokens"]["sumObserved"])

    def test_usage_invalid_counts_and_subsets_reject_trials(self):
        base = {"provider": "fixture", "model": "fixture", "accountingConvention": "inclusive", "outputConvention": "inclusive",
                "inputTokens": 100, "outputTokens": 10, "cachedInputTokens": 60, "cacheWriteInputTokens": 20}
        for change in ({"inputTokens": True}, {"outputTokens": -1}, {"cachedInputTokens": None},
                       {"cacheWriteInputTokens": 50}, {"cachedInputTokens": 101},
                       {"reasoningOutputTokens": 11}, {"accountingConvention": "guess"},
                       {"provider": ""}, {"outputConvention": "guess"}, {"inputTokens": 10 ** 400},
                       {"inputTokens": 1.5}, {"inputTokens": "1"}, {"inputTokens": float("nan")}):
            with self.subTest(change=change):
                dataset, rows = fixture(1)
                rows[0]["usage"] = {**base, **change}
                self.assertIn("invalid_results", score(dataset, rows)["reasons"])

    def test_usage_retries_included_without_inflating_task_count(self):
        dataset, rows = fixture(1)
        rows[0]["usage"] = {"provider": "fixture", "model": "fixture", "accountingConvention": "inclusive", "outputConvention": "inclusive",
                            "inputTokens": 100, "outputTokens": 10}
        rows.append({**rows[0], "runId": "retry", "passed": False})
        report = score(dataset, rows)
        self.assertEqual(1, report["tasks"])
        self.assertEqual(2, report["usage"]["validTrials"])
        self.assertEqual(220, report["usage"]["fields"]["totalTokens"]["completeTotal"])

    def test_usage_exclusive_reasoning_output_normalizes_and_missing_stays_unknown(self):
        dataset, rows = fixture(1)
        rows[0]["usage"] = {"provider": "google", "model": "documented-shape-fixture",
                            "accountingConvention": "inclusive", "outputConvention": "exclusive",
                            "inputTokens": 1000, "cachedInputTokens": 600,
                            "outputTokens": 20, "reasoningOutputTokens": 100}
        fields = score(dataset, rows)["usage"]["fields"]
        self.assertEqual(120, fields["outputTokens"]["completeTotal"])
        self.assertEqual(1120, fields["totalTokens"]["completeTotal"])
        del rows[0]["usage"]["reasoningOutputTokens"]
        fields = score(dataset, rows)["usage"]["fields"]
        self.assertIsNone(fields["outputTokens"]["sumObserved"])
        self.assertIsNone(fields["totalTokens"]["sumObserved"])

    def test_usage_mixed_conventions_aggregate_normalized_totals(self):
        dataset, rows = fixture(2)
        rows[0]["usage"] = {"provider": "fixture-a", "model": "fixture", "accountingConvention": "inclusive",
                            "outputConvention": "inclusive", "inputTokens": 1000, "outputTokens": 10}
        rows[1]["usage"] = {"provider": "fixture-b", "model": "fixture", "accountingConvention": "exclusive",
                            "outputConvention": "inclusive", "inputTokens": 10, "cachedInputTokens": 1000,
                            "cacheWriteInputTokens": 100, "outputTokens": 10}
        fields = score(dataset, rows)["usage"]["fields"]
        self.assertEqual(2110, fields["inputTokens"]["completeTotal"])
        self.assertEqual(2130, fields["totalTokens"]["completeTotal"])

    def test_usage_partial_output_totals_expose_missing_trial(self):
        dataset, rows = fixture(2)
        base = {"provider": "fixture", "model": "fixture", "accountingConvention": "inclusive",
                "outputConvention": "exclusive", "inputTokens": 100, "outputTokens": 20}
        rows[0]["usage"] = {**base, "reasoningOutputTokens": 10}
        rows[1]["usage"] = base
        fields = score(dataset, rows)["usage"]["fields"]
        self.assertEqual(30, fields["outputTokens"]["sumObserved"])
        self.assertIsNone(fields["outputTokens"]["completeTotal"])
        self.assertEqual(1, fields["outputTokens"]["observedTrials"])
        self.assertEqual(1, fields["outputTokens"]["missingTrials"])
        self.assertEqual(130, fields["totalTokens"]["sumObserved"])
        self.assertIsNone(fields["totalTokens"]["completeTotal"])

    def test_380_insufficient(self):
        self.assertFalse(score(*fixture(380))["accepted"])

    def test_381_statistical_boundary(self):
        report = score(*fixture())
        self.assertTrue(report["accepted"])
        self.assertTrue(report["allTasksPassed"])
        self.assertEqual(1.0, report["requiredTaskPassRate"])
        self.assertGreaterEqual(report["wilsonLower"], .99)
        self.assertEqual(.99, report["target"])
        self.assertEqual(.95, report["confidence"])
        self.assertEqual(report["minimumTasks"], 381)

    def test_explicit_legacy_target_and_computed_minimum(self):
        report = score(*fixture(73), target=.95, minimum_tasks=73)
        self.assertTrue(report["accepted"])
        self.assertEqual(.95, report["target"])
        self.assertEqual(73, report["minimumTasks"])
        self.assertEqual(.95, report["confidence"])
        for target, size, minimum in ((.99, 380, 381), (.95, 72, 73)):
            report = score(*fixture(size), target=target, minimum_tasks=1)
            self.assertFalse(report["accepted"])
            self.assertEqual(minimum, report["minimumTasks"])
            self.assertIn("insufficient_distinct_tasks", report["reasons"])

    def test_cli_default_boundary_keeps_confidence_distinct_from_target(self):
        with tempfile.TemporaryDirectory() as tmp:
            data, results, output = [Path(tmp) / n for n in ("dataset.json", "results.jsonl", "report.json")]
            for size, expected in ((380, 1), (381, 0)):
                dataset, rows = fixture(size)
                data.write_text(json.dumps(dataset))
                results.write_text("\n".join(json.dumps(r) for r in rows))
                self.assertEqual(expected, ev.main(["--dataset", str(data), "--results", str(results),
                                                   "--output", str(output)]))
                report = json.loads(output.read_text())
                self.assertEqual(.99, report["target"])
                self.assertEqual(381, report["minimumTasks"])
                self.assertEqual(.95, report["confidence"])
                self.assertEqual(expected == 0, report["accepted"])

    def test_noncritical_failure_rejects_despite_high_confidence(self):
        dataset, rows = fixture(1000)
        rows[-1]["passed"] = False
        for target in (.99, .95, .5):
            with self.subTest(target=target):
                report = score(dataset, rows, target=target)
                self.assertGreater(report["wilsonLower"], target)
                self.assertFalse(report["accepted"])
                self.assertFalse(report["allTasksPassed"])
                self.assertEqual(1.0, report["requiredTaskPassRate"])
                self.assertIn("task_failure", report["reasons"])
                self.assertNotIn("critical_task_failure", report["reasons"])

    def test_failed_retry_rejects_despite_high_aggregate(self):
        dataset, rows = fixture(1000)
        rows.append(dict(rows[-1], runId="failed-retry", passed=False))
        report = score(dataset, rows)
        self.assertGreater(report["wilsonLower"], .99)
        self.assertEqual(999, report["passedTasks"])
        self.assertEqual(1000, report["tasks"])
        self.assertIn("task_failure", report["reasons"])
        self.assertFalse(report["accepted"])

    def test_all_pass_does_not_replace_sample_or_provenance_gates(self):
        for size, synthetic, reason in ((380, False, "insufficient_distinct_tasks"),
                                        (381, True, "noncertifying_provenance")):
            with self.subTest(size=size, synthetic=synthetic):
                dataset, rows = fixture(size)
                dataset["synthetic"] = synthetic
                report = score(dataset, rows)
                self.assertTrue(report["allTasksPassed"])
                self.assertNotIn("task_failure", report["reasons"])
                self.assertIn(reason, report["reasons"])
                self.assertFalse(report["accepted"])

    def test_cli_noncritical_failure_cannot_lower_target_to_accept(self):
        with tempfile.TemporaryDirectory() as tmp:
            data, results, output = [Path(tmp) / n for n in ("dataset.json", "results.jsonl", "report.json")]
            dataset, rows = fixture(1000)
            rows[-1]["passed"] = False
            data.write_text(json.dumps(dataset))
            results.write_text("\n".join(json.dumps(r) for r in rows))
            args = ["--dataset", str(data), "--results", str(results), "--output", str(output)]
            for target in ("0.99", "0.95", "0.5"):
                with self.subTest(target=target):
                    self.assertEqual(1, ev.main(args + ["--target", target]))
                    report = json.loads(output.read_text())
                    self.assertGreater(report["wilsonLower"], float(target))
                    self.assertFalse(report["accepted"])
                    self.assertIn("task_failure", report["reasons"])

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
        self.assertEqual(score(dataset, rows)["passedTasks"], 380)

    def test_unknown_task(self):
        dataset, rows = fixture()
        rows.append(dict(rows[0], taskId="secret-unknown"))
        self.assertIn("invalid_results", score(dataset, rows)["reasons"])

    def test_missing_task(self):
        dataset, rows = fixture()
        report = score(dataset, rows[:-1])
        self.assertEqual(report["tasks"], 381)
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
        dataset, rows = fixture(1000)
        rows[0]["passed"] = False
        report = score(dataset, rows)
        self.assertGreater(report["wilsonLower"], .99)
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
        self.assertEqual(sum(c["tasks"] for c in report["categories"].values()), 381)
        self.assertEqual(report["latencyMs"]["p95"], 100)
        self.assertEqual(report["costUsd"]["count"], 381)

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
        self.assertEqual(report["pairedComparison"]["unchanged"], 379)

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
        self.assertFalse(score(*fixture(), minimum_tasks=382)["accepted"])
        self.assertEqual(score(*fixture(), minimum_tasks=1)["minimumTasks"], 381)

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
