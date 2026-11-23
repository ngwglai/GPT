"""Capture and measure the actual 2.5D scene in Chromium using the normal HTTP server."""

import argparse
import asyncio
import json
from pathlib import Path
from statistics import median

from playwright.async_api import async_playwright, expect

from lan_server import LOCAL, create_app
from mahjong import ActionType
from mahjong.core.player import MeldType
from mahjong.core.state import Discard
from mahjong.core.tile import tiles_from_types
from mahjong.game.debug import PlayerFixture
from mahjong.solver.thirteen_orphans import ORPHANS
from tests.browser_acceptance import action_button, capture, fits, fixture, play_action, serve
from tests.helpers import E, N, S, W


WATCH_FLIGHTS = """() => {
  window.motionEvidence = [];
  const observer = new MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) {
      if (!node.dataset?.travel) continue;
      const frames = node.getAnimations()[0]?.effect.getKeyframes() || [];
      window.motionEvidence.push({type:node.dataset.travel, frames:frames.map(frame => frame.transform)});
    }
  });
  observer.observe(document.body, {childList:true});
}"""

FRAME_SAMPLE = """() => {
  window.frameSample = [];
  let last;
  const start = performance.now();
  function measure(now) {
    if (last != null) window.frameSample.push(now - last);
    last = now;
    if (now - start < 950) requestAnimationFrame(measure);
  }
  requestAnimationFrame(measure);
}"""


async def paint(page):
    await page.evaluate("() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")


async def image_resources(page):
    return await page.evaluate("""() => performance.getEntriesByType('resource')
      .filter(entry => new URL(entry.name).pathname.startsWith('/assets/table/'))
      .map(entry => ({path:new URL(entry.name).pathname, bytes:entry.encodedBodySize}))""")


def populated_table(engine):
    state = fixture(engine, {
        E: PlayerFixture([2, 3, 6, 6, 9, 11, 13, 15, 19, 22, 22, 32, 33, 33], last_draw_type=33),
        S: PlayerFixture([1, 1, 3, 5, 10, 12, 14, 14, 18, 25, 26], melds=[(MeldType.PENG, [29] * 3, E)]),
        W: PlayerFixture([0, 2, 4, 7, 8, 11, 12, 17, 23, 24], melds=[(MeldType.CHI, [19, 20, 21], S)]),
        N: PlayerFixture([1, 4, 5, 8, 9, 10, 13, 16, 18, 22, 27, 28, 30]),
    }, gold=33, indicator_type=31, dice=(3, 5))
    discards = {
        E: [10, 16, 17, 21, 24, 27, 28, 32],
        S: [0, 7, 9, 13, 17, 23, 28, 30, 31],
        W: [5, 6, 11, 12, 15, 25, 26, 31],
        N: [0, 3, 8, 14, 18, 19, 24, 25, 27, 30],
    }
    used = {slot.tile.instance_id for slot in state.wall.slots if slot.drawn}
    for seat, types in discards.items():
        state.discards.extend(Discard(tile, seat) for tile in tiles_from_types(types, used))
    for slot in state.wall.slots:
        slot.drawn = slot.tile.instance_id in used
    engine.assert_invariants()
    return state


async def closeups(browser, app, url, output):
    page = await browser.new_page(viewport={"width":1920, "height":1080})
    await page.goto(f"{url}local.html")
    await expect(page.locator(".wall-stage")).to_be_visible()
    await page.evaluate("""() => {
      const preview = {
        ...table, phase:'TURN_ACTION', wall_view:{sides:{}}, discards:[],
        players:Object.fromEntries(Object.entries(table.players).map(([seat, player]) =>
          [seat, {...player, concealed_tiles:[], melds:[], shelf_tiles:[], picked_orphans:[]}]))
      };
      document.querySelector('.table-felt-wrap').innerHTML = MahjongScene.markup(preview, MahjongView.layout());
    }""")
    await page.locator(".wall-stage").screenshot(path=output / "empty.png", animations="disabled")
    await page.reload()
    await capture(page, output, "wall-before-dice", full_page=False)
    wall = await page.locator('[data-wall-seat="3"][data-wall-column="8"][data-wall-layer="top"]').bounding_box()
    assert wall
    await page.screenshot(path=output / "wall.png", clip={
        "x":wall["x"] - 188, "y":wall["y"] - 22, "width":376, "height":83,
    })

    engine = app[LOCAL].engine
    populated_table(engine)
    await page.reload()
    await expect(page.locator(".scene-river")).to_have_count(35)
    await expect(page.locator(".scene-claimed")).to_have_count(2)
    await capture(page, output, "four-seats", full_page=False)
    await page.locator(".dock-seat .hand").screenshot(path=output / "hand.png", animations="disabled")
    river = await page.locator(".scene-river-side.river-north .scene-river").first.bounding_box()
    assert river
    await page.screenshot(path=output / "river-table.png", clip={
        "x":river["x"] - 275, "y":river["y"] - 46, "width":335, "height":117,
    })
    await page.locator("[data-river-toggle]").click()
    await expect(page.locator(".river-inspector .river")).to_have_count(4)
    await page.locator(".river-inspector").screenshot(path=output / "rivers.png", animations="disabled")
    await page.locator("[data-river-toggle]").click()
    await page.locator("[data-view-toggle]").click()
    await expect(page.locator(".overhead-view")).to_have_count(1)
    await expect(page.locator("[data-view-toggle]")).to_be_focused()
    await capture(page, output, "overhead", full_page=False)
    await page.locator("[data-view-toggle]").click()
    stage = await page.locator(".wall-stage").bounding_box()
    assert stage
    await page.screenshot(path=output / "gold-and-dice.png", clip={
        "x":stage["x"] + stage["width"] * .40, "y":stage["y"] + stage["height"] * .31,
        "width":stage["width"] * .20, "height":stage["height"] * .34,
    })
    meld = await page.locator('.scene-meld[data-motion^="meld-1-"]').first.bounding_box()
    assert meld
    await page.screenshot(path=output / "melds.png", clip={
        "x":meld["x"] - 77, "y":meld["y"] - 98, "width":210, "height":145,
    })
    await page.close()


async def measure(browser, app, url, size, output):
    width, height = size
    touch = width <= 844
    page = await browser.new_page(viewport={"width":width, "height":height}, has_touch=touch, is_mobile=touch)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    app[LOCAL].new_round(seed=42)
    cdp = await page.context.new_cdp_session(page)
    await cdp.send("Network.enable")
    await cdp.send("Network.setCacheDisabled", {"cacheDisabled":True})
    timings = []
    for _ in range(3):
        await page.goto(f"{url}local.html", wait_until="domcontentloaded")
        await expect(page.locator(".wall-layer.present")).to_have_count(136)
        await paint(page)
        timings.append(round(await page.evaluate("performance.now()")))
    await action_button(page, E, "ROLL_DICE").click()
    await expect(page.locator(".wall-layer.present")).to_have_count(83)
    await page.wait_for_function("() => !document.querySelector('.flying-tile')")
    await page.wait_for_function("() => !document.querySelector('.presentation-toast.show')")
    await fits(page)
    await page.evaluate("scrollTo(0,0)")
    await capture(page, output, f"viewport-{width}x{height}", full_page=False)
    engine = app[LOCAL].engine
    discard = next(a for a in engine.legal_actions(E)
                   if a.type == ActionType.DISCARD and a.tile_ids[0] // 4 in ORPHANS)
    button = page.locator(f'#seat-{int(E)} .hand [data-tile="{discard.tile_ids[0]}"]')
    if touch:
        await button.tap()
    else:
        await page.locator(f'[data-scene-tile="{discard.tile_ids[0]}"]').click()
    await expect(page.locator(".scene-selected")).to_have_count(1)
    await page.evaluate(WATCH_FLIGHTS)
    await page.evaluate(FRAME_SAMPLE)
    await play_action(page, E, discard)
    await page.wait_for_function("() => window.motionEvidence.some(event => event.type === 'TILE_DRAWN')")
    await page.wait_for_function("() => !document.querySelector('.flying-tile')")
    await page.wait_for_timeout(700)
    events = await page.evaluate("window.motionEvidence")
    assert {e["type"] for e in events} >= {"TILE_DRAWN", "TILE_DISCARDED"}, events
    assert all(len(e["frames"]) == 3 and len(set(e["frames"])) == 3 for e in events), events
    await expect(page.locator(".scene-river")).to_have_count(1)
    await expect(page.locator(".wall-layer.present")).to_have_count(82)
    draw = next(e for e in engine.player_view(S)["presentation_events"] if e["type"] == "TILE_DRAWN")
    slot = draw["payload"]["position"]
    layer = "top" if slot["layer"] == 0 else "bottom"
    assert set(draw["payload"]) == {"position", "source"}
    await expect(page.locator(f'[data-motion="wall-{slot["side"]}-{slot["column"]}-{layer}"]')).to_have_count(0)
    await expect(page.locator(".scene-drawn")).to_have_count(1)
    await fits(page)
    frames = sorted(await page.evaluate("window.frameSample"))
    assert len(frames) >= 2
    resources = await image_resources(page)
    assert all("/generated/" not in r["path"] and "/concept/" not in r["path"] for r in resources)
    assert not errors, errors
    if touch:
        dock = await page.locator(".dock-seat").bounding_box()
        assert dock and dock["width"] <= width and abs(dock["y"] + dock["height"] - height) < 1
    await page.close()
    return {
        "viewport":f"{width}x{height}", "touch":touch, "cold_first_scene_ms":timings,
        "median_first_scene_ms":median(timings), "frame_samples":len(frames),
        "frame_interval_p50_ms":round(median(frames), 1),
        "frame_interval_p95_ms":round(frames[int((len(frames) - 1) * .95)], 1),
        "frame_interval_max_ms":round(frames[-1], 1),
        "frame_intervals_over_32ms":sum(frame > 32 for frame in frames),
        "new_table_resources":resources
    }


async def run(args):
    args.output.mkdir(parents=True, exist_ok=True)
    app = create_app(seed=42)
    async with serve(app) as url, async_playwright() as playwright:
        browser = await playwright.chromium.launch(executable_path=args.chromium)
        await closeups(browser, app, url, args.output)
        results = []
        for size in [(1920, 1080), (1366, 768), (1024, 768), (390, 844), (844, 390)]:
            results.append(await measure(browser, app, url, size, args.output))
            print("PASS scene", *size, flush=True)
        summary = {
            "browser":f"Chromium {browser.version}", "sample_ms":950,
            "environment":"Headless Linux, local server, Chromium device emulation for phone sizes",
            "measurements":results
        }
        (args.output / "performance.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
        await browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", help="path to an installed Chromium or Chrome")
    parser.add_argument("--output", type=Path, required=True)
    asyncio.run(run(parser.parse_args()))
