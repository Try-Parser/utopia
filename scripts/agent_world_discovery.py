"""Read-only local AI process/session discovery. Never invokes a provider runtime."""
from copy import deepcopy
from contextlib import ExitStack, closing
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import stat
import subprocess
import sys
import threading
import time

PROVIDERS = {
    "Codex": {"names": {"codex", "codex-cli"}, "packages": ("/@openai/codex/", "/openai.chatgpt-")},
    "Claude Code": {"names": {"claude"}, "packages": ("/@anthropic-ai/claude-code/", "/anthropic.claude-code-")},
    "Gemini CLI": {"names": {"gemini"}, "packages": ("/@google/gemini-cli/",)},
    "OpenCode": {"names": {"opencode"}, "packages": ("/opencode-ai/",)},
    "Aider": {"names": {"aider"}, "packages": ("/aider-chat/",)},
    "Ollama": {"names": {"ollama"}, "packages": ()},
    "LM Studio": {"names": {"lm studio", "lm-studio", "lmstudio", "lms"}, "packages": ()},
    "Cursor": {"names": {"cursor"}, "packages": ()},
    "Windsurf": {"names": {"windsurf"}, "packages": ()},
    "GitHub Copilot": {"names": {"copilot"}, "packages": ("/@github/copilot/",)},
    "Amazon Q": {"names": {"q", "q-chat"}, "packages": ("/@aws/amazon-q/",)},
    "Kiro": {"names": {"kiro", "kiro-cli"}, "packages": ()},
}
PROCESS_LIMIT = 3000
FILE_LIMIT = 2000
RECORD_LIMIT = 200
ROLES = ("planner", "designer", "builder", "reviewer", "qa", "security")
UUID = re.compile(r"[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}\Z")


def timestamp(value=None):
    return datetime.fromtimestamp(time.time() if value is None else value, timezone.utc).isoformat()


def basename(value):
    return value.replace("\\", "/").rstrip("/").rsplit("/", 1)[-1]


def workspace_label(value):
    if not isinstance(value, str) or len(value) > 2048 or not (value.startswith("/") or re.match(r"^[A-Za-z]:[\\/]", value)):
        return "Unknown"
    return basename(value)[:80] or "Unknown"


def opaque(provider, identity):
    return hashlib.sha256((provider + ":" + identity).encode()).hexdigest()[:32]


def provider_label(value):
    aliases = {"claude": "Claude Code", "gemini": "Gemini CLI", "copilot": "GitHub Copilot", "q": "Amazon Q"}
    known = {key.lower(): key for key in PROVIDERS}
    return aliases.get(value.lower(), known.get(value.lower(), value))


def process_rule(value):
    provider, separator, executable = value.partition("=")
    if (not separator or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}", provider)
            or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}", executable)):
        raise ValueError("Provider process rule must be Provider=executable-name")
    return provider_label(provider), executable.lower().removesuffix(".exe")


def argv_tokens(command):
    # Used only for entrypoint recognition and opaque resume IDs, never displayed.
    if isinstance(command, list):
        return [v[:2048] for v in command[:100] if isinstance(v, str)]
    if isinstance(command, str):
        return [a or b for a, b in re.findall(r'"([^"\r\n]*)"|([^\s"\r\n]+)', command[:4096])][:100]
    return []


def recognize(process, custom=()):
    name = basename(process.get("name", "")).lower().removesuffix(".exe")
    tokens = argv_tokens(process.get("args"))
    for provider, executable in custom:
        if name == executable:
            return provider, tokens
    for provider, definition in PROVIDERS.items():
        if name in definition["names"]:
            return provider, tokens
    if name not in ("node", "nodejs", "python", "python3", "pythonw", "bun", "deno") and not re.fullmatch(r"python3\.\d+", name):
        return None, []
    # A provider mentioned in a prompt or shell command is not a CLI entrypoint.
    index = 1
    while index < len(tokens) and tokens[index].startswith("-"):
        if tokens[index] in ("-e", "--eval", "-p", "--print", "-c"):
            return None, []
        if tokens[index] == "-m":
            return ("Aider", tokens) if index + 1 < len(tokens) and tokens[index + 1] in ("aider", "aider.main") else (None, [])
        index += 2 if tokens[index] in ("-r", "--require", "--import", "--loader") else 1
    entry = tokens[index].replace("\\", "/").lower() if index < len(tokens) else ""
    for provider, definition in PROVIDERS.items():
        if any(package in entry for package in definition["packages"]):
            return provider, tokens
    return None, []


def session_argument(tokens):
    for index, token in enumerate(tokens):
        candidate = None
        if token in ("--session-id", "--resume", "resume") and index + 1 < len(tokens):
            candidate = tokens[index + 1]
        elif token.startswith(("--session-id=", "--resume=")):
            candidate = token.split("=", 1)[1]
        if isinstance(candidate, str) and UUID.fullmatch(candidate):
            return candidate.lower()
    return None


def collect_processes():
    """OS-owned metadata only. Raw arguments never leave the collector pipeline."""
    if os.name == "nt":
        executable = Path(os.environ.get("SystemRoot", "C:/Windows")) / "System32/WindowsPowerShell/v1.0/powershell.exe"
        script = """[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new();
$all = @(Get-CimInstance Win32_Process -ErrorAction Stop);
$items = @($all | Select-Object -First 3000 | ForEach-Object {
  $cmd = [string]$_.CommandLine; $exe = [string]$_.Name;
  [pscustomobject]@{pid=[int]$_.ProcessId;parent=[int]$_.ParentProcessId;
    name=$exe.Substring(0,[Math]::Min(80,$exe.Length));
    args=$cmd.Substring(0,[Math]::Min(4096,$cmd.Length))}
});
@{items=$items;partial=($all.Count -gt 3000)} | ConvertTo-Json -Compress -Depth 4"""
        result = subprocess.run([str(executable), "-NoProfile", "-NonInteractive", "-Command", script],
                                capture_output=True, timeout=8, creationflags=subprocess.CREATE_NO_WINDOW)
        if result.returncode or len(result.stdout) > 32 * 1024 * 1024:
            raise OSError("Process collector unavailable")
        data = json.loads(result.stdout.decode("utf-8-sig"))
        return data["items"], data["partial"]
    if sys.platform.startswith("linux"):
        rows, partial = [], False
        pids = sorted((p for p in Path("/proc").iterdir() if p.name.isdigit()), key=lambda p: int(p.name))
        partial = len(pids) > PROCESS_LIMIT
        for path in pids[:PROCESS_LIMIT]:
            try:
                with (path / "cmdline").open("rb") as stream:
                    raw = stream.read(4097)
                tokens = raw[:4096].decode("utf-8", errors="replace").split("\0")
                if not tokens[0]:
                    continue
                status = (path / "status").read_text()
                parent = re.search(r"^PPid:\s*(\d+)", status, re.M)
                rows.append({"pid": int(path.name), "parent": int(parent[1]) if parent else 0,
                             "name": basename(tokens[0]), "args": tokens})
            except PermissionError:
                partial = True
            except (OSError, ValueError):
                continue  # A process may end during enumeration.
        return rows, partial
    if sys.platform == "darwin":
        result = subprocess.run(["/bin/ps", "-axo", "pid=,ppid=,comm="], capture_output=True, timeout=8)
        if result.returncode or len(result.stdout) > 2 * 1024 * 1024:
            raise OSError("Process collector unavailable")
        rows = []
        for line in result.stdout.decode("utf-8", errors="replace").splitlines()[:PROCESS_LIMIT]:
            parts = line.strip().split(None, 2)
            if len(parts) == 3 and parts[0].isdigit() and parts[1].isdigit():
                rows.append({"pid": int(parts[0]), "parent": int(parts[1]), "name": basename(parts[2]), "args": []})
        return rows, True  # Entry-point arguments aren't available in this lane.
    raise OSError("Process collector unsupported")


def safe_path(path, root):
    if any(p.is_symlink() or (hasattr(p, "is_junction") and p.is_junction()) for p in (path, *path.parents)):
        return False
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except (OSError, ValueError):
        return False


ACTIVITY_TTL = 300
ACTIVITY_FILES = 24
ACTIVITY_BYTES = 262144
TOOL_ACTIVITY = {
    "Edit": ("builder", "coding", "Editing files"), "Write": ("builder", "coding", "Editing files"),
    "MultiEdit": ("builder", "coding", "Editing files"), "NotebookEdit": ("builder", "coding", "Editing files"),
    "apply_patch": ("builder", "coding", "Editing files"),
    "Bash": ("builder", "command", "Using terminal"), "exec_command": ("builder", "command", "Using terminal"),
    "write_stdin": ("builder", "command", "Using terminal"),
    "Read": ("builder", "research", "Reading project files"), "Grep": ("builder", "research", "Reading project files"),
    "Glob": ("builder", "research", "Reading project files"),
    "TodoWrite": ("planner", "planning", "Planning work"), "update_plan": ("planner", "planning", "Planning work"),
    "EnterPlanMode": ("planner", "planning", "Planning work"), "ExitPlanMode": ("planner", "planning", "Planning work"),
    "Agent": ("planner", "coordination", "Coordinating agents"), "Task": ("planner", "coordination", "Coordinating agents"),
    "collaboration.wait_agent": ("planner", "coordination", "Waiting for agents"),
    "collaboration.send_message": ("planner", "coordination", "Coordinating agents"),
    "collaboration.followup_task": ("planner", "coordination", "Coordinating agents"),
    "collaboration.spawn_agent": ("planner", "coordination", "Coordinating agents"),
    "WebSearch": ("planner", "research", "Researching"), "WebFetch": ("planner", "research", "Researching"),
}


def tool_activity(record, root, now):
    """Project event types/names only. Never retain tool input/output or messages."""
    if record["provider"] not in ("Codex", "Claude Code"):
        return None
    path = record["path"]
    if not safe_path(path, root):
        return None
    # Root sessions and nested agents have different identities and file layouts.
    if record["provider"] == "Claude Code" and not record.get("child") and path.stem.lower() != record["key"]:
        return None
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NONBLOCK", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        with os.fdopen(os.open(path, flags), "rb") as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode) or not 0 <= now - info.st_mtime <= ACTIVITY_TTL:
                return None
            offset = max(0, info.st_size - ACTIVITY_BYTES)
            stream.seek(offset)
            raw = stream.read(ACTIVITY_BYTES)
        if offset:
            raw = raw.partition(b"\n")[2]
        if not raw.endswith(b"\n"):
            return None  # A partially written event cannot establish activity.
        lines = raw.splitlines()
        if len(lines) > 256 or any(len(line) > 65536 for line in lines):
            return None
        role = action = label = None
        busy, started, event_at = False, False, None
        recent_events = []
        def add_event(at, text):
            recent_events.append({"at": at.isoformat(), "label": text})
            del recent_events[:-8]
        for line in lines:
            row = json.loads(line)
            if not isinstance(row, dict):
                continue
            when = row.get("timestamp")
            if not isinstance(when, str) or len(when) > 40:
                continue
            at = datetime.fromisoformat(when.replace("Z", "+00:00"))
            if at.tzinfo is None or not 0 <= now - at.timestamp() <= ACTIVITY_TTL:
                continue
            if record["provider"] == "Claude Code":
                session_identity = row.get("sessionId")
                if not isinstance(session_identity, str) or not UUID.fullmatch(session_identity) or session_identity.lower() != record.get("session", record["key"]):
                    continue
                message = row.get("message")
                if not isinstance(message, dict):
                    continue
                content = message.get("content")
                if row.get("type") == "user":
                    tool_result = isinstance(content, list) and any(isinstance(c, dict) and c.get("type") == "tool_result" for c in content)
                    if not tool_result:
                        busy, started = False, True
                        role = action = label = None
                        add_event(at, "New turn")
                    continue
                if row.get("type") != "assistant":
                    continue
                if message.get("stop_reason") in ("end_turn", "max_tokens", "stop_sequence", "refusal"):
                    busy = False
                    event_at = at
                    add_event(at, "Turn finished")
                    continue
                names = [c.get("name") for c in content if isinstance(c, dict) and c.get("type") == "tool_use"] if isinstance(content, list) else []
                busy = True
                event_at = at
                if not names:
                    role = action = label = None
                    add_event(at, "Assistant responding")
            else:
                payload = row.get("payload")
                if not isinstance(payload, dict):
                    continue
                if row.get("type") == "event_msg" and payload.get("type") == "task_started":
                    started, busy = True, True
                    role = action = label = None
                    event_at = at
                    add_event(at, "Turn started")
                    continue
                if row.get("type") == "event_msg" and payload.get("type") in ("task_complete", "turn_aborted"):
                    busy, started = False, False
                    event_at = at
                    add_event(at, "Turn finished")
                    continue
                if row.get("type") != "response_item" or payload.get("type") not in ("function_call", "custom_tool_call") or not started:
                    continue
                namespace = payload.get("namespace")
                raw_name = payload.get("name")
                names = [namespace + "." + raw_name if isinstance(raw_name, str) and raw_name not in TOOL_ACTIVITY
                         and namespace in ("functions", "collaboration") else raw_name]
                busy = True
            for name in names:
                if not isinstance(name, str):
                    continue
                name = name.removeprefix("functions.")
                if name in TOOL_ACTIVITY:
                    role, action, label = TOOL_ACTIVITY[name]
                    event_at = at
                    add_event(at, label)
                else:
                    role = action = label = None  # Unknown current tools never reuse a coding claim.
                    event_at = at
                    add_event(at, "Using tool")
        if role and event_at:
            return {"status": "event-working" if busy else "event-waiting", "role": role,
                    "action": action if busy else None, "taskLabel": label,
                    "taskRef": opaque("activity", record["provider"] + ":" + record["key"]),
                    "updatedAt": event_at.isoformat(),
                    "recentEvents": recent_events,
                    "evidence": "Local tool events; department follows activity, not an assigned specialist role"}
        if busy and event_at and now - event_at.timestamp() <= 30:
            return {"status": "event-working", "role": None, "action": None,
                    "taskLabel": None, "taskRef": None, "updatedAt": event_at.isoformat(),
                    "recentEvents": recent_events,
                    "evidence": "Local assistant activity observed; task details unavailable"}
    except (OSError, ValueError, TypeError, RecursionError):
        return None
    return None


def session_records(provider, root):
    """Bounded metadata projection; no titles, messages, prompts or tool bodies."""
    root = Path(root).absolute()
    if not root.exists():
        return [], "not-found", False
    if not safe_path(root, root) or not root.is_dir():
        return [], "unavailable", True
    candidates, visited, partial = [], 0, False
    errors = []
    for directory, children, files in os.walk(root, followlinks=False, onerror=lambda _: errors.append(True)):
        visited += 1
        if visited > FILE_LIMIT:
            partial = True
            break
        allowed_children = [name for name in children if safe_path(Path(directory) / name, root)]
        partial = partial or len(allowed_children) != len(children)
        children[:] = allowed_children
        for name in files:
            visited += 1
            if visited > FILE_LIMIT:
                partial = True
                break
            if not name.endswith(".jsonl"):
                continue
            path = Path(directory) / name
            try:
                if safe_path(path, root):
                    info = path.stat()
                    if stat.S_ISREG(info.st_mode):
                        candidates.append((info.st_mtime, path))
                    else:
                        partial = True
                else:
                    partial = True
            except OSError:
                partial = True
        if visited > FILE_LIMIT:
            break
    if len(candidates) > RECORD_LIMIT:
        partial = True
    records = []
    for modified, path in sorted(candidates, key=lambda pair: pair[0], reverse=True)[:RECORD_LIMIT]:
        try:
            identity, cwd = None, "Unknown"
            flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NONBLOCK", 0) | getattr(os, "O_NOFOLLOW", 0)
            descriptor = os.open(path, flags)
            with os.fdopen(descriptor, "rb") as stream:
                if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                    raise ValueError("Session metadata must be a regular file")
                for _ in range(8):
                    raw = stream.readline(65537)
                    if not raw:
                        break
                    if len(raw) > 65536:
                        partial = True
                        break
                    row = json.loads(raw)
                    if not isinstance(row, dict):
                        continue
                    if provider == "Codex":
                        payload = row.get("payload")
                        if row.get("type") != "session_meta" or not isinstance(payload, dict):
                            continue
                        candidate = payload.get("id") or payload.get("session_id")
                        cwd = workspace_label(payload.get("cwd"))
                    elif provider == "Claude Code":
                        candidate = row.get("sessionId")
                        if cwd == "Unknown":
                            cwd = workspace_label(row.get("cwd"))
                    elif provider == "Gemini CLI":
                        if path.parent.name != "chats" or path.parent.parent.parent != root or not path.name.startswith("session-"):
                            break
                        candidate = row.get("sessionId")
                    else:
                        break
                    if isinstance(candidate, str) and UUID.fullmatch(candidate):
                        identity = candidate.lower()
                    if identity and (provider in ("Codex", "Gemini CLI") or cwd != "Unknown"):
                        break
            if identity:
                child = False
                if provider == "Claude Code" and path.parent.name == "subagents":
                    parent = path.parent.parent.name
                    if not UUID.fullmatch(parent) or parent.lower() != identity or not re.fullmatch(r"agent-[A-Za-z0-9_-]{1,64}", path.stem):
                        continue
                    child = True
                elif provider == "Claude Code" and "subagents" in path.parts:
                    continue
                records.append({"key": identity, "provider": provider, "workspace": cwd,
                                "modified": modified, "path": path,
                                "session": identity, "child": child})
                if child:
                    records[-1]["key"] = identity + ":" + path.stem.lower()
        except (OSError, ValueError, TypeError, RecursionError):
            partial = True
    return records, "unavailable" if errors and not candidates else "scanned", partial or bool(errors)


class Discovery:
    def __init__(self, codex_root=None, claude_root=None, custom=(), collector=collect_processes, interval=5, codex_home=None, gemini_root=None):
        if codex_home is not None:
            profile = Path(codex_home)
        elif codex_root is not None:
            profile = Path(codex_root).parent
        else:
            profile = Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex")))
        profile = profile.resolve()
        self.roots = {"Codex": Path(codex_root) if codex_root is not None else profile / "sessions",
                      "Claude Code": Path(claude_root) if claude_root is not None else Path(os.environ.get("CLAUDE_CONFIG_DIR", str(Path.home() / ".claude"))) / "projects",
                      "Gemini CLI": Path(gemini_root) if gemini_root is not None else Path(os.environ.get("GEMINI_CLI_HOME", str(Path.home()))) / ".gemini" / "tmp"}
        self.custom = tuple(process_rule(value) for value in custom)
        self.collector, self.interval = collector, interval
        self.token = secrets.token_urlsafe(32)
        self.lock = threading.RLock()
        self.cache = None
        self.scanned = 0.0
        self.heartbeats = {}
        self.handoffs = {}
        self._records, self._base_entries, self._activity_cache = [], {}, {}
        self._live_stop = None
        self._inventory_thread = None
        self.codex_home = profile
        self._codex_live_at, self._codex_live = 0.0, []

    def _codex_runtime(self, now):
        """Read only thread identity and timing from Codex's local runtime databases."""
        if time.monotonic() - self._codex_live_at < .5:
            return self._codex_live
        self._codex_live_at, self._codex_live = time.monotonic(), []
        home = self.codex_home
        def latest(kind):
            candidates = [path for path in home.glob(kind + "_*.sqlite")
                          if re.fullmatch(kind + r"_[0-9]+\.sqlite", path.name)
                          and safe_path(path, home) and path.is_file()]
            return max(candidates, key=lambda path: path.stat().st_mtime) if candidates else None
        try:
            logs_path = latest("logs")
        except OSError:
            return []
        if logs_path is None:
            return []
        try:
            state_path = latest("state")
        except OSError:
            state_path = None
        try:
            with ExitStack() as stack:
                logs = stack.enter_context(closing(sqlite3.connect(logs_path.as_uri() + "?mode=ro", uri=True, timeout=.1)))
                logs.execute("PRAGMA query_only=ON")
                state = None
                if state_path is not None:
                    try:
                        candidate = sqlite3.connect(state_path.as_uri() + "?mode=ro", uri=True, timeout=.1)
                        stack.callback(candidate.close)
                        candidate.execute("PRAGMA query_only=ON")
                        state = candidate
                    except sqlite3.Error:
                        pass  # Session identity still comes from the runtime log.
                rows = logs.execute("SELECT thread_id, ts FROM "
                                    "(SELECT id, thread_id, ts, target FROM logs ORDER BY id DESC LIMIT 4096) "
                                    "WHERE ts >= ? AND thread_id IS NOT NULL "
                                    "AND target IN ('codex_core::session::turn', 'codex_core::tools::parallel') "
                                    "ORDER BY id DESC LIMIT 256", (now - 120,)).fetchall()
                seen = set()
                for identity, at in rows:
                    if not isinstance(identity, str) or not UUID.fullmatch(identity) or identity in seen or not isinstance(at, (int, float)) or not 0 <= now - at <= 120:
                        continue
                    seen.add(identity)
                    if len(seen) > 32:
                        break
                    metadata = None
                    if state is not None:
                        try:
                            metadata = state.execute("SELECT cwd, agent_role FROM threads WHERE id=?", (identity,)).fetchone()
                        except sqlite3.Error:
                            state = None  # Older/newer state schemas may not expose thread metadata.
                    workspace = workspace_label(metadata[0]) if metadata else "Unknown"
                    role = metadata[1] if metadata and metadata[1] in ROLES else None
                    self._codex_live.append({"id": opaque("Codex", identity.lower()), "provider": "Codex",
                                             "label": "Codex session " + opaque("Codex", identity.lower())[:8],
                                             "kind": "session", "status": "event-waiting",
                                             "workspace": workspace, "pid": None, "parentPid": None,
                                             "role": role, "action": None,
                                             "updatedAt": timestamp(at),
                                             "evidence": "Codex local runtime activity observed; current task state unavailable"})
        except (OSError, sqlite3.Error, ValueError, TypeError):
            self._codex_live = []
        return self._codex_live

    def heartbeat(self, data):
        fields = {"provider", "sessionId", "state", "workspace", "pid"}
        optional = {"role", "taskId", "handoffTo", "eventId", "taskLabel", "action", "targetProvider", "targetSessionId", "targetJobId"}
        if not isinstance(data, dict) or not fields <= set(data) or set(data) - fields - optional:
            raise ValueError("Invalid heartbeat fields")
        if (not isinstance(data["provider"], str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}", data["provider"])
                or not isinstance(data["sessionId"], str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", data["sessionId"])
                or data["state"] not in ("working", "waiting", "idle", "ended")
                or not isinstance(data["workspace"], str) or len(data["workspace"]) > 2048
                or (data["pid"] is not None and (type(data["pid"]) is not int or not 0 < data["pid"] < 2**32))):
            raise ValueError("Invalid heartbeat metadata")
        if any(name in data and (not isinstance(data[name], str) or data[name] not in ROLES) for name in ("role", "handoffTo")):
            raise ValueError("Invalid department role")
        if any(name in data and (not isinstance(data[name], str) or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,80}", data[name])) for name in ("taskId", "eventId")):
            raise ValueError("Invalid workflow reference")
        if "handoffTo" in data and not {"role", "taskId", "eventId"} <= set(data):
            raise ValueError("Handoff requires role, taskId and eventId")
        if "eventId" in data and "handoffTo" not in data:
            raise ValueError("Event reference requires a handoff")
        if any(field in data for field in ("taskLabel", "action", "targetProvider", "targetSessionId", "targetJobId")) and not {"role", "taskId"} <= set(data):
            raise ValueError("Work details require role and taskId")
        if "taskLabel" in data and (not isinstance(data["taskLabel"], str) or not 1 <= len(data["taskLabel"]) <= 100 or not data["taskLabel"].strip() or any(ord(c) < 32 or ord(c) == 127 for c in data["taskLabel"])):
            raise ValueError("Invalid short task label")
        if "action" in data and data["action"] not in ("planning", "designing", "coding", "reviewing", "testing", "auditing", "helping", "command", "research", "tool", "coordination", "reporting"):
            raise ValueError("Invalid work action")
        target_fields = {"targetProvider", "targetSessionId"}
        if "targetJobId" in data:
            if (target_fields & set(data) or not isinstance(data["targetJobId"], str) or not re.fullmatch(r"[a-f0-9]{32}", data["targetJobId"])
                    or (data.get("action") != "helping" and "handoffTo" not in data)):
                raise ValueError("Invalid or ambiguous native colleague reference")
        elif target_fields & set(data):
            if not target_fields <= set(data) or (data.get("action") != "helping" and "handoffTo" not in data):
                raise ValueError("A colleague target requires both references and helping or handoff")
            if (not isinstance(data["targetProvider"], str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 ._-]{0,39}", data["targetProvider"])
                    or not isinstance(data["targetSessionId"], str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", data["targetSessionId"])):
                raise ValueError("Invalid colleague reference")
        elif data.get("action") == "helping":
            raise ValueError("Helping requires a specific colleague")
        provider = provider_label(data["provider"])
        identity = data["sessionId"].lower() if UUID.fullmatch(data["sessionId"]) else data["sessionId"]
        key = opaque(provider, identity)
        task_ref = opaque("task", data["taskId"]) if "taskId" in data else None
        target_identity = data.get("targetSessionId", "")
        if UUID.fullmatch(target_identity):
            target_identity = target_identity.lower()
        target_ref = data.get("targetJobId") or (opaque(provider_label(data["targetProvider"]), target_identity) if target_fields <= set(data) else None)
        target_kind = "job" if "targetJobId" in data else "session" if target_ref else None
        if target_kind == "session" and target_ref == key:
            raise ValueError("A session cannot target itself")
        with self.lock:
            now = time.monotonic()
            self.handoffs = {k: v for k, v in self.handoffs.items() if now - v["seen"] <= 300}
            event_key = opaque(key, data["eventId"]) if "handoffTo" in data else None
            event = {"id": event_key, "sourceId": key, "provider": provider, "fromRole": data.get("role"),
                     "toRole": data.get("handoffTo"), "taskRef": task_ref, "taskLabel": data.get("taskLabel"), "targetRef": target_ref, "targetKind": target_kind}
            if event_key in self.handoffs and self.handoffs[event_key]["event"] != event:
                raise ValueError("Handoff event reference conflicts with retained metadata")
            self.heartbeats = {k: v for k, v in self.heartbeats.items() if time.monotonic() - v["seen"] <= 300}
            if key not in self.heartbeats and len(self.heartbeats) >= RECORD_LIMIT:
                raise ValueError("Heartbeat registry is full")
            self.heartbeats[key] = {"provider": provider, "state": data["state"], "workspace": workspace_label(data["workspace"]),
                                    "pid": data["pid"], "seen": now, "updatedAt": timestamp(), "role": data.get("role"), "taskRef": task_ref,
                                    "taskLabel": data.get("taskLabel"), "action": data.get("action"), "targetRef": target_ref, "targetKind": target_kind}
            if event_key and event_key not in self.handoffs:
                self.handoffs[event_key] = {"event": event, "seen": now, "at": timestamp()}
                if len(self.handoffs) > 80:
                    del self.handoffs[next(iter(self.handoffs))]
        return key

    def _scan(self):
        rows, warnings, entries, coverage, partial = [], [], {}, [], False
        try:
            rows, partial = self.collector()
            if not isinstance(rows, list) or len(rows) > PROCESS_LIMIT:
                raise ValueError()
        except (OSError, ValueError, TypeError, KeyError, subprocess.TimeoutExpired):
            rows = []
            warnings.append("OS process scanning unavailable. Process activity cannot be verified.")
            partial = True
        now = time.time()
        records = []
        for provider, root in self.roots.items():
            try:
                found, status, limited = session_records(provider, root)
            except (OSError, ValueError, RecursionError):
                found, status, limited = [], "unavailable", True
            records.extend(found)
            coverage.append({"provider": provider, "records": status})
            partial = partial or limited
        for record in sorted(records, key=lambda record: record["modified"], reverse=True):
            key = opaque(record["provider"], record["key"])
            if key in entries:
                continue
            label = record["provider"] + (" agent " if record.get("child") else " session ") + key[:8]
            entries[key] = {"id": key, "provider": record["provider"], "label": label,
                            "kind": "session", "status": "recent" if 0 <= now - record["modified"] < 300 else "recorded",
                            "workspace": record["workspace"], "pid": None, "parentPid": None,
                            "updatedAt": timestamp(record["modified"]), "evidence": "Local session metadata; runtime activity unknown"}
            if record.get("child"):
                entries[key]["parentId"] = opaque(record["provider"], record["session"])
        for process in rows:
            if not isinstance(process, dict) or type(process.get("pid")) is not int or not 0 < process["pid"] < 2**32 or not isinstance(process.get("name"), str):
                continue
            provider, tokens = recognize(process, self.custom)
            if not provider:
                continue
            identity = session_argument(tokens)
            key = opaque(provider, identity) if identity else opaque(provider, "pid-" + str(process["pid"]))
            entry = entries.get(key, {})
            entries[key] = {"id": key, "provider": provider, "label": entry.get("label", provider + " process " + str(process["pid"])),
                            "kind": "session" if identity else "process", "status": "running", "workspace": entry.get("workspace", "Unknown"),
                            "pid": process["pid"], "parentPid": process.get("parent") if type(process.get("parent")) is int else None,
                            "updatedAt": timestamp(now), "evidence": "Session ID matched a live process" if identity else "OS process exists; its internal session count and task activity are unknown"}
        base = deepcopy(entries)
        partial = self._apply_activity(entries, records, now, warnings, cache=False) or partial
        return {"entries": list(entries.values()), "partial": partial, "warnings": warnings, "coverage": coverage,
                "scannedAt": timestamp(now), "_records": records, "_base_entries": base}

    def _apply_activity(self, entries, records, now, warnings, cache=True):
        fresh = []
        for record in records:
            if record["provider"] == "Claude Code" and not record.get("child") and record["path"].stem.lower() != record["key"]:
                continue
            try:
                info = record["path"].stat(follow_symlinks=False)
                if stat.S_ISREG(info.st_mode) and 0 <= now - info.st_mtime <= ACTIVITY_TTL:
                    fresh.append(({**record, "modified": info.st_mtime}, (info.st_mtime_ns, info.st_size, info.st_ino)))
            except OSError:
                continue
        fresh.sort(key=lambda pair: pair[0]["modified"], reverse=True)
        limited = len(fresh) > ACTIVITY_FILES
        warning = "Tool activity scan limited to the newest twenty-four session records."
        if limited and warning not in warnings:
            warnings.append(warning)
        examined, retained = set(), {}
        for record, fingerprint in fresh[:ACTIVITY_FILES]:
            key = opaque(record["provider"], record["key"])
            if key in examined or key not in entries:
                continue
            examined.add(key)
            entry = entries[key]
            matched = entry["status"] == "running" and entry["kind"] == "session"
            cache_key = (record["provider"], record["key"], str(record["path"]))
            cached = self._activity_cache.get(cache_key) if cache else None
            if cached and cached[0] == fingerprint:
                activity = cached[1]
                if activity and not 0 <= now - datetime.fromisoformat(activity["updatedAt"]).timestamp() <= (30 if activity["status"] == "event-working" and activity["role"] is None else ACTIVITY_TTL):
                    activity = None
                elif activity:
                    activity = {**activity, "recentEvents": [event for event in activity.get("recentEvents", [])
                                                         if 0 <= now - datetime.fromisoformat(event["at"]).timestamp() <= ACTIVITY_TTL]}
            else:
                activity = tool_activity(record, self.roots[record["provider"]], now)
            retained[cache_key] = (fingerprint, activity)
            if (activity and record["provider"] == "Claude Code" and not matched and activity["status"] == "event-working"
                    and now - datetime.fromisoformat(activity["updatedAt"]).timestamp() > 30):
                activity = None
            if activity and (matched or activity["status"] == "event-working"):
                entry.update(activity)
                if not matched:
                    entry["evidence"] += "; process linkage unknown"
        if cache:
            self._activity_cache = retained
        return limited

    def _install(self, snapshot):
        self._records = snapshot.pop("_records", [])
        self._base_entries = snapshot.pop("_base_entries", {})
        self.cache = snapshot
        self.scanned = time.monotonic()

    def enable_live(self):
        with self.lock:
            if self._live_stop is not None and not self._live_stop.is_set():
                return
            stop = threading.Event()
            self._live_stop = stop
        def inventory():
            while not stop.wait(max(5, self.interval)):
                # Expensive OS/history enumeration never blocks fast live activity reads.
                snapshot = self._scan()
                with self.lock:
                    if stop.is_set():
                        break
                    self._install(snapshot)
        self._inventory_thread = threading.Thread(target=inventory, daemon=True, name="office-inventory")
        self._inventory_thread.start()

    def disable_live(self):
        if self._live_stop is not None:
            self._live_stop.set()
        if self._inventory_thread is not None:
            self._inventory_thread.join(timeout=1)

    def view(self):
        with self.lock:
            streaming = self._live_stop is not None and not self._live_stop.is_set()
            if self.cache is None or not streaming and time.monotonic() - self.scanned >= self.interval:
                self._install(self._scan())
            result = deepcopy(self.cache)
            if streaming:
                result["entries"] = list(deepcopy(self._base_entries).values())
                live_entries = {e["id"]: e for e in result["entries"]}
                result["partial"] = self._apply_activity(live_entries, self._records, time.time(), result["warnings"]) or result["partial"]
            entries = {entry["id"]: entry for entry in result["entries"]}
            for runtime in self._codex_runtime(time.time()):
                previous = entries.get(runtime["id"], {})
                if previous.get("status") in ("event-working", "event-waiting"):
                    continue
                entries[runtime["id"]] = {**previous, **runtime,
                                          "pid": previous.get("pid"), "parentPid": previous.get("parentPid")}
            for key, beat in self.heartbeats.items():
                age = time.monotonic() - beat["seen"]
                if age > 300:
                    continue
                old = entries.get(key, {})
                if age > 30 and old.get("status", "").startswith("event-"):
                    continue
                state = "stale" if age > 30 else beat["state"]
                entries[key] = {"id": key, "provider": beat["provider"], "label": old.get("label", beat["provider"] + " session " + key[:8]),
                                "kind": "session", "status": "adapter-" + state, "workspace": beat["workspace"], "pid": beat["pid"],
                                "role": beat["role"] if age <= 30 else None, "taskRef": beat["taskRef"] if age <= 30 else None,
                                "taskLabel": beat.get("taskLabel") if age <= 30 else None, "action": beat.get("action") if age <= 30 else None,
                                "targetRef": beat.get("targetRef") if age <= 30 else None,
                                "targetKind": beat.get("targetKind") if age <= 30 else None,
                                "parentPid": old.get("parentPid"), "updatedAt": beat["updatedAt"], "evidence": "Adapter-reported state" if age <= 30 else "Heartbeat expired; current activity unknown"}
            working_children = {}
            for entry in entries.values():
                parent = entry.get("parentId")
                if parent and entry["status"] in ("event-working", "adapter-working"):
                    working_children[parent] = working_children.get(parent, 0) + 1
            for parent, count in working_children.items():
                if parent in entries:
                    entries[parent]["activeChildCount"] = count
            ordered = sorted(entries.values(), key=lambda e: e["updatedAt"], reverse=True)
            ordered.sort(key=lambda e: e["status"] in ("recorded", "recent", "adapter-stale", "adapter-ended"))
            result["partial"] = result["partial"] or len(ordered) > RECORD_LIMIT
            result["entries"] = ordered[:RECORD_LIMIT]
            result["handoffs"] = [{**v["event"], "at": v["at"]} for v in self.handoffs.values() if time.monotonic() - v["seen"] <= 300]
            result["token"] = self.token
            result["supported"] = list(PROVIDERS) + [provider for provider, _ in self.custom if provider not in PROVIDERS]
            result["limitations"] = "Codex, Claude Code and Gemini CLI local records appear automatically, including Claude subagents. Other hidden or cloud-only sessions need a provider activity source. Process existence alone cannot reveal task details."
            return result
