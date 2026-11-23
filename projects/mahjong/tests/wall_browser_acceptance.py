"""Verify physical wall positions and real animation origins in Chromium."""

import argparse
import asyncio
import math
import re
from pathlib import Path

from playwright.async_api import async_playwright, expect

from lan_server import LOCAL, create_app
from mahjong import ActionType, Seat
from mahjong.core.wall import Layer, WallPosition
from mahjong.game.debug import PlayerFixture
from tests.browser_acceptance import action_button, fixture, play_action, serve
from tests.helpers import E, N, S, W
from tests.test_wall import PHYSICAL_PATH
from web_server import PLAYER_IDS


WIND = {E: "east", S: "south", W: "west", N: "north"}
WALL_FLIGHTS = """() => {
  window.wallFlights = [];
  window.pauseWallTravel = null;
  new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      const type = node.dataset?.travel;
      if (type !== 'TILE_DRAWN' && type !== 'GOLD_INDICATOR_REVEALED') continue;
      const animation = node.getAnimations()[0];
      const first = new DOMMatrix(animation.effect.getKeyframes()[0].transform);
      const dimension = name => Number.parseFloat(node.style[name]);
      window.wallFlights.push({
        type, x:dimension('left') + dimension('width') / 2 + first.m41,
        y:dimension('top') + dimension('height') / 2 + first.m42,
      });
      if (type === window.pauseWallTravel) {
        window.pauseWallTravel = null;
        animation.pause();
        animation.currentTime = animation.effect.getTiming().delay + 90;
        window.wallFlight = animation;
      }
    }
  }).observe(document.body, {childList:true});
}"""


def at(side, column, layer=Layer.TOP):
    return WallPosition(side, column, layer)


def wall_tile(page, position):
    return page.locator(f'[data-wall-seat="{int(position.side)}"][data-wall-column="{position.column}"]'
                        f'[data-wall-layer="{position.layer.name.lower()}"]')


def public(position):
    return {"side": int(position.side), "column": position.column, "layer": int(position.layer)}


def clockwise_from(position):
    index = PHYSICAL_PATH.index(position)
    return PHYSICAL_PATH[index:] + PHYSICAL_PATH[:index]


async def ready(page, url):
    await page.goto(f"{url}local.html")
    await expect(page.locator(".wall-stage")).to_be_visible()
    await page.evaluate(WALL_FLIGHTS)


async def source_center(page, position):
    bounds = await wall_tile(page, position).locator(".tile-top").bounding_box()
    assert bounds, position
    return bounds["x"] + bounds["width"] / 2, bounds["y"] + bounds["height"] / 2


async def stage_shot(page, output, name):
    if output:
        await page.locator(".wall-stage").screenshot(path=output / f"{name}.png")


async def check_flight(page, kind, center, *, output=None, name=None):
    await page.wait_for_function("window.wallFlights.length > 0")
    flight = await page.evaluate("window.wallFlights.shift()")
    assert flight["type"] == kind, flight
    assert math.dist((flight["x"], flight["y"]), center) < 1, (center, flight)
    if output:
        await stage_shot(page, output, name)
        await page.evaluate("window.wallFlight.play()")
    await expect(page.locator(f'[data-travel="{kind}"]')).to_have_count(0)


async def capture_flight(page, kind, output):
    if output:
        await page.evaluate("kind => window.pauseWallTravel = kind", kind)


async def check_dice(page, table, url, output):
    cases = [
        (E, (1, 1), at(S, 15), at(E, 0)),
        (E, (1, 4), at(W, 15), at(S, 3)),
        (S, (3, 6), at(N, 13), at(W, 5)),
        (N, (6, 6), at(W, 10), at(S, 5)),
    ]
    for index, (dealer, dice, opening, indicator) in enumerate(cases, start=1):
        table.new_round(seed=index, dealer=dealer)
        engine = table.engine
        engine.state = None
        engine.start_round(PLAYER_IDS, dealer, dice=dice, seed=index, manual_dice_roll=True)
        await ready(page, url)
        await expect(page.locator(".wall-layer")).to_have_count(136)
        await expect(page.locator(".wall-break, .wall-layer.indicator")).to_have_count(0)
        original_geometry = await wall_tile(page, opening).evaluate(
            '(node) => ["--x", "--y", "--yaw"].map(key => node.style.getPropertyValue(key))')
        original_center = await source_center(page, indicator)
        await action_button(page, dealer, "ROLL_DICE").click()
        await expect(page.locator(".wall-layer.present")).to_have_count(83)
        await check_flight(page, "GOLD_INDICATOR_REVEALED", original_center)
        marker = page.locator(f'[data-break-seat="{int(opening.side)}"][data-break-column="{opening.column}"]')
        await expect(marker).to_be_visible()
        assert await marker.evaluate(
            '(node) => ["--x", "--y", "--yaw"].map(key => node.style.getPropertyValue(key))') == original_geometry
        await expect(wall_tile(page, opening)).to_have_count(0)
        view = table.snapshot()
        assert view["wall_view"]["break_position"] == public(opening)
        assert view["gold_indicator"]["position"] == public(indicator)
        await expect(wall_tile(page, indicator)).to_have_class("scene-tile wall-layer present" +
            (" reserved" if sum(dice) <= 7 else "") + " indicator")
        await expect(wall_tile(page, indicator)).to_have_attribute("data-tile-face", str(view["gold_indicator"]["type"]))
        order = clockwise_from(opening)
        assert view["wall_view"]["draw_cursor"] == public(order[53])
        rendered = await page.locator(".wall-layer").evaluate_all("""nodes => nodes.map(({dataset:d}) =>
            [Number(d.wallSeat), Number(d.wallColumn), Number(d.wallLayer === 'bottom')])""")
        assert sorted(rendered) == sorted([int(p.side), p.column, int(p.layer)] for p in order[53:])
        await stage_shot(page, output, f"dice-{index}-{dice[0]}-{dice[1]}")
        print(f"PASS dice {dice}: {dealer.name}, break {opening}, indicator {indicator}", flush=True)


async def draw_from(page, table, action, position, *, source, output=None, name=None):
    if action.type in (ActionType.DISCARD, ActionType.SHELVE_GOLD):
        await page.locator(f'#seat-{int(action.seat)} [data-tile="{action.tile_ids[0]}"]').click()
    origin = await source_center(page, position)
    before = table.snapshot()["wall_view"]["tiles_present"]
    await capture_flight(page, "TILE_DRAWN", output)
    await play_action(page, action.seat, action)
    await expect(wall_tile(page, position)).to_have_count(0)
    await expect(page.locator(".wall-layer")).to_have_count(before - 1)
    event = next(ev for ev in reversed(table.snapshot()["presentation_events"]) if ev["type"] == "TILE_DRAWN")
    assert event["payload"] == {"source": source, "position": public(position)}
    await check_flight(page, "TILE_DRAWN", origin, output=output, name=name)


async def check_corners(page, table, url, output):
    # Put the normal cursor before each corner in an otherwise legal discard flow.
    for side in Seat:
        following = Seat((int(side) + 1) % 4)
        dealer = Seat((int(side) + 2) % 4)
        state = fixture(table.engine, {E: PlayerFixture([12], last_draw_type=12)}, dealer=dealer, gold=32, head=30)
        await ready(page, url)
        a, b = at(side, 0), at(following, 16)
        old_end = await wall_tile(page, a).evaluate(
            '(node) => ["--x", "--y"].map(key => parseFloat(node.style.getPropertyValue(key)))')
        next_end = await wall_tile(page, b).evaluate(
            '(node) => ["--x", "--y"].map(key => parseFloat(node.style.getPropertyValue(key)))')
        far_end = await wall_tile(page, at(following, 0)).evaluate(
            '(node) => ["--x", "--y"].map(key => parseFloat(node.style.getPropertyValue(key)))')
        assert math.dist(old_end, next_end) < 80 < math.dist(old_end, far_end)
        for top in (a, b):
            bottom = at(top.side, top.column, Layer.BOTTOM)
            z = "node => parseFloat(node.style.getPropertyValue('--z'))"
            assert await wall_tile(page, top).evaluate(z) > await wall_tile(page, bottom).evaluate(z)
        for position in (a, at(side, 0, Layer.BOTTOM), b, at(following, 16, Layer.BOTTOM)):
            actor = state.current_player
            action = next(a for a in table.engine.legal_actions(actor) if a.type in (ActionType.DISCARD, ActionType.SHELVE_GOLD))
            await expect(wall_tile(page, position)).to_have_class(re.compile(r"\bnormal-cursor\b"))
            capture = output if position == b else None
            await draw_from(page, table, action, position, source="NORMAL", output=capture,
                            name=f"corner-{WIND[side]}-{WIND[following]}")
        print(f"PASS corner {side.name}0 -> {following.name}16, both layers", flush=True)


async def check_gangs(page, table, url, output):
    state = fixture(table.engine, {
        E: PlayerFixture([21] * 4 + [23] * 4 + [16] * 2 + [26] * 4, last_draw_type=26)
    }, gold=32)
    positions = [at(W, 16), at(W, 16, Layer.BOTTOM), at(S, 0), at(S, 0, Layer.BOTTOM)]
    # The first two replacements complete the fourth concealed quad.
    for position in positions[:2]:
        slot = state.wall.get_slot(position)
        donor = next(candidate for candidate in state.wall.slots if not candidate.drawn
                     and candidate.tile.type_id == 16 and candidate.position not in positions)
        slot.tile, donor.tile = donor.tile, slot.tile
    await ready(page, url)
    normal_before = table.snapshot()["wall_view"]["draw_cursor"]
    normal_count = table.snapshot()["normal_tiles_remaining"]
    for index, position in enumerate(positions, start=1):
        await expect(wall_tile(page, position)).to_have_class(re.compile(r"\bgang-cursor\b"))
        action = next(a for a in table.engine.legal_actions(E) if a.type == ActionType.AN_GANG)
        await draw_from(page, table, action, position, source="GANG", output=output, name=f"gang-{index}")
        view = table.snapshot()
        assert view["wall_view"]["draw_cursor"] == normal_before
        assert view["reserved_columns"] == max(7, index + 6)
        assert view["normal_tiles_remaining"] == normal_count - 2 * max(0, index - 1)
    normal = state.wall.normal_draw_cursor
    action = next(a for a in table.engine.legal_actions(E) if a.type == ActionType.DISCARD)
    await draw_from(page, table, action, normal, source="NORMAL")
    print("PASS mixed: four replacement flights from WEST16 TOP/BOTTOM, SOUTH0 TOP/BOTTOM, then a normal flight", flush=True)


async def run(args):
    if args.output:
        args.output.mkdir(parents=True, exist_ok=True)
    app = create_app()
    async with serve(app) as url, async_playwright() as playwright:
        browser = await playwright.chromium.launch(executable_path=args.chromium)
        page = await browser.new_page(viewport={"width": 1480, "height": 980})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        print(f"Chromium {browser.version}", flush=True)
        await check_dice(page, app[LOCAL], url, args.output)
        await check_corners(page, app[LOCAL], url, args.output)
        await check_gangs(page, app[LOCAL], url, args.output)
        assert not errors, errors
        await browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", help="use an installed Chromium instead of the Playwright binary")
    parser.add_argument("--output", type=Path, help="optional directory for screenshots")
    asyncio.run(run(parser.parse_args()))
