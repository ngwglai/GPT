const actionNames = {
  ROLL_DICE: "掷骰子",
  DISCARD: "打出", DECLARE_TING: "报听并打出", SHELVE_GOLD: "上金",
  CHI: "吃", PENG: "碰", MING_GANG: "明杠", AN_GANG: "暗杠", BU_GANG: "补杠",
  HU: "胡", PASS: "过", PICK_ORPHAN: "拾牌"
};
const actionStyles = {
  ROLL_DICE:"dice", PASS:"pass", HU:"hu", MING_GANG:"gang", AN_GANG:"gang", BU_GANG:"gang",
  DECLARE_TING:"ting", SHELVE_GOLD:"shelf", PICK_ORPHAN:"orphan",
};
let table = null;
let selected = { seat: null, tileId: null };
let busy = false;
let tablePoll;
let mutationEpoch = 0;
let riversExpanded = false;
let dockSeat = null;
let inspectedSeat = null;
const aiNames = {human:"人工", easy:"初级", normal:"普通", advanced:"高级"};
let eventRoundId = null;
let lastPresentationEventId = 0;
let viewerSeat = null;
const visualPositions = ["north", "east", "west", "south"];
const winMethods = {SELF_DRAW:"自摸", DISCARD:"荣胡", ROB_GANG:"抢杠胡"};
const winPatterns = {standard:"普通胡", seven_pairs:"七对", thirteen_orphans:"十三幺"};

function scrollToSeat(seat) {
  if (seat == null) return;
  const player = document.getElementById(`seat-${seat}`);
  player.focus({preventScroll:true});
}

function visualSeatMap() {
  const seat = viewerSeat ?? dockSeat ?? 0;
  return {
    south: seat,
    west: (seat + 1) % 4,
    north: (seat + 2) % 4,
    east: (seat + 3) % 4,
  };
}
function applySeatLayout() {
  const layout = visualSeatMap();
  for (const position of visualPositions) {
    const el = document.getElementById(`seat-${layout[position]}`);
    if (!el) continue;
    el.classList.remove(...visualPositions);
    el.classList.add(position);
    el.dataset.visualPosition = position;
  }
}
window.MahjongView = {
  setViewerSeat(seat) {
    viewerSeat = Number.isInteger(seat) && seat >= 0 && seat <= 3 ? seat : null;
    applySeatLayout();
  },
  layout: visualSeatMap,
};

function legalForSeat(seat) {
  if (table?.players[String(seat)]?.controller && table.players[String(seat)].controller !== "human") return [];
  return table?.legal_actions?.[String(seat)] || [];
}
function actionKey(a) { return `${a.type}:${a.tile_ids.join(",")}`; }

async function api(path, options = {}) {
  const res = await fetch(path, { headers: {"Content-Type": "application/json"}, ...options });
  const data = await res.json().catch(() => ({ok:false,error:`HTTP ${res.status}`}));
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.table;
}
function setBusy(v) {
  if (v) mutationEpoch += 1;
  busy = v;
  document.body.classList.toggle("loading", v);
}
function showNotice(msg) {
  const el = document.getElementById("notice");
  el.textContent = msg;
  el.classList.toggle("hidden", !msg);
}
function newPresentationEvents(nextTable, initial) {
  const events = nextTable.presentation_events || [];
  if (eventRoundId !== nextTable.round_id) {
    eventRoundId = nextTable.round_id;
    lastPresentationEventId = 0;
  }
  const fresh = initial ? [] : events.filter(event => event.id > lastPresentationEventId);
  lastPresentationEventId = Math.max(lastPresentationEventId, ...events.map(event => event.id || 0));
  return fresh;
}
function acceptTable(nextTable, { initial = false } = {}) {
  const last = table;
  const sameRound = last?.round_id === nextTable.round_id;
  if (!sameRound) {
    selected = {seat:null,tileId:null};
    inspectedSeat = null;
  }
  if (!sameRound || last.revision !== nextTable.revision) MahjongScene.cancelFlights();
  const events = newPresentationEvents(nextTable, initial);
  const before = sameRound ? MahjongScene.snapshot(events) : null;
  table = nextTable;
  if (selected.tileId != null && !legalForSeat(selected.seat).some(action => action.tile_ids.includes(selected.tileId))) {
    selected = {seat:null,tileId:null};
  }
  document.body.classList.add("table-live");
  render();
  MahjongScene.animate(events, before, last, table);
  for (const event of events) {
    window.MahjongPresentation?.bus?.emit(event, {table, seatName:seat => seatNames[seat], tileName});
  }
  if (sameRound) {
    for (const seat of [0,1,2,3]) {
      if (last.players[seat]?.controller !== table.players[seat]?.controller) {
        window.MahjongPresentation?.animations?.flashSeat(seat, "control");
      }
    }
  }
  scheduleTablePoll();
}
function scheduleTablePoll() {
  clearTimeout(tablePoll);
  if (window.LanGame || table?.phase === "ROUND_END" ||
      !Object.values(table?.players || {}).some(p => p.controller && p.controller !== "human")) return;
  tablePoll = setTimeout(async () => {
    if (busy) return scheduleTablePoll();
    const epoch = mutationEpoch;
    try {
      const next = await api("/api/table");
      if (epoch === mutationEpoch) acceptTable(next);
      else scheduleTablePoll();
    } catch (error) {
      showNotice(error.message);
      scheduleTablePoll();
    }
  }, 300);
}
async function changeController(seat, mode) {
  if (window.LanGame) return window.LanGame.setController(mode);
  if (!table || busy) return;
  try {
    setBusy(true);
    const next = await api("/api/control", {method:"POST", body:JSON.stringify({seat, round_id:table.round_id, mode})});
    selected = {seat:null,tileId:null};
    acceptTable(next);
    showNotice("");
  } catch (error) {
    showNotice(error.message);
  } finally {
    setBusy(false);
  }
}
function renderTableHud() {
  const hud = document.getElementById("tableHud");
  const menu = document.getElementById("controlMenu");
  const settings = document.getElementById("controlSettings");
  hud.classList.remove("hidden");
  menu.classList.remove("hidden");
  const stats = `<span>第 <b>${table.match?.round_no ?? 1}</b> 局</span><span>庄 <b>${seatNames[table.dealer]}</b></span><span>余 <b>${table.normal_tiles_remaining ?? "—"}</b> 张</span>`;
  if (hud.renderedMarkup !== stats) {
    hud.innerHTML = stats;
    hud.renderedMarkup = stats;
  }
  const seats = viewerSeat == null ? [0,1,2,3] : [viewerSeat];
  const rows = seats.map(seat => {
    const current = table.players[seat].controller || "human";
    return `<label>${seatNames[seat]}家<select data-control-seat="${seat}" aria-label="${seatNames[seat]}家控制方式">${Object.entries(aiNames).map(([mode, label]) =>
      `<option value="${mode}"${current === mode ? " selected" : ""}>${label}${mode === "human" ? "" : " AI"}</option>`).join("")}</select></label>`;
  }).join("");
  const batch = viewerSeat == null ? `<div class="all-controls"><button type="button" class="primary" data-ai-all="normal">四家自动对局</button><button type="button" class="ghost" data-ai-all="human">暂停托管</button></div>` : "";
  const controls = `<h2>席位控制</h2>${rows}${batch}`;
  if (settings.renderedMarkup !== controls) {
    settings.innerHTML = controls;
    settings.renderedMarkup = controls;
  }
}
function placeHandDock() {
  const next = viewerSeat ?? inspectedSeat ?? seatNames.findIndex((_, seat) => legalForSeat(seat).length > 0);
  const seat = next < 0 ? table.current_player : next;
  if (seat === dockSeat) return;
  document.getElementById(`seat-${dockSeat}`)?.classList.remove("dock-seat");
  dockSeat = seat;
  document.getElementById(`seat-${seat}`).classList.add("dock-seat");
}
async function loadTable(initial = false) {
  try {
    setBusy(true);
    acceptTable(await api("/api/table"), { initial });
    showNotice("");
  } catch (e) { showNotice(e.message); }
  finally { setBusy(false); }
}
async function resetMatch() {
  if (busy) return;
  const seed = document.getElementById("seedInput").value.trim();
  const dealer = Number(document.getElementById("dealerSelect").value);
  try {
    setBusy(true); selected = {seat:null,tileId:null};
    const next = await api("/api/new-round", {method:"POST", body:JSON.stringify({seed, dealer})});
    document.getElementById("seedInput").value = next.test_mode.seed;
    acceptTable(next); showNotice("");
    document.getElementById("resetMatchBtn").closest("details").open = false;
  } catch (e) { showNotice(e.message); }
  finally { setBusy(false); }
}
async function nextRound() {
  if (busy || table?.phase !== "ROUND_END") return;
  try {
    setBusy(true); selected = {seat:null,tileId:null};
    const next = await api("/api/next-round", {method:"POST", body:JSON.stringify({})});
    document.getElementById("seedInput").value = next.test_mode.seed;
    document.getElementById("dealerSelect").value = String(next.dealer);
    acceptTable(next); showNotice("");
  } catch (e) { showNotice(e.message); }
  finally { setBusy(false); }
}
async function roundButtonAction() {
  if (table?.phase === "ROUND_END") return nextRound();
  return resetMatch();
}
async function performAction(seat, action) {
  if (window.LanGame) return window.LanGame.act(action);
  if (busy) return;
  try {
    setBusy(true);
    const next = await api("/api/action", {method:"POST", body:JSON.stringify({
      seat, round_id:table.round_id, revision:table.revision, type:action.type, tile_ids:action.tile_ids
    })});
    selected = {seat:null,tileId:null};
    inspectedSeat = null;
    acceptTable(next); showNotice("");
  } catch (e) { showNotice(e.message); await loadTable(true); }
  finally { setBusy(false); }
}
async function setOrphanPickup(seat, enabled) {
  if (window.LanGame) return window.LanGame.setOrphanPickup(enabled);
  if (busy) return;
  try {
    setBusy(true);
    const next = await api("/api/orphan-pickup", {method:"POST", body:JSON.stringify({
      seat, round_id:table.round_id, enabled
    })});
    acceptTable(next); showNotice("");
  } catch (e) { showNotice(e.message); }
  finally { setBusy(false); }
}
async function timeoutResponses() {
  if (!table || busy) return;
  try {
    setBusy(true);
    const next = await api("/api/timeout-responses", {method:"POST", body:JSON.stringify({round_id:table.round_id, revision:table.revision})});
    acceptTable(next); showNotice("");
  } catch (e) { showNotice(e.message); }
  finally { setBusy(false); }
}

function renderHand(seat, p) {
  if (!Array.isArray(p.concealed_tiles)) {
    return Array.from({length:p.concealed_count}, () => tileBackHTML()).join("");
  }
  const actions = legalForSeat(seat);
  const last = p.last_drawn_tile;
  const hand = [...(p.concealed_tiles || [])];
  hand.sort((a,b) => {
    if (a.id === last) return 1;
    if (b.id === last) return -1;
    return a.type - b.type || a.id - b.id;
  });
  return hand.map((t, index) => {
    const ta = actions.filter(a => a.tile_ids.includes(t.id));
    const clickable = ta.length > 0;
    const isSelected = selected.seat === seat && selected.tileId === t.id;
    const cls = ["tile", tileClass(t.type), t.type === table.gold_tile_type ? "gold":"", t.id === last ? "drawn":"", clickable?"clickable":"", isSelected?"selected":""].filter(Boolean).join(" ");
    const acts = ta.map(a => actionNames[a.type] || a.type).join(" / ");
    const anchor = index === hand.length - 1 ? ` data-last-hand="${seat}"` : "";
    return `<button type="button" class="${cls}" data-seat="${seat}" data-tile="${t.id}" data-motion="hand-${seat}-${t.id}" data-tile-face="${t.type}"${anchor} aria-pressed="${isSelected}" ${clickable?"":"disabled"} title="${tileName(t.type)}${acts?` · ${acts}`:""}">${MahjongTile.body(t.type)}</button>`;
  }).join("");
}
function renderMelds(p) {
  const labels = {CHI:"吃", PENG:"碰", MING_GANG:"明杠", AN_GANG:"暗杠", BU_GANG:"补杠", GANG:"杠"};
  return p.melds.map(m => {
    const tiles = MahjongScene.meldOrder(p.seat, m).map(({type, sideways}) =>
      type == null ? tileBackHTML("暗杠牌") :
        tileHTML(type, {small:true, gold:type === table.gold_tile_type, sideways})).join("");
    return `<span class="meld"><span class="meld-name">${labels[m.type] || esc(m.type)}</span>${tiles}</span>`;
  }).join("");
}
function renderShelf(p) {
  return p.shelf_tiles.map(t => tileHTML(t,{small:true,gold:true})).join("");
}
function renderTingTile(p) {
  if (!p.ting_tile) return "";
  if (p.ting_tile.hidden) return tileBackHTML("报听暗牌");
  return tileHTML(p.ting_tile.type,{small:true,gold:p.ting_tile.type===table.gold_tile_type});
}
function actionLabel(seat, action) {
  const p = table.players[String(seat)];
  const nameById = new Map((p.concealed_tiles || []).map(t => [t.id, tileName(t.type)]));
  const base = actionNames[action.type] || action.type;
  if (action.type === "ROLL_DICE") return "掷骰子";
  if (["DISCARD","DECLARE_TING"].includes(action.type) && action.tile_ids.length) return `${base} ${nameById.get(action.tile_ids[0]) || ""}`;
  if (action.type === "PICK_ORPHAN" && table.pending_claim) {
    const firstPickup = !p.picked_orphans?.length;
    return `${base} ${tileName(table.pending_claim.tile_type)}${firstPickup ? "（锁定十三幺）" : ""}`;
  }
  if (["CHI","PENG","MING_GANG","AN_GANG","BU_GANG"].includes(action.type)) {
    const own = action.tile_ids.map(id => nameById.get(id) || `#${id}`).join(" ");
    return own ? `${base} · ${own}` : base;
  }
  return base;
}
function renderActions(seat) {
  const actions = legalForSeat(seat);
  if (!actions.length) return "";
  const selectedActions = selected.seat === seat && selected.tileId != null ? actions.filter(a => a.tile_ids.includes(selected.tileId)) : [];
  const globals = actions.filter(a => ["ROLL_DICE","HU"].includes(a.type));
  const multi = actions.filter(a => ["CHI","PENG","MING_GANG","AN_GANG","BU_GANG"].includes(a.type));
  const optionalResponses = ["PICK_ORPHAN", "PASS"].flatMap(type => actions.filter(a => a.type === type));
  const unique = new Map([...globals, ...multi, ...selectedActions, ...optionalResponses].map(action => [actionKey(action), action]));
  const families = new Map();
  for (const action of unique.values()) {
    if (!families.has(action.type)) families.set(action.type, []);
    families.get(action.type).push(action);
  }
  const button = (action, concise) => {
    const kind = actionStyles[action.type] || "";
    const label = actionLabel(seat, action);
    const text = concise && !["CHI", "PICK_ORPHAN"].includes(action.type) ? actionNames[action.type] : label;
    return `<button class="action-btn ${kind}" type="button" data-action-seat="${seat}" data-action-key="${esc(actionKey(action))}" title="${esc(label)}">${esc(text)}</button>`;
  };
  return [...families].map(([type, choices]) => choices.length === 1 ? button(choices[0], true) :
    `<details class="action-family"><summary class="action-btn ${actionStyles[type] || ""}">${actionNames[type]}</summary><div class="action-choices">${choices.map(choice => button(choice, false)).join("")}</div></details>`).join("");
}
function playerZone(label, rowClass, content) {
  if (!content) return "";
  return `<div class="player-zone"><div class="section-label">${label}</div><div class="${rowClass}">${content}</div></div>`;
}
function orphanPickupControl(seat, player) {
  const enabled = player.orphan_pickup_enabled;
  if (typeof enabled !== "boolean" || player.picked_orphans?.length || table.phase === "ROUND_END") return "";
  return `<button type="button" class="ghost orphan-toggle" data-orphan-pickup="${seat}" aria-pressed="${enabled}">${enabled ? "关闭" : "开启"}十三幺拾牌</button>`;
}
function renderWaitHint(player) {
  const choice = selected.seat === player.seat && player.concealed_tiles?.find(tile => tile.id === selected.tileId);
  const entries = player.declared_ting ? player.wait_hint : choice && player.ting_previews?.[choice.type];
  if (!entries?.length) return "";
  const total = entries.reduce((sum, entry) => sum + entry.remaining, 0);
  const labels = entry => (entry.patterns || player.wait_patterns?.[entry.type] || []).map(name => winPatterns[name] || name);
  const shapes = [...new Set(entries.flatMap(labels))];
  const waits = entries.map(entry => {
    const {type, remaining, requires_shelf} = entry;
    const label = [tileName(type), ...labels(entry), requires_shelf ? "首次上金后可胡" : ""].filter(Boolean).join(" · ");
    return `<span class="wait-choice${remaining ? "" : " exhausted"}" title="${esc(label)}">
      ${tileHTML(type,{small:true,gold:type===table.gold_tile_type})}
      <span>${remaining ? `${remaining} 张` : "已见完"}</span>${requires_shelf ? "<small>需上金</small>" : ""}</span>`;
  }).join("");
  return `<section class="wait-hint" aria-label="胡牌提示"><div class="wait-caption"><strong>${player.declared_ting ? "已听 · " : ""}可胡牌</strong><span>可见剩余 <b>${total}</b> 张</span>${shapes.length ? `<span class="wait-patterns">${esc(shapes.join(" / "))}</span>` : ""}</div><div class="wait-choices" tabindex="0" aria-label="听口">${waits}</div></section>`;
}
function renderDecision(player) {
  const entry = player.ai_decisions?.at(-1);
  if (!entry) return "";
  const decided = actionNames[entry.chosen.type] || entry.chosen.type;
  const picked = entry.chosen.tile_ids.map(id => tileName(Math.floor(id / 4))).join(" ");
  const choices = [...new Set(entry.options.map(action => actionNames[action.type] || action.type))].join("、");
  return `<details class="ai-record"><summary>AI 决策 · ${esc(decided)}</summary>
      <p>${aiNames[entry.difficulty]} · ${esc(decided)} ${esc(picked)} · ${esc(entry.reason)}</p>
      <p>手牌 ${entry.hand.map(tileName).join("、") || "—"}</p><p>可选 ${esc(choices)}</p></details>`;
}
function renderPlayer(seat) {
  const p = table.players[String(seat)];
  const el = document.getElementById(`seat-${seat}`);
  const rolling = table.phase === "ROLLING_DICE";
  const active = (table.phase === "TURN_ACTION" && table.current_player === seat) || (rolling && table.dealer === seat);
  const responding = table.phase === "WAITING_FOR_RESPONSES" && legalForSeat(seat).length > 0;
  el.tabIndex = -1;
  el.setAttribute("aria-label", `${seatNames[seat]}家座位`);
  el.classList.toggle("active", active);
  el.classList.toggle("responding", responding);
  el.classList.toggle("concealed-player", !Array.isArray(p.concealed_tiles));
  const picked = p.picked_orphans || [];
  const managed = p.controller && p.controller !== "human";
  const aiStatus = p.ai_thinking ? "AI 思考中" : table.phase === "WAITING_FOR_RESPONSES" ? "AI 等待响应" : "AI 托管";
  const status = [
    managed ? badge(aiStatus, "ai-badge") : window.LanGame ? "" : badge("人工", "human-badge"),
    table.dealer === seat ? badge("庄", "dealer") : "",
    viewerSeat === seat ? badge("你", "self") : "",
    p.declared_ting ? badge("已听", "ting") : "",
    picked.length ? badge("十三幺·已锁定", "orphan-locked") :
      p.orphan_pickup_enabled ? badge("十三幺·待拾", "orphan-ready") : "",
    p.has_completed_first_gold_shelf || p.shelf_count > 0 ? badge("已上金", "gold-ok") : "",
    window.LanGame ? (p.connected ? badge("在线", "online", "online") : badge("断线", "offline", "offline")) : "",
  ].join("");
  const canControl = !window.LanGame || seat === viewerSeat;
  const quickControl = canControl ? `<button type="button" class="ghost hand-control" data-ai-toggle="${seat}" aria-pressed="${Boolean(managed)}">${managed ? "人工接管" : "开启托管"}</button>` : "";
  const score = table.match?.scoring?.totals?.[String(seat)] ?? "—";
  const phaseBadge = rolling && active ? "掷骰" : active ? "出牌" : responding ? "响应" : "";
  const zones = [
    playerZone("副露", "meld-row", renderMelds(p)),
    playerZone(`上金 · ${p.shelf_count}`, "shelf-row", renderShelf(p)),
    playerZone(`十三幺拾牌 · ${picked.length}`, "orphans-row", picked.map(t => tileHTML(t,{small:true})).join("")),
    playerZone("报听牌", "ting-row", renderTingTile(p)),
  ].join("");
  const hand = renderHand(seat,p) || `<span class="action-hint">${rolling ? "尚未发牌" : "暂无手牌"}</span>`;
  const actions = renderActions(seat);
  const tools = orphanPickupControl(seat, p) + quickControl;
  const openDetails = [...el.querySelectorAll("details[open]")].map(details => details.className);
  const avatar = `${icon("bird")}<b>${seatNames[seat]}</b>`;
  const seatBadge = window.LanGame ? `<span class="seat-avatar">${avatar}</span>` :
    `<button class="seat-avatar" type="button" data-view-seat="${seat}" aria-label="查看${seatNames[seat]}家手牌">${avatar}</button>`;
  const markup = `
    <div class="player-head">
      <div class="player-title">${seatBadge}<div class="player-identity">
        <strong>${esc(p.nickname || `${seatNames[seat]}家`)}</strong>
        <div class="player-sub"><b class="seat-points">${esc(score)}</b></div>
      </div></div>
      <div class="player-badges">${status}${phaseBadge ? badge(phaseBadge, "turn-badge") : ""}</div>
    </div>
    <div class="dock-tools">
      ${tools ? `<div class="seat-tools">${tools}</div>` : ""}
      ${zones || p.ai_decisions?.length ? `<details class="player-inspector"><summary class="ghost">牌况</summary><div class="player-inspector-panel">
        ${zones ? `<div class="player-zones">${zones}</div>` : ""}${renderDecision(p)}</div></details>` : ""}
    </div>
    <div class="decision-row">
      ${renderWaitHint(p)}
      ${actions ? `<div class="action-area" aria-label="${seatNames[seat]}家操作">${actions}</div>` : ""}
    </div>
    <div class="hand" style="--hand-slots:${Math.max(14, p.concealed_count)}" aria-label="${seatNames[seat]}家手牌">${hand}</div>`;

  if (markup === el.renderedMarkup) return;
  const waitsScrollLeft = el.querySelector(".wait-choices")?.scrollLeft || 0;
  const focused = el.contains(document.activeElement) ? document.activeElement : null;
  const focusedTile = focused?.dataset.tile;
  const focusedAction = focused?.dataset.actionKey;
  const focusedPickup = focused?.dataset.orphanPickup;
  const focusedControl = focused?.dataset.aiToggle;
  el.innerHTML = markup;
  el.renderedMarkup = markup;
  const waitRow = el.querySelector(".wait-choices");
  if (waitRow) waitRow.scrollLeft = waitsScrollLeft;
  for (const details of el.querySelectorAll("details:not(.action-family)")) {
    details.open = openDetails.includes(details.className);
  }
  if (focusedTile || focusedAction || focusedPickup || focusedControl) {
    const replacement = [...el.querySelectorAll("button")].find(button => focusedTile
      ? button.dataset.tile === focusedTile
      : focusedAction ? button.dataset.actionKey === focusedAction
        : focusedPickup ? button.dataset.orphanPickup === focusedPickup
          : button.dataset.aiToggle === focusedControl);
    replacement?.focus({preventScroll:true});
  }
}
function renderRiver(seat, position) {
  const all = table.discards.filter(d => d.seat === seat);
  const visible = all.filter(d => !d.claimed);
  const claimed = all.length - visible.length;
  const pending = table.pending_claim?.kind === "DISCARD" && table.pending_claim.source === seat;
  const player = table.players[seat];
  const publics = renderMelds(player) + renderShelf(player) +
    (player.picked_orphans || []).map(type => tileHTML(type, {small:true})).join("") + renderTingTile(player);
  return `<div class="river river-${position}">
    <div class="river-title"><span>${seatNames[seat]}家牌河</span><span>${visible.length}${claimed ? ` · 已取走${claimed}` : ""}</span></div>
    <div class="river-tiles">${visible.map((d, i) => tileHTML(d.type, {
      small:true, gold:d.type===table.gold_tile_type, recent:pending && i===visible.length-1
    })).join("") || `<span class="action-hint">暂无弃牌</span>`}</div>
    ${publics ? `<div class="river-title">桌面公开区域</div><div class="river-tiles">${publics}</div>` : ""}
  </div>`;
}
function previousRoundText(record) {
  if (!record?.result) return "";
  const r = record.result;
  const prefix = `上局（第 ${record.round_no} 局，庄家 ${seatNames[record.dealer]}）`;
  if (r.type === "DRAW") return `${prefix}：流局，庄家连庄`;
  const method = winMethods[r.method] || r.method;
  const dealerNote = r.winner === record.dealer ? "庄家连庄" : `庄家顺延到${seatNames[r.next_dealer]}家`;
  return `${prefix}：${seatNames[r.winner]}家${method}，${dealerNote}`;
}
function renderResult(result) {
  const won = result.type !== "DRAW";
  const method = winMethods[result.method] || result.method;
  const patterns = result.patterns.map(name => winPatterns[name] || name);
  const title = won ? `${seatNames[result.winner]}家${method} · 胡牌` : "本局流局";
  const transfers = result.settlement?.status === "CALCULATED" ? result.settlement.transfers : null;
  return `<section class="result-box ${won ? "win" : "draw"}" aria-label="本局结算">
    <span class="result-mark">${icon("result")}</span>
    <div class="result-copy"><span>本局结算</span><h2>${esc(title)}</h2>
      <p>${patterns.length ? `${esc(patterns.join(" / "))} · ` : ""}下局庄家 ${seatNames[result.next_dealer]}家</p>
    </div>
    ${won && result.winning_tile != null ? `<div class="winning-tile">${tileHTML(result.winning_tile,{gold:result.winning_tile===table.gold_tile_type})}<span>胡牌</span></div>` : ""}
    ${transfers ? `<div class="result-deltas" aria-label="本局得分">${seatNames.map((wind, seat) => {
      const delta = transfers[String(seat)] ?? "0";
      return `<span>${wind} <b>${Number(delta) > 0 ? "+" : ""}${esc(delta)}</b></span>`;
    }).join("")}</div>` : ""}
  </section>`;
}
function renderCenter() {
  const el = document.getElementById("center");
  const toolbar = document.getElementById("sceneToolbar");
  const claim = table.pending_claim;
  const pending = claim ? `${seatNames[claim.source]}家${claim.kind === "ROB_BU_GANG" ? "补杠" : "打出"} ${tileName(claim.tile_type)}，等待响应` : "";
  const phaseName = {ROLLING_DICE:"等待掷骰",TURN_ACTION:"出牌阶段",WAITING_FOR_RESPONSES:"响应阶段",ROUND_END:"本局结束"}[table.phase] || table.phase;
  const match = table.match || {round_no:1, previous_result:null, scoring:{status:"PENDING_CONFIGURATION", totals:{}}};
  const previous = previousRoundText(match.previous_result);
  const scoring = match.scoring;
  const score = seatNames.map((name, seat) =>
    `<span class="score-entry">${name} <b>${esc(scoring?.totals?.[String(seat)] ?? "—")}</b></span>`).join("");
  const scoringNote = scoring?.status === "PENDING_CONFIGURATION" ? "<span>计分待配置</span>" : "";
  const debugOpen = toolbar.querySelector(".table-details")?.open;
  const player = table.phase === "ROUND_END" ? "—" : `${seatNames[table.current_player]}家`;
  const layout = visualSeatMap();
  const rolled = table.phase !== "ROLLING_DICE";
  const goldText = rolled && table.gold_indicator
    ? `金指示 ${tileName(table.gold_indicator.type)} · 金牌 ${tileName(table.gold_tile_type)} · 骰子 ${table.dice.join(" + ")}` : "";
  const opening = table.wall_view?.break_position;
  const breakText = opening ? `${seatNames[opening.side]}墙 ${opening.column} 号墩开墙` : "";
  const overhead = el.closest(".table-shell").classList.contains("overhead-view");
  const controls = `
      <div class="scene-status${pending ? " claim-message" : ""}" role="status">${pending ? esc(pending) : esc(`${phaseName} · ${player}`)}
      ${rolled && table.gold_indicator ? `<span class="gold-status">金 <b>${tileName(table.gold_tile_type)}</b></span>` : ""}</div>
      <div class="scene-controls">
        <button class="ghost" type="button" data-view-toggle aria-pressed="${overhead}">${overhead ? "对局视角" : "完整桌面"}</button>
        <button class="ghost river-toggle" type="button" data-river-toggle aria-expanded="${riversExpanded}">${riversExpanded ? "收起牌河" : "查看牌河"}</button>
        <details class="table-details"${debugOpen ? " open" : ""}><summary class="ghost">详情</summary>
          <div class="table-caption">
            ${goldText ? `<p>${esc(goldText)}</p>` : ""}
            <div class="table-footer"><div class="match-meta"><span>累计分</span>${score}${scoringNote}</div></div>
            ${previous ? `<div class="previous-round">${esc(previous)}</div>` : ""}
            <div>庄家 ${seatNames[table.dealer]} · 墙上实牌 ${table.wall_view?.tiles_present ?? "—"} · 本局杠数 ${table.gang_count}${breakText ? ` · ${esc(breakText)}` : ""} · round ${esc(table.round_id.slice(0,8))} · revision ${table.revision}${table.test_mode ? ` · Seed ${esc(table.test_mode.seed)}` : ""}</div>
          </div>
        </details>
      </div>`;
  if (toolbar.renderedMarkup !== controls) {
    const focused = document.activeElement;
    const focusSelector = focused?.hasAttribute("data-river-toggle") ? "[data-river-toggle]" :
      focused?.hasAttribute("data-view-toggle") ? "[data-view-toggle]" : "";
    toolbar.innerHTML = controls;
    toolbar.renderedMarkup = controls;
    if (focusSelector) toolbar.querySelector(focusSelector)?.focus({preventScroll:true});
  }
  const markup = `
    <div class="table-felt-wrap">${MahjongScene.markup(table, layout)}</div>
    ${table.result ? renderResult(table.result) : ""}
    ${riversExpanded ? `<section class="river-inspector" aria-label="四家牌河" tabindex="0">${Object.entries(layout).map(([side, seat]) => renderRiver(seat, side)).join("")}</section>` : ""}`;
  if (el.renderedMarkup === markup) return;
  el.innerHTML = markup;
  el.renderedMarkup = markup;
}
function bindTableEvents() {
  document.querySelector(".table-shell").addEventListener("click", event => {
    if (!table) return;
    const seatTab = event.target.closest("[data-view-seat]");
    if (seatTab) {
      inspectedSeat = Number(seatTab.dataset.viewSeat);
      selected = {seat:null,tileId:null};
      MahjongScene.cancelFlights();
      render();
      scrollToSeat(inspectedSeat);
      return;
    }
    const cameraButton = event.target.closest("[data-view-toggle]");
    if (cameraButton) {
      const full = MahjongScene.setPerspective(event.currentTarget);
      cameraButton.textContent = full ? "对局视角" : "完整桌面";
      cameraButton.setAttribute("aria-pressed", String(full));
      document.getElementById("sceneToolbar").renderedMarkup = "";
      MahjongScene.mount(event.currentTarget);
      return;
    }
    if (event.target.closest("[data-river-toggle]")) {
      riversExpanded = !riversExpanded;
      renderCenter();
      MahjongScene.mount(event.currentTarget);
      document.querySelector("[data-river-toggle]")?.focus({preventScroll:true});
      return;
    }
    const button = event.target.closest("button[data-tile], button[data-action-key], button[data-orphan-pickup], button[data-ai-toggle]");
    if (!button || button.disabled || busy) return;
    if (button.hasAttribute("data-ai-toggle")) {
      const seat = Number(button.dataset.aiToggle);
      changeController(seat, button.getAttribute("aria-pressed") === "true" ? "human" : "normal");
      return;
    }
    if (button.hasAttribute("data-orphan-pickup")) {
      const seat = Number(button.dataset.orphanPickup);
      setOrphanPickup(seat, button.getAttribute("aria-pressed") !== "true");
      return;
    }
    if (button.dataset.actionKey) {
      const seat = Number(button.dataset.actionSeat);
      const action = legalForSeat(seat).find(a => actionKey(a) === button.dataset.actionKey);
      if (action) performAction(seat, action);
      return;
    }
    const seat = Number(button.dataset.seat);
    const tileId = Number(button.dataset.tile);
    const previousSeat = selected.seat;
    if (previousSeat === seat && selected.tileId === tileId) {
      const discard = legalForSeat(seat).find(action => action.type === "DISCARD" && action.tile_ids[0] === tileId);
      if (discard) return performAction(seat, discard);
      selected = {seat:null,tileId:null};
    } else {
      selected = {seat,tileId};
    }
    if (previousSeat != null && previousSeat !== seat) renderPlayer(previousSeat);
    renderPlayer(seat);
    MahjongScene.mount(event.currentTarget);
    window.LanGame?.decorate();
  });
}
function render() {
  if (!table) return;
  placeHandDock();
  applySeatLayout();
  [0,1,2,3].forEach(renderPlayer);
  renderCenter();
  renderTableHud();
  MahjongScene.mount(document.querySelector(".table-shell"));
  if (window.LanGame) {
    window.LanGame.decorate();
    return;
  }
  document.getElementById("timeoutBtn").classList.toggle("hidden", table.phase !== "WAITING_FOR_RESPONSES");
  const roundBtn = document.getElementById("newRoundBtn");

  const ended = table.phase === "ROUND_END";
  roundBtn.textContent = ended ? "下一局" : "重新开局";
  roundBtn.classList.toggle("primary", ended);
  roundBtn.classList.toggle("ghost", !ended);
  document.getElementById("focusTurn").classList.toggle("hidden", ended);
  if (document.activeElement !== document.getElementById("dealerSelect") && !document.querySelector(".top-details")?.open) {
    document.getElementById("dealerSelect").value = String(table.dealer);
  }
  if (!document.getElementById("seedInput").value) document.getElementById("seedInput").value = table.test_mode.seed;
}

async function boot() {
  if (window.MahjongPresentation?.init) await window.MahjongPresentation.init();
  document.getElementById("newRoundBtn").addEventListener("click", roundButtonAction);
  document.getElementById("resetMatchBtn").addEventListener("click", resetMatch);
  document.getElementById("timeoutBtn").addEventListener("click", timeoutResponses);
  document.getElementById("focusTurn").addEventListener("click", () => {
    if (!table) return;
    inspectedSeat = null;
    selected = {seat:null,tileId:null};
    MahjongScene.cancelFlights();
    render();
    scrollToSeat(dockSeat);
  });
  await loadTable(true);
}
bindTableEvents();
document.getElementById("controlSettings").addEventListener("change", event => {
  const seat = event.target.dataset.controlSeat;
  if (seat != null) changeController(Number(seat), event.target.value);
});
document.getElementById("controlSettings").addEventListener("click", event => {
  const mode = event.target.closest("[data-ai-all]")?.dataset.aiAll;
  if (mode) changeController(null, mode);
});
if (!document.body.classList.contains("lan-mode")) boot();
