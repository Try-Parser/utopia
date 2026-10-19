"""Filesystem discovery and offline multi-provider execution boundaries."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("provider_live", ROOT / "scripts/agent_world_live.py")
live = importlib.util.module_from_spec(spec)
spec.loader.exec_module(live)
providers = live.providers
FIXTURES = Path(__file__).parent / "fixtures"


class DiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def executable(self, name, directory=None):
        path = (directory or self.bin) / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("Never execute discovery fixtures", encoding="utf-8")
        path.chmod(0o755)
        return path

    def registry(self, **options):
        return providers.ProviderRegistry(environ={"PATH": str(self.bin)}, home=self.root / "home", **options)

    def test_filesystem_discovery_install_remove_and_public_projection_without_process_probes(self):
        clock = [0]
        registry = self.registry(windows=False, clock=lambda: clock[0])
        with patch('subprocess.Popen', side_effect=AssertionError("Discovery must not execute commands")):
            self.assertFalse(any(p["installed"] for p in registry.view()))
            claude = self.executable("claude")
            self.executable("gemini")
            clock[0] = 2
            states = {p["id"]: p for p in registry.view()}
            self.assertTrue(states["claude"]["available"])
            self.assertEqual(states["claude"]["accessModes"], ["read-only", "workspace-write"])
            self.assertTrue(states["gemini"]["installed"])
            self.assertFalse(states["gemini"]["available"])
            self.assertIn("adapter", states["gemini"]["reason"])
            self.assertNotIn(str(self.root), json.dumps(states))
            claude.unlink()
            clock[0] = 4
            self.assertFalse(next(p for p in registry.view() if p["id"] == "claude")["available"])

    def test_windows_shims_never_run_and_known_npm_entrypoints_resolve_without_parsing(self):
        shim = self.executable("claude.cmd")
        registry = self.registry(windows=True)
        state = next(p for p in registry.view() if p["id"] == "claude")
        self.assertTrue(state["installed"])
        self.assertFalse(state["available"])
        node = self.executable("node.exe")
        entry = self.bin / providers.NPM_ENTRYPOINTS["claude"]
        entry.parent.mkdir(parents=True)
        entry.write_text("not executed", encoding="utf-8")
        registry.refresh(force=True)
        self.assertEqual(registry.command("claude"), [str(node), str(entry)])
        self.assertNotIn(str(shim), registry.command("claude"))
        node.unlink()
        registry.refresh(force=True)
        self.assertEqual(registry.command("claude"), [])
        with self.assertRaises(ValueError):
            providers.ProviderRegistry(commands={"claude": [str(shim)]})
        bare = providers.ProviderRegistry(commands={"claude": ["claude"]}, discover=False,
                                          environ={"PATH": str(self.bin)}, home=self.root, windows=True)
        self.assertEqual(bare.command("claude"), [])

    def test_per_user_native_locations_and_relative_path_entries_are_bounded(self):
        home = self.root / "user"
        exe = self.executable("claude", home / ".local/bin")
        registry = providers.ProviderRegistry(environ={"PATH": "."}, home=home, windows=False)
        self.assertEqual(registry.command("claude"), [str(exe)])
        self.assertEqual(len(providers._directories({"PATH": os.pathsep.join(str(self.root / str(i)) for i in range(500))}, home, False)), 256)

    def test_windows_broken_earlier_shim_does_not_hide_later_native_cli_or_node(self):
        home = self.root / "home"
        shim = self.executable("claude.cmd")
        native = self.executable("claude.exe", home / ".local/bin")
        registry = providers.ProviderRegistry(environ={"PATH": str(self.bin)}, home=home, windows=True)
        self.assertEqual(registry.command("claude"), [str(native)])
        self.assertTrue(next(p for p in registry.view() if p["id"] == "claude")["installed"])
        native.unlink()
        self.executable("node.cmd")
        node = self.executable("node.exe", home / ".local/bin")
        entry = shim.parent / providers.NPM_ENTRYPOINTS["claude"]
        entry.parent.mkdir(parents=True)
        entry.write_text("not executed", encoding="utf-8")
        registry.refresh(force=True)
        self.assertEqual(registry.command("claude"), [str(node), str(entry)])

    def test_automatic_discovery_skips_unc_and_device_paths_without_file_probes(self):
        remote = [r"\\server\share", "//server/share", r"\\?\C:\device", r"\\.\device", "//?/C:/device"]
        environ = {"PATH": ';'.join([*remote, str(self.bin)]), "APPDATA": r"\\server\profile"}
        self.assertEqual(providers._directories(environ, self.root / "home", True),
                         [self.bin, self.root / "home/.local/bin", self.root / "home/.npm-global/bin"])
        real_file = providers._file
        def local_file(path, windows):
            self.assertTrue(providers._local_path(path), str(path))
            return real_file(path, windows)
        with patch.object(providers, '_file', side_effect=local_file), patch.object(providers.os, 'scandir', side_effect=AssertionError("Remote home must not be scanned")):
            registry = providers.ProviderRegistry(environ=environ, home="//server/profile", windows=True)
            self.assertFalse(any(p["installed"] for p in registry.view()))

    def test_bounded_extension_native_fallback_and_generic_agent_not_cursor(self):
        home = self.root / "home"
        good = self.executable("codex.exe", home / ".vscode/extensions/openai.chatgpt-1.10.0/bin/windows-x86_64")
        self.executable("codex.exe", home / ".vscode/extensions/openai.chatgpt-1.9.0/bin/windows-x86_64")
        self.executable("agent.exe")
        with patch.object(providers.platform, 'machine', return_value='AMD64'):
            registry = providers.ProviderRegistry(environ={"PATH": str(self.bin)}, home=home, windows=True)
            self.assertEqual(registry.command("codex"), [str(good)])
            self.assertFalse(next(p for p in registry.view() if p["id"] == "cursor")["installed"])
            self.executable("agent.exe", home / ".cursor/bin")
            registry.refresh(force=True)
            self.assertTrue(next(p for p in registry.view() if p["id"] == "cursor")["installed"])
            self.assertFalse(next(p for p in registry.view() if p["id"] == "cursor")["available"])

    def test_adapters_preserve_codex_argv_and_claude_access_allowlist(self):
        self.assertEqual(providers.launch_command("codex", ["fixture"], "read-only", "/work"),
                         ["fixture", "-c", 'approval_policy="never"', "exec", "--json", "--ephemeral", "--sandbox", "read-only", "--cd", "/work", "-"])
        for access, tools in (("read-only", "Read,Glob,Grep"), ("workspace-write", "Read,Glob,Grep,Edit,Write")):
            command = providers.launch_command("claude", ["fixture"], access, "/work")
            self.assertEqual(command[command.index("--tools") + 1], tools)
            self.assertEqual(command[command.index("--allowedTools") + 1], tools)
            self.assertIn("--restricted", command)
            self.assertNotIn("--dangerously-skip-permissions", command)
            self.assertFalse({"Bash", "PowerShell", "Agent"}.intersection(tools.split(',')))

    def test_claude_normalizer_ignores_reasoning_raw_tool_data_and_failed_edits(self):
        adapter = providers.EventAdapter("claude", "workspace-write")
        events = adapter.events({"type": "assistant", "message": {"content": [
            {"type": "thinking", "thinking": "PRIVATE_REASONING"},
            {"type": "tool_use", "id": "one", "name": "Edit", "input": {"file_path": "safe.js", "old_string": "PRIVATE_SOURCE"}}]}})
        self.assertEqual(events, [{"kind": "activity", "text": "Editing workspace files", "action": "coding"}])
        self.assertEqual(adapter.events({"type": "user", "message": {"content": [{"type": "tool_result", "tool_use_id": "one", "is_error": True, "content": "PRIVATE_ERROR"}]}}),
                         [{"kind": "activity", "text": "Tool failed", "action": "tool"}])
        forbidden = providers.EventAdapter("claude", "read-only").events({"type": "assistant", "message": {"content": [
            {"type": "tool_use", "id": "two", "name": "Write", "input": {"file_path": "safe.js"}}]}})
        self.assertEqual(forbidden, [{"kind": "failed"}])
        self.assertEqual(adapter.events({"type": "result", "subtype": "error_max_turns", "is_error": True, "result": "PRIVATE_ERROR"}), [{"kind": "failed"}])
        for result in (None, "", " "):
            self.assertEqual(adapter.events({"type": "result", "subtype": "success", "result": result}), [{"kind": "failed"}])
        self.assertEqual(adapter.events({"type": "result", "subtype": "success", "result": "Answer", "permission_denials": [{"tool": "Edit"}]}), [{"kind": "failed"}])


class ProviderQueueTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.workspace = self.root / "workspace"
        self.workspace.mkdir()
        self.managers = []

    def tearDown(self):
        for manager in self.managers:
            manager.close()
        self.temp.cleanup()

    def manager(self, selected=("codex", "claude"), **options):
        commands = {provider: [sys.executable, str(FIXTURES / ("fake_" + provider + ".py"))] for provider in selected}
        manager = live.LiveQueue(self.workspace, self.root / "private", provider_commands=commands,
                                 discover_providers=False, **options)
        self.managers.append(manager)
        return manager

    def request(self, title="Mission", key="a", **options):
        return {"requestId": key * 32, "title": title, "brief": "User goal", "role": "builder", "access": "read-only", **options}

    def wait(self, manager, job_id, statuses=live.TERMINAL):
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            job = next(j for j in manager.view()["jobs"] if j["id"] == job_id)
            if job["status"] in statuses:
                return job
            time.sleep(.02)
        self.fail("Job did not reach expected status")

    def test_sole_provider_automatic_and_multiple_require_explicit_choice(self):
        manager = self.manager()
        with self.assertRaises(live.LiveError) as missing:
            manager.submit(self.request())
        self.assertEqual(missing.exception.status, 400)
        for value in ("unknown", "gemini", "../../claude", 12):
            with self.assertRaises(live.LiveError):
                manager.submit(self.request(provider=value))
        manager.close()
        sole = self.manager(selected=("claude",))
        job = sole.submit(self.request())
        result = self.wait(sole, job["id"])
        self.assertEqual((result["provider"], result["providerLabel"], result["status"]), ("claude", "Claude Code", "completed"))
        self.assertEqual(result["result"], "Claude fixture final result <img src=x onerror=alert(1)>")
        self.assertNotIn("PRIVATE_", sole.history.read_text(encoding="utf-8"))
        self.assertNotIn(str(self.root), json.dumps(sole.view()))

    def test_provider_is_immutable_and_retry_precedes_changed_availability(self):
        manager = self.manager()
        request = self.request(provider="claude")
        job = manager.submit(request)
        self.wait(manager, job["id"])
        manager.providers.overrides.clear()
        manager.providers.refresh(force=True)
        self.assertFalse(manager.view()["enabled"])
        self.assertEqual(manager.submit(request)["provider"], "claude")
        self.assertEqual(manager.submit(self.request())["id"], job["id"])
        with self.assertRaises(live.LiveError) as changed:
            manager.submit(self.request(provider="codex"))
        self.assertEqual(changed.exception.status, 409)

    def test_pinned_provider_removal_fails_without_fallback_and_next_codex_still_runs(self):
        manager = self.manager()
        first = manager.submit(self.request("HANG", provider="codex"))
        self.wait(manager, first["id"], {"running"})
        second = manager.submit(self.request("Queued", "b", provider="claude"))
        del manager.providers.overrides["claude"]
        manager.providers.refresh(force=True)
        manager.cancel(first["id"])
        failed = self.wait(manager, second["id"])
        self.assertEqual((failed["status"], failed["provider"]), ("failed", "claude"))
        third = manager.submit(self.request("Next", "c", provider="codex"))
        self.assertEqual(self.wait(manager, third["id"])["status"], "completed")

    def test_claude_read_only_and_write_file_changes_use_same_private_preview_boundary(self):
        manager = self.manager(allow_edits=True)
        read = manager.submit(self.request("EDIT_CHECK", provider="claude"))
        self.assertEqual(self.wait(manager, read["id"])["status"], "completed")
        self.assertFalse((self.workspace / "fixture-output.txt").exists())
        write = manager.submit(self.request("EDIT_CHECK", "b", provider="claude", access="workspace-write"))
        result = self.wait(manager, write["id"])
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["changes"], [{"path": "fixture-output.txt", "kind": "update"}])
        self.assertIn("+local Claude fixture edit", manager.change_preview(write["id"], 0)["patch"])
        self.assertNotIn("PRIVATE_", manager.history.read_text(encoding="utf-8"))
        self.assertNotIn("patch", manager.history.read_text(encoding="utf-8"))

    def test_claude_protocol_startup_nonzero_and_stream_limits_fail_visibly(self):
        manager = self.manager()
        for title, key in (("CLI_FAIL", "a"), ("NO_COMPLETE", "b"), ("RESULT_ERROR", "c"), ("NONZERO_AFTER_RESULT", "d"), ("BIG_LINE", "e")):
            job = manager.submit(self.request(title, key, provider="claude"))
            result = self.wait(manager, job["id"])
            self.assertEqual(result["status"], "failed", title)
            self.assertEqual(result["provider"], "claude")
        self.assertNotIn("PRIVATE_", manager.history.read_text(encoding="utf-8"))

    def test_claude_cancel_timeout_and_descendant_ownership(self):
        manager = self.manager(timeout=2)
        first = manager.submit(self.request("HANG", provider="claude"))
        self.wait(manager, first["id"], {"running"})
        self.assertEqual(manager.cancel(first["id"])["status"], "cancelled")
        second = manager.submit(self.request("DESCENDANT", "b", provider="claude"))
        self.assertEqual(self.wait(manager, second["id"])["status"], "timed-out")
        third = manager.submit(self.request("Next", "c", provider="claude"))
        self.assertEqual(self.wait(manager, third["id"])["status"], "completed")

    def test_history_migrates_missing_provider_only_and_never_replays_unknown_identity(self):
        manager = self.manager()
        job = manager.submit(self.request(provider="claude"))
        self.wait(manager, job["id"])
        manager.close()
        history = json.loads(manager.history.read_text(encoding="utf-8"))
        history += [{**history[0], "requestId": "b" * 32, "id": "b" * 32, "status": "running", "provider": "future-ai"},
                    {**history[0], "requestId": "c" * 32, "id": "c" * 32}]
        del history[-1]["provider"]
        history[-1]["providerLabel"] = "Untrusted label"
        manager.history.write_text(json.dumps(history), encoding="utf-8")
        restored = self.manager()
        jobs = {j["id"]: j for j in restored.view()["jobs"]}
        self.assertEqual((jobs[job["id"]]["provider"], jobs[job["id"]]["providerLabel"]), ("claude", "Claude Code"))
        self.assertEqual((jobs["b" * 32]["provider"], jobs["b" * 32]["status"], jobs["b" * 32]["providerLabel"]),
                         ("future-ai", "interrupted", "Unknown provider"))
        self.assertEqual((jobs["c" * 32]["provider"], jobs["c" * 32]["providerLabel"]), ("codex", "Codex"))


if __name__ == "__main__":
    unittest.main()
