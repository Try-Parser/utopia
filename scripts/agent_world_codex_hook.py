"""Project Codex lifecycle hooks to Utopia Cyberworld's local metadata endpoint.

This command intentionally ignores prompt, tool input/output, and transcript fields.
It never changes a Codex tool decision and stays silent when the office is offline.
"""
import hashlib
import json
import re
import sys
from pathlib import Path
from urllib.request import Request, urlopen


EVENTS = {"SessionStart", "UserPromptSubmit", "PreToolUse", "SubagentStart", "SubagentStop", "Stop", "Interrupt", "SessionEnd"}
ROLES = {"planner", "designer", "builder", "reviewer", "qa", "security"}
TOOLS = {
    "Bash": ("builder", "command", "Running a command"),
    "exec_command": ("builder", "command", "Running a command"),
    "apply_patch": ("builder", "coding", "Editing code"),
    "update_plan": ("planner", "planning", "Updating the plan"),
}


def opaque(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:32]


def project_event(event):
    """Return allowlisted public metadata, or None for invalid/unsupported input."""
    if not isinstance(event, dict) or event.get("hook_event_name") not in EVENTS:
        return None
    session = event.get("session_id")
    if not isinstance(session, str) or not session or len(session) > 256:
        return None
    workspace = event.get("cwd", "")
    if not isinstance(workspace, str) or len(workspace) > 2048:
        return None
    kind = event["hook_event_name"]
    agent = event.get("agent_id") if kind in {"SubagentStart", "SubagentStop"} else None
    if agent is not None and (not isinstance(agent, str) or not agent or len(agent) > 256):
        return None
    identity = opaque(session + ":" + agent) if agent else (session if re.fullmatch(r"[A-Za-z0-9_-]{1,128}", session) else opaque(session))
    state = "idle" if kind == "SessionStart" else "waiting" if kind in {"Stop", "Interrupt"} else "ended" if kind in {"SessionEnd", "SubagentStop"} else "working"
    payload = {"provider": "Codex", "sessionId": identity, "state": state, "workspace": workspace, "pid": None}  # ai-department-allow: session-export (local metadata only)
    role = None
    action = None
    label = None
    if kind == "PreToolUse":
        tool = event.get("tool_name")
        if isinstance(tool, str):
            role, action, label = TOOLS.get(tool, (None, None, None))
    elif kind == "SubagentStart":
        agent_type = event.get("agent_type")
        if agent_type in ROLES:
            role = agent_type
            action = {"planner": "planning", "designer": "designing", "builder": "coding", "reviewer": "reviewing", "qa": "testing", "security": "auditing"}[role]
            label = "Subagent working"
    if role:
        turn = event.get("turn_id")
        payload.update({"role": role, "taskId": opaque(str(turn) if isinstance(turn, str) and turn else session),
                        "action": action, "taskLabel": label})
    return payload


def report(payload, port):
    if type(port) is not int or not 1 <= port <= 65535:
        return
    base = f"http://127.0.0.1:{port}"
    with urlopen(base + "/api/sessions", timeout=1) as response:
        token = json.load(response)["token"]
    request = Request(base + "/api/sessions/heartbeat", data=json.dumps(payload).encode("utf-8"),
                      headers={"Content-Type": "application/json", "Origin": base, "X-Agent-World-Token": token})
    with urlopen(request, timeout=1) as response:
        response.read(1024)


def main():
    try:
        raw = sys.stdin.buffer.read(262145)
        if len(raw) > 262144:
            return
        payload = project_event(json.loads(raw))
        if payload:
            config = json.loads(Path(__file__).with_suffix(".json").read_text(encoding="utf-8"))
            report(payload, config["port"])
    except (Exception, KeyboardInterrupt):
        # Observation must never interrupt the user's Codex work.
        pass


if __name__ == "__main__":
    main()
