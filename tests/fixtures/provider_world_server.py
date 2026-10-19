"""Isolated, offline provider browser fixture. No installed CLI is invoked."""
from pathlib import Path
import json
import signal
import sys
import threading

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / "scripts"))
import agent_world

fixtures = Path(sys.argv[1])
workspace = fixtures / "workspace"
workspace.mkdir()
binary_dir = fixtures / "bin"
binary_dir.mkdir()


def install(provider):
    fixture = Path(__file__).with_name(f"fake_{provider}.py")
    binary = binary_dir / provider
    binary.write_text("#!/usr/bin/env python3\nimport runpy,sys\n"
                      f"sys.argv=[{str(fixture)!r},*sys.argv[1:]]\n"
                      f"runpy.run_path({str(fixture)!r},run_name='__main__')\n", encoding="utf-8")
    binary.chmod(0o700)


for provider in ("codex", "claude"):
    install(provider)
# This tool is discoverable but deliberately has no execution adapter.
(binary_dir / "gemini").write_text("#!/usr/bin/env python3\nraise RuntimeError('Must never execute unsupported provider')\n", encoding="utf-8")
(binary_dir / "gemini").chmod(0o700)
manager = agent_world.live.LiveQueue(workspace, fixtures / "private", allow_edits=True,
                                    provider_commands={name: [str(binary_dir / name)] for name in ("codex", "claude")},
                                    discover_providers=False)
# The real discovery code sees only fixture entrypoints, never the host PATH/home.
manager.providers.environ = {"PATH": str(binary_dir)}
manager.providers.home = fixtures / "empty-home"
manager.providers.discover = True
manager.providers.refresh(force=True)
sessions = agent_world.discovery.Discovery(fixtures / "no-codex-records", fixtures / "no-claude-records",
                                          collector=lambda: ([], False), interval=0,
                                          codex_home=fixtures / "no-codex-home")
server = agent_world.make_server(fixtures, 8799, manager, sessions)


def control():
    for line in sys.stdin:
        command = line.strip()
        if command.startswith("remove "):
            (binary_dir / command.split()[1]).unlink(missing_ok=True)
        elif command.startswith("install "):
            install(command.split()[1])
        else:
            raise ValueError("Unknown fixture command")
        with manager.lock:
            manager.providers.refresh(force=True)
        print(json.dumps({"control": command}), flush=True)


threading.Thread(target=control, daemon=True).start()


def stop(*_args):
    raise KeyboardInterrupt()


signal.signal(signal.SIGTERM, stop)
print("Offline two-provider fixture ready", flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
    manager.close()
