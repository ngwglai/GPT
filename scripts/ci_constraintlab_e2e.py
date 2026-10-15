"""Run the real local server and browser acceptance on Linux or Windows."""

import argparse
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request


def acceptance(project, windows_launcher=False):
    npm = shutil.which("npm")
    if npm is None:
        raise RuntimeError("npm is required")
    with (project / "server.log").open("w", encoding="utf-8") as log:
        command = (
            ["cmd.exe", "/d", "/c", "start-windows.cmd"]
            if windows_launcher else [sys.executable, "-m", "constraintlab.cli", "--serve"]
        )
        server = subprocess.Popen(
            command,
            cwd=project, stdout=log, stderr=subprocess.STDOUT,
        )
        try:
            deadline = time.monotonic() + (300 if windows_launcher else 60)
            while True:
                if server.poll() is not None:
                    raise RuntimeError("server exited before readiness; inspect server.log")
                try:
                    with urllib.request.urlopen("http://127.0.0.1:8765", timeout=2) as response:
                        if response.status == 200:
                            break
                except (urllib.error.URLError, TimeoutError):
                    pass
                if time.monotonic() >= deadline:
                    raise RuntimeError("server did not become ready; inspect server.log")
                time.sleep(0.25)
            if windows_launcher:
                subprocess.run([str(project / ".venv/Scripts/python.exe"), "--version"], check=True)
            return subprocess.run([npm, "test"], cwd=project / "frontend").returncode
        finally:
            if windows_launcher:
                subprocess.run(
                    ["taskkill", "/PID", str(server.pid), "/T", "/F"],
                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                )
            else:
                server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--windows-launcher", action="store_true")
    args = parser.parse_args()
    project = Path(__file__).resolve().parents[1] / "projects" / "constraintlab"
    if not args.windows_launcher:
        return acceptance(project)
    if sys.platform != "win32":
        parser.error("--windows-launcher requires native Windows")
    # Exercise installation and launch from a path containing spaces and Unicode.
    with tempfile.TemporaryDirectory(prefix="ConstraintLab 验收 ") as temporary:
        copied = Path(temporary) / "project"
        shutil.copytree(project, copied, ignore=shutil.ignore_patterns(
            ".venv", "node_modules", "dist", "build", "*.egg-info",
            "__pycache__", ".pytest_cache", "test-results", "server.log",
        ))
        try:
            return acceptance(copied, windows_launcher=True)
        finally:
            if (copied / "server.log").exists():
                shutil.copyfile(copied / "server.log", project / "server.log")


if __name__ == "__main__":
    raise SystemExit(main())
