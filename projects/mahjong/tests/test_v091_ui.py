"""Source-level regression checks for the v0.9.1 symmetric square board.
The screenshots and browser geometry tests are documented separately.
"""
from pathlib import Path
import unittest

WEB = Path(__file__).resolve().parents[1] / "web"

class SquareBoardTests(unittest.TestCase):
    def test_all_game_pages_enable_square_board(self):
        for name in ("local.html", "lan.html", "prototype-v09.html"):
            with self.subTest(name=name):
                self.assertIn('href="/v091.css"', (WEB / name).read_text())

    def test_square_board_and_contained_hand(self):
        css = (WEB / "v091.css").read_text()
        self.assertIn("aspect-ratio:1", css)
        self.assertIn(".table-live .table-shell .player.dock-seat{position:absolute;inset:0", css)
        self.assertIn(".table-live .dock-seat .hand{position:absolute", css)

    def test_four_rotated_rivers_share_one_grid(self):
        css = (WEB / "v091.css").read_text()
        self.assertIn("grid-template-columns:repeat(7,var(--river-w))", css)
        for side, rotation in (("north", "180deg"), ("south", ""), ("west", "90deg"), ("east", "-90deg")):
            self.assertIn(f".v09-river-{side}", css)
            if rotation:
                self.assertIn(f"rotate({rotation})", css)

    def test_long_rivers_change_column_count(self):
        css = (WEB / "v091.css").read_text()
        self.assertIn("grid-template-columns:repeat(8,var(--river-w))", css)
        self.assertIn("grid-template-columns:repeat(10,var(--river-w))", css)
        scene = (WEB / "table-scene.js").read_text()
        self.assertIn("tiles.length>22", scene)
        self.assertIn("tiles.length>34", scene)

    def test_gold_is_nested_inside_center_widget(self):
        scene = (WEB / "table-scene.js").read_text()
        self.assertIn('class="v091-gold-corner"', scene)
        self.assertIn("${gold}", scene)
        self.assertNotIn("</div>${gold}`", scene)

    def test_controls_survive_dom_overlay(self):
        app = (WEB / "app.js").read_text()
        for action in ("data-tile", "data-action-key", "data-orphan-pickup", "data-ai-toggle", "/api/action", "/api/control"):
            with self.subTest(action=action):
                self.assertIn(action, app)

    def test_portrait_landscape_styles(self):
        css = (WEB / "v091.css").read_text()
        self.assertIn("(orientation:portrait)", css)
        self.assertIn("(orientation:landscape)", css)
        self.assertIn("(prefers-reduced-motion:reduce)", css)

if __name__ == "__main__":
    unittest.main()
