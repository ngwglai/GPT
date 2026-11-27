"""Render real server snapshots with inline assets when browser HTTP is unavailable."""
import base64
import json
import re
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from web_server import LocalTable
from mahjong.game.debug import PlayerFixture
from tests.browser_acceptance import fixture
from tests.helpers import E
from tests.test_gold import WAIT

ROOT = Path(__file__).resolve().parents[1] / 'web'

def inline(name, mock):
    html = (ROOT / name).read_text(encoding='utf8')
    html = re.sub(r'<link rel="stylesheet" href="/([^"]+)">', lambda m: '<style>' + (ROOT / m[1]).read_text(encoding='utf8') + '</style>', html)
    html = html.replace('<script src="/presentation.js"></script>', '<script>'+mock+'</script><script src="/presentation.js"></script>')
    return re.sub(r'<script src="/([^"]+)"></script>', lambda m: '<script>'+(ROOT/m[1]).read_text(encoding='utf8').replace('</script>','<\\/script>')+'</script>', html)


def run():
    table = LocalTable(seed=42)
    initial = table.snapshot()
    five = table.new_round(seed=42, base_score=5)
    fixture(table.engine, {E:PlayerFixture(WAIT+[31],declared=True,last_draw_type=31,shelves=1)},gold=33)
    pre = table.snapshot()
    post = table.act(seat=E,payload=dict(round_id=pre['round_id'],revision=pre['revision'],type='HU',tile_ids=[]))
    next_round = table.next_round(seed=43)
    assets = {str(i):'data:image/svg+xml;base64,'+base64.b64encode((ROOT/'assets/tiles'/f'{i}.svg').read_bytes()).decode() for i in range(34)}
    mock = '''window._initial=%s;window._five=%s;window._post=%s;window._next=%s;window._state=window._initial;window._requests=[];
    window.fetch=async(url,opts)=>{if(url.includes('manifest'))return {ok:true,json:async()=>(%s)};if(url.includes('sprites-v101'))return {ok:true,json:async()=>(%s)};
    if(opts?.method==='POST'){window._requests.push({url,body:JSON.parse(opts.body)});if(url==='/api/new-round')window._state=window._five;else if(url==='/api/action')window._state=window._post;else if(url==='/api/next-round')window._state=window._next;}
    return {ok:true,json:async()=>({ok:true,table:window._state})};};''' % (*map(json.dumps,(initial,five,post,next_round)),json.dumps({'tiles':assets}),(ROOT/'assets/sprites-v101.json').read_text(encoding='utf8'))
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None)
        page = browser.new_page(viewport={'width':1366,'height':768})
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.set_content(inline('local.html',mock),wait_until='domcontentloaded')
        page.wait_for_selector('.cuboid-sprite',timeout=15000)
        page.locator('.top-details').first.locator('summary').click()
        page.locator('#baseScoreSelect').select_option('5')
        page.locator('#resetMatchBtn').click()
        expect(page.locator('.top-details').first).not_to_have_attribute('open','')
        assert page.evaluate('window._requests[0].body.base_score')==5
        page.evaluate('(t)=>{window._state=t;acceptTable(t,{initial:true})}',pre)
        page.locator('.dock-seat [data-action-key^="HU:"]').click(timeout=10000)
        expect(page.locator('.result-deltas')).to_contain_text('+75')
        expect(page.locator('.result-deltas')).to_contain_text('-25')
        page.locator('.table-details summary').click()
        expect(page.locator('.score-detail')).to_be_visible()
        expect(page.locator('.score-detail tbody tr')).to_have_count(3)
        page.locator('.table-details summary').click()
        for w,h in [(844,390),(390,844)]:
            page.set_viewport_size({'width':w,'height':h})
            expect(page.locator('.result-deltas')).to_be_visible()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        page.locator('#newRoundBtn').click()
        expect(page.locator('.dock-seat [data-action-key^="ROLL_DICE:"]')).to_be_visible()
        assert page.evaluate('window._state.match.scoring.totals["0"]')=='75'
        assert not errors, errors
        browser.close()
    print('PASS offline browser: 5-point selection, HU click, payment detail, next round, desktop and two mobile viewports')

if __name__ == '__main__':
    run()
