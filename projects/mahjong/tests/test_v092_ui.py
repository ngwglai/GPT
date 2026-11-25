"""v0.9.2 layout regressions: side-tile alignment, meld orientation and LAN centering."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"

class V092LayoutTests(unittest.TestCase):
    def test_all_game_pages_load_v092_layer_last(self):
        for name in ("local.html", "lan.html", "prototype-v093.html"):
            source = (WEB / name).read_text()
            self.assertIn('href="/v092.css"', source, name)
            self.assertIn('href="/v093.css"', source, name)
            self.assertLess(source.index('href="/v092.css"'), source.index('href="/v093.css"'), name)
            self.assertLess(source.index('src="/perspective.js"'), source.index('src="/table-scene.js"'), name)

    def test_east_west_rivers_use_aligned_cells_not_rotated_grids(self):
        scene = (WEB / "table-scene.js").read_text()
        css = (WEB / "v092.css").read_text()
        self.assertIn('class="v092-river-cell"', scene)
        self.assertIn('.v09-river-west,.v09-river-west.crowded,.v09-river-west.dense,', css)
        self.assertIn('grid-auto-flow:column', css)
        self.assertIn('grid-template-rows:repeat(7,var(--river-w))', css)
        self.assertIn('grid-template-columns:none;grid-template-rows:repeat(7,var(--river-w))', css)
        self.assertIn('transform:translate(-50%,-50%) rotate(var(--river-angle))', css)
        self.assertNotIn('.v09-river-west{left:28%;top:50%;transform:translate(-50%,-50%) rotate', css)

    def test_east_west_enemy_hands_reserve_rotated_visual_footprint(self):
        scene = (WEB / "table-scene.js").read_text()
        css = (WEB / "v092.css").read_text()
        self.assertIn('class="v092-hand-cell"', scene)
        self.assertIn('.v092-hand-cell{position:relative', css)
        self.assertIn('height:calc(var(--back-w)*1.37)', css)

    def test_meld_claim_source_and_bu_gang_metadata_are_preserved(self):
        scene = (WEB / "table-scene.js").read_text()
        self.assertIn('const source = (meld.source - seat + 4) % 4', scene)
        self.assertIn('claimed.sourceRelative = source', scene)
        self.assertIn('sourceRelative:source', scene)
        self.assertIn('source-${sourceRelative===1?', scene)
        self.assertIn("if (meld.type === 'CHI') {", scene)
        self.assertIn('const ordered = [...tiles, claimed].sort', scene)
        self.assertIn('return ordered', scene)

    def test_meld_cells_keep_alignment_after_rotation_and_stack(self):
        css = (WEB / "v092.css").read_text()
        self.assertIn('.v092-meld-cell{position:relative', css)
        self.assertIn('--seat-angle:-90deg', css)
        self.assertIn('--seat-angle:90deg', css)
        self.assertIn('.v092-meld-cell.is-claimed>.v09-card{transform:translate(-50%,-50%) rotate(calc(var(--seat-angle) + var(--claim-turn)))', css)
        self.assertIn('.v092-meld-cell.is-stacked>.v09-card{translate:0 -3px}', css)

    def test_stack_translation_does_not_override_claim_rotation(self):
        css = (WEB / "v092.css").read_text()
        self.assertIn('.v092-meld-cell.is-claimed>.v09-card.scene-stacked{', css)
        self.assertIn('translate:0 -3px', css)

    def test_node_meld_logic_regression_script_exists(self):
        self.assertTrue((ROOT / 'tests' / 'v092_scene_logic.cjs').is_file())

    def test_lan_layout_is_centered_by_grid_and_symmetric_rails(self):
        css = (WEB / "v092.css").read_text()
        self.assertIn('body.table-live .game-content{', css)
        self.assertIn('place-items:center', css)
        self.assertIn('margin:0 auto!important', css)
        self.assertIn('.lan-mode.table-live #gameTable{justify-self:center', css)
        self.assertIn('--side:min(94vw,calc(100dvh - 96px),calc(100vw - var(--rail-size) - var(--rail-size) - 36px),980px)', css)
        self.assertIn('calc(100vw - var(--rail-size) - var(--rail-size) - 24px)', css)

    def test_v093_uses_one_planar_homography_for_the_whole_board(self):
        css = (WEB / "v093.css").read_text()
        projection = (WEB / "perspective.js").read_text()
        scene = (WEB / "table-scene.js").read_text()
        self.assertIn('class="v092-board-surface"', scene)
        self.assertIn('function projectPoint', projection)
        self.assertIn('function matrix3d', projection)
        self.assertIn('MahjongProjection?.apply', scene)
        self.assertIn('transform-origin:0 0 0', css)
        self.assertNotIn('perspective(', css)
        self.assertNotIn('rotateX(', css)

if __name__ == "__main__":
    unittest.main()
