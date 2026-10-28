"""Fail on Godot script errors even when the engine exits with status zero."""
import argparse
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def run(arguments, marker=None):
    result = subprocess.run(arguments, cwd=ROOT, capture_output=True, text=True, timeout=300)
    output = result.stdout + result.stderr
    print(output)
    if result.returncode or "SCRIPT ERROR" in output or "ERROR:" in output or (marker and marker not in output):
        raise SystemExit("Godot verification failed")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--godot", default="godot")
    parser.add_argument("--export", action="store_true")
    args = parser.parse_args()
    base = [args.godot, "--headless", "--path", str(ROOT)]
    run(base + ["--editor", "--import", "--quit"])
    run(base + ["--script", "tests/test_run.gd"], "0 failures")
    run(base + ["--script", "tests/test_ui.gd"], "UI_CHECKS_PASS")
    run(base + ["--script", "tests/simulate.gd"], "stalled=0")
    run(base + ["--quit-after", "5"])
    if args.export:
        for preset, folder, filename in [("Web", "web", "index.html"), ("Windows Desktop", "windows", "RogueLab.exe")]:
            (ROOT / "build" / folder).mkdir(parents=True, exist_ok=True)
            run(base + ["--export-release", preset, f"build/{folder}/{filename}"])
        print("WEB_AND_WINDOWS_EXPORT_PASS")


if __name__ == "__main__":
    main()
