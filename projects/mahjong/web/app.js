const actionNames = {
  ROLL_DICE: "掷骰子",
  DISCARD: "打出", DECLARE_TING: "报听并打出", SHELVE_GOLD: "上金",
  CHI: "吃", PENG: "碰", MING_GANG: "明杠", AN_GANG: "暗杠", BU_GANG: "补杠",
  HU: "胡", PASS: "过", PICK_ORPHAN: "拾幺牌"
};
const actionStyles = {
  ROLL_DICE:"dice", PASS:"pass", HU:"hu", MING_GANG:"gang", AN_GANG:"gang", BU_GANG:"gang",
  DECLARE_TING:"ting", SHELVE_GOLD:"shelf", PICK_ORPHAN:"orphan",
};
let table = null;
let selected = { seat: null, tileId: null };
let busy = false;
let eventRoundId = null;
let lastPresentationEventId = 0;
let viewerSeat = null;
const visualPositions = ["north", "east", "west", "south"];
const winMethods = {SELF_DRAW:"自摸", DISCARD:"荣胡", ROB_GANG:"抢杠胡"};

function scrollToSeat(seat) {
  if (seat == null) return;
  const player = document.getElementById(`seat-${seat}`);
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  player.scrollIntoView({behavior:reduceMotion ? "instant" : "smooth", block:"nearest"});
  player.focus({preventScroll:true});
}

function visualSeatMap() {
  // Local all-open mode keeps the original fixed table.  In LAN mode the
  // authenticated player is always rendered at the bottom; absolute winds
  // and all rule/state values remain unchanged.
  if (!Number.isInteger(viewerSeat) || viewerSeat < 0 || viewerSeat > 3) {
    return {north:3, east:0, west:2, south:1};
  }
  return {
    south: viewerSeat,
    west: (viewerSeat + 1) % 4,
    north: (viewerSeat + 2) % 4,
    east: (viewerSeat + 3) % 4,
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

function legalForSeat(seat) { return table?.legal_actions?.[String(seat)] || []; }
function actionKey(a) { return `${a.type}:${a.tile_ids.join(",")}`; }

async function api(path, options = {}) {
  const res = await fetch(path, { headers: {"Content-Type": "application/json"}, ...options });
  const data = await res.json().catch(() => ({ok:false,error:`HTTP ${res.status}`}));
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.table;
}
function setBusy(v) {
  busy = v;
  document.body.classList.toggle("loading", v);
}
function showNotice(msg) {
  const el = document.getElementById("notice");
  el.textContent = msg;
  el.classList.toggle("hidden", !msg);
}
function dispatchPresentationEvents(nextTable, initial = false) {
  const events = nextTable?.presentation_events || [];
  if (eventRoundId !== nextTable?.round_id) {
    eventRoundId = nextTable?.round_id || null;
    lastPresentationEventId = 0;
  }
  if (initial) {
    lastPresentationEventId = Math.max(0, ...events.map(e => e.id || 0));
    return;
  }
  for (const event of events) {
    if ((event.id || 0) <= lastPresentationEventId) continue;
    window.MahjongPresentation?.bus?.emit(event, {
      table: nextTable,
      seatName: seat => seatNames[seat],
      tileName,
    });
    lastPresentationEventId = Math.max(lastPresentationEventId, event.id || 0);
  }
}
function acceptTable(nextTable, { initial = false } = {}) {
  if (nextTable.round_id !== table?.round_id) selected = {seat:null,tileId:null};
  dispatchPresentationEvents(nextTable, initial);
  table = nextTable;
  render();
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
    acceptTable(next); showNotice("");
  } catch (e) { showNotice(e.message); await loadTable(true); }
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
  return hand.map(t => {
    const ta = actions.filter(a => a.tile_ids.includes(t.id));
    const clickable = ta.length > 0;
    const isSelected = selected.seat === seat && selected.tileId === t.id;
    const cls = ["tile", tileClass(t.type), t.type === table.gold_tile_type ? "gold":"", t.id === last ? "drawn":"", clickable?"clickable":"", isSelected?"selected":""].filter(Boolean).join(" ");
    const acts = ta.map(a => actionNames[a.type] || a.type).join(" / ");
    return `<button type="button" class="${cls}" data-seat="${seat}" data-tile="${t.id}" aria-pressed="${isSelected}" ${clickable?"":"disabled"} title="${tileName(t.type)}${acts?` · ${acts}`:""}">${tileFaceMarkup(t.type)}</button>`;
  }).join("");
}
function renderMelds(p) {
  const labels = {CHI:"吃", PENG:"碰", MING_GANG:"明杠", AN_GANG:"暗杠", BU_GANG:"补杠", GANG:"杠"};
  return p.melds.map(m => `<span class="meld"><span class="meld-name">${labels[m.type] || esc(m.type)}</span>${m.tiles
    ? m.tiles.map(t => tileHTML(t,{small:true,gold:t===table.gold_tile_type})).join("")
    : Array.from({length:m.count}, () => tileBackHTML("暗杠牌")).join("")}</span>`).join("");
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
    return `${base} ${tileName(table.pending_claim.tile_type)}（锁定十三幺）`;
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
  const globals = actions.filter(a => ["ROLL_DICE","HU","PASS","PICK_ORPHAN"].includes(a.type));
  const multi = actions.filter(a => ["CHI","PENG","MING_GANG","AN_GANG","BU_GANG"].includes(a.type));
  const unique = new Map([...globals, ...multi, ...selectedActions].map(action => [actionKey(action), action]));
  if (!unique.size) return `<span class="action-hint">选一张牌，再确认操作</span>`;
  return [...unique].map(([key, action]) => {
    const kind = actionStyles[action.type] || "";
    return `<button class="action-btn ${kind}" type="button" data-action-seat="${seat}" data-action-key="${esc(key)}">${kind === "dice" ? icon("tiles") : ""}${esc(actionLabel(seat,action))}</button>`;
  }).join("");
}
function playerZone(label, rowClass, content) {
  if (!content) return "";
  return `<div class="player-zone"><div class="section-label">${label}</div><div class="${rowClass}">${content}</div></div>`;
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
  const status = [
    table.dealer === seat ? badge("庄", "dealer") : "",
    viewerSeat === seat ? badge("你", "self") : "",
    p.declared_ting ? badge("已听", "ting") : "",
    p.has_completed_first_gold_shelf || p.shelf_count > 0 ? badge("已上金", "gold-ok") : "",
    window.LanGame ? (p.connected ? badge("在线", "online", "online") : badge("断线", "offline", "offline")) : "",
  ].join("");
  const picked = p.picked_orphans || [];
  const waits = p.declared_ting && p.current_waits ? `听口 ${p.current_waits.map(tileName).join("、") || "—"}` : "";
  const phaseBadge = rolling && active ? "等待掷骰" : active ? "当前出牌" : responding ? "等待响应" : "";
  const zones = [
    playerZone("副露", "meld-row", renderMelds(p)),
    playerZone(`上金 · ${p.shelf_count}`, "shelf-row", renderShelf(p)),
    playerZone(`十三幺拾牌 · ${picked.length}`, "orphans-row", picked.map(t => tileHTML(t,{small:true})).join("")),
    playerZone("报听牌", "ting-row", renderTingTile(p)),
  ].join("");
  const hand = renderHand(seat,p) || `<span class="action-hint">${rolling ? "尚未发牌" : "暂无手牌"}</span>`;
  const actions = renderActions(seat);
  const markup = `
    <div class="player-head">
      <div class="player-title"><span class="wind">${seatNames[seat]}</span><div class="player-identity">
        <strong>${esc(p.nickname || `${seatNames[seat]}家`)}</strong>
        <div class="player-sub">手牌 ${p.concealed_count} 张${waits ? ` · ${esc(waits)}` : ""}</div>
      </div></div>
      <div class="player-badges">${status}${phaseBadge ? badge(phaseBadge, "turn-badge") : ""}</div>
    </div>
    <div class="hand" aria-label="${seatNames[seat]}家手牌">${hand}</div>
    ${zones ? `<div class="player-zones">${zones}</div>` : ""}
    ${actions ? `<div class="action-area" aria-label="${seatNames[seat]}家操作">${actions}</div>` : ""}`;

  if (markup === el.renderedMarkup) return;
  const scrollLeft = el.querySelector(".hand")?.scrollLeft || 0;
  const focused = el.contains(document.activeElement) ? document.activeElement : null;
  const focusedTile = focused?.dataset.tile;
  const focusedAction = focused?.dataset.actionKey;
  el.innerHTML = markup;
  el.renderedMarkup = markup;
  el.querySelector(".hand").scrollLeft = scrollLeft;
  if (focusedTile || focusedAction) {
    const replacement = [...el.querySelectorAll("button")].find(button => focusedTile
      ? button.dataset.tile === focusedTile
      : button.dataset.actionKey === focusedAction);
    replacement?.focus({preventScroll:true});
  }
}
function renderRiver(seat, position) {
  const all = table.discards.filter(d => d.seat === seat);
  const visible = all.filter(d => !d.claimed);
  const claimed = all.length - visible.length;
  const pending = table.pending_claim?.kind === "DISCARD" && table.pending_claim.source === seat;
  return `<div class="river river-${position}">
    <div class="river-title"><span>${seatNames[seat]}家牌河</span><span>${visible.length}${claimed ? ` · 已取走${claimed}` : ""}</span></div>
    <div class="river-tiles">${visible.map((d, i) => tileHTML(d.type, {
      small:true, gold:d.type===table.gold_tile_type, recent:pending && i===visible.length-1
    })).join("") || `<span class="action-hint">暂无弃牌</span>`}</div>
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
  const labels = {standard:"普通胡", seven_pairs:"七对", thirteen_orphans:"十三幺"};
  const patterns = result.patterns.map(name => labels[name] || name);
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
function wallLayerHTML(layer, seat, column, layerName) {
  const state = layer || {present:false};
  const classes = [
    "wall-layer", layerName, state.present ? "present" : "empty", state.reserved ? "reserved" : "",
    state.indicator ? "indicator" : "", state.normal_cursor ? "normal-cursor" : "", state.gang_cursor ? "gang-cursor" : ""
  ].filter(Boolean).join(" ");
  const labels = [];
  if (state.indicator) labels.push("金指示牌");
  if (state.normal_cursor) labels.push("下一张正常摸牌");
  if (state.gang_cursor) labels.push("下一张杠后补牌");
  if (state.reserved) labels.push("保留牌墙");
  const back = asset("tiles", "back");
  const art = back && state.present ? `<img class="asset-image wall-image" src="${esc(back)}" alt="" draggable="false">` : "";
  return `<span class="${classes}" data-wall-seat="${seat}" data-wall-column="${column}" data-wall-layer="${layerName}" title="${labels.join(" · ")}">${art}</span>`;
}
function renderWallSide(seat, position) {
  const columns = [...(table.wall_view?.sides?.[String(seat)] || [])];
  if (["north","west"].includes(position)) columns.reverse();
  const breakPos = table.wall_view?.break_position;
  const stacks = columns.map(c => {
    const isBreak = breakPos && breakPos.side === seat && breakPos.column === c.column;
    return `<span class="wall-stack ${isBreak ? "break-stack" : ""}" title="${seatNames[seat]}墙 第${c.column + 1}墩">
      ${wallLayerHTML(c.bottom,seat,c.column,"bottom")}${wallLayerHTML(c.top,seat,c.column,"top")}
    </span>`;
  }).join("");
  return `<div class="wall-side wall-${position}"><span class="wall-side-label">${seatNames[seat]}墙</span><div class="wall-stacks">${stacks}</div></div>`;
}
function renderWall() {
  const rolled = table.phase !== "ROLLING_DICE";
  const diceText = rolled ? `${table.dice[0]} + ${table.dice[1]} = ${table.dice[0] + table.dice[1]}` : "尚未掷骰";
  const breakText = rolled ? `${seatNames[table.break_wall]}墙第 ${table.break_column + 1} 墩开牌` : `等待${seatNames[table.dealer]}家掷骰`;
  const layout = visualSeatMap();
  return `<div class="wall-stage">
    ${renderWallSide(layout.north,"north")}
    ${renderWallSide(layout.east,"east")}
    <div class="wall-core">
      ${renderRiver(layout.north,"north")}
      ${renderRiver(layout.east,"east")}
      <div class="wall-center-info">
        ${renderGoldBox()}
        <small>${esc(breakText)}${rolled ? ` · ${diceText}` : ""}</small>
      </div>
      ${renderRiver(layout.west,"west")}
      ${renderRiver(layout.south,"south")}
    </div>
    ${renderWallSide(layout.west,"west")}
    ${renderWallSide(layout.south,"south")}
  </div>`;
}
function renderGoldBox() {
  if (!table.gold_indicator || table.gold_tile_type == null) {
    return `<div class="gold-box"><div class="gold-item"><span class="gold-label">金指示牌</span><span class="action-hint">掷骰后公开</span></div><div class="gold-item gold-dice"><span class="gold-label">骰子</span>${diceFaceHTML(null)}${diceFaceHTML(null)}</div></div>`;
  }
  return `<div class="gold-box">
    <div class="gold-item"><span class="gold-label">金指示牌</span>${tileHTML(table.gold_indicator.type,{small:true})}</div>
    <div class="gold-item"><span class="gold-label">金牌</span>${tileHTML(table.gold_tile_type,{small:true,gold:true})}</div>
    <div class="gold-item gold-dice"><span class="gold-label">骰子</span>${diceFaceHTML(table.dice[0])}${diceFaceHTML(table.dice[1])}</div>
  </div>`;
}
function renderCenter() {
  const el = document.getElementById("center");
  const claim = table.pending_claim;
  const pending = claim ? `${seatNames[claim.source]}家${claim.kind === "ROB_BU_GANG" ? "补杠" : "打出"} ${tileName(claim.tile_type)}，等待响应` : "";
  const phaseName = {ROLLING_DICE:"等待掷骰",TURN_ACTION:"出牌阶段",WAITING_FOR_RESPONSES:"响应阶段",ROUND_END:"本局结束"}[table.phase] || table.phase;
  const match = table.match || {round_no:1, previous_result:null, scoring:{status:"PENDING_CONFIGURATION", totals:{}}};
  const previous = previousRoundText(match.previous_result);
  const scoring = match.scoring;
  const score = seatNames.map((name, seat) =>
    `<span class="score-entry">${name} <b>${esc(scoring?.totals?.[String(seat)] ?? "—")}</b></span>`).join("");
  const scoringNote = scoring?.status === "PENDING_CONFIGURATION" ? "<span>计分待配置</span>" : "";
  const debugOpen = el.querySelector(".table-details")?.open;
  const player = table.phase === "ROUND_END" ? "—" : `${seatNames[table.current_player]}家`;
  el.innerHTML = `
    ${statusCard([["牌局", `第 ${match.round_no} 局`], ["当前阶段", phaseName], ["当前玩家", player],
      ["墙上实牌", table.wall_view?.tiles_present ?? "—"], ["本局杠数", table.gang_count]])}
    ${table.result ? renderResult(table.result) : ""}
    ${pending ? `<div class="center-message claim-message" role="status">${esc(pending)}</div>` : ""}
    ${renderWall()}
    <div class="table-footer">
      <div class="wall-legend" aria-label="牌墙图例"><span><i class="legend-normal"></i>摸牌端</span><span><i class="legend-tail"></i>补牌端</span><span><i class="legend-indicator"></i>金指示</span></div>
      <div class="match-meta"><span>累计分</span>${score}${scoringNote}</div>
    </div>
    ${previous ? `<div class="previous-round">${esc(previous)}</div>` : ""}
    <details class="table-details"${debugOpen ? " open" : ""}><summary>牌局详情</summary>
      <div>庄家 ${seatNames[table.dealer]} · round ${esc(table.round_id.slice(0,8))} · revision ${table.revision}${table.test_mode ? ` · Seed ${esc(table.test_mode.seed)}` : ""}</div>
    </details>`;
}
function bindTableEvents() {
  document.querySelector(".table-shell").addEventListener("click", event => {
    const button = event.target.closest("button[data-tile], button[data-action-key]");
    if (!button || button.disabled || busy) return;
    if (button.dataset.actionKey) {
      const seat = Number(button.dataset.actionSeat);
      const action = legalForSeat(seat).find(a => actionKey(a) === button.dataset.actionKey);
      if (action) performAction(seat, action);
      return;
    }
    const seat = Number(button.dataset.seat);
    const tileId = Number(button.dataset.tile);
    const previousSeat = selected.seat;
    selected = selected.seat === seat && selected.tileId === tileId ? {seat:null,tileId:null} : {seat,tileId};
    if (previousSeat != null && previousSeat !== seat) renderPlayer(previousSeat);
    renderPlayer(seat);
    window.LanGame?.decorate();
  });
}
function render() {
  if (!table) return;
  applySeatLayout();
  [0,1,2,3].forEach(renderPlayer);
  renderCenter();
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
    const seat = table.phase === "WAITING_FOR_RESPONSES"
      ? seatNames.findIndex((_, index) => legalForSeat(index).length > 0)
      : table.current_player;
    if (seat >= 0) scrollToSeat(seat);
  });
  await loadTable(true);
}
bindTableEvents();
if (!document.body.classList.contains("lan-mode")) boot();
