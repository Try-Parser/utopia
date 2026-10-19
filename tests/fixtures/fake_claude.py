"""Offline Claude stream-json subprocess fixture. Never connects to a model."""
import json
from pathlib import Path
import subprocess
import sys
import time


def emit(data):
    print(json.dumps(data), flush=True)


prompt = sys.stdin.read()
required = {"--restricted", "-p", "--verbose", "--no-session-persistence"}
assert required.issubset(sys.argv)
assert sys.argv[sys.argv.index("--output-format") + 1] == "stream-json"
assert sys.argv[sys.argv.index("--permission-mode") + 1] == "dontAsk"
assert sys.argv[sys.argv.index("--disallowedTools") + 1] == "mcp__*"
tools = set(sys.argv[sys.argv.index("--tools") + 1].split(','))
assert tools == set(sys.argv[sys.argv.index("--allowedTools") + 1].split(','))
assert tools in ({"Read", "Glob", "Grep"}, {"Read", "Glob", "Grep", "Edit", "Write"})
assert not {"--dangerously-skip-permissions", "--continue", "--resume"}.intersection(sys.argv)
assert ("Access: workspace-write." in prompt) == ("Write" in tools)

emit({"type": "system", "subtype": "init", "session_id": "PRIVATE_SESSION", "cwd": "PRIVATE_PATH"})  # ai-department-allow: session-export (synthetic fixture)
if "Title: HANG" in prompt:
    time.sleep(60)
if "Title: DESCENDANT" in prompt:
    subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"])
    sys.exit(0)
if "Title: CLI_FAIL" in prompt or "Title: FAIL" in prompt:
    print("PRIVATE_LOGIN_OR_VERSION_ERROR", file=sys.stderr)
    sys.exit(2)
if "Title: NO_COMPLETE" in prompt:
    sys.exit(0)
if "Title: BIG_LINE" in prompt:
    print('x' * (1024 * 1024 + 10), flush=True)
    sys.exit(0)
emit({"type": "assistant", "message": {"content": [
    {"type": "thinking", "thinking": "PRIVATE_REASONING"},
    {"type": "tool_use", "id": "read-1", "name": "Read", "input": {"file_path": "PRIVATE_READ_PATH"}}
]}})
emit({"type": "user", "message": {"content": [
    {"type": "tool_result", "tool_use_id": "read-1", "content": "PRIVATE_TOOL_OUTPUT"}
]}})
if "Title: EDIT_CHECK" in prompt and "Write" in tools:
    emit({"type": "assistant", "message": {"content": [{"type": "tool_use", "id": "write-1", "name": "Write", "input": {
        "file_path": str(Path.cwd() / "fixture-output.txt"), "content": "PRIVATE_TOOL_INPUT"}}]}})
    (Path.cwd() / "fixture-output.txt").write_text("local Claude fixture edit", encoding="utf-8")
    emit({"type": "user", "message": {"content": [{"type": "tool_result", "tool_use_id": "write-1", "content": "PRIVATE_EDIT_OUTPUT"}]}})
emit({"type": "assistant", "message": {"content": [{"type": "text", "text": "Claude fixture response"}]}})
if "Title: BROWSER" in prompt:
    time.sleep(3)
if "Title: RESULT_ERROR" in prompt:
    emit({"type": "result", "subtype": "error_during_execution", "is_error": True,
          "errors": ["PRIVATE_ERROR"], "result": "PRIVATE_FAILURE"})
elif "Title: NONZERO_AFTER_RESULT" in prompt:
    emit({"type": "result", "subtype": "success", "is_error": False, "result": "Claude fixture final result <img src=x onerror=alert(1)>"})
    sys.exit(3)
else:
    emit({"type": "result", "subtype": "success", "is_error": False, "result": "Claude fixture final result <img src=x onerror=alert(1)>"})
