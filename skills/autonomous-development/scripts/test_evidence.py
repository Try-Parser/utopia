import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import evidence


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.repository = self.root / "repo"
        self.repository.mkdir()
        self.git("init", "-q")
        self.git("config", "user.email", "test@example.invalid")  # ai-department-allow: email
        self.git("config", "user.name", "Evidence Test")
        (self.repository / "tracked.txt").write_text("original\n")
        self.git("add", ".")
        self.git("commit", "-qm", "initial")
        self.saved = evidence.snapshot([self.repository])
        self.reviews = {
            lens: {"agentId": lens + "-agent", "result": {
                "status": "passed", "blockers": [], "verdict": "Verified",
                "snapshotId": self.saved["snapshotId"], "evidence": ["review.log"]
            }} for lens in ("correctness", "coverage", "security")
        }
        self.reviews["coverage"]["result"]["checks"] = [{
            "command": "python -m unittest", "container": "development-python",
            "exitCode": 0, "performed": True, "evidence": "tests.log"
        }]

    def git(self, *arguments):
        return subprocess.run(["git", "-C", str(self.repository), *arguments], check=True, capture_output=True)

    def rejected(self, saved=None, reviews=None):
        with self.assertRaises(evidence.EvidenceError):
            evidence.gate(self.saved if saved is None else saved, self.reviews if reviews is None else reviews)

    def test_valid_reviews_pass_without_mutating_repository(self):
        self.assertEqual("passed", evidence.gate(self.saved, self.reviews)["status"])
        self.assertEqual(b"", self.git("status", "--porcelain").stdout)

    def test_unstaged_change_invalidates(self):
        (self.repository / "tracked.txt").write_text("changed")
        self.rejected()

    def test_staged_change_invalidates(self):
        (self.repository / "tracked.txt").write_text("changed")
        self.git("add", ".")
        self.rejected()

    def test_untracked_filename_and_content_invalidate(self):
        path = self.repository / "untracked.txt"
        path.write_text("first")
        self.rejected()
        first = evidence.snapshot([self.repository])
        path.write_text("second")
        second = evidence.snapshot([self.repository])
        self.assertNotEqual(first["snapshotId"], second["snapshotId"])
        path.rename(self.repository / "renamed.txt")
        self.assertNotEqual(second["snapshotId"], evidence.snapshot([self.repository])["snapshotId"])

    def test_head_change_invalidates_even_with_same_tree(self):
        self.git("commit", "--allow-empty", "-qm", "new head")
        self.rejected()

    def test_branch_change_invalidates(self):
        self.git("checkout", "-qb", "different-branch")
        self.rejected()

    def test_ignored_file_is_outside_scope(self):
        (self.repository / ".git" / "info" / "exclude").write_text("ignored.txt\n")
        (self.repository / "ignored.txt").write_text("not included")
        self.assertEqual(self.saved, evidence.snapshot([self.repository]))

    def test_hidden_tracked_changes_rejected(self):
        for flag in ('assume-unchanged', 'skip-worktree'):
            self.git('update-index', '--' + flag, 'tracked.txt')
            (self.repository / 'tracked.txt').write_text('hidden modification')
            with self.subTest(flag=flag), self.assertRaises(evidence.EvidenceError):
                evidence.snapshot([self.repository])
            self.git('update-index', '--no-' + flag, 'tracked.txt')
            (self.repository / 'tracked.txt').write_text('original\n')

    def test_submodule_gitlink_rejected(self):
        head = self.git('rev-parse', 'HEAD').stdout.decode().strip()
        self.git('update-index', '--add', '--cacheinfo', '160000,' + head + ',module')
        with self.assertRaisesRegex(evidence.EvidenceError, 'Submodule'):
            evidence.snapshot([self.repository])

    def test_empty_duplicate_and_nonrepository_scopes_rejected(self):
        for repositories in ([], [self.root], [self.repository, self.repository]):
            with self.subTest(repositories=repositories), self.assertRaises(evidence.EvidenceError):
                evidence.snapshot(repositories)

    def test_subdirectory_scope_rejected(self):
        child = self.repository / "child"
        child.mkdir()
        with self.assertRaises(evidence.EvidenceError):
            evidence.snapshot([child])

    def test_missing_and_malformed_reviews_rejected(self):
        for reviews in ({}, [], None, {"correctness": "passed"}):
            with self.subTest(reviews=reviews), self.assertRaises(evidence.EvidenceError):
                evidence.gate(self.saved, reviews)
        for lens in self.reviews:
            for field, value in (("status", "incomplete"), ("blockers", [{}]),
                                 ("verdict", " "), ("snapshotId", "stale"),
                                 ("evidence", []), ("evidence", [""])):
                reviews = copy.deepcopy(self.reviews)
                reviews[lens]["result"][field] = value
                with self.subTest(lens=lens, field=field):
                    self.rejected(reviews=reviews)

    def test_duplicate_agent_rejected(self):
        self.reviews["security"]["agentId"] = " correctness-agent "
        self.rejected()

    def test_failed_missing_or_unperformed_checks_rejected(self):
        for field, value in (("exitCode", 1), ("exitCode", False), ("performed", False),
                             ("command", ""), ("container", ""), ("evidence", "")):
            reviews = copy.deepcopy(self.reviews)
            reviews["coverage"]["result"]["checks"][0][field] = value
            with self.subTest(field=field):
                self.rejected(reviews=reviews)
        self.reviews["coverage"]["result"]["checks"] = []
        self.rejected()

    def test_tampered_snapshot_rejected(self):
        for saved in ({}, {"version": 1, "repositories": []},
                      {**self.saved, "snapshotId": "forged"}):
            with self.subTest(saved=saved):
                self.rejected(saved=saved)

    def test_concurrent_edit_during_snapshot_rejected(self):
        first = self.saved["repositories"][0]
        second = {**first, "digest": "changed"}
        with patch.object(evidence, "repository_state", side_effect=[first, second]):
            with self.assertRaisesRegex(evidence.EvidenceError, "changed during snapshot"):
                evidence.snapshot([self.repository])

    def test_cli_roundtrip_and_invalid_json_do_not_leak_contents(self):
        snapshot_path = self.root / "snapshot.json"
        reviews_path = self.root / "reviews.json"
        executable = [__import__("sys").executable, str(Path(evidence.__file__))]
        capture = subprocess.run(executable + ["snapshot", "--repo", str(self.repository),
                                              "--output", str(snapshot_path)], capture_output=True)
        self.assertEqual(0, capture.returncode, capture.stderr)
        reviews_path.write_text(json.dumps(self.reviews))
        passed = subprocess.run(executable + ["gate", "--snapshot", str(snapshot_path),
                                             "--reviews", str(reviews_path)], capture_output=True)
        self.assertEqual(0, passed.returncode, passed.stderr)
        reviews_path.write_text("SECRET_SENTINEL_INVALID_JSON")
        failed = subprocess.run(executable + ["gate", "--snapshot", str(snapshot_path),
                                             "--reviews", str(reviews_path)], capture_output=True)
        self.assertNotEqual(0, failed.returncode)
        self.assertNotIn(b"SECRET_SENTINEL", failed.stderr + failed.stdout)

    def stage_change(self):
        (self.repository / "tracked.txt").write_text("reviewed\n")
        self.git("add", ".")
        return evidence.snapshot([self.repository])

    def test_postcommit_matches_reviewed_index_and_strict_gate_rejects_new_head(self):
        saved = self.stage_change()
        self.git("commit", "-qm", "reviewed")
        self.assertEqual("passed", evidence.postcommit(saved)["status"])
        with self.assertRaises(evidence.EvidenceError):
            evidence.gate(saved, self.reviews)

    def test_postcommit_rejects_unstaged_review_scope(self):
        (self.repository / "tracked.txt").write_text("unstaged")
        saved = evidence.snapshot([self.repository])
        with self.assertRaises(evidence.EvidenceError):
            evidence.postcommit(saved)

    def test_postcommit_rejects_extra_commit_even_same_tree(self):
        saved = self.stage_change()
        self.git("commit", "-qm", "reviewed")
        self.git("commit", "--allow-empty", "-qm", "extra")
        with self.assertRaises(evidence.EvidenceError):
            evidence.postcommit(saved)

    def test_postcommit_rejects_hook_changed_index_tree(self):
        saved = self.stage_change()
        hook = self.repository / ".git" / "hooks" / "pre-commit"
        hook.write_text('#!/bin/sh\nprintf "hook drift\\n" > tracked.txt\ngit add tracked.txt\n')
        hook.chmod(0o755)
        self.git("commit", "-qm", "hook changed")
        self.assertEqual("hook drift\n", (self.repository / "tracked.txt").read_text())
        with self.assertRaises(evidence.EvidenceError):
            evidence.postcommit(saved)

    def test_postcommit_rejects_dirty_after_commit(self):
        saved = self.stage_change()
        self.git("commit", "-qm", "reviewed")
        (self.repository / "new.txt").write_text("unexpected")
        with self.assertRaises(evidence.EvidenceError):
            evidence.postcommit(saved)

    def test_active_filter_rejected_and_unset_filter_allowed(self):
        (self.repository / ".gitattributes").write_text("tracked.txt filter=lfs\n")
        with self.assertRaisesRegex(evidence.EvidenceError, "filters"):
            evidence.snapshot([self.repository])
        (self.repository / ".gitattributes").write_text("tracked.txt -filter\n")
        evidence.snapshot([self.repository])

    def test_autocrlf_tree_consistency_supported(self):
        self.git("config", "core.autocrlf", "true")
        (self.repository / "tracked.txt").write_bytes(b"reviewed\r\n")
        self.git("add", ".")
        saved = evidence.snapshot([self.repository])
        self.git("commit", "-qm", "normalized")
        self.assertEqual("passed", evidence.postcommit(saved)["status"])

    def test_snapshot_output_inside_repository_rejected(self):
        with self.assertRaises(evidence.EvidenceError):
            evidence.outside_repositories(self.repository / "snapshot.json", [self.repository])


if __name__ == "__main__":
    unittest.main()
