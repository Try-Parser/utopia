"""Opt-in local Playwright MCP smoke; requires Node.js/npx and installed Chrome.

Downloads the pinned MCP package if absent. No model calls or account-profile use.
Serve only the bundled fixture on loopback and save private outputs externally.
"""
import argparse
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import queue
import re
import shutil
import subprocess
import sys
import threading

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = "@playwright/mcp@0.0.83"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    output = args.output_dir.resolve()
    if output.is_relative_to(ROOT):
        parser.error("Use an external output directory")
    if (output / "browser-results.json").exists():
        parser.error("Use a fresh output directory; preserve earlier observed results")
    output.mkdir(parents=True, exist_ok=True)
    npx = shutil.which("npx.cmd" if os.name == "nt" else "npx")
    if not npx:
        parser.error("Node.js/npx is required")
    if os.name == "nt":
        # Use node directly, without shell-built command strings.
        launcher = Path(npx).parent / "node_modules/npm/bin/npx-cli.js"
        if not launcher.is_file():
            parser.error("Cannot locate npm's npx launcher next to npx.cmd")
        command = [shutil.which("node"), str(launcher)]
    else:
        command = [npx]
    server = ThreadingHTTPServer(("127.0.0.1", 0),
        partial(QuietHandler, directory=str(ROOT / "examples/connections")))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    address = f"http://127.0.0.1:{server.server_port}/browser-fixture.html"
    messages = queue.Queue()
    process = None
    try:
        with (output / "browser-execution.log").open("w", encoding="utf-8") as errors:
            process = subprocess.Popen(command + ["--cache", str(output / "npm-cache"), "-y", PACKAGE,
                "--headless", "--isolated", "--browser", "chrome", "--output-dir", str(output)],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=errors, text=True,
                encoding="utf-8", cwd=output)
            def read_messages():
                for line in process.stdout:
                    try:
                        messages.put(json.loads(line))
                    except ValueError:
                        messages.put({"invalidProtocol": True})
            threading.Thread(target=read_messages, daemon=True).start()
            serial = 0
            transcript = []
            def request(method, params=None, notification=False):
                nonlocal serial
                serial += 1
                payload = {"jsonrpc": "2.0", "method": method, "params": params or {}}
                if not notification:
                    payload["id"] = serial
                process.stdin.write(json.dumps(payload) + "\n")
                process.stdin.flush()
                if notification:
                    return None
                while True:
                    message = messages.get(timeout=120)
                    if message.get("invalidProtocol"):
                        raise RuntimeError("Invalid MCP response")
                    if message.get("id") != serial:
                        continue
                    transcript.append({"method": method, "response": message})
                    (output / "browser-responses.json").write_text(json.dumps(transcript, indent=2) + "\n", encoding="utf-8")
                    if "error" in message or message.get("result", {}).get("isError"):
                        raise RuntimeError("MCP call failed; inspect private response artifacts")
                    return message["result"]
            initialized = request("initialize", {"protocolVersion": "2024-11-05", "capabilities": {},
                                  "clientInfo": {"name": "ai-department-smoke", "version": "1"}})
            request("notifications/initialized", notification=True)
            listing = request("tools/list")
            names = {tool["name"] for tool in listing["tools"]}
            required = {"browser_navigate", "browser_snapshot", "browser_click", "browser_close"}
            if not required.issubset(names):
                raise RuntimeError("Required browser tools unavailable")
            request("tools/call", {"name": "browser_navigate", "arguments": {"url": address}})
            snapshot = request("tools/call", {"name": "browser_snapshot", "arguments": {}})
            content = "\n".join(item.get("text", "") for item in snapshot.get("content", []))
            button = re.search(r'button "Verify connection" \[ref=([^\]]+)\]', content)
            if not button:
                raise RuntimeError("Accessible fixture button not found")
            request("tools/call", {"name": "browser_click", "arguments": {
                "element": "Verify connection", "target": button.group(1)}})
            snapshot = request("tools/call", {"name": "browser_snapshot", "arguments": {}})
            content = "\n".join(item.get("text", "") for item in snapshot.get("content", []))
            if "Connection verified" not in content:
                raise RuntimeError("Clicked fixture status was not observed")
            request("tools/call", {"name": "browser_close", "arguments": {}})
            (output / "browser-responses.json").write_text(json.dumps(transcript, indent=2) + "\n", encoding="utf-8")
            report = {"passed": True, "recordedAtUtc": datetime.now(timezone.utc).isoformat(),
                      "package": PACKAGE, "serverInfo": initialized.get("serverInfo"),
                      "checks": ["MCP initialization", "tool discovery", "loopback fixture navigation",
                                 "accessible button discovery", "actual click and observed status", "browser closed"],
                      "scope": "Local isolated Chrome MCP fixture; no live model or production application verification."}
            (output / "browser-results.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
            print(json.dumps(report, indent=2))
    finally:
        if process is not None:
            if process.stdin:
                process.stdin.close()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.terminate()
                process.wait(timeout=10)
        server.shutdown()
        server.server_close()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, RuntimeError, queue.Empty, KeyError, subprocess.TimeoutExpired) as error:
        print("Browser smoke failed (" + type(error).__name__ + "); inspect external logs and prerequisites.", file=sys.stderr)
        sys.exit(1)
