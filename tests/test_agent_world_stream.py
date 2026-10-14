"""Real bounded HTTP streams, background refresh and private-field projection."""
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

spec = importlib.util.spec_from_file_location("stream_world", Path(__file__).resolve().parents[1] / "scripts" / "agent_world.py")
world = importlib.util.module_from_spec(spec)
spec.loader.exec_module(world)
SESSION = "01234567-89ab-cdef-0123-456789abcdef"


class StreamTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.codex, self.claude = self.root / "codex", self.root / "claude"
        self.codex.mkdir(); self.claude.mkdir()
        self.path = self.claude / (SESSION + ".jsonl")
        self.path.write_text(json.dumps({"type": "user", "sessionId": SESSION, "cwd": "/work/demo"}) + "\n")  # ai-department-allow: session-export (synthetic stream fixture)
        self.calls = 0
        self.block, self.release = threading.Event(), threading.Event()
        def collector():
            self.calls += 1
            if self.calls > 1 and self.block.is_set():
                self.release.wait(3)
            return ([{"pid": 42, "name": "claude", "args": ["claude", "--session-id", SESSION]}], False)
        self.discovery = world.discovery.Discovery(self.codex, self.claude, collector=collector, interval=60)
        self.server = world.make_server(self.root, 0, session_discovery=self.discovery)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True); self.thread.start()
        self.base = "http://127.0.0.1:" + str(self.server.server_address[1])
        self.responses = []

    def tearDown(self):
        self.release.set()
        for response in self.responses:
            response.close()
        self.server.shutdown(); self.server.server_close(); self.thread.join(timeout=2)
        self.temp.cleanup()

    def connect(self):
        response = urlopen(self.base + "/api/events", timeout=4)
        self.responses.append(response)
        self.assertEqual(response.headers["Content-Type"], "text/event-stream")
        return response

    def sessions(self, response, target=b"sessions"):
        kind = ""
        for _ in range(40):
            line = response.readline(world.stream.EventStream.MAX_BYTES + 1)
            if not line:
                self.fail("Stream closed before snapshot")
            if line.startswith(b"event: "):
                kind = line[7:].strip()
            if kind == target and line.startswith(b"data: "):
                return json.loads(line[6:])
        self.fail("No session event")

    def edit(self):
        row = {"type": "assistant", "sessionId": SESSION, "timestamp": world.discovery.timestamp(), "message": {"stop_reason": "tool_use", "content": [{"type": "tool_use", "name": "Edit", "input": {"file_path": "PRIVATE_PATH", "new_string": "PRIVATE_CODE"}}]}}  # ai-department-allow: session-export (synthetic stream fixture)
        with self.path.open("a") as stream:
            stream.write(json.dumps(row) + "\n")

    def test_known_file_activity_pushes_without_inventory_rescan_or_client_poll(self):
        response = self.connect()
        first = self.sessions(response)
        self.assertEqual(first["entries"][0]["status"], "running")
        started = time.monotonic(); self.edit()
        updated = self.sessions(response)
        self.assertEqual(updated["entries"][0]["action"], "coding")
        self.assertLess(time.monotonic() - started, 2)
        self.assertEqual(self.calls, 1)
        self.assertNotIn("PRIVATE", json.dumps(updated))
        self.assertNotIn(SESSION, json.dumps(updated))
        self.assertNotIn("_records", updated)

    def test_stream_rejects_foreign_origin_and_bounds_connections(self):
        for headers in ({"Origin": "https://example.com"}, {"Host": "example.com"}):
            with self.assertRaises(HTTPError) as raised:
                urlopen(Request(self.base + "/api/events", headers=headers), timeout=3)
            self.assertEqual(raised.exception.code, 403)
        for _ in range(world.stream.EventStream.MAX_CLIENTS):
            self.connect()
        with self.assertRaises(HTTPError) as raised:
            urlopen(self.base + "/api/events", timeout=3)
        self.assertEqual(raised.exception.code, 503)

    def test_native_history_unicode_keeps_existing_supported_limits(self):
        when = world.discovery.timestamp()
        jobs = [{"id": f"{i:032x}", "role": "builder", "status": "completed", "access": "read-only", "title": "Fixture", "activity": "Ended", "result": "\u6f22" * 16000, "createdAt": when, "updatedAt": when, "events": [], "changes": []} for i in range(100)]
        payload = {"enabled": True, "allowEdits": False, "workspace": "demo", "token": "fixture-only", "warning": "", "jobs": jobs}
        class NativeHistory:
            def view(self):
                return payload
        self.server.event_stream.native = NativeHistory()
        response = self.connect()
        for _ in range(3):
            update = self.sessions(response, b"native")
            if len(update["jobs"]) == 100:
                break
        self.assertEqual(len(update["jobs"]), 100)
        self.assertEqual(len(update["jobs"][0]["result"]), 16000)
        self.assertFalse(self.server.event_stream.stop.is_set())

    def test_blocked_inventory_does_not_block_known_activity_updates(self):
        response = self.connect(); self.sessions(response)
        self.discovery.disable_live(); self.discovery.interval = 5; self.block.set(); self.discovery.enable_live()
        deadline = time.monotonic() + 7
        while self.calls < 2 and time.monotonic() < deadline:
            time.sleep(.05)
        self.assertGreaterEqual(self.calls, 2)
        # Drain the inventory's previous unchanged frames before editing.
        started = time.monotonic(); self.edit()
        for _ in range(5):
            update = self.sessions(response)
            if update["entries"][0].get("action") == "coding":
                break
        self.assertEqual(update["entries"][0].get("action"), "coding")
        self.assertLess(time.monotonic() - started, 2)


if __name__ == "__main__":
    unittest.main()
