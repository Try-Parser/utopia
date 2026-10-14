"""Browser-only offline fixture server; no authentication or model connection."""
from pathlib import Path
import signal
import sys
import threading
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
sessions = agent_world.discovery.Discovery(codex_root, claude_root, collector=lambda: (rows, False), interval=0)
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
