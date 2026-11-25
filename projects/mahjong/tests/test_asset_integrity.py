"""Guard the supplied artwork, with the deliberately redrawn eight-bamboo face."""
import hashlib
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]

class AssetIntegrityTests(unittest.TestCase):
    def test_release_tile_faces_match_reviewed_source_art(self):
        expected=json.loads((ROOT/'tests/protected_art.json').read_text(encoding='utf-8'))
        actual={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT/'web/assets/tiles').glob('*.svg')}
        self.assertEqual(actual,expected)
