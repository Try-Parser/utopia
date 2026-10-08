"""Run deterministic checks only: no model calls, external writes or credentials."""
from pathlib import Path
import os
import subprocess
import sys
import time

root = Path(__file__).resolve().parents[1]
environment = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
commands = [
    [sys.executable, "scripts/validate.py"],
    [sys.executable, "scripts/package_plugin.py", "--check"],
    [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v"],
    [sys.executable, "-m", "unittest", "discover", "-s",
     "skills/autonomous-development/scripts", "-p", "test_*.py", "-v"],
]
started = time.monotonic()
for command in commands:
    result = subprocess.run(command, cwd=root, env=environment)
    if result.returncode:
        sys.exit(result.returncode)
print(f"Deterministic checks passed in {time.monotonic() - started:.2f}s; live AI quality not measured.")
