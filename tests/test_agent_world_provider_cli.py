"""Provider configuration never invokes a provider or accepts browser commands."""
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

spec = importlib.util.spec_from_file_location('world_provider_cli', Path(__file__).resolve().parents[1] / 'scripts' / 'agent_world.py')
world = importlib.util.module_from_spec(spec)
spec.loader.exec_module(world)


class ProviderCliTests(unittest.TestCase):
    def test_definitively_unavailable_provider_returns_rejected_without_a_job(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            workspace = root / 'workspace'
            workspace.mkdir()
            manager = world.live.LiveQueue(workspace, root / 'private', command=[])
            server = world.make_server(root, port=0, live_queue=manager)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            origin = f'http://127.0.0.1:{server.server_address[1]}'
            request = Request(origin + '/api/live/missions', method='POST',
                data=json.dumps(dict(requestId='a'*32, title='Offline rejection', brief='',
                                     role='builder', access='read-only', provider='claude')).encode(),
                headers={'Origin': origin, 'Content-Type': 'application/json',
                         'X-Agent-World-Token': manager.token})
            try:
                with self.assertRaises(HTTPError) as failure:
                    urlopen(request, timeout=5)
                self.assertEqual(failure.exception.code, 503)
                self.assertIs(json.loads(failure.exception.read())['accepted'], False)
                self.assertEqual(manager.view()['jobs'], [])
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=5)
                manager.close()

    def test_native_overrides_preserve_spaces_as_one_argument(self):
        with tempfile.TemporaryDirectory() as temporary:
            binary = Path(temporary) / 'my provider.exe'
            binary.write_bytes(b'offline fixture; never executed')
            commands = world.provider_overrides([f'claude={binary}'])
            self.assertEqual(commands, {'claude': [str(binary.resolve())]})
            self.assertEqual(world.provider_overrides([], binary), {'codex': [str(binary.resolve())]})

    def test_unknown_duplicate_and_shell_wrapper_overrides_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            binary = Path(temporary) / 'agent.exe'
            binary.write_bytes(b'offline fixture; never executed')
            for values, legacy in [(['unknown=' + str(binary)], None),
                                   (['codex=' + str(binary)], binary),
                                   (['claude=' + str(binary)] * 2, None),
                                   (['claude'], None), (['claude='], None)]:
                with self.subTest(values=values), self.assertRaises(ValueError):
                    world.provider_overrides(values, legacy)
            for suffix in ('.cmd', '.bat', '.ps1'):
                wrapper = Path(temporary) / ('agent' + suffix)
                wrapper.write_text('must not run', encoding='utf-8')
                with self.subTest(suffix=suffix), self.assertRaises(ValueError):
                    world.provider_overrides([f'claude={wrapper}'])

    def test_missing_and_directory_paths_never_become_commands(self):
        with tempfile.TemporaryDirectory() as temporary:
            for path in (Path(temporary), Path(temporary) / 'missing.exe'):
                with self.subTest(path=path), self.assertRaises(ValueError):
                    world.provider_overrides([f'codex={path}'])


if __name__ == '__main__':
    unittest.main()
