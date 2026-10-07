"""Behavioral boundary tests; integration probes require operator Docker access."""
import json
from pathlib import Path
import os
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import safe_tools
import sandbox_worker as worker


class GatewayTests(unittest.TestCase):
    def test_shared_golden_denials(self):
        golden = Path(__file__).resolve().parents[1] / 'skills/ai-evaluation/references/measurement-golden-cases.json'
        for case in json.loads(golden.read_text(encoding='utf-8'))['toolRequests']:
            with self.subTest(case=case['id']), self.assertRaises(worker.Denied):
                worker.validate_request(case['request'])

    def test_strict_requests(self):
        for raw in ['[]', 'null', '{"tool":"read_file","path":"x","path":"y"}',
                    '{"tool":"read_file","path":NaN}', '{"tool":"shell"}',
                    '{"tool":"run_tests","command":"id"}',
                    '{"tool":"run_tests","image":"attacker"}',
                    '{"tool":"run_tests","timeout":900}']:
            with self.subTest(raw=raw), self.assertRaises(worker.Denied):
                worker.parse_request(raw)

    def test_unsafe_paths(self):
        for path in ['../x', '/etc/passwd', 'C:/x', 'a\\b', 'a//b', 'a/./b',
                     'a/../b', 'x\x00y', '.env', '.env.production', '.git/config',
                     '.ssh/id_rsa', 'credentials.json', 'server.key', '.config/x']:
            with self.subTest(path=path), self.assertRaises(worker.Denied):
                worker.validate_request({'tool': 'read_file', 'path': path})

    def test_denial_never_launches(self):
        with patch.object(safe_tools.subprocess, 'Popen') as launch:
            result = safe_tools.execute({'tool': 'run_tests', 'command': 'sh'},
                                        project='.', image='python:3.13')
            self.assertEqual(result['status'], 'denied')
            launch.assert_not_called()

    def test_fixed_isolation_command(self):
        with tempfile.TemporaryDirectory() as temp:
            command = safe_tools.docker_command(temp, 'python:3.13', 5, 'owned')
        for pair in [('--network', 'none'), ('--user', '65534:65534'),
                     ('--cap-drop', 'ALL'), ('--security-opt', 'no-new-privileges'),
                     ('--pids-limit', '64'), ('--entrypoint', 'python')]:
            self.assertEqual(command[command.index(pair[0]) + 1], pair[1])
        self.assertIn('--read-only', command)
        self.assertEqual(command.count('--mount'), 2)
        self.assertNotIn('/var/run/docker.sock', ' '.join(command))
        self.assertEqual(command[-5:], ['-I', '-B', '/worker.py', '--timeout', '5'])

    def test_operator_validation(self):
        with tempfile.TemporaryDirectory() as temp:
            for image in ['--privileged', 'python x', 'python;sh', '']:
                with self.assertRaises(worker.Denied):
                    safe_tools.docker_command(temp, image, 5, 'owned')
            for timeout in [0, 301, True, '30']:
                with self.assertRaises(worker.Denied):
                    safe_tools.docker_command(temp, 'python:3.13', timeout, 'owned')

    @unittest.skipUnless(os.name == 'posix', 'worker no-follow opens require Linux; Docker lane executes this')
    def test_reads_lists_bounds_and_symlink(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'hello.txt').write_text('hello', encoding='utf-8')
            (root / '.env').write_text('not a real secret', encoding='utf-8')
            (root / 'link').symlink_to('/etc/passwd')
            self.assertEqual(worker.handle({'tool': 'read_file', 'path': 'hello.txt'}, root)['text'], 'hello')
            self.assertEqual(worker.handle({'tool': 'list_files', 'path': '.'}, root)['files'], ['hello.txt'])
            with self.assertRaises(OSError):
                worker.handle({'tool': 'read_file', 'path': 'link'}, root)
            with self.assertRaises(worker.Denied):
                worker.check_host_path(root, {'tool': 'read_file', 'path': 'link'})
            (root / 'big').write_bytes(b'x' * (worker.MAX_READ + 1))
            with self.assertRaises(worker.Denied):
                worker.handle({'tool': 'read_file', 'path': 'big'}, root)

    @unittest.skipUnless(os.name == 'posix', 'Docker Linux lane')
    def test_directory_limit(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for index in range(worker.MAX_FILES + 1):
                (root / str(index)).touch()
            with self.assertRaises(worker.Denied):
                worker.handle({'tool': 'list_files', 'path': '.'}, root)

    def test_test_output_suppressed_and_timeout_failed(self):
        with patch.object(worker, 'open_scoped', return_value=10), patch.object(worker.os, 'close'), \
             patch.object(worker.subprocess, 'run', side_effect=worker.subprocess.TimeoutExpired('fixed', 1)) as run:
            self.assertEqual(worker.handle({'tool': 'run_tests'}, timeout=1)['status'], 'timeout')
            self.assertEqual(run.call_args.kwargs['stdout'], worker.subprocess.DEVNULL)
            self.assertEqual(run.call_args.kwargs['stderr'], worker.subprocess.DEVNULL)

    def test_host_timeout_removes_owned_container(self):
        process = MagicMock()
        process.stdout.read.return_value = b''
        process.wait.side_effect = [safe_tools.subprocess.TimeoutExpired('docker', 11), 0]
        process.poll.return_value = 0
        with tempfile.TemporaryDirectory() as temp, \
             patch.object(safe_tools.subprocess, 'Popen', return_value=process), \
             patch.object(safe_tools, '_cleanup', return_value=True) as cleanup:
            result = safe_tools.execute({'tool': 'list_files', 'path': '.'},
                                        project=temp, image='python:3.13', timeout=1)
            self.assertEqual(result['status'], 'timeout')
            process.kill.assert_called_once()
            self.assertRegex(cleanup.call_args.args[0], r'^ai-gateway-[0-9a-f]{32}$')

    def test_cleanup_failure_cannot_pass(self):
        process = MagicMock()
        process.stdout.read.side_effect = [b'{"status":"passed","files":[]}', b'']
        process.wait.return_value = 0
        process.poll.return_value = 0
        with tempfile.TemporaryDirectory() as temp, \
             patch.object(safe_tools.subprocess, 'Popen', return_value=process), \
             patch.object(safe_tools, '_cleanup', return_value=False):
            result = safe_tools.execute({'tool': 'list_files', 'path': '.'},
                                        project=temp, image='python:3.13')
            self.assertEqual(result['status'], 'failed')

    def test_worker_output_is_bounded(self):
        process = MagicMock()
        process.stdout.read.return_value = b'x' * 8192
        process.wait.return_value = 0
        process.poll.return_value = 0
        with tempfile.TemporaryDirectory() as temp, \
             patch.object(safe_tools.subprocess, 'Popen', return_value=process), \
             patch.object(safe_tools, '_cleanup', return_value=True):
            result = safe_tools.execute({'tool': 'list_files', 'path': '.'},
                                        project=temp, image='python:3.13')
            self.assertEqual(result['status'], 'failed')
            process.kill.assert_called_once()


if __name__ == '__main__':
    unittest.main()
