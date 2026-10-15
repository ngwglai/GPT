"""Run the real local server and browser acceptance on Linux or Windows."""

from pathlib import Path
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request


def main():
    project = Path(__file__).resolve().parents[1] / "projects" / "constraintlab"
    npm = shutil.which("npm")
    if npm is None:
        raise RuntimeError("npm is required")
    with (project / "server.log").open("w", encoding="utf-8") as log:
        server = subprocess.Popen(
            [sys.executable, "-m", "constraintlab.cli", "--serve"],
            cwd=project, stdout=log, stderr=subprocess.STDOUT,
        )
        try:
            deadline = time.monotonic() + 60
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
            return subprocess.run([npm, "test"], cwd=project / "frontend").returncode
        finally:
            server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()


if __name__ == "__main__":
    raise SystemExit(main())
