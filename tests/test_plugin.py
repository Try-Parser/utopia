"""Behavioral distribution tests: complete resources and bounded, safe writes."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

REPO = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("workflow_plugin", REPO / "scripts/package_plugin.py")
plugin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plugin)


class PluginTests(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory()
        self.addCleanup(self.scratch.cleanup)
        self.root = Path(self.scratch.name)
        self.source = self.root / "source"
        self.target = self.root / "plugin with spaces"
        self.metadata = {
            "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
            "name": "ai-department", "version": "0.1.0", "description": "Portable workflow",
            "author": {"name": "LegalMatch"},
            "extensions": {"com.openai": {"interface": {"displayName": "AI Department"}}},
        }
        fixtures = {
            "skills/autonomous-development/SKILL.md": b"workflow\n",
            "skills/ai-evaluation/SKILL.md": b"evaluation\n",
            "skills/craftsman/references/security.md": b"standards\n",
            "agents/frank-coder.md": b"builder\n",
            "agents/frank-designer.md": b"designer\n",
            "templates/global-CLAUDE.md": b"shared guidance\n",
            "templates/plugin.json": plugin.json_bytes(self.metadata),
            "templates/plugin-setup/SKILL.md": b"setup instructions\n",
            "docs/plugin.md": b"installation instructions\n",
        }
        for helpers in plugin.installer.GENERATED_HELPERS.values():
            for helper in helpers:
                fixtures["scripts/" + helper] = ("# canonical " + helper + "\n").encode()
        for name, data in fixtures.items():
            self.put(self.source / name, data)
        self.put(self.source / "templates/plugin-files.json", plugin.json_bytes(sorted(fixtures)))

    def put(self, path, data):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def expected(self):
        return plugin.payload(self.source)

    def test_self_contained_helpers_roles_guidance_and_three_metadata_formats(self):
        expected = self.expected()
        plugin.write(self.target, expected, fresh=True)
        plugin.check(self.target, expected)
        for skill, helpers in plugin.installer.GENERATED_HELPERS.items():
            for helper in helpers:
                self.assertEqual((self.target / "skills" / skill / "scripts" / helper).read_bytes(),
                                 (self.source / "scripts" / helper).read_bytes())
        for role in ("frank-coder.md", "frank-designer.md"):
            canonical = (self.source / "agents" / role).read_bytes()
            for name in ("agents/" + role,
                         "skills/autonomous-development/references/agents/" + role):
                self.assertEqual((self.target / name).read_bytes(), canonical)
        self.assertEqual((self.target / "skills/setup/references/global-guidance.md").read_bytes(),
                         (self.source / "templates/global-CLAUDE.md").read_bytes())
        portable = json.loads(expected["plugin.json"])
        claude = json.loads(expected[".claude-plugin/plugin.json"])
        codex = json.loads(expected[".codex-plugin/plugin.json"])
        for key in ("name", "version", "description", "author"):
            self.assertEqual(portable[key], claude[key])
            self.assertEqual(portable[key], codex[key])
        self.assertNotIn("extensions", claude)
        self.assertNotIn("$schema", claude)
        self.assertEqual(codex["skills"], "./skills/")
        self.assertEqual(codex["interface"], self.metadata["extensions"]["com.openai"]["interface"])
        self.assertEqual(plugin.write(self.target, expected), 0)

    def test_missing_and_stale_asset_detection_and_refresh(self):
        expected = self.expected()
        plugin.write(self.target, expected)
        (self.target / "skills/ai-evaluation/scripts/evaluate.py").unlink()
        (self.target / "agents/frank-coder.md").write_bytes(b"stale role")
        with self.assertRaisesRegex(ValueError, "missing:.*changed:"):
            plugin.check(self.target, expected)
        self.assertEqual(plugin.write(self.target, expected), 2)
        plugin.check(self.target, expected)

    def test_fresh_export_refuses_existing_directory_even_when_empty(self):
        self.target.mkdir()
        with self.assertRaisesRegex(ValueError, "already exists"):
            plugin.write(self.target, self.expected(), fresh=True)
        self.assertEqual(list(self.target.iterdir()), [])

    def test_unexpected_secret_directory_rejected_before_descent_or_any_write(self):
        expected = self.expected()
        plugin.write(self.target, expected)
        stale = self.target / "agents/frank-coder.md"
        stale.write_bytes(b"old version")
        secret = self.target / ".claude/private/settings.json"
        self.put(secret, b"secret must never be read")
        original_iterdir = Path.iterdir

        def bounded_iterdir(path):
            if path == self.target / ".claude":
                self.fail("Unexpected secret directory was traversed")
            return original_iterdir(path)

        with mock.patch.object(Path, "iterdir", bounded_iterdir):
            with self.assertRaisesRegex(ValueError, "Unexpected plugin directory"):
                plugin.write(self.target, expected)
        self.assertEqual(stale.read_bytes(), b"old version")
        self.assertEqual(secret.read_bytes(), b"secret must never be read")

    def test_unexpected_file_refuses_overwrite_and_preserves_account_configuration(self):
        expected = self.expected()
        self.put(self.root / ".codex/config.toml", b"user configuration")
        plugin.write(self.target, expected)
        self.put(self.target / "credentials.json", b"private")
        with self.assertRaisesRegex(ValueError, "Unexpected plugin file"):
            plugin.write(self.target, expected)
        self.assertEqual((self.root / ".codex/config.toml").read_bytes(), b"user configuration")
        self.assertEqual((self.target / "credentials.json").read_bytes(), b"private")

    def symlink(self, path, destination, directory=False):
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            path.symlink_to(destination, target_is_directory=directory)
        except OSError as error:
            self.skipTest("Symlink creation unavailable: " + str(error))

    def test_destination_parent_and_file_symlinks_rejected(self):
        expected = self.expected()
        outside = self.root / "outside"
        outside.mkdir()
        self.symlink(self.target, outside, directory=True)
        with self.assertRaisesRegex(ValueError, "Symlink"):
            plugin.write(self.target, expected)
        self.target.unlink()
        plugin.write(self.target, expected)
        destination = self.target / "README.md"
        destination.unlink()
        external = outside / "private.md"
        external.write_bytes(b"private")
        self.symlink(destination, external)
        with self.assertRaisesRegex(ValueError, "Symlink"):
            plugin.check(self.target, expected)
        self.assertEqual(external.read_bytes(), b"private")

    def test_missing_source_or_source_symlink_cannot_generate_partial_export(self):
        canonical = self.source / "scripts/evaluate.py"
        canonical.unlink()
        with self.assertRaisesRegex(ValueError, "Missing plugin inventory source"):
            self.expected()
        external = self.root / "private.py"
        external.write_bytes(b"private")
        self.symlink(canonical, external)
        with self.assertRaisesRegex(ValueError, "Symlink"):
            self.expected()
        self.assertFalse(self.target.exists())

    def test_canonical_setup_collision_and_invalid_metadata_fail(self):
        metadata = self.source / "templates/plugin.json"
        metadata.write_bytes(b'{"name":"ai-department","name":"other"}')
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            self.expected()
        self.metadata["version"] = "latest"
        metadata.write_bytes(plugin.json_bytes(self.metadata))
        with self.assertRaisesRegex(ValueError, "identity"):
            self.expected()
        self.metadata["version"] = "0.1.0"
        metadata.write_bytes(plugin.json_bytes(self.metadata))
        self.put(self.source / "skills/setup/SKILL.md", b"collision")
        inventory_path = self.source / "templates/plugin-files.json"
        inventory = json.loads(inventory_path.read_bytes()) + ["skills/setup/SKILL.md"]
        inventory_path.write_bytes(plugin.json_bytes(inventory))
        with self.assertRaisesRegex(ValueError, "conflicts"):
            self.expected()

    def test_failed_update_rolls_back_written_bytes(self):
        expected = self.expected()
        plugin.write(self.target, expected)
        changed = {name: b"new" + data for name, data in expected.items()}
        original = plugin.installer.atomic_write
        calls = 0

        def fail_second(path, data):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError("simulated disk failure")
            original(path, data)

        with mock.patch.object(plugin.installer, "atomic_write", fail_second):
            with self.assertRaisesRegex(OSError, "disk failure"):
                plugin.write(self.target, changed)
        plugin.check(self.target, expected)

    def test_unlisted_source_secrets_rejected_before_any_content_read_or_output_write(self):
        for relative in ("skills/ai-evaluation/.env", "agents/credentials.json",
                         "skills/craftsman/.claude/settings.json"):
            with self.subTest(relative=relative):
                expected = self.expected()
                plugin.write(self.target, expected)
                destination = self.source / relative
                self.put(destination, b"private value must not be read")
                original_read = Path.read_bytes
                original_iterdir = Path.iterdir
                reads = []

                def bounded_read(path):
                    reads.append(path.relative_to(self.source).as_posix())
                    if path != self.source / "templates/plugin-files.json":
                        self.fail("Bundled content read before source preflight completed")
                    return original_read(path)

                def bounded_iterdir(path):
                    if path == self.source / "skills/craftsman/.claude":
                        self.fail("Unexpected source directory was traversed")
                    return original_iterdir(path)

                with mock.patch.object(Path, "read_bytes", bounded_read), \
                        mock.patch.object(Path, "iterdir", bounded_iterdir):
                    with self.assertRaisesRegex(ValueError, "Unexpected plugin source"):
                        plugin.payload(self.source)
                self.assertEqual(reads, ["templates/plugin-files.json"])
                plugin.check(self.target, expected)
                destination.unlink()
                if "/.claude/" in relative:
                    destination.parent.rmdir()

    def test_inventory_rejects_duplicates_unsafe_paths_and_unrelated_sources(self):
        path = self.source / "templates/plugin-files.json"
        original = json.loads(path.read_bytes())
        for addition, error in ((original[0], "Duplicate"), ("../credentials.json", "Unsafe"),
                                ("scripts/credentials.json", "outside canonical")):
            with self.subTest(addition=addition):
                self.put(self.source / "scripts/credentials.json", b"private")
                path.write_bytes(plugin.json_bytes(original + [addition]))
                with self.assertRaisesRegex(ValueError, error):
                    self.expected()
        path.write_bytes(plugin.json_bytes([name for name in original
                                           if name != "templates/global-CLAUDE.md"]))
        with self.assertRaisesRegex(ValueError, "omits required"):
            self.expected()

    def test_safe_cache_files_remain_excluded(self):
        expected = self.expected()
        self.put(self.source / "skills/ai-evaluation/__pycache__/ignored.pyc", b"cache")
        self.put(self.source / "agents/ignored.pyc", b"cache")
        self.assertEqual(self.expected(), expected)


if __name__ == "__main__":
    unittest.main()
