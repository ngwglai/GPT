"""Offline smoke tests for the zero-dependency Windows portable launcher."""

import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.request import urlopen

from launcher import HOST, PORT, make_handler


class PortableLauncherTests(unittest.TestCase):
    def test_origin_is_stable_and_loopback_only(self):
        self.assertEqual(HOST, "127.0.0.1")
        self.assertEqual(PORT, 18765)

    def test_server_serves_only_the_game_directory(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            game = root / "game"
            game.mkdir()
            (game / "index.html").write_text("<title>offline game</title>", encoding="utf-8")
            (game / "asset.txt").write_text("offline asset", encoding="utf-8")
            (root / "secret.txt").write_text("not served", encoding="utf-8")
            with ThreadingHTTPServer((HOST, 0), make_handler(game)) as server:
                worker = threading.Thread(target=server.serve_forever, daemon=True)
                worker.start()
                try:
                    url = f"http://{HOST}:{server.server_port}"
                    with urlopen(url + "/", timeout=5) as response:
                        self.assertIn(b"offline game", response.read())
                    with urlopen(url + "/asset.txt", timeout=5) as response:
                        self.assertEqual(response.read(), b"offline asset")
                    from urllib.error import HTTPError
                    with self.assertRaises(HTTPError) as error:
                        urlopen(url + "/secret.txt", timeout=5)
                    self.assertEqual(error.exception.code, 404)
                finally:
                    server.shutdown()
                    worker.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
