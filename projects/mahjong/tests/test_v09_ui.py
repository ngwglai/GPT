"""Source-level regression guards for the new independent v0.9 gameplay renderer.
Real browser frames and actual API interactions are reported separately.
"""
from pathlib import Path
import unittest
ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'web'

class SpringTableTests(unittest.TestCase):
    def test_game_routes_load_new_ui(self):
        for page in ['local.html','lan.html']:
            source=(WEB/page).read_text()
            with self.subTest(page=page):
                self.assertIn('href="/v09.css"',source)
                self.assertIn('src="/table-scene.js"',source)
                self.assertNotIn('src="/table-mesh.js"',source)
                self.assertNotIn('href="/scene.css"',source)
                self.assertNotIn('href="/play.css"',source)
    def test_new_renderer_injects_all_four_compass_sides(self):
        s=(WEB/'table-scene.js').read_text()
        self.assertIn('Object.entries(layout)',s)
        for phrase in ('v09-river-${side}','v09-wall-${side}','v09-enemy-${side}', 'v09-exposed-${side}', 'v09-compass-${side}'):
            self.assertIn(phrase,s)
    def test_rendering_preserves_wall_seat_identity(self):
        s=(WEB/'table-scene.js').read_text()
        self.assertIn('table.wall_view?.sides?.[seat]',s)
        self.assertIn('wall-layer',s)
        self.assertIn('data-river-seat',s)
        self.assertIn('!d.claimed',s)
    def test_preserves_public_renderer_interface(self):
        s=(WEB/'table-scene.js').read_text()
        for method in ('markup','meldOrder','mount','setPerspective','snapshot','animate','cancelFlights'):
            self.assertIn(method,s)
    def test_action_js_still_manages_ai_orphans_and_ting(self):
        s=(WEB/'app.js').read_text()
        for api in ('/api/control','/api/orphan-pickup','/api/action','renderWaitHint','renderActions','data-view-toggle','data-river-toggle'):
            self.assertIn(api,s)
    def test_artwork_is_independent_assets(self):
        assets=WEB/'assets/ui-v09'
        for f in ('sakura-room.webp','seat-0.webp','seat-1.webp','seat-2.webp','seat-3.webp'):
            with self.subTest(f=f):
                self.assertTrue((assets/f).stat().st_size>4000)
    def test_portrait_landscape_and_motion_preferences(self):
        css=(WEB/'v09.css').read_text()
        for x in ('orientation:portrait','orientation:landscape','prefers-reduced-motion','v09-river.crowded'):
            self.assertIn(x,css)
    def test_home_and_prototype_available(self):
        self.assertIn('href="/v09.css"',(WEB/'index.html').read_text())
        self.assertTrue((WEB/'prototype-v09.html').exists())
        self.assertIn('MahjongScene.markup',(WEB/'prototype-v09.html').read_text())

if __name__=='__main__': unittest.main()
