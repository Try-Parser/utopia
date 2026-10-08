"""Operator-configured Docker gateway. Does not restrict other native tools."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys
import threading
import uuid

from sandbox_worker import Denied, MAX_REQUEST, check_host_path, parse_request, validate_request

MAX_RESPONSE = 524288  # bounded escaped JSON for a 64 KiB text read


def docker_command(project, image, timeout, name):
    project = Path(project).resolve(strict=True)
    if not project.is_dir() or ',' in str(project) or '\n' in str(project):
        raise Denied('invalid operator project')
    if type(image) is not str or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._/@:-]{0,255}', image):
        raise Denied('invalid operator image')
    if type(timeout) is not int or not 1 <= timeout <= 300:
        raise Denied('operator timeout must be 1..300 seconds')
    worker = Path(__file__).with_name('sandbox_worker.py').resolve(strict=True)
    return ['docker', 'run', '--rm', '--name', name,
            '--label', 'ai-department.gateway=' + name, '-i', '--network', 'none',
            '--read-only', '--user', '65534:65534', '--cap-drop', 'ALL',
            '--security-opt', 'no-new-privileges', '--memory', '256m',
            '--cpus', '1', '--pids-limit', '64',
            '--tmpfs', '/tmp:rw,exec,nosuid,nodev,size=64m,mode=1777',
            '--mount', 'type=bind,src=' + str(project) + ',dst=/project,readonly',
            '--mount', 'type=bind,src=' + str(worker) + ',dst=/worker.py,readonly',
            '--workdir', '/project', '--entrypoint', 'python', image,
            '-I', '-B', '/worker.py', '--timeout', str(timeout)]


def _cleanup(name):
    # Exact task-owned UUID; never enumerate or kill unrelated containers.
    try:
        present = subprocess.run(
            ['docker', 'ps', '-aq', '--filter', 'label=ai-department.gateway=' + name],
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, timeout=10)
        if present.returncode:
            return False
        if not present.stdout.strip():
            return True
        removed = subprocess.run(['docker', 'rm', '-f', name], stdin=subprocess.DEVNULL,
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
        return removed.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def execute(request, *, project, image, timeout=30):
    try:
        validate_request(request)
        project = Path(project).resolve(strict=True)
        check_host_path(project, request)
        name = 'ai-gateway-' + uuid.uuid4().hex
        command = docker_command(project, image, timeout, name)
    except (ValueError, OSError):
        return {'status': 'denied', 'reason': 'request or operator configuration denied'}
    process = None
    output = bytearray()
    overflow = threading.Event()
    try:
        process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                   stderr=subprocess.DEVNULL)

        def drain():
            while True:
                chunk = process.stdout.read(8192)
                if not chunk:
                    return
                if len(output) + len(chunk) > MAX_RESPONSE:
                    overflow.set()
                    process.kill()
                    return
                output.extend(chunk)

        reader = threading.Thread(target=drain, daemon=True)
        reader.start()
        process.stdin.write(json.dumps(request).encode('utf-8'))
        process.stdin.close()
        try:
            code = process.wait(timeout=timeout + 10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
            return {'status': 'timeout'}
        reader.join(timeout=5)
        if overflow.is_set() or reader.is_alive() or code:
            return {'status': 'failed', 'reason': 'sandbox execution failed'}
        try:
            result = json.loads(output.decode('utf-8'))
            if not isinstance(result, dict) or result.get('status') not in {'passed', 'failed', 'denied', 'timeout'}:
                raise ValueError('invalid worker result')
            return result
        except (ValueError, UnicodeError):
            return {'status': 'failed', 'reason': 'invalid sandbox response'}
    except (OSError, subprocess.SubprocessError):
        return {'status': 'failed', 'reason': 'sandbox unavailable'}
    finally:
        if process is not None:
            if process.poll() is None:
                process.kill()
            if not _cleanup(name):
                return {'status': 'failed', 'reason': 'task-owned cleanup unconfirmed'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True, help='approved sanitized directory')
    parser.add_argument('--image', required=True, help='approved Python image; prefer a pinned digest')
    parser.add_argument('--timeout', type=int, default=30)
    args = parser.parse_args()
    try:
        request = parse_request(sys.stdin.buffer.read(MAX_REQUEST + 1).decode('utf-8'))
        result = execute(request, project=args.project, image=args.image, timeout=args.timeout)
    except (ValueError, UnicodeError):
        result = {'status': 'denied', 'reason': 'invalid JSON request'}
    print(json.dumps(result, ensure_ascii=True))
    return 0 if result['status'] == 'passed' else 1


if __name__ == '__main__':
    sys.exit(main())
