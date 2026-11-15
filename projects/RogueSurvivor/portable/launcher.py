"""Launch the prebuilt RogueSurvivor game through a loopback-only HTTP server."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
import webbrowser

# Do not change this port casually: IndexedDB saves are tied to the URL origin.
HOST = "127.0.0.1"
PORT = 18765


def make_handler(game_directory: Path):
    return partial(SimpleHTTPRequestHandler, directory=str(game_directory))


def main() -> int:
    game_directory = Path(__file__).resolve().parent / "game"
    if not (game_directory / "index.html").is_file():
        print("Game files are missing: expected game/index.html", file=sys.stderr)
        return 1

    try:
        server = ThreadingHTTPServer((HOST, PORT), make_handler(game_directory))
    except OSError as exc:
        print(f"Cannot start local server at {HOST}:{PORT}: {exc}", file=sys.stderr)
        print("Close any previous game launcher or program using this port, then retry.")
        print("The port stays fixed so your browser can find saved games.")
        return 1

    url = f"http://{HOST}:{PORT}/"
    with server:
        print(f"RogueSurvivor is running at {url}")
        print("Keep this window open while playing. Press Ctrl+C here to stop.")
        try:
            webbrowser.open(url, new=2)
        except Exception as exc:
            print(f"Could not open the browser automatically: {exc}")
            print(f"Open this address manually: {url}")
        try:
            server.serve_forever(poll_interval=0.2)
        except KeyboardInterrupt:
            print("\nGame server stopped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
