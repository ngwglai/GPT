"""Current renderer: real HTTP wall identities, hidden information, views and pixel lifetimes."""
import argparse
import asyncio

from playwright.async_api import async_playwright, expect

from lan_server import create_app
from tests.browser_acceptance import serve


async def wall_snapshot(page, table):
    expected = set()
    for seat, stacks in table['wall_view']['sides'].items():
        for stack in stacks:
            for layer in ('bottom', 'top'):
                if stack[layer]['present']:
                    expected.add((str(seat), str(stack['column']), layer))
    got = await page.locator('[data-cuboid-kind="wall"]').evaluate_all(
        'nodes=>nodes.map(n=>[n.dataset.wallSeat,n.dataset.wallColumn,n.dataset.wallLayer])')
    assert set(map(tuple, got)) == expected
    assert len(got) == len(expected)
    for seat, stacks in table['wall_view']['sides'].items():
        for stack in stacks:
            for layer in ('bottom', 'top'):
                slot = stack[layer]
                if slot['present'] and slot['indicator']:
                    node = page.locator(f'[data-wall-seat="{seat}"][data-wall-column="{stack["column"]}"][data-wall-layer="{layer}"]')
                    await expect(node).to_have_attribute('data-tile-face', str(table['gold_indicator']['type']))


async def run(args):
    errors = []
    async with serve(create_app(42)) as url, async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=args.chromium, args=['--no-sandbox'])
        page = await browser.new_page(viewport={'width': 1440, 'height': 900})
        page.on('pageerror', lambda e: errors.append(str(e)))
        for seed in (1, 7, 42, 105):
            for dealer in range(4):
                response = await page.request.post(url+'api/new-round', data={'seed':seed,'dealer':dealer})
                initial = (await response.json())['table']
                await page.goto(url+'local.html')
                await page.wait_for_selector('canvas.cuboid-sprite')
                await wall_snapshot(page, initial)
                await page.locator('.dock-seat [data-action-key="ROLL_DICE:"]').click()
                await page.wait_for_function("()=>table.phase!=='ROLLING_DICE'")
                response = await page.request.get(url+'api/table')
                dealt = (await response.json())['table']
                assert not dealt['gold_indicator']['drawn']
                await wall_snapshot(page, dealt)
                assert len(await page.locator('[data-cuboid-kind="wall"]').all()) == 83
                before = await page.evaluate('MahjongCuboid.diagnostics().rasterized')
                await page.evaluate('render()')
                assert before == await page.evaluate('MahjongCuboid.diagnostics().rasterized')
                for _ in range(2):
                    await page.locator('[data-view-toggle]').click()
                    await wall_snapshot(page, dealt)
                # Renderer consumes sanitized server views; hidden opponents cannot acquire a face.
                hidden = await page.evaluate("""()=>{const t=structuredClone(table);for(const [s,p] of Object.entries(t.players))if(Number(s)!==dockSeat){p.concealed_count=p.concealed_tiles.length;delete p.concealed_tiles;}acceptTable(t,{initial:true});return dockSeat;}""")
                assert await page.locator(f'[data-hand=true]:not([data-cuboid-seat="{hidden}"]):not([data-tile-face=""])').count() == 0
                print('wall/view/hidden', seed, dealer, flush=True)
        # Simulate the recovery event explicitly; this is not a hardware GPU-loss test.
        before=await page.evaluate('MahjongCuboid.diagnostics().restoreCount')
        await page.locator('canvas.cuboid-sprite').first.evaluate("n=>n.dispatchEvent(new Event('contextrestored'))")
        await page.wait_for_function('(n)=>MahjongCuboid.diagnostics().restoreCount===n+1',arg=before)
        for i in range(24):
            await page.locator('[data-view-toggle]').click()
            diag=await page.evaluate('MahjongCuboid.diagnostics()')
            assert diag['cacheBytes']<=diag['staticLimit'] and diag['bodyBytes']<=diag['bodyLimit']
            assert diag['liveBytes']<16*1024*1024
        assert not errors, errors
        await browser.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chromium', default='/usr/bin/chromium')
    asyncio.run(run(parser.parse_args()))
