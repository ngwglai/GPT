"""Exercise the bottom hand, camera and LAN recovery in Chromium."""

import argparse
import asyncio
import json

from playwright.async_api import async_playwright, expect

from lan_server import LOCAL, ROOMS, create_app
from mahjong import ActionType
from mahjong.game.debug import PlayerFixture
from tests.browser_acceptance import action_button, capture, fixture, room_fixture, serve
from tests.helpers import E, S
from tests.layout_browser_acceptance import CROWDED_PROPS, FRAME_FIT
from tests.scene_acceptance import paint, populated_table
from tests.test_gold import WAIT


VIEWPORTS = ((1920, 1080), (1366, 768), (844, 390), (390, 844), (1180, 820), (820, 1180))

HAND = """() => {
  const hand = document.querySelector(".dock-seat .hand");
  const box = hand.getBoundingClientRect();
  const tiles = Array.from(hand.children, node => node.getBoundingClientRect());
  return {
    count:tiles.length, width:tiles[0].width, height:tiles[0].height,
    inViewport:tiles.every(r => r.x >= 0 && r.right <= innerWidth + .25 && r.bottom <= innerHeight),
    singleRow:tiles.every(r => Math.abs(r.y - tiles[0].y) <= .25),
    noOverlap:tiles.slice(1).every((r, index) => r.x >= tiles[index].right - .1),
    noScroll:hand.scrollWidth <= hand.clientWidth + 1 && document.documentElement.scrollWidth === innerWidth,
    bottom:Math.abs(innerHeight - box.bottom) <= 8,
    drawGap:tiles.at(-1).x - tiles.at(-2).right,
    normalGap:tiles[1].x - tiles[0].right,
  };
}"""

TRACK = """(() => {
  const NativeSocket = window.WebSocket;
  window.transport = {sockets:0, closed:[], sent:[], states:[], acks:[], resize:0, viewport:0, lifecycle:[], visibility:[]};
  for (const event of ['freeze', 'resume']) {
    document.addEventListener(event, () => transport.lifecycle.push(event));
  }
  document.addEventListener('visibilitychange', () => transport.visibility.push(document.hidden));
  window.addEventListener('resize', () => transport.resize++);
  window.visualViewport.addEventListener('resize', () => transport.viewport++);
  window.WebSocket = class extends NativeSocket {
    constructor(...args) {
      super(...args);
      const number = ++transport.sockets;
      window.acceptanceSocket = this;
      this.addEventListener('close', event => transport.closed.push({number, code:event.code}));
      this.addEventListener('message', event => {
        const msg = JSON.parse(event.data), view = msg.player_view;
        if (msg.type === 'command_ack') transport.acks.push(msg.command_id);
        if (view) transport.states.push({
          number, room:msg.room.code, member:msg.you.member_id, seat:msg.you.seat,
          match:view.match.match_id, round:view.round_id, revision:view.revision, phase:view.phase,
          allowed:Object.values(view.players).filter(p => 'concealed_tiles' in p).map(p => p.seat),
          hand:view.players[msg.you.seat].concealed_tiles.map(t => t.id)
        });
      });
      if (window.raceDuringHandshake) {
        queueMicrotask(() => {
          window.dispatchEvent(new Event('online'));
          window.dispatchEvent(new Event('online'));
        });
      }
    }
    send(value) {
      const message = JSON.parse(value);
      transport.sent.push({type:message.type, command:message.command_id});
      super.send(value);
    }
  };
})()"""


async def hand_check(page, expected):
    await expect(page.locator(".dock-seat .hand button")).to_have_count(expected)
    hand = await page.evaluate(HAND)
    assert all(hand[key] for key in ("inViewport", "singleRow", "noOverlap", "noScroll", "bottom")), hand
    assert hand["width"] >= 24 and hand["height"] >= 44, hand
    if expected == 14:
        assert hand["drawGap"] > hand["normalGap"], hand
    return hand


async def match_cases(browser, app, url, output):
    results = {}
    engine = app[LOCAL].engine
    populated_table(engine)
    for w, h in VIEWPORTS:
        touch = w <= 844
        page = await browser.new_page(viewport={"width":w, "height":h}, has_touch=touch, is_mobile=touch)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        await page.goto(url + "local.html")
        await paint(page)
        hand = await hand_check(page, 14)
        close = await page.evaluate(FRAME_FIT)
        assert all(close[key] for key in ("public", "noHorizontalScroll", "standingBacks")), (w, h, close)
        await capture(page, output, f"match-{w}x{h}", full_page=False)
        await page.locator("[data-view-toggle]").click()
        await expect(page.locator("[data-view-toggle]")).to_have_attribute("aria-pressed", "true")
        await paint(page)
        full = await page.evaluate(FRAME_FIT)
        assert all(full[key] for key in ("inStage", "inViewport", "public", "standingBacks")), (w, h, full)
        assert close["scale"] > full["scale"], (w, h, close, full)
        if w == 1920:
            await capture(page, output, "full-desktop", full_page=False)
        await page.locator('[data-view-seat="3"]').click()
        waiting_hand = await hand_check(page, 13)
        assert not errors, errors
        results[f"{w}x{h}"] = {"hand":hand, "waitingHand":waiting_hand, "match":close, "full":full}
        await page.close()

    page = await browser.new_page(viewport={"width":844, "height":390}, has_touch=True, is_mobile=True)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    await page.goto(url + "local.html")
    await expect(page.locator(".scene-river")).to_have_count(35)
    for seat in (1, 2, 3, 0):
        await page.locator(f'[data-view-seat="{seat}"]').tap()
        await expect(page.locator(".dock-seat")).to_have_attribute("id", f"seat-{seat}")
        await expect(page.locator(".dock-seat")).to_have_attribute("data-visual-position", "south")
        assert await page.locator(".scene-hand:not([data-tile-face=''])").count() == 0
        await paint(page)
        await capture(page, output, f"perspective-seat-{seat}", full_page=False)
    await page.locator("#focusTurn").tap()
    discard = next(a for a in engine.legal_actions(E) if a.type == ActionType.DISCARD)
    tile = page.locator(f'.dock-seat [data-tile="{discard.tile_ids[0]}"]')
    before = await tile.bounding_box()
    await tile.tap()
    await expect(tile).to_have_attribute("aria-pressed", "true")
    raised = await tile.bounding_box()
    assert raised["y"] < before["y"], (before, raised)
    await capture(page, output, "phone-14-selected", full_page=False)
    revision = engine.state.revision
    await tile.tap()
    await expect(page.locator(".table-details")).to_contain_text(f"revision {revision + 1}")
    await page.locator('[data-view-seat="0"]').tap()
    await hand_check(page, 13)

    # The real rule set offers chi/pon only before declaring ting.
    fixture(engine, {S:PlayerFixture([0, 1, 2, 2, 2, 9, 10, 11, 18, 19, 20, 31, 31])},
            gold=33, discard=(E, 2))
    await page.reload()
    await expect(action_button(page, S, "PASS")).to_be_visible()
    for kind in ("CHI", "PENG", "MING_GANG", "PASS"):
        button = action_button(page, S, kind)
        await expect(button).to_have_count(1)
        if not await button.is_visible():
            group = button.locator("xpath=ancestor::details[@class='action-family']")
            await expect(group.locator("summary")).to_be_visible()
        else:
            assert (await button.bounding_box())["height"] >= 44
    await capture(page, output, "phone-calls", full_page=False)
    pon = action_button(page, S, "PENG")
    pon_group = pon.locator("xpath=ancestor::details[@class='action-family']")
    await pon_group.locator("summary").tap()
    await expect(pon).to_be_visible()
    options = await pon_group.locator(".action-choices").bounding_box()
    hand = await page.locator(".dock-seat .hand").bounding_box()
    assert options["y"] + options["height"] <= hand["y"]
    await pon_group.locator("summary").tap()
    await action_button(page, S, "PASS").tap()
    fixture(engine, {S:PlayerFixture(WAIT, declared=True)}, gold=33, discard=(E, 31))
    await page.reload()
    await expect(action_button(page, S, "HU")).to_be_visible()
    await expect(action_button(page, S, "PASS")).to_be_visible()
    await capture(page, output, "phone-win-or-pass", full_page=False)

    fixture(engine, {E:PlayerFixture(WAIT + [7], last_draw_type=7)}, gold=33)
    await page.set_viewport_size({"width":390, "height":844})
    await page.reload()
    ting = next(a for a in engine.legal_actions(E) if a.type == ActionType.DECLARE_TING)
    await page.locator(f'.dock-seat [data-tile="{ting.tile_ids[0]}"]').tap()
    await expect(page.locator(".dock-seat .wait-patterns")).to_contain_text("普通胡")
    await expect(action_button(page, E, "DECLARE_TING")).to_be_visible()
    await capture(page, output, "phone-ting-preview", full_page=False)
    await action_button(page, E, "DECLARE_TING").tap()
    await page.locator('[data-view-seat="0"]').tap()
    await expect(page.locator(".dock-seat .wait-caption")).to_contain_text("已听")
    await capture(page, output, "phone-ting-declared", full_page=False)

    populated_table(engine)
    await page.set_viewport_size({"width":844, "height":390})
    await page.reload()
    await expect(page.locator(".scene-river")).to_have_count(35)
    await page.evaluate(CROWDED_PROPS, {"dense":False, "seat":0})
    await paint(page)
    await capture(page, output, "multiple-melds", full_page=False)
    await page.evaluate(CROWDED_PROPS, {"dense":True, "seat":0})
    await page.evaluate("""() => {
      const extra = Array.from({length:45}, (_, i) => ({seat:i % 4, type:i % 34, claimed:false}));
      table.discards.push(...extra);
      render();
    }""")
    await expect(page.locator(".scene-river")).to_have_count(80)
    for w, h in ((844, 390), (390, 844), (1920, 1080)):
        await page.set_viewport_size({"width":w, "height":h})
        await paint(page)
        geometry = await page.evaluate(FRAME_FIT)
        assert geometry["public"], (w, h, geometry)
        await capture(page, output, f"crowded-{w}x{h}", full_page=False)
    assert not errors, errors
    await page.close()
    return results


async def lan_zoom(browser, app, url, output):
    contexts = [await browser.new_context(viewport={"width":844, "height":390},
                is_mobile=index == 1, has_touch=index == 1) for index in range(4)]
    try:
        await contexts[1].add_init_script(TRACK)
        pages = [await context.new_page() for context in contexts]
        errors = []
        for index, page in enumerate(pages):
            page.on("pageerror", lambda error: errors.append(str(error)))
            await page.goto(url + "lan.html")
            await page.locator("#nickname").fill(f"测试席{index + 1}")
            if index:
                await page.locator("#roomCode").fill(code)
                await page.locator("#joinRoom").click()
            else:
                await page.locator("#createRoom").click()
            await expect(page.locator("#roomPanel")).to_be_visible()
            code = await page.locator("#roomTitle").inner_text()
            await page.locator(f'[data-choose-seat="{index}"]').click()
        await pages[0].locator("#startGame").click()
        await action_button(pages[0], E, "ROLL_DICE").click()
        page = pages[1]
        await expect(page.locator(".dock-seat .hand button")).to_have_count(13)
        room = app[ROOMS][code]
        await room_fixture(room, {S:PlayerFixture([0, 1, 31])}, gold=33, discard=(E, 2))
        passed = action_button(page, S, "PASS")
        await expect(passed).to_be_enabled()
        original = await page.evaluate("transport.states.at(-1)")
        created = []
        for client in pages:
            client.on("request", lambda request: created.append(request.method)
                      if request.url.endswith("/api/rooms") else None)
        cdp = await contexts[1].new_cdp_session(page)
        trigger = {"x":420, "y":190, "relativeSpeed":700, "gestureSourceType":"touch"}
        await cdp.send("Input.synthesizePinchGesture", {**trigger, "scaleFactor":1.65})
        gesture_scale = await page.evaluate("visualViewport.scale")
        if gesture_scale > 1.05:
            await cdp.send("Input.synthesizePinchGesture", {**trigger, "scaleFactor":.61})
        scales = []
        for factor in (1.75, 1, 2, 1):
            await cdp.send("Emulation.setPageScaleFactor", {"pageScaleFactor":factor})
            scale = await page.evaluate("visualViewport.scale")
            assert abs(scale - factor) < .01, scale
            scales.append(scale)
        for w, h in ((812, 375), (844, 390), (390, 844), (412, 915), (844, 390)):
            await page.set_viewport_size({"width":w, "height":h})
            await expect(passed).to_be_enabled()
        await page.locator("[data-view-toggle]").tap()
        await page.locator("[data-view-toggle]").tap()
        await cdp.send("Page.setWebLifecycleState", {"state":"frozen"})
        await asyncio.sleep(.25)
        await cdp.send("Page.setWebLifecycleState", {"state":"active"})
        # Headless CDP does not always dispatch DOM lifecycle events. Exercise
        # the visibility listener with a simulated hidden/visible tab as well.
        await page.evaluate("""() => {
          Object.defineProperty(document, 'hidden', {configurable:true, value:true});
          document.dispatchEvent(new Event('visibilitychange'));
          Object.defineProperty(document, 'hidden', {configurable:true, value:false});
          document.dispatchEvent(new Event('visibilitychange'));
          delete document.hidden;
        }""")
        await expect(passed).to_be_enabled()
        visual = await page.evaluate("transport")
        assert visual["sockets"] == 1 and visual["closed"] == [] and visual["states"][-1] == original, visual
        assert visual["viewport"] > 0 and visual["resize"] > 0, visual
        assert visual["visibility"][-2:] == [True, False], visual["visibility"]
        assert original["allowed"] == [1]
        await capture(page, output, "lan-waiting-response", full_page=False)

        await page.evaluate("""() => {
          window.raceDuringHandshake = true;
          acceptanceSocket.close(4000, "acceptance");
        }""")
        await expect(page.locator("#connectionStatus")).to_have_attribute("data-connection", "offline")
        await expect(passed).to_be_disabled()
        await expect(page.locator("#gameTable")).to_be_visible()
        await expect(page.locator("#joinPanel")).to_be_hidden()
        await expect(passed).to_be_enabled()
        recovered = await page.evaluate("transport")
        assert recovered["sockets"] == 2 and [close["number"] for close in recovered["closed"]] == [1], recovered
        assert recovered["states"][-1] == {**original, "number":2}, recovered["states"][-1]
        await passed.tap()
        await expect(passed).to_have_count(0)
        await page.wait_for_function("() => transport.acks.length === 2")
        after = await page.evaluate("transport")
        rev = after["states"][-1]["revision"]
        assert rev == original["revision"] + 1, after
        assert [msg["type"] for msg in after["sent"]].count("action") == 1
        # Break the underlying transport after acknowledgment without sending
        # a WebSocket close frame, as when a mobile network disappears.
        member = next(member for member in room.members.values() if member.seat == S)
        active, = member.sockets
        active._req.transport.abort()
        await page.wait_for_function("() => transport.states.at(-1).number === 3")
        last = await page.evaluate("transport")
        assert last["states"][-1] == {**after["states"][-1], "number":3}
        assert last["closed"][-1] == {"number":2, "code":1006}, last["closed"]
        assert [msg["type"] for msg in last["sent"]].count("action") == 1
        assert not errors and not created, (errors, created)
        return {"syntheticTouchScale":gesture_scale, "pageScales":scales,
                "visualViewportEvents":visual["viewport"], "resizeEvents":visual["resize"],
                "lifecycleEvents":visual["lifecycle"],
                "simulatedVisibilityEvents":visual["visibility"][-2:],
                "socketsDuringVisualChanges":visual["sockets"], "closeCodes":[item["code"] for item in last["closed"]],
                "reconnects":last["sockets"] - 1, "roundAndSeatStable":True, "privateSeat":original["allowed"],
                "revisionBefore":original["revision"], "revisionAfter":rev, "acceptedCommands":1, "pageErrors":errors}
    finally:
        await asyncio.gather(*(context.close() for context in contexts))


async def run(args):
    if args.output:
        args.output.mkdir(parents=True, exist_ok=True)
    app = create_app(seed=42)
    async with serve(app) as url, async_playwright() as pw:
        browser = await pw.chromium.launch(executable_path=args.chromium)
        viewports = await match_cases(browser, app, url, args.output)
        print("PASS camera and full hands on six viewports, seat switching, waits, calls and crowded public tiles", flush=True)
        transport = await lan_zoom(browser, app, url, args.output)
        print("PASS LAN scale/resize/rotation, lifecycle freeze, guarded reconnect, private seat and no action replay", flush=True)
        evidence = {"browser":browser.version, "viewports":viewports, "transport":transport}
        if args.output:
            (args.output / "evidence.json").write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        else:
            print(json.dumps(evidence, ensure_ascii=False))
        await browser.close()


if __name__ == "__main__":
    from pathlib import Path

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", help="path to installed Chromium")
    parser.add_argument("--output", type=Path, help="optional screenshot and metrics directory")
    asyncio.run(run(parser.parse_args()))
