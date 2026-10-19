"""Provider-aware local native task queue. No raw tool output or reasoning is stored."""
from copy import deepcopy
from datetime import datetime, timezone
import json
import difflib
import hashlib
import importlib.util
import os
from pathlib import Path
import re
import queue
import secrets
import shutil
import signal
import subprocess
import tempfile
import threading

_providers_spec = importlib.util.spec_from_file_location("_agent_world_providers", Path(__file__).with_name("agent_world_providers.py"))
providers = importlib.util.module_from_spec(_providers_spec)
_providers_spec.loader.exec_module(providers)


ROLES = {"planner": "frank", "designer": "frank-designer", "builder": "frank-coder",
         "reviewer": "frank-reviewer", "qa": "frank-qa", "security": "frank-security"}
TERMINAL = {"completed", "failed", "cancelled", "timed-out", "interrupted"}
MAX_LINE = 1024 * 1024
MAX_RESULT = 16000
MAX_EVENTS = 80
MAX_CHANGES = 20
MAX_PATCH = 24000


class LiveError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def now():
    return datetime.now(timezone.utc).isoformat()


def validate_request(data, allow_edits):
    fields = {"requestId", "title", "brief", "role", "access"}
    if not isinstance(data, dict) or set(data) not in (fields, fields | {"provider"}):
        raise LiveError("Invalid mission fields")
    if not isinstance(data["requestId"], str) or not re.fullmatch(r"[a-f0-9]{32}", data["requestId"]):
        raise LiveError("Invalid request ID")
    if (not isinstance(data["title"], str) or not data["title"].strip() or len(data["title"]) > 100
            or not isinstance(data["brief"], str) or len(data["brief"]) > 600
            or not isinstance(data["role"], str) or data["role"] not in ROLES
            or data["access"] not in ("read-only", "workspace-write")):
        raise LiveError("Invalid mission name, brief, role, or access")
    if data["access"] == "workspace-write" and (not allow_edits or data["role"] not in ("planner", "builder")):
        raise LiveError("Workspace edits are unavailable for this specialist", 403)
    if "provider" in data and (not isinstance(data["provider"], str) or not re.fullmatch(r"[a-z][a-z0-9-]{0,39}", data["provider"])):
        raise LiveError("Invalid mission provider")
    keys = ("requestId", "title", "brief", "role", "access") + (("provider",) if "provider" in data else ())
    return {key: data[key] for key in keys}


def atomic_write(path, value):
    descriptor, temporary = tempfile.mkstemp(prefix="history-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            json.dump(value, output, ensure_ascii=True)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class _WindowsTree:
    """Own descendants with a Windows job object, independent of leader lifetime."""
    def __init__(self, process):
        import ctypes
        from ctypes import wintypes

        class BasicLimits(ctypes.Structure):
            _fields_ = [("process_time", ctypes.c_longlong), ("job_time", ctypes.c_longlong),
                        ("flags", wintypes.DWORD), ("minimum", ctypes.c_size_t),
                        ("maximum", ctypes.c_size_t), ("active", wintypes.DWORD),
                        ("affinity", ctypes.c_size_t), ("priority", wintypes.DWORD),
                        ("scheduling", wintypes.DWORD)]

        class IoCounters(ctypes.Structure):
            _fields_ = [(name, ctypes.c_ulonglong) for name in
                        ("read_ops", "write_ops", "other_ops", "read_bytes", "write_bytes", "other_bytes")]

        class ExtendedLimits(ctypes.Structure):
            _fields_ = [("basic", BasicLimits), ("io", IoCounters),
                        ("process_memory", ctypes.c_size_t), ("job_memory", ctypes.c_size_t),
                        ("peak_process_memory", ctypes.c_size_t), ("peak_job_memory", ctypes.c_size_t)]

        self.kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        self.kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
        self.kernel.CreateJobObjectW.restype = wintypes.HANDLE
        self.kernel.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
        self.kernel.SetInformationJobObject.restype = wintypes.BOOL
        self.kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
        self.kernel.AssignProcessToJobObject.restype = wintypes.BOOL
        self.kernel.TerminateJobObject.argtypes = [wintypes.HANDLE, wintypes.UINT]
        self.kernel.TerminateJobObject.restype = wintypes.BOOL
        self.kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        self.kernel.CloseHandle.restype = wintypes.BOOL
        self.handle = self.kernel.CreateJobObjectW(None, None)
        if not self.handle:
            raise ctypes.WinError(ctypes.get_last_error())
        limits = ExtendedLimits()
        limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        try:
            if not self.kernel.SetInformationJobObject(self.handle, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
                raise ctypes.WinError(ctypes.get_last_error())
            if not self.kernel.AssignProcessToJobObject(self.handle, wintypes.HANDLE(int(process._handle))):
                raise ctypes.WinError(ctypes.get_last_error())
        except Exception:
            self.close()
            raise

    def terminate(self):
        if self.handle:
            self.kernel.TerminateJobObject(self.handle, 1)

    def close(self):
        if self.handle:
            self.kernel.CloseHandle(self.handle)
            self.handle = None


def kill_tree(process):
    try:
        if os.name == "nt":
            tree = getattr(process, "_world_tree", None)
            if tree is not None:
                tree.terminate()
                return
            if process.poll() is not None:
                return
            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           timeout=10, creationflags=subprocess.CREATE_NO_WINDOW)
        else:
            # Descendants can retain stdout after the original leader has exited.
            os.killpg(process.pid, signal.SIGKILL)
    except (OSError, subprocess.TimeoutExpired):
        if process.poll() is None:
            process.kill()


class LiveQueue:
    def __init__(self, workspace, data_dir, allow_edits=False, command=None, timeout=1800,
                 provider_commands=None, discover_providers=True):
        self.workspace = Path(workspace).resolve(strict=True)
        if not self.workspace.is_dir():
            raise ValueError("Workspace must be a directory")
        self.data_dir = Path(data_dir).absolute()
        if any(p.is_symlink() or (hasattr(p, "is_junction") and p.is_junction())
               for p in (self.data_dir, *self.data_dir.parents)):
            raise ValueError("Private data directory must not use symlinks")
        self.data_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        workspace_id = hashlib.sha256(str(self.workspace).encode()).hexdigest()[:16]
        self.history = self.data_dir / f"history-{workspace_id}.json"
        if self.history.is_symlink():
            raise ValueError("History symlink refused")
        if command is not None and provider_commands is not None:
            raise ValueError("Use command or provider_commands, not both")
        self.providers = providers.ProviderRegistry(
            {"codex": command} if command else provider_commands,
            discover=discover_providers if command is None else False)
        self.allow_edits = allow_edits
        self.timeout = timeout
        self.token = secrets.token_urlsafe(32)
        self.lock = threading.RLock()
        self.wake = threading.Event()
        self.closed = False
        self.jobs = []
        self.process = None
        self.active_id = None
        self.warning = ""
        self._load()
        self.worker = threading.Thread(target=self._work, daemon=True)
        self.worker.start()

    def _load(self):
        if not self.history.exists():
            return
        try:
            if self.history.stat().st_size > 24 * 1024 * 1024:
                raise ValueError()
            data = json.loads(self.history.read_text(encoding="utf-8"))
            if not isinstance(data, list) or len(data) > 100:
                raise ValueError()
            ids = set()
            for job in data:
                request = validate_request({**{key: job[key] for key in ("requestId", "title", "brief", "role", "access")},
                                            "provider": job.get("provider", "codex")}, True)
                if (job.get("id") != request["requestId"] or job["id"] in ids
                        or job.get("status") not in TERMINAL | {"queued", "starting", "running"}
                        or not isinstance(job.get("result"), str) or len(job["result"]) > MAX_RESULT
                        or not isinstance(job.get("events"), list) or len(job["events"]) > MAX_EVENTS
                        or not all(isinstance(job.get(k), str) and len(job[k]) <= 100 for k in ("createdAt", "updatedAt", "activity"))):
                    raise ValueError()
                ids.add(job["id"])
                for key in ("createdAt", "updatedAt"):
                    if datetime.fromisoformat(job[key]).tzinfo is None:
                        raise ValueError()
                clean = {**request, "providerLabel": providers.provider_label(request["provider"]),
                         "id": job["id"], "status": job["status"], "result": job["result"],
                         "createdAt": job["createdAt"], "updatedAt": job["updatedAt"], "activity": job["activity"], "events": [], "changes": [],
                         "action": job.get("action") if job.get("action") in ("command", "coding", "tool", "research", "planning", "coordination", "reporting") else None}
                for change in job.get("changes", [])[:MAX_CHANGES]:
                    if isinstance(change, dict) and change.get("kind") in ("add", "update", "delete"):
                        relative = self._change_path(change.get("path"))
                        if relative is not None:
                            clean["changes"].append({"path": relative, "kind": change["kind"]})
                for event in job["events"]:
                    if not isinstance(event, dict) or not all(isinstance(event.get(k), str) and len(event[k]) <= 100 for k in ("at", "text")):
                        raise ValueError()
                    if datetime.fromisoformat(event["at"]).tzinfo is None:
                        raise ValueError()
                    clean["events"].append({"at": event["at"], "text": event["text"]})
                if clean["status"] not in TERMINAL:
                    clean["status"] = "interrupted"
                    clean["activity"] = "Server restarted; prior process outcome unknown. No automatic retry."
                self.jobs.append(clean)
            self._save()
        except (OSError, ValueError, TypeError, KeyError, RecursionError):
            self.jobs = []
            self.warning = "Saved history is unreadable. Prior runs were not replayed."

    def _save(self):
        try:
            atomic_write(self.history, self.jobs)
        except OSError:
            self.warning = "History persistence unavailable. Current runs remain in memory only."

    def _event(self, job, text):
        job["updatedAt"] = now()
        job["activity"] = text[:100]
        job["events"].append({"at": job["updatedAt"], "text": text[:100]})
        job["events"] = job["events"][-MAX_EVENTS:]
        self._save()

    def view(self):
        with self.lock:
            detected = self.providers.view()
            return {"enabled": any(p["available"] for p in detected) and not self.closed,
                    "providers": detected, "allowEdits": self.allow_edits,
                    "workspace": self.workspace.name, "token": self.token, "warning": self.warning,
                    "jobs": deepcopy([{k: v for k, v in j.items() if k not in ("brief", "requestId")} for j in reversed(self.jobs)])}

    def _change_path(self, value):
        """Project a reported path; no arbitrary browsing or private dotfiles."""
        if not isinstance(value, str) or not value or len(value) > 500 or any(ord(c) < 32 for c in value):
            return None
        path = Path(value)
        if ".." in path.parts:
            return None
        candidate = path if path.is_absolute() else self.workspace / path
        try:
            relative = candidate.resolve().relative_to(self.workspace)
            if any(p.is_symlink() or (hasattr(p, "is_junction") and p.is_junction()) for p in (candidate, *candidate.parents)):
                return None
        except (OSError, ValueError):
            return None
        if not relative.parts or any(part.startswith('.') for part in relative.parts):
            return None
        if any(re.search(r"(?i)(secret|credential|password|token|auth\.json|\.pem$|\.key$)", part) for part in relative.parts):
            return None
        label = relative.as_posix()
        return label if len(label) <= 200 and ':' not in label and '\\' not in label else None

    def _git_output(self, args, limit):
        """Read bounded output from an owned, timed read-only Git process."""
        args = [args[0], "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", *args[1:]]
        options = {"cwd": self.workspace, "stdout": subprocess.PIPE, "stderr": subprocess.DEVNULL,
                   "env": {**os.environ, "GIT_NO_LAZY_FETCH": "1", "GIT_TERMINAL_PROMPT": "0", "GIT_PAGER": "cat"}}
        if os.name == "nt":
            options["creationflags"] = subprocess.CREATE_NO_WINDOW
        process = subprocess.Popen(args, **options)
        expired = threading.Event()
        def stop():
            expired.set()
            try:
                process.kill()
            except OSError:
                pass
        timer = threading.Timer(3, stop)
        timer.daemon = True
        timer.start()
        try:
            raw = process.stdout.read(limit + 1)
            if len(raw) > limit:
                stop()
            code = process.wait(timeout=2)
            if expired.is_set():
                raise ValueError("Git output unavailable or over limit")
            return raw, code
        finally:
            timer.cancel()
            if process.poll() is None:
                process.kill()
                process.wait(timeout=2)
            process.stdout.close()

    def change_preview(self, job_id, index):
        with self.lock:
            job = next((j for j in self.jobs if j["id"] == job_id), None)
            if job is None or type(index) is not int or not 0 <= index < len(job.get("changes", [])):
                raise LiveError("Reported change not found", 404)
            change = dict(job["changes"][index])
        relative = self._change_path(change["path"])
        if relative is None:
            raise LiveError("Change is not available for preview", 404)
        path = self.workspace / relative
        result = {**change, "patch": "", "truncated": False,
                  "note": "Current workspace diff for a reported file; may include changes made before this task."}
        git = shutil.which("git")
        if not git:
            result["note"] = "Git is unavailable. File change was reported, but its diff cannot be read."
            return result
        try:
            if path.exists() and (not path.is_file() or path.stat().st_size > 256000):
                raise ValueError()
            size, size_code = self._git_output([git, "cat-file", "-s", f"HEAD:{relative}"], 32)
            tracked = size_code == 0
            if tracked and (not size.strip().isdigit() or int(size) > 256000):
                raise ValueError()
            baseline = b""
            if tracked:
                baseline, code = self._git_output([git, "cat-file", "blob", f"HEAD:{relative}"], 256000)
                if code != 0:
                    raise ValueError()
            elif not path.is_file():
                result["note"] = "The reported file is no longer present and has no Git baseline."
                return result
            current = b""
            if path.exists():
                # Read bytes directly: Git working-tree diff can execute clean filters.
                if self._change_path(relative) is None or not path.is_file():
                    raise ValueError()
                with path.open("rb") as stream:
                    current = stream.read(256001)
            if len(current) > 256000:
                raise ValueError()
            if b'\x00' in baseline or b'\x00' in current:
                result["note"] = "A binary file changed. Text diff is unavailable."
                return result
            lines = difflib.unified_diff(baseline.decode("utf-8", errors="replace").splitlines(keepends=True),
                                        current.decode("utf-8", errors="replace").splitlines(keepends=True),
                                        fromfile=f"a/{relative}" if tracked else "/dev/null",
                                        tofile=f"b/{relative}" if path.exists() else "/dev/null")
            # Stop formatting after the UI limit; never persist patches in history.
            patch = bytearray()
            for line in lines:
                if not line.endswith('\n'):
                    line += '\n\\ No newline at end of file\n'
                patch.extend(line.encode('utf-8'))
                if len(patch) > MAX_PATCH:
                    result["truncated"] = True
                    break
            result["patch"] = patch[:MAX_PATCH].decode('utf-8', errors='ignore')
        except (OSError, ValueError, subprocess.TimeoutExpired):
            result["note"] = "The file is too large, changed during reading, or its diff is unavailable."
        return result

    def submit(self, data):
        request = validate_request(data, self.allow_edits)
        with self.lock:
            for job in self.jobs:
                if job["requestId"] == request["requestId"]:
                    if any(job[k] != request[k] for k in request):
                        raise LiveError("Request ID already used for a different mission", 409)
                    return deepcopy(job)
            if self.closed:
                raise LiveError("Native mission runner unavailable", 503)
            detected = self.providers.view()
            available = [p["id"] for p in detected if p["available"]]
            if "provider" not in request:
                if len(available) != 1:
                    raise LiveError("Choose an available mission provider" if available else "No native mission provider available", 400 if available else 503)
                request["provider"] = available[0]
            if request["provider"] not in available:
                raise LiveError("Selected mission provider is unavailable", 503)
            if sum(j["status"] not in TERMINAL for j in self.jobs) >= 10:
                raise LiveError("Live queue is full. Wait for a mission to finish.", 429)
            # Prune completed history only; all unfinished work stays retained.
            while len(self.jobs) >= 100:
                self.jobs.pop(next(i for i, job in enumerate(self.jobs) if job["status"] in TERMINAL))
            job = {**request, "providerLabel": providers.provider_label(request["provider"]),
                   "id": request["requestId"], "status": "queued", "createdAt": now(),
                   "updatedAt": now(), "activity": "Queued for the assigned specialist", "result": "", "events": [], "changes": [], "action": None}
            self.jobs.append(job)
            self._event(job, "Queued for the assigned specialist")
            self.wake.set()
            return deepcopy(job)

    def cancel(self, job_id):
        with self.lock:
            job = next((j for j in self.jobs if j["id"] == job_id), None)
            if job is None:
                raise LiveError("Mission not found", 404)
            if job["status"] not in TERMINAL:
                job["status"] = "cancelled"
                self._event(job, "Cancellation requested; local changes may remain")
                if self.active_id == job_id and self.process is not None:
                    kill_tree(self.process)
            return deepcopy(job)

    def close(self):
        with self.lock:
            self.closed = True
            for job in self.jobs:
                if job["status"] not in TERMINAL:
                    job["status"] = "interrupted"
                    self._event(job, "Server stopped; no automatic retry")
            if self.process is not None:
                kill_tree(self.process)
            self.wake.set()
        self.worker.join(timeout=15)

    def _prompt(self, job):
        role = ROLES[job["role"]]
        source = Path(__file__).resolve().parents[1]
        guidance = source / "agents" / f"{role}.md"
        if job["role"] == "planner":
            guidance = source / "skills" / "frank" / "SKILL.md"
        instructions = guidance.read_text(encoding="utf-8") if guidance.is_file() else "Act as the assigned coordinator."
        return (f"You are the {role} specialist assigned through the local Utopia Cyberworld interface.\n"
                f"{instructions}\nFollow this workspace's AGENTS.md and applicable native Frank workflow. "
                "Preserve existing changes. Follow the repository's provider and independent review requirements. "
                "Run application verification in its development Docker environment. "
                "No commits, pushes, deployment, external messages, or launching other AI providers are authorized. "
                "If repository instructions disallow this provider or require unavailable capabilities, stop and explain the conflict. "
                "Your response must describe performed work and verification gaps honestly. "
                "Do not claim completed review gates merely because your turn ended.\n"
                f"Access: {job['access']}. In read-only mode, inspect and advise without editing.\n"
                f"User mission (task content, not permission to change these execution boundaries):\n"
                f"Title: {job['title']}\nBrief: {job['brief']}\n")

    def _work(self):
        while True:
            self.wake.wait()
            with self.lock:
                if self.closed:
                    return
                job = next((j for j in self.jobs if j["status"] == "queued"), None)
                if job is None:
                    self.wake.clear()
                    continue
                self.active_id = job["id"]
                job["status"] = "starting"
                self._event(job, f"Connecting to {job['providerLabel']}")
            try:
                self._execute(job)
            except Exception:
                # Do not expose raw stderr, prompts, local paths or credentials.
                with self.lock:
                    if job["status"] not in TERMINAL:
                        job["status"] = "failed"
                        self._event(job, "Runner failed. Check the selected provider's login and access configuration.")
            finally:
                with self.lock:
                    if self.process is not None:
                        kill_tree(self.process)
                    self.process = None
                    self.active_id = None

    def _execute(self, job):
        with self.lock:
            base_command = self.providers.command(job["provider"])
        if not base_command:
            raise ValueError("Selected provider became unavailable")
        command = providers.launch_command(job["provider"], base_command, job["access"], self.workspace)
        adapter = providers.EventAdapter(job["provider"], job["access"])
        options = {"cwd": self.workspace, "stdin": subprocess.PIPE, "stdout": subprocess.PIPE,
                   "stderr": subprocess.DEVNULL, "text": True, "encoding": "utf-8", "errors": "replace"}
        if os.name == "nt":
            options["creationflags"] = subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            options["start_new_session"] = True
        with self.lock:
            if job["status"] in TERMINAL or self.closed:
                return
            process = subprocess.Popen(command, **options)
            self.process = process
            if os.name == "nt":
                # Attach before providing the prompt, so model work cannot launch
                # descendants before ownership has been established.
                process._world_tree = _WindowsTree(process)

        def expire():
            with self.lock:
                if job["status"] not in TERMINAL:
                    job["status"] = "timed-out"
                    self._event(job, "Time limit reached; local changes may remain")
                    kill_tree(process)

        timer = threading.Timer(self.timeout, expire)
        timer.daemon = True
        timer.start()
        completed = False
        failure = False
        lines = queue.Queue(maxsize=64)
        stop_reader = threading.Event()

        def read_stream():
            try:
                while not stop_reader.is_set():
                    line = process.stdout.readline(MAX_LINE + 1)
                    while not stop_reader.is_set():
                        try:
                            lines.put(line, timeout=.1)
                            break
                        except queue.Full:
                            continue
                    if not line or len(line) > MAX_LINE:
                        break
            finally:
                process.stdout.close()

        reader = threading.Thread(target=read_stream, daemon=True)
        reader.start()
        try:
            process.stdin.write(self._prompt(job))
            process.stdin.close()
            count = 0
            while True:
                with self.lock:
                    if job["status"] in TERMINAL:
                        break
                try:
                    line = lines.get(timeout=.1)
                except queue.Empty:
                    continue
                if not line:
                    break
                count += 1
                if len(line) > MAX_LINE or count > 20000:
                    raise ValueError("Protocol limit exceeded")
                try:
                    data = json.loads(line)
                except (ValueError, RecursionError):
                    continue
                if not isinstance(data, dict):
                    continue
                with self.lock:
                    if job["status"] in TERMINAL:
                        break
                    for event in adapter.events(data):
                        kind = event["kind"]
                        if kind == "started":
                            job["status"] = "running"
                            self._event(job, "Agent turn started")
                        elif kind == "completed":
                            completed = True
                        elif kind == "failed":
                            failure = True
                            self._event(job, "Provider reported a run error")
                        elif kind == "answer":
                            job["action"] = "reporting"
                            job["result"] = event["text"][:MAX_RESULT]
                            self._event(job, "Agent response received")
                        elif kind == "activity":
                            job["action"] = event["action"]
                            self._event(job, event["text"])
                        elif kind == "change" and event.get("changeKind") in ("add", "update", "delete"):
                            relative = self._change_path(event.get("path"))
                            if relative is not None:
                                old = next((c for c in job["changes"] if c["path"] == relative), None)
                                if old is not None:
                                    old["kind"] = event["changeKind"]
                                elif len(job["changes"]) < MAX_CHANGES:
                                    job["changes"].append({"path": relative, "kind": event["changeKind"]})
            with self.lock:
                if job["status"] in TERMINAL:
                    kill_tree(process)
            returncode = process.wait(timeout=10)
            with self.lock:
                if job["status"] not in TERMINAL:
                    job["status"] = "completed" if completed and not failure and returncode == 0 and job["result"] else "failed"
                    self._event(job, "Agent turn complete; review and verification not certified" if job["status"] == "completed"
                                else "Agent run failed. Check the selected provider login, version and access configuration.")
        finally:
            timer.cancel()
            stop_reader.set()
            kill_tree(process)
            reader.join(timeout=2)
            tree = getattr(process, "_world_tree", None)
            if tree is not None:
                tree.close()
                process._world_tree = None
            if not process.stdin.closed:
                process.stdin.close()
