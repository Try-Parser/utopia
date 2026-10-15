"""Browser-only offline fixture server; no authentication or model connection."""
from pathlib import Path
import signal
import sqlite3
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / "scripts"))
import agent_world

fixtures = Path(sys.argv[1])
workspace = fixtures / "workspace"
workspace.mkdir()
manager = agent_world.live.LiveQueue(workspace, fixtures / "private", allow_edits=True,
                                     command=[sys.executable, str(Path(__file__).with_name("fake_codex.py"))])
codex_root, claude_root = fixtures / "codex-records", fixtures / "claude-records"
codex_root.mkdir()
claude_root.mkdir()
import json
claude_id = "abcdef01-2345-6789-abcd-ef0123456789"
(codex_root / "record.jsonl").write_text(json.dumps({"type": "session_meta", "payload": {"id": "01234567-89ab-cdef-0123-456789abcdef", "cwd": "/work/demo", "prompt": "DISCOVERY_PRIVATE_PROMPT"}}) + "\n")
(claude_root / (claude_id + ".jsonl")).write_text(json.dumps({"type": "user", "sessionId": claude_id, "cwd": "/work/demo", "message": {"content": "DISCOVERY_PRIVATE_PROMPT"}}) + "\n")  # ai-department-allow: session-export (synthetic fixture)
rows = [{"pid": 3101, "parent": 1, "name": "codex.exe", "args": ["codex", "app-server"]},
        {"pid": 3102, "parent": 1, "name": "claude", "args": ["claude", "--session-id", claude_id]},
        {"pid": 3103, "parent": 1, "name": "node", "args": ["node", "/opt/node_modules/@google/gemini-cli/cli.js"]},
        {"pid": 3104, "parent": 1, "name": "ollama", "args": ["ollama", "serve"]}]
codex_home = fixtures / "codex-home"
codex_home.mkdir()
sessions = agent_world.discovery.Discovery(codex_root, claude_root, collector=lambda: (rows, False), interval=0, codex_home=codex_home)
server = agent_world.make_server(fixtures, 8787, manager, sessions)

def control_fixture():
    for command in sys.stdin:
        if command.strip() == "clear_metadata":
            with sessions.lock:
                sessions.heartbeats.clear()
                sessions.handoffs.clear()
        elif command.strip() == "pause_feed":
            server.event_stream.close()
        elif command.strip() == "resume_feed":
            server.event_stream = agent_world.stream.EventStream(sessions, manager)
            server.event_stream.start()
        elif command.strip() == "runtime_activity":
            identity = "99999999-8888-7777-6666-555555555555"
            with sqlite3.connect(codex_home / "logs_2.sqlite") as logs:
                logs.execute("CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY, ts INTEGER, thread_id TEXT, target TEXT, feedback_log_body TEXT)")
                logs.execute("INSERT INTO logs (ts, thread_id, target, feedback_log_body) VALUES (?, ?, ?, ?)",
                             (int(time.time()), identity, "codex_core::tools::parallel", "PRIVATE_RUNTIME_BODY"))
            with sqlite3.connect(codex_home / "state_2.sqlite") as state:
                state.execute("CREATE TABLE IF NOT EXISTS threads (id TEXT PRIMARY KEY, cwd TEXT, agent_role TEXT, updated_at_ms INTEGER, agent_path TEXT, archived INTEGER)")
                state.execute("INSERT OR REPLACE INTO threads VALUES (?, ?, ?, ?, ?, ?)",
                              (identity, "/work/demo", None, int(time.time() * 1000), None, 0))
        elif command.strip() == "runtime_departments":
            with sqlite3.connect(codex_home / "logs_2.sqlite") as logs:
                for index in range(1, 4):
                    identity = f"77777777-8888-7777-6666-{index:012d}"
                    logs.execute("INSERT INTO logs (ts, thread_id, target, feedback_log_body) VALUES (?, ?, ?, ?)",
                                 (int(time.time()), identity, "codex_core::tools::parallel", "PRIVATE_RUNTIME_BODY"))
            with sqlite3.connect(codex_home / "state_2.sqlite") as state:
                for index, role in enumerate(("qa", "security", "correctness"), 1):
                    identity = f"77777777-8888-7777-6666-{index:012d}"
                    state.execute("INSERT INTO threads VALUES (?, ?, ?, ?, ?, ?)",
                                  (identity, "/work/demo", None, int(time.time() * 1000), f"/root/{role}", 0))
        elif command.strip() == "runtime_clear":
            with sqlite3.connect(codex_home / "logs_2.sqlite") as logs:
                logs.execute("UPDATE logs SET ts=?", (int(time.time()) - 121,))
            with sqlite3.connect(codex_home / "state_2.sqlite") as state:
                state.execute("UPDATE threads SET updated_at_ms=?", (int((time.time() - 121) * 1000),))
        elif command.strip() == "runtime_log_clear":
            with sqlite3.connect(codex_home / "logs_2.sqlite") as logs:
                logs.execute("UPDATE logs SET ts=?", (int(time.time()) - 121,))
threading.Thread(target=control_fixture, daemon=True).start()

class Preview(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        body = b"<!doctype html><html><body><h1 id='preview-title'>Local app preview fixture</h1><p>Live page, not a screenshot</p></body></html>"
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

preview = ThreadingHTTPServer(('127.0.0.1', 8788), Preview)
threading.Thread(target=preview.serve_forever, daemon=True).start()


def stop(*_args):
    raise KeyboardInterrupt()


signal.signal(signal.SIGTERM, stop)
print("Offline browser fixture server ready", flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
    preview.shutdown()
    preview.server_close()
    manager.close()
