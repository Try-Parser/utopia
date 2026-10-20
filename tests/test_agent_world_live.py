"""Native process, HTTP and persistence contracts using offline subprocess fixtures."""
import importlib.util
import json
from pathlib import Path
import sys
import subprocess
import tempfile
import threading
import time
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

spec = importlib.util.spec_from_file_location("world", Path(__file__).resolve().parents[1] / "scripts" / "agent_world.py")
world = importlib.util.module_from_spec(spec)
spec.loader.exec_module(world)
live = world.live
FIXTURE = Path(__file__).parent / "fixtures" / "fake_codex.py"


class LiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.workspace = self.root / "workspace"
        self.workspace.mkdir()
        self.managers = []

    def tearDown(self):
        for manager in self.managers:
            manager.close()
        self.temp.cleanup()

    def manager(self, **options):
        manager = live.LiveQueue(self.workspace, self.root / "private", command=[sys.executable, str(FIXTURE)], **options)
        self.managers.append(manager)
        return manager

    def request(self, title="Mission", key="a", **options):
        return {"requestId": key * 32, "title": title, "brief": "User goal", "role": "builder", "access": "read-only", **options}

    def wait(self, manager, job_id, statuses=live.TERMINAL):
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            job = next(j for j in manager.view()["jobs"] if j["id"] == job_id)
            if job["status"] in statuses:
                return job
            time.sleep(.02)
        self.fail("Job did not reach expected status")

    def test_real_process_protocol_idempotency_and_private_output_exclusion(self):
        manager = self.manager()
        request = self.request()
        job = manager.submit(request)
        self.assertEqual(manager.submit(request)["id"], job["id"])
        result = self.wait(manager, job["id"])
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["action"], "reporting")
        self.assertIn("Native fixture result", result["result"])
        self.assertNotIn("PRIVATE_", manager.history.read_text())
        self.assertNotIn("brief", manager.view()["jobs"][0])
        self.assertTrue(any(e["text"] == "Running a command" for e in result["events"]))
        self.assertEqual(len(manager.view()["jobs"]), 1)
        with self.assertRaises(live.LiveError) as error:
            manager.submit(self.request(title="Different"))
        self.assertEqual(error.exception.status, 409)

    def test_native_snapshot_identifies_configured_workspace_without_exposing_its_path(self):
        manager = self.manager()
        initial = manager.view()
        expected = world.discovery.providers.workspace_identity(str(self.workspace))
        self.assertEqual({key: initial[key] for key in expected}, expected)
        other = self.root / "other" / self.workspace.name
        other.mkdir(parents=True)
        other_manager = live.LiveQueue(other, self.root / "private-other", discover_providers=False)
        self.managers.append(other_manager)
        self.assertEqual(initial["workspace"], other_manager.view()["workspace"])
        self.assertNotEqual(initial["workspaceId"], other_manager.view()["workspaceId"])
        self.assertEqual(manager.workspace, self.workspace.resolve())
        job = manager.submit(self.request())
        self.wait(manager, job["id"])
        self.assertEqual(manager.view()["workspaceId"], initial["workspaceId"])
        self.assertNotIn(str(self.root), json.dumps(manager.view()))

    def test_missing_completion_and_cli_failure_never_become_success(self):
        manager = self.manager()
        for title, key in (("FAIL", "a"), ("NO_COMPLETE", "b")):
            job = manager.submit(self.request(title, key))
            self.assertEqual(self.wait(manager, job["id"])["status"], "failed")

    def test_reported_code_changes_are_scoped_bounded_and_not_arbitrary_file_browsing(self):
        manager = self.manager(allow_edits=True)
        job = manager.submit(self.request('EDIT_CHECK', access='workspace-write'))
        completed = self.wait(manager, job['id'])
        self.assertEqual(completed['changes'], [{'path': 'fixture-output.txt', 'kind': 'add'}])
        preview = manager.change_preview(job['id'], 0)
        self.assertIn('+local fixture edit', preview['patch'])
        self.assertIn('before this task', preview['note'])
        self.assertLessEqual(len(preview['patch']), live.MAX_PATCH)
        for value in ('../outside.txt', str(self.root / 'outside.txt'), '.env', 'auth.json', 'secrets.txt'):
            self.assertIsNone(manager._change_path(value))
        with self.assertRaises(live.LiveError):
            manager.change_preview(job['id'], 1)
        with self.assertRaises(live.LiveError):
            manager.change_preview('f'*32, 0)
        (self.workspace / 'fixture-output.txt').write_text('x' * 300000)
        large = manager.change_preview(job['id'], 0)
        self.assertEqual(large['patch'], '')
        self.assertIn('too large', large['note'])
        try:
            (self.workspace / 'alias.txt').symlink_to(self.root / 'outside.txt')
        except OSError:
            pass
        else:
            self.assertIsNone(manager._change_path('alias.txt'))

    def test_tracked_update_delete_binary_and_clean_filters_never_execute(self):
        def git(*args):
            return subprocess.run(['git', *args], cwd=self.workspace, check=True, capture_output=True)
        git('init')
        git('config', 'user.email', 'fixture@example.invalid')  # ai-department-allow: email
        git('config', 'user.name', 'Fixture')
        file = self.workspace / 'app.js'
        file.write_text('const original = true;\n')
        git('add', 'app.js')
        git('commit', '-m', 'Fixture baseline')
        (self.workspace / '.gitattributes').write_text('app.js filter=marker\n')
        git('config', 'filter.marker.clean', 'touch filter-ran; cat')
        manager = self.manager(allow_edits=True)
        job = manager.submit(self.request('EDIT_CHECK', access='workspace-write'))
        self.wait(manager, job['id'])
        with manager.lock:
            manager.jobs[0]['changes'] = [{'path': 'app.js', 'kind': 'update'}]
        file.write_text("const message = 'Binary files are unsupported';\n")
        patch = manager.change_preview(job['id'], 0)['patch']
        self.assertIn('-const original', patch)
        self.assertIn('+const message', patch)
        self.assertFalse((self.workspace / 'filter-ran').exists())
        file.write_text('const next = false;')
        self.assertIn('+const next = false;\n\\ No newline at end of file\n', manager.change_preview(job['id'], 0)['patch'])
        file.write_text('é' * 15000)
        bounded = manager.change_preview(job['id'], 0)
        self.assertTrue(bounded['truncated'])
        self.assertLessEqual(len(bounded['patch'].encode('utf-8')), live.MAX_PATCH)
        file.unlink()
        self.assertIn('-const original', manager.change_preview(job['id'], 0)['patch'])
        file.write_bytes(b'\x00binary')
        self.assertIn('binary file', manager.change_preview(job['id'], 0)['note'])
        self.assertFalse((self.workspace / 'filter-ran').exists())

    def test_change_metadata_survives_history_restart_without_patch_persistence(self):
        manager = self.manager(allow_edits=True)
        job = manager.submit(self.request('EDIT_CHECK', access='workspace-write'))
        self.wait(manager, job['id'])
        manager.close()
        restored = self.manager(allow_edits=True)
        self.assertEqual(restored.view()['jobs'][0]['changes'][0]['path'], 'fixture-output.txt')
        self.assertNotIn('patch', restored.history.read_text())

    def test_change_preview_http_requires_token_and_known_reported_file(self):
        manager = self.manager(allow_edits=True)
        job = manager.submit(self.request('EDIT_CHECK', access='workspace-write'))
        self.wait(manager, job['id'])
        server = world.make_server(self.root, port=0, live_queue=manager)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f'http://127.0.0.1:{server.server_address[1]}'
        url = f"{base}/api/live/missions/{job['id']}/changes/0"
        try:
            with self.assertRaises(HTTPError) as failure:
                urlopen(url)
            self.assertEqual(failure.exception.code, 403)
            with urlopen(Request(url, headers={'X-Agent-World-Token': manager.token})) as response:
                self.assertIn('local fixture edit', json.load(response)['patch'])
            with self.assertRaises(HTTPError) as unknown:
                urlopen(Request(url[:-1]+'9', headers={'X-Agent-World-Token': manager.token}))
            self.assertEqual(unknown.exception.code, 404)
            with self.assertRaises(HTTPError) as origin:
                urlopen(Request(url, headers={'X-Agent-World-Token': manager.token, 'Origin': 'https://evil.example'}))
            self.assertEqual(origin.exception.code, 403)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_cancels_queued_and_active_process_then_runs_next(self):
        manager = self.manager()
        first = manager.submit(self.request("HANG"))
        self.wait(manager, first["id"], {"running"})
        second = manager.submit(self.request("Second", "b"))
        self.assertEqual(manager.cancel(second["id"])["status"], "cancelled")
        self.assertEqual(manager.cancel(first["id"])["status"], "cancelled")
        third = manager.submit(self.request("Third", "c"))
        self.assertEqual(self.wait(manager, third["id"])["status"], "completed")

    def test_timeout_kills_owned_process(self):
        manager = self.manager(timeout=.2)
        job = manager.submit(self.request("HANG"))
        self.assertEqual(self.wait(manager, job["id"])["status"], "timed-out")

    def test_exited_leader_descendant_does_not_block_timeout_or_next_mission(self):
        manager = self.manager(timeout=2)
        first = manager.submit(self.request("DESCENDANT"))
        second = manager.submit(self.request("Next", "b"))
        self.assertEqual(self.wait(manager, first["id"])["status"], "timed-out")
        # Check shortly after timeout; do not let the regression hang teardown.
        time.sleep(.3)
        if manager.process is not None and manager.active_id == first["id"]:
            import os
            import signal
            if os.name == "posix":
                os.killpg(manager.process.pid, signal.SIGKILL)
            self.fail("Exited leader's child left the queue blocked after timeout")
        self.assertEqual(self.wait(manager, second["id"])["status"], "completed")

    def test_cancel_after_leader_exit_terminates_child_and_advances_queue(self):
        manager = self.manager()
        first = manager.submit(self.request("DESCENDANT"))
        self.wait(manager, first["id"], {"running"})
        deadline = time.monotonic() + 2
        while manager.process.poll() is None and time.monotonic() < deadline:
            time.sleep(.01)
        self.assertEqual(manager.process.poll(), 0)
        manager.cancel(first["id"])
        second = manager.submit(self.request("Next", "b"))
        self.assertEqual(self.wait(manager, second["id"])["status"], "completed")

    def test_validates_access_roles_fields_and_queue_limit(self):
        manager = self.manager()
        for request in (self.request(access="workspace-write"), self.request(role="unknown"), self.request(title=" "), self.request(brief="x" * 601), {**self.request(), "workspace": "/arbitrary"}):
            with self.assertRaises(live.LiveError):
                manager.submit(request)
        first = manager.submit(self.request("HANG"))
        self.wait(manager, first["id"], {"running"})
        for key in "bcdef0123":
            manager.submit(self.request("Queued", key))
        with self.assertRaises(live.LiveError) as full:
            manager.submit(self.request("Overflow", "4"))
        self.assertEqual(full.exception.status, 429)

    def test_workspace_write_is_explicit_and_review_roles_cannot_edit(self):
        manager = self.manager(allow_edits=True)
        with self.assertRaises(live.LiveError):
            manager.submit(self.request(role="security", access="workspace-write"))
        read = manager.submit(self.request("EDIT_CHECK"))
        self.wait(manager, read["id"])
        self.assertFalse((self.workspace / "fixture-output.txt").exists())
        write = manager.submit(self.request("EDIT_CHECK", "b", access="workspace-write"))
        self.wait(manager, write["id"])
        self.assertTrue((self.workspace / "fixture-output.txt").exists())

    def test_history_restart_never_replays_and_request_ids_survive(self):
        manager = self.manager()
        completed = manager.submit(self.request())
        self.wait(manager, completed["id"])
        manager.close()
        history = json.loads(manager.history.read_text())
        history.append({**history[0], "requestId": "b" * 32, "id": "b" * 32, "status": "running"})
        manager.history.write_text(json.dumps(history))
        restarted = self.manager()
        statuses = {j["id"]: j["status"] for j in restarted.view()["jobs"]}
        self.assertEqual(statuses["b" * 32], "interrupted")
        self.assertEqual(restarted.submit(self.request())["id"], completed["id"])
        self.assertEqual(len(restarted.view()["jobs"]), 2)

    def test_http_requires_origin_token_json_and_fixed_workspace(self):
        manager = self.manager()
        server = world.make_server(self.root, port=0, live_queue=manager)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{server.server_address[1]}"
        headers = {"Origin": base, "Content-Type": "application/json", "X-Agent-World-Token": manager.token}
        try:
            with urlopen(base + "/api/live") as response:
                self.assertTrue(json.load(response)["enabled"])
            for changed, code in (({"Origin": "https://evil.example"}, 403), ({"X-Agent-World-Token": "wrong"}, 403), ({"Content-Type": "text/plain"}, 415), ({"Host": "evil.example"}, 403)):
                with self.assertRaises(HTTPError) as error:
                    urlopen(Request(base + "/api/live/missions", data=json.dumps(self.request()).encode(), headers={**headers, **changed}))
                self.assertEqual(error.exception.code, code)
            missing = {k: v for k, v in headers.items() if k != "Origin"}
            with self.assertRaises(HTTPError) as error:
                urlopen(Request(base + "/api/live/missions", data=b"{}", headers=missing))
            self.assertEqual(error.exception.code, 403)
            with urlopen(Request(base + "/api/live/missions", data=json.dumps(self.request()).encode(), headers=headers)) as response:
                job = json.load(response)
            self.assertEqual(self.wait(manager, job["id"])["status"], "completed")
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    unittest.main()
