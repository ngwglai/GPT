"""Focused browser acceptance for the confirmed scoring system."""
import argparse
import asyncio
from playwright.async_api import async_playwright, expect
from lan_server import LOCAL, ROOMS, create_app
from mahjong.game.debug import PlayerFixture
from tests.browser_acceptance import serve, fixture, action_button
from tests.helpers import E
from tests.test_gold import WAIT


async def run(chromium):
    app = create_app(seed=42)
    async with serve(app) as url, async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=chromium)
        page = await browser.new_page(viewport={'width':1366,'height':768})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto(url+'local.html')
        await expect(action_button(page,E,'ROLL_DICE')).to_be_visible(timeout=20000)
        await page.locator('.top-details').first.locator('summary').click()
        await page.locator('#baseScoreSelect').select_option('5')
        await page.locator('#resetMatchBtn').click()
        await expect(page.locator('#baseScoreSelect')).to_have_value('5')
        await expect(page.locator('.top-details').first).not_to_have_attribute('open','')
        assert app[LOCAL].scoring_view()['base_score'] == 5
        fixture(app[LOCAL].engine,{E:PlayerFixture(WAIT+[31],declared=True,last_draw_type=31,shelves=1)},gold=33)
        await page.reload()
        await action_button(page,E,'HU').click(timeout=20000)
        await expect(page.locator('.result-deltas')).to_contain_text('+75')
        await expect(page.locator('.result-deltas')).to_contain_text('-25')
        await page.locator('.table-details summary').click()
        await expect(page.locator('.score-detail')).to_be_visible()
        await expect(page.locator('.score-detail tbody tr')).to_have_count(3)
        await expect(page.locator('.score-detail')).to_contain_text('基础分 5')
        await page.locator('.table-details summary').click()
        for width,height in ((844,390),(390,844)):
            await page.set_viewport_size({'width':width,'height':height})
            await expect(page.locator('.result-deltas')).to_be_visible()
            assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        await page.locator('#newRoundBtn').click()
        await expect(action_button(page,E,'ROLL_DICE')).to_be_visible()
        assert app[LOCAL].scoring_view()['totals'] == {'0':'75','1':'-25','2':'-25','3':'-25'}
        assert app[LOCAL].scoring_view()['base_score'] == 5
        for width,height in ((1366,768),(390,844)):
            room_page = await browser.new_page(viewport={'width':width,'height':height})
            room_page.on('pageerror',lambda e: errors.append(str(e)))
            await room_page.goto(url+'lan.html')
            await room_page.locator('#nickname').fill('测试玩家')
            await room_page.locator('#roomBaseScore').select_option('5')
            await room_page.locator('#createRoom').click()
            await expect(room_page.locator('#roomScoreMode')).to_have_text('基础分：5 分')
            assert await room_page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            assert all(room.base_score == 5 for room in app[ROOMS].values())
            await room_page.close()
        assert not errors, errors
        await browser.close()
    print('PASS browser: local 5-point selection, HU, itemized payments, next round, 2 mobile views, LAN room selection (desktop/mobile)')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--chromium')
    asyncio.run(run(parser.parse_args().chromium))
