"""Bounded shared server-sent snapshots; no provider execution or transcript persistence."""
import json
import threading
import time


class EventStream:
    MAX_CLIENTS = 8
    MAX_BYTES = 24 * 1024 * 1024
    INTERVAL = .25

    def __init__(self, discovery, native):
        self.discovery, self.native = discovery, native
        self.condition = threading.Condition()
        self.stop = threading.Event()
        self.slots = threading.BoundedSemaphore(self.MAX_CLIENTS)
        self.frames, self.version, self.worker = {}, 0, None

    def start(self):
        with self.condition:
            if self.worker is not None:
                return
            self.worker = threading.Thread(target=self._run, daemon=True, name="office-live-feed")
            self.worker.start()

    def _run(self):
        try:
            self._refresh()
        except Exception:
            pass  # Fail closed; never log a snapshot or private parser input.
        finally:
            self.stop.set()
            with self.condition:
                self.condition.notify_all()
            if self.discovery:
                self.discovery.disable_live()

    def _refresh(self):
        if self.discovery:
            self.discovery.view()
            if self.stop.is_set():
                return
            self.discovery.enable_live()
        while not self.stop.is_set():
            frames = {"sessions": b'{"error":"Local session discovery unavailable"}'}
            if self.discovery:
                frames["sessions"] = json.dumps(self.discovery.view(), separators=(",", ":")).encode("utf-8")
            frames["native"] = json.dumps(self.native.view() if self.native else {
                "enabled": False, "allowEdits": False, "workspace": "", "token": "",
                "warning": "Native task runner unavailable.", "providers": [], "jobs": []}, separators=(",", ":")).encode("utf-8")
            if any(len(payload) > self.MAX_BYTES for payload in frames.values()):
                self.stop.set()
                with self.condition:
                    self.condition.notify_all()
                break
            with self.condition:
                if frames != self.frames:
                    self.frames = frames
                    self.version += 1
                    self.condition.notify_all()
            self.stop.wait(self.INTERVAL)

    def next(self, version):
        with self.condition:
            if self.version == version and not self.stop.is_set():
                self.condition.wait(timeout=2)
            return self.version, dict(self.frames), self.stop.is_set()

    def close(self):
        self.stop.set()
        with self.condition:
            self.condition.notify_all()
        if self.worker:
            self.worker.join(timeout=1)
        if self.discovery:
            self.discovery.disable_live()
