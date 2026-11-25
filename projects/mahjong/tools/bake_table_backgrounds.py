"""Bake the two vector felt/shadow sources at 1x, 1.5x and 2x without runtime filters.
First run node tools/build_table_backgrounds.cjs. Requires development Playwright only.
"""
import json
import math
import os
from pathlib import Path
from xml.etree import ElementTree
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'web/assets/table'
manifest={}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None,headless=True,args=['--no-sandbox'])
    page=browser.new_page()
    for view in ('oblique','overhead'):
        source=(ASSETS/f'felt-{view}.svg').read_text()
        svg=ElementTree.fromstring(source)
        w,h=float(svg.attrib['width']),float(svg.attrib['height'])
        for scale in (1,1.5,2):
            width,height=math.ceil(w*scale),math.ceil(h*scale)
            page.set_viewport_size({'width':width,'height':height})
            page.set_content(f'<style>body{{margin:0;background:transparent}}svg{{display:block;width:{w*scale}px;height:{h*scale}px}}</style>'+source)
            target=ASSETS/f'felt-{view}-{scale}.png'
            page.screenshot(path=str(target),omit_background=True)
            manifest[target.name]={'width':width,'height':height,'scale':scale,'bytes':width*height*4}
            print(target.name,width,height,target.stat().st_size,flush=True)
    browser.close()
(ASSETS/'felt-rasters.json').write_text(json.dumps(manifest,indent=2)+'\n')
