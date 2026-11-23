"""Check seat controls and the 2.5D table in Chromium, including crowded public rows."""

import argparse
import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright, expect

from lan_server import LOCAL, create_app
from mahjong import ActionType
from mahjong.core.player import MeldType
from mahjong.game.debug import PlayerFixture
from tests.browser_acceptance import action_button, capture, fixture, play_action, serve
from tests.helpers import E, S, W
from tests.scene_acceptance import paint, populated_table
from tests.test_gold import WAIT


VIEWPORTS = [(1920, 1080), (1600, 900), (1366, 768), (1280, 720), (1180, 820),
             (390, 844), (844, 390), (820, 1180)]
SEAT_STYLES = """nodes => Object.fromEntries(nodes.map(panel => {
  const container = panel.querySelector(".seat-tools");
  const bounds = container.getBoundingClientRect();
  const style = getComputedStyle(container);
  const buttons = [...container.querySelectorAll("button")].map(button => {
    const css = getComputedStyle(button), box = button.getBoundingClientRect();
    return {height:box.height, width:box.width, font:css.fontSize, padding:css.padding,
      radius:css.borderRadius, line:css.lineHeight, whitespace:css.whiteSpace,
      fits:box.left >= bounds.left - .1 && box.right <= bounds.right + .1 &&
        button.scrollWidth <= button.clientWidth};
  });
  return [panel.dataset.visualPosition, {
    active:panel.classList.contains("dock-seat"), width:bounds.width, direction:style.flexDirection,
    wrap:style.flexWrap, gap:style.columnGap, buttons
  }];
}))"""

FRAME_FIT = """() => {
  const box = selector => document.querySelector(selector).getBoundingClientRect();
  const frame = box(".frame-top"), stage = box(".wall-stage");
  const overlap = (a, b) =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const wood = [frame, ...Array.from(document.querySelectorAll(".frame-facet"), el => el.getBoundingClientRect())];
  const target = document.querySelector(".wall-stage");
  const style = getComputedStyle(target);
  const world = box(".scene-world");
  const cameraStyle = getComputedStyle(document.querySelector(".scene-camera"));
  const tilt = parseFloat(style.getPropertyValue("--camera-tilt")) * Math.PI / 180;
  const scale = parseFloat(style.getPropertyValue("--scene-scale"));
  const [originX, originY] = cameraStyle.perspectiveOrigin.split(" ").map(parseFloat);
  const camera = {originX, originY, perspective:parseFloat(cameraStyle.perspective),
    sin:Math.sin(tilt), cos:Math.cos(tilt), feltZ:parseFloat(style.getPropertyValue("--tile-base-z"))};
  const nodes = [...target.querySelectorAll(".scene-river,.scene-meld,.scene-shelf,.scene-orphan,.scene-ting,.scene-hand,.scene-center .scene-tile,.wall-layer.indicator")];
  const visible = (x,y) => x >= stage.left - .75 && y >= stage.top - .75 && x <= stage.right + .75 && y <= stage.bottom + .75;
  const publicFits = nodes.every(node => MahjongMesh.project(node, camera)
    .every(([x,y]) => visible(world.left + x * scale, world.top + y * scale)));
  const faceArea = (corners, indices) => Math.max(0, indices.reduce((area, corner, index) => {
    const [x, y] = corners[corner], [nextX, nextY] = corners[indices[(index + 1) % indices.length]];
    return area + x * nextY - y * nextX;
  }, 0) / 2);
  const standingBacks = nodes.filter(node => node.matches(".scene-hand")).every(node => {
    const corners = MahjongMesh.project(node, camera);
    return faceArea(corners, [4,7,6,5]) > faceArea(corners, [1,0,4,5]) &&
      faceArea(corners, [0,1,2,3]) === 0;
  });
  const river = nodes.find(node => node.matches(".scene-river"));
  const riverWidth = river?.querySelector(".tile-top").getBoundingClientRect().width;
  return {
    inStage:wood.every(rect => rect.left >= stage.left - .5 && rect.right <= stage.right + .5 &&
      rect.top >= stage.top - .5 && rect.bottom <= stage.bottom + .5),
    inViewport:wood.every(rect => rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight),
    clearPanels:[...document.querySelectorAll(".table-shell .player")].every(
      panel => !overlap(frame, panel.getBoundingClientRect())),
    noHorizontalScroll:document.documentElement.scrollWidth === innerWidth,
    public:publicFits, standingBacks, scale, riverWidth
  };
}"""

CROWDED_PROPS = """({dense, seat:packed}) => {
  const players = Object.values(table.players);
  const pickup = (packed + 3) % 4;
  const concealed = (packed + 1) % 4;
  players.forEach((player, seat) => {
    const meld = (type, tiles, source = null) => ({type, tiles, count:tiles.length, source});
    player.melds = [
      meld("CHI", [1, 2, 3], (seat + 3) % 4),
      meld("PENG", [12, 12, 12], (seat + 2) % 4),
      meld("MING_GANG", [19, 19, 19, 19], (seat + 1) % 4),
      meld("BU_GANG", [26, 26, 26, 26], (seat + 3) % 4)
    ];
    if ((dense && seat !== packed) || (!dense && seat > 1)) {
      player.melds = seat === concealed ? [meld("AN_GANG", [null, null, null, null])] : [];
    }
    player.shelf_tiles = dense && seat === packed ? Array(4).fill(table.gold_tile_type) : [];
    player.shelf_count = player.shelf_tiles.length;
    player.picked_orphans = dense && (seat === packed || seat === pickup)
      ? [0,8,9,17,18,26,27,28,29,30,31,32,33] : [];
    player.ting_tile = dense && seat === packed ? {type:25, hidden:false} : null;
    // Keep a short hand shown near the rail so that the stress case checks the
    // interaction between its second public row and the hand.
    if (dense || player.melds.length > 1) {
      player.concealed_tiles = player.concealed_tiles.slice(0, dense ? 5 : seat === 0 ? 2 : 1);
      player.concealed_count = player.concealed_tiles.length;
    }
  });
  render();
}"""

PUBLIC_GEOMETRY = """seat => {
  const stage = document.querySelector(".wall-stage");
  const nodes = [...stage.querySelectorAll(".scene-meld,.scene-shelf,.scene-orphan,.scene-ting")];
  const felt = stage.querySelector(".scene-felt");
  const halfFelt = [felt.offsetWidth / 2, felt.offsetHeight / 2];
  const hand = stage.querySelector(".scene-hand");
  const layout = MahjongView.layout();
  const rowAxis = seat => [layout.west, layout.east].includes(seat) ? "--x" : "--y";
  const value = (node, key) => parseFloat(node.style.getPropertyValue(key));
  const rect = node => {
    const x = value(node, "--x"), y = value(node, "--y");
    const w = value(node, "--w"), h = value(node, "--h");
    const pitch = value(node, "--pitch") * Math.PI / 180;
    const floor = h * Math.cos(pitch) + value(node, "--d") * Math.abs(Math.sin(pitch));
    const rotated = Math.abs(value(node, "--yaw") % 180) === 90;
    return {x, y, w:rotated ? floor : w, h:rotated ? w : floor};
  };
  const obstacles = [...stage.querySelectorAll(".scene-hand,.wall-layer,.scene-river")];
  const collides = (a, b) => {
    const x = rect(a), y = rect(b);
    return Math.abs(x.x - y.x) < (x.w + y.w) / 2 - 1e-6 &&
      Math.abs(x.y - y.y) < (x.h + y.h) / 2 - 1e-6;
  };
  return {
    count:nodes.length,
    sameSize:nodes.every(node => ["--w", "--h", "--d"].every(
      dimension => value(node, dimension) === value(hand, dimension))),
    bounds:nodes.every(node => {
      const {x,y,w,h} = rect(node);
      return Math.abs(x) + w / 2 < halfFelt[0] && Math.abs(y) + h / 2 < halfFelt[1] &&
        (Math.abs(x) - w / 2 > 72 || Math.abs(y) - h / 2 > 72);
    }),
    clear:nodes.every((node, i) => {
      if (obstacles.some(obstacle => collides(node, obstacle))) return false;
      return nodes.slice(0, i).every(other =>
        (node.classList.contains("scene-stacked") && other === node.previousElementSibling) ||
        !collides(node, other));
    }),
    stacked:nodes.filter(node => node.classList.contains("scene-stacked")).every(node => {
      const claimed = node.previousElementSibling;
      return claimed.classList.contains("scene-claimed") && ["--x","--y","--yaw"].every(
        key => value(node,key) === value(claimed,key)) && (value(node, "--z") - value(claimed, "--z") >= value(node, "--d"));
    }),
    unsplit:nodes.filter(node => node.classList.contains("scene-meld")).every((node, _, all) => {
      const group = node.dataset.motion.split("-").slice(0, 3).join("-");
      const axis = rowAxis(Number(group.split("-")[1]));
      return all.filter(other => other.dataset.motion.startsWith(group + "-"))
        .every(other => value(other, axis) === value(node, axis));
    }),
    rows:[...new Set(nodes.filter(node => Number(node.dataset.motion.split("-")[1]) === seat)
      .map(node => value(node, rowAxis(seat))))].length
  };
}"""


async def switch_dock(page, number):
    seat = page.locator(f"#seat-{number}")
    if "dock-seat" not in (await seat.get_attribute("class") or "").split():
        await seat.locator(".seat-avatar").click()
    await expect(seat.locator(".hand")).to_be_visible()


async def check_controls(page, output):
    snapshots = {}
    for number in range(4):
        await switch_dock(page, number)
        styles = await page.locator(".player").evaluate_all(SEAT_STYLES)
        assert [name for name in styles if styles[name]["active"]] == ["south"], styles
        active = styles["south"]
        assert active["direction"] == "row" and active["wrap"] == "wrap", active
        assert all(button["fits"] and button["height"] >= 38 and button["whitespace"] == "nowrap"
                   for button in active["buttons"]), active
        snapshots[number] = active
        if output:
            await page.locator(f"#seat-{number} .seat-tools").screenshot(path=output / f"buttons-{number}.png")
    assert all(spec == snapshots[0] for spec in snapshots.values()), snapshots
    await page.locator("#focusTurn").click()
    await expect(page.locator("#seat-0.dock-seat")).to_be_focused()
    return snapshots


async def check_viewport(browser, url, size, output):
    w, h = size
    touch = w <= 844
    page = await browser.new_page(viewport={"width":w, "height":h}, has_touch=touch, is_mobile=touch)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    await page.goto(f"{url}local.html")
    await expect(page.locator(".wall-layer")).to_have_count(83)
    if size == VIEWPORTS[0]:
        controls = await check_controls(page, output)
    else:
        controls = await page.locator(".player").evaluate_all(SEAT_STYLES)
        assert all(button["fits"] and button["height"] >= (44 if w <= 1050 else 38)
                   for button in controls["south"]["buttons"]), controls
    results = {}
    for view in ("oblique", "overhead"):
        await page.evaluate("window.scrollTo(0,0)")
        await paint(page)
        await page.evaluate("document.fonts.ready")
        fit = await page.evaluate(FRAME_FIT)
        assert fit["public"] and fit["noHorizontalScroll"], (size, view, fit)
        if view == "overhead":
            assert all(fit[key] for key in ("inStage", "inViewport", "clearPanels")), (size, view, fit)
        results[view] = fit
        await capture(page, output, f"{view}-{w}x{h}", full_page=False)
        if view == "oblique":
            await page.locator("[data-view-toggle]").click()
    assert not errors, errors
    await page.close()
    return {"frame":results, "controls":controls}


async def check_public(browser, app, url, output):
    populated_table(app[LOCAL].engine)
    page = await browser.new_page(viewport={"width":1920, "height":1080})
    await page.goto(f"{url}local.html")
    await expect(page.locator(".scene-river")).to_have_count(35)
    await page.evaluate(CROWDED_PROPS, {"dense": False, "seat": 2})
    await paint(page)
    await capture(page, output, "multiple-melds", full_page=False)
    geometry = {}
    for seat in (0, 1, 3, 2):
        await page.reload()
        await expect(page.locator(".scene-river")).to_have_count(35)
        await page.evaluate(CROWDED_PROPS, {"dense": True, "seat": seat})
        result = await page.evaluate(PUBLIC_GEOMETRY, seat)
        assert all(result[key] for key in ("sameSize", "bounds", "clear", "stacked", "unsplit")), (seat, result)
        assert result["count"] == 49 and result["rows"] == 2, (seat, result)
        geometry[seat] = result
    await paint(page)
    await capture(page, output, "crowded-oblique", full_page=False)
    await page.locator("[data-view-toggle]").click()
    await paint(page)
    await capture(page, output, "crowded-overhead", full_page=False)
    for width, height in VIEWPORTS[-3:]:
        await page.set_viewport_size({"width":width, "height":height})
        await page.evaluate("window.scrollTo(0, 0)")
        await paint(page)
        fit = await page.evaluate(FRAME_FIT)
        assert all(fit[key] for key in ("inStage", "inViewport", "clearPanels", "public")), ("crowded", width, height, fit)
        if width == 844:
            await capture(page, output, "crowded-mobile-landscape", full_page=False)
    await page.close()
    return geometry


WATCH_LANDING = """() => {
  window.landings = [];
  new MutationObserver(records => {
    const dimensions = box => [box.x, box.y, box.width, box.height];
    for (const record of records) for (const node of record.addedNodes) {
      if (!node.dataset?.travel) continue;
      const [first, , last] = node.getAnimations()[0].effect.getKeyframes();
      const origin = new DOMMatrix(first.transform);
      const end = new DOMMatrix(last.transform);
      const position = ["left", "top", "width", "height"].map(key => parseFloat(node.style[key]));
      for (const target of document.querySelectorAll("[data-motion].receiving-tile")) {
        const rect = dimensions(target.querySelector(".tile-top").getBoundingClientRect());
        if (rect.every((value, i) => Math.abs(value - position[i]) < .01)) {
          window.landings.push({kind:node.dataset.travel, key:target.dataset.motion, rect,
            arrives:end.isIdentity, moves:Math.hypot(origin.m41, origin.m42) > 1});
        }
      }
    }
  }).observe(document.body, {childList:true});
}"""


async def check_landings(browser, app, url):
    engine = app[LOCAL].engine
    cases = [
        (S, ActionType.CHI, {S:PlayerFixture([1, 2])}, {"discard":(E, 0)}, "CHI", "meld-1-0-", 3),
        (W, ActionType.PENG, {W:PlayerFixture([2, 2])}, {"discard":(E, 2)}, "PENG", "meld-2-0-", 3),
        (S, ActionType.MING_GANG, {S:PlayerFixture([0, 0, 0])}, {"discard":(E, 0)}, "GANG", "meld-1-0-", 4),
        (E, ActionType.AN_GANG, {E:PlayerFixture([21] * 4, last_draw_type=21)}, {}, "GANG", "meld-0-0-", 4),
        (E, ActionType.BU_GANG, {
            E:PlayerFixture([19], melds=[(MeldType.PENG, [19] * 3, W)], last_draw_type=19)
        }, {}, "GANG", "meld-0-0-", 1),
        (S, ActionType.PICK_ORPHAN, {S:PlayerFixture([1], orphan_pickup_enabled=True)},
         {"discard":(E, 0)}, "ORPHAN_PICKED", "orphan-1-0", 1),
        (E, ActionType.SHELVE_GOLD, {E:PlayerFixture(WAIT + [33], last_draw_type=33)},
         {}, "GOLD_SHELVED", "shelf-0-0", 1),
        (E, ActionType.DECLARE_TING, {E:PlayerFixture(WAIT + [7], last_draw_type=7)},
         {}, "TING_DECLARED", "ting-0", 1),
        (E, ActionType.DISCARD, {E:PlayerFixture([12], last_draw_type=12)},
         {}, "TILE_DISCARDED", "discard-0", 1),
    ]
    page = await browser.new_page(viewport={"width":1366, "height":768})
    for seat, action, players, options, event, key, count in cases:
        fixture(engine, players, gold=33, **options)
        await page.goto(f"{url}local.html")
        await expect(page.locator(".wall-stage")).to_be_visible()
        await page.evaluate("window.scrollTo(0, 0)")
        await page.evaluate(WATCH_LANDING)
        move = next(item for item in engine.legal_actions(seat) if item.type == action)
        await play_action(page, seat, move, select_tile=action in {
            ActionType.SHELVE_GOLD, ActionType.DECLARE_TING, ActionType.DISCARD})
        await page.wait_for_function(
            "([event, count]) => window.landings.filter(item => item.kind === event).length >= count",
            arg=[event, count])
        await expect(page.locator(".flying-tile")).to_have_count(0)
        matches = await page.evaluate(
            "([event,key]) => window.landings.filter(item => item.kind === event && item.key.startsWith(key))",
            [event, key])
        assert len(matches) == count and all(match["arrives"] and match["moves"] for match in matches), (action, matches)
        for match in matches:
            target = page.locator(f'[data-motion="{match["key"]}"] .tile-top')
            box = await target.bounding_box()
            assert box and all(abs(actual - expected) < 1 for actual, expected in
                               zip(box.values(), match["rect"])), (action, box, match)
        if action in {ActionType.MING_GANG, ActionType.AN_GANG, ActionType.BU_GANG, ActionType.DISCARD}:
            draws = await page.evaluate("window.landings.filter(item => item.kind === 'TILE_DRAWN')")
            assert len(draws) == 1 and draws[0]["arrives"] and draws[0]["moves"], (action, draws)
        print(f"PASS animation landing: {action.name}", flush=True)
    await page.close()


async def run(args):
    if args.output:
        args.output.mkdir(parents=True, exist_ok=True)
    app = create_app(seed=42)
    async with serve(app) as url, async_playwright() as playwright:
        browser = await playwright.chromium.launch(executable_path=args.chromium)
        page = await browser.new_page(viewport={"width":1920, "height":1080})
        await page.goto(f"{url}local.html")
        await expect(page.locator(".wall-layer")).to_have_count(136)
        await paint(page)
        await capture(page, args.output, "wall-full", full_page=False)
        await action_button(page, E, "ROLL_DICE").click()
        await expect(page.locator(".wall-layer")).to_have_count(83)
        await page.close()
        results = {}
        for size in VIEWPORTS:
            w, h = size
            results[f"{w}x{h}"] = await check_viewport(browser, url, size, args.output)
            print(f"PASS {w}x{h}: both views, frame clearance and seat controls", flush=True)
        public = await check_public(browser, app, url, args.output)
        print(f"PASS crowded public tiles: {public}", flush=True)
        await check_landings(browser, app, url)
        if args.output:
            (args.output / "layout.json").write_text(json.dumps({
                "browser": browser.version, "viewports": results, "public": public
            }, indent=2) + "\n", encoding="utf-8")
        await browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", help="path to an installed Chromium or Chrome")
    parser.add_argument("--output", type=Path, help="directory for screenshots and measured styles")
    asyncio.run(run(parser.parse_args()))
