"""Codex hook metadata projection and user-level installation."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


def module(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / (name + ".py"))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


bridge = module("agent_world_codex_hook")
installer = module("install_agent_world_codex_hook")


class CodexHookTests(unittest.TestCase):
    def event(self, kind, **extra):
        return {"hook_event_name": kind, "session_id": "01234567-89ab-cdef-0123-456789abcdef",  # ai-department-allow: session-export (synthetic fixture)
                "cwd": "/work/project", "turn_id": "turn-1", **extra}

    def test_known_tool_reports_department_without_private_input(self):
        payload = bridge.project_event(self.event("PreToolUse", tool_name="apply_patch",
                                                  tool_input={"command": "PRIVATE_CODE"}, transcript_path="PRIVATE_PATH"))
        self.assertEqual((payload["state"], payload["role"], payload["action"]), ("working", "builder", "coding"))
        self.assertNotIn("PRIVATE", json.dumps(payload))
        self.assertNotIn("turn-1", json.dumps(payload))

    def test_unknown_tool_and_turn_state_do_not_invent_department(self):
        unknown = bridge.project_event(self.event("PreToolUse", tool_name="mcp__unknown__thing"))
        self.assertEqual(unknown["state"], "working")
        self.assertNotIn("role", unknown)
        for event, state in (("SessionStart", "idle"), ("UserPromptSubmit", "working"),
                             ("Stop", "waiting"), ("Interrupt", "waiting"), ("SessionEnd", "ended")):
            self.assertEqual(bridge.project_event(self.event(event))["state"], state)
        self.assertIsNone(bridge.project_event(self.event("PermissionRequest")))

    def test_subagent_has_distinct_identity_and_exact_role(self):
        child = bridge.project_event(self.event("SubagentStart", agent_id="a1", agent_type="reviewer"))
        parent = bridge.project_event(self.event("UserPromptSubmit"))
        self.assertNotEqual(child["sessionId"], parent["sessionId"])
        self.assertEqual((child["role"], child["action"]), ("reviewer", "reviewing"))
        self.assertEqual(bridge.project_event(self.event("SubagentStop", agent_id="a1"))["sessionId"], child["sessionId"])
        self.assertNotIn("role", bridge.project_event(self.event("SubagentStart", agent_id="a2", agent_type="unknown")))

    def test_bad_inputs_do_not_report(self):
        self.assertIsNone(bridge.project_event({"hook_event_name": "PreToolUse"}))
        self.assertIsNone(bridge.project_event(self.event("PreToolUse", cwd=42)))
        self.assertIsNone(bridge.project_event(self.event("SubagentStart", agent_id="")))
        with patch.object(bridge, "urlopen", side_effect=OSError("offline")):
            with self.assertRaises(OSError):
                bridge.report(bridge.project_event(self.event("Stop")), 8790)

    def test_install_merges_other_hooks_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            prior = {"description": "existing", "hooks": {"Stop": [{"hooks": [{"type": "command", "command": "existing-hook"}]}]}}
            (home / "hooks.json").write_text(json.dumps(prior), encoding="utf-8")
            installer.install(home, 8790)
            first = json.loads((home / "hooks.json").read_text(encoding="utf-8"))
            self.assertEqual(first["description"], "existing")
            self.assertEqual(first["hooks"]["Stop"][0], prior["hooks"]["Stop"][0])
            self.assertEqual(set(first["hooks"]), set(installer.EVENTS))
            self.assertEqual(json.loads((home / "hooks" / "agent_world_codex_hook.json").read_text())["port"], 8790)
            installer.install(home, 8791)
            second = json.loads((home / "hooks.json").read_text(encoding="utf-8"))
            self.assertEqual(first, second)
            self.assertEqual(json.loads((home / "hooks" / "agent_world_codex_hook.json").read_text())["port"], 8791)


if __name__ == "__main__":
    unittest.main()
