"""Chromium acceptance of actual pages, local HTTP actions and four LAN sessions."""

import argparse
import asyncio
import re
from contextlib import asynccontextmanager
from pathlib import Path

from aiohttp import web
from playwright.async_api import async_playwright, expect

from lan_server import LOCAL, ROOMS, create_app
from mahjong import ActionType
from mahjong.game.debug import PlayerFixture, build_fixture
from mahjong.solver.thirteen_orphans import ORPHANS
from tests.helpers import E, N, S, W
from tests.test_gold import WAIT
from web_server import PLAYER_IDS


@asynccontextmanager
async def serve(app):
    # Match the normal server's handler lifecycle for WS disconnect broadcasts.
    runner = web.AppRunner(app)
    await runner.setup()
    try:
        await web.TCPSite(runner, "127.0.0.1", 0).start()
        host, port = runner.addresses[0][:2]
        yield f"http://{host}:{port}/"
    finally:
        await runner.cleanup()


def action_button(page, seat, kind, tile_ids=None):
    key = f"{kind}:"
    if tile_ids is not None:
        key += ",".join(map(str, tile_ids))
    return page.locator(f'#seat-{int(seat)} [data-action-key^="{key}"]').first


async def play_action(page, seat, action, select_tile=False):
    if select_tile:
        await page.locator(f'#seat-{int(seat)} [data-tile="{action.tile_ids[0]}"]').click()
    await action_button(page, seat, action.type.name, action.tile_ids).click()


def fixture(engine, players, **kwargs):
    """Install a focused test state directly in the test server, with no debug route."""
    state = build_fixture(engine, players, **kwargs)
    for seat, player in state.players.items():
        player.player_id = PLAYER_IDS[seat]
    return state


async def room_fixture(room, players, **kwargs):
    async with room.lock:
        state = fixture(room.table.engine, players, **kwargs)
        room.touch()
        await room.broadcast()
        return state


async def capture(page, output, name):
    if output:
        await page.screenshot(path=output / f"{name}.png", full_page=True, animations="disabled")


async def fits(page):
    assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), page.url


async def local_cases(page, app, url, output):
    await page.goto(url)
    await expect(page.get_by_role("heading", name="青雀麻将")).to_be_visible()
    await capture(page, output, "01-home")
    await page.get_by_role("link", name="单机练习", exact=True).click()
    await expect(page).to_have_url(f"{url}local.html")
    await page.set_viewport_size({"width": 1366, "height": 768})
    await expect(action_button(page, E, "ROLL_DICE")).to_be_visible()
    await capture(page, output, "03-local-dice")
    assert await page.locator(".wall-layer.present").count() == 136
    await page.locator(".top-details").first.locator("summary").click()
    await page.locator("#seedInput").fill("42")
    await page.locator("#dealerSelect").select_option("0")
    await page.locator("#resetMatchBtn").click()
    await expect(page.locator(".top-details").first).not_to_have_attribute("open", "")
    await action_button(page, E, "ROLL_DICE").click()
    await expect(page.locator(".hand [data-tile]")).to_have_count(53)
    await expect(page.locator(".gold-box .tile.gold")).to_be_visible()
    await page.wait_for_function("MahjongPresentation.audio.bgm?.paused === false")
    await capture(page, output, "04-local-dealt")

    engine = app[LOCAL].engine
    orphan = next(a for a in engine.legal_actions(E)
                  if a.type == ActionType.DISCARD and a.tile_ids[0] // 4 in ORPHANS)
    await play_action(page, E, orphan, select_tile=True)
    await expect(page.locator(".claim-message")).to_contain_text("等待响应")
    await expect(action_button(page, S, "PICK_ORPHAN")).to_contain_text("锁定十三幺")
    await action_button(page, S, "PICK_ORPHAN").click()
    if await page.locator("#timeoutBtn").is_visible():
        await page.locator("#timeoutBtn").click()
    await expect(page.locator("#seat-1 .orphans-row .tile")).to_have_count(1)
    assert await page.locator("#seat-1 .orphans-row [data-tile]").count() == 0
    await capture(page, output, "07-orphan-pickup")
    for width, height in ((1920, 1080), (1366, 768), (1024, 768), (390, 844)):
        await page.set_viewport_size({"width": width, "height": height})
        await fits(page)
        await expect(page.locator(".wall-stage")).to_be_visible()
        tile = await page.locator("#seat-1 .hand button").first.bounding_box()
        assert tile and tile["width"] >= 36 and tile["height"] >= 44, (width, height, tile)
        if width in (1024, 390):
            await capture(page, output, f"09-local-{width}x{height}")

    await page.locator("#focusTurn").click()
    await expect(page.locator("#seat-1")).to_be_focused()
    await page.locator(".sound-settings summary").click()
    panel = page.locator(".sound-panel")
    await expect(panel).to_be_visible()
    bounds = await panel.bounding_box()
    assert bounds and bounds["x"] >= 0 and bounds["x"] + bounds["width"] <= 390
    await page.locator("#bgmEnabled").uncheck()
    await page.locator("#bgmVolume").fill("0.2")
    await page.locator("#sfxEnabled").uncheck()
    await page.locator("#voiceEnabled").uncheck()
    await capture(page, output, "11-phone-settings")
    await page.keyboard.press("Escape")
    await expect(panel).not_to_be_visible()
    await page.reload()
    await page.locator(".sound-settings summary").click()
    await expect(page.locator("#bgmVolume")).to_have_value("0.2")
    for checkbox in ("bgmEnabled", "sfxEnabled", "voiceEnabled"):
        await expect(page.locator(f"#{checkbox}")).not_to_be_checked()

    await page.set_viewport_size({"width": 1366, "height": 768})
    fixture(engine, {E: PlayerFixture(WAIT + [33], last_draw_type=33)}, gold=33)
    await page.reload()
    shelf = next(a for a in engine.legal_actions(E) if a.type == ActionType.SHELVE_GOLD)
    await play_action(page, E, shelf, select_tile=True)
    await expect(page.locator("#seat-0 .shelf-row .tile.gold")).to_be_visible()
    await expect(page.locator("#seat-0 .badge.gold-ok")).to_contain_text("已上金")

    fixture(engine, {E: PlayerFixture(WAIT + [31], declared=True, last_draw_type=31)}, gold=33)
    await page.reload()
    await action_button(page, E, "HU").click()
    await expect(page.locator(".result-box.win")).to_contain_text("胡牌")
    await expect(page.locator(".match-meta")).to_contain_text("累计分")
    await capture(page, output, "08-local-win")
    await page.locator("#newRoundBtn").click()
    await expect(page.locator(".previous-round")).to_contain_text("上局")

    fixture(engine, {E: PlayerFixture(WAIT + [8], last_draw_type=8)}, gold=33, head=122)
    await page.reload()
    discard = next(a for a in engine.legal_actions(E)
                   if a.type == ActionType.DISCARD and a.tile_ids[0] // 4 == 8)
    await play_action(page, E, discard, select_tile=True)
    await expect(page.locator(".result-box.draw")).to_contain_text("本局流局")
    await expect(page.locator(".result-box.draw")).to_contain_text("下局庄家 东家")
    await capture(page, output, "08-local-draw")


async def lan_cases(browser, app, url, output, watch):
    sizes = ((1366, 768), (390, 844), (1024, 768), (1920, 1080))
    contexts = [await browser.new_context(viewport={"width": w, "height": h}, has_touch=w == 390)
                for w, h in sizes]
    try:
        await contexts[2].add_init_script("""
          window.WebSocket = class extends WebSocket {
            constructor(...args) {
              super(...args);
              window.acceptanceSocket = this;
            }
          };
        """)
        pages = [watch(await context.new_page()) for context in contexts]
        host = pages[0]
        await host.goto(url)
        await host.get_by_role("link", name="开启联机").click()
        await expect(host.locator("#joinPanel")).to_be_visible()
        await capture(host, output, "02-lobby-entry")
        for i, (page, name) in enumerate(zip(pages, ("松风", "山茶", "小满", "听雨"))):
            if i:
                await page.goto(f"{url}lan.html")
            await page.locator("#nickname").fill(name)
            if i:
                await page.locator("#roomCode").fill(code)
                await page.locator("#joinRoom").click()
            else:
                await page.locator("#createRoom").click()
            await expect(page.locator("#roomTitle")).to_have_text(re.compile(r"^[A-Z0-9]{6}$"))
            if not i:
                code = await page.locator("#roomTitle").inner_text()
            await page.locator(f'[data-choose-seat="{i}"]').click()
            await expect(page.locator(f'[data-choose-seat="{i}"]')).to_have_class(re.compile(r"\bchosen\b"))
        await expect(host.locator("#startGame")).to_be_enabled()
        await capture(host, output, "02-lobby-seats")
        await host.locator("#startGame").click()
        await action_button(host, E, "ROLL_DICE").click()
        for viewer, page in enumerate(pages):
            await expect(page.locator(".wall-stage")).to_be_visible()
            await expect(page.locator(".gold-box .tile.gold")).to_be_visible()
            await expect(page.locator(".my-seat")).to_have_attribute("id", f"seat-{viewer}")
            await expect(page.locator(".player.south")).to_have_attribute("id", f"seat-{viewer}")
            await expect(page.locator(".player:not(.my-seat) .hand [data-tile]")).to_have_count(0)
            await expect(page.locator(".player:not(.my-seat) .hand .tile-back")).to_have_count(39 if viewer == 0 else 40)
            assert "Seed" not in await page.locator("#center").text_content()
            await fits(page)
        await capture(host, output, "05-lan-dealt")
        await capture(pages[1], output, "09-lan-phone")
        await pages[1].locator("#focusHand").tap()

        room = app[ROOMS][code]
        move = next(action for action in room.table.engine.legal_actions(E)
                    if action.type == ActionType.DISCARD)
        await play_action(host, E, move, select_tile=True)
        for page in pages:
            await expect(page.locator(".table-details")).to_contain_text("revision 2")

        await pages[2].evaluate("window.acceptanceSocket.close()")
        await expect(host.locator("#seat-2 .badge.offline")).to_be_visible()
        await expect(pages[2].locator("#connectionStatus")).to_contain_text("已连接")
        await pages[2].reload()
        await expect(pages[2].locator("#seat-2.my-seat button[data-tile]").first).to_be_visible()
        await expect(host.locator("#seat-2 .badge.online")).to_be_visible()
        pages[2].once("dialog", lambda dialog: dialog.accept())
        await pages[2].locator("#leaveRoom").click()
        await expect(pages[2].locator("#resumeRoom")).to_be_visible()
        await expect(host.locator("#seat-2 .badge.offline")).to_be_visible()
        await pages[2].locator("#resumeRoom").click()
        await expect(pages[2].locator("#seat-2.my-seat")).to_be_visible()

        await room_fixture(room, {E: PlayerFixture(WAIT+[7], last_draw_type=7)}, gold=33)
        await expect(host.locator("#seat-0 .hand button.drawn")).to_be_enabled()
        ting = next(a for a in room.table.engine.legal_actions(E) if a.type == ActionType.DECLARE_TING)
        await play_action(host, E, ting, select_tile=True)
        await expect(host.locator("#seat-0 .ting-row .tile:not(.tile-back)")).to_be_visible()
        for page in pages[1:]:
            await expect(page.locator("#seat-0 .ting-row .tile-back")).to_be_visible()
            assert await page.locator("#seat-0 .ting-row img").get_attribute("src") == "/assets/tiles/back.svg"

        await room_fixture(room, {
            S: PlayerFixture([0, 1]), W: PlayerFixture([2, 2]),
            N: PlayerFixture([3, 4, 5, 9, 10, 11, 18, 19, 20, 27, 27, 27, 2], declared=True),
        }, gold=33, discard=(E, 2))
        for page, seat, kind in zip(pages[1:], (S, W, N), ("CHI", "PENG", "HU")):
            await expect(action_button(page, seat, kind)).to_be_enabled()
            await expect(action_button(page, seat, "PASS")).to_be_enabled()
            await fits(page)
            await capture(page, output, f"06-lan-response-{kind.lower()}")
        await action_button(pages[3], N, "HU").click()
        await action_button(pages[2], W, "PENG").click()
        await action_button(pages[1], S, "CHI").tap()
        for page in pages:
            await expect(page.locator(".result-box.win")).to_contain_text("北家荣胡")
        await capture(host, output, "08-lan-win")
        await host.locator("#nextRound").click()
        await expect(action_button(pages[1], S, "ROLL_DICE")).to_be_visible()
        await expect(host.locator(".status-card")).to_contain_text("第 2 局")
        await expect(host.locator(".previous-round")).to_contain_text("上局")

        await room_fixture(room, {S: PlayerFixture([0, 0, 0, 9, 10, 11, 18, 19, 20, 27, 27, 27, 31], declared=True)}, gold=33, discard=(E, 0))
        await expect(action_button(pages[1], S, "MING_GANG")).to_be_enabled()
        await capture(pages[1], output, "06-lan-response-gang")
        await action_button(pages[1], S, "MING_GANG").tap()
        await expect(host.locator("#seat-1 .meld-row .tile")).to_have_count(4)
    finally:
        for context in contexts:
            await context.close()


async def gallery_and_fallbacks(page, url, output):
    await page.goto(f"{url}asset-gallery.html")
    await expect(page.get_by_role("heading", level=1)).to_have_text("美术图鉴")
    await expect(page.locator("#catalog figure img")).to_have_count(34)
    await expect(page.locator("#diceSamples img")).to_have_count(6)
    await page.wait_for_function("Array.from(document.images).every(i => i.complete && i.naturalWidth > 0)")
    await capture(page, output, "10-gallery")
    await page.set_viewport_size({"width": 390, "height": 844})
    await fits(page)
    await page.route("**/assets/tiles/*.svg", lambda route: route.abort())
    await page.reload()
    await expect(page.locator("#catalog figure .tile-image-fallback").first).to_be_visible()
    await page.route("**/assets/manifest.json", lambda route: route.fulfill(status=404))
    await page.goto(f"{url}local.html")
    await expect(page.locator("#center .wall-stage")).to_be_visible()
    await action_button(page, E, "ROLL_DICE").click()
    await expect(page.locator(".hand .tile-image-fallback").first).to_be_visible()
    await fits(page)


async def run(args):
    errors = []

    def watch(page):
        page.on("pageerror", lambda error: errors.append(str(error)))
        return page

    if args.screenshots:
        args.screenshots.mkdir(parents=True, exist_ok=True)
    app = create_app(seed=42)
    async with serve(app) as url, async_playwright() as playwright:
        browser = await playwright.chromium.launch(executable_path=args.chromium)
        page = watch(await browser.new_page(viewport={"width": 1920, "height": 1080}))
        await local_cases(page, app, url, args.screenshots)
        print("PASS local: dice, deal, discard, pickup, gold, hu, draw, next round, responsive layout and sound settings", flush=True)
        await lan_cases(browser, app, url, args.screenshots, watch)
        print("PASS LAN: four browser sessions, room seats, privacy, drop/reconnect/leave, ting, chi/peng/hu/gang, next round", flush=True)
        await page.set_viewport_size({"width": 1366, "height": 768})
        app[LOCAL].new_round(seed=42)
        await gallery_and_fallbacks(page, url, args.screenshots)
        assert not errors, errors
        await browser.close()
    print("PASS gallery: 34 faces, six dice, two asset failure cases, no uncaught page errors")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", help="use an installed Chromium instead of the Playwright binary")
    parser.add_argument("--screenshots", type=Path, help="optional directory for acceptance screenshots")
    asyncio.run(run(parser.parse_args()))
