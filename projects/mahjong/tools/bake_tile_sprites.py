"""Optional development tool: bake standard 45-degree wall and 30-degree hand sprites.
Run with Python Playwright and Chromium, from any directory. Runtime has no extra dependency.
"""
import base64, json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]; WEB=ROOT/'web'
assets={str(i):'data:image/svg+xml;base64,'+base64.b64encode((WEB/'assets'/'tiles'/f'{i}.svg').read_bytes()).decode() for i in range(34)}
html='<script>window.MahjongScene={};window.MahjongPresentation={assets:{resolve:(g,i)=>('+json.dumps(assets)+')[i]}};window.fetch=async()=>({ok:false});</script>'
for name in ['components.js','cuboid-scene.js']:
    html+='<script>'+ (WEB/name).read_text().replace('</script>','<\\/script>')+'</script>'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None,headless=True,args=['--no-sandbox'])
    page=b.new_page();page.set_content(html)
    for scale,name in [(1,'sprites-v101.json'),(2,'wall-sprites-v101-2x.json')]:
        data=page.evaluate('scale=>MahjongCuboid.bakeStaticSprites(scale)',scale)
        path=WEB/'assets'/name
        path.write_text(json.dumps(data,separators=(',',':')),encoding='utf-8')
        print(len(data['entries']), 'sprites;',path.stat().st_size,'bytes;',sum(v['bytes'] for _,v in data['entries']),'decoded bytes')
    b.close()
