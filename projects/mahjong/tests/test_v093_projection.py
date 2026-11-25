from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"

class V093ProjectionTests(unittest.TestCase):
    def test_game_pages_load_projection_layer_after_v092(self):
        for name in ("local.html", "lan.html"):
            source = (WEB / name).read_text()
            self.assertIn('href="/v093.css"', source)
            self.assertLess(source.index('href="/v092.css"'), source.index('href="/v093.css"'))
            self.assertIn('src="/perspective.js"', source)

    def test_projection_is_shared_planar_homography_not_surface_only_fake_perspective(self):
        projection = (WEB / "perspective.js").read_text()
        css = (WEB / "v093.css").read_text()
        legacy_css = (WEB / "v092.css").read_text()
        scene = (WEB / "table-scene.js").read_text()
        self.assertIn("function projectPoint", projection)
        self.assertIn("function matrix3d", projection)
        self.assertIn("bottomHalf", projection)
        self.assertIn("MahjongProjection?.apply", scene)
        self.assertIn("transform-origin:0 0 0", css)
        self.assertIn("transform:none!important", css)
        self.assertIn("every tile, wall, river, meld, hand, and center-table object", projection)
        self.assertNotIn("perspective(", css)
        self.assertNotIn("rotateX(", css)
        self.assertNotIn("perspective(", legacy_css)
        self.assertNotIn("rotateX(", legacy_css)

    def test_live_hand_is_reparented_into_the_same_projection_plane(self):
        app = (WEB / "app.js").read_text()
        scene = (WEB / "table-scene.js").read_text()
        css = (WEB / "v093.css").read_text()
        self.assertIn('data-hand-seat="${seat}"', app)
        self.assertIn("v093-projected-hand", scene)
        self.assertIn("restoreHand", scene)
        self.assertIn(".v09-board>.v093-projected-hand", css)

    def test_prototype_and_projective_math_regression_script_exist(self):
        self.assertTrue((WEB / "prototype-v093.html").is_file())
        self.assertTrue((ROOT / "tests" / "v093_projection.cjs").is_file())

if __name__ == "__main__":
    unittest.main()
