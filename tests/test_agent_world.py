"""Observable local checkpoint and HTTP boundary regressions."""
import importlib.util
import json
import hashlib
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

spec = importlib.util.spec_from_file_location("agent_world", Path(__file__).resolve().parents[1] / "scripts" / "agent_world.py")
world = importlib.util.module_from_spec(spec)
spec.loader.exec_module(world)


class AgentWorldTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def checkpoint(self, run="run", **fields):
        path = self.root / "task" / run / "state.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"tier": "medium", "phase": "building", **fields}), encoding="utf-8-sig")
        return path

    def test_only_metadata_is_exposed_and_stale_is_explicit(self):
        path = self.checkpoint(secret="private data", nextAction="sensitive task", acceptance=["private requirements"])
        result = world.observed_runs(self.root, timestamp=path.stat().st_mtime + 901)
        self.assertEqual(result["unreadable"], 0)
        self.assertEqual(result["runs"][0]["phase"], "building")
        self.assertTrue(result["runs"][0]["stale"])
        self.assertNotIn("private", json.dumps(result))
        self.assertNotIn("sensitive", json.dumps(result))

    def test_journal_format_and_completed_checkpoint(self):
        self.checkpoint(phase=None, current={"phase": "complete"})
        run = world.observed_runs(self.root)["runs"][0]
        self.assertEqual(run["status"], "Recorded complete")
        self.assertFalse(run["stale"])

    def test_malformed_oversized_and_outside_symlinks_are_not_read(self):
        path = self.checkpoint()
        path.write_text("not json")
        oversized = self.checkpoint("oversized")
        oversized.write_bytes(b"x" * (world.MAX_STATE_BYTES + 1))
        outside = self.root / "outside.json"
        outside.write_text('{"tier":"small","phase":"complete"}')
        link = self.root / "task" / "linked" / "state.json"
        link.parent.mkdir()
        try:
            link.symlink_to(outside)
        except OSError:
            pass
        result = world.observed_runs(self.root)
        self.assertEqual(result["runs"], [])
        self.assertGreaterEqual(result["unreadable"], 2)

    def test_non_string_phase_and_invalid_tier_are_handled(self):
        self.checkpoint(phase=7)
        self.checkpoint("invalid", tier=[])
        result = world.observed_runs(self.root)
        self.assertEqual(result["runs"][0]["phase"], "Unknown")
        self.assertEqual(result["unreadable"], 1)

    def test_malformed_nested_phases_do_not_hide_valid_runs(self):
        self.checkpoint("valid", phase="building")
        for index, value in enumerate((None, 7, [], {})):
            self.checkpoint(f"malformed-{index}", phase=None, current={"phase": value})
        result = world.observed_runs(self.root)
        self.assertEqual(len(result["runs"]), 5)
        self.assertEqual(sum(run["phase"] == "Unknown" for run in result["runs"]), 4)
        self.assertEqual(sum(run["phase"] == "building" for run in result["runs"]), 1)

    def test_http_assets_api_host_origin_and_traversal(self):
        self.checkpoint()
        server = world.make_server(self.root, port=0)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_address[1]}"
        try:
            with urlopen(base + "/") as response:
                self.assertEqual(response.status, 200)
                self.assertIn(b"Agent World", response.read())
                self.assertIn("frame-ancestors 'none'", response.headers["Content-Security-Policy"])
            with urlopen(base + "/api/runs") as response:
                self.assertEqual(len(json.load(response)["runs"]), 1)
            for asset in ("/office-3d.js", "/office-art.js", "/office-reference-interior.js", "/office-reference-cast.js", "/vendor/three.min.js"):
                with urlopen(base + asset) as response:
                    self.assertEqual(response.status, 200)
                    self.assertIn("text/javascript", response.headers["Content-Type"])
                    self.assertGreater(len(response.read()), 0)
            for surface in ("/assets/office-surfaces-v1.png", "/assets/office-surfaces-v2.png", "/assets/reference-resources-v1/materials.png", "/assets/reference-resources-v1/characters.png", "/assets/reference-resources-v1/furniture.png"):
                with urlopen(base + surface) as response:
                    self.assertEqual(response.status, 200)
                    self.assertEqual(response.headers["Content-Type"], "image/png")
                    self.assertTrue(response.read().startswith(b"\x89PNG\r\n\x1a\n"))
            with urlopen(base + "/assets/employee-cast-v1.json") as response:
                self.assertEqual(response.status, 200)
                self.assertIn("application/json", response.headers["Content-Type"])
                cast = json.load(response)
            self.assertEqual({p["id"] for p in cast["profiles"]}, {"mica", "lilt", "brim", "quill", "tavi", "sable"})
            for profile in cast["profiles"]:
                with urlopen(base + "/" + profile["image"]) as response:
                    self.assertEqual(response.headers["Content-Type"], "image/png")
                    data = response.read()
                    self.assertEqual(hashlib.sha256(data).hexdigest(), profile["sha256"])
                    self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n")
                    self.assertEqual(int.from_bytes(data[16:20], "big"), profile["width"])
                    self.assertEqual(int.from_bytes(data[20:24], "big"), profile["height"])
                    self.assertEqual(data[25], 6, "character PNG preserves RGBA transparency")
                expected = {(pose, direction) for pose in ("idle", "blink", "walk-a", "walk-b", "type-a", "type-b")
                            for direction in ("front-right", "front-left", "back-left", "back-right")}
                self.assertEqual(len(profile["frames"]), 24)
                self.assertEqual({(f["pose"], f["direction"]) for f in profile["frames"]}, expected)
                for frame in profile["frames"]:
                    x, y, width, height = frame["rect"]
                    self.assertTrue(0 <= x < x + width <= profile["width"])
                    self.assertTrue(0 <= y < y + height <= profile["height"])
                    self.assertEqual(frame["anchor"], [width / 2, height])
            for target, headers, status in [("/api/runs", {"Host": "evil.example"}, 403),
                                             ("/api/runs", {"Origin": "https://evil.example"}, 403),
                                             ("/../scripts/agent_world.py", {}, 404),
                                             ("/vendor/package-lock.json", {}, 404),
                                             ("/assets/../office-model.js", {}, 404),
                                             ("/assets/source.png", {}, 404)]:
                with self.assertRaises(HTTPError) as failure:
                    urlopen(Request(base + target, headers=headers))
                self.assertEqual(failure.exception.code, status)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()
