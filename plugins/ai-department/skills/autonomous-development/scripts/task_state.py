"""Small local checkpoint journal. State is evidence of timing, not proof of quality."""
import json
import os
from pathlib import Path
import tempfile
import time
from datetime import datetime, timezone
from contextlib import contextmanager


class StateError(ValueError):
    pass


def now():
    return datetime.now(timezone.utc).isoformat()


def elapsed(start, end):
    return max(0.0, (datetime.fromisoformat(end) - datetime.fromisoformat(start)).total_seconds())


@contextmanager
def locked(path, timeout=1.0):
    lock = Path(str(path) + ".lock")
    deadline = time.monotonic() + timeout
    while True:
        try:
            descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            break
        except FileExistsError:
            if time.monotonic() >= deadline:
                raise StateError("Checkpoint locked; stop all writers and use state recover-lock explicitly") from None
            time.sleep(0.05)
    try:
        with os.fdopen(descriptor, "w") as handle:
            handle.write(json.dumps({"pid": os.getpid(), "createdAt": now()}))
        yield
    finally:
        lock.unlink()


def write(path, state):
    descriptor, temporary = tempfile.mkstemp(prefix=path.name + ".", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(state, handle, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def validate(state):
    if not isinstance(state, dict) or state.get("version") != 1 or state.get("tier") not in ("small", "medium", "large"):
        raise StateError("Malformed checkpoint")
    if not isinstance(state.get("intervals"), list) or not isinstance(state.get("current"), dict):
        raise StateError("Malformed checkpoint intervals")
    if not all(isinstance(state.get(key), str) and state[key].strip() for key in ("task", "target", "tierReason", "nextAction")) or not all(type(state.get(key)) is int and state[key] >= 0 for key in ("fixRounds", "retries")):
        raise StateError("Malformed checkpoint fields")
    for interval in state["intervals"] + [state["current"]]:
        if not isinstance(interval, dict) or interval.get("kind") not in ("active", "wait") or not isinstance(interval.get("phase"), str) or not interval["phase"].strip():
            raise StateError("Malformed checkpoint interval")
        for key in ("startedAt", "endedAt"):
            if key == "endedAt" and key not in interval:
                continue
            try:
                parsed = datetime.fromisoformat(interval[key])
                if parsed.tzinfo is None:
                    raise ValueError()
            except (KeyError, TypeError, ValueError):
                raise StateError("Malformed checkpoint timestamp") from None


def report(state, timestamp=None):
    validate(state)
    timestamp = timestamp or now()
    totals = {"active": 0.0, "wait": 0.0}
    phases = {}
    for interval in state["intervals"] + [state["current"]]:
        seconds = elapsed(interval["startedAt"], interval.get("endedAt", timestamp))
        totals[interval["kind"]] += seconds
        phases[interval["phase"]] = phases.get(interval["phase"], 0.0) + seconds
    return {"tier": state["tier"], "tierReason": state["tierReason"], "seconds": totals,
            "phaseSeconds": phases, "fixRounds": state["fixRounds"], "retries": state["retries"],
            "nextAction": state["nextAction"], "asOf": timestamp}


def add_parser(commands):
    state = commands.add_parser("state")
    actions = state.add_subparsers(dest="state_action", required=True)
    for name in ("init", "transition", "report", "update", "retry", "recover-lock"):
        action = actions.add_parser(name)
        action.add_argument("--file", type=Path, required=True)
        if name == "init":
            action.add_argument("--task", required=True)
            action.add_argument("--tier", choices=("small", "medium", "large"), required=True)
            action.add_argument("--reason", required=True)
            action.add_argument("--target", required=True)
            action.add_argument("--acceptance", action="append", default=[])
        elif name == "transition":
            action.add_argument("--phase", required=True)
            action.add_argument("--kind", choices=("active", "wait"), required=True)
            action.add_argument("--reason", default="")
        elif name == "update":
            action.add_argument("--next-action", required=True)
            action.add_argument("--fix-round", action="store_true")
        elif name == "retry":
            action.add_argument("--reason", required=True)
        elif name == "recover-lock":
            action.add_argument("--confirm-no-writers", action="store_true", required=True)


def run(arguments):
    path = arguments.file.resolve()
    action = arguments.state_action
    if action == "recover-lock":
        if not arguments.confirm_no_writers:
            raise StateError("Explicit confirmation of stopped writers is required")
        Path(str(path) + ".lock").unlink()
        return {"status": "lock removed"}
    with locked(path):
        timestamp = now()
        if action == "init":
            if path.exists():
                raise StateError("Checkpoint already exists")
            if not all(value.strip() for value in (arguments.task, arguments.reason, arguments.target)):
                raise StateError("Task, tier reason and target are required")
            state = {"version": 1, "task": arguments.task, "tier": arguments.tier,
                     "tierReason": arguments.reason, "target": arguments.target,
                     "acceptance": arguments.acceptance, "createdAt": timestamp,
                     "fixRounds": 0, "retries": 0, "nextAction": "inspect",
                     "intervals": [], "current": {"phase": "inspect", "kind": "active", "startedAt": timestamp}}
        else:
            state = json.loads(path.read_text(encoding="utf-8"))
            validate(state)
            if action == "report":
                return report(state, timestamp)
            if action == "transition":
                if not arguments.phase.strip():
                    raise StateError("Phase is required")
                state["intervals"].append({**state["current"], "endedAt": timestamp})
                state["current"] = {"phase": arguments.phase, "kind": arguments.kind,
                                    "reason": arguments.reason, "startedAt": timestamp}
                state["nextAction"] = arguments.phase
            elif action == "update":
                if not arguments.next_action.strip():
                    raise StateError("Next action is required")
                state["nextAction"] = arguments.next_action
                state["fixRounds"] += int(arguments.fix_round)
            elif action == "retry":
                if not arguments.reason.strip():
                    raise StateError("Retry reason is required")
                state["retries"] += 1
                state["lastRetryReason"] = arguments.reason
        state["updatedAt"] = timestamp
        write(path, state)
        return {"status": "saved", "tier": state["tier"], "nextAction": state["nextAction"]}
