"""Canonical sandbox worker; never execute untrusted commands outside Docker."""
import argparse
import json
import os
from pathlib import Path
import stat
import subprocess
import sys

MAX_REQUEST = 8192
MAX_READ = 65536
MAX_FILES = 200
SECRET_PARTS = {'.git', '.env', '.ssh', '.aws', '.azure', '.config', '.gnupg', '.docker', '.kube',
                '.claude', '.codex', 'credentials', 'secrets', 'node_modules',
                '__pycache__'}
SECRET_NAMES = {'config', 'config.json', 'config.yaml', 'config.yml', 'config.toml',
                'credentials.json', 'credentials.yaml', 'credentials.yml',
                'secrets.json', 'secrets.yaml', 'secrets.yml', 'id_rsa', 'id_ed25519',
                '.netrc', '.npmrc', '.pypirc', 'known_hosts', 'authorized_keys'}


class Denied(ValueError):
    """Request is outside the approved boundary."""


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise Denied('duplicate field')
        result[key] = value
    return result


def parse_request(raw):
    if not isinstance(raw, str) or len(raw.encode('utf-8')) > MAX_REQUEST:
        raise Denied('request too large')
    try:
        request = json.loads(raw, object_pairs_hook=_pairs,
                             parse_constant=lambda value: (_ for _ in ()).throw(Denied('nonfinite JSON')))
    except (ValueError, RecursionError) as exc:
        raise Denied('invalid JSON request') from exc
    validate_request(request)
    return request


def secret_component(part):
    value = part.lower()
    return (value in SECRET_PARTS or value in SECRET_NAMES or value.startswith('.env')
            or value.startswith(('credentials.', 'secrets.', 'id_rsa', 'id_ed25519', 'id_dsa', 'id_ecdsa'))
            or value.endswith(('.pem', '.key', '.p12', '.pfx', '.keystore', '.jks')))


def validate_request(request):
    if not isinstance(request, dict) or type(request.get('tool')) is not str:
        raise Denied('request must name one approved tool')
    tool = request['tool']
    fields = {'tool'} if tool == 'run_tests' else {'tool', 'path'}
    if tool not in {'read_file', 'list_files', 'run_tests'} or set(request) != fields:
        raise Denied('unknown tool or fields')
    if tool == 'run_tests':
        return
    path = request['path']
    if type(path) is not str or not path or len(path) > 1024:
        raise Denied('invalid relative path')
    if any(c in path for c in ('\\', ':', '\x00')) or path.startswith('/'):
        raise Denied('invalid relative path')
    parts = path.split('/')
    if path == '.' and tool == 'list_files':
        return
    if any(part in {'', '.', '..'} or secret_component(part) for part in parts):
        raise Denied('unsafe or secret path')


def check_host_path(project, request):
    """Early check, not a substitute for worker no-follow opens."""
    validate_request(request)
    path = request.get('path', 'tests')
    candidate = project
    for part in ([] if path == '.' else path.split('/')):
        candidate = candidate / part
        if candidate.is_symlink():
            raise Denied('symlink path')
    if not candidate.resolve().is_relative_to(project.resolve()):
        raise Denied('path escapes project')


def open_scoped(root, relative, directory=False):
    """Open each component without following symlinks or traversal races."""
    parts = [] if relative == '.' else relative.split('/')
    fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for index, part in enumerate(parts):
            flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK
            if index < len(parts) - 1 or directory:
                flags |= os.O_DIRECTORY
            next_fd = os.open(part, flags, dir_fd=fd)
            os.close(fd)
            fd = next_fd
        return fd
    except BaseException:
        os.close(fd)
        raise


def handle(request, root=Path('/project'), timeout=30):
    validate_request(request)
    tool = request['tool']
    if tool == 'run_tests':
        test_fd = open_scoped(root, 'tests', directory=True)
        os.close(test_fd)
        try:
            result = subprocess.run(
                [sys.executable, '-B', '-m', 'unittest', 'discover', '-s', '/project/tests', '-v'],
                cwd=root, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL, timeout=timeout,
                env={'PATH': '/usr/local/bin:/usr/bin:/bin', 'HOME': '/tmp',
                     'PYTHONDONTWRITEBYTECODE': '1', 'TMPDIR': '/tmp'})
            return {'status': 'passed' if result.returncode == 0 else 'failed',
                    'exitCode': result.returncode}
        except subprocess.TimeoutExpired:
            return {'status': 'timeout'}
    fd = open_scoped(root, request['path'], directory=tool == 'list_files')
    try:
        if tool == 'read_file':
            if not stat.S_ISREG(os.fstat(fd).st_mode):
                raise Denied('only regular files may be read')
            data = os.read(fd, MAX_READ + 1)
            if len(data) > MAX_READ:
                raise Denied('file exceeds read limit')
            return {'status': 'passed', 'text': data.decode('utf-8')}
        names = []
        with os.scandir(fd) as entries:
            for entry in entries:
                if secret_component(entry.name) or entry.is_symlink():
                    continue
                if not (entry.is_file(follow_symlinks=False) or entry.is_dir(follow_symlinks=False)):
                    continue
                if len(names) == MAX_FILES:
                    raise Denied('directory exceeds listing limit')
                names.append(entry.name)
        return {'status': 'passed', 'files': sorted(names)}
    finally:
        os.close(fd)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--timeout', type=int, required=True)
    args = parser.parse_args()
    try:
        request = parse_request(sys.stdin.buffer.read(MAX_REQUEST + 1).decode('utf-8'))
        result = handle(request, timeout=args.timeout)
    except (ValueError, OSError, UnicodeError):
        result = {'status': 'denied', 'reason': 'request or file outside approved boundary'}
    print(json.dumps(result, ensure_ascii=True))


if __name__ == '__main__':
    main()
