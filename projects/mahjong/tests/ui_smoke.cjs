/* Optional DOM integration test against a running server. No browser engine.
   npm install; npm run test:ui -- http://127.0.0.1:8765
   Four independent DOM/storage/WebSocket clients execute the real frontend files. */
const assert = require('node:assert/strict');
const {JSDOM, VirtualConsole} = require('jsdom');
const base = process.argv[2] || 'http://127.0.0.1:8765';
const clients = [], errors = [], dialogs = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(fn, label) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > 10000) throw new Error(`Timed out: ${label}; ${errors.join('; ')}`);
    await pause(20);
  }
}
async function create(page = '/lan.html', saved = null) {
  const sockets = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));
  const dom = await JSDOM.fromURL(base + page, {
    runScripts:'dangerously', resources:'usable', pretendToBeVisual:true, virtualConsole:vc,
    beforeParse(window) {
      window.fetch = (url, opts) => fetch(new URL(url, base), opts);
      window.WebSocket = class extends WebSocket { constructor(url) { super(url); sockets.push(this); } };
      window.alert = () => dialogs.push('alert');
      window.confirm = () => { dialogs.push('confirm'); return true; };
      window.HTMLElement.prototype.scrollIntoView = function() {};
      // jsdom has no audio player. Other browser/script errors still fail the test.
      window.HTMLMediaElement.prototype.play = async function() {};
      window.HTMLMediaElement.prototype.pause = function() {};
      if (saved) window.localStorage.setItem('mahjong.lan.session.v040', saved);
    },
  });
  const c = {dom, sockets, d:dom.window.document, close() { sockets.forEach(ws => { ws.onclose = null; ws.onmessage = null; ws.onerror = null; ws.close(); }); dom.window.close(); }};
  clients.push(c);
  await wait(() => c.d.readyState === 'complete', 'page scripts loaded');
  return c;
}
const visible = el => el && !el.closest('.hidden');
const toggle = (c, seat) => c.d.querySelector(`[data-orphan-pickup="${seat}"]`);
const ai = (c, seat) => c.d.querySelector(`[data-ai-toggle="${seat}"]`);
const details = c => c.d.querySelector('.table-details')?.textContent || '';
const rev = c => Number(details(c).match(/revision (\d+)/)?.[1]);
const idle = c => !c.d.querySelector('#leaveRoom').disabled;
(async () => {
  const a = await create();
  a.d.querySelector('#nickname').value = '东家测试';
  a.d.querySelector('#createRoom').click();
  await wait(() => visible(a.d.querySelector('#roomPanel')), 'create room');
  const code = a.d.querySelector('#roomTitle').textContent;
  assert.equal(code.length, 6);
  a.d.querySelector('[data-choose-seat="0"]').click();
  await wait(() => a.d.querySelector('#yourSeat').textContent === '你是东家', 'east seat');
  const seats = [a];
  for (let seat = 1; seat < 4; seat++) {
    const c = await create();
    c.d.querySelector('#nickname').value = seat === 1 ? '<b>南</b>' : `玩家${seat}`;
    c.d.querySelector('#roomCode').value = code;
    c.d.querySelector('#joinRoom').click();
    await wait(() => visible(c.d.querySelector('#roomPanel')), 'join room');
    c.d.querySelector(`[data-choose-seat="${seat}"]`).click();
    await wait(() => c.d.querySelector('#yourSeat').textContent.includes(['东','南','西','北'][seat]), 'choose seat');
    seats.push(c);
  }
  await wait(() => !a.d.querySelector('#startGame').disabled, 'four online players');
  a.d.querySelector('#startGame').click();
  await wait(() => seats.every(c => visible(c.d.querySelector('#gameTable'))), 'all tables');
  assert.equal(a.d.querySelectorAll('[data-action-key="ROLL_DICE:"]').length, 1);
  for (const c of seats.slice(1)) assert.equal(c.d.querySelectorAll('[data-action-key="ROLL_DICE:"]').length, 0);
  await wait(() => idle(a), 'start acknowledgment');
  a.d.querySelector('[data-action-key="ROLL_DICE:"]').click();
  await wait(() => seats.every(c => rev(c) === 1), 'deal synchronization');
  function checkHands() {
    for (let viewer = 0; viewer < 4; viewer++) {
      const c = seats[viewer];
      for (let seat = 0; seat < 4; seat++) {
        const hand = c.d.querySelector(`#seat-${seat} .hand`);
        if (seat !== viewer) {
          assert.equal(hand.querySelectorAll('[data-tile]').length, 0);
          assert.equal(hand.querySelectorAll('.tile:not(.tile-back)').length, 0);
        }
      }
      assert(!details(c).includes('Seed'));
      assert.equal(c.d.querySelectorAll('.my-seat').length, 1);
      assert(c.d.querySelector(`#seat-${viewer}`).classList.contains('south'), 'own seat must render at bottom');
      assert.equal(c.d.querySelector('.scene-river-side.river-south')?.dataset.riverSeat, String(viewer), 'own river must stay inside the bottom wall');
      assert.equal(c.d.querySelectorAll('.wall-layer.present').length, Number(details(c).match(/墙上实牌 (\d+)/)?.[1]));
      assert.equal(c.d.querySelectorAll('#roster b').length, 0, 'nickname must be escaped');
      assert.equal(c.d.querySelectorAll('[data-orphan-pickup]').length, 1, 'only the owner sees a toggle');
      assert(toggle(c, viewer));
    }
  }
  checkHands();
  ai(seats[1], 1).click();
  await wait(() => a.d.querySelector('#seat-1 .ai-badge'), 'public managed badge');
  assert.equal(ai(a, 1), null, 'peer cannot control a managed seat');
  assert.equal(ai(seats[1], 1).textContent, '人工接管');
  await wait(() => idle(seats[1]), 'AI takeover acknowledgment');
  ai(seats[1], 1).click();
  await wait(() => !a.d.querySelector('#seat-1 .ai-badge'), 'manual control restored');
  toggle(seats[2], 2).click();
  await wait(() => toggle(seats[2], 2).getAttribute('aria-pressed') === 'true', 'owner opted in');
  assert.equal(rev(seats[2]), 1);
  assert.equal(a.d.querySelector('#seat-2 .orphan-ready'), null);
  const saved = seats[2].dom.window.localStorage.getItem('mahjong.lan.session.v040');
  const before = seats[2].d.querySelector('#seat-2 .hand').textContent;
  seats[2].close();
  await wait(() => a.d.querySelector('#seat-2').textContent.includes('断线'), 'disconnect');
  seats[2] = await create('/lan.html', saved);
  await wait(() => rev(seats[2]) === 1, 'refresh restores current state');
  assert.equal(toggle(seats[2], 2).getAttribute('aria-pressed'), 'true');
  toggle(seats[2], 2).click();
  await wait(() => toggle(seats[2], 2).getAttribute('aria-pressed') === 'false', 'owner opted out');
  assert.equal(seats[2].d.querySelector('#yourSeat').textContent, '你是西家');
  assert.equal(seats[2].d.querySelector('#seat-2 .hand').textContent, before);
  for (let step = 0; step < 16; step++) {
    await wait(() => seats.every(idle), 'previous move acknowledgment');
    const revision = rev(seats[0]);
    let chosen = null;
    for (const c of seats) {
      chosen = c.d.querySelector('button[data-action-key^="PASS:"]:not(:disabled)');
      if (chosen) break;
    }
    if (!chosen) {
      for (const c of seats) {
        const tile = c.d.querySelector('button.tile.clickable:not(:disabled)');
        if (!tile) continue;
        tile.click();
        chosen = c.d.querySelector('button[data-action-key^="DISCARD:"]:not(:disabled)') ||
                 c.d.querySelector('button[data-action-key^="SHELVE_GOLD:"]:not(:disabled)');
        if (chosen) break;
      }
    }
    assert(chosen, 'server-rendered playable action');
    chosen.click();
    await wait(() => seats.every(c => rev(c) === revision + 1), 'rendered move synchronized');
    checkHands();
  }
  const local = await create('/local.html');
  await wait(() => local.d.querySelector('[data-action-key="ROLL_DICE:"]'), 'local mode');
  const originalRound = details(local).match(/round ([a-f0-9]+)/)[1];
  local.d.querySelector('#seedInput').value = '42';
  local.d.querySelector('#resetMatchBtn').click();
  await wait(() => !details(local).includes(`round ${originalRound}`), 'fixed local seed');
  ai(local, 3).click();
  await wait(() => ai(local, 3).getAttribute('aria-pressed') === 'true', 'local AI takeover');
  assert.equal(rev(local), 0);
  ai(local, 3).click();
  await wait(() => ai(local, 3).getAttribute('aria-pressed') === 'false', 'local manual takeover');
  local.d.querySelector('[data-action-key="ROLL_DICE:"]').click();
  await wait(() => local.d.querySelectorAll('button.tile[data-tile]').length === 53, 'local all-open hands');
  assert.equal(local.d.querySelectorAll('[data-orphan-pickup][aria-pressed="false"]').length, 4);
  toggle(local, 1).click();
  await wait(() => toggle(local, 1).getAttribute('aria-pressed') === 'true', 'local south opts in');
  assert.equal(rev(local), 1, 'intent does not consume a game revision');
  const orphanTypes = new Set([0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33]);
  const orphan = [...local.d.querySelectorAll('#seat-0 .hand button.tile.clickable:not(.gold)')]
    .find(tile => orphanTypes.has(Math.floor(Number(tile.dataset.tile) / 4)));
  assert(orphan, 'fixed seed provides an orphan to discard');
  const discardedId = orphan.dataset.tile;
  const wallBefore = local.d.querySelectorAll('.wall-layer.present').length;
  orphan.click();
  local.d.querySelector('#seat-0 [data-action-key^="DISCARD:"]').click();
  await wait(() => local.d.querySelector('#seat-1 [data-action-key="PICK_ORPHAN:"]'), 'direct pickup action');
  const pick = local.d.querySelector('#seat-1 [data-action-key="PICK_ORPHAN:"]');
  assert.match(pick.textContent, /拾牌.*锁定十三幺/);
  pick.click();
  await wait(() => rev(local) === 3, 'pickup response submitted');
  if (visible(local.d.querySelector('#timeoutBtn'))) local.d.querySelector('#timeoutBtn').click();
  await wait(() => local.d.querySelector('#seat-1 .orphans-row .tile'), 'public orphan zone');
  assert.equal(local.d.querySelector('.orphans-row [data-tile]'), null);
  assert.equal(toggle(local, 1), null, 'locked pickup cannot be toggled');
  assert.match(local.d.querySelector('#seat-1 .orphan-locked').textContent, /已锁定/);
  assert.equal(dialogs.length, 0, 'pickup play never opens a dialog');
  assert.equal(local.d.querySelector(`#seat-1 .hand [data-tile="${discardedId}"]`), null);
  assert.equal(local.d.querySelectorAll('.wall-layer.present').length, wallBefore);
  assert.equal(local.d.querySelectorAll('.scene-river-side.river-east .scene-river').length, 0);
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS: four DOM clients, room setup, dealer dice, 16 synchronized moves, private hands, AI takeover, wall, XSS escaping, reconnect, local mode and orphan pickup. No script errors.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => clients.forEach(c => c.close()));
