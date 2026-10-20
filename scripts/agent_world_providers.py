"""Read-only local CLI discovery and explicit, bounded mission adapters.

Discovery never executes a CLI, reads account settings, or treats a shell shim as
an executable. Commands remain private server-side argument arrays.
"""
import hashlib
import ntpath
import os
from pathlib import Path
import platform
import posixpath
import re
import time


def workspace_identity(value):
    """Project a bounded reported absolute path without accessing its filesystem."""
    unknown = {"workspace": "Unknown", "workspaceId": None}
    if (not isinstance(value, str) or not value or len(value) > 2048
            or any(ord(char) < 32 or ord(char) == 127 or 0xD800 <= ord(char) <= 0xDFFF for char in value)):
        return unknown
    windows = bool(re.match(r"^[A-Za-z]:[\\/]", value)) or value.startswith(("\\\\", "//"))
    if windows:
        path = value.replace("/", "\\")
        drive, tail = ntpath.splitdrive(path)
        if (not drive or not tail.startswith("\\") and not drive.startswith("\\\\")
                or any(char in '<>"|?*' for char in path) or ":" in path[len(drive):]):
            return unknown
        if drive.startswith("\\\\"):
            parts = drive[2:].split("\\")
            if len(parts) != 2 or any(part in ("", ".", "..") or ":" in part for part in parts):
                return unknown
        path = ntpath.normpath(path)
        label = ntpath.basename(path) or drive.rsplit("\\", 1)[-1]
        canonical = "windows:" + path.rstrip("\\").casefold()
    elif value.startswith("/"):
        path = posixpath.normpath(value)
        label = posixpath.basename(path) or "/"
        canonical = "posix:" + path
    else:
        return unknown
    return {"workspace": label[:80],
            "workspaceId": hashlib.sha256(("agent-world-workspace:" + canonical).encode("utf-8")).hexdigest()[:32]}


ACCESS_MODES = ("read-only", "workspace-write")
PROVIDERS = {
    "codex": ("Codex", ("codex",)),
    "claude": ("Claude Code", ("claude",)),
    "gemini": ("Gemini CLI", ("gemini",)),
    "opencode": ("OpenCode", ("opencode",)),
    "aider": ("Aider", ("aider",)),
    "amp": ("Amp", ("amp",)),
    "cursor": ("Cursor Agent", ("cursor-agent",)),
    "copilot": ("GitHub Copilot CLI", ("copilot",)),
    "goose": ("Goose", ("goose",)),
    "ollama": ("Ollama", ("ollama",)),
    "lmstudio": ("LM Studio", ("lms", "lm-studio", "lmstudio")),
    "windsurf": ("Windsurf", ("windsurf",)),
    "amazon-q": ("Amazon Q", ("q", "q-chat")),
    "kiro": ("Kiro", ("kiro-cli", "kiro")),
}
ADAPTERS = {"codex", "claude"}
SHIMS = {".cmd", ".bat", ".ps1"}
NPM_ENTRYPOINTS = {
    "codex": Path("node_modules/@openai/codex/bin/codex.js"),
    "claude": Path("node_modules/@anthropic-ai/claude-code/cli.js"),
}


def provider_label(provider):
    return PROVIDERS[provider][0] if provider in PROVIDERS else "Unknown provider"


def _file(path, windows):
    try:
        return path.is_file() and (windows or os.access(path, os.X_OK))
    except OSError:
        return False


def _local_path(value):
    # UNC, extended/device paths and their slash spellings are not local
    # automatic discovery locations. Do not stat a remote PATH share.
    return not str(value).replace('\\', '/').startswith('//')


def _directories(environ, home, windows):
    # Empty/relative PATH entries can implicitly select the workspace. Refuse
    # those; only known, bounded per-user installation directories are added.
    separator = ";" if windows else os.pathsep
    values = environ.get("PATH", "").split(separator)
    values += [str(home / ".local/bin"), str(home / ".npm-global/bin")]
    if windows:
        for key, suffixes in (("APPDATA", ("npm",)),
                              ("LOCALAPPDATA", ("Microsoft/WinGet/Links", "Programs/Claude"))):
            base = environ.get(key)
            if base:
                values += [str(Path(base) / suffix) for suffix in suffixes]
    result = []
    for value in values:
        value = value.strip().strip('"')
        path = Path(value)
        if value and _local_path(value) and path.is_absolute() and path not in result:
            result.append(path)
    return result[:256]


def _candidates(names, directories, windows):
    suffixes = (".exe", ".com", ".cmd", ".bat", ".ps1", "") if windows else ("",)
    for directory in directories:
        if not _local_path(directory):
            continue
        for name in names:
            for suffix in suffixes:
                candidate = directory / (name + suffix)
                if _file(candidate, windows):
                    yield candidate


def _candidate(names, directories, windows):
    return next(_candidates(names, directories, windows), None)


def _native_candidate(names, directories, windows):
    return next((candidate for candidate in _candidates(names, directories, windows)
                 if candidate.suffix.lower() not in SHIMS
                 and (not windows or candidate.suffix.lower() in (".exe", ".com"))), None)


def _safe_command(provider, candidate, directories, windows):
    if candidate is None:
        return []
    if candidate.suffix.lower() in SHIMS or (windows and not candidate.suffix):
        # npm's package layout is fixed. Do not parse/execute arbitrary shim
        # source or pass it to cmd/PowerShell. Only known JS entrypoints qualify.
        entry = NPM_ENTRYPOINTS.get(provider)
        if entry is None:
            return []
        entry = candidate.parent / entry
        node = _native_candidate(("node",), [candidate.parent, *directories], windows)
        if (entry.is_file() and node is not None
                and node.suffix.lower() not in SHIMS
                and (not windows or node.suffix.lower() in (".exe", ".com"))):
            return [str(node), str(entry)]
        return []
    return [str(candidate)]


def _extension_codex(home, windows):
    """Bounded known VS Code extension layouts; never recurse through home."""
    if not _local_path(home):
        return None
    architecture = platform.machine().lower()
    cpu = "arm64" if architecture in ("arm64", "aarch64") else "x64" if architecture in ("amd64", "x86_64") else None
    if cpu is None:
        return None
    system = "windows" if windows else "darwin" if platform.system() == "Darwin" else "linux"
    architecture_label = "aarch64" if cpu == "arm64" else "x86_64"
    targets = (f"{system}-{architecture_label}", f"{'win32' if windows else system}-{cpu}")
    for folder in (".vscode/extensions", ".vscode-insiders/extensions", ".vscode-server/extensions"):
        try:
            with os.scandir(home / folder) as entries:
                matches = []
                for index, entry in enumerate(entries):
                    if index >= 2048:
                        break
                    if re.fullmatch(r"openai\.chatgpt-[0-9][a-zA-Z0-9.+_-]{0,100}", entry.name):
                        matches.append(Path(entry.path))
            matches.sort(key=lambda path: tuple(int(n) for n in re.findall(r"\d+", path.name)), reverse=True)
            for extension in matches[:32]:
                for target in targets:
                    candidate = extension / "bin" / target / ("codex.exe" if windows else "codex")
                    if _file(candidate, windows):
                        return candidate
        except OSError:
            continue
    return None


def _detect(provider, names, directories, home, windows):
    installed = None
    for candidate in _candidates(names, directories, windows):
        installed = installed or candidate
        if provider in ADAPTERS:
            command = _safe_command(provider, candidate, directories, windows)
            if command:
                return installed, command
        else:
            return installed, []
    if provider == "codex":
        native = _extension_codex(home, windows)
        if native is not None:
            return installed or native, [str(native)]
    elif provider == "cursor" and _local_path(home):
        native = _candidate(("agent",), [home / ".cursor/bin"], windows)
        installed = installed or native
    return installed, []


class ProviderRegistry:
    """Refresh installed tools without executing version/authentication probes."""
    def __init__(self, commands=None, discover=True, environ=None, home=None,
                 windows=None, refresh_seconds=2, clock=None):
        self.environ = os.environ if environ is None else environ
        self.home = Path.home() if home is None else Path(home)
        self.windows = os.name == "nt" if windows is None else windows
        self.discover = discover
        self.clock = time.monotonic if clock is None else clock
        self.refresh_seconds = refresh_seconds
        self.checked = float("-inf")
        self.overrides = {}
        for provider, command in (commands or {}).items():
            if provider not in ADAPTERS:
                raise ValueError("No native mission adapter for configured provider")
            if (not isinstance(command, (list, tuple)) or not command
                    or any(not isinstance(arg, str) or not arg or '\x00' in arg for arg in command)):
                raise ValueError("Provider command must be a nonempty argument array")
            if Path(command[0]).suffix.lower() in SHIMS:
                raise ValueError("Shell command shims cannot be executed directly")
            self.overrides[provider] = tuple(command)
        self.commands = {}
        self.states = []

    def refresh(self, force=False):
        timestamp = self.clock()
        if not force and timestamp - self.checked < self.refresh_seconds:
            return
        directories = _directories(self.environ, self.home, self.windows)
        commands, states = {}, []
        for provider, (label, names) in PROVIDERS.items():
            candidate = None
            command = []
            if provider in self.overrides:
                override = self.overrides[provider]
                executable = Path(override[0])
                if not executable.is_absolute():
                    executable = _native_candidate((override[0],), directories, self.windows)
                candidate = executable
                if (executable is not None and _file(executable, self.windows)
                        and executable.suffix.lower() not in SHIMS
                        and (not self.windows or executable.suffix.lower() in (".exe", ".com"))):
                    command = [str(executable), *override[1:]]
            elif self.discover:
                candidate, command = _detect(provider, names, directories, self.home, self.windows)
            installed = candidate is not None and _file(candidate, self.windows)
            available = bool(command) and provider in ADAPTERS
            if available:
                commands[provider] = tuple(command)
            reason = ("Installed; authentication is checked only when a mission starts."
                      if available else "Not installed in the searched locations.")
            if installed and provider not in ADAPTERS:
                reason = "Detected; a native mission adapter is needed."
            elif installed and not available:
                reason = "Detected; no safe executable entrypoint is available."
            if available and provider == "claude":
                reason = ("Installed; restricted file tools only, without shell or delegation. "
                          "Requires Claude Code 2.1.248 or newer; login is checked at launch.")
            states.append({"id": provider, "label": label, "installed": installed,
                           "available": available, "accessModes": list(ACCESS_MODES) if available else [],
                           "reason": reason})
        self.commands, self.states, self.checked = commands, states, timestamp

    def view(self):
        self.refresh()
        return [{**state, "accessModes": list(state["accessModes"])} for state in self.states]

    def command(self, provider):
        self.refresh()
        return list(self.commands.get(provider, ()))


def launch_command(provider, command, access, workspace):
    if access not in ACCESS_MODES:
        raise ValueError("Unsupported provider access mode")
    if provider == "codex":
        return [*command, "-c", 'approval_policy="never"', "exec", "--json", "--ephemeral",
                "--sandbox", access, "--cd", str(workspace), "-"]
    if provider == "claude":
        tools = ["Read", "Glob", "Grep"]
        if access == "workspace-write":
            tools += ["Edit", "Write"]
        return [*command, "--restricted", "-p", "--output-format", "stream-json", "--verbose",
                "--no-session-persistence", "--permission-mode", "dontAsk",
                "--tools", ",".join(tools), "--allowedTools", ",".join(tools),
                "--disallowedTools", "mcp__*"]
    raise ValueError("Provider has no mission adapter")


class EventAdapter:
    """Project only safe event labels, final text and reported file paths."""
    def __init__(self, provider, access):
        self.provider = provider
        self.access = access
        self.pending_tools = {}

    def events(self, data):
        if self.provider == "codex":
            return self._codex(data)
        return self._claude(data) if self.provider == "claude" else []

    def _codex(self, data):
        kind = data.get("type")
        if kind == "turn.started":
            return [{"kind": "started"}]
        if kind == "turn.completed":
            return [{"kind": "completed"}]
        if kind in ("turn.failed", "error"):
            return [{"kind": "failed"}]
        item = data.get("item")
        if kind not in ("item.started", "item.updated", "item.completed") or not isinstance(item, dict):
            return []
        item_type = item.get("type")
        if item_type == "agent_message" and kind == "item.completed" and isinstance(item.get("text"), str):
            return [{"kind": "answer", "text": item["text"]}]
        labels = {"command_execution": ("Running a command", "command"),
                  "file_change": ("Editing workspace files", "coding"),
                  "mcp_tool_call": ("Calling a connected tool", "tool"),
                  "web_search": ("Searching the web", "research"),
                  "plan_update": ("Updating the plan", "planning"),
                  "collab_tool_call": ("Coordinating native agents", "coordination")}
        if not isinstance(item_type, str) or item_type not in labels:
            return []
        text, action = labels[item_type]
        events = []
        if kind == "item.completed":
            if item_type == "file_change" and isinstance(item.get("changes"), list):
                events += [{"kind": "change", "path": change.get("path"), "changeKind": change.get("kind")}
                           for change in item["changes"][:20] if isinstance(change, dict)]
            text = ("Command failed" if item_type == "command_execution" and item.get("exit_code") not in (None, 0)
                    else text.replace("Running", "Finished").replace("Editing", "Updated")
                    .replace("Calling", "Finished").replace("Searching", "Searched")
                    .replace("Updating", "Updated").replace("Coordinating", "Coordinated"))
        return [*events, {"kind": "activity", "text": text, "action": action}]

    def _claude(self, data):
        kind = data.get("type")
        if kind == "system" and data.get("subtype") == "init":
            return [{"kind": "started"}]
        if kind == "result":
            if (data.get("subtype") != "success" or data.get("is_error") is True
                    or data.get("permission_denials")
                    or not isinstance(data.get("result"), str) or not data["result"].strip()):
                return [{"kind": "failed"}]
            text = data.get("result")
            return ([{"kind": "answer", "text": text}] if isinstance(text, str) else []) + [{"kind": "completed"}]
        if kind == "error":
            return [{"kind": "failed"}]
        message = data.get("message")
        if kind not in ("assistant", "user") or not isinstance(message, dict):
            return []
        content = message.get("content")
        if not isinstance(content, list):
            return []
        events, texts = [], []
        for block in content[:100]:
            if not isinstance(block, dict):
                continue
            if kind == "assistant" and block.get("type") == "text" and isinstance(block.get("text"), str):
                texts.append(block["text"][:16000])
            elif kind == "assistant" and block.get("type") == "tool_use":
                name, tool_id = block.get("name"), block.get("id")
                allowed = {"Read", "Glob", "Grep"} | ({"Edit", "Write"} if self.access == "workspace-write" else set())
                if not isinstance(name, str) or name not in allowed:
                    events.append({"kind": "failed"})
                    continue
                writing = name in {"Edit", "Write"}
                events.append({"kind": "activity", "text": "Editing workspace files" if writing else "Inspecting workspace files",
                               "action": "coding" if writing else "research"})
                inputs = block.get("input")
                path = inputs.get("file_path") if isinstance(inputs, dict) and writing else None
                if isinstance(tool_id, str) and len(tool_id) <= 200 and len(self.pending_tools) < 20:
                    self.pending_tools[tool_id] = path if isinstance(path, str) and len(path) <= 500 else None
            elif kind == "user" and block.get("type") == "tool_result":
                tool_id = block.get("tool_use_id")
                path = self.pending_tools.pop(tool_id, None) if isinstance(tool_id, str) else None
                if block.get("is_error") is True:
                    events.append({"kind": "activity", "text": "Tool failed", "action": "tool"})
                elif path is not None:
                    events.append({"kind": "change", "changeKind": "update", "path": path})
        if texts:
            events.append({"kind": "answer", "text": "\n".join(texts)[:16000]})
        return events
