import argparse
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import task_state


class TaskStateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "checkpoint.json"
        self.parser = argparse.ArgumentParser()
        task_state.add_parser(self.parser.add_subparsers(dest="command", required=True))

    def run_state(self, action, *args):
        return task_state.run(self.parser.parse_args(["state", action, "--file", str(self.path), *args]))

    def initialize(self):
        return self.run_state("init", "--task", "small change", "--tier", "small", "--reason", "limited surface", "--target", "branch")

    def test_timing_and_tier_reason(self):
        with patch.object(task_state, "now", return_value="2026-10-07T00:00:00+00:00"):
            self.initialize()
        with patch.object(task_state, "now", return_value="2026-10-07T00:00:10+00:00"):
            self.run_state("transition", "--phase", "docker", "--kind", "wait")
        with patch.object(task_state, "now", return_value="2026-10-07T00:00:30+00:00"):
            result = self.run_state("report")
        self.assertEqual({"active": 10, "wait": 20}, result["seconds"])
        self.assertEqual("limited surface", result["tierReason"])

    def test_counters_and_next_action(self):
        self.initialize()
        self.run_state("update", "--next-action", "review", "--fix-round")
        self.run_state("retry", "--reason", "connection")
        result = self.run_state("report")
        self.assertEqual((1, 1, "review"), (result["fixRounds"], result["retries"], result["nextAction"]))

    def test_exclusive_lock_refuses_concurrent_writer(self):
        with task_state.locked(self.path):
            with self.assertRaisesRegex(ValueError, "locked"):
                with task_state.locked(self.path, timeout=0):
                    self.fail("second writer acquired lock")

    def test_explicit_stale_lock_recovery(self):
        lock = Path(str(self.path) + ".lock")
        lock.write_text("stale")
        self.run_state("recover-lock", "--confirm-no-writers")
        self.assertFalse(lock.exists())
        self.initialize()

    def test_init_does_not_overwrite_existing_checkpoint(self):
        self.initialize()
        original = self.path.read_bytes()
        with self.assertRaises(ValueError):
            self.initialize()
        self.assertEqual(original, self.path.read_bytes())

    def test_atomic_write_failure_preserves_previous_state(self):
        self.initialize()
        original = self.path.read_bytes()
        with patch.object(task_state.os, "replace", side_effect=OSError("simulated")):
            with self.assertRaises(OSError):
                self.run_state("retry", "--reason", "test")
        self.assertEqual(original, self.path.read_bytes())
        self.assertEqual([self.path], list(self.path.parent.iterdir()))

    def test_malformed_checkpoints_fail_with_safe_errors(self):
        self.initialize()
        original = json.loads(self.path.read_text())
        for current in ({}, {"phase": "test", "kind": "active", "startedAt": "SECRET_SENTINEL"}, "SECRET_SENTINEL"):
            state = {**original, "current": current}
            with self.assertRaises(task_state.StateError) as caught:
                task_state.validate(state)
            self.assertNotIn("SECRET_SENTINEL", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
