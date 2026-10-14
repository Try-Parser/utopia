"""Offline process fixture for native Codex JSONL. Never connects to a model."""
import json
from pathlib import Path
import sys
import subprocess
import time


def emit(data):
    print(json.dumps(data), flush=True)


prompt = sys.stdin.read()
emit({"type": "thread.started", "thread_id": "fixture-thread"})
emit({"type": "turn.started"})
emit({"type": "item.started", "item": {"type": "command_execution", "command": "PRIVATE_COMMAND", "status": "in_progress"}})
if "Title: HANG" in prompt:
    time.sleep(60)
if "Title: DESCENDANT" in prompt:
    subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
    sys.exit(0)
if "Title: FAIL" in prompt:
    emit({"type": "error", "message": "PRIVATE_ERROR"})
    sys.exit(1)
if "Title: NO_COMPLETE" in prompt:
    sys.exit(0)
if "Title: EDIT_CHECK" in prompt:
    access = sys.argv[sys.argv.index("--sandbox") + 1]
    workspace = Path(sys.argv[sys.argv.index("--cd") + 1])
    if access == "workspace-write":
        (workspace / "fixture-output.txt").write_text("local fixture edit")
        emit({"type": "item.completed", "item": {"type": "file_change", "changes": [{"path": "fixture-output.txt", "kind": "add"}]}})
if "Title: BROWSER_CHANGE" in prompt:
    access = sys.argv[sys.argv.index("--sandbox") + 1]
    workspace = Path(sys.argv[sys.argv.index("--cd") + 1])
    if access == "workspace-write":
        (workspace / "app.js").write_text("const title = '<img src=x onerror=alert(1)>';\n// Browser fixture code change\n")
        emit({"type": "item.completed", "item": {"type": "file_change", "changes": [{"path": "app.js", "kind": "add"}]}})
if "Title: BROWSER" in prompt:
    time.sleep(3)
emit({"type": "item.completed", "item": {"type": "command_execution", "exit_code": 0, "aggregated_output": "PRIVATE_TOOL_OUTPUT"}})
emit({"type": "item.completed", "item": {"type": "agent_message", "text": "Native fixture result <img src=x onerror=alert(1)>"}})
emit({"type": "turn.completed", "usage": {"input_tokens": 1, "output_tokens": 1}})
