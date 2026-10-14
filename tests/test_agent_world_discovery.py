"""Discovery provenance, projection, extension and local HTTP boundaries."""
import importlib.util
from contextlib import closing
import json
import os
import sqlite3
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

spec = importlib.util.spec_from_file_location("discovery_world", Path(__file__).resolve().parents[1] / "scripts" / "agent_world.py")
world = importlib.util.module_from_spec(spec)
spec.loader.exec_module(world)
D = world.discovery
SESSION = "01234567-89ab-cdef-0123-456789abcdef"


class DiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.codex = self.root / "sessions"
        self.claude = self.root / "projects"
        self.codex.mkdir()
        self.claude.mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def record(self, provider, session=SESSION):
        root = self.codex if provider == "Codex" else self.claude
        path = root / (session + ".jsonl")
        row = {"type": "session_meta", "payload": {"id": session, "cwd": "/work/sample", "prompt": "PRIVATE_PROMPT", "credentials": "PRIVATE_CREDENTIALS"}} if provider == "Codex" else {"type": "user", "sessionId": session, "cwd": "/work/sample", "message": {"content": "PRIVATE_PROMPT"}}  # ai-department-allow: session-export (synthetic fixture)
        path.write_text(json.dumps(row) + "\n")
        return path

    def scanner(self, rows=(), **kwargs):
        return D.Discovery(self.codex, self.claude, collector=lambda: (list(rows), False), interval=0, **kwargs)

    def append_event(self, path, row):
        with path.open("a") as stream:
            stream.write(json.dumps(row) + "\n")

    def test_selected_transcript_exposes_exact_session_text_only_through_token_endpoint(self):
        path = self.record("Claude Code")
        now = D.timestamp()
        self.append_event(path, {"type": "assistant", "sessionId": SESSION, "timestamp": now,  # ai-department-allow: session-export (synthetic transcript fixture)
                                 "message": {"content": [{"type": "text", "text": "I am editing the login form"},
                                                         {"type": "tool_use", "name": "Edit", "input": {"file": "login.py"}}]}})
        self.append_event(path, {"type": "user", "sessionId": SESSION, "timestamp": now,  # ai-department-allow: session-export (synthetic transcript fixture)
                                 "message": {"content": "Please fix the login form"}})
        self.append_event(path, {"type": "assistant", "sessionId": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "timestamp": now,  # ai-department-allow: session-export (synthetic cross-session fixture)
                                 "message": {"content": [{"type": "text", "text": "WRONG_SESSION_SECRET"}]}})
        scanner = self.scanner([{"pid": 23, "name": "claude", "args": ["claude", "--session-id", SESSION]}])
        entry = next(e for e in scanner.view()["entries"] if e["kind"] == "session")
        self.assertNotIn("I am editing", json.dumps(scanner.view()))
        result = scanner.transcript(entry["id"])
        self.assertTrue(result["available"])
        self.assertEqual([e["speaker"] for e in result["entries"]], ["Assistant", "Tool call", "You"])
        self.assertIn("login.py", result["entries"][1]["text"])
        self.assertNotIn("WRONG_SESSION_SECRET", json.dumps(result))
        server = world.make_server(self.root, port=0, session_discovery=scanner)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_address[1]}"
        try:
            route = base + f"/api/sessions/{entry['id']}/transcript"
            with self.assertRaises(HTTPError) as denied:
                urlopen(route)
            self.assertEqual(denied.exception.code, 403)
            with urlopen(Request(route, headers={"X-Agent-World-Token": scanner.token})) as response:
                served = json.load(response)
            self.assertEqual(served["entries"], result["entries"])
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_codex_rollout_transcript_shows_assistant_and_tool_output_when_file_updates(self):
        path = self.record("Codex")
        now = D.timestamp()
        self.append_event(path, {"type": "response_item", "timestamp": now,
                                 "payload": {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "I found the failing test."}]}})
        self.append_event(path, {"type": "response_item", "timestamp": now,
                                 "payload": {"type": "function_call_output", "output": "2 tests failed"}})
        scanner = self.scanner()
        entry = next(e for e in scanner.view()["entries"] if e["kind"] == "session")
        transcript = scanner.transcript(entry["id"])
        self.assertTrue(transcript["available"])
        self.assertEqual([(e["speaker"], e["text"]) for e in transcript["entries"]],
                         [("Assistant", "I found the failing test."), ("Tool result", "2 tests failed")])
        self.assertTrue(entry["transcriptLive"])
        scanner.enable_live()
        self.append_event(path, {"type": "response_item", "timestamp": now,
                                 "payload": {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "A new result is ready."}]}})
        changed = next(e for e in scanner.view()["entries"] if e["id"] == entry["id"])
        self.assertEqual(changed["updatedAt"], entry["updatedAt"])
        self.assertNotEqual(changed["transcriptRevision"], entry["transcriptRevision"])
        self.assertNotIn("A new result is ready.", json.dumps(scanner.view()))
        os.utime(path, (time.time() - 31, time.time() - 31))
        quiet = next(e for e in scanner.view()["entries"] if e["id"] == entry["id"])
        self.assertFalse(quiet["transcriptLive"])
        scanner.disable_live()
        os.utime(path, (time.time() - 600, time.time() - 600))
        self.assertFalse(scanner.transcript(entry["id"])["available"])

    def test_live_claude_tool_events_assign_activity_department_without_private_content(self):
        path = self.record("Claude Code")
        rows = [{"pid": 23, "name": "claude", "args": ["claude", "--session-id", SESSION]}]
        scanner = self.scanner(rows)
        event = {"type": "assistant", "sessionId": SESSION, "timestamp": D.timestamp(), "message": {"stop_reason": "tool_use", "content": [{"type": "tool_use", "name": "Edit", "input": {"file_path": "PRIVATE_FILE", "new_string": "PRIVATE_CODE"}}]}}  # ai-department-allow: session-export (synthetic activity fixture)
        self.append_event(path, event)
        entry = scanner.view()["entries"][0]
        self.assertEqual((entry["status"], entry["role"], entry["action"]), ("event-working", "builder", "coding"))
        self.assertEqual([event["label"] for event in entry["recentEvents"]], ["Editing files"])
        self.assertIn("department follows activity", entry["evidence"])
        self.assertNotIn("PRIVATE", json.dumps(entry))
        self.assertNotIn(SESSION, json.dumps(entry))
        self.assertEqual(self.scanner().view()["entries"][0]["status"], "event-working")
        self.append_event(path, {"type": "assistant", "sessionId": SESSION, "timestamp": D.timestamp(), "message": {"stop_reason": "end_turn", "content": []}})  # ai-department-allow: session-export (synthetic activity fixture)
        entry = scanner.view()["entries"][0]
        self.assertEqual((entry["status"], entry["role"], entry["action"]), ("event-waiting", "builder", None))
        self.assertEqual([event["label"] for event in entry["recentEvents"]], ["Editing files", "Turn finished"])
        self.append_event(path, {"type": "user", "sessionId": SESSION, "timestamp": D.timestamp(), "message": {"content": "PRIVATE_NEW_PROMPT"}})  # ai-department-allow: session-export (synthetic activity fixture)
        self.assertEqual(scanner.view()["entries"][0]["status"], "running")

    def test_human_input_request_waits_for_answer_without_exposing_question(self):
        path = self.record("Claude Code")
        rows = [{"pid": 23, "name": "claude", "args": ["claude", "--session-id", SESSION]}]
        scanner = self.scanner(rows)
        self.append_event(path, {"type": "assistant", "sessionId": SESSION, "timestamp": D.timestamp(),  # ai-department-allow: session-export (synthetic fixture)
                                 "message": {"stop_reason": "tool_use", "content": [{"type": "tool_use", "name": "Edit", "id": "edit-call"}]}})
        self.append_event(path, {"type": "assistant", "sessionId": SESSION, "timestamp": D.timestamp(),  # ai-department-allow: session-export (synthetic fixture)
                                 "message": {"stop_reason": "tool_use", "content": [{"type": "tool_use", "name": "AskUserQuestion", "id": "q1", "input": {"question": "PRIVATE_QUESTION_TEXT"}}]}})
        waiting = scanner.view()["entries"][0]
        self.assertEqual((waiting["status"], waiting["awaitingHuman"], waiting["awaitingHumanMode"]),
                         ("event-waiting", True, "claude"))
        self.assertEqual(waiting["role"], "builder", "a question keeps its existing desk")
        self.assertEqual(waiting["recentEvents"][-1]["label"], "Awaiting your answer")
        self.assertNotIn("PRIVATE_QUESTION_TEXT", json.dumps(scanner.view()))
        scanner.enable_live()
        self.assertTrue(scanner.view()["entries"][0]["awaitingHuman"])
        future_entries = {key: dict(entry) for key, entry in scanner._base_entries.items()}
        scanner._apply_activity(future_entries, scanner._records, time.time() + 301, [], cache=True)
        self.assertTrue(next(iter(future_entries.values()))["awaitingHuman"], "a quiet question remains pending")
        closed_entries = {key: {**entry, "status": "recent"} for key, entry in scanner._base_entries.items()}
        scanner._apply_activity(closed_entries, scanner._records, time.time() + 31, [], cache=False)
        self.assertFalse(next(iter(closed_entries.values())).get("awaitingHuman", False), "a closed session cannot wait indefinitely")
        self.append_event(path, {"type": "user", "sessionId": SESSION, "timestamp": D.timestamp(),  # ai-department-allow: session-export (synthetic fixture)
                                 "message": {"content": [{"type": "tool_result", "tool_use_id": "edit-call", "content": "PRIVATE_UNRELATED_RESULT"}]}})
        self.assertTrue(scanner.view()["entries"][0]["awaitingHuman"], "an unrelated tool result cannot answer the question")
        self.append_event(path, {"type": "user", "sessionId": SESSION, "timestamp": D.timestamp(),  # ai-department-allow: session-export (synthetic fixture)
                                 "message": {"content": [{"type": "tool_result", "tool_use_id": "q1", "content": "PRIVATE_ANSWER"}]}})
        answered = scanner.view()["entries"][0]
        self.assertFalse(answered.get("awaitingHuman", False))
        self.assertEqual(answered["role"], "builder", "the reply gap keeps the worker's home desk")
        self.assertNotIn("PRIVATE_ANSWER", json.dumps(answered))
        scanner.disable_live()

    def test_codex_async_question_ignores_acknowledgement_until_user_message(self):
        path = self.record("Codex")
        scanner = self.scanner([{"pid": 24, "name": "codex", "args": ["codex", "resume", SESSION]}])
        self.append_event(path, {"type": "event_msg", "timestamp": D.timestamp(), "payload": {"type": "task_started"}})
        self.append_event(path, {"type": "response_item", "timestamp": D.timestamp(),
                                 "payload": {"type": "function_call", "name": "apply_patch", "call_id": "prior-edit"}})
        self.append_event(path, {"type": "response_item", "timestamp": D.timestamp(),
                                 "payload": {"type": "function_call", "namespace": "functions", "name": "request_user_input_async", "arguments": "PRIVATE_QUESTION"}})
        waiting = scanner.view()["entries"][0]
        self.assertTrue(waiting["awaitingHuman"])
        self.assertEqual(waiting["awaitingHumanMode"], "async")
        self.assertNotIn("PRIVATE_QUESTION", json.dumps(waiting))
        self.append_event(path, {"type": "response_item", "timestamp": D.timestamp(),
                                 "payload": {"type": "function_call_output", "output": "Request accepted"}})
        self.assertTrue(scanner.view()["entries"][0]["awaitingHuman"])
        self.append_event(path, {"type": "event_msg", "timestamp": D.timestamp(), "payload": {"type": "task_started"}})
        self.append_event(path, {"type": "event_msg", "timestamp": D.timestamp(),
                                 "payload": {"type": "user_message", "message": "PRIVATE_ANSWER"}})
        answered = scanner.view()["entries"][0]
        self.assertFalse(answered.get("awaitingHuman", False))
        self.assertEqual(answered["role"], "builder", "an async reply keeps the reserved computer")
        self.assertNotIn("PRIVATE_ANSWER", json.dumps(answered))

    def test_codex_sync_question_requires_matching_call_result(self):
        path = self.record("Codex")
        scanner = self.scanner([{"pid": 24, "name": "codex", "args": ["codex", "resume", SESSION]}])
        self.append_event(path, {"type": "event_msg", "timestamp": D.timestamp(), "payload": {"type": "task_started"}})
        self.append_event(path, {"type": "response_item", "timestamp": D.timestamp(),
                                 "payload": {"type": "function_call", "name": "apply_patch", "call_id": "edit-call"}})
        self.append_event(path, {"type": "response_item", "timestamp": D.timestamp(),
                                 "payload": {"type": "function_call", "name": "request_user_input", "call_id": "question-call", "arguments": "PRIVATE_QUESTION"}})
        waiting = scanner.view()["entries"][0]
        self.assertTrue(waiting["awaitingHuman"])
        self.assertEqual(waiting["role"], "builder")
        self.assertNotIn("question-call", json.dumps(waiting), "internal call identity must not enter broad metadata")
        self.append_event(path, {"type": "response_item", "timestamp": D.timestamp(),
                                 "payload": {"type": "function_call_output", "call_id": "edit-call", "output": "PRIVATE_UNRELATED_RESULT"}})
        self.assertTrue(scanner.view()["entries"][0]["awaitingHuman"])
        self.append_event(path, {"type": "response_item", "timestamp": D.timestamp(),
                                 "payload": {"type": "function_call_output", "call_id": "question-call", "output": "PRIVATE_ANSWER"}})
        answered = scanner.view()["entries"][0]
        self.assertFalse(answered.get("awaitingHuman", False))
        self.assertEqual(answered["role"], "builder")
        self.assertNotIn("PRIVATE_ANSWER", json.dumps(answered))

    def test_codex_written_question_keeps_home_when_turn_starts_before_reply(self):
        path = self.record("Codex")
        scanner = self.scanner([{"pid": 24, "name": "codex", "args": ["codex", "resume", SESSION]}])
        self.append_event(path, {"type": "event_msg", "timestamp": D.timestamp(), "payload": {"type": "task_started"}})
        self.append_event(path, {"type": "response_item", "timestamp": D.timestamp(),
                                 "payload": {"type": "function_call", "name": "apply_patch", "call_id": "edit-call"}})
        self.append_event(path, {"type": "response_item", "timestamp": D.timestamp(),
                                 "payload": {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "PRIVATE_FINAL_QUESTION?"}]}})
        self.append_event(path, {"type": "event_msg", "timestamp": D.timestamp(), "payload": {"type": "task_complete"}})
        self.assertTrue(scanner.view()["entries"][0]["awaitingHuman"])
        self.append_event(path, {"type": "event_msg", "timestamp": D.timestamp(), "payload": {"type": "task_started"}})
        self.assertTrue(scanner.view()["entries"][0]["awaitingHuman"], "turn start alone is not an answer")
        self.append_event(path, {"type": "event_msg", "timestamp": D.timestamp(),
                                 "payload": {"type": "user_message", "message": "PRIVATE_ANSWER"}})
        answered = scanner.view()["entries"][0]
        self.assertFalse(answered.get("awaitingHuman", False))
        self.assertEqual(answered["role"], "builder")
        self.assertNotIn("PRIVATE_ANSWER", json.dumps(answered))

    def test_final_written_questions_wait_without_exposing_their_text(self):
        for provider in ("Claude Code", "Codex"):
            with self.subTest(provider=provider):
                path = self.record(provider)
                scanner = self.scanner()
                if provider == "Claude Code":
                    self.append_event(path, {"type": "assistant", "sessionId": SESSION, "timestamp": D.timestamp(),  # ai-department-allow: session-export (synthetic fixture)
                                             "message": {"stop_reason": "end_turn", "content": [{"type": "text", "text": "PRIVATE_FINAL_QUESTION?"}]}})
                else:
                    self.append_event(path, {"type": "event_msg", "timestamp": D.timestamp(), "payload": {"type": "task_started"}})
                    self.append_event(path, {"type": "response_item", "timestamp": D.timestamp(),
                                             "payload": {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "PRIVATE_FINAL_QUESTION?"}]}})
                    self.append_event(path, {"type": "event_msg", "timestamp": D.timestamp(), "payload": {"type": "task_complete"}})
                waiting = scanner.view()["entries"][0]
                self.assertTrue(waiting["awaitingHuman"])
                self.assertEqual(waiting["awaitingHumanMode"], "text")
                self.assertNotIn("PRIVATE_FINAL_QUESTION", json.dumps(waiting))
                path.unlink()

    def test_written_question_reply_keeps_home_and_late_tool_answer_refreshes_activity(self):
        path = self.record("Claude Code")
        scanner = self.scanner([{"pid": 23, "name": "claude", "args": ["claude", "--session-id", SESSION]}])
        self.append_event(path, {"type": "assistant", "sessionId": SESSION, "timestamp": D.timestamp(),  # ai-department-allow: session-export (synthetic fixture)
                                 "message": {"stop_reason": "tool_use", "content": [{"type": "tool_use", "name": "Edit"}]}})
        self.append_event(path, {"type": "assistant", "sessionId": SESSION, "timestamp": D.timestamp(),  # ai-department-allow: session-export (synthetic fixture)
                                 "message": {"stop_reason": "end_turn", "content": [{"type": "text", "text": "PRIVATE_FINAL_QUESTION?"}]}})
        self.assertEqual(scanner.view()["entries"][0]["role"], "builder")
        self.append_event(path, {"type": "user", "sessionId": SESSION, "timestamp": D.timestamp(),  # ai-department-allow: session-export (synthetic fixture)
                                 "message": {"content": "PRIVATE_ANSWER"}})
        answered = scanner.view()["entries"][0]
        self.assertFalse(answered.get("awaitingHuman", False))
        self.assertEqual(answered["role"], "builder")
        self.assertNotIn("PRIVATE_ANSWER", json.dumps(answered))

        scanner.enable_live()
        self.append_event(path, {"type": "assistant", "sessionId": SESSION, "timestamp": D.timestamp(),  # ai-department-allow: session-export (synthetic fixture)
                                 "message": {"stop_reason": "tool_use", "content": [{"type": "tool_use", "name": "AskUserQuestion", "id": "late-answer"}]}})
        pending = scanner.view()["entries"][0]
        future = time.time() + D.ACTIVITY_TTL + 1
        self.append_event(path, {"type": "user", "sessionId": SESSION, "timestamp": D.timestamp(future),  # ai-department-allow: session-export (synthetic fixture)
                                 "message": {"content": [{"type": "tool_result", "tool_use_id": "late-answer", "content": "PRIVATE_LATE_ANSWER"}]}})
        os.utime(path, (future, future))
        record = next(r for r in scanner._records if r["provider"] == "Claude Code")
        cached = next(v[1] for v in scanner._activity_cache.values() if v[1] and v[1].get("awaitingHuman"))
        resumed = D.tool_activity(record, self.claude, future + 0.01, cached)
        self.assertEqual(resumed["role"], "builder")
        self.assertAlmostEqual(D.datetime.fromisoformat(resumed["updatedAt"]).timestamp(), future, delta=1)
        scanner.disable_live()

    def test_parallel_claude_subagents_have_distinct_live_work(self):
        self.record("Claude Code")
        children = self.claude / SESSION / "subagents"
        children.mkdir(parents=True)
        for suffix, tool in (("one", "Edit"), ("two", "Read")):
            event = {"type": "assistant", "sessionId": SESSION, "cwd": "/work/sample",  # ai-department-allow: session-export (synthetic fixture)
                     "timestamp": D.timestamp(), "message": {"content": [
                         {"type": "tool_use", "name": tool, "input": {"secret": "PRIVATE_INPUT"}}]}}  # ai-department-allow: session-export (synthetic fixture)
            self.append_event(children / ("agent-" + suffix + ".jsonl"), event)
        rows = [{"pid": 23, "name": "claude", "args": ["claude", "--session-id", SESSION]}]
        result = self.scanner(rows).view()
        agents = [entry for entry in result["entries"] if " agent " in entry["label"]]
        self.assertEqual(len(agents), 2)
        self.assertEqual({entry["action"] for entry in agents}, {"coding", "research"})
        self.assertEqual({entry["status"] for entry in agents}, {"event-working"})
        self.assertEqual({entry["recentEvents"][0]["label"] for entry in agents}, {"Editing files", "Reading project files"})
        self.assertEqual(len({entry["id"] for entry in result["entries"]}), 3)
        parent = next(entry for entry in result["entries"] if entry["pid"] == 23)
        self.assertEqual(parent["activeChildCount"], 2)
        self.assertEqual({entry["parentId"] for entry in agents}, {parent["id"]})
        self.assertNotIn("PRIVATE_INPUT", json.dumps(result))
        self.assertNotIn(SESSION, json.dumps(result))

    def test_cached_timeline_expires_each_event_even_when_latest_action_is_fresh(self):
        path = self.record("Claude Code")
        base = time.time()
        for age, tool in ((299, "Read"), (0, "Edit")):
            self.append_event(path, {"type": "assistant", "sessionId": SESSION, "timestamp": D.timestamp(base - age),  # ai-department-allow: session-export (synthetic activity fixture)
                                     "message": {"content": [{"type": "tool_use", "name": tool}]}})
        rows = [{"pid": 23, "name": "claude", "args": ["claude", "--session-id", SESSION]}]
        scanner = self.scanner(rows)
        scanner.view()
        scanner._live_stop = threading.Event()
        try:
            self.assertEqual([event["label"] for event in scanner.view()["entries"][0]["recentEvents"]],
                             ["Reading project files", "Editing files"])
            with patch.object(D.time, "time", return_value=base + 2):
                entry = scanner.view()["entries"][0]
            self.assertEqual([event["label"] for event in entry["recentEvents"]], ["Editing files"])
            self.assertEqual(entry["status"], "event-working")
        finally:
            scanner._live_stop = None

    def test_claude_subagent_parent_mismatch_is_not_connected(self):
        children = self.claude / "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" / "subagents"
        children.mkdir(parents=True)
        event = {"type": "assistant", "sessionId": SESSION, "cwd": "/work/sample",  # ai-department-allow: session-export (synthetic fixture)
                 "timestamp": D.timestamp(), "message": {"content": [{"type": "tool_use", "name": "Edit"}]}}  # ai-department-allow: session-export (synthetic fixture)
        self.append_event(children / "agent-one.jsonl", event)
        self.assertEqual(self.scanner().view()["entries"], [])

    def test_gemini_cli_session_records_are_discovered_without_ide_process(self):
        home = self.root / "gemini-home"
        chats = home / ".gemini" / "tmp" / "project-hash" / "chats"
        chats.mkdir(parents=True)
        (chats / "session-example.jsonl").write_text(json.dumps({"sessionId": SESSION,  # ai-department-allow: session-export (synthetic fixture)
            "projectHash": "project-hash", "prompt": "PRIVATE_GEMINI_PROMPT"}) + "\n")  # ai-department-allow: session-export (synthetic fixture)
        with patch.dict(os.environ, {"GEMINI_CLI_HOME": str(home)}):
            result = self.scanner().view()
        entry = next(entry for entry in result["entries"] if entry["provider"] == "Gemini CLI")
        self.assertEqual((entry["kind"], entry["status"], entry["workspace"]), ("session", "recent", "Unknown"))
        self.assertNotIn("PRIVATE_GEMINI_PROMPT", json.dumps(result))
        self.assertNotIn(SESSION, json.dumps(result))
        (chats.parent / "other.jsonl").write_text(json.dumps({"sessionId": SESSION}) + "\n")  # ai-department-allow: session-export (synthetic fixture)
        wrong = self.scanner(gemini_root=chats.parent.parent).view()
        self.assertEqual(len([entry for entry in wrong["entries"] if entry["provider"] == "Gemini CLI"]), 1)

    def test_codex_turn_lifecycle_unknown_tool_and_expiry_fail_closed(self):
        path = self.record("Codex")
        scanner = self.scanner()
        def event(kind, payload):
            self.append_event(path, {"type": kind, "timestamp": D.timestamp(), "payload": payload})
        event("response_item", {"type": "function_call", "name": "apply_patch", "arguments": "PRIVATE_CODE"})
        self.assertEqual(scanner.view()["entries"][0]["status"], "recent", "tool alone does not establish a Codex active turn")
        event("event_msg", {"type": "task_started"})
        event("response_item", {"type": "custom_tool_call", "name": "apply_patch", "input": "PRIVATE_CODE"})
        entry = scanner.view()["entries"][0]
        self.assertEqual((entry["status"], entry["action"]), ("event-working", "coding"))
        self.assertEqual([event["label"] for event in entry["recentEvents"]], ["Turn started", "Editing files"])
        self.assertIn("process linkage unknown", entry["evidence"])
        self.assertNotIn("PRIVATE", json.dumps(entry))
        event("response_item", {"type": "function_call", "name": "unrecognized_tool"})
        unknown = scanner.view()["entries"][0]
        self.assertEqual((unknown["status"], unknown["role"], unknown["taskLabel"]), ("event-working", None, None))
        self.assertEqual(unknown["recentEvents"][-1]["label"], "Using tool")
        event("response_item", {"type": "function_call", "name": "exec_command"})
        event("event_msg", {"type": "task_complete"})
        self.assertEqual(scanner.view()["entries"][0]["status"], "recent", "an ended unlinked turn does not create a waiting avatar")
        with patch.object(D.time, "time", return_value=time.time() + 301):
            self.assertEqual(scanner.view()["entries"][0]["status"], "recorded")

    def test_namespaced_codex_tool_calls_show_safe_live_activity(self):
        path = self.record("Codex")
        scanner = self.scanner()
        self.append_event(path, {"type": "event_msg", "timestamp": D.timestamp(), "payload": {"type": "task_started"}})
        self.append_event(path, {"type": "response_item", "timestamp": D.timestamp(), "payload": {
            "type": "function_call", "namespace": "collaboration", "name": "wait_agent", "arguments": "PRIVATE_ARGUMENTS"}})  # ai-department-allow: session-export (synthetic activity fixture)
        entry = scanner.view()["entries"][0]
        self.assertEqual((entry["status"], entry["role"], entry["action"]), ("event-working", "planner", "coordination"))
        self.assertEqual(entry["recentEvents"][-1]["label"], "Waiting for agents")
        self.append_event(path, {"type": "response_item", "timestamp": D.timestamp(), "payload": {
            "type": "function_call", "namespace": "functions", "name": "exec", "arguments": "PRIVATE_COMMAND"}})  # ai-department-allow: session-export (synthetic activity fixture)
        entry = scanner.view()["entries"][0]
        self.assertEqual((entry["status"], entry["role"], entry["action"]), ("event-working", None, None))
        self.assertEqual(entry["recentEvents"][-1]["label"], "Using tool")
        self.assertNotIn("PRIVATE", json.dumps(entry))

    def test_live_codex_sqlite_threads_appear_without_hook_or_session_file(self):
        home = self.root / "codex-home"
        home.mkdir()
        with closing(sqlite3.connect(home / "logs_2.sqlite")) as logs:
            logs.execute("CREATE TABLE logs (id INTEGER PRIMARY KEY, ts INTEGER, thread_id TEXT, target TEXT, feedback_log_body TEXT)")
            logs.execute("INSERT INTO logs VALUES (1, ?, ?, ?, ?)",
                         (int(time.time()), SESSION, "codex_core::tools::parallel", "PRIVATE_PROMPT PRIVATE_CODE"))
            logs.commit()
        with closing(sqlite3.connect(home / "state_5.sqlite")) as state:
            state.execute("CREATE TABLE threads (id TEXT PRIMARY KEY, cwd TEXT, agent_role TEXT)")
            state.execute("INSERT INTO threads VALUES (?, ?, ?)", (SESSION, "/work/sample", "qa"))
            state.commit()
        scanner = D.Discovery(self.codex, self.claude, collector=lambda: ([], False),
                              interval=0, codex_home=home)
        result = scanner.view()
        entry = next(e for e in result["entries"] if e["provider"] == "Codex")
        self.assertEqual((entry["kind"], entry["status"], entry["role"], entry["action"]),
                         ("session", "event-waiting", "qa", None))
        self.assertEqual(entry["workspace"], "sample")
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertNotIn(SESSION, json.dumps(result))
        path = self.record("Codex")
        for row in ({"type": "event_msg", "timestamp": D.timestamp(), "payload": {"type": "task_started"}},
                    {"type": "response_item", "timestamp": D.timestamp(), "payload": {"type": "function_call", "name": "apply_patch"}},
                    {"type": "event_msg", "timestamp": D.timestamp(), "payload": {"type": "task_complete"}}):
            self.append_event(path, row)
        linked = D.Discovery(self.codex, self.claude, codex_home=home,
                             collector=lambda: ([{"pid": 23, "name": "codex", "args": ["codex", "--session-id", SESSION]}], False), interval=0)
        completed = next(e for e in linked.view()["entries"] if e["id"] == entry["id"])
        self.assertEqual(completed["status"], "event-waiting")
        self.assertIn("Local tool events", completed["evidence"])
        with patch.object(D.time, "monotonic", return_value=time.monotonic() + 1), \
                patch.object(D.time, "time", return_value=time.time() + 121):
            self.assertFalse(any(e["provider"] == "Codex" and e["status"] == "event-waiting" for e in scanner.view()["entries"]))
        (home / "state_5.sqlite").unlink()
        (home / "logs_2.sqlite").rename(home / "logs_17.sqlite")
        with patch.dict(os.environ, {"CODEX_HOME": str(home)}):
            portable = D.Discovery(claude_root=self.claude, collector=lambda: ([], False), interval=0)
            self.assertEqual(portable.roots["Codex"], home / "sessions")
            self.assertEqual(portable.codex_home, home)
            entry = next(e for e in portable.view()["entries"] if e["provider"] == "Codex")
            self.assertEqual((entry["workspace"], entry["role"]), ("Unknown", None))
        with closing(sqlite3.connect(home / "state_99.sqlite")) as incompatible:
            incompatible.execute("CREATE TABLE unrelated (value TEXT)")
        fallback = D.Discovery(codex_home=home, codex_root=self.codex,
                               claude_root=self.claude, collector=lambda: ([], False), interval=0)
        self.assertTrue(any(e["provider"] == "Codex" and e["status"] == "event-waiting"
                            for e in fallback.view()["entries"]))
        relative = Path(os.path.relpath(home, Path.cwd()))
        with patch.dict(os.environ, {"CODEX_HOME": str(self.root / "wrong-profile")}):
            explicit = D.Discovery(codex_home=relative, claude_root=self.claude,
                                   collector=lambda: ([], False), interval=0)
            self.assertEqual(explicit.codex_home, home.absolute())
            self.assertEqual(explicit.roots["Codex"], home.absolute() / "sessions")
        self.assertTrue(any(e["provider"] == "Codex" for e in explicit.view()["entries"]))

    def test_live_codex_runtime_events_identify_session_without_inventing_work(self):
        home = self.root / "codex-home"
        home.mkdir()
        now = int(time.time())
        with closing(sqlite3.connect(home / "logs_2.sqlite")) as logs:
            logs.execute("CREATE TABLE logs (id INTEGER PRIMARY KEY, ts INTEGER, thread_id TEXT, target TEXT, feedback_log_body TEXT)")
            logs.execute("INSERT INTO logs VALUES (1, ?, ?, ?, ?)",
                         (now - 4, SESSION, "codex_core::session::turn", "PRIVATE_PROMPT"))
            logs.execute("INSERT INTO logs VALUES (2, ?, ?, ?, ?)",
                         (now - 2, SESSION, "codex_core::tools::parallel", "PRIVATE_COMMAND"))
            logs.commit()
        with closing(sqlite3.connect(home / "state_5.sqlite")) as state:
            state.execute("CREATE TABLE threads (id TEXT PRIMARY KEY, cwd TEXT, agent_role TEXT, updated_at_ms INTEGER)")
            state.execute("INSERT INTO threads VALUES (?, ?, ?, ?)",
                          (SESSION, "/work/sample", None, now * 1000))
            state.commit()
        scanner = D.Discovery(self.codex, self.claude, collector=lambda: ([], False),
                              interval=0, codex_home=home)
        entry = next(e for e in scanner.view()["entries"] if e["provider"] == "Codex")
        self.assertEqual((entry["status"], entry["role"], entry["action"]),
                         ("event-waiting", None, None))
        self.assertEqual([event["label"] for event in entry["recentEvents"]], ["Turn activity", "Tool activity"])
        self.assertNotIn("PRIVATE", json.dumps(entry))
        self.assertNotIn(SESSION, json.dumps(entry))
        with patch.object(D.time, "monotonic", return_value=time.monotonic() + 1), \
                patch.object(D.time, "time", return_value=now + 20):
            older = next(e for e in scanner.view()["entries"] if e["provider"] == "Codex")
        self.assertEqual((older["status"], older["action"]), ("event-waiting", None))

    def test_codex_agent_paths_route_parallel_workers_without_exposing_paths(self):
        home = self.root / "codex-home"
        home.mkdir()
        identities = [f"99999999-8888-7777-6666-{index:012d}" for index in range(1, 5)]
        paths = ["/root/qa", "/root/security", "/root/correctness", "/root/security_extra"]
        with closing(sqlite3.connect(home / "logs_2.sqlite")) as logs:
            logs.execute("CREATE TABLE logs (id INTEGER PRIMARY KEY, ts INTEGER, thread_id TEXT, target TEXT)")
            logs.executemany("INSERT INTO logs (ts, thread_id, target) VALUES (?, ?, ?)",
                             [(int(time.time()), identity, "codex_core::tools::parallel") for identity in identities])
            logs.commit()
        with closing(sqlite3.connect(home / "state_5.sqlite")) as state:
            state.execute("CREATE TABLE threads (id TEXT PRIMARY KEY, cwd TEXT, agent_role TEXT, agent_path TEXT)")
            state.executemany("INSERT INTO threads VALUES (?, ?, ?, ?)",
                              [(identity, "/work/sample", None, path) for identity, path in zip(identities, paths)])
            state.commit()
        result = D.Discovery(self.codex, self.claude, collector=lambda: ([], False),
                             interval=0, codex_home=home).view()
        entries = {entry["id"]: entry for entry in result["entries"] if entry["provider"] == "Codex"}
        self.assertEqual([entries[D.opaque("Codex", identity)]["role"] for identity in identities],
                         ["qa", "security", "reviewer", None])
        self.assertNotIn("/root/", json.dumps(result))
        self.assertTrue(all(entry["action"] is None for entry in entries.values()))

    def test_activity_is_bounded_and_explicit_heartbeat_wins(self):
        path = self.record("Claude Code")
        rows = [{"pid": 23, "name": "claude", "args": ["claude", "--session-id", SESSION]}]
        scanner = self.scanner(rows)
        event = {"type": "assistant", "sessionId": SESSION, "timestamp": D.timestamp(), "message": {"stop_reason": "tool_use", "content": [{"type": "tool_use", "name": "Bash", "input": {"command": "PRIVATE_COMMAND"}}]}}  # ai-department-allow: session-export (synthetic activity fixture)
        self.append_event(path, event)
        scanner.heartbeat({"provider": "Claude Code", "sessionId": SESSION, "state": "working", "workspace": "/work/demo", "pid": 23, "role": "qa", "taskId": "actual-task", "action": "testing"})  # ai-department-allow: session-export (synthetic activity fixture)
        self.assertEqual(scanner.view()["entries"][0]["role"], "qa")
        with patch.object(D.time, "monotonic", return_value=time.monotonic() + 31):
            self.assertEqual(scanner.view()["entries"][0]["action"], "command")
        scanner.heartbeats.clear()
        scanner.cache = None
        self.append_event(path, {"type": "assistant", "sessionId": SESSION, "timestamp": D.timestamp(), "message": {"content": "x" * 65537}})  # ai-department-allow: session-export (synthetic activity fixture)
        self.assertEqual(scanner.view()["entries"][0]["status"], "running")
        # A nested agent file sharing the parent's session ID is never attributed to it.
        nested = self.claude / "agent-child.jsonl"
        nested.write_text(json.dumps(event) + "\n")
        record = {"provider": "Claude Code", "key": SESSION, "path": nested}
        self.assertIsNone(D.tool_activity(record, self.claude, time.time()))

    def test_recognizes_native_and_runtime_entrypoints_not_prompt_mentions(self):
        cases = [("codex.exe", ['codex', 'exec'], "Codex"), ("claude", ['claude'], "Claude Code"),
                 ("node.exe", ['node', '--no-warnings', '/usr/node_modules/@google/gemini-cli/dist/index.js'], "Gemini CLI"),
                 ("python3", ['python3', '-u', '-m', 'aider'], "Aider"),
                 ("node", ['node', '/work/server.js', 'claude codex @openai/codex/'], None),
                 ("node", ['node', '-e', '/node_modules/@openai/codex/index.js'], None),
                 ("powershell.exe", ['powershell', 'claude'], None)]
        for name, args, expected in cases:
            with self.subTest(name=name, args=args):
                self.assertEqual(D.recognize({"name": name, "args": args})[0], expected)

    def test_process_id_correlates_session_without_fabricating_working_state(self):
        self.record("Codex")
        rows = [{"pid": 23, "parent": 1, "name": "codex.exe", "args": ['codex', 'exec', 'resume', SESSION]}]
        view = self.scanner(rows).view()
        self.assertEqual(len(view["entries"]), 1)
        entry = view["entries"][0]
        self.assertEqual((entry["status"], entry["pid"], entry["workspace"]), ("running", 23, "sample"))
        self.assertIn("Session ID matched", entry["evidence"])
        projection = json.dumps({key: value for key, value in view.items() if key != "token"})
        self.assertNotIn("PRIVATE", projection)
        self.assertNotIn(SESSION, projection)
        self.assertNotIn(SESSION[:8], projection)

    def test_duplicate_records_keep_newest_freshness_and_workspace(self):
        for provider in ("Codex", "Claude Code"):
            with self.subTest(provider=provider):
                newest = self.record(provider)
                older = newest.with_name("older.jsonl")
                older.write_text(newest.read_text().replace("/work/sample", "/work/older"))
                old_time = time.time() - 600
                os.utime(older, (old_time, old_time))
                entries = [e for e in self.scanner().view()["entries"] if e["provider"] == provider]
                self.assertEqual(len(entries), 1)
                self.assertEqual(entries[0]["status"], "recent")
                self.assertEqual(entries[0]["workspace"], "sample")

    @unittest.skipUnless(hasattr(os, "mkfifo"), "POSIX special file regression")
    def test_special_file_is_skipped_without_blocking_the_scan(self):
        fifo = self.codex / "blocked.jsonl"
        os.mkfifo(fifo)
        results = []
        worker = threading.Thread(target=lambda: results.append(self.scanner().view()), daemon=True)
        worker.start()
        worker.join(.5)
        blocked = worker.is_alive()
        if blocked:
            # Release old-code failure without hanging test teardown.
            descriptor = os.open(fifo, os.O_WRONLY | os.O_NONBLOCK)
            os.close(descriptor)
            worker.join(2)
        self.assertFalse(blocked, "Discovery blocked on a special file")
        self.assertEqual(results[0]["entries"], [])
        self.assertTrue(results[0]["partial"])

    def test_claude_record_is_recent_metadata_not_a_running_process(self):
        self.record("Claude Code")
        entry = self.scanner().view()["entries"][0]
        self.assertEqual(entry["provider"], "Claude Code")
        self.assertEqual(entry["status"], "recent")
        self.assertIsNone(entry["pid"])
        self.assertNotIn("PRIVATE", json.dumps(entry))

    def test_os_failure_still_shows_records_with_explicit_partial_warning(self):
        self.record("Codex")
        scanner = self.scanner()
        scanner.collector = lambda: (_ for _ in ()).throw(OSError("PRIVATE_PATH"))
        result = scanner.view()
        self.assertTrue(result["partial"])
        self.assertIn("unavailable", result["warnings"][0])
        self.assertEqual(result["entries"][0]["status"], "recent")
        self.assertNotIn("PRIVATE_PATH", json.dumps(result))

    def test_custom_process_and_provider_neutral_heartbeat_expire_honestly(self):
        scanner = self.scanner([{"pid": 5, "parent": 1, "name": "my-agent.exe", "args": []}], custom=["Custom AI=my-agent.exe"])
        self.assertEqual(scanner.view()["entries"][0]["provider"], "Custom AI")
        data = {"provider": "Other AI", "sessionId": "custom-session", "state": "working", "workspace": "/work/project", "pid": None}  # ai-department-allow: session-export (synthetic fixture)
        with patch.object(D.time, "monotonic", return_value=0):
            scanner.heartbeat(data)
            self.assertIn("adapter-working", [e["status"] for e in scanner.view()["entries"]])
        with patch.object(D.time, "monotonic", return_value=31):
            self.assertIn("adapter-stale", [e["status"] for e in scanner.view()["entries"]])
        with patch.object(D.time, "monotonic", return_value=301):
            self.assertFalse(any(e["provider"] == "Other AI" for e in scanner.view()["entries"]))
        with self.assertRaises(ValueError):
            scanner.heartbeat({**data, "prompt": "not accepted"})
        with self.assertRaises(ValueError):
            D.process_rule("Custom AI=path/to/executable;command")

    def test_provider_neutral_adapter_can_report_and_clear_human_wait(self):
        scanner = self.scanner()
        data = {"provider": "Other AI", "sessionId": "custom-question", "state": "waiting", "workspace": "/work/project", "pid": None}  # ai-department-allow: session-export (synthetic fixture)
        identity = scanner.heartbeat({**data, "awaitingHuman": True})
        waiting = next(e for e in scanner.view()["entries"] if e["id"] == identity)
        self.assertEqual((waiting["status"], waiting["awaitingHuman"]), ("adapter-waiting", True))
        scanner.heartbeat({**data, "state": "working", "awaitingHuman": False})
        resumed = next(e for e in scanner.view()["entries"] if e["id"] == identity)
        self.assertFalse(resumed["awaitingHuman"])
        for invalid in ({**data, "awaitingHuman": "yes"}, {**data, "state": "working", "awaitingHuman": True}):
            with self.assertRaises(ValueError):
                scanner.heartbeat(invalid)

    def test_symlink_and_oversized_headers_are_not_read_or_counted_as_complete(self):
        outside = self.root / "outside.jsonl"
        outside.write_text(json.dumps({"sessionId": SESSION, "cwd": "/private/secret"}))  # ai-department-allow: session-export (synthetic fixture)
        try:
            (self.claude / "link.jsonl").symlink_to(outside)
        except OSError:
            pass
        (self.codex / "large.jsonl").write_text('"' + "x" * 65536 + '"')
        result = self.scanner().view()
        self.assertEqual(result["entries"], [])
        self.assertTrue(result["partial"])

    def test_role_handoff_projection_idempotency_expiry_and_private_references(self):
        scanner = self.scanner()
        data = {"provider": "Other AI", "sessionId": "external-worker", "state": "waiting", "workspace": "/work/project", "pid": None,  # ai-department-allow: session-export (synthetic fixture)
                "role": "builder", "taskId": "private-task-key", "handoffTo": "reviewer", "eventId": "private-event-key"}
        with patch.object(D.time, "monotonic", return_value=0):
            scanner.heartbeat(data)
            scanner.heartbeat(data)
            view = scanner.view()
            self.assertEqual(len(view["handoffs"]), 1)
            self.assertEqual(view["entries"][0]["role"], "builder")
            self.assertEqual(view["handoffs"][0]["toRole"], "reviewer")
            self.assertEqual(view["entries"][0]["taskRef"], view["handoffs"][0]["taskRef"])
            self.assertNotIn("private-task-key", json.dumps(view))
            self.assertNotIn("private-event-key", json.dumps(view))
            with self.assertRaises(ValueError):
                scanner.heartbeat({**data, "handoffTo": "qa"})
            self.assertEqual(scanner.view()["handoffs"][0]["toRole"], "reviewer")
        with patch.object(D.time, "monotonic", return_value=31):
            view = scanner.view()
            self.assertIsNone(view["entries"][0]["role"])
            self.assertIsNone(view["entries"][0]["taskRef"])
        with patch.object(D.time, "monotonic", return_value=301):
            self.assertEqual(scanner.view()["handoffs"], [])

    def test_invalid_workflow_metadata_does_not_mutate_registry(self):
        scanner = self.scanner()
        data = {"provider": "Other AI", "sessionId": "worker", "state": "working", "workspace": "", "pid": None}  # ai-department-allow: session-export (synthetic fixture)
        for extra in ({"role": "boss"}, {"role": []}, {"taskId": "prompt with spaces"}, {"taskId": 9},
                      {"handoffTo": "qa"}, {"eventId": "x"}, {"role": "builder", "handoffTo": "qa", "eventId": "x"}):
            with self.subTest(extra=extra), self.assertRaises(ValueError):
                scanner.heartbeat({**data, **extra})
        self.assertEqual(scanner.view()["entries"], [])
        self.assertEqual(scanner.view()["handoffs"], [])

    def test_work_details_specific_colleagues_and_privacy_expiry(self):
        scanner = self.scanner()
        peer = {"provider": "Other AI", "sessionId": "private-peer-reference", "state": "working", "workspace": "", "pid": None, "role": "reviewer", "taskId": "task-reference", "taskLabel": "Review checkout", "action": "reviewing"}  # ai-department-allow: session-export (synthetic fixture)
        helper = {**peer, "sessionId": "private-helper-reference", "role": "builder", "action": "helping", "targetProvider": "Other AI", "targetSessionId": "private-peer-reference"}  # ai-department-allow: session-export (synthetic fixture)
        with patch.object(D.time, "monotonic", return_value=0):
            target = scanner.heartbeat(peer)
            source = scanner.heartbeat(helper)
            entry = next(e for e in scanner.view()['entries'] if e['id'] == source)
            self.assertEqual(entry['targetRef'], target)
            self.assertEqual(entry['taskLabel'], 'Review checkout')
            self.assertEqual(entry['action'], 'helping')
            self.assertEqual(entry['targetKind'], 'session')
            self.assertNotIn('private-peer-reference', json.dumps(scanner.view()))
            self.assertNotIn('private-helper-reference', json.dumps(scanner.view()))
            scanner.heartbeat({**helper, 'state': 'waiting', 'action': 'coding', 'handoffTo': 'reviewer', 'eventId': 'transfer'})
            self.assertEqual(scanner.view()['handoffs'][0]['targetRef'], target)
            self.assertEqual(scanner.view()['handoffs'][0]['taskLabel'], 'Review checkout')
        with patch.object(D.time, 'monotonic', return_value=31):
            expired = next(e for e in scanner.view()['entries'] if e['id'] == source)
            for name in ('action', 'taskLabel', 'targetRef', 'targetKind'):
                self.assertIsNone(expired[name])
        scanner.heartbeat({**peer, 'sessionId': 'native-helper', 'role': 'builder', 'action': 'helping', 'targetJobId': 'a'*32})  # ai-department-allow: session-export (synthetic fixture)
        job_target = next(e for e in scanner.view()['entries'] if e['targetKind'] == 'job')
        self.assertEqual(job_target['targetRef'], 'a'*32)

    def test_invalid_work_details_never_mutate_registry(self):
        scanner = self.scanner()
        base = {"provider": "Other AI", "sessionId": "helper", "state": "working", "workspace": "", "pid": None, "role": "builder", "taskId": "task"}  # ai-department-allow: session-export (synthetic fixture)
        invalid = [{'taskLabel': 'x'*101}, {'taskLabel': ' '*100+'x'}, {'taskLabel': 'line\nline'}, {'taskLabel': []}, {'action': 'approved'}, {'action': []}, {'action': 'helping'}, {'targetProvider': 'Other AI'}, {'targetProvider': 'Other AI', 'targetSessionId': 'peer'}, {'action': 'helping', 'targetProvider': 'Other AI', 'targetSessionId': 'helper'}, {'action': 'helping', 'targetJobId': '../file'}, {'action': 'helping', 'targetJobId':'a'*32, 'targetProvider':'Other AI', 'targetSessionId':'peer'}]
        for extra in invalid:
            with self.subTest(extra=extra), self.assertRaises(ValueError):
                scanner.heartbeat({**base, **extra})
        without_role = {k:v for k,v in base.items() if k != 'role'}
        with self.assertRaises(ValueError):
            scanner.heartbeat({**without_role, 'taskLabel': 'Task'})
        self.assertEqual(scanner.view()['entries'], [])

    def test_handoff_journal_is_bounded_and_plain_heartbeats_stay_compatible(self):
        scanner = self.scanner()
        base = {"provider": "Other AI", "sessionId": "worker", "state": "waiting", "workspace": "", "pid": None}  # ai-department-allow: session-export (synthetic fixture)
        scanner.heartbeat(base)
        self.assertIsNone(scanner.view()["entries"][0]["role"])
        for index in range(85):
            scanner.heartbeat({**base, "role": "builder", "taskId": "work", "handoffTo": "qa", "eventId": f"event-{index}"})
        self.assertEqual(len(scanner.view()["handoffs"]), 80)

    def test_poll_removes_ended_process_and_limits_are_explicit(self):
        rows = [{"pid": i+1, "name": "codex", "args": []} for i in range(D.RECORD_LIMIT+1)]
        scanner = self.scanner(rows)
        self.assertEqual(len(scanner.view()["entries"]), D.RECORD_LIMIT)
        self.assertTrue(scanner.view()["partial"])
        scanner.collector = lambda: ([], False)
        self.assertEqual(scanner.view()["entries"], [])

    def test_http_discovery_and_heartbeat_have_host_origin_and_token_controls(self):
        scanner = self.scanner()
        server = world.make_server(self.root, port=0, session_discovery=scanner)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_address[1]}"
        data = {"provider": "Other AI", "sessionId": "session", "state": "idle", "workspace": "", "pid": None}  # ai-department-allow: session-export (synthetic fixture)
        headers = {"Origin": base, "Content-Type": "application/json", "X-Agent-World-Token": scanner.token}
        try:
            with urlopen(base + "/api/sessions") as response:
                self.assertEqual(json.load(response)["entries"], [])
            for changes in ({"Origin": "https://evil.example"}, {"Host": "evil.example"}, {"X-Agent-World-Token": "wrong"}):
                with self.assertRaises(HTTPError) as failure:
                    urlopen(Request(base + "/api/sessions/heartbeat", data=json.dumps(data).encode(), headers={**headers, **changes}))
                self.assertEqual(failure.exception.code, 403)
            with urlopen(Request(base + "/api/sessions/heartbeat", data=json.dumps(data).encode(), headers=headers)) as response:
                self.assertEqual(response.status, 200)
            with urlopen(base + "/api/sessions") as response:
                self.assertEqual(json.load(response)["entries"][0]["status"], "adapter-idle")
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()
