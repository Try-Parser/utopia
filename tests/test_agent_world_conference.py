"""Private conference questions, transport handshake and lifecycle boundaries."""
import importlib.util
import hashlib
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

spec = importlib.util.spec_from_file_location("conference_world", Path(__file__).resolve().parents[1] / "scripts" / "agent_world.py")
world = importlib.util.module_from_spec(spec)
spec.loader.exec_module(world)
D = world.discovery
SESSION = "01234567-89ab-cdef-0123-456789abcdef"


class ConferenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.codex, self.claude = self.root / "sessions", self.root / "projects"
        self.codex.mkdir()
        self.claude.mkdir()
        self.discovery = D.Discovery(self.codex, self.claude, collector=lambda: ([], False), interval=0)

    def tearDown(self):
        self.discovery.disable_live()
        self.temp.cleanup()

    def beat(self, identity="worker", **changes):
        data = {"provider": "Custom AI", "sessionId": identity, "state": "waiting", "workspace": "sample", "pid": None,  # ai-department-allow: session-export (synthetic conference fixture)
                "awaitingHuman": True, "acceptsReplies": True,
                "question": {"id": "pick-1", "text": "PRIVATE_QUESTION: which environment?", "choices": ["Development", "Staging"]}}
        data.update(changes)
        return self.discovery.heartbeat(data)

    def assert_conflict(self, operation, *args):
        with self.assertRaises(D.ConferenceError) as error:
            operation(*args)
        self.assertEqual(error.exception.status, 409)

    def test_versioned_contract_checksum_and_executable_vectors(self):
        raw = (Path(__file__).resolve().parents[1] / "apps" / "agent-world" / "conference.contract.json").read_bytes()
        self.assertEqual(hashlib.sha256(raw.replace(b"\r\n", b"\n")).hexdigest(), "ba2e3ebea7aef4750c00196b3ee45006e836326eee6a02f1ea22326edfe00232")
        contract = json.loads(raw)
        self.assertEqual(contract["version"], 1)
        self.assertEqual(contract["limits"], {"questionText": D.QUESTION_TEXT, "answerText": D.ANSWER_TEXT,
                         "choices": 12, "choiceText": 200, "adapterQuestionId": 80, "retentionSeconds": 300, "freshSeconds": 30})
        identity = self.beat(question=contract["adapterQuestion"], **contract["adapterFields"])
        question = self.discovery.question(identity)
        self.assertEqual(question, {**contract["questionExample"], "questionId": question["questionId"]})
        queued = self.discovery.answer(identity, {**contract["answerExample"], "questionId": question["questionId"]})
        self.assertEqual(set(queued), {"id", "status"})
        self.assertEqual(queued["status"], "queued")
        self.assertEqual(self.discovery.reply(identity), {**contract["replyExample"], "questionId": question["questionId"], "id": queued["id"]})
        acknowledged = self.discovery.acknowledge(identity, {**contract["ackExample"], "questionId": question["questionId"], "id": queued["id"]})
        self.assertEqual(acknowledged, {"id": queued["id"], "status": "acknowledged"})
        self.assertTrue(self.discovery.view()["entries"][0]["awaitingHuman"])

    def test_adapter_handshake_idempotency_ack_keeps_waiting_and_privacy(self):
        identity = self.beat()
        question = self.discovery.question(identity)
        self.assertEqual(question["delivery"], "adapter")
        answer = {"questionId": question["questionId"], "text": "PRIVATE_ANSWER\nuse development\tplease"}
        queued = self.discovery.answer(identity, answer)
        self.assertEqual(queued["status"], "queued")
        self.assertEqual(self.discovery.answer(identity, answer), queued)
        self.assert_conflict(self.discovery.answer, identity, {**answer, "text": "different"})
        reply = self.discovery.reply(identity)
        self.assertEqual(reply["text"], answer["text"])
        ack = {"id": reply["id"], "questionId": reply["questionId"]}
        self.assertEqual(self.discovery.acknowledge(identity, ack)["status"], "acknowledged")
        self.assertEqual(self.discovery.acknowledge(identity, ack)["status"], "acknowledged")
        self.assertFalse(self.discovery.reply(identity)["available"])
        self.beat()
        self.assertEqual(self.discovery.question(identity)["answer"]["status"], "acknowledged")
        inventory = self.discovery.view()
        self.assertTrue(inventory["entries"][0]["awaitingHuman"])
        self.assertNotIn("PRIVATE_", json.dumps(inventory))
        self.assertEqual(set(self.discovery.question(identity)["answer"]), {"id", "status"})

    def test_revision_session_and_transport_binding(self):
        identity = self.beat()
        original = self.discovery.question(identity)["questionId"]
        other = self.beat("other")
        self.assert_conflict(self.discovery.answer, other, {"questionId": original, "text": "answer"})
        self.beat(question={"id": "pick-1", "text": "New exact question?"})
        changed = self.discovery.question(identity)
        self.assertNotEqual(changed["questionId"], original)
        self.assertEqual(changed["choices"], [])
        self.assert_conflict(self.discovery.answer, identity, {"questionId": original, "text": "old answer"})
        self.discovery.answer(identity, {"questionId": changed["questionId"], "text": "answer"})
        pending = self.discovery.reply(identity)
        self.beat(acceptsReplies=False, question={"id": "pick-1", "text": "New exact question?"})
        self.assertEqual(self.discovery.question(identity)["delivery"], "copy")
        self.assert_conflict(self.discovery.acknowledge, identity, {"id": pending["id"], "questionId": pending["questionId"]})
        self.assert_conflict(self.discovery.answer, identity, {"questionId": self.discovery.question(identity)["questionId"], "text": "copy only"})

    def test_resume_clear_expiry_and_repeated_question_new_generation(self):
        identity = self.beat()
        initial = self.discovery.question(identity)["questionId"]
        self.discovery.heartbeat({"provider": "Custom AI", "sessionId": "worker", "state": "working", "workspace": "sample", "pid": None})  # ai-department-allow: session-export (synthetic conference fixture)
        self.assertFalse(self.discovery.question(identity)["available"])
        self.beat()
        self.assertNotEqual(self.discovery.question(identity)["questionId"], initial)
        self.discovery.heartbeats[identity]["seen"] -= 31
        self.assertFalse(self.discovery.question(identity)["available"])
        self.assertNotIn(identity, self.discovery._questions)
        self.beat()
        self.discovery._questions[identity]["seen"] -= 301
        self.assertFalse(self.discovery.question(identity)["available"])
        self.assertEqual(self.discovery._questions, {})

    def test_strict_adapter_and_answer_validation(self):
        for changes in ({"state": "working"}, {"awaitingHuman": False}, {"acceptsReplies": 1},
                        {"question": {"id": "bad id", "text": "Hello?"}},
                        {"question": {"id": "q", "text": "x" * 8001}},
                        {"question": {"id": "q", "text": "Hello\x00?"}},
                        {"question": {"id": "q", "text": "Hello?", "choices": ["x"] * 13}},
                        {"question": {"id": "q", "text": "Hello?", "choices": ["x" * 201]}}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.beat(**changes)
        identity = self.beat(question={"id": "q", "text": "Code\n\twhich path?"})
        question = self.discovery.question(identity)["questionId"]
        for text in ("", "  ", "x" * 4001, "secret\x1b", "hello\rworld", 3):
            with self.subTest(text=repr(text)[:30]), self.assertRaises(ValueError):
                self.discovery.answer(identity, {"questionId": question, "text": text})
        with self.assertRaises(ValueError):
            self.discovery.acknowledge(identity, {"id": "0" * 32, "questionId": "0" * 32, "extra": True})
        self.assert_conflict(self.discovery.acknowledge, identity, {"id": "0" * 32, "questionId": question})

    def test_concurrent_conflicting_answers_have_one_winner(self):
        identity = self.beat()
        question = self.discovery.question(identity)["questionId"]
        barrier, results = threading.Barrier(3), []
        def answer(text):
            barrier.wait()
            try:
                results.append(self.discovery.answer(identity, {"questionId": question, "text": text})["status"])
            except D.ConferenceError as error:
                results.append(error.status)
        threads = [threading.Thread(target=answer, args=(text,)) for text in ("one", "two")]
        for thread in threads:
            thread.start()
        barrier.wait()
        for thread in threads:
            thread.join()
        self.assertCountEqual(results, ["queued", 409])

    def test_registry_bound_and_retention(self):
        for index in range(200):
            self.beat(str(index))
        self.assertEqual(len(self.discovery._questions), 200)
        with self.assertRaises(ValueError):
            self.beat("overflow")
        for beat in self.discovery.heartbeats.values():
            beat["seen"] -= 301
        for question in self.discovery._questions.values():
            question["seen"] -= 301
        self.beat("replacement")
        self.assertEqual(len(self.discovery._questions), 1)

    def record(self, provider, events):
        path = (self.codex if provider == "Codex" else self.claude) / (SESSION + ".jsonl")
        meta = {"type": "session_meta", "payload": {"id": SESSION, "cwd": "/work/sample"}} if provider == "Codex" else {"type": "user", "sessionId": SESSION, "cwd": "/work/sample"}  # ai-department-allow: session-export (synthetic conference fixture)
        path.write_text("\n".join(json.dumps(row) for row in [meta, *events]) + "\n")
        return path

    def test_structured_and_plain_exact_codex_questions_resolve(self):
        self.discovery.enable_live()
        now = D.timestamp()
        events = [{"type": "response_item", "timestamp": now, "payload": {"type": "function_call", "name": "request_user_input_async", "call_id": "call-1",
                   "arguments": json.dumps({"questions": [{"question": "Exact PRIVATE_QUESTION?", "options": [{"label": "Keep it"}, {"label": "Change it"}]}]})}}]
        path = self.record("Codex", events)
        self.discovery.collector = lambda: ([{"pid": 22, "name": "codex", "args": ["codex", "resume", SESSION]}], False)
        identity = D.opaque("Codex", SESSION)
        question = self.discovery.question(identity)
        self.assertTrue(question["available"])
        self.assertEqual(question["text"], "Exact PRIVATE_QUESTION?")
        self.assertEqual(question["choices"], ["Keep it", "Change it"])
        self.assertEqual(question["delivery"], "copy")
        self.assertNotIn("PRIVATE_QUESTION", json.dumps(self.discovery.view()))
        with patch.object(D.time, "time", return_value=time.time() + 600):
            self.assertTrue(self.discovery.question(identity)["available"], "live confirmed pending questions survive old transcript mtimes")
        events += [{"type": "event_msg", "timestamp": now, "payload": {"type": "user_message", "message": "answered"}}]
        self.record("Codex", events)
        self.assertFalse(self.discovery.question(identity)["available"])
        events += [{"type": "response_item", "timestamp": now, "payload": {"type": "message", "role": "assistant", "content": [{"type": "output_text", "text": "Use branch A\nor branch B?"}]}},
                   {"type": "event_msg", "timestamp": now, "payload": {"type": "task_complete"}}]
        self.record("Codex", events)
        self.assertEqual(self.discovery.question(identity)["text"], "Use branch A\nor branch B?")

    def test_claude_exact_identity_plain_question_and_safe_read(self):
        now = D.timestamp()
        path = self.record("Claude Code", [{"type": "assistant", "sessionId": SESSION, "timestamp": now, "message": {"stop_reason": "end_turn", "content": [{"type": "text", "text": "Which exact change?"}]}}])  # ai-department-allow: session-export (synthetic conference fixture)
        record = {"provider": "Claude Code", "path": path, "key": SESSION, "session": SESSION}
        self.assertEqual(D.session_question(record, self.claude)["text"], "Which exact change?")
        with path.open("a") as handle:
            handle.write(json.dumps({"type": "assistant", "sessionId": "other", "timestamp": now, "message": {"stop_reason": "end_turn", "content": "WRONG_SESSION?"}}) + "\n")  # ai-department-allow: session-export (synthetic conference fixture)
        self.assertNotIn("WRONG_SESSION", json.dumps(D.session_question(record, self.claude)))
        with path.open("a") as handle:
            handle.write('{"incomplete":')
        self.assertIsNone(D.session_question(record, self.claude))
        self.assertIsNone(D.session_question(record, self.codex))

    def test_http_token_origin_body_limits_and_handshake(self):
        identity = self.beat()
        server = world.make_server(self.root, port=0, session_discovery=self.discovery)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_address[1]}"
        route = f"/api/sessions/{identity}"
        headers = {"X-Agent-World-Token": self.discovery.token, "Origin": base, "Content-Type": "application/json"}
        def request(path, data=None, supplied=None):
            return urlopen(Request(base + path, data=json.dumps(data).encode() if data is not None else None, headers=headers if supplied is None else supplied), timeout=5)
        try:
            for path in (route + "/question", route + "/reply"):
                for supplied in ({}, {**headers, "X-Agent-World-Token": "wrong"}, {**headers, "Origin": "https://evil.example"}, {**headers, "Host": "evil.example"}):
                    with self.assertRaises(HTTPError) as error:
                        request(path, supplied=supplied)
                    self.assertEqual(error.exception.code, 403)
            with request(route + "/question") as response:
                question = json.load(response)
                self.assertEqual(response.headers["Cache-Control"], "no-store")
            answer = {"questionId": question["questionId"], "text": "answer"}
            for supplied, data, status in [({}, answer, 403), ({**headers, "Origin": "null"}, answer, 403),
                                           ({**headers, "Content-Type": "text/plain"}, answer, 415),
                                           (headers, {**answer, "text": "x" * 13000}, 413), (headers, [], 400)]:
                with self.assertRaises(HTTPError) as error:
                    request(route + "/answer", data, supplied)
                self.assertEqual(error.exception.code, status)
            with request(route + "/answer", answer) as response:
                self.assertEqual(response.status, 202)
                queued = json.load(response)
            with request(route + "/reply") as response:
                reply = json.load(response)
            self.assertEqual(reply["id"], queued["id"])
            with request(route + "/reply/ack", {"id": reply["id"], "questionId": reply["questionId"]}) as response:
                self.assertEqual(json.load(response)["status"], "acknowledged")
            with request("/api/sessions") as response:
                self.assertNotIn("PRIVATE_", response.read().decode())
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()
