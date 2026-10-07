"""Behavioral safety tests for the portable installer, using isolated scratch homes."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

REPO = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("workflow_install", REPO / "scripts/install.py")
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory()
        self.addCleanup(self.scratch.cleanup)
        self.root = Path(self.scratch.name)
        self.target = self.root / "developer project with spaces"
        self.target.mkdir()
        self.source = self.root / "distribution"
        for relative, data in {
            "skills/autonomous-development/SKILL.md": b"workflow v1\n",
            "skills/craftsman/SKILL.md": b"craft\n",
            "skills/ai-evaluation/SKILL.md": b"evaluation\n",
            "scripts/evaluate.py": b"# canonical scorer\n",
            "agents/frank-coder.md": b"builder role\n",
            "agents/frank-security.md": b"security role\n",
            "templates/global-CLAUDE.md": b"portable guidance\n",
        }.items():
            self.write(self.source, relative, data)

    def write(self, root, relative, data):
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def snapshot(self):
        return {p.relative_to(self.target).as_posix(): p.read_bytes()
                for p in self.target.rglob("*")
                if p.is_file() and p.relative_to(self.target).as_posix() != installer.LOCK}

    def install(self, assistants=("claude", "codex"), replace=False):
        changes = installer.plan("install", self.target, assistants, replace, self.source)
        installer.apply_changes(self.target, changes)
        return changes

    def uninstall(self, assistants=("claude", "codex")):
        changes = installer.plan("uninstall", self.target, assistants, source=self.source)
        installer.apply_changes(self.target, changes)

    def test_both_adapters_install_roles_and_leave_account_files_untouched(self):
        for path in ("CLAUDE.md", "AGENTS.md", ".claude/settings.json", ".codex/config.toml"):
            self.write(self.target, path, b"personal configuration\x00\xff")
        before = self.snapshot()
        self.install()
        for path in before:
            self.assertEqual((self.target / path).read_bytes(), before[path])
        for prefix in (".claude/skills", ".agents/skills"):
            self.assertEqual((self.target / prefix / "autonomous-development/references/agents/frank-coder.md").read_bytes(), b"builder role\n")
        self.assertTrue((self.target / ".claude/agents/frank-coder.md").is_file())
        self.assertTrue((self.target / ".codex/ai-department.md").is_file())
        self.uninstall()
        self.assertEqual(self.snapshot(), before)

    def test_generated_scorer_matches_canonical_helper_and_rejects_source_symlink(self):
        self.install()
        expected = (self.source / "scripts/evaluate.py").read_bytes()
        for prefix in (".claude/skills", ".agents/skills"):
            self.assertEqual((self.target / prefix / "ai-evaluation/scripts/evaluate.py").read_bytes(), expected)
        canonical = self.source / "scripts/evaluate.py"
        alternate = self.root / "external helper.py"
        alternate.write_bytes(expected)
        canonical.unlink()
        try:
            canonical.symlink_to(alternate)
        except OSError as error:
            self.skipTest("Symlink creation unavailable: " + str(error))
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, "Symlink traversal"):
            self.install()
        self.assertEqual(self.snapshot(), before)

    def test_generated_scorer_refuses_destination_symlink(self):
        outside = self.root / "outside-scorer.py"
        outside.write_bytes(b"external code")
        destination = self.target / ".agents/skills/ai-evaluation/scripts/evaluate.py"
        destination.parent.mkdir(parents=True)
        try:
            destination.symlink_to(outside)
        except OSError as error:
            self.skipTest("Symlink creation unavailable: " + str(error))
        with self.assertRaisesRegex(ValueError, "Symlink traversal"):
            self.install()
        self.assertEqual(outside.read_bytes(), b"external code")

    def test_default_dry_run_never_creates_target_or_manifest(self):
        nonexistent = self.root / "absent home"
        with mock.patch.object(installer, "ROOT", self.source):
            # main uses plan's default source; use a wrapper to inject the fixture.
            actual = installer.plan
            with mock.patch.object(installer, "plan", side_effect=lambda action, target, assistants, replace: actual(action, target, assistants, replace, self.source)):
                self.assertEqual(installer.main(["install", "--assistant", "both", "--scope", "user", "--target", str(nonexistent)]), 0)
        self.assertFalse(nonexistent.exists())

    def test_cli_supports_every_assistant_and_scope(self):
        for scope in ("user", "project"):
            for assistant in ("claude", "codex", "both"):
                with self.subTest(scope=scope, assistant=assistant):
                    target = self.root / (scope + " " + assistant)
                    common = ["--assistant", assistant, "--scope", scope, "--target", str(target)]
                    result = subprocess.run([sys.executable, str(REPO / "scripts/install.py"), "install", *common, "--apply"], capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertTrue((target / installer.MANIFEST).is_file())
                    result = subprocess.run([sys.executable, str(REPO / "scripts/install.py"), "uninstall", *common, "--apply"], capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    self.assertFalse((target / installer.MANIFEST).exists())

    def test_busy_target_refuses_writer_then_releases_for_retry(self):
        command = [sys.executable, str(REPO / "scripts/install.py"), "install",
                   "--assistant", "codex", "--scope", "project",
                   "--target", str(self.target), "--apply"]
        with installer.target_lock(self.target):
            before = self.snapshot()
            result = subprocess.run(command, capture_output=True, text=True, timeout=10)
            self.assertEqual(result.returncode, 1, result.stderr)
            self.assertIn("target lock", result.stderr)
            self.assertEqual(self.snapshot(), before)
        result = subprocess.run(command, capture_output=True, text=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_overlapping_processes_preserve_both_adapter_ownership(self):
        code = ('import importlib.util,sys; from pathlib import Path\n'
                's=importlib.util.spec_from_file_location("installer",sys.argv[1]); '
                'm=importlib.util.module_from_spec(s); s.loader.exec_module(m)\n'
                'target=Path(sys.argv[2])\n'
                'with m.target_lock(target):\n'
                ' print("ready",flush=True)\n'
                ' sys.stdin.readline()\n'
                ' m.apply_changes(target,m.plan("install",target,["claude"]))\n')
        holder = subprocess.Popen([sys.executable, "-c", code,
                                   str(REPO / "scripts/install.py"), str(self.target)],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE, text=True)
        try:
            self.assertEqual(holder.stdout.readline().strip(), "ready")
            follower = subprocess.Popen([sys.executable, str(REPO / "scripts/install.py"),
                                         "install", "--assistant", "codex", "--scope", "project",
                                         "--target", str(self.target), "--apply"],
                                        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                _, holder_error = holder.communicate("go\n", timeout=20)
                _, follower_error = follower.communicate(timeout=20)
                self.assertEqual(holder.returncode, 0, holder_error)
                # Slow source mounts can exceed bounded lock waiting. Refusal
                # is valid; retry after the holder finishes and verify ownership.
                if follower.returncode == 1 and "target lock" in follower_error:
                    retry = subprocess.run(follower.args, capture_output=True, text=True, timeout=20)
                    self.assertEqual(retry.returncode, 0, retry.stderr)
                else:
                    self.assertEqual(follower.returncode, 0, follower_error)
            finally:
                if follower.poll() is None:
                    follower.kill()
                    follower.communicate()
        finally:
            if holder.poll() is None:
                holder.kill()
                holder.communicate()
        manifest = json.loads((self.target / installer.MANIFEST).read_text())
        self.assertEqual({e["assistant"] for e in manifest["files"].values()}, {"claude", "codex"})

    @unittest.skipUnless(os.name == "nt", "Windows junction regression")
    def test_nested_source_junction_refuses_external_content(self):
        external = self.root / "outside assets"
        external.mkdir()
        (external / "private.txt").write_text("private fixture")
        junction = self.source / "skills" / "linked"
        result = subprocess.run(["cmd", "/c", "mklink", "/J", str(junction), str(external)],
                                capture_output=True, text=True)
        if result.returncode:
            self.skipTest("Junction creation unavailable")
        try:
            before = self.snapshot()
            with self.assertRaisesRegex(ValueError, "Symlink traversal"):
                self.install()
            self.assertEqual(self.snapshot(), before)
            self.assertEqual((external / "private.txt").read_text(), "private fixture")
        finally:
            junction.rmdir()

    def test_conflict_preflight_writes_nothing(self):
        self.write(self.target, ".codex/ai-department.md", b"user content")
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, "Existing file conflicts"):
            self.install()
        self.assertEqual(self.snapshot(), before)

    def test_explicit_replace_restores_exact_original_after_version_update(self):
        relative = ".claude/skills/autonomous-development/SKILL.md"
        original = b"user customized\r\n\xff\x00"
        self.write(self.target, relative, original)
        self.install(replace=True)
        self.write(self.source, "skills/autonomous-development/SKILL.md", b"workflow v2\n")
        self.install()
        self.assertEqual((self.target / relative).read_bytes(), b"workflow v2\n")
        self.uninstall()
        self.assertEqual(self.snapshot(), {relative: original})

    def test_repeated_install_is_idempotent_and_adapters_coexist(self):
        self.install(("claude",))
        before = self.snapshot()
        self.assertEqual(self.install(("claude",)), {})
        self.assertEqual(self.snapshot(), before)
        self.install(("codex",))
        self.uninstall(("claude",))
        manifest = json.loads((self.target / installer.MANIFEST).read_text())
        self.assertTrue(manifest["files"])
        self.assertEqual({entry["assistant"] for entry in manifest["files"].values()}, {"codex"})
        self.uninstall(("codex",))
        self.assertEqual(self.snapshot(), {})

    def test_modified_installed_file_refuses_uninstall_and_update_atomically(self):
        self.install()
        self.write(self.target, ".claude/agents/frank-security.md", b"recipient changes")
        before = self.snapshot()
        for action in ("uninstall", "install"):
            with self.subTest(action=action), self.assertRaisesRegex(ValueError, "Installed file changed"):
                installer.plan(action, self.target, ["claude", "codex"], True, self.source)
        self.assertEqual(self.snapshot(), before)

    def test_missing_installed_file_refuses_uninstall(self):
        self.install()
        (self.target / ".claude/agents/frank-coder.md").unlink()
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, "Installed file changed or missing"):
            self.uninstall()
        self.assertEqual(self.snapshot(), before)

    def test_manifest_traversal_and_non_adapter_paths_refused(self):
        for path in ("../outside.txt", "/tmp/outside", ".claude/../../outside", "C:/outside", "CLAUDE.md", ".claude/settings.json"):
            with self.subTest(path=path):
                manifest = {"version": 1, "files": {path: {"assistant": "claude", "sha256": "0" * 64}}}
                self.write(self.target, installer.MANIFEST, json.dumps(manifest).encode())
                before = self.snapshot()
                with self.assertRaises(ValueError):
                    self.uninstall()
                self.assertEqual(self.snapshot(), before)

    def test_backup_traversal_and_corruption_refused(self):
        self.write(self.target, ".claude/ai-department.md", b"original")
        self.install(replace=True)
        manifest_path = self.target / installer.MANIFEST
        manifest = json.loads(manifest_path.read_text())
        entry = manifest["files"][".claude/ai-department.md"]
        backup = entry["backup"]
        entry["backup"] = ".ai-department/backups/../../outside"
        manifest_path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, "Unsafe path"):
            self.uninstall()
        entry["backup"] = backup
        manifest_path.write_text(json.dumps(manifest))
        (self.target / backup).write_bytes(b"corrupted")
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, "Original backup has changed"):
            self.uninstall()
        self.assertEqual(self.snapshot(), before)

    def test_symlink_target_and_asset_ancestor_refused(self):
        outside = self.root / "outside"
        outside.mkdir()
        for link, destination in ((self.target / ".claude", outside), (self.root / "linked root", self.target)):
            try:
                link.symlink_to(destination, target_is_directory=True)
            except OSError as error:
                self.skipTest("Symlink creation unavailable: " + str(error))
            try:
                target = self.target if link.parent == self.target else link
                with self.assertRaisesRegex(ValueError, "Symlink traversal"):
                    installer.plan("install", target, ["claude"], source=self.source)
                self.assertEqual(list(outside.iterdir()), [])
            finally:
                link.unlink()

    def test_midapply_failure_restores_overwrites_and_removes_new_files(self):
        self.write(self.target, ".claude/ai-department.md", b"original content")
        before = self.snapshot()
        changes = installer.plan("install", self.target, ["claude", "codex"], True, self.source)
        real_write = installer.atomic_write
        calls = 0

        def fail_once(path, data):
            nonlocal calls
            calls += 1
            if calls == len(changes):
                raise OSError("injected storage failure")
            real_write(path, data)

        with mock.patch.object(installer, "atomic_write", side_effect=fail_once):
            with self.assertRaisesRegex(OSError, "injected storage failure"):
                installer.apply_changes(self.target, changes)
        self.assertEqual(self.snapshot(), before)
        self.assertFalse((self.target / ".ai-department").exists())
        self.assertFalse((self.target / ".agents").exists())

    def test_miduninstall_failure_restores_installed_state(self):
        self.write(self.target, ".claude/ai-department.md", b"original content")
        self.install(replace=True)
        before = self.snapshot()
        changes = installer.plan("uninstall", self.target, ["claude", "codex"], source=self.source)
        real_write = installer.atomic_write
        failed = False

        def fail_once(path, data):
            nonlocal failed
            if not failed and path == self.target / ".claude/ai-department.md":
                failed = True
                raise OSError("injected restore failure")
            real_write(path, data)

        with mock.patch.object(installer, "atomic_write", side_effect=fail_once):
            with self.assertRaisesRegex(OSError, "injected restore failure"):
                installer.apply_changes(self.target, changes)
        self.assertEqual(self.snapshot(), before)

    def test_removed_upstream_assets_restore_originals(self):
        path = ".claude/agents/frank-security.md"
        self.write(self.target, path, b"original role")
        self.install(replace=True)
        (self.source / "agents/frank-security.md").unlink()
        self.install()
        self.assertEqual((self.target / path).read_bytes(), b"original role")
        self.uninstall()
        self.assertEqual(self.snapshot(), {path: b"original role"})


if __name__ == "__main__":
    unittest.main()
