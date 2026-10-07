"""Fabricated declarations test software only, never live AI performance."""
import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
# Installed helper imports its evaluator sibling, not repository-root packages.
sys.path.insert(0, str(SCRIPTS))
try:
    spec = importlib.util.spec_from_file_location("benchmark", SCRIPTS / "benchmark.py")
    benchmark = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(benchmark)
finally:
    sys.path.pop(0)


def fixture(size=73, trials=1):
    dataset = {"id": "fabricated-software-test", "version": "1", "synthetic": False,
               "heldOut": True, "distributionAgreed": True,
               "tasks": [{"id": str(i), "category": "engineering", "critical": i == 0}
                         for i in range(size)]}
    rubric = {"id": "fabricated-rubric", "version": "1",
              "criteria": [{"id": "correct", "description": "Fabricated assertion", "required": True}]}
    data, rules = json.dumps(dataset).encode(), json.dumps(rubric).encode()
    plan = benchmark.prepare(data, rules, model_config_id="config-1", campaign_id="campaign-1",
                             producer_id="producer", grader_id="grader", human_calibration_id="cal-1",
                             expected_trials=trials)
    rows = [{"taskId": str(i), "runId": str(j), "passed": True, "integrityPassed": True,
             "synthetic": False, "heldOut": True, "independentGrading": True,
             "humanReviewed": True, "latencyMs": 100, "costUsd": .01,
             "evidence": "fabricated test assertion", **{k: plan[k] for k in benchmark.BINDINGS}}
            for i in range(size) for j in range(trials)]
    return plan, data, rules, rows


def finish(parts):
    plan, data, rules, rows = parts
    return benchmark.finalize(plan, data, rules, "\n".join(json.dumps(r) for r in rows))


class BenchmarkTests(unittest.TestCase):
    def test_shared_golden_vectors_and_checksum(self):
        golden_path = SCRIPTS.parent / "skills/ai-evaluation/references/measurement-golden-cases.json"
        raw = golden_path.read_bytes()
        self.assertEqual("82bc94a47590131519aee11c39a3aca924b8e28cb9356aab3f57f84ffa67fb5b",
                         hashlib.sha256(raw).hexdigest())
        for vector in json.loads(raw)["benchmark"]:
            with self.subTest(vector=vector["id"]):
                plan, data, rules, rows = fixture(vector["tasks"], vector["expectedTrials"])
                rows = [row for row in rows if int(row["runId"]) < vector["actualTrials"]]
                for row in rows:
                    if int(row["taskId"]) >= vector["tasks"] - vector["failedTasks"]:
                        row["passed"] = False
                self.assertEqual(vector["accepted"], finish((plan, data, rules, rows))["accepted"])

    def test_complete_declared_fixture_matches_existing_scorer(self):
        parts = fixture()
        report = finish(parts)
        self.assertTrue(report["accepted"])
        self.assertTrue(report["benchmark"]["exactTrialCounts"])
        self.assertEqual(73, report["tasks"])
        self.assertEqual([], report["reasons"])
        self.assertIn("Self-reported", report["benchmark"]["humanReview"])
        self.assertNotIn("fabricated test assertion", json.dumps(report))

    def test_sample_size_and_synthetic_declarations_still_reject(self):
        self.assertIn("insufficient_distinct_tasks", finish(fixture(72))["reasons"])
        plan, data, rules, rows = fixture()
        dataset = json.loads(data)
        dataset["synthetic"] = True
        data = json.dumps(dataset).encode()
        plan["datasetSha256"] = benchmark.digest(data)
        for row in rows:
            row["datasetSha256"] = plan["datasetSha256"]
        self.assertIn("noncertifying_provenance", finish((plan, data, rules, rows))["reasons"])

    def test_failed_trial_rejects_despite_high_sample(self):
        parts = fixture(500)
        parts[3][-1]["passed"] = False
        report = finish(parts)
        self.assertGreater(report["wilsonLower"], .95)
        self.assertFalse(report["accepted"])
        self.assertIn("task_failure", report["reasons"])

    def test_failed_retry_remains_failure(self):
        parts = fixture(73, 2)
        parts[3][-1]["passed"] = False
        report = finish(parts)
        self.assertTrue(report["benchmark"]["exactTrialCounts"])
        self.assertFalse(report["accepted"])

    def test_exact_count_blocks_missing_and_extra_trials(self):
        for extra in (False, True):
            parts = fixture()
            if extra:
                parts[3].append({**parts[3][0], "runId": "extra"})
            else:
                parts[3].pop()
            self.assertIn("predeclared_trial_count_mismatch", finish(parts)["reasons"])

    def test_duplicate_and_unknown_records_block(self):
        for changed in ({}, {"taskId": "unknown"}):
            parts = fixture()
            parts[3].append({**parts[3][0], **changed})
            self.assertFalse(finish(parts)["accepted"])

    def test_every_binding_mismatch_and_absence_blocks(self):
        for field in benchmark.BINDINGS:
            for absent in (False, True):
                with self.subTest(field=field, absent=absent):
                    parts = fixture()
                    if absent:
                        del parts[3][0][field]
                    else:
                        parts[3][0][field] = "different"
                    self.assertIn("benchmark_binding_invalid", finish(parts)["reasons"])

    def test_human_review_must_be_true(self):
        for value in (False, None, 1, "true"):
            parts = fixture()
            parts[3][0]["humanReviewed"] = value
            self.assertIn("benchmark_binding_invalid", finish(parts)["reasons"])
        parts = fixture()
        del parts[3][0]["humanReviewed"]
        self.assertFalse(finish(parts)["accepted"])

    def test_integrity_and_independent_grading_remain_required(self):
        for field in ("integrityPassed", "independentGrading", "heldOut"):
            parts = fixture()
            parts[3][0][field] = False
            self.assertFalse(finish(parts)["accepted"])

    def test_changed_dataset_or_rubric_blocks(self):
        plan, data, rules, rows = fixture()
        for changed_data, changed_rules in ((data + b" ", rules), (data, rules + b" ")):
            with self.assertRaises(benchmark.InputError):
                finish((plan, changed_data, changed_rules, rows))

    def test_plan_schema_and_independence_are_strict(self):
        plan, data, rules, rows = fixture()
        for change in ({"producerId": "grader"}, {"target": True}, {"expectedTrials": False},
                       {"expectedTrials": 0}, {"minimumTasks": 0}, {"unexpected": "content"},
                       {"modelConfigId": "contains spaces"}, {"schemaVersion": True},
                       {"createdAt": "2026-01-01T00:00:00"}):
            with self.subTest(change=change), self.assertRaises(benchmark.InputError):
                finish(({**plan, **change}, data, rules, rows))

    def test_rubric_schema_duplicate_criteria_and_json_are_strict(self):
        plan, data, rules, rows = fixture()
        rubric = json.loads(rules)
        bad = [b'{"id":"x","id":"y"}', b'{"x":NaN}', b"[]"]
        duplicate = copy.deepcopy(rubric)
        duplicate["criteria"].append(duplicate["criteria"][0])
        bad.append(json.dumps(duplicate).encode())
        for value in bad:
            with self.assertRaises((benchmark.InputError, ValueError)):
                benchmark.validate_rubric(value)

    def test_nonfinite_exponent_and_dataset_duplicate_properties_reject(self):
        for text in ('{"nested":[1e999]}', '{"id":"one","id":"two"}'):
            with self.assertRaises(benchmark.InputError):
                benchmark.strict_json(text)
        plan, data, rules, rows = fixture()
        invalid = data[:-1] + b', "extra": 1e999}'
        with self.assertRaises(benchmark.InputError):
            benchmark.prepare(invalid, rules, model_config_id="config", campaign_id="campaign",
                              producer_id="producer", grader_id="grader", human_calibration_id="cal")

    def test_unknown_record_and_usage_fields_reject(self):
        parts = fixture()
        parts[3][0]["prompt"] = "private marker"
        self.assertFalse(finish(parts)["accepted"])
        parts = fixture()
        parts[3][0]["usage"] = {"provider": "fixture", "model": "fixture",
                                "accountingConvention": "inclusive", "outputConvention": "inclusive",
                                "inputTokens": 1, "outputTokens": 1, "secret": "private marker"}
        self.assertFalse(finish(parts)["accepted"])

    def test_nonfinite_duplicate_properties_and_blank_rows_reject(self):
        plan, data, rules, rows = fixture()
        for text in ('{"x":NaN}', '{"taskId":"0","taskId":"1"}', "\n\n", "private marker"):
            report = benchmark.finalize(plan, data, rules,
                                        "\n".join(json.dumps(r) for r in rows) + "\n" + text)
            self.assertFalse(report["accepted"])
            self.assertNotIn("private marker", json.dumps(report))

    def test_missing_usage_remains_unknown_and_inclusive_not_doubled(self):
        parts = fixture()
        parts[3][0]["usage"] = {"provider": "fixture", "model": "fixture",
                                "accountingConvention": "inclusive", "outputConvention": "inclusive",
                                "inputTokens": 100, "cachedInputTokens": 50,
                                "outputTokens": 10, "reasoningOutputTokens": 5}
        report = finish(parts)
        self.assertTrue(report["accepted"])
        fields = report["usage"]["fields"]
        self.assertEqual(110, fields["totalTokens"]["sumObserved"])
        self.assertIsNone(fields["totalTokens"]["completeTotal"])

    def write_inputs(self, directory):
        plan, data, rules, rows = fixture()
        paths = {key: directory / name for key, name in
                 (("dataset", "dataset.json"), ("rubric", "rubric.json"),
                  ("plan", "plan.json"), ("results", "results.jsonl"))}
        paths["dataset"].write_bytes(data)
        paths["rubric"].write_bytes(rules)
        paths["plan"].write_text(json.dumps(plan), encoding="utf-8")
        paths["results"].write_text("\n".join(json.dumps(r) for r in rows), encoding="utf-8")
        return paths

    def test_cli_prepare_finalize_and_rejected_verdict(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            paths = self.write_inputs(directory)
            plan = directory / "fresh-plan.json"
            args = ["prepare", "--dataset", str(paths["dataset"]), "--rubric", str(paths["rubric"]),
                    "--model-config-id", "config-1", "--campaign-id", "campaign-1",
                    "--producer-id", "producer", "--grader-id", "grader",
                    "--human-calibration-id", "cal-1", "--output", str(plan)]
            self.assertEqual(0, benchmark.main(args))
            final = ["finalize", "--plan", str(plan), "--dataset", str(paths["dataset"]),
                     "--rubric", str(paths["rubric"]), "--results", str(paths["results"]), "--output"]
            self.assertEqual(0, benchmark.main(final + [str(directory / "report.json")]))
            rows = paths["results"].read_text().splitlines()
            failed = json.loads(rows[-1])
            failed["passed"] = False
            rows[-1] = json.dumps(failed)
            paths["results"].write_text("\n".join(rows))
            self.assertEqual(1, benchmark.main(final + [str(directory / "rejected.json")]))

    def test_fresh_output_refuses_input_existing_and_hardlink(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            source = directory / "source.json"
            source.write_text("original")
            for path in (source, directory / "existing.json"):
                path.write_text("original")
                with self.assertRaises((benchmark.InputError, OSError)):
                    benchmark.fresh_output(path, {}, [source])
                self.assertEqual("original", path.read_text())
            linked = directory / "hardlink.json"
            os.link(source, linked)
            with self.assertRaises(OSError):
                benchmark.fresh_output(linked, {}, [source])
            self.assertEqual("original", source.read_text())

    @unittest.skipUnless(os.name == "posix", "Linux Docker verifies symlink boundary")
    def test_output_symlink_and_symlink_ancestor_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            target = directory / "real"
            target.mkdir()
            link = directory / "link"
            link.symlink_to(target, target_is_directory=True)
            broken = directory / "broken"
            broken.symlink_to(directory / "missing")
            for path in (link / "new.json", broken):
                with self.assertRaises(benchmark.InputError):
                    benchmark.fresh_output(path, {}, [])
            self.assertEqual([], list(target.iterdir()))

    def test_cli_error_does_not_echo_private_content(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            paths = self.write_inputs(directory)
            paths["plan"].write_text("private marker")
            args = ["finalize", "--output", str(directory / "out.json")]
            for key, path in paths.items():
                args.extend(["--" + key, str(path)])
            stream = io.StringIO()
            with contextlib.redirect_stderr(stream):
                self.assertEqual(2, benchmark.main(args))
            self.assertNotIn("private", stream.getvalue())
            self.assertFalse((directory / "out.json").exists())

    def test_installed_sibling_import_runs_without_repo_root(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            for name in ("benchmark.py", "evaluate.py"):
                (directory / name).write_bytes((SCRIPTS / name).read_bytes())
            result = subprocess.run([sys.executable, str(directory / "benchmark.py"), "--help"],
                                    cwd=directory, capture_output=True)
            self.assertEqual(0, result.returncode)


if __name__ == "__main__":
    unittest.main()
