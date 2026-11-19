const seatNames = ["东", "南", "西", "北"];
const actionNames = {
  ROLL_DICE: "掷骰子",
  DISCARD: "打出", DECLARE_TING: "报听并打出", SHELVE_GOLD: "上金",
  CHI: "吃", PENG: "碰", MING_GANG: "明杠", AN_GANG: "暗杠", BU_GANG: "补杠",
  HU: "胡", PASS: "过", PICK_ORPHAN: "拾幺牌"
};
let table = null;
let selected = { seat: null, tileId: null };
let busy = false;
let eventRoundId = null;
let lastPresentationEventId = 0;
let viewerSeat = null;
const visualPositions = ["north", "east", "west", "south"];

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

function tileName(type) {
  if (type == null) return "—";
  if (type < 9) return `${type + 1}万`;
  if (type < 18) return `${type - 8}筒`;
  if (type < 27) return `${type - 17}条`;
  return "东南西北中发白"[type - 27];
}
function tileClass(type) {
  if (type < 9) return "suit-wan";
  if (type < 18) return "suit-tong";
  if (type < 27) return "suit-tiao";
  return "honor";
}
function faceText(type) { return tileName(type); }
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function asset(path, key) {
  return window.MahjongPresentation?.assets?.resolve(path, String(key)) || null;
}
function tileFaceMarkup(type) {
  const image = asset("tiles", type);
  return image
    ? `<img class="tile-image" src="${esc(image)}" alt="${esc(tileName(type))}">`
    : `<span class="tile-face">${faceText(type)}</span>`;
}
function tileHTML(type, opts = {}) {
  const classes = ["tile", tileClass(type), opts.small ? "small" : "", opts.gold ? "gold" : "", opts.drawn ? "drawn" : "", opts.claimed ? "claimed" : ""].filter(Boolean).join(" ");
  return `<span class="${classes}" title="${tileName(type)}">${tileFaceMarkup(type)}</span>`;
}
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
  const seed = document.getElementById("seedInput").value.trim();
  const dealer = Number(document.getElementById("dealerSelect").value);
  try {
    setBusy(true); selected = {seat:null,tileId:null};
    const next = await api("/api/new-round", {method:"POST", body:JSON.stringify({seed, dealer})});
    document.getElementById("seedInput").value = next.test_mode.seed;
    acceptTable(next); showNotice("");
  } catch (e) { showNotice(e.message); }
  finally { setBusy(false); }
}
async function nextRound() {
  if (!table || table.phase !== "ROUND_END") return;
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
    return Array.from({length:p.concealed_count}, () => `<span class="tile small tile-back" aria-label="暗牌"><span class="tile-face">暗</span></span>`).join("");
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
    return `<button type="button" class="${cls}" data-seat="${seat}" data-tile="${t.id}" ${clickable?"":"disabled"} title="${tileName(t.type)}${acts?` · ${acts}`:""}">${tileFaceMarkup(t.type)}</button>`;
  }).join("");
}
function renderMelds(p) {
  if (!p.melds?.length) return `<span class="action-hint">无副露</span>`;
  return p.melds.map(m => `<span class="meld"><span class="meld-name">${m.type}</span>${m.tiles ? m.tiles.map(t => tileHTML(t,{small:true,gold:t===table.gold_tile_type})).join("") : `<span class="action-hint">暗牌×${m.count}</span>`}</span>`).join("");
}
function renderShelf(p) {
  if (!p.shelf_tiles?.length) return `<span class="action-hint">暂无</span>`;
  return p.shelf_tiles.map(t => tileHTML(t,{small:true,gold:true})).join("");
}
function renderTingTile(p) {
  if (!p.ting_tile) return `<span class="action-hint">暂无</span>`;
  if (p.ting_tile.hidden) {
    const back = asset("tiles", "back");
    return back
      ? `<span class="tile small tile-back"><img class="tile-image" src="${esc(back)}" alt="报听暗牌"></span>`
      : `<span class="tile small tile-back" title="报听暗牌"><span class="tile-face">暗</span></span>`;
  }
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
  if (!actions.length) return `<span class="action-hint">当前无需操作</span>`;
  const selectedActions = selected.seat === seat && selected.tileId != null ? actions.filter(a => a.tile_ids.includes(selected.tileId)) : [];
  const globals = actions.filter(a => ["ROLL_DICE","HU","PASS","PICK_ORPHAN"].includes(a.type));
  const multi = actions.filter(a => ["CHI","PENG","MING_GANG","AN_GANG","BU_GANG"].includes(a.type));
  let shown = [...globals, ...multi];
  if (selectedActions.length) shown.push(...selectedActions);
  const unique = [];
  const seen = new Set();
  for (const a of shown) { const k=actionKey(a); if(!seen.has(k)){seen.add(k);unique.push(a);} }
  if (!unique.length) return `<span class="action-hint">点击一张可操作的手牌</span>`;
  return unique.map(a => {
    const kind = a.type === "ROLL_DICE" ? "dice" : a.type === "PASS" ? "pass" : a.type === "HU" ? "hu" : a.type.includes("GANG") ? "gang" : a.type === "DECLARE_TING" ? "ting" : a.type === "SHELVE_GOLD" ? "shelf" : "";
    return `<button class="action-btn ${kind}" type="button" data-action-seat="${seat}" data-action-key="${esc(actionKey(a))}">${esc(actionLabel(seat,a))}</button>`;
  }).join("");
}
function renderPlayer(seat) {
  const p = table.players[String(seat)];
  const el = document.getElementById(`seat-${seat}`);
  const actions = legalForSeat(seat);
  const active = (table.phase === "TURN_ACTION" && table.current_player === seat) || (table.phase === "ROLLING_DICE" && table.dealer === seat);
  const responding = table.phase === "WAITING_FOR_RESPONSES" && actions.length > 0;
  el.classList.toggle("active", active);
  el.classList.toggle("responding", responding);
  const status = [
    table.dealer === seat ? `<span class="badge dealer">庄</span>` : "",
    p.declared_ting ? `<span class="badge ting">已听</span>` : "",
    p.has_completed_first_gold_shelf ? `<span class="badge gold-ok">已完成首次上金</span>` : ""
  ].join("");
  const picked = p.picked_orphans || [];
  const orphans = picked.length
    ? `<div class="section-label">十三幺拾牌 · ${picked.length}</div>
       <div class="orphans-row" aria-label="十三幺公开拾牌">${picked.map(t => tileHTML(t,{small:true})).join("")}</div>`
    : "";
  const waits = p.declared_ting && p.current_waits ? `听口：${(p.current_waits || []).map(tileName).join("、") || "—"}` : "";
  const phaseBadge = table.phase === "ROLLING_DICE" && table.dealer === seat ? "等待掷骰" : active ? "当前出牌" : responding ? "等待响应" : "";
  el.innerHTML = `
    <div class="player-head"><div class="player-title"><span class="wind">${seatNames[seat]}</span><strong>${esc(p.nickname || `${seatNames[seat]}家`)}</strong>${status}${window.LanGame ? `<span class="badge">${p.connected ? "在线" : "断线"}</span>` : ""}</div><span class="badge">${phaseBadge}</span></div>
    <div class="player-sub">手牌 ${p.concealed_count} 张${waits?` · ${esc(waits)}`:""}</div>
    <div class="hand">${renderHand(seat,p) || `<span class="action-hint">${table.phase === "ROLLING_DICE" ? "尚未发牌" : "暂无手牌"}</span>`}</div>
    <div class="section-label">副露</div><div class="meld-row">${renderMelds(p)}</div>
    <div class="section-label">上金 · ${p.shelf_count}</div><div class="shelf-row">${renderShelf(p)}</div>
    ${orphans}
    <div class="section-label">报听牌${p.ting_tile && !p.ting_tile.hidden ? " · 本人可见" : ""}</div><div class="ting-row">${renderTingTile(p)}</div>
    <div class="action-area">${renderActions(seat)}</div>`;
}
function renderRiver(seat, position = "") {
  const all = table.discards.filter(d => d.seat === seat);
  const visible = all.filter(d => !d.claimed);
  const claimed = all.length - visible.length;
  const posClass = position ? ` river-${position}` : "";
  return `<div class="river${posClass}"><div class="river-title"><span>${seatNames[seat]}家牌河</span><span>${visible.length}${claimed?` · 已取走${claimed}`:""}</span></div><div class="river-tiles">${visible.map(d => tileHTML(d.type,{small:true,gold:d.type===table.gold_tile_type})).join("") || `<span class="action-hint">暂无弃牌</span>`}</div></div>`;
}
function previousRoundText(record) {
  if (!record?.result) return "";
  const r = record.result;
  const prefix = `上局（第 ${record.round_no} 局，庄家 ${seatNames[record.dealer]}）`;
  if (r.type === "DRAW") return `${prefix}：流局，庄家连庄`;
  const method = {SELF_DRAW:"自摸",DISCARD:"荣胡",ROB_GANG:"抢杠胡"}[r.method] || r.method;
  const dealerNote = r.winner === record.dealer ? "庄家连庄" : `庄家顺延到${seatNames[r.next_dealer]}家`;
  return `${prefix}：${seatNames[r.winner]}家${method}，${dealerNote}`;
}
function resultText(r) {
  if (!r) return "";
  if (r.type === "DRAW") return `本局流局 · 下局庄家 ${seatNames[r.next_dealer]}`;
  const method = {SELF_DRAW:"自摸",DISCARD:"荣胡",ROB_GANG:"抢杠胡"}[r.method] || r.method;
  const patterns = r.patterns.map(name => ({standard:"普通胡", seven_pairs:"七对", thirteen_orphans:"十三幺"})[name] || name);
  return `${seatNames[r.winner]}家 ${method} · 胡 ${tileName(r.winning_tile)} · ${patterns.join(" / ") || "普通胡"} · 下局庄家 ${seatNames[r.next_dealer]}`;
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
  const imageStyle = back && state.present ? ` style="background-image:url('${esc(back)}')"` : "";
  return `<span class="${classes}" data-wall-seat="${seat}" data-wall-column="${column}" data-wall-layer="${layerName}" title="${labels.join(" · ")}"${imageStyle}></span>`;
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
  const breakText = rolled ? `${seatNames[table.break_wall]}墙第 ${table.break_column + 1} 墩` : "等待庄家掷骰";
  const layout = visualSeatMap();
  return `<div class="wall-stage">
    ${renderWallSide(layout.north,"north")}
    ${renderWallSide(layout.east,"east")}
    <div class="wall-core">
      ${renderRiver(layout.north,"north")}
      ${renderRiver(layout.east,"east")}
      <div class="wall-center-info">
        <strong>${esc(diceText)}</strong>
        <span>${esc(breakText)}</span>
        <small>墙上实牌 ${table.wall_view?.tiles_present ?? "—"} 张</small>
        <div class="wall-legend"><i class="legend-normal"></i>摸牌端 <i class="legend-tail"></i>补牌端 <i class="legend-indicator"></i>金指示</div>
      </div>
      ${renderRiver(layout.west,"west")}
      ${renderRiver(layout.south,"south")}
    </div>
    ${renderWallSide(layout.west,"west")}
    ${renderWallSide(layout.south,"south")}
  </div>`;
}
function diceFaceHTML(value) {
  const image = value != null ? asset("dice", value) : null;
  if (image) return `<span class="dice-face"><img src="${esc(image)}" alt="骰子 ${value}"></span>`;
  return `<span class="dice-face">${value ?? "—"}</span>`;
}
function renderGoldBox() {
  if (!table.gold_indicator || table.gold_tile_type == null) {
    return `<div class="gold-box"><div class="gold-item"><span class="gold-label">金指示牌</span><strong>掷骰后公开</strong></div><div class="gold-item"><span class="gold-label">骰子</span>${diceFaceHTML(null)}${diceFaceHTML(null)}</div></div>`;
  }
  return `<div class="gold-box">
    <div class="gold-item"><span class="gold-label">金指示牌</span>${tileHTML(table.gold_indicator.type,{small:true})}</div>
    <div class="gold-item"><span class="gold-label">金</span>${tileHTML(table.gold_tile_type,{small:true,gold:true})}</div>
    <div class="gold-item"><span class="gold-label">骰子</span>${diceFaceHTML(table.dice[0])}${diceFaceHTML(table.dice[1])}</div>
  </div>`;
}
function renderCenter() {
  const el = document.getElementById("center");
  const pending = table.pending_claim ? `${seatNames[table.pending_claim.source]}家打出 ${tileName(table.pending_claim.tile_type)}，等待响应` : "";
  const phaseName = {ROLLING_DICE:"等待掷骰",TURN_ACTION:"出牌阶段",WAITING_FOR_RESPONSES:"响应阶段",ROUND_END:"本局结束"}[table.phase] || table.phase;
  const match = table.match || {round_no:1, previous_result:null, scoring:{status:"PENDING_CONFIGURATION", totals:{}}};
  const prev = previousRoundText(match.previous_result);
  const scoreText = match.scoring?.status === "PENDING_CONFIGURATION" ? "计分：待配置" : `累计分：${[0,1,2,3].map(s => `${seatNames[s]} ${match.scoring.totals[String(s)] ?? "0"}`).join(" / ")}`;
  const wallRemaining = table.wall_view?.tiles_present ?? "—";
  el.innerHTML = `
    <div class="status-card">
      <div class="stat"><b>第 ${match.round_no} 局</b><span>连续牌局</span></div>
      <div class="stat"><b>${phaseName}</b><span>当前阶段</span></div>
      <div class="stat"><b>${seatNames[table.current_player]}家</b><span>当前玩家</span></div>
      <div class="stat"><b>${wallRemaining}</b><span>墙上实牌</span></div>
      <div class="stat"><b>${table.gang_count}</b><span>本局杠数</span></div>
    </div>
    ${renderWall()}
    ${renderGoldBox()}
    ${table.phase === "ROLLING_DICE" ? `<div class="center-message dice-wait">等待庄家 ${seatNames[table.dealer]}家 点击“掷骰子”后发牌</div>` : ""}
    ${pending?`<div class="center-message">${esc(pending)}</div>`:""}
    ${table.result?`<div class="center-message result-box">${esc(resultText(table.result))}</div>`:""}
    ${prev?`<div class="center-message">${esc(prev)}</div>`:""}
    <div class="center-message match-meta">${esc(scoreText)}</div>
    <div class="center-message">第 ${match.round_no} 局 · 庄家 ${seatNames[table.dealer]} · round ${esc(table.round_id.slice(0,8))} · revision ${table.revision}${table.test_mode ? ` · Seed ${esc(table.test_mode.seed)}` : ""}</div>`;
}
function bindRenderedEvents() {
  document.querySelectorAll("button.tile[data-tile]").forEach(btn => btn.addEventListener("click", () => {
    if (btn.disabled) return;
    const seat=Number(btn.dataset.seat), tileId=Number(btn.dataset.tile);
    selected = selected.seat===seat && selected.tileId===tileId ? {seat:null,tileId:null} : {seat,tileId};
    render();
  }));
  document.querySelectorAll("button[data-action-key]").forEach(btn => btn.addEventListener("click", () => {
    const seat=Number(btn.dataset.actionSeat), key=btn.dataset.actionKey;
    const action=legalForSeat(seat).find(a => actionKey(a)===key);
    if (action) performAction(seat,action);
  }));
}
function render() {
  if (!table) return;
  applySeatLayout();
  [0,1,2,3].forEach(renderPlayer);
  renderCenter();
  if (window.LanGame) {
    window.LanGame.decorate();
    bindRenderedEvents();
    return;
  }
  document.getElementById("timeoutBtn").classList.toggle("hidden", table.phase !== "WAITING_FOR_RESPONSES");
  const roundBtn = document.getElementById("newRoundBtn");
  roundBtn.textContent = table.phase === "ROUND_END" ? "下一局" : "重新开局";
  document.getElementById("dealerSelect").value = String(table.dealer);
  if (!document.getElementById("seedInput").value) document.getElementById("seedInput").value = table.test_mode.seed;
  bindRenderedEvents();
}

async function boot() {
  if (window.MahjongPresentation?.init) await window.MahjongPresentation.init();
  document.getElementById("newRoundBtn").addEventListener("click", roundButtonAction);
  document.getElementById("resetMatchBtn").addEventListener("click", resetMatch);
  document.getElementById("timeoutBtn").addEventListener("click", timeoutResponses);
  await loadTable(true);
}
if (!document.body.classList.contains("lan-mode")) boot();
