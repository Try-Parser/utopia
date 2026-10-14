#!/usr/bin/env python3
"""Serve Agent World: simulation, observed checkpoints, and optional native tasks."""
import argparse
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import hashlib
import importlib.util
from pathlib import Path
import re
import socket
import time
from urllib.parse import urlsplit
_live_spec = importlib.util.spec_from_file_location("_agent_world_live", Path(__file__).with_name("agent_world_live.py"))
live = importlib.util.module_from_spec(_live_spec)
_live_spec.loader.exec_module(live)
_discovery_spec = importlib.util.spec_from_file_location("_agent_world_discovery", Path(__file__).with_name("agent_world_discovery.py"))
discovery = importlib.util.module_from_spec(_discovery_spec)
_discovery_spec.loader.exec_module(discovery)

_stream_spec = importlib.util.spec_from_file_location("_agent_world_stream", Path(__file__).with_name("agent_world_stream.py"))
stream = importlib.util.module_from_spec(_stream_spec)
_stream_spec.loader.exec_module(stream)


ASSETS = Path(__file__).resolve().parents[1] / "apps" / "agent-world"
FILES = {"/": ("index.html", "text/html; charset=utf-8"),
         "/index.html": ("index.html", "text/html; charset=utf-8"),
         "/style.css": ("style.css", "text/css; charset=utf-8"),
         "/engine.js": ("engine.js", "text/javascript; charset=utf-8"),
         "/live.js": ("live.js", "text/javascript; charset=utf-8"),
         "/sessions.js": ("sessions.js", "text/javascript; charset=utf-8"),
         "/app.js": ("app.js", "text/javascript; charset=utf-8"),
         "/game-model.js": ("game-model.js", "text/javascript; charset=utf-8"),
         "/office-model.js": ("office-model.js", "text/javascript; charset=utf-8"),
         "/office.js": ("office.js", "text/javascript; charset=utf-8"),
         "/screens.js": ("screens.js", "text/javascript; charset=utf-8"),
         "/screen-model.js": ("screen-model.js", "text/javascript; charset=utf-8"),
         "/game.js": ("game.js", "text/javascript; charset=utf-8")}
MAX_STATE_BYTES = 1024 * 1024


def label(value, default="Unknown"):
    if not isinstance(value, str) or not value.strip():
        return default
    return re.sub(r"[^a-zA-Z0-9 ._:/-]", "", value)[:100] or default


def observed_runs(root, timestamp=None):
    """Expose an allowlist of checkpoint metadata, never arbitrary state fields."""
    timestamp = time.time() if timestamp is None else timestamp
    root = Path(root).resolve()
    runs, unreadable = [], 0
    if not root.is_dir():
        return {"runs": [], "unreadable": 0}
    # Workflow layout is <ticket>/<run>/state.json, not a general file browser.
    candidates = []
    for path in root.glob("*/*/state.json"):
        if len(candidates) >= 500:
            break
        try:
            if any(p.is_symlink() or (hasattr(p, "is_junction") and p.is_junction())
                   for p in (path, path.parent, path.parent.parent)):
                unreadable += 1
                continue
            path.resolve().relative_to(root)
            stat = path.stat()
            if stat.st_size > MAX_STATE_BYTES:
                unreadable += 1
                continue
            candidates.append((stat.st_mtime, path))
        except (OSError, ValueError):
            unreadable += 1
    for modified, path in sorted(candidates, key=lambda pair: pair[0], reverse=True)[:100]:
        try:
            # Bound reads as well as stat, since another process may grow the file.
            with path.open("rb") as handle:
                raw = handle.read(MAX_STATE_BYTES + 1)
            if len(raw) > MAX_STATE_BYTES:
                raise ValueError("Oversized checkpoint")
            state = json.loads(raw.decode("utf-8-sig"))
            if not isinstance(state, dict) or state.get("tier") not in ("small", "medium", "large"):
                raise ValueError("Invalid checkpoint")
            phase = state.get("phase")
            if not isinstance(phase, str):
                current = state.get("current")
                phase = current.get("phase", "Unknown") if isinstance(current, dict) else "Unknown"
            if not isinstance(phase, str):
                phase = "Unknown"
            complete = phase.lower() in ("complete", "completed", "delivered")
            runs.append({"name": label(path.parent.parent.name) + " / " + label(path.parent.name),
                         "phase": label(phase), "tier": state["tier"],
                         "status": "Recorded complete" if complete else "Recorded " + label(phase),
                         "updatedAt": datetime.fromtimestamp(modified, timezone.utc).isoformat(),
                         "stale": not complete and timestamp - modified > 900})
        except (OSError, ValueError, TypeError, RecursionError):
            unreadable += 1
    return {"runs": runs, "unreadable": unreadable}


def make_server(root, port=8787, live_queue=None, session_discovery=None):
    root = Path(root).resolve()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # Do not log checkpoint content or request data.

        def send_body(self, status, body, content_type):
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src http://127.0.0.1:* http://localhost:*; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
            self.end_headers()
            self.wfile.write(body)

        def local_origin(self, require_origin=False):
            actual_port = self.server.server_address[1]
            hosts = {f"127.0.0.1:{actual_port}", f"localhost:{actual_port}"}
            origin = self.headers.get("Origin")
            return (self.headers.get("Host", "") in hosts
                    and (origin in {f"http://{h}" for h in hosts}
                         or (origin is None and not require_origin)))

        def send_json(self, status, data):
            self.send_body(status, json.dumps(data).encode("utf-8"), "application/json")

        def send_events(self):
            feed = self.server.event_stream
            if feed.stop.is_set() or not feed.slots.acquire(blocking=False):
                self.send_json(503, {"error": "Live stream unavailable or connection limit reached"})
                return
            try:
                self.connection.settimeout(5)
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.end_headers()
                self.wfile.write(b"retry: 1000\n\n")
                self.wfile.flush()
                version, deadline = -1, time.monotonic() + 300
                while time.monotonic() < deadline:
                    current, frames, closed = feed.next(version)
                    if closed:
                        break
                    if current != version:
                        for kind, payload in frames.items():
                            self.wfile.write(b"event: " + kind.encode("ascii") + b"\ndata: " + payload + b"\n\n")
                        version = current
                    self.wfile.write(b"event: heartbeat\ndata: {}\n\n")
                    self.wfile.flush()
            except (OSError, TimeoutError):
                pass
            finally:
                feed.slots.release()

        def do_GET(self):
            if not self.local_origin():
                self.send_body(403, b"Local origin required", "text/plain")
                return
            path = urlsplit(self.path).path
            if path == "/api/events":
                self.send_events()
            elif path == "/api/runs":
                self.send_body(200, json.dumps(observed_runs(root)).encode("utf-8"), "application/json")
            elif path == "/api/live":
                self.send_json(200, live_queue.view() if live_queue else {"enabled": False, "allowEdits": False,
                               "workspace": "", "token": "", "warning": "Start the server with --enable-live to connect native Codex.", "jobs": []})
            elif path == "/api/sessions":
                if session_discovery is None:
                    self.send_json(503, {"error": "Local session discovery unavailable"})
                else:
                    self.send_json(200, session_discovery.view())
            elif re.fullmatch(r"/api/sessions/[a-f0-9]{32}/transcript", path):
                if session_discovery is None:
                    self.send_json(503, {"error": "Local session discovery unavailable"})
                    return
                if not live.secrets.compare_digest(self.headers.get("X-Agent-World-Token", "").encode(), session_discovery.token.encode()):
                    self.send_json(403, {"error": "Local session token required"})
                    return
                self.send_json(200, session_discovery.transcript(path.split('/')[3]))
            elif re.fullmatch(r"/api/live/missions/[a-f0-9]{32}/changes/[0-9]{1,2}", path):
                if live_queue is None:
                    self.send_json(503, {"error": "Native task reader unavailable"})
                    return
                if not live.secrets.compare_digest(self.headers.get("X-Agent-World-Token", "").encode(), live_queue.token.encode()):
                    self.send_json(403, {"error": "Local task session token required"})
                    return
                try:
                    self.send_json(200, live_queue.change_preview(path.split('/')[4], int(path.split('/')[6])))
                except live.LiveError as error:
                    self.send_json(error.status, {"error": str(error)})
            elif path in FILES:
                name, content_type = FILES[path]
                try:
                    body = (ASSETS / name).read_bytes()
                except OSError:
                    self.send_body(503, b"Interface unavailable", "text/plain")
                    return
                self.send_body(200, body, content_type)
            else:
                self.send_body(404, b"Not found", "text/plain")

        def do_POST(self):
            if not self.local_origin(require_origin=True):
                self.send_json(403, {"error": "Local origin required"})
                return
            path = urlsplit(self.path).path
            target = session_discovery if path == "/api/sessions/heartbeat" else live_queue
            if target is None:
                self.send_json(503, {"error": "Requested local integration is disabled"})
                return
            supplied = self.headers.get("X-Agent-World-Token", "")
            if not live.secrets.compare_digest(supplied.encode("utf-8"), target.token.encode("ascii")):
                self.send_json(403, {"error": "Refresh the page to reconnect this session"})
                return
            if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
                self.send_json(415, {"error": "JSON content type required"})
                return
            length = self.headers.get("Content-Length", "")
            if not re.fullmatch(r"[0-9]{1,5}", length) or not 0 < int(length) <= 12000 or self.headers.get("Transfer-Encoding"):
                self.send_json(413, {"error": "Bounded content length required"})
                return
            try:
                self.connection.settimeout(5)
                body = self.rfile.read(int(length))
                if len(body) != int(length):
                    raise ValueError()
                data = json.loads(body.decode("utf-8"))
                if path == "/api/sessions/heartbeat":
                    self.send_json(200, {"id": session_discovery.heartbeat(data)})
                    return
                elif path == "/api/live/missions":
                    job = live_queue.submit(data)
                elif re.fullmatch(r"/api/live/missions/[a-f0-9]{32}/cancel", path) and data == {}:
                    job = live_queue.cancel(path.split("/")[-2])
                else:
                    self.send_json(404, {"error": "Unknown mission operation"})
                    return
                self.send_json(200, {"id": job["id"], "status": job["status"]})
            except live.LiveError as error:
                self.send_json(error.status, {"error": str(error)})
            except (OSError, ValueError, RecursionError):
                self.send_json(400, {"error": "Invalid mission request"})

    class WorldServer(ThreadingHTTPServer):
        allow_reuse_address = False
        daemon_threads = True

        def server_close(self):
            if hasattr(self, "event_stream"):
                self.event_stream.close()
            super().server_close()

        def server_bind(self):
            if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
                self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            super().server_bind()

    server = WorldServer(("127.0.0.1", port), Handler)
    server.event_stream = stream.EventStream(session_discovery, live_queue)
    server.event_stream.start()
    return server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runs-root", type=Path, default=Path.home() / ".task-runs")
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--enable-live", action="store_true", help="Allow browser missions to use native Codex")
    parser.add_argument("--workspace", type=Path, default=ASSETS.parents[1])
    parser.add_argument("--allow-edits", action="store_true", help="Allow explicitly selected workspace-write missions")
    parser.add_argument("--data-dir", type=Path, help="Private local mission history directory")
    parser.add_argument("--codex-binary", type=Path, help="Installed native Codex executable")
    parser.add_argument("--task-timeout", type=int, default=1800, help="Seconds allowed per native run")
    parser.add_argument("--codex-sessions-root", type=Path, help="Alternate Codex sessions directory")
    parser.add_argument("--codex-home", type=Path, help="Alternate Codex profile directory containing local runtime databases")
    parser.add_argument("--claude-projects-root", type=Path, help="Alternate Claude projects directory")
    parser.add_argument("--provider-process", action="append", default=[], help="Additional Provider=executable-name signature")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("Port must be between 1 and 65535")
    if not 1 <= args.task_timeout <= 7200:
        parser.error("Task timeout must be between 1 and 7200 seconds")
    manager = None
    try:
        sessions = discovery.Discovery(args.codex_sessions_root, args.claude_projects_root, args.provider_process,
                                       codex_home=args.codex_home)
    except ValueError as error:
        parser.error(str(error))
    if args.enable_live:
        workspace = args.workspace.resolve(strict=True)
        digest = hashlib.sha256(str(workspace).encode()).hexdigest()[:16]
        data_dir = args.data_dir or Path.home() / ".agent-world" / digest
        resolved_data = data_dir.resolve()
        for forbidden in (workspace, args.runs_root.resolve()):
            if resolved_data == forbidden or forbidden in resolved_data.parents:
                parser.error("Live history must stay outside source and workflow evidence directories")
        if args.codex_binary and (not args.codex_binary.is_file() or args.codex_binary.suffix.lower() in (".cmd", ".bat")):
            parser.error("Codex binary must be a native executable, not a shell script")
        manager = live.LiveQueue(workspace, data_dir, args.allow_edits,
                                 [str(args.codex_binary.resolve())] if args.codex_binary else None,
                                 args.task_timeout)
    try:
        server = make_server(args.runs_root, args.port, manager, sessions)
    except OSError:
        if manager:
            manager.close()
        raise
    print(f"Agent World: http://127.0.0.1:{args.port}", flush=True)
    print("Native missions enabled." if manager else "Simulation + read-only checkpoints. Native missions disabled.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        if manager:
            manager.close()


if __name__ == "__main__":
    main()
