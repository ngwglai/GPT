"""Install pinned official Godot binaries into an explicit build-tools directory."""
import argparse
import hashlib
import os
from pathlib import Path
import platform
import shutil
import urllib.request
import zipfile

VERSION = "4.6.3"
FILES = {
    "linux": ("Godot_v4.6.3-stable_linux.x86_64.zip", "d0bc2113065e481c9c2c2b2c37daa4e8be3fe9e27f0ab9ab0b6096e9a37907f3"),
    "windows": ("Godot_v4.6.3-stable_win64.exe.zip", "e39986a178d585ce7ac198fb8de6ea436366dc0cc00e594810c2e3e104c04b90"),
    "templates": ("Godot_v4.6.3-stable_export_templates.tpz", "3fbe2c0e2dec9d537ab9ec97bcf8da91dcf23357fc51f67092dd068d839290a8"),
}
# Official GitHub release asset SHA-256 digests, pinned at release selection.


def fetch(root, kind):
    name, digest = FILES[kind]
    archive = root / name
    if not archive.exists():
        url = f"https://github.com/godotengine/godot-builds/releases/download/{VERSION}-stable/{name}"
        with urllib.request.urlopen(url, timeout=180) as response, archive.with_suffix(".part").open("wb") as output:
            shutil.copyfileobj(response, output)
        archive.with_suffix(".part").replace(archive)
    with archive.open("rb") as handle:
        actual = hashlib.file_digest(handle, "sha256").hexdigest()
    if actual != digest:
        raise SystemExit("Official Godot artifact checksum mismatch; refusing to install")
    return archive


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", required=True, type=Path)
    parser.add_argument("--templates", action="store_true")
    args = parser.parse_args()
    root = args.directory.resolve()
    root.mkdir(parents=True, exist_ok=True)
    kind = "windows" if platform.system() == "Windows" else "linux"
    archive = fetch(root, kind)
    binary_dir = root / "bin"
    binary_dir.mkdir(exist_ok=True)
    name = "Godot_v4.6.3-stable_win64.exe" if kind == "windows" else "Godot_v4.6.3-stable_linux.x86_64"
    target = binary_dir / ("godot.exe" if kind == "windows" else "godot")
    with zipfile.ZipFile(archive) as package:
        target.write_bytes(package.read(name))
        if kind == "windows":
            console = "Godot_v4.6.3-stable_win64_console.exe"
            (binary_dir / "godot_console.exe").write_bytes(package.read(console))
    target.chmod(0o755)
    if args.templates:
        if kind != "linux":
            raise SystemExit("Cross-platform exports are built in the Linux job")
        destination = root / "data/godot/export_templates/4.6.3.stable"
        destination.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(fetch(root, "templates")) as package:
            for filename in ("web_nothreads_release.zip", "web_nothreads_debug.zip", "windows_release_x86_64.exe", "windows_debug_x86_64.exe"):
                (destination / filename).write_bytes(package.read("templates/" + filename))
    if os.environ.get("GITHUB_PATH"):
        with open(os.environ["GITHUB_PATH"], "a", encoding="utf-8") as handle:
            handle.write(str(binary_dir) + "\n")
        if args.templates:
            with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as handle:
                handle.write("XDG_DATA_HOME=" + str(root / "data") + "\n")
    print("Verified Godot toolchain installed in the requested directory.")


if __name__ == "__main__":
    main()
