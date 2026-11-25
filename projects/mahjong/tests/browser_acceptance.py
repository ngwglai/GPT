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
from mahjong.core.player import MeldType
from mahjong.game.debug import PlayerFixture, build_fixture
from mahjong.solver.thirteen_orphans import ORPHANS
from tests.helpers import E, N, S, W, set_next
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


def pickup_toggle(page, seat):
    return page.locator(f'[data-orphan-pickup="{int(seat)}"]')


async def assert_wall_action_layout(page, seat):
    """The action targets match the wall height and never cover dock controls."""
    wall = page.locator(f'.cuboid-sprite[data-wall-seat="{int(seat)}"]')
    wall_boxes = await wall.evaluate_all("""nodes => nodes.map(node => {
        const rect = node.getBoundingClientRect();
        return {x: rect.x, y: rect.y, width: rect.width, height: rect.height};
    })""")
    assert wall_boxes, f"no rendered wall sprites for seat {seat}"
    wall_top = min(box["y"] for box in wall_boxes)
    wall_bottom = max(box["y"] + box["height"] for box in wall_boxes)
    wall_height = wall_bottom - wall_top

    actions = page.locator(
        f'#seat-{int(seat)}.dock-seat .decision-row .action-area .action-btn'
    )
    tools = page.locator(
        f'#seat-{int(seat)}.dock-seat .dock-tools :is(button, summary)'
    )
    action_boxes = []
    for index in range(await actions.count()):
        box = await actions.nth(index).bounding_box()
        if box:
            action_boxes.append((index, box))
            tolerance = max(2, wall_height * 0.03)
            assert abs(box["height"] - wall_height) <= tolerance, (
                seat, index, box["height"], wall_height
            )

    tool_boxes = []
    for index in range(await tools.count()):
        if not await tools.nth(index).is_visible():
            continue
        box = await tools.nth(index).bounding_box()
        if box:
            tool_boxes.append((index, box))

    for action_index, action in action_boxes:
        for tool_index, tool in tool_boxes:
            overlap_x = min(
                action["x"] + action["width"], tool["x"] + tool["width"]
            ) - max(action["x"], tool["x"])
            overlap_y = min(
                action["y"] + action["height"], tool["y"] + tool["height"]
            ) - max(action["y"], tool["y"])
            assert overlap_x <= 1 or overlap_y <= 1, (
                "action target overlaps dock control",
                seat, action_index, tool_index, action, tool,
            )


def ai_toggle(page, seat):
    return page.locator(f'[data-ai-toggle="{int(seat)}"]')


async def play_action(page, seat, action, select_tile=False):
    if select_tile:
        await page.locator(f'#seat-{int(seat)} [data-tile="{action.tile_ids[0]}"]').click()
    button = action_button(page, seat, action.type.name, action.tile_ids)
    group = button.locator("xpath=ancestor::details[@class='action-family']")
    if await group.count() and await group.get_attribute("open") is None:
        await group.locator("summary").click()
    await button.click()


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


async def capture(page, output, name, full_page=True):
    if output:
        await page.evaluate("window.scrollTo(0, 0)")
        await page.screenshot(path=output / f"{name}.png", full_page=full_page, animations="disabled")


async def capture_actions(page, output, seat, name):
    if output:
        await page.locator(f"#seat-{int(seat)} .action-area").screenshot(path=output / f"action-{name}.png",
                                                                      animations="disabled")


async def fits(page):
    assert await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth"), page.url


async def local_cases(page, app, url, output):
    dialogs = []

    async def on_dialog(dialog):
        dialogs.append(dialog.type)
        await dialog.dismiss()

    page.on("dialog", on_dialog)
    await page.goto(url)
    await expect(page.get_by_role("heading", name="青雀麻将")).to_be_visible()
    await capture(page, output, "01-home")
    await page.get_by_role("link", name="单机练习", exact=True).click()
    await expect(page).to_have_url(f"{url}local.html")
    await page.set_viewport_size({"width": 1366, "height": 768})
    await expect(action_button(page, E, "ROLL_DICE")).to_be_visible()
    await capture(page, output, "03-local-dice")
    await capture_actions(page, output, E, "dice")
    assert await page.locator(".cuboid-sprite[data-cuboid-kind=wall]").count() == 136
    await page.locator(".top-details").first.locator("summary").click()
    await page.locator("#seedInput").fill("42")
    await page.locator("#dealerSelect").select_option("0")
    await page.locator("#resetMatchBtn").click()
    await expect(page.locator(".top-details").first).not_to_have_attribute("open", "")
    await action_button(page, E, "ROLL_DICE").click()
    await expect(page.locator(".hand [data-tile]")).to_have_count(53)
    await expect(page.locator(".cuboid-gold img")).to_be_visible()
    await page.wait_for_function("MahjongPresentation.audio.bgm?.paused === false")
    await capture(page, output, "04-local-dealt")

    engine = app[LOCAL].engine
    orphan = next(a for a in engine.legal_actions(E)
                  if a.type == ActionType.DISCARD and a.tile_ids[0] // 4 in ORPHANS)
    await play_action(page, E, orphan, select_tile=True)
    await expect(page.locator(".table-details")).to_contain_text("revision 2")
    await expect(page.locator('[data-action-key^="PICK_ORPHAN:"]')).to_have_count(0)
    await expect(page.locator(".claim-message")).not_to_be_visible()
    assert not dialogs

    await page.locator("#newRoundBtn").click()
    await expect(action_button(page, E, "ROLL_DICE")).to_be_visible()
    await page.locator('[data-view-seat="1"]').click()
    await pickup_toggle(page, S).click()
    await expect(pickup_toggle(page, S)).to_have_attribute("aria-pressed", "true")
    await expect(page.locator("#seat-1 .orphan-ready")).to_be_visible()
    await page.reload()
    await expect(pickup_toggle(page, S)).to_have_attribute("aria-pressed", "true")
    await action_button(page, E, "ROLL_DICE").click()
    await expect(page.locator(".hand [data-tile]")).to_have_count(53)
    engine = app[LOCAL].engine
    await page.set_viewport_size({"width": 844, "height": 390})
    await play_action(page, E, orphan, select_tile=True)
    await expect(page.locator(".claim-message")).to_contain_text("等待响应")
    await expect(page.locator("#timeoutBtn")).to_be_visible()
    view = page.locator("[data-view-toggle]")
    await view.click()
    await expect(view).to_have_attribute("aria-pressed", "true")
    await view.click()
    await expect(view).to_have_attribute("aria-pressed", "false")
    await page.set_viewport_size({"width": 1366, "height": 768})
    await expect(action_button(page, S, "PICK_ORPHAN")).to_contain_text("锁定十三幺")
    await action_button(page, S, "PICK_ORPHAN").click()
    await expect(page.locator(".table-details")).to_contain_text("revision 3")
    if await page.locator("#timeoutBtn").is_visible():
        await page.locator("#timeoutBtn").click()
    await expect(page.locator("#seat-1 .orphans-row .tile")).to_have_count(1)
    await expect(page.locator("#seat-1 .orphan-locked")).to_be_visible()
    await expect(pickup_toggle(page, S)).to_have_count(0)
    assert not dialogs
    assert await page.locator("#seat-1 .orphans-row [data-tile]").count() == 0
    await capture(page, output, "07-orphan-pickup")
    for width, height in ((1920, 1080), (1366, 768), (1024, 768), (390, 844)):
        await page.set_viewport_size({"width": width, "height": height})
        await fits(page)
        await expect(page.locator(".cuboid-scene")).to_be_visible()
        tile = await page.locator("#seat-1 .hand button").first.bounding_box()
        assert tile and tile["width"] >= 20 and tile["height"] >= 26, (width, height, tile)
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
    await expect(page.locator("#seat-1 .orphan-locked")).to_be_visible()
    await expect(pickup_toggle(page, S)).to_have_count(0)
    await page.locator(".sound-settings summary").click()
    await expect(page.locator("#bgmVolume")).to_have_value("0.2")
    for checkbox in ("bgmEnabled", "sfxEnabled", "voiceEnabled"):
        await expect(page.locator(f"#{checkbox}")).not_to_be_checked()

    await page.set_viewport_size({"width": 1366, "height": 768})
    fixture(engine, {E: PlayerFixture(WAIT + [33], last_draw_type=33)}, gold=33)
    await page.reload()
    shelf = next(a for a in engine.legal_actions(E) if a.type == ActionType.SHELVE_GOLD)
    await page.locator(f'#seat-0 [data-tile="{shelf.tile_ids[0]}"]').click()
    await capture_actions(page, output, E, "shelf")
    await play_action(page, E, shelf)
    await expect(page.locator(".cuboid-sprite[data-cuboid-kind=shelf]")).to_be_visible()
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

    # A locked thirteen-orphans seat can have a long wait list, pickup and gold rows at once.
    orphans = sorted(ORPHANS)
    fixture(engine, {E: PlayerFixture(orphans[8:], picked_orphans=orphans[:8],
                                      declared=True, shelves=1)}, gold=4)
    set_next(engine, 31)
    engine._draw_for(E)
    await page.set_viewport_size({"width": 390, "height": 844})
    await page.reload()
    dock = page.locator(".dock-seat")
    await expect(dock.locator(".wait-choice")).to_have_count(14)
    waits = dock.locator(".wait-choices")
    await waits.locator(".wait-choice").last.scroll_into_view_if_needed()
    hu = action_button(page, E, "HU")
    bounds = await hu.bounding_box()
    assert bounds and bounds["y"] + bounds["height"] <= 844, bounds
    await capture(page, output, "17-phone-many-waits", full_page=False)
    await hu.click()
    await expect(page.locator(".result-box.win")).to_be_visible()

    await page.set_viewport_size({"width": 1366, "height": 768})
    app[LOCAL].new_round(seed=42)
    await page.reload()
    await expect(action_button(page, E, "ROLL_DICE")).to_be_visible()
    await page.locator("#controlMenu summary").click()
    await page.locator('[data-ai-all="normal"]').click()
    await expect(page.locator(".ai-badge")).to_have_count(4)
    await expect(action_button(page, E, "ROLL_DICE")).to_have_count(0)
    await page.locator('[data-view-seat="0"]').click()
    await page.locator("#seat-0 .player-inspector summary").first.click()
    await expect(page.locator("#seat-0 .ai-record summary")).to_be_visible()
    await capture(page, output, "14-all-controls")
    await page.locator("#controlMenu summary").click()
    await page.locator('[data-ai-all="human"]').click()
    await expect(page.locator(".ai-badge")).to_have_count(0)
    paused_revision = app[LOCAL].engine.state.revision
    await asyncio.sleep(.55)
    assert app[LOCAL].engine.state.revision == paused_revision


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
        for viewer, page in enumerate(pages):
            await expect(page.locator(".cuboid-sprite[data-cuboid-kind=wall]")).to_have_count(136)
            directions = await page.locator('.cuboid-sprite[data-cuboid-kind=wall][data-wall-layer="top"]').evaluate_all("""(tiles, viewer) => {
                const coordinate = (seat, column) => {
                    const node = tiles.find(t => Number(t.dataset.wallSeat) === seat &&
                        Number(t.dataset.wallColumn) === column);
                    return [Number(node.dataset.worldX), -Number(node.dataset.worldY)];
                };
                return [0, 1, 2, 3].map(offset => {
                    const seat = (viewer + offset) % 4;
                    const first = coordinate(seat, 0);
                    return coordinate(seat, 16).map((number, axis) => Math.sign(number - first[axis]));
                });
            }""", viewer)
            assert directions == [[1, 0], [0, -1], [-1, 0], [0, 1]], (viewer, directions)
            # Use the rendered positions, independent of CSS direction labels.
            centers = []
            for offset in range(4):
                seat = (viewer + offset) % 4
                middle = page.locator(f'[data-wall-seat="{seat}"][data-wall-column="8"][data-wall-layer="top"]')
                box = await middle.bounding_box()
                assert box is not None
                centers.append((box["x"] + box["width"] / 2, box["y"] + box["height"] / 2))
            bottom, right, top, left = centers
            assert left[0] < bottom[0] < right[0], (viewer, centers)
            assert top[1] < right[1] < bottom[1], (viewer, centers)
            for seat in range(4):
                start = await page.locator(f'[data-wall-seat="{seat}"][data-wall-column="0"][data-wall-layer="top"]').bounding_box()
                next_side = (seat - 1) % 4
                successor = await page.locator(f'[data-wall-seat="{next_side}"][data-wall-column="16"][data-wall-layer="top"]').bounding_box()
                wrong_side = (seat + 1) % 4
                wrong = await page.locator(f'[data-wall-seat="{wrong_side}"][data-wall-column="16"][data-wall-layer="top"]').bounding_box()
                def distance(a, b):
                    return sum((a[axis] + a[size]/2 - b[axis] - b[size]/2)**2
                               for axis, size in (("x", "width"), ("y", "height")))
                assert distance(start, successor) < distance(start, wrong)/4, (viewer, seat)

        await action_button(host, E, "ROLL_DICE").click()
        for viewer, page in enumerate(pages):
            await expect(page.locator(".cuboid-scene")).to_be_visible()
            await expect(page.locator(".cuboid-gold img")).to_be_visible()
            await expect(page.locator(".my-seat")).to_have_attribute("id", f"seat-{viewer}")
            await expect(page.locator(".player.south")).to_have_attribute("id", f"seat-{viewer}")
            await expect(page.locator(".player:not(.my-seat) .hand [data-tile]")).to_have_count(0)
            await expect(page.locator(".player:not(.my-seat) .hand .tile-back")).to_have_count(39 if viewer == 0 else 40)
            await expect(page.locator('.cuboid-sprite[data-hand="true"][data-tile-face=""]')).to_have_count(39 if viewer == 0 else 40)
            assert "Seed" not in await page.locator("#center").text_content()
            await expect(page.locator('[data-orphan-pickup]')).to_have_count(1)
            await expect(pickup_toggle(page, viewer)).to_have_attribute("aria-pressed", "false")
            await fits(page)
        await capture(host, output, "05-lan-dealt")
        await capture(pages[3], output, "05-lan-wide", full_page=False)
        phone = pages[1]
        await capture(phone, output, "09-lan-phone", full_page=False)
        dock = await phone.locator(".dock-seat").bounding_box()
        assert dock and dock["y"] >= -1 and dock["y"] + dock["height"] <= 845
        await phone.locator("#focusHand").tap()
        await expect(phone.locator("[data-ai-toggle]")).to_have_count(1)
        await ai_toggle(phone, S).tap()
        await expect(ai_toggle(phone, S)).to_have_attribute("aria-pressed", "true")
        await expect(phone.locator("#seat-1")).to_have_class(re.compile(r"\bevent-control\b"))
        await expect(host.locator("#seat-1 .ai-badge")).to_contain_text("AI 托管")
        await expect(host.locator("#seat-1 .ai-record")).to_have_count(0)
        await capture(phone, output, "14-phone-ai", full_page=False)
        await ai_toggle(phone, S).tap()
        await expect(host.locator("#seat-1 .ai-badge")).to_have_count(0)

        room = app[ROOMS][code]
        move = next(action for action in room.table.engine.legal_actions(E)
                    if action.type == ActionType.DISCARD)
        await play_action(host, E, move, select_tile=True)
        for page in pages:
            await expect(page.locator(".table-details")).to_contain_text("revision 2")

        await pickup_toggle(pages[2], W).click()
        await expect(pickup_toggle(pages[2], W)).to_have_attribute("aria-pressed", "true")
        await expect(host.locator("#seat-2 .orphan-ready")).to_have_count(0)
        await pages[2].evaluate("window.acceptanceSocket.close()")
        await expect(host.locator("#seat-2 .badge.offline")).to_be_visible()
        await expect(pages[2].locator("#connectionStatus")).to_contain_text("已连接")
        await pages[2].reload()
        await expect(pages[2].locator("#seat-2.my-seat button[data-tile]").first).to_be_visible()
        await expect(pickup_toggle(pages[2], W)).to_have_attribute("aria-pressed", "true")
        await expect(host.locator("#seat-2 .badge.online")).to_be_visible()
        pages[2].once("dialog", lambda dialog: dialog.accept())
        await pages[2].locator("#leaveRoom").click()
        await expect(pages[2].locator("#resumeRoom")).to_be_visible()
        await expect(host.locator("#seat-2 .badge.offline")).to_be_visible()
        await pages[2].locator("#resumeRoom").click()
        await expect(pages[2].locator("#seat-2.my-seat")).to_be_visible()

        await room_fixture(room, {
            S: PlayerFixture([1, 2]), W: PlayerFixture([6], orphan_pickup_enabled=True),
        }, gold=4, discard=(E, 0))
        await expect(action_button(phone, S, "CHI")).to_be_enabled()
        await expect(action_button(phone, S, "PICK_ORPHAN")).to_have_count(0)
        await pickup_toggle(phone, S).tap()
        await expect(phone.locator('[data-action-key="PICK_ORPHAN:"]')).to_have_count(1)
        await expect(action_button(phone, S, "CHI")).to_be_enabled()
        await expect(action_button(phone, S, "PASS")).to_be_enabled()
        await expect(host.locator("#seat-1 .orphan-ready")).to_have_count(0)
        # Check wall-height matching and non-overlap on portrait, landscape and desktop.
        for width, height in ((390, 844), (844, 390), (1366, 768)):
            await phone.set_viewport_size({"width": width, "height": height})
            await phone.evaluate(
                "() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))"
            )
            await assert_wall_action_layout(phone, S)
        await phone.set_viewport_size({"width": 390, "height": 844})
        await phone.evaluate(
            "() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))"
        )
        bounds = await action_button(phone, S, "PICK_ORPHAN").bounding_box()
        assert bounds and bounds["height"] >= 9 and 0 <= bounds["x"] <= bounds["x"] + bounds["width"] <= 390
        await fits(phone)
        await capture(phone, output, "12-phone-orphan-ready")
        await capture_actions(phone, output, S, "orphan")
        await pickup_toggle(phone, S).tap()
        await expect(action_button(phone, S, "PICK_ORPHAN")).to_have_count(0)
        await expect(action_button(phone, S, "CHI")).to_be_enabled()
        await pickup_toggle(phone, S).tap()
        await action_button(phone, S, "PICK_ORPHAN").tap()
        await expect(action_button(phone, S, "PICK_ORPHAN")).to_have_count(0)
        await action_button(pages[2], W, "PASS").click()
        for page in pages:
            await expect(page.locator("#seat-1 .orphan-locked")).to_be_visible()
            await expect(page.locator("#seat-1 .orphans-row .tile")).to_have_count(1)
        await expect(pickup_toggle(phone, S)).to_have_count(0)
        await capture(phone, output, "13-phone-orphan-locked")
        await phone.reload()
        await expect(phone.locator("#seat-1 .orphan-locked")).to_be_visible()
        await expect(pickup_toggle(phone, S)).to_have_count(0)

        await room_fixture(room, {E: PlayerFixture(WAIT+[7], last_draw_type=7), S: PlayerFixture([31])},
                           gold=33, indicator_type=19)
        await expect(host.locator("#seat-0 .hand button.drawn")).to_be_enabled()
        ting = next(a for a in room.table.engine.legal_actions(E)
                    if a.type == ActionType.DECLARE_TING and a.tile_ids[0] // 4 == 7)
        await host.locator(f'#seat-0 [data-tile="{ting.tile_ids[0]}"]').click()
        await capture_actions(host, output, E, "ting")
        await play_action(host, E, ting)
        await expect(host.locator('.cuboid-sprite[data-motion="ting-0-0"]:not([data-tile-face=""])')).to_be_visible()
        hint = host.locator("#seat-0 .wait-hint")
        await expect(hint.locator('img[alt="中"]')).to_be_visible()
        red_dragon = hint.locator(".wait-choice").filter(has=host.get_by_alt_text("中", exact=True))
        await expect(red_dragon).to_contain_text("3 张")
        await expect(hint).to_contain_text("需上金")
        for page in pages[1:]:
            await expect(page.locator('.cuboid-sprite[data-motion="ting-0-0"][data-tile-face=""]')).to_be_visible()
            await expect(page.locator('.cuboid-sprite[data-motion="ting-0-0"]')).to_have_attribute("data-tile-face", "")
            await expect(page.locator("#seat-0 .wait-hint")).to_have_count(0)
            assert await page.locator("#seat-0 .ting-row img").get_attribute("src") == "/assets/tiles/back.svg"
        discard = next(a for a in room.table.engine.legal_actions(S)
                       if a.type == ActionType.DISCARD and a.tile_ids[0] // 4 == 31)
        await play_action(phone, S, discard, select_tile=True)
        await expect(red_dragon).to_contain_text("2 张")
        await capture(host, output, "15-wait-hint")
        await room_fixture(room, {E: PlayerFixture(WAIT, declared=True),
                                  S: PlayerFixture(melds=[(MeldType.PENG, [31] * 3, W)])},
                           gold=33, indicator_type=19)
        await expect(red_dragon).to_have_class(re.compile(r"\bexhausted\b"))
        await expect(red_dragon).to_contain_text("已见完")

        await room_fixture(room, {
            S: PlayerFixture([0, 1]), W: PlayerFixture([2, 2]),
            N: PlayerFixture([3, 4, 5, 9, 10, 11, 18, 19, 20, 27, 27, 27, 2], declared=True),
        }, gold=33, discard=(E, 2))
        for page, seat, kind in zip(pages[1:], (S, W, N), ("CHI", "PENG", "HU")):
            await expect(action_button(page, seat, kind)).to_be_enabled()
            await expect(action_button(page, seat, "PASS")).to_be_enabled()
            await fits(page)
            await capture(page, output, f"06-lan-response-{kind.lower()}")
            await capture_actions(page, output, seat, kind.lower())
        await action_button(pages[3], N, "HU").click()
        await action_button(pages[2], W, "PENG").click()
        await action_button(pages[1], S, "CHI").tap()
        for page in pages:
            await expect(page.locator(".result-box.win")).to_contain_text("北家荣胡")
        await capture(host, output, "08-lan-win")
        await host.locator("#nextRound").click()
        await expect(action_button(pages[1], S, "ROLL_DICE")).to_be_visible()
        await expect(host.locator("#tableHud")).to_contain_text("第 2 局")
        await expect(host.locator(".previous-round")).to_contain_text("上局")

        await room_fixture(room, {S: PlayerFixture([0, 0, 0, 9, 10, 11, 18, 19, 20, 27, 27, 27, 31], declared=True)}, gold=33, discard=(E, 0))
        await expect(action_button(pages[1], S, "MING_GANG")).to_be_enabled()
        await capture(pages[1], output, "06-lan-response-gang")
        await capture_actions(pages[1], output, S, "gang")
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
    await page.wait_for_function("()=>Array.from(document.images).every(i => i.complete && i.naturalWidth > 0)")
    await capture(page, output, "10-gallery")
    if output:
        await page.set_viewport_size({"width": 800, "height": 1100})
        await page.add_style_tag(content=".gallery-page .topbar { position: static }")
        await page.locator("#tiles").screenshot(path=output / "16-tiles-overview.png", animations="disabled")
    await page.set_viewport_size({"width": 390, "height": 844})
    await fits(page)
    await page.route("**/assets/tiles/*.svg", lambda route: route.abort())
    await page.reload()
    await expect(page.locator("#catalog figure .tile-image-fallback").first).to_be_visible()
    await page.route("**/assets/manifest.json", lambda route: route.fulfill(status=404))
    await page.goto(f"{url}local.html")
    await expect(page.locator("#center .cuboid-scene")).to_be_visible()
    await action_button(page, E, "ROLL_DICE").click()
    assert await page.evaluate("MahjongCuboid.diagnostics().missingArt") == 34
    await expect(page.locator("canvas.cuboid-sprite").first).to_be_visible()
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
        print("PASS local: dice, discard, pickup, gold, hu, draw, next round, AI autoplay/pause, responsive layout and sound", flush=True)
        await lan_cases(browser, app, url, args.screenshots, watch)
        print("PASS LAN: four sessions, mobile takeover, private wait counts, reconnect/leave, chi/peng/hu/gang, next round", flush=True)
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
