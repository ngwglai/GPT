"""Build a clean Windows x64 portable ZIP plus source/tests, excluding local environments.
Downloads the pinned official CPython embeddable distribution and binary wheels.
Run: python tools/package_release.py --output /path/QingqueMahjong_v0.10.1.zip
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PYTHON_VERSION = '3.14.10'
PYTHON_SHA256 = '90905e64a840557d8c1bc4f5b74db3d7ee85e3ffb217611cac1c7813acea4159'
EXCLUDED = {'.venv', '__pycache__', 'node_modules', '.git', '.pytest_cache', 'build', 'dist', 'runtime'}


def build(output):
    with tempfile.TemporaryDirectory(prefix='qingque-') as temp:
        stage = Path(temp)
        project = stage/'QingqueMahjong_v0.10.1'
        shutil.copytree(ROOT, project, ignore=lambda d, names: [n for n in names if n in EXCLUDED
                        or n.endswith(('.pyc', '.pyo', '.egg-info'))])
        archive = stage/'python.zip'
        urllib.request.urlretrieve(f'https://www.python.org/ftp/python/{PYTHON_VERSION}/python-{PYTHON_VERSION}-embed-amd64.zip', archive)
        assert hashlib.sha256(archive.read_bytes()).hexdigest() == PYTHON_SHA256, 'CPython checksum mismatch'
        runtime = project/'runtime'
        with zipfile.ZipFile(archive) as z:
            z.extractall(runtime)
        wheels = stage/'wheels'
        subprocess.run([sys.executable, '-m', 'pip', 'download', '--only-binary=:all:',
                        '--platform', 'win_amd64', '--python-version', '314', '--implementation', 'cp',
                        '--abi', 'cp314', '-r', str(ROOT/'requirements.txt'), '-d', str(wheels)], check=True)
        packages = runtime/'Lib/site-packages'
        packages.mkdir(parents=True)
        hashes = {}
        for wheel in sorted(wheels.glob('*.whl')):
            hashes[wheel.name] = hashlib.sha256(wheel.read_bytes()).hexdigest()
            with zipfile.ZipFile(wheel) as z:
                z.extractall(packages)
        (runtime/'python314._pth').write_text('python314.zip\n.\nLib/site-packages\n..\nimport site\n', encoding='utf-8')
        (project/'PORTABLE-RUNTIME.json').write_text(json.dumps({'python': PYTHON_VERSION,
            'python_sha256': PYTHON_SHA256, 'wheel_sha256': hashes}, indent=2)+'\n', encoding='utf-8')
        output.parent.mkdir(parents=True, exist_ok=True)
        # Use stable ZIP metadata and sorted paths; dependency versions are recorded.
        with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            for path in sorted(project.rglob('*')):
                if path.is_file():
                    info = zipfile.ZipInfo(str(path.relative_to(stage)).replace('\\', '/'), (2026,11,24,0,0,0))
                    info.compress_type = zipfile.ZIP_DEFLATED
                    info.external_attr = 0o644 << 16
                    z.writestr(info, path.read_bytes())
        digest = hashlib.sha256(output.read_bytes()).hexdigest()
        output.with_suffix('.sha256').write_text(digest+'  '+output.name+'\n', encoding='utf-8')
        print(output.name, output.stat().st_size, digest)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    build(parser.parse_args().output.resolve())
